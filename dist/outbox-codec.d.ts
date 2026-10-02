import { FieldValue, type Firestore } from 'firebase/firestore';
/**
 * The write notes' storage format, internal to `@huishouden/pwa-kit/firestore` (not a package
 * export, so it can change without a release note).
 */
export declare const TAG = "__hhOutbox";
/** A note older than this is dropped unread: whatever it held is stale by now. */
export declare const MAX_AGE_MS: number;
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export type Op = {
    kind: 'set';
    path: string;
    data: Json;
    merge?: true;
    mergeFields?: string[];
} | {
    kind: 'update';
    path: string;
    data: Json;
} | {
    kind: 'delete';
    path: string;
};
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
export declare class Unencodable extends Error {
}
/** The notes under `prefix`, oldest first; unreadable and expired ones are removed. */
export declare function pendingEntries(storage: StorageLike, prefix: string, now?: number): {
    key: string;
    entry: OutboxEntry;
}[];
export declare function remember(value: FieldValue, encoded: () => Json): FieldValue;
/** A Firestore value as JSON; throws `Unencodable` for one with no JSON form. */
export declare function encode(value: unknown): Json;
/** The value `encode` was given, back with Firestore's own types and sentinels. */
export declare function decode(value: Json, db?: Firestore): unknown;
/** Whether two encoded values are the same, whatever the order of their keys. */
export declare function sameJson(a: Json, b: Json): boolean;
