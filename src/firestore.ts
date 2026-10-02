import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import {
  arrayRemove as fsArrayRemove,
  arrayUnion as fsArrayUnion,
  Bytes,
  deleteDoc as fsDeleteDoc,
  deleteField as fsDeleteField,
  doc,
  DocumentReference,
  FieldValue,
  GeoPoint,
  getDocFromCache,
  increment as fsIncrement,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
  Timestamp,
  updateDoc as fsUpdateDoc,
  writeBatch as fsWriteBatch,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type FirestoreSettings,
  type PartialWithFieldValue,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';

/**
 * Firestore for a household app, and writes that survive the app closing at once.
 *
 * Firestore's persistent cache keeps a write that is waiting for the network, but only once the
 * write has reached IndexedDB, a few milliseconds after `setDoc` returns. A person who taps "Log"
 * and closes the app (or reloads) inside that gap loses the entry, with no error anywhere. So the
 * write functions here also note each write synchronously in localStorage, which is written before
 * the page can go away, and forget it as soon as Firestore has it locally. A note still there when
 * the app next opens, signed in as the same person, is written again; every write here is safe to
 * repeat (sets and deletes are; `increment` may count twice in that narrow case).
 *
 * Use `initFirestore` in place of `initializeFirestore`, and import `setDoc`, `updateDoc`,
 * `deleteDoc`, `addDoc`, `writeBatch` and the field sentinels from here instead of
 * `firebase/firestore`. On a Firestore that didn't come from `initFirestore` they are Firestore's
 * own. A write that can't be noted (a converter, a value with no JSON form) still goes to
 * Firestore, without the note.
 */

const PREFIX = 'hh-outbox:';
const TAB_LOCK = 'hh-outbox-tab:';
const TAG = '__hhOutbox';
/** A replay waits this long for the lock of a page that is just going away. */
const RECHECK_MS = 5_000;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Op =
  | { kind: 'set'; path: string; data: Json; merge?: true; mergeFields?: string[] }
  | { kind: 'update'; path: string; data: Json }
  | { kind: 'delete'; path: string };

/** One write (or one batch) not yet in Firestore's local cache, as stored in localStorage. */
export interface OutboxEntry {
  v: 1;
  uid: string;
  /** The page that wrote it; another page leaves it alone while that page is open. */
  tab: string;
  at: number;
  ops: Op[];
}

type AuthLike = Pick<Auth, 'currentUser' | 'onAuthStateChanged'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

interface Outbox {
  db: Firestore;
  auth: AuthLike;
  storage: StorageLike;
  prefix: string;
  tab: string;
  seq: number;
}

const outboxes = new WeakMap<Firestore, Outbox>();

class Unencodable extends Error {}

export interface InitFirestoreOptions {
  /** Whose writes these are: a note is replayed only for the person who made it. */
  auth: AuthLike;
  /** Defaults to `localStorage`. */
  storage?: StorageLike;
  /** Extra settings; the default cache is persistent (IndexedDB), shared by every open tab. */
  settings?: FirestoreSettings;
}

/**
 * `initializeFirestore` with the persistent multi-tab cache every app uses (opens offline, keeps
 * writes made offline), plus the write notes described above. Notes left by a page that closed
 * too soon are written again once `auth` has a signed-in user.
 */
export function initFirestore(app: FirebaseApp, { auth, storage, settings }: InitFirestoreOptions): Firestore {
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ...settings,
  });
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!store) return db;
  const box: Outbox = { db, auth, storage: store, prefix: `${PREFIX}${app.options.projectId ?? app.name}:`, tab: newTabId(), seq: 0 };
  outboxes.set(db, box);
  holdTabLock(box.tab);
  auth.onAuthStateChanged((user) => {
    if (user) void replay(box, user.uid, true);
  });
  return db;
}

// Writes ------------------------------------------------------------------------------------------

export function setDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: WithFieldValue<A>): Promise<void>;
export function setDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options: SetOptions): Promise<void>;
export function setDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options?: SetOptions): Promise<void> {
  const p = options ? fsSetDoc(ref, data, options) : fsSetDoc(ref, data as WithFieldValue<A>);
  note(ref.firestore, () => [setOp(ref, data, options)]);
  return p;
}

export function updateDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: UpdateData<D>): Promise<void> {
  const p = fsUpdateDoc(ref, data);
  note(ref.firestore, () => [{ kind: 'update', path: plainRef(ref), data: encode(data) }]);
  return p;
}

export function deleteDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>): Promise<void> {
  const p = fsDeleteDoc(ref);
  note(ref.firestore, () => [{ kind: 'delete', path: ref.path }]);
  return p;
}

/** Like Firestore's `addDoc`: the id is made on the device, so the note can repeat the same write. */
export function addDoc<A, D extends DocumentData>(ref: CollectionReference<A, D>, data: WithFieldValue<A>): Promise<DocumentReference<A, D>> {
  const created = doc(ref);
  return setDoc(created, data).then(() => created);
}

export interface WriteBatch {
  set<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: WithFieldValue<A>): WriteBatch;
  set<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options: SetOptions): WriteBatch;
  update<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: UpdateData<D>): WriteBatch;
  delete<A, D extends DocumentData>(ref: DocumentReference<A, D>): WriteBatch;
  commit(): Promise<void>;
}

/** Firestore's batch, noted as one entry when it commits. */
export function writeBatch(db: Firestore): WriteBatch {
  const batch = fsWriteBatch(db);
  const ops: (() => Op)[] = [];
  const self: WriteBatch = {
    set<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options?: SetOptions) {
      if (options) batch.set(ref, data, options);
      else batch.set(ref, data as WithFieldValue<A>);
      ops.push(() => setOp(ref, data, options));
      return self;
    },
    update<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: UpdateData<D>) {
      batch.update(ref, data);
      ops.push(() => ({ kind: 'update', path: plainRef(ref), data: encode(data) }));
      return self;
    },
    delete<A, D extends DocumentData>(ref: DocumentReference<A, D>) {
      batch.delete(ref);
      ops.push(() => ({ kind: 'delete', path: ref.path }));
      return self;
    },
    commit() {
      const p = batch.commit();
      if (ops.length) note(db, () => ops.map((op) => op()));
      return p;
    },
  };
  return self;
}

// Field sentinels: Firestore's, remembered so a note can repeat them -------------------------------

const sentinels = new WeakMap<FieldValue, () => Json>();

function remember(value: FieldValue, encoded: () => Json): FieldValue {
  sentinels.set(value, encoded);
  return value;
}

export const deleteField = (): FieldValue => remember(fsDeleteField(), () => ({ [TAG]: 'deleteField' }));
export const serverTimestamp = (): FieldValue => remember(fsServerTimestamp(), () => ({ [TAG]: 'serverTimestamp' }));
export const arrayUnion = (...elements: unknown[]): FieldValue =>
  remember(fsArrayUnion(...elements), () => ({ [TAG]: 'arrayUnion', v: elements.map(encode) }));
export const arrayRemove = (...elements: unknown[]): FieldValue =>
  remember(fsArrayRemove(...elements), () => ({ [TAG]: 'arrayRemove', v: elements.map(encode) }));
export const increment = (n: number): FieldValue => remember(fsIncrement(n), () => ({ [TAG]: 'increment', v: n }));

// The note ------------------------------------------------------------------------------------------

function note(db: Firestore, build: () => Op[]): void {
  const box = outboxes.get(db);
  const uid = box?.auth.currentUser?.uid;
  if (!box || !uid) return;
  let entry: OutboxEntry;
  try {
    entry = { v: 1, uid, tab: box.tab, at: Date.now(), ops: build() };
  } catch (e) {
    if (e instanceof Unencodable) return;
    throw e;
  }
  const key = `${box.prefix}${entry.at.toString(36).padStart(10, '0')}-${(box.seq++).toString(36).padStart(4, '0')}-${box.tab}`;
  try {
    box.storage.setItem(key, JSON.stringify(entry));
  } catch {
    return; // Storage full or blocked: the write still goes to Firestore, as before.
  }
  forgetOnceCached(box, key, entry.ops[0].path);
}

/**
 * Firestore runs its work in order, so a cache read issued after a write finishes only once the
 * write is in the local cache. Either answer (found or not) means it is.
 */
function forgetOnceCached(box: Outbox, key: string, path: string): void {
  const forget = () => box.storage.removeItem(key);
  getDocFromCache(doc(box.db, path)).then(forget, forget);
}

/** Every note left for `uid` by a page that is no longer open: write it again. */
async function replay(box: Outbox, uid: string, recheck: boolean): Promise<void> {
  const live = await liveTabs();
  let waiting = false;
  for (const { key, entry } of pendingEntries(box.storage, box.prefix)) {
    if (entry.uid !== uid || entry.tab === box.tab) continue;
    if (live?.has(entry.tab)) {
      waiting = true;
      continue;
    }
    if (box.auth.currentUser?.uid !== uid) return;
    // Claim it, so a second page opening now doesn't write it too.
    box.storage.setItem(key, JSON.stringify({ ...entry, tab: box.tab }));
    let batch;
    try {
      batch = fsWriteBatch(box.db);
      for (const op of entry.ops) applyOp(batch, box.db, op);
    } catch (e) {
      console.warn("Dropped a saved write that can't be repeated", e);
      box.storage.removeItem(key);
      continue;
    }
    batch.commit().catch((e) => console.warn("Couldn't repeat a write saved before the app closed", e));
    forgetOnceCached(box, key, entry.ops[0].path);
  }
  if (waiting && recheck) setTimeout(() => void replay(box, uid, false), RECHECK_MS);
}

/** The notes in `storage`, oldest first. Exported for tests. */
export function pendingEntries(storage: StorageLike, prefix: string): { key: string; entry: OutboxEntry }[] {
  const out: { key: string; entry: OutboxEntry }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const entry = JSON.parse(storage.getItem(key) ?? '') as OutboxEntry;
      if (entry?.v === 1 && Array.isArray(entry.ops) && entry.ops.length) out.push({ key, entry });
    } catch {
      storage.removeItem(key);
    }
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

type RawBatch = ReturnType<typeof fsWriteBatch>;

function applyOp(batch: RawBatch, db: Firestore, op: Op): void {
  const ref = doc(db, op.path);
  if (op.kind === 'delete') batch.delete(ref);
  else if (op.kind === 'update') batch.update(ref, decode(op.data, db) as DocumentData);
  else if (op.mergeFields) batch.set(ref, decode(op.data, db) as DocumentData, { mergeFields: op.mergeFields });
  else if (op.merge) batch.set(ref, decode(op.data, db) as DocumentData, { merge: true });
  else batch.set(ref, decode(op.data, db) as DocumentData);
}

function setOp(ref: DocumentReference<unknown, DocumentData>, data: unknown, options?: SetOptions): Op {
  const op: Op = { kind: 'set', path: plainRef(ref), data: encode(data) };
  if (options && 'mergeFields' in options && options.mergeFields) {
    if (!options.mergeFields.every((f) => typeof f === 'string')) throw new Unencodable('mergeFields');
    op.mergeFields = options.mergeFields as string[];
  } else if (options && 'merge' in options && options.merge) op.merge = true;
  return op;
}

/** A converter changes what is stored, and the note would skip it. */
function plainRef(ref: DocumentReference<unknown, DocumentData>): string {
  if (ref.converter) throw new Unencodable('converter');
  return ref.path;
}

// Values ------------------------------------------------------------------------------------------

/** A Firestore value as JSON, or `Unencodable`. Exported for tests. */
export function encode(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Unencodable('number');
    return value;
  }
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value !== 'object') throw new Unencodable(typeof value);
  if (value instanceof FieldValue) {
    const known = sentinels.get(value);
    if (known) return known();
    if (value.isEqual(fsDeleteField())) return { [TAG]: 'deleteField' };
    if (value.isEqual(fsServerTimestamp())) return { [TAG]: 'serverTimestamp' };
    throw new Unencodable('FieldValue');
  }
  if (value instanceof Timestamp) return { [TAG]: 'ts', s: value.seconds, n: value.nanoseconds };
  if (value instanceof Date) return encode(Timestamp.fromDate(value));
  if (value instanceof GeoPoint) return { [TAG]: 'geo', lat: value.latitude, lng: value.longitude };
  if (value instanceof Bytes) return { [TAG]: 'bytes', v: value.toBase64() };
  if (value instanceof DocumentReference) return { [TAG]: 'ref', v: value.path };
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Unencodable('object');
  const out: { [key: string]: Json } = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encode(v);
  return out;
}

/** The value `encode` was given back, with Firestore's own types and sentinels. */
export function decode(value: Json, db?: Firestore): unknown {
  if (Array.isArray(value)) return value.map((v) => decode(v, db));
  if (value === null || typeof value !== 'object') return value;
  const tag = value[TAG];
  if (typeof tag === 'string') {
    const v = value.v;
    switch (tag) {
      case 'deleteField': return fsDeleteField();
      case 'serverTimestamp': return fsServerTimestamp();
      case 'arrayUnion': return fsArrayUnion(...(v as Json[]).map((e) => decode(e, db)));
      case 'arrayRemove': return fsArrayRemove(...(v as Json[]).map((e) => decode(e, db)));
      case 'increment': return fsIncrement(v as number);
      case 'ts': return new Timestamp(value.s as number, value.n as number);
      case 'geo': return new GeoPoint(value.lat as number, value.lng as number);
      case 'bytes': return Bytes.fromBase64String(v as string);
      case 'ref':
        if (!db) throw new Error('a document reference needs the Firestore it belongs to');
        return doc(db, v as string);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = decode(v, db);
  return out;
}

// Pages -------------------------------------------------------------------------------------------

function newTabId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Locks = { request(name: string, cb: () => Promise<void>): Promise<void>; query(): Promise<{ held?: { name?: string }[] }> };
const locks = (): Locks | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as { locks?: Locks }).locks);

/** Held until the page goes away: other pages can tell this one is still open. */
function holdTabLock(tab: string): void {
  void locks()?.request(TAB_LOCK + tab, () => new Promise<void>(() => {})).catch(() => {});
}

/** Pages open right now, or null when the browser can't tell (then every note is replayed). */
async function liveTabs(): Promise<Set<string> | null> {
  const l = locks();
  if (!l) return null;
  try {
    const { held = [] } = await l.query();
    return new Set(held.map((h) => h.name ?? '').filter((n) => n.startsWith(TAB_LOCK)).map((n) => n.slice(TAB_LOCK.length)));
  } catch {
    return null;
  }
}
