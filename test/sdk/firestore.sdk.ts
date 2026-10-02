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
import {
  addDoc,
  arrayUnion,
  decode,
  deleteDoc,
  deleteField,
  encode,
  increment,
  initFirestore,
  pendingEntries,
  setDoc,
  updateDoc,
  writeBatch,
  type OutboxEntry,
} from '../../src/firestore';
import { collection } from 'firebase/firestore';

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

async function setup(uid: string | null, storage = new MemoryStorage()) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-outbox', appId: 'demo' }, `outbox-${n++}`);
  const auth = fakeAuth(uid);
  const db = initFirestore(app, { auth: auth as never, storage, settings: { localCache: memoryLocalCache() } });
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
      v: 1, uid: 'u1', tab: 'closed-page', at: 1,
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
    storage.setItem(`${PREFIX}0000000001-0000-gone`, JSON.stringify({ v: 1, uid: 'u2', tab: 'gone', at: 1, ops: [{ kind: 'set', path: 'a/b', data: { x: 1 } }] }));
    const { auth } = await setup(null, storage);
    await settle();
    expect(storage.length).toBe(1);
    auth.signIn('u2');
    await settle();
    expect(storage.length).toBe(0);
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
