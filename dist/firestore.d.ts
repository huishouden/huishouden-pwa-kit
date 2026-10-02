import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { DocumentReference, FieldValue, type CollectionReference, type DocumentData, type Firestore, type FirestoreSettings, type PartialWithFieldValue, type SetOptions, type UpdateData, type WithFieldValue } from 'firebase/firestore';
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
type Op = {
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
type AuthLike = Pick<Auth, 'currentUser' | 'onAuthStateChanged'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
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
export declare function initFirestore(app: FirebaseApp, { auth, storage, settings }: InitFirestoreOptions): Firestore;
export declare function setDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: WithFieldValue<A>): Promise<void>;
export declare function setDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options: SetOptions): Promise<void>;
export declare function updateDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: UpdateData<D>): Promise<void>;
export declare function deleteDoc<A, D extends DocumentData>(ref: DocumentReference<A, D>): Promise<void>;
/** Like Firestore's `addDoc`: the id is made on the device, so the note can repeat the same write. */
export declare function addDoc<A, D extends DocumentData>(ref: CollectionReference<A, D>, data: WithFieldValue<A>): Promise<DocumentReference<A, D>>;
export interface WriteBatch {
    set<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: WithFieldValue<A>): WriteBatch;
    set<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: PartialWithFieldValue<A>, options: SetOptions): WriteBatch;
    update<A, D extends DocumentData>(ref: DocumentReference<A, D>, data: UpdateData<D>): WriteBatch;
    delete<A, D extends DocumentData>(ref: DocumentReference<A, D>): WriteBatch;
    commit(): Promise<void>;
}
/** Firestore's batch, noted as one entry when it commits. */
export declare function writeBatch(db: Firestore): WriteBatch;
export declare const deleteField: () => FieldValue;
export declare const serverTimestamp: () => FieldValue;
export declare const arrayUnion: (...elements: unknown[]) => FieldValue;
export declare const arrayRemove: (...elements: unknown[]) => FieldValue;
export declare const increment: (n: number) => FieldValue;
/** The notes in `storage`, oldest first. Exported for tests. */
export declare function pendingEntries(storage: StorageLike, prefix: string): {
    key: string;
    entry: OutboxEntry;
}[];
/** A Firestore value as JSON, or `Unencodable`. Exported for tests. */
export declare function encode(value: unknown): Json;
/** The value `encode` was given back, with Firestore's own types and sentinels. */
export declare function decode(value: Json, db?: Firestore): unknown;
export {};
