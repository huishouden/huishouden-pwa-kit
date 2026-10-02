import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import {
  arrayRemove as fsArrayRemove,
  arrayUnion as fsArrayUnion,
  deleteDoc as fsDeleteDoc,
  deleteField as fsDeleteField,
  doc,
  getDocFromCache,
  increment as fsIncrement,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  writeBatch as fsWriteBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type FieldValue,
  type Firestore,
  type FirestoreSettings,
  type PartialWithFieldValue,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';
import {
  decode,
  encode,
  pendingEntries,
  remember,
  sameJson,
  TAG,
  Unencodable,
  type Op,
  type OutboxEntry,
  type StorageLike,
} from './outbox-codec.js';

/**
 * Firestore for a household app, and writes that survive the app closing at once.
 *
 * Firestore's persistent cache keeps a write that is waiting for the network, but only once the
 * write has reached IndexedDB, a few milliseconds after `setDoc` returns. A person who taps "Log"
 * and closes the app (or reloads) inside that gap loses the entry, with no error anywhere. So the
 * write functions here also note each write synchronously in localStorage, which is written before
 * the page can go away, and forget it as soon as Firestore has it locally. A note still there when
 * the app next opens, signed in as the same person, is written again, unless the local cache shows
 * the write already landed or was overtaken (see `stillNeeded`). Notes older than a week are
 * dropped unread.
 *
 * Use `initFirestore` in place of `initializeFirestore`, and import `setDoc`, `updateDoc`,
 * `deleteDoc`, `addDoc`, `writeBatch` and the field sentinels from here instead of
 * `firebase/firestore`. They take the same arguments, except that `updateDoc` and `batch.update`
 * take an object (no field-path/value pairs) and `writeBatch` returns the kit's `WriteBatch`. On a
 * Firestore that didn't come from `initFirestore` they are Firestore's own. A write that can't be
 * noted (a converter, a value with no JSON form) still goes to Firestore, without the note.
 *
 * The note holds the written data, in the same browser storage as Firestore's own cache of it.
 */

const PREFIX = 'hh-outbox:';
const TAB_LOCK = 'hh-outbox-tab:';
const REPLAY_LOCK = 'hh-outbox-replay:';

type AuthLike = Pick<Auth, 'currentUser' | 'onAuthStateChanged'>;

/** The part of the Web Locks API the outbox uses. */
export interface LockManagerLike {
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
}

interface Outbox {
  db: Firestore;
  auth: AuthLike;
  storage: StorageLike;
  locks: LockManagerLike | null;
  recheckMs: number;
  prefix: string;
  tab: string;
  seq: number;
}

const outboxes = new WeakMap<Firestore, Outbox>();

export interface InitFirestoreOptions {
  /** Whose writes these are: a note is replayed only for the person who made it. */
  auth: AuthLike;
  /** Defaults to `localStorage`. */
  storage?: StorageLike;
  /** Extra settings; the default cache is persistent (IndexedDB), shared by every open tab. */
  settings?: FirestoreSettings;
  /**
   * Defaults to `navigator.locks`: tells which pages are still open (their notes are theirs to
   * finish) and lets one page at a time replay. With `null`, every page replays every note.
   */
  locks?: LockManagerLike | null;
  /** How long a replay waits for a page that is just closing to let go. Default 5 s. */
  recheckMs?: number;
}

/**
 * `initializeFirestore` with the persistent multi-tab cache every app uses (opens offline, keeps
 * writes made offline), plus the write notes described above. Notes left by a page that closed
 * too soon are written again once `auth` has a signed-in user.
 */
export function initFirestore(app: FirebaseApp, { auth, storage, settings, locks, recheckMs = 5_000 }: InitFirestoreOptions): Firestore {
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ...settings,
  });
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!store) return db;
  const box: Outbox = {
    db,
    auth,
    storage: store,
    locks: locks === undefined ? browserLocks() : locks,
    recheckMs,
    prefix: `${PREFIX}${app.options.projectId ?? app.name}:`,
    tab: newTabId(),
    seq: 0,
  };
  outboxes.set(db, box);
  // Held until the page goes away, so other pages can tell this one is still open.
  void box.locks?.request(TAB_LOCK + box.tab, () => new Promise<void>(() => {})).catch(() => {});
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

export const deleteField = (): FieldValue => remember(fsDeleteField(), () => ({ [TAG]: 'deleteField' }));
export const serverTimestamp = (): FieldValue => remember(fsServerTimestamp(), () => ({ [TAG]: 'serverTimestamp' }));
export const arrayUnion = (...elements: unknown[]): FieldValue =>
  remember(fsArrayUnion(...elements), () => ({ [TAG]: 'arrayUnion', v: elements.map(encode) }));
export const arrayRemove = (...elements: unknown[]): FieldValue =>
  remember(fsArrayRemove(...elements), () => ({ [TAG]: 'arrayRemove', v: elements.map(encode) }));
/** An increment replayed after its first copy did land counts twice; only possible within milliseconds of a close. */
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

/** The notes stay for the next sign-in or open. */
function replayFailed(e: unknown): false {
  console.warn("Couldn't repeat the writes saved before the app closed", e);
  return false;
}

async function replay(box: Outbox, uid: string, recheck: boolean): Promise<void> {
  // One page at a time, so two pages opening together don't both repeat a note.
  const waiting = box.locks
    ? ((await box.locks.request(REPLAY_LOCK + box.prefix, () => replayNow(box, uid)).catch(replayFailed)) as boolean)
    : await replayNow(box, uid).catch(replayFailed);
  if (waiting && recheck) setTimeout(() => void replay(box, uid, false), box.recheckMs);
}

/** Writes again every note left for `uid` by a page that is no longer open. True if some page's notes had to wait. */
async function replayNow(box: Outbox, uid: string): Promise<boolean> {
  const live = await liveTabs(box.locks);
  let waiting = false;
  for (const { key, entry } of pendingEntries(box.storage, box.prefix)) {
    if (entry.uid !== uid || entry.tab === box.tab) continue;
    if (live?.has(entry.tab)) {
      waiting = true;
      continue;
    }
    let ops: Op[];
    let batch;
    try {
      ops = await stillNeeded(box.db, entry);
      batch = fsWriteBatch(box.db);
      for (const op of ops) applyOp(batch, box.db, op);
    } catch (e) {
      console.warn("Dropped a saved write that can't be repeated", e);
      box.storage.removeItem(key);
      continue;
    }
    if (box.auth.currentUser?.uid !== uid) return false;
    if (!ops.length) {
      box.storage.removeItem(key);
      continue;
    }
    box.storage.setItem(key, JSON.stringify({ ...entry, tab: box.tab }));
    batch.commit().catch((e) => console.warn("Couldn't repeat a write saved before the app closed", e));
    forgetOnceCached(box, key, ops[0].path);
  }
  return waiting;
}

/**
 * The note's writes that the local cache doesn't show as done or overtaken. A set whose data is
 * already there landed before the page closed (only the forgetting was cut short). A document whose
 * `updatedAt` is at or after the note was changed since, by someone or something newer: repeating
 * a set, update or delete would undo that. A document the cache has never seen, or knows only as
 * missing (it may never have existed: the cache can't tell), gets a set or delete; an update to it
 * would fail, so it is left out.
 */
async function stillNeeded(db: Firestore, entry: OutboxEntry): Promise<Op[]> {
  const out: Op[] = [];
  for (const op of entry.ops) {
    const snap = await getDocFromCache(doc(db, op.path)).catch(() => null);
    if (!snap?.exists()) {
      if (op.kind !== 'update') out.push(op);
      continue;
    }
    const data = snap.data();
    if (typeof data.updatedAt === 'number' && data.updatedAt >= entry.at) continue;
    if (op.kind === 'set' && !op.merge && !op.mergeFields) {
      let cached;
      try {
        cached = encode(data);
      } catch {
        cached = null;
      }
      if (cached !== null && sameJson(cached, op.data)) continue;
    }
    out.push(op);
  }
  return out;
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

// Pages -------------------------------------------------------------------------------------------

function newTabId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function browserLocks(): LockManagerLike | null {
  return typeof navigator === 'undefined' ? null : ((navigator as { locks?: LockManagerLike }).locks ?? null);
}

/** Pages open right now, or null when that can't be told (then every note is replayed). */
async function liveTabs(locks: LockManagerLike | null): Promise<Set<string> | null> {
  if (!locks) return null;
  try {
    const { held = [] } = await locks.query();
    return new Set(held.map((h) => h.name ?? '').filter((n) => n.startsWith(TAB_LOCK)).map((n) => n.slice(TAB_LOCK.length)));
  } catch {
    return null;
  }
}
