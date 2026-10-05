import { describe, expect, test } from 'bun:test';
import type { Firestore } from 'firebase/firestore';
import { alreadyPublished, fingerprint, FRESH_MS, forgetPublished, publishedKey, rememberPublished, unlessPublished } from '../src/published';
import { memoryNotes } from './published-notes';

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
    const store = memoryNotes();
    const key = publishedKey(db, 'h1', 'agenda', 'pet', 'Alex@Example.com');
    expect(key).toBe('hh-published:demo:h1:agenda:pet:alex@example.com');
    expect(alreadyPublished(store, key, 'p1', 1000)).toBe(false);
    rememberPublished(store, key, 'p1', 1000);
    expect(alreadyPublished(store, key, 'p1', 1000 + FRESH_MS - 1)).toBe(true);
    expect(alreadyPublished(store, key, 'p2', 2000)).toBe(false);
    expect(alreadyPublished(store, key, 'p1', 1000 + FRESH_MS)).toBe(false);
    // A clock set back doesn't stretch it.
    expect(alreadyPublished(store, key, 'p1', 999)).toBe(false);
  });

  test('unlessPublished runs, then notes; the same print skips; a failed run leaves no note', async () => {
    const store = memoryNotes();
    let runs = 0;
    const run = async () => ++runs;
    expect(await unlessPublished(store, 'k', 'p', 1, () => -1, run)).toBe(1);
    expect(await unlessPublished(store, 'k', 'p', 2, () => -1, run)).toBe(-1);
    expect(await unlessPublished(store, 'k', 'q', 3, () => -1, run)).toBe(2);
    await expect(unlessPublished(store, 'k2', 'p', 4, () => -1, async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(alreadyPublished(store, 'k2', 'p', 5)).toBe(false);
  });

  test("a per-record write forgets every member's note for that app and list, or the whole list", () => {
    const store = memoryNotes();
    rememberPublished(store, publishedKey(db, 'h1', 'agenda', 'pet', 'a@example.com'), 'p', 1);
    rememberPublished(store, publishedKey(db, 'h1', 'agenda', 'pet', 'b@example.com'), 'p', 1);
    rememberPublished(store, publishedKey(db, 'h1', 'agenda', 'petx', 'a@example.com'), 'p', 1);
    rememberPublished(store, publishedKey(db, 'h1', 'todos', 'pet', 'a@example.com'), 'p', 1);
    forgetPublished(store, db, 'h1', 'agenda', 'pet');
    expect([...store.m.keys()].sort()).toEqual(['hh-published:demo:h1:agenda:petx:a@example.com', 'hh-published:demo:h1:todos:pet:a@example.com']);
    forgetPublished(store, db, 'h1', 'agenda');
    expect([...store.m.keys()]).toEqual(['hh-published:demo:h1:todos:pet:a@example.com']);
  });

  test('no storage, or a broken one, means always syncing', () => {
    rememberPublished(null, 'k', 'p', 1);
    expect(alreadyPublished(null, 'k', 'p', 2)).toBe(false);
    const broken = { ...memoryNotes(), getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
    expect(alreadyPublished(broken, 'k', 'p', 2)).toBe(false);
    expect(() => rememberPublished(broken, 'k', 'p', 1)).not.toThrow();
  });
});
