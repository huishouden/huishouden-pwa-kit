// Runs in its own `bun test` process (see package.json): agenda and reminders tests replace
// firebase/firestore with a stand-in for the whole process, and this one needs the real SDK.
import { afterEach, describe, expect, test } from 'bun:test';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteField as fsDeleteField,
  disableNetwork,
  enableNetwork,
  doc,
  GeoPoint,
  getDocFromCache,
  memoryLocalCache,
  terminate,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { collection, deleteDoc as rawDeleteDoc, setDoc as rawSetDoc, updateDoc as rawUpdateDoc } from 'firebase/firestore';
import {
  addDoc,
  arrayUnion,
  commitOps,
  deleteDoc,
  deleteField,
  forgetOutbox,
  increment,
  initFirestore,
  setDoc,
  updateDoc,
  writeBatch,
  type LockManagerLike,
} from '../../src/firestore';
import { decode, encode, hasTag, pendingEntries, shows, type OutboxEntry } from '../../src/outbox-codec';

class MemoryStorage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(k: string) { return this.items.get(k) ?? null; }
  setItem(k: string, v: string) { this.items.set(k, v); }
  removeItem(k: string) { this.items.delete(k); }
}

type Listener = (user: { uid: string } | null) => void;
function fakeAuth(uid: string | null) {
  const listeners: Listener[] = [];
  const auth = {
    currentUser: uid ? { uid } : null,
    onAuthStateChanged(cb: Listener) {
      listeners.push(cb);
      queueMicrotask(() => cb(auth.currentUser));
      return () => {};
    },
    signIn(next: string) {
      auth.currentUser = { uid: next };
      listeners.forEach((l) => l(auth.currentUser));
    },
    signOut() {
      auth.currentUser = null;
      listeners.forEach((l) => l(null));
    },
  };
  return auth;
}

const PREFIX = 'hh-outbox:demo-outbox:';
let open: { app: FirebaseApp; db: Firestore }[] = [];
let n = 0;

/** Web Locks with only the tab locks other pages hold; `release` lets one go. */
function fakeLocks(held: string[]): LockManagerLike & { release(tab: string): void } {
  const names = new Set(held.map((t) => `hh-outbox-tab:${t}`));
  return {
    request: async (name, cb) => (name.startsWith('hh-outbox-tab:') ? undefined : cb()),
    query: async () => ({ held: [...names].map((name) => ({ name })) }),
    release: (tab) => names.delete(`hh-outbox-tab:${tab}`),
  };
}

async function setup(uid: string | null, storage = new MemoryStorage(), locks: LockManagerLike | null = null, server?: string) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-outbox', appId: 'demo' }, `outbox-${n++}`);
  const auth = fakeAuth(uid);
  let online = () => {};
  const db = initFirestore(app, {
    auth: auth as never,
    storage,
    locks,
    recheckMs: 100,
    settings: { localCache: memoryLocalCache() },
    online: (retry) => (online = retry),
  });
  if (server) {
    const [host, port] = server.split(':');
    connectFirestoreEmulator(db, host, Number(port));
  } else await disableNetwork(db);
  open.push({ app, db });
  return { db, auth, storage, backOnline: () => online() };
}

afterEach(async () => {
  for (const { app, db } of open) {
    await terminate(db);
    await deleteApp(app);
  }
  open = [];
});

const settle = () => new Promise((r) => setTimeout(r, 50));
const entries = (s: MemoryStorage) => pendingEntries(s, PREFIX).map((e) => e.entry);
/** Notes a page that replayed them has taken on: kept until the server answers. */
const taken = (s: MemoryStorage) => entries(s).filter((e) => e.tab !== 'closed-page');
const leave = (s: MemoryStorage, entry: Partial<OutboxEntry> & Pick<OutboxEntry, 'ops'>, seq = 1) => {
  const full: OutboxEntry = { v: 1, uid: 'u1', tab: 'closed-page', at: Date.now() - 1000, ...entry };
  s.setItem(`${PREFIX}${String(seq).padStart(10, '0')}-0000-${full.tab}`, JSON.stringify(full));
};

describe('durable writes', () => {
  test('a write is noted before setDoc returns and kept while the server has not taken it', async () => {
    const { db, storage } = await setup('u1');
    const ref = doc(db, 'households/h/babyEvents/e1');
    void setDoc(ref, { kind: 'feed', at: 1 });
    expect(entries(storage)).toEqual([
      expect.objectContaining({ uid: 'u1', ops: [{ kind: 'set', path: 'households/h/babyEvents/e1', data: { kind: 'feed', at: 1 } }] }),
    ]);
    await settle();
    // In the local cache, but this one is memory (as when IndexedDB can't be opened): only the note
    // outlives the page.
    expect((await getDocFromCache(ref)).data()).toEqual({ kind: 'feed', at: 1 });
    expect(storage.length).toBe(1);
  });

  test('a feed logged offline and then reloaded is written by the next page, also with a memory cache', async () => {
    const storage = new MemoryStorage();
    const first = await setup('u1', storage);
    void setDoc(doc(first.db, 'households/h/babyEvents/e9'), { kind: 'feed', amountMl: 90 });
    await settle();
    // The reload: a new page, with nothing in its cache.
    const next = await setup('u1', storage);
    await settle();
    expect((await getDocFromCache(doc(next.db, 'households/h/babyEvents/e9'))).data()).toEqual({ kind: 'feed', amountMl: 90 });
  });

  test('a note left by a page that closed too soon is written again for the same person', async () => {
    const storage = new MemoryStorage();
    const left: OutboxEntry = {
      v: 1, uid: 'u1', tab: 'closed-page', at: Date.now() - 1000,
      ops: [
        { kind: 'set', path: 'households/h/babyEvents/e2', data: { kind: 'feed', amountMl: 120, at: { __hhOutbox: 'ts', s: 10, n: 0 } } },
        { kind: 'delete', path: 'households/h/babyEvents/old' },
      ],
    };
    storage.setItem(`${PREFIX}0000000001-0000-closed-page`, JSON.stringify(left));
    storage.setItem(`${PREFIX}0000000002-0000-closed-page`, JSON.stringify({ ...left, uid: 'someone-else' }));
    const { db } = await setup('u1', storage);
    await settle();
    const snap = await getDocFromCache(doc(db, 'households/h/babyEvents/e2'));
    expect(snap.data()).toEqual({ kind: 'feed', amountMl: 120, at: new Timestamp(10, 0) });
    // Someone else's note waits for them; this page now holds the repeated one until the server has it.
    expect(entries(storage).map((e) => [e.uid, e.tab === 'closed-page'])).toEqual([['u1', false], ['someone-else', true]]);
  });

  test('nothing is replayed until someone signs in', async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}0000000001-0000-gone`, JSON.stringify({ v: 1, uid: 'u2', tab: 'gone', at: Date.now(), ops: [{ kind: 'set', path: 'a/b', data: { x: 1 } }] }));
    const { db, auth } = await setup(null, storage);
    await settle();
    expect(entries(storage).map((e) => e.tab)).toEqual(['gone']);
    auth.signIn('u2');
    await settle();
    expect((await getDocFromCache(doc(db, 'a/b'))).data()).toEqual({ x: 1 });
    expect(entries(storage).map((e) => e.tab)).not.toContain('gone');
  });

  test("a still-open page's note is left to it, and replayed once that page has gone", async () => {
    const storage = new MemoryStorage();
    leave(storage, { tab: 'open-page', ops: [{ kind: 'set', path: 'c/live', data: { x: 1 } }] });
    const locks = fakeLocks(['open-page']);
    const { db } = await setup('u1', storage, locks);
    await settle();
    expect(entries(storage).map((e) => e.tab)).toEqual(['open-page']);
    locks.release('open-page');
    await new Promise((r) => setTimeout(r, 200));
    expect(entries(storage).map((e) => e.tab)).not.toContain('open-page');
    expect((await getDocFromCache(doc(db, 'c/live'))).data()).toEqual({ x: 1 });
  });

  test("a note is not replayed over a newer edit, and a week-old note is dropped", async () => {
    const storage = new MemoryStorage();
    const at = Date.now() - 60_000;
    leave(storage, { at, ops: [{ kind: 'set', path: 'c/edited', data: { v: 'old', updatedAt: at - 5 } }] }, 1);
    leave(storage, { at: Date.now() - 8 * 86_400_000, ops: [{ kind: 'set', path: 'c/ancient', data: { v: 1 } }] }, 2);
    const { db, auth } = await setup(null, storage);
    // Someone else's edit, newer than the note, already in this device's cache.
    void rawSetDoc(doc(db, 'c/edited'), { v: 'new', updatedAt: at + 1000 });
    await settle();
    auth.signIn('u1');
    await settle();
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, 'c/edited'))).data()).toEqual({ v: 'new', updatedAt: at + 1000 });
    await expect(getDocFromCache(doc(db, 'c/ancient'))).rejects.toThrow();
  });

  test('an old delete is not replayed over the same document written again since', async () => {
    const storage = new MemoryStorage();
    const at = Date.now() - 60_000;
    leave(storage, { at, ops: [{ kind: 'delete', path: 'c/again' }, { kind: 'delete', path: 'c/gone' }] });
    const { db, auth } = await setup(null, storage);
    void rawSetDoc(doc(db, 'c/again'), { v: 1, updatedAt: at + 1000 });
    void rawSetDoc(doc(db, 'c/gone'), { v: 1, updatedAt: at - 1000 });
    await settle();
    auth.signIn('u1');
    await settle();
    expect(taken(storage).map((e) => e.ops)).toEqual([[{ kind: 'delete', path: 'c/gone' }]]);
    expect((await getDocFromCache(doc(db, 'c/again'))).exists()).toBe(true);
    expect((await getDocFromCache(doc(db, 'c/gone'))).exists()).toBe(false);
  });

  test('a document the cache knows only as missing gets the set; an update to it is left out', async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'set', path: 'c/first', data: { v: 1 } }] }, 1);
    leave(storage, { ops: [{ kind: 'update', path: 'c/other', data: { v: 2 } }] }, 2);
    const { db, auth } = await setup(null, storage);
    void rawDeleteDoc(doc(db, 'c/first'));
    void rawDeleteDoc(doc(db, 'c/other'));
    await settle();
    expect((await getDocFromCache(doc(db, 'c/first'))).exists()).toBe(false);
    auth.signIn('u1');
    await settle();
    expect(entries(storage).map((e) => e.ops)).toEqual([[{ kind: 'set', path: 'c/first', data: { v: 1 } }]]);
    expect((await getDocFromCache(doc(db, 'c/first'))).data()).toEqual({ v: 1 });
    expect((await getDocFromCache(doc(db, 'c/other'))).exists()).toBe(false);
  });

  test('an update to a document this device has never read waits for the server to say it exists', async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'update', path: 'c/unread', data: { v: 2 } }] });
    await setup('u1', storage, null);
    await settle();
    // Offline: the note stays as it was, for the next open or the network coming back.
    expect(entries(storage)).toEqual([expect.objectContaining({ tab: 'closed-page', ops: [{ kind: 'update', path: 'c/unread', data: { v: 2 } }] })]);
  });

  test("an update or merge Firestore's own queue still holds is left to it, so an increment counts once", async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [
      { kind: 'update', path: 'c/count', data: { n: { __hhOutbox: 'increment', v: 1 } } },
      { kind: 'set', path: 'c/count', data: { seen: true }, merge: true },
    ] });
    const { db, auth } = await setup(null, storage);
    // The reload with the persistent cache: the queued writes come back with the page.
    void rawSetDoc(doc(db, 'c/count'), { n: 1 });
    void rawUpdateDoc(doc(db, 'c/count'), { n: increment(1), seen: true });
    await settle();
    auth.signIn('u1');
    await settle();
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, 'c/count'))).data()).toEqual({ n: 2, seen: true });
  });

  test("an update to a document with another write queued is still written: the queue holds that one, not this", async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'update', path: 'c/two', data: { b: 2, 'm.x': 1 } }] });
    const { db, auth } = await setup(null, storage);
    void rawSetDoc(doc(db, 'c/two'), { a: 0, m: { y: 1 } });
    void rawUpdateDoc(doc(db, 'c/two'), { a: 1 });
    await settle();
    auth.signIn('u1');
    await settle();
    expect((await getDocFromCache(doc(db, 'c/two'))).data()).toEqual({ a: 1, b: 2, m: { x: 1, y: 1 } });
  });

  test('an update or merge whose fields the cache already shows is not written again', async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [
      { kind: 'update', path: 'c/same', data: { 'm.x': 1, gone: { __hhOutbox: 'deleteField' } } },
      { kind: 'set', path: 'c/same', data: { m: { y: 2 } }, merge: true },
    ] });
    const { db, auth } = await setup(null, storage);
    void rawSetDoc(doc(db, 'c/same'), { m: { x: 1, y: 2 } });
    await settle();
    auth.signIn('u1');
    await settle();
    expect(storage.length).toBe(0);
  });

  test("signing out gives the person's writes a moment, then removes their notes and no one else's", async () => {
    const storage = new MemoryStorage();
    leave(storage, { uid: 'u2', ops: [{ kind: 'set', path: 'c/theirs', data: { v: 1 } }] });
    const { db, auth } = await setup('u1', storage, fakeLocks(['closed-page']));
    void setDoc(doc(db, 'c/mine'), { dose: 'paracetamol' });
    expect(entries(storage).map((e) => e.uid).sort()).toEqual(['u1', 'u2']);
    const signOut = async () => {
      // A write made before the sign-out completes leaves no note behind either.
      void setDoc(doc(db, 'c/late'), { dose: 'ibuprofen' });
      auth.signOut();
    };
    expect(await forgetOutbox(db, { timeoutMs: 50, signOut })).toBe(1);
    expect(entries(storage).map((e) => e.uid)).toEqual(['u2']);
  });

  test('after a sign-out, the next sign-in notes writes again; an abandoned sign-out keeps noting', async () => {
    const { db, auth, storage } = await setup('u1');
    await forgetOutbox(db, { timeoutMs: 10 });
    void setDoc(doc(db, 'c/still'), { v: 1 });
    expect(entries(storage).map((e) => e.ops[0].path)).toEqual(['c/still']);
    await forgetOutbox(db, { timeoutMs: 10, signOut: async () => auth.signOut() });
    expect(storage.length).toBe(0);
    auth.signIn('u1');
    void setDoc(doc(db, 'c/again'), { v: 1 });
    expect(entries(storage).map((e) => e.ops[0].path)).toEqual(['c/again']);
  });

  test('a set and an increment both still queued (persistent cache) and both replayed in order end where they should', async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'set', path: 'c/both', data: { n: 1 } }] }, 1);
    leave(storage, { ops: [{ kind: 'update', path: 'c/both', data: { n: { __hhOutbox: 'increment', v: 1 } } }] }, 2);
    const { db, auth } = await setup(null, storage);
    void rawSetDoc(doc(db, 'c/both'), { n: 1 });
    void rawUpdateDoc(doc(db, 'c/both'), { n: increment(1) });
    await settle();
    auth.signIn('u1');
    await settle();
    // Queue: set 1, +1; replay: set 1, +1. The server ends at 2, as one set and one increment would.
    expect((await getDocFromCache(doc(db, 'c/both'))).data()).toEqual({ n: 2 });
  });

  test("a note another page's replay writes back after the sign-out deadline is swept when it lets go", async () => {
    const storage = new MemoryStorage();
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const locks: LockManagerLike = {
      request: async (name, cb) => (name.startsWith('hh-outbox-replay:') ? held.then(cb) : undefined),
      query: async () => ({ held: [] }),
    };
    const { db, auth } = await setup('u1', storage, locks);
    await forgetOutbox(db, { timeoutMs: 20, signOut: async () => auth.signOut() });
    leave(storage, { tab: 'other-page', ops: [{ kind: 'set', path: 'c/dose', data: { v: 1 } }] });
    release();
    await settle();
    expect(storage.length).toBe(0);
  });

  test('a note another page makes while the sign-out is under way is swept too', async () => {
    const storage = new MemoryStorage();
    const { db, auth } = await setup('u1', storage);
    const signOut = async () => {
      leave(storage, { tab: 'second-tab', at: Date.now(), ops: [{ kind: 'set', path: 'c/bill', data: { paid: true } }] });
      auth.signOut();
    };
    await forgetOutbox(db, { timeoutMs: 10, signOut });
    expect(storage.length).toBe(0);
  });

  test('the late sweep leaves notes from the next sign-in alone', async () => {
    const storage = new MemoryStorage();
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const locks: LockManagerLike = {
      request: async (name, cb) => (name.startsWith('hh-outbox-replay:') ? held.then(cb) : undefined),
      query: async () => ({ held: [] }),
    };
    const { db, auth } = await setup('u1', storage, locks);
    await forgetOutbox(db, { timeoutMs: 20, signOut: async () => auth.signOut() });
    await new Promise((r) => setTimeout(r, 5));
    auth.signIn('u1');
    void setDoc(doc(db, 'c/next'), { v: 1 });
    release();
    await settle();
    expect(entries(storage).map((e) => e.ops[0].path)).toEqual(['c/next']);
  });

  test('two notes on one document replayed with a memory cache: the increment after the set still counts', async () => {
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'set', path: 'c/tally', data: { n: 1 } }] }, 1);
    leave(storage, { ops: [{ kind: 'update', path: 'c/tally', data: { n: { __hhOutbox: 'increment', v: 2 } } }] }, 2);
    const { db } = await setup('u1', storage);
    await settle();
    expect((await getDocFromCache(doc(db, 'c/tally'))).data()).toEqual({ n: 3 });
  });

  test('signed out, writes go to Firestore without a note', async () => {
    const { db, storage } = await setup(null);
    void setDoc(doc(db, 'a/b'), { x: 1 });
    expect(storage.length).toBe(0);
  });

  test('a batch is one note; update, delete and addDoc are noted', async () => {
    const { db, storage } = await setup('u1');
    void setDoc(doc(db, 'c/one'), { n: 1 });
    const b = writeBatch(db);
    b.set(doc(db, 'c/x'), { a: 1 }, { merge: true }).update(doc(db, 'c/one'), { n: increment(1), tags: arrayUnion('t') }).delete(doc(db, 'c/y'));
    void b.commit();
    void updateDoc(doc(db, 'c/one'), { gone: deleteField() });
    void deleteDoc(doc(db, 'c/z'));
    void addDoc(collection(db, 'c'), { added: true });
    const ops = entries(storage).map((e) => e.ops);
    expect(ops).toHaveLength(5);
    expect(ops[1]).toEqual([
      { kind: 'set', path: 'c/x', data: { a: 1 }, merge: true },
      { kind: 'update', path: 'c/one', data: { n: { __hhOutbox: 'increment', v: 1 }, tags: { __hhOutbox: 'arrayUnion', v: ['t'] } } },
      { kind: 'delete', path: 'c/y' },
    ]);
    expect(ops[2]).toEqual([{ kind: 'update', path: 'c/one', data: { gone: { __hhOutbox: 'deleteField' } } }]);
    expect(ops[4][0]).toMatchObject({ kind: 'set', data: { added: true } });
    await settle();
    expect(storage.length).toBe(5);
  });

  test("a value with no JSON form is written without a note", async () => {
    const { db, storage } = await setup('u1');
    void setDoc(doc(db, 'c/nan'), { x: NaN });
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, 'c/nan'))).data()?.x).toBeNaN();
  });
});

// With a Firestore emulator that has no rules (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080): what the
// server's answer does to a note.
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
describe.skipIf(!emulator)('with the server', () => {
  const run = Date.now().toString(36);

  test('a note is forgotten once the server has the write', async () => {
    const { db, storage } = await setup('u1', new MemoryStorage(), null, emulator);
    const written = setDoc(doc(db, `runs/${run}/babyEvents/e1`), { kind: 'feed' });
    expect(storage.length).toBe(1);
    await written;
    expect(storage.length).toBe(0);
  });

  test("a write the server refuses is forgotten too: repeating it can't succeed", async () => {
    const { db, storage } = await setup('u1', new MemoryStorage(), null, emulator);
    const written = updateDoc(doc(db, `runs/${run}/c/missing`), { v: 1 });
    expect(storage.length).toBe(1);
    await expect(written).rejects.toThrow();
    expect(storage.length).toBe(0);
  });

  test('an update to a document this device has never read waits offline, and is written when the network is back', async () => {
    const path = `runs/${run}/c/unread`;
    const first = await setup('u1', new MemoryStorage(), null, emulator);
    await setDoc(doc(first.db, path), { v: 1, keep: true });
    const storage = new MemoryStorage();
    leave(storage, { ops: [{ kind: 'update', path, data: { v: 2 } }] });
    const next = await setup(null, storage, null, emulator);
    await disableNetwork(next.db);
    next.auth.signIn('u1');
    await settle();
    expect(entries(storage).map((e) => e.tab)).toEqual(['closed-page']);
    await enableNetwork(next.db);
    next.backOnline();
    for (let i = 0; i < 40 && storage.length; i++) await settle();
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(next.db, path))).data()).toEqual({ v: 2, keep: true });
  });
});

// With rules that refuse reads under `denied/` (FIRESTORE_EMULATOR_REFUSES_DENIED=1).
describe.skipIf(!emulator || !process.env.FIRESTORE_EMULATOR_REFUSES_DENIED)('with rules that refuse the read', () => {
  test("an update to a document the rules won't let this person read is left out, and the rest of the note written", async () => {
    const run = Date.now().toString(36);
    const storage = new MemoryStorage();
    leave(storage, { ops: [
      { kind: 'update', path: `runs/${run}/denied/x`, data: { v: 2 } },
      { kind: 'set', path: `runs/${run}/c/kept`, data: { v: 1 } },
    ] });
    const { db } = await setup('u1', storage, null, emulator);
    for (let i = 0; i < 40 && storage.length; i++) await settle();
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, `runs/${run}/c/kept`))).data()).toEqual({ v: 1 });
  });
});

describe('encode and decode', () => {
  test('Firestore values round-trip', () => {
    const value = { s: 'x', n: 1.5, b: false, nil: null, list: [1, { t: new Timestamp(5, 6) }], geo: new GeoPoint(1, 2), skip: undefined };
    const json = encode(value);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json as object);
    expect(decode(json)).toEqual({ s: 'x', n: 1.5, b: false, nil: null, list: [1, { t: new Timestamp(5, 6) }], geo: new GeoPoint(1, 2) });
  });
  test("Firestore's own deleteField is recognised", () => {
    expect(encode({ f: fsDeleteField() })).toEqual({ f: { __hhOutbox: 'deleteField' } });
  });
  test('a Date is stored as the Timestamp Firestore would store', () => {
    expect(decode(encode(new Date(1500)))).toEqual(new Timestamp(1, 500_000_000));
  });
});

describe('commitOps', () => {
  test('writes ./store ops as one noted batch: sets, merges and deletes under the base path', async () => {
    const { db, storage } = await setup('u1');
    void rawSetDoc(doc(db, 'households/h/carVehicles/v1'), { name: 'Van', notes: 'keep' }).catch(() => {});
    await settle();
    const done = commitOps(
      db,
      'households/h',
      [
        { col: 'vehicles', id: 'v2', data: { name: 'Hatchback' } },
        { col: 'vehicles', id: 'v1', data: { name: 'Family van' }, merge: true },
        { col: 'visits', id: 'gone', data: null },
      ],
      (col) => (col === 'vehicles' ? 'carVehicles' : 'carServiceLog'),
    );
    void done.catch(() => {});
    expect(entries(storage)[0].ops.map((o) => `${o.kind} ${o.path}`)).toEqual([
      'set households/h/carVehicles/v2',
      'set households/h/carVehicles/v1',
      'delete households/h/carServiceLog/gone',
    ]);
    await settle();
    expect((await getDocFromCache(doc(db, 'households/h/carVehicles/v1'))).data()).toEqual({ name: 'Family van', notes: 'keep' });
    expect((await getDocFromCache(doc(db, 'households/h/carVehicles/v2'))).data()).toEqual({ name: 'Hatchback' });
  });
});

describe('shows', () => {
  test('dotted update paths, merged maps, deleteField as absent, value tags by value', () => {
    const cached = { a: 1, m: { x: 1, y: 2 }, t: { __hhOutbox: 'ts', s: 1, n: 0 } };
    expect(shows(cached, { 'm.x': 1, a: 1 }, true)).toBe(true);
    expect(shows(cached, { m: { x: 1 } }, true)).toBe(false); // an update's map replaces
    expect(shows(cached, { m: { x: 1 } }, false)).toBe(true); // a merge's map merges
    expect(shows(cached, { gone: { __hhOutbox: 'deleteField' } }, true)).toBe(true);
    expect(shows(cached, { a: { __hhOutbox: 'deleteField' } }, true)).toBe(false);
    expect(shows(cached, { t: { __hhOutbox: 'ts', s: 1, n: 0 } }, false)).toBe(true);
    expect(shows(cached, { a: { __hhOutbox: 'increment', v: 0 } }, true)).toBe(false);
    expect(shows(cached, { b: 2 }, false)).toBe(false);
  });
  test('hasTag finds a sentinel anywhere', () => {
    expect(hasTag({ a: [{ b: { __hhOutbox: 'increment', v: 1 } }] }, 'increment')).toBe(true);
    expect(hasTag({ a: 1 }, 'increment')).toBe(false);
  });
});
