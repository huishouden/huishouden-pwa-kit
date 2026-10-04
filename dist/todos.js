import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { commitOps, writeBatch } from './firestore.js';
import { MONEY_APPS } from './role-core.js';
import { PERSONAL_TODOS, personalTodoDoc, planTodo, sortTodos, todoActionOps, todoDoc, todoId, toTodoItem, } from './todo-core.js';
import { cleanAudience, inAudience } from './audience.js';
/**
 * The household's to-do list over the Firebase SDK: publishing (`syncTodos`), following
 * (`watchTodos`) and applying an action (`applyTodo`). The list's data contract, reading helpers and
 * the database-free planning of an action are in `./todo-core` (re-exported here), which servers
 * import without Firebase.
 */
export * from './todo-core.js';
const todosOf = (db, householdId) => collection(db, 'households', householdId, 'todos');
const personalOf = (db, householdId) => collection(db, 'households', householdId, PERSONAL_TODOS);
// ---- Publishing ----
const comparable = ({ updatedAt: _u, by: _b, ...rest }) => {
    delete rest.id;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
};
const refused = (e) => e?.code === 'permission-denied';
async function commit(db, ops, restricted) {
    if (restricted) {
        for (const op of ops) {
            const batch = writeBatch(db);
            op(batch);
            await batch.commit().catch((e) => {
                if (!refused(e))
                    throw e;
            });
        }
        return;
    }
    for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 450))
            op(batch);
        await batch.commit();
    }
}
/** The to-dos, or for a helper or kid only those not marked private (what the rules let them read). */
const visible = (db, householdId, restricted, ...filters) => query(todosOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));
/**
 * Makes everything this app has published exactly `items`: call it on open and a few seconds after
 * a change (as `syncAgenda`). Writes only what changed and deletes what is no longer open, so a
 * record done or cancelled anywhere leaves the list on the next sync.
 */
export async function syncTodos(db, householdId, app, items, { by, restricted = false, now = Date.now() }) {
    const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app)));
    const wanted = new Map();
    for (const item of items) {
        // A helper's device can't see private items, so it never publishes or removes them.
        if (restricted && (item.private || MONEY_APPS.includes(app)))
            continue;
        wanted.set(todoId(app, item.ref), todoDoc(app, item, by, now));
    }
    return reconcile(db, todosOf(db, householdId), snap.docs, wanted, restricted);
}
/** Makes the stored documents exactly `wanted`, writing only what changed. */
async function reconcile(db, col, stored, wanted, restricted) {
    const ops = [];
    let unchanged = 0;
    const have = new Map(stored.map((d) => [d.id, d.data()]));
    for (const id of have.keys())
        if (!wanted.has(id))
            ops.push((b) => b.delete(doc(col, id)));
    const deleted = ops.length;
    for (const [id, data] of wanted) {
        const old = have.get(id);
        if (old && comparable(toTodoItem(id, old)) === comparable({ ...data }))
            unchanged++;
        else
            ops.push((b) => b.set(doc(col, id), data));
    }
    await commit(db, ops, restricted);
    return { written: ops.length - deleted, deleted, unchanged };
}
/**
 * Makes this app's to-dos for named members exactly `items`, as `syncTodos` does for the shared
 * list: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export async function syncPersonalTodos(db, householdId, app, items, { by, now = Date.now() }) {
    const me = by.trim().toLowerCase();
    const col = personalOf(db, householdId);
    const snap = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
    const wanted = new Map();
    for (const item of items) {
        if (!inAudience(cleanAudience(item.audience), me))
            continue;
        wanted.set(todoId(app, item.ref), personalTodoDoc(app, item, me, now));
    }
    return reconcile(db, col, snap.docs, wanted, false);
}
/** Follows the household's to-dos (with `me`, the member's personal ones too), newest first. Waits for both lists before the first answer. */
export function watchTodos(db, householdId, { restricted, me, onError }, onChange) {
    let shared = null;
    let personal = me ? null : [];
    const emit = () => {
        if (shared && personal)
            onChange(sortTodos([...shared, ...personal], 'newest'));
    };
    const unsubs = [
        onSnapshot(visible(db, householdId, restricted), (snap) => {
            shared = snap.docs.map((d) => toTodoItem(d.id, d.data()));
            emit();
        }, (error) => onError?.(error)),
    ];
    if (me) {
        unsubs.push(onSnapshot(query(personalOf(db, householdId), where('audience', 'array-contains', me.trim().toLowerCase())), (snap) => {
            personal = snap.docs.map((d) => toTodoItem(d.id, d.data()));
            emit();
        }, 
        // Rules from before personal items refuse the query: the shared list still shows.
        () => {
            personal = [];
            emit();
        }));
    }
    return () => unsubs.forEach((u) => u());
}
/**
 * Runs an item's `done` or `cancel`: reads the records it touches (for Undo), then writes its ops
 * and removes the item in one batch as `me`. The rules check every write as if made in the app.
 * A merge onto a record that no longer exists is refused (it was deleted in its app): the item is
 * left for the app to clear on its next sync.
 */
export async function applyTodo(db, householdId, item, which, { me, now = Date.now() }) {
    const ops = todoActionOps(item, which, { now, me });
    const base = `households/${householdId}`;
    const before = new Map();
    for (const op of ops) {
        const key = `${op.col}/${op.id}`;
        if (before.has(key))
            continue;
        const snap = await getDoc(doc(db, base, op.col, op.id));
        before.set(key, snap.exists() ? { id: op.id, ...snap.data() } : undefined);
    }
    const plan = planTodo(item, ops, (col, id) => before.get(`${col}/${id}`), { now, me });
    const written = commitOps(db, base, plan.writes);
    return {
        written,
        undo: () => commitOps(db, base, plan.undo(Date.now())),
    };
}
