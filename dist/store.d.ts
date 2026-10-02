/**
 * An app's data actions written once over two backends: Firestore for a signed-in household and
 * memory for the signed-out sample. Every action is a list of document writes (`Op`s); a backend
 * applies them together, and `changes` turns each list into an Undo that writes back exactly the
 * documents it touched, under the same ids.
 *
 * ```ts
 * const backend = live ? firestoreBackend : memory.backend; // see `commitOps` in ./firestore
 * const change = changes(backend, (col, id) => find(read()[col], id));
 * const undo = change([{ col: 'tasks', id, data: taskDoc(input) }]);
 * notify('Saved', undo);
 * ```
 *
 * Pure: no Firebase import. `commitOps` in `./firestore` writes ops as one Firestore batch;
 * `useSampleStore` in `./react/store` holds sample data in React state.
 */
/**
 * One document write: `data` null deletes it. `col` is the app's name for the list it is in.
 * `merge` changes only the fields in `data` (Firestore's `set` with `merge: true`), so a tick or a
 * reorder doesn't write back fields another device may have just changed.
 */
export interface Op<C extends string = string> {
    col: C;
    id: string;
    data: object | null;
    merge?: boolean;
}
/** Puts things back as they were before an action. */
export type Undo = () => void;
/** Where ops go: a Firestore batch, or memory. */
export interface Backend<C extends string = string> {
    /** A fresh document id in `col`. */
    newId(col: C): string;
    /** Applies the writes together (one batch). */
    write(ops: Op<C>[]): void;
}
/** A record as stored, without its id: for writing a read document back (Undo). */
export declare const withoutId: <T extends {
    id: string;
}>({ id: _id, ...rest }: T) => Omit<T, "id">;
/** `list` with `item` in place of any with its id (added at the end otherwise). */
export declare const upsert: <T extends {
    id: string;
}>(list: readonly T[], item: T) => T[];
/**
 * `data` with the ops applied, as a store holds it once the write lands: each op replaces (or
 * removes, or with `merge` updates in place) the item with its id in the list `key(col)`; other
 * lists are kept as they are. Ops on the same document apply in order, so the last one wins.
 */
export declare function applyOps<D extends object, C extends string = string>(data: D, ops: readonly Op<C>[], key?: (col: C) => keyof D): D;
/**
 * The ops that undo `ops`: each document's whole version from before (found with `find`), or its
 * removal when it did not exist. One op per document, in reverse order.
 */
export declare function inverseOps<C extends string>(ops: readonly Op<C>[], find: (col: C, id: string) => {
    id: string;
} | undefined): Op<C>[];
/**
 * Writes ops through `backend` and returns their Undo. `find` reads the data as it is before the
 * write (the store's current data), so Undo writes those versions back.
 */
export declare function changes<C extends string>(backend: Backend<C>, find: (col: C, id: string) => {
    id: string;
} | undefined): (ops: Op<C>[]) => Undo;
/** Who wrote a record and when, as the rules expect: kept from the original on an edit. */
export interface Stamp {
    createdAt: number;
    by: string;
    updatedAt?: number;
}
/** A new record's stamp (`me`, now), or an edit's: the original author and creation time, with `updatedAt`. */
export declare function stampFor(existing: {
    createdAt: number;
    by: string;
} | undefined, me: string, now: number): Stamp;
/** Ids for the sample: unique within a page load (`local-<col>-<time>-<n>`). */
export declare function localIds(): (col?: string) => string;
/**
 * Sample data in memory behind a `Backend`: ops apply at once, so an action that reads the data
 * right after another sees it, and `onChange` gets each new version (React state, usually).
 */
export declare function memoryStore<D extends object, C extends string = string>(initial: D, onChange: (data: D) => void, key?: (col: C) => keyof D): {
    read(): D;
    patch(f: (data: D) => D): void;
    backend: Backend<C>;
};
