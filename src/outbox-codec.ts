import {
  arrayRemove,
  arrayUnion,
  Bytes,
  deleteField,
  doc,
  DocumentReference,
  FieldValue,
  GeoPoint,
  increment,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';

/**
 * The write notes' storage format, internal to `@huishouden/pwa-kit/firestore` (not a package
 * export, so it can change without a release note).
 */

export const TAG = '__hhOutbox';
/** A note older than this is dropped unread: whatever it held is stale by now. */
export const MAX_AGE_MS = 7 * 24 * 3_600_000;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Op =
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

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export class Unencodable extends Error {}

/** The notes under `prefix`, oldest first; unreadable and expired ones are removed. */
export function pendingEntries(storage: StorageLike, prefix: string, now = Date.now()): { key: string; entry: OutboxEntry }[] {
  const out: { key: string; entry: OutboxEntry }[] = [];
  const drop: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const entry = JSON.parse(storage.getItem(key) ?? '') as OutboxEntry;
      if (entry?.v === 1 && Array.isArray(entry.ops) && entry.ops.length && now - entry.at < MAX_AGE_MS) out.push({ key, entry });
      else drop.push(key);
    } catch {
      drop.push(key);
    }
  }
  drop.forEach((k) => storage.removeItem(k));
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Field sentinels made by the kit, remembered so a note can repeat them.
const sentinels = new WeakMap<FieldValue, () => Json>();

export function remember(value: FieldValue, encoded: () => Json): FieldValue {
  sentinels.set(value, encoded);
  return value;
}

/** A Firestore value as JSON; throws `Unencodable` for one with no JSON form. */
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
    if (value.isEqual(deleteField())) return { [TAG]: 'deleteField' };
    if (value.isEqual(serverTimestamp())) return { [TAG]: 'serverTimestamp' };
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

/** The value `encode` was given, back with Firestore's own types and sentinels. */
export function decode(value: Json, db?: Firestore): unknown {
  if (Array.isArray(value)) return value.map((v) => decode(v, db));
  if (value === null || typeof value !== 'object') return value;
  const tag = value[TAG];
  if (typeof tag === 'string') {
    const v = value.v;
    switch (tag) {
      case 'deleteField': return deleteField();
      case 'serverTimestamp': return serverTimestamp();
      case 'arrayUnion': return arrayUnion(...(v as Json[]).map((e) => decode(e, db)));
      case 'arrayRemove': return arrayRemove(...(v as Json[]).map((e) => decode(e, db)));
      case 'increment': return increment(v as number);
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

/** Whether two encoded values are the same, whatever the order of their keys. */
export function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && sameJson(a[k], b[k]));
}
