/**
 * Apps write through `@huishouden/pwa-kit/firestore` so a write made just before the app closes
 * isn't lost (see firestore.ts). Firestore's own write functions have the same signatures, so the
 * type checker can't tell an editor's auto-import of `setDoc` from `firebase/firestore` apart; this
 * check can. Field sentinels count too: Firestore's own `arrayUnion`, `arrayRemove` and `increment`
 * can't be noted.
 */
export declare const OUTBOX_WRITES: readonly ["setDoc", "updateDoc", "deleteDoc", "addDoc", "writeBatch", "arrayUnion", "arrayRemove", "increment"];
export interface RawWrite {
    line: number;
    name: string;
}
/** Write functions a source file imports from `firebase/firestore` instead of the kit. */
export declare function findRawWrites(source: string): RawWrite[];
/** App code, not tests: tests may write to Firestore any way they like. */
export declare const isAppSource: (path: string) => boolean;
