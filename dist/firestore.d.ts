import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { type CollectionReference, type DocumentData, type DocumentReference, type FieldValue, type Firestore, type FirestoreSettings, type PartialWithFieldValue, type SetOptions, type UpdateData, type WithFieldValue } from 'firebase/firestore';
import { type StorageLike } from './outbox-codec.js';
import type { Op as StoreOp } from './store.js';
type AuthLike = Pick<Auth, 'currentUser' | 'onAuthStateChanged'>;
/** The part of the Web Locks API the outbox uses. */
export interface LockManagerLike {
    request(name: string, callback: () => Promise<unknown>): Promise<unknown>;
    query(): Promise<{
        held?: {
            name?: string;
        }[];
    }>;
}
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
    /**
     * Calls `retry` when the network comes back, for notes that had to wait for the server. Defaults
     * to the window's `online` event; `null` for none.
     */
    online?: ((retry: () => void) => void) | null;
}
/**
 * `initializeFirestore` with the persistent multi-tab cache every app uses (opens offline, keeps
 * writes made offline), plus the write notes described above. Notes left by a page that closed
 * too soon are written again once `auth` has a signed-in user.
 */
export declare function initFirestore(app: FirebaseApp, { auth, storage, settings, locks, recheckMs, online }: InitFirestoreOptions): Firestore;
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
/**
 * Writes `./store` ops as one batch under `base` (`households/{id}`): a set for each op with data
 * (merged with `merge`), a delete for each without. `path(col)` names the Firestore collection for an op's list (the list
 * name itself by default). Returns the commit, for the caller's error toast; the screen updates
 * from the local cache before it resolves.
 */
export declare function commitOps<C extends string>(db: Firestore, base: string, ops: readonly StoreOp<C>[], path?: (col: C) => string): Promise<void>;
export declare const deleteField: () => FieldValue;
export declare const serverTimestamp: () => FieldValue;
export declare const arrayUnion: (...elements: unknown[]) => FieldValue;
export declare const arrayRemove: (...elements: unknown[]) => FieldValue;
/**
 * An increment replayed after its first copy did land counts twice. With the persistent cache the
 * replay leaves it to Firestore's own queue; with a memory cache it can happen when the page closes
 * between the server taking the write and its answer arriving.
 */
export declare const increment: (n: number) => FieldValue;
/**
 * Signing someone out on a shared device: gives their unsent writes up to `timeoutMs` to reach the
 * server, removes their write notes, then runs `signOut`, making no new notes for them in between.
 * Only the kit's notes go: Firestore's own cache (with the persistent cache, the documents they
 * read and their still-queued writes) stays. If they are still signed in afterwards (no `signOut`,
 * or it failed), their writes are noted again. Returns how many notes were still unsent and are
 * gone; 0 on a Firestore that didn't come from `initFirestore`, or signed out.
 */
export declare function forgetOutbox(db: Firestore, { timeoutMs, signOut }?: {
    timeoutMs?: number;
    signOut?: () => Promise<void>;
}): Promise<number>;
export {};
