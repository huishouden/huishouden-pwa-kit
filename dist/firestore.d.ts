import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { type CollectionReference, type DocumentData, type DocumentReference, type FieldValue, type Firestore, type FirestoreSettings, type PartialWithFieldValue, type SetOptions, type UpdateData, type WithFieldValue } from 'firebase/firestore';
import { type StorageLike } from './outbox-codec.js';
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
}
/**
 * `initializeFirestore` with the persistent multi-tab cache every app uses (opens offline, keeps
 * writes made offline), plus the write notes described above. Notes left by a page that closed
 * too soon are written again once `auth` has a signed-in user.
 */
export declare function initFirestore(app: FirebaseApp, { auth, storage, settings, locks, recheckMs }: InitFirestoreOptions): Firestore;
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
/** An increment replayed after its first copy did land counts twice; only possible within milliseconds of a close. */
export declare const increment: (n: number) => FieldValue;
export {};
