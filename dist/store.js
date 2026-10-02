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
/** A record as stored, without its id: for writing a read document back (Undo). */
export const withoutId = ({ id: _id, ...rest }) => rest;
/** `list` with `item` in place of any with its id (added at the end otherwise). */
export const upsert = (list, item) => [...list.filter((x) => x.id !== item.id), item];
/**
 * `data` with the ops applied, as a store holds it once the write lands: each op replaces (or
 * removes, or with `merge` updates in place) the item with its id in the list `key(col)`; other
 * lists are kept as they are. Ops on the same document apply in order, so the last one wins.
 */
export function applyOps(data, ops, key = (col) => col) {
    const next = { ...data };
    for (const op of ops) {
        const k = key(op.col);
        const current = next[k] ?? [];
        if (op.merge && op.data) {
            // A merge changes the document where it is; on one not there it adds it, as Firestore does.
            const at = current.findIndex((x) => x.id === op.id);
            next[k] = at < 0 ? [...current, { id: op.id, ...op.data }] : current.map((x, i) => (i === at ? { ...x, ...op.data } : x));
            continue;
        }
        const list = current.filter((x) => x.id !== op.id);
        next[k] = op.data ? [...list, { id: op.id, ...op.data }] : list;
    }
    return next;
}
/**
 * The ops that undo `ops`: each document's whole version from before (found with `find`), or its
 * removal when it did not exist. One op per document, in reverse order.
 */
export function inverseOps(ops, find) {
    const inverse = [];
    const seen = new Set();
    for (const op of ops) {
        const key = `${op.col}/${op.id}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const before = find(op.col, op.id);
        inverse.push({ col: op.col, id: op.id, data: before ? withoutId(before) : null });
    }
    return inverse.reverse();
}
/**
 * Writes ops through `backend` and returns their Undo. `find` reads the data as it is before the
 * write (the store's current data), so Undo writes those versions back.
 */
export function changes(backend, find) {
    return (ops) => {
        const inverse = inverseOps(ops, find);
        backend.write(ops);
        return () => backend.write(inverse);
    };
}
/** A new record's stamp (`me`, now), or an edit's: the original author and creation time, with `updatedAt`. */
export function stampFor(existing, me, now) {
    return existing ? { createdAt: existing.createdAt, by: existing.by, updatedAt: now } : { createdAt: now, by: me };
}
/** Ids for the sample: unique within a page load (`local-<col>-<time>-<n>`). */
export function localIds() {
    let seq = 0;
    return (col) => `local-${col ? `${col}-` : ''}${Date.now()}-${seq++}`;
}
/**
 * Sample data in memory behind a `Backend`: ops apply at once, so an action that reads the data
 * right after another sees it, and `onChange` gets each new version (React state, usually).
 */
export function memoryStore(initial, onChange, key) {
    let data = initial;
    const ids = localIds();
    const patch = (f) => {
        data = f(data);
        onChange(data);
    };
    return {
        read: () => data,
        patch,
        backend: { newId: (col) => ids(col), write: (ops) => patch((d) => applyOps(d, ops, key)) },
    };
}
