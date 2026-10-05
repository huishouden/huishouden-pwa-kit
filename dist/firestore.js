import { arrayRemove as fsArrayRemove, arrayUnion as fsArrayUnion, deleteDoc as fsDeleteDoc, deleteField as fsDeleteField, doc, getDocFromCache, getDocFromServer, waitForPendingWrites, increment as fsIncrement, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp as fsServerTimestamp, setDoc as fsSetDoc, updateDoc as fsUpdateDoc, writeBatch as fsWriteBatch, } from 'firebase/firestore';
import { decode, encode, pendingEntries, remember, TAG, Unencodable, } from './outbox-codec.js';
import { opsToRepeat } from './outbox-plan.js';
/**
 * Firestore for a household app, and writes that survive the app closing at once.
 *
 * Firestore's persistent cache keeps a write that is waiting for the network, but only once the
 * write has reached IndexedDB, a few milliseconds after `setDoc` returns, and only while IndexedDB
 * works: when it can't be opened (storage full, a private window) Firestore quietly falls back to
 * a memory cache, and every write not yet on the server dies with the page. A person who taps
 * "Log" and closes the app (or reloads) inside either gap loses the entry, with no error anywhere.
 * So the write functions here also note each write synchronously in localStorage, which is written
 * before the page can go away, and forget it once the server has it (or has refused it). A note
 * still there when the app next opens, signed in as the same person, is written again, unless the
 * server (or, offline, the local cache) shows the write already landed or was overtaken by a newer
 * one (see `stillNeeded`). Notes older
 * than a week are dropped unread.
 *
 * Use `initFirestore` in place of `initializeFirestore`, and import `setDoc`, `updateDoc`,
 * `deleteDoc`, `addDoc`, `writeBatch` and the field sentinels from here instead of
 * `firebase/firestore`. They take the same arguments, except that `updateDoc` and `batch.update`
 * take an object (no field-path/value pairs) and `writeBatch` returns the kit's `WriteBatch`. On a
 * Firestore that didn't come from `initFirestore` they are Firestore's own. A write that can't be
 * noted (a converter, a value with no JSON form) still goes to Firestore, without the note.
 *
 * The note holds the written data, in the same browser storage as Firestore's own cache of it.
 */
const PREFIX = 'hh-outbox:';
const TAB_LOCK = 'hh-outbox-tab:';
const REPLAY_LOCK = 'hh-outbox-replay:';
const outboxes = new WeakMap();
/**
 * `initializeFirestore` with the persistent multi-tab cache every app uses (opens offline, keeps
 * writes made offline), plus the write notes described above. Notes left by a page that closed
 * too soon are written again once `auth` has a signed-in user.
 */
export function initFirestore(app, { auth, storage, settings, locks, recheckMs = 5_000, online = browserOnline }) {
    const db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ...settings,
    });
    const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    if (!store)
        return db;
    const box = {
        db,
        auth,
        storage: store,
        locks: locks === undefined ? browserLocks() : locks,
        recheckMs,
        prefix: `${PREFIX}${app.options.projectId ?? app.name}:`,
        tab: newTabId(),
        seq: 0,
        closing: null,
        signedInAt: 0,
    };
    outboxes.set(db, box);
    // Held until the page goes away, so other pages can tell this one is still open.
    void box.locks?.request(TAB_LOCK + box.tab, () => new Promise(() => { })).catch(() => { });
    auth.onAuthStateChanged((user) => {
        if (!user)
            return;
        box.closing = null;
        box.signedInAt = Date.now();
        void replay(box, user.uid, true);
    });
    // A note that had to wait for the server (an update to a document this device has never read)
    // gets its next chance when the network comes back.
    online?.(() => {
        const uid = auth.currentUser?.uid;
        if (uid)
            void replay(box, uid, false);
    });
    return db;
}
export function setDoc(ref, data, options) {
    const p = options ? fsSetDoc(ref, data, options) : fsSetDoc(ref, data);
    note(ref.firestore, p, () => [setOp(ref, data, options)]);
    return p;
}
export function updateDoc(ref, data) {
    const p = fsUpdateDoc(ref, data);
    note(ref.firestore, p, () => [{ kind: 'update', path: plainRef(ref), data: encode(data) }]);
    return p;
}
export function deleteDoc(ref) {
    const p = fsDeleteDoc(ref);
    note(ref.firestore, p, () => [{ kind: 'delete', path: ref.path }]);
    return p;
}
/** Like Firestore's `addDoc`: the id is made on the device, so the note can repeat the same write. */
export function addDoc(ref, data) {
    const created = doc(ref);
    return setDoc(created, data).then(() => created);
}
/** Firestore's batch, noted as one entry when it commits. */
export function writeBatch(db) {
    const batch = fsWriteBatch(db);
    const ops = [];
    const self = {
        set(ref, data, options) {
            if (options)
                batch.set(ref, data, options);
            else
                batch.set(ref, data);
            ops.push(() => setOp(ref, data, options));
            return self;
        },
        update(ref, data) {
            batch.update(ref, data);
            ops.push(() => ({ kind: 'update', path: plainRef(ref), data: encode(data) }));
            return self;
        },
        delete(ref) {
            batch.delete(ref);
            ops.push(() => ({ kind: 'delete', path: ref.path }));
            return self;
        },
        commit() {
            const p = batch.commit();
            if (ops.length)
                note(db, p, () => ops.map((op) => op()));
            return p;
        },
    };
    return self;
}
/**
 * Writes `./store` ops as one batch under `base` (`households/{id}`): a set for each op with data
 * (merged with `merge`), a delete for each without. `path(col)` names the Firestore collection for an op's list (the list
 * name itself by default). Returns the commit, for the caller's error toast; the screen updates
 * from the local cache before it resolves.
 */
export function commitOps(db, base, ops, path = (col) => col) {
    const batch = writeBatch(db);
    for (const op of ops) {
        const ref = doc(db, base, path(op.col), op.id);
        if (!op.data)
            batch.delete(ref);
        else if (op.merge)
            batch.set(ref, op.data, { merge: true });
        else
            batch.set(ref, op.data);
    }
    return batch.commit();
}
// Field sentinels: Firestore's, remembered so a note can repeat them -------------------------------
export const deleteField = () => remember(fsDeleteField(), () => ({ [TAG]: 'deleteField' }));
export const serverTimestamp = () => remember(fsServerTimestamp(), () => ({ [TAG]: 'serverTimestamp' }));
export const arrayUnion = (...elements) => remember(fsArrayUnion(...elements), () => ({ [TAG]: 'arrayUnion', v: elements.map(encode) }));
export const arrayRemove = (...elements) => remember(fsArrayRemove(...elements), () => ({ [TAG]: 'arrayRemove', v: elements.map(encode) }));
/**
 * An increment replayed after its first copy did land counts twice. With the persistent cache the
 * replay leaves it to Firestore's own queue; with a memory cache it can happen when the page closes
 * between the server taking the write and its answer arriving.
 */
export const increment = (n) => remember(fsIncrement(n), () => ({ [TAG]: 'increment', v: n }));
// The note ------------------------------------------------------------------------------------------
function note(db, written, build) {
    const box = outboxes.get(db);
    const uid = box?.auth.currentUser?.uid;
    if (!box || !uid || box.closing === uid)
        return;
    let entry;
    try {
        entry = { v: 1, uid, tab: box.tab, at: Date.now(), ops: build() };
    }
    catch (e) {
        if (e instanceof Unencodable)
            return;
        throw e;
    }
    const key = `${box.prefix}${entry.at.toString(36).padStart(10, '0')}-${(box.seq++).toString(36).padStart(4, '0')}-${box.tab}`;
    try {
        box.storage.setItem(key, JSON.stringify(entry));
    }
    catch {
        return; // Storage full or blocked: the write still goes to Firestore, as before.
    }
    forgetOnceSent(box, key, written);
}
/**
 * A write's promise settles when the server has answered: taken (the note's work is done) or
 * refused (repeating it would be refused again; the caller's toast says so). Being in the local
 * cache is not enough, because that cache may be memory only.
 */
function forgetOnceSent(box, key, written) {
    const forget = () => box.storage.removeItem(key);
    written.then(forget, forget);
}
/** The notes stay for the next sign-in or open. */
function replayFailed(e) {
    console.warn("Couldn't repeat the writes saved before the app closed", e);
    return false;
}
async function replay(box, uid, recheck) {
    // One page at a time, so two pages opening together don't both repeat a note.
    const waiting = box.locks
        ? (await box.locks.request(REPLAY_LOCK + box.prefix, () => replayNow(box, uid)).catch(replayFailed))
        : await replayNow(box, uid).catch(replayFailed);
    if (waiting && recheck)
        setTimeout(() => void replay(box, uid, false), box.recheckMs);
}
/** Writes again every note left for `uid` by a page that is no longer open. True if some note had to wait (its page still open, or the server out of reach). */
async function replayNow(box, uid) {
    const live = await liveTabs(box.locks);
    let waiting = false;
    // Documents this replay has written: their pending writes are its own, not Firestore's queue's.
    const replayed = new Set();
    for (const { key, entry } of pendingEntries(box.storage, box.prefix)) {
        if (entry.uid !== uid || entry.tab === box.tab)
            continue;
        if (live?.has(entry.tab)) {
            waiting = true;
            continue;
        }
        let ops;
        let batch;
        try {
            ops = await stillNeeded(box.db, entry, replayed);
            if (!ops) {
                waiting = true;
                continue;
            }
            batch = fsWriteBatch(box.db);
            for (const op of ops)
                applyOp(batch, box.db, op);
        }
        catch (e) {
            // This Firestore has been shut down (the page is going): the note is for the next one.
            if (e.code === 'failed-precondition')
                return false;
            console.warn("Dropped a saved write that can't be repeated", e);
            box.storage.removeItem(key);
            continue;
        }
        if (box.auth.currentUser?.uid !== uid || box.closing === uid)
            return false;
        if (!ops.length) {
            box.storage.removeItem(key);
            continue;
        }
        // This page's now, with only the writes still needed, until the server has them.
        box.storage.setItem(key, JSON.stringify({ ...entry, tab: box.tab, ops }));
        const written = batch.commit();
        for (const op of ops)
            replayed.add(op.path);
        written.catch((e) => console.warn("Couldn't repeat a write saved before the app closed", e));
        forgetOnceSent(box, key, written);
    }
    return waiting;
}
/**
 * The note's writes that aren't done, queued or overtaken (`opsToRepeat`), judged one document at a
 * time against the freshest view of it this device can get:
 * - Firestore's own queue still holds a write to it (the persistent cache, kept across the reload):
 *   the local cache, which shows that queue, since the queue will send it anyway.
 * - Otherwise the server's copy, so a replay is judged against what other members wrote since and
 *   not a stale cache (or, with a memory cache, no cache at all). Out of reach (offline) or
 *   refused, the local cache, as before; an update to a document neither has seen waits (null).
 *   Offline with no copy at all, a set or delete is written unchecked, as Firestore's own queue
 *   would: a feed logged offline must still show after an offline reload.
 */
async function stillNeeded(db, entry, replayed = new Set()) {
    const keep = new Set();
    for (const path of new Set(entry.ops.map((op) => op.path))) {
        const ops = entry.ops.filter((op) => op.path === path);
        const view = await currentDoc(db, path, replayed, ops.some((op) => op.kind === 'update'));
        if (view === 'wait')
            return null;
        if (view === 'refused')
            continue;
        const data = view.snap?.exists() ? view.snap.data() : undefined;
        let cached = null;
        if (data) {
            try {
                cached = encode(data);
            }
            catch {
                cached = null;
            }
        }
        const updatedAt = typeof data?.updatedAt === 'number' ? data.updatedAt : undefined;
        for (const op of opsToRepeat(ops, { exists: !!data, data: cached, updatedAt, queued: view.queued }, entry.at))
            keep.add(op);
    }
    return entry.ops.filter((op) => keep.has(op));
}
/** See `stillNeeded`. `queued`: the cache shows writes in Firestore's own queue (not this replay's). */
async function currentDoc(db, path, replayed, hasUpdate) {
    const ref = doc(db, path);
    const cached = await getDocFromCache(ref).catch(() => null);
    if (replayed.has(path))
        return { snap: cached, queued: false };
    if (cached?.metadata.hasPendingWrites)
        return { snap: cached, queued: true };
    // Only the rules' refusal is final (a role lowered, someone removed: an update would be refused
    // too); anything else may pass.
    const asked = await getDocFromServer(ref).then((s) => s, (e) => (e.code === 'permission-denied' ? 'refused' : null));
    if (asked && asked !== 'refused')
        return { snap: asked, queued: false };
    if (cached)
        return { snap: cached, queued: false };
    if (!hasUpdate)
        return { snap: null, queued: false };
    return asked === 'refused' ? 'refused' : 'wait';
}
function applyOp(batch, db, op) {
    const ref = doc(db, op.path);
    if (op.kind === 'delete')
        batch.delete(ref);
    else if (op.kind === 'update')
        batch.update(ref, decode(op.data, db));
    else if (op.mergeFields)
        batch.set(ref, decode(op.data, db), { mergeFields: op.mergeFields });
    else if (op.merge)
        batch.set(ref, decode(op.data, db), { merge: true });
    else
        batch.set(ref, decode(op.data, db));
}
function setOp(ref, data, options) {
    const op = { kind: 'set', path: plainRef(ref), data: encode(data) };
    if (options && 'mergeFields' in options && options.mergeFields) {
        if (!options.mergeFields.every((f) => typeof f === 'string'))
            throw new Unencodable('mergeFields');
        op.mergeFields = options.mergeFields;
    }
    else if (options && 'merge' in options && options.merge)
        op.merge = true;
    return op;
}
/** A converter changes what is stored, and the note would skip it. */
function plainRef(ref) {
    if (ref.converter)
        throw new Unencodable('converter');
    return ref.path;
}
// Signing out --------------------------------------------------------------------------------------
/**
 * Signing someone out on a shared device: gives their unsent writes up to `timeoutMs` to reach the
 * server, removes their write notes, then runs `signOut`, making no new notes for them in between.
 * Only the kit's notes go: Firestore's own cache (with the persistent cache, the documents they
 * read and their still-queued writes) stays. If they are still signed in afterwards (no `signOut`,
 * or it failed), their writes are noted again. Returns how many notes were still unsent and are
 * gone; 0 on a Firestore that didn't come from `initFirestore`, or signed out.
 */
export async function forgetOutbox(db, { timeoutMs = 3_000, signOut } = {}) {
    const box = outboxes.get(db);
    const uid = box?.auth.currentUser?.uid;
    if (!box || !uid) {
        await signOut?.();
        return 0;
    }
    box.closing = uid;
    const started = Date.now();
    let left = 0;
    try {
        const deadline = Date.now() + timeoutMs;
        const until = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
        await Promise.race([waitForPendingWrites(db).catch(() => { }), until(timeoutMs)]);
        let swept = false;
        // While they are out, every note of theirs goes (also one another page made meanwhile). Once
        // they are back, only notes from before that sign-in; if they never left, none.
        const sweep = async () => {
            let cutoff = Infinity;
            if (box.closing !== uid) {
                if (box.signedInAt <= started)
                    return;
                cutoff = box.signedInAt;
            }
            for (const { key, entry } of pendingEntries(box.storage, box.prefix)) {
                if (entry.uid !== uid || entry.at >= cutoff)
                    continue;
                box.storage.removeItem(key);
                if (!swept)
                    left++;
            }
            swept = true;
        };
        // Also after a replay in flight in another page, which could write a note back: the sweep waits
        // for its lock, but the sign-out waits for it no longer than the deadline.
        const locked = box.locks?.request(REPLAY_LOCK + box.prefix, sweep).catch(sweep);
        if (locked)
            await Promise.race([locked, until(deadline - Date.now())]);
        if (!swept)
            await sweep();
        if (left)
            console.warn(`Signed out with ${left} write(s) not yet saved; they are discarded`);
        await signOut?.();
        // Notes another page made between the sweep and the sign-out.
        if (box.closing === uid)
            await sweep();
    }
    finally {
        if (box.auth.currentUser?.uid === uid)
            box.closing = null;
    }
    return left;
}
// Pages -------------------------------------------------------------------------------------------
function newTabId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function browserOnline(retry) {
    if (typeof addEventListener === 'function')
        addEventListener('online', retry);
}
function browserLocks() {
    return typeof navigator === 'undefined' ? null : (navigator.locks ?? null);
}
/** Pages open right now, or null when that can't be told (then every note is replayed). */
async function liveTabs(locks) {
    if (!locks)
        return null;
    try {
        const { held = [] } = await locks.query();
        return new Set(held.map((h) => h.name ?? '').filter((n) => n.startsWith(TAB_LOCK)).map((n) => n.slice(TAB_LOCK.length)));
    }
    catch {
        return null;
    }
}
