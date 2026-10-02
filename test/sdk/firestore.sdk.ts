// Runs in its own `bun test` process (see package.json): agenda and reminders tests replace
// firebase/firestore with a stand-in for the whole process, and this one needs the real SDK.
import { afterEach, describe, expect, test } from 'bun:test';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  deleteField as fsDeleteField,
  disableNetwork,
  doc,
  GeoPoint,
  getDocFromCache,
  memoryLocalCache,
  terminate,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { collection, deleteDoc as rawDeleteDoc, setDoc as rawSetDoc } from 'firebase/firestore';
import {
  addDoc,
  arrayUnion,
  deleteDoc,
  deleteField,
  increment,
  initFirestore,
  setDoc,
  updateDoc,
  writeBatch,
  type LockManagerLike,
} from '../../src/firestore';
import { decode, encode, pendingEntries, type OutboxEntry } from '../../src/outbox-codec';

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

async function setup(uid: string | null, storage = new MemoryStorage(), locks: LockManagerLike | null = null) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-outbox', appId: 'demo' }, `outbox-${n++}`);
  const auth = fakeAuth(uid);
  const db = initFirestore(app, { auth: auth as never, storage, locks, recheckMs: 100, settings: { localCache: memoryLocalCache() } });
  await disableNetwork(db);
  open.push({ app, db });
  return { db, auth, storage };
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
const leave = (s: MemoryStorage, entry: Partial<OutboxEntry> & Pick<OutboxEntry, 'ops'>, seq = 1) => {
  const full: OutboxEntry = { v: 1, uid: 'u1', tab: 'closed-page', at: Date.now() - 1000, ...entry };
  s.setItem(`${PREFIX}${String(seq).padStart(10, '0')}-0000-${full.tab}`, JSON.stringify(full));
};

describe('durable writes', () => {
  test('a write is noted before setDoc returns and forgotten once Firestore has it locally', async () => {
    const { db, storage } = await setup('u1');
    const ref = doc(db, 'households/h/babyEvents/e1');
    void setDoc(ref, { kind: 'feed', at: 1 });
    expect(entries(storage)).toEqual([
      expect.objectContaining({ uid: 'u1', ops: [{ kind: 'set', path: 'households/h/babyEvents/e1', data: { kind: 'feed', at: 1 } }] }),
    ]);
    await settle();
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(ref)).data()).toEqual({ kind: 'feed', at: 1 });
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
    // Someone else's note waits for them.
    expect(entries(storage).map((e) => e.uid)).toEqual(['someone-else']);
  });

  test('nothing is replayed until someone signs in', async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}0000000001-0000-gone`, JSON.stringify({ v: 1, uid: 'u2', tab: 'gone', at: Date.now(), ops: [{ kind: 'set', path: 'a/b', data: { x: 1 } }] }));
    const { auth } = await setup(null, storage);
    await settle();
    expect(storage.length).toBe(1);
    auth.signIn('u2');
    await settle();
    expect(storage.length).toBe(0);
  });

  test("a still-open page's note is left to it, and replayed once that page has gone", async () => {
    const storage = new MemoryStorage();
    leave(storage, { tab: 'open-page', ops: [{ kind: 'set', path: 'c/live', data: { x: 1 } }] });
    const locks = fakeLocks(['open-page']);
    const { db } = await setup('u1', storage, locks);
    await settle();
    expect(storage.length).toBe(1);
    locks.release('open-page');
    await new Promise((r) => setTimeout(r, 200));
    expect(storage.length).toBe(0);
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
    expect(storage.length).toBe(0);
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
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, 'c/first'))).data()).toEqual({ v: 1 });
    expect((await getDocFromCache(doc(db, 'c/other'))).exists()).toBe(false);
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
    expect(storage.length).toBe(0);
  });

  test("a value with no JSON form is written without a note", async () => {
    const { db, storage } = await setup('u1');
    void setDoc(doc(db, 'c/nan'), { x: NaN });
    expect(storage.length).toBe(0);
    expect((await getDocFromCache(doc(db, 'c/nan'))).data()?.x).toBeNaN();
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
