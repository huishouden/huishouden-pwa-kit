import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { writeBatch } from './firestore.js';
import { cleanAudience, inAudience } from './audience.js';
import { agendaDoc, agendaId, agendaInRange, inAgendaWindow, personalAgendaDoc, toAgendaItem, PERSONAL_AGENDA } from './agenda-core.js';
/**
 * The household's agenda over the Firebase SDK: publishing (`syncAgenda` and friends) and following
 * (`watchAgenda`). The data contract and every reading helper are in `./agenda-core` (re-exported
 * here), which servers import without Firebase.
 */
export * from './agenda-core.js';
const agendaOf = (db, householdId) => collection(db, 'households', householdId, 'agenda');
const personalOf = (db, householdId) => collection(db, 'households', householdId, PERSONAL_AGENDA);
const comparable = ({ updatedAt: _u, by: _b, ...rest }) => {
    delete rest.id;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
};
const refused = (e) => e?.code === 'permission-denied';
async function commit(db, ops, restricted = false) {
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
/** Makes `stored` (this app's items, or one ref's) exactly `items`, writing only what changed. */
async function reconcile(db, householdId, app, stored, items, { by, restricted = false, now = Date.now() }, { col = agendaOf(db, householdId), build = (item) => agendaDoc(app, item, by, now) } = {}) {
    const wanted = new Map();
    for (const item of items) {
        if (!inAgendaWindow(item, now))
            continue;
        // A helper's device can't see private items, so it never publishes or removes them.
        if (restricted && item.private)
            continue;
        wanted.set(agendaId(app, item.ref, item.start), build(item));
    }
    const ops = [];
    let unchanged = 0;
    const have = new Map(stored.map((s) => [s.id, s.data]));
    for (const { id } of stored)
        if (!wanted.has(id))
            ops.push((b) => b.delete(doc(col, id)));
    const deleted = ops.length;
    for (const [id, data] of wanted) {
        const old = have.get(id);
        if (old && comparable(toAgendaItem(id, old)) === comparable({ ...data }))
            unchanged++;
        else
            ops.push((b) => b.set(doc(col, id), data));
    }
    await commit(db, ops, restricted);
    return { written: ops.length - deleted, deleted, unchanged };
}
/** The agenda, or for a helper or kid only its open items (what the rules let them read). */
const visible = (db, householdId, restricted, ...filters) => query(agendaOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));
const snapshotDocs = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
/**
 * Makes one source record's items exactly `items` (each gets `ref`): call it when the record is
 * saved. Ids are idempotent, unchanged items are not rewritten, and items this record no longer
 * has (a moved appointment's old time) are deleted. An empty list removes the record's items.
 */
export async function replaceAgenda(db, householdId, app, ref, items, options) {
    const snap = await getDocs(visible(db, householdId, options.restricted, where('app', '==', app), where('ref', '==', ref)));
    return reconcile(db, householdId, app, snapshotDocs(snap), items.map((i) => ({ ...i, ref })), options);
}
/** Deletes one source record's items (the record was deleted). */
export async function removeAgenda(db, householdId, app, ref, { restricted = false } = {}) {
    const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app), where('ref', '==', ref)));
    await commit(db, snap.docs.map((d) => (b) => b.delete(d.ref)), restricted);
    return snap.docs.length;
}
/**
 * Makes everything this app has published exactly `items`: for apps that work out all their dates
 * when they open. Writes only what changed and deletes what is no longer there, so running it on
 * every open costs one read of the app's items and almost no writes.
 */
export async function syncAgenda(db, householdId, app, items, options) {
    const snap = await getDocs(visible(db, householdId, options.restricted, where('app', '==', app)));
    return reconcile(db, householdId, app, snapshotDocs(snap), items, options);
}
/**
 * Makes this app's items for named members exactly `items`, as `syncAgenda` does for the shared
 * agenda: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export async function syncPersonalAgenda(db, householdId, app, items, { by, now = Date.now() }) {
    const me = by.trim().toLowerCase();
    const col = personalOf(db, householdId);
    const snap = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
    const mine = items.filter((i) => inAudience(cleanAudience(i.audience), me));
    return reconcile(db, householdId, app, snapshotDocs(snap), mine, { by: me, now }, { col, build: (item) => personalAgendaDoc(app, item, me, now) });
}
/**
 * Follows the household's items overlapping `from`..`to` (and any overdue), soonest first; with
 * `me`, the member's personal items too. Waits for both lists before the first answer.
 */
export function watchAgenda(db, householdId, range, onChange) {
    const { from, to, apps, restricted, me, onError } = range;
    let shared = null;
    let personal = me ? null : [];
    const emit = () => {
        if (shared && personal)
            onChange(agendaInRange([...shared, ...personal], { from, to, apps }));
    };
    const unsubs = [
        onSnapshot(visible(db, householdId, restricted, where('start', '<', to)), (snap) => {
            shared = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
            emit();
        }, (error) => onError?.(error)),
    ];
    if (me) {
        unsubs.push(onSnapshot(query(personalOf(db, householdId), where('audience', 'array-contains', me.trim().toLowerCase())), (snap) => {
            personal = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
            emit();
        }, 
        // Rules from before personal items refuse the query: the shared agenda still shows.
        () => {
            personal = [];
            emit();
        }));
    }
    return () => unsubs.forEach((u) => u());
}
