import { describe, expect, test } from 'bun:test';
import type { Op } from '../src/outbox-codec';
import { opsToRepeat, type DocState } from '../src/outbox-plan';

const P = 'households/h/spendingSettings/main';
const AT = 1_000_000;
const there = (data: DocState['data'], more: Partial<DocState> = {}): DocState => ({ exists: true, data, queued: false, ...more });
const missing: DocState = { exists: false, data: null, queued: false };
const inc = (v: number) => ({ __hhOutbox: 'increment', v });

describe('opsToRepeat', () => {
  test("a document changed at or after the note keeps the newer change: nothing is repeated", () => {
    const ops: Op[] = [{ kind: 'set', path: P, data: { budget: 2000 }, merge: true }];
    expect(opsToRepeat(ops, there({ budget: 2750, updatedAt: AT }, { updatedAt: AT }), AT)).toEqual([]);
    expect(opsToRepeat(ops, there({ budget: 2750, updatedAt: AT + 5 }, { updatedAt: AT + 5 }), AT)).toEqual([]);
    expect(opsToRepeat(ops, there({ budget: 1500, updatedAt: AT - 5 }, { updatedAt: AT - 5 }), AT)).toEqual(ops);
  });

  test('an earlier write whose fields a later one sets again is not repeated over it', () => {
    const ops: Op[] = [
      { kind: 'set', path: P, data: { budget: 2000, words: ['rent'] }, merge: true },
      { kind: 'set', path: P, data: { budget: 2750 }, merge: true },
    ];
    expect(opsToRepeat(ops, there({ budget: 2750, words: ['rent'] }), AT)).toEqual([]);
    // The earlier write's own field not there: both, in order, so the document ends at 2750.
    expect(opsToRepeat(ops, there({ budget: 2750 }), AT)).toEqual(ops);
    // Only the later one not there: just that one.
    expect(opsToRepeat(ops, there({ budget: 2000, words: ['rent'] }), AT)).toEqual([ops[1]]);
  });

  test('a later delete or full set makes every earlier write unneeded', () => {
    const del: Op[] = [{ kind: 'set', path: P, data: { budget: 1 }, merge: true }, { kind: 'delete', path: P }];
    expect(opsToRepeat(del, there({ budget: 5 }), AT)).toEqual([del[1]]);
    expect(opsToRepeat(del, missing, AT)).toEqual([]);
    const set: Op[] = [{ kind: 'update', path: P, data: { budget: 1 } }, { kind: 'set', path: P, data: { budget: 2 } }];
    expect(opsToRepeat(set, there({ budget: 2 }), AT)).toEqual([]);
    expect(opsToRepeat(set, there({ budget: 3 }), AT)).toEqual([set[1]]);
  });

  test("a later merge's map merges into an earlier one's, so the earlier fields are still judged", () => {
    const ops: Op[] = [
      { kind: 'set', path: P, data: { m: { x: 1 } }, merge: true },
      { kind: 'set', path: P, data: { m: { y: 2 } }, merge: true },
    ];
    expect(opsToRepeat(ops, there({ m: { x: 1, y: 2 } }), AT)).toEqual([]);
    expect(opsToRepeat(ops, there({ m: { y: 2 } }), AT)).toEqual(ops);
  });

  test('a missing document gets an update only after a set in the note creates it', () => {
    const ops: Op[] = [
      { kind: 'update', path: P, data: { a: 1 } },
      { kind: 'set', path: P, data: { b: 1 }, merge: true },
      { kind: 'update', path: P, data: { c: 1 } },
    ];
    expect(opsToRepeat(ops, missing, AT)).toEqual([ops[1], ops[2]]);
    expect(opsToRepeat([ops[0]], missing, AT)).toEqual([]);
    expect(opsToRepeat([{ kind: 'delete', path: P }], missing, AT)).toEqual([]);
  });

  test("an increment Firestore's queue holds is left to it, also among other writes", () => {
    const ops: Op[] = [
      { kind: 'set', path: P, data: { label: 'b' }, merge: true },
      { kind: 'update', path: P, data: { n: inc(1) } },
    ];
    expect(opsToRepeat(ops, there({ label: 'a', n: 3 }, { queued: true }), AT)).toEqual([ops[0]]);
    expect(opsToRepeat(ops, there({ label: 'b', n: 3 }, { queued: true }), AT)).toEqual([]);
    // Not queued: the increment can't be told from the result, so it is repeated.
    expect(opsToRepeat(ops, there({ label: 'b', n: 3 }), AT)).toEqual([ops[1]]);
  });

  test('a full set is judged on the whole document; a document with no JSON form gets every write', () => {
    const ops: Op[] = [{ kind: 'set', path: P, data: { a: 1 } }];
    expect(opsToRepeat(ops, there({ a: 1 }), AT)).toEqual([]);
    expect(opsToRepeat(ops, there({ a: 1, b: 2 }), AT)).toEqual(ops);
    expect(opsToRepeat(ops, there(null), AT)).toEqual(ops);
  });
});
