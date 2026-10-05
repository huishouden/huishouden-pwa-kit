import { describe, expect, test } from 'bun:test';
import type { Firestore } from 'firebase/firestore';
import { alreadyPublished, fingerprint, FRESH_MS, forgetPublishedApp, publishedKey, rememberPublished, setPublishedStorage } from '../src/published';

const memory = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const db = { app: { options: { projectId: 'demo' }, name: '[DEFAULT]' } } as unknown as Firestore;

describe('fingerprint', () => {
  test('ignores order, key order and the fields every run changes', () => {
    const a = fingerprint([['x', { title: 'A', start: 1, updatedAt: 5, by: 'a@example.com' }], ['y', { title: 'B', start: 2 }]]);
    const b = fingerprint([['y', { start: 2, title: 'B' }], ['x', { start: 1, title: 'A', updatedAt: 9, by: 'b@example.com' }]]);
    expect(a).toBe(b);
  });

  test('any real change, or the extra, gives another print', () => {
    const base = fingerprint([['x', { title: 'A', texts: { nl: { title: 'A' } } }]]);
    expect(fingerprint([['x', { title: 'A', texts: { nl: { title: 'B' } } }]])).not.toBe(base);
    expect(fingerprint([['x', { title: 'A', texts: { nl: { title: 'A' } } }]], 'true')).not.toBe(base);
    expect(fingerprint([])).not.toBe(fingerprint([['x', {}]]));
  });
});

describe('the note', () => {
  test('stands for FRESH_MS, for the same print only', () => {
    const store = memory();
    setPublishedStorage(store);
    try {
      const key = publishedKey(db, 'h1', 'agenda', 'pet', 'Alex@Example.com');
      expect(key).toBe('hh-published:demo:h1:agenda:pet:alex@example.com');
      expect(alreadyPublished(key, 'p1', 1000)).toBe(false);
      rememberPublished(key, 'p1', 1000);
      expect(alreadyPublished(key, 'p1', 1000 + FRESH_MS - 1)).toBe(true);
      expect(alreadyPublished(key, 'p2', 2000)).toBe(false);
      expect(alreadyPublished(key, 'p1', 1000 + FRESH_MS)).toBe(false);
      // A clock set back doesn't stretch it.
      expect(alreadyPublished(key, 'p1', 999)).toBe(false);
    } finally {
      setPublishedStorage(undefined);
    }
  });

  test("a per-record write forgets every member's note for that app and list only", () => {
    const store = memory();
    setPublishedStorage(store);
    try {
      rememberPublished(publishedKey(db, 'h1', 'agenda', 'pet', 'a@example.com'), 'p', 1);
      rememberPublished(publishedKey(db, 'h1', 'agenda', 'pet', 'b@example.com'), 'p', 1);
      rememberPublished(publishedKey(db, 'h1', 'agenda', 'petx', 'a@example.com'), 'p', 1);
      rememberPublished(publishedKey(db, 'h1', 'todos', 'pet', 'a@example.com'), 'p', 1);
      forgetPublishedApp(db, 'h1', 'agenda', 'pet');
      expect([...store.m.keys()].sort()).toEqual(['hh-published:demo:h1:agenda:petx:a@example.com', 'hh-published:demo:h1:todos:pet:a@example.com']);
    } finally {
      setPublishedStorage(undefined);
    }
  });

  test('no storage, or a broken one, means always syncing', () => {
    setPublishedStorage(null);
    try {
      rememberPublished('k', 'p', 1);
      expect(alreadyPublished('k', 'p', 2)).toBe(false);
    } finally {
      setPublishedStorage(undefined);
    }
    setPublishedStorage({ getItem: () => '{not json', setItem: () => { throw new Error('full'); }, removeItem: () => {} });
    try {
      expect(alreadyPublished('k', 'p', 2)).toBe(false);
      expect(() => rememberPublished('k', 'p', 1)).not.toThrow();
    } finally {
      setPublishedStorage(undefined);
    }
  });
});
