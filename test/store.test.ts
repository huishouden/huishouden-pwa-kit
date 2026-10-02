import { describe, expect, test } from 'bun:test';
import { applyOps, changes, inverseOps, localIds, memoryStore, stampFor, upsert, withoutId, type Backend, type Op } from '../src/store';

interface Data {
  cars: { id: string; name: string }[];
  visits: { id: string; carId: string; what: string }[];
  settings: { unit: string } | null;
}
const data = (): Data => ({ cars: [{ id: 'c1', name: 'Hatchback' }], visits: [{ id: 'v1', carId: 'c1', what: 'Oil change' }], settings: null });

describe('applyOps', () => {
  test('sets replace by id, deletes remove, other lists stay the same objects', () => {
    const before = data();
    const after = applyOps(before, [
      { col: 'cars', id: 'c1', data: { name: 'Estate' } },
      { col: 'cars', id: 'c2', data: { name: 'Van' } },
    ]);
    expect(after.cars).toEqual([
      { id: 'c1', name: 'Estate' },
      { id: 'c2', name: 'Van' },
    ]);
    expect(after.visits).toBe(before.visits);
    expect(before.cars).toEqual([{ id: 'c1', name: 'Hatchback' }]);
    expect(applyOps(before, [{ col: 'visits', id: 'v1', data: null }]).visits).toEqual([]);
  });

  test('maps list names to data keys', () => {
    const after = applyOps(data(), [{ col: 'carVisits', id: 'v2', data: { carId: 'c1', what: 'Tyres' } }], (col) => (col === 'carVisits' ? 'visits' : 'cars'));
    expect(after.visits.map((v) => v.id)).toEqual(['v1', 'v2']);
  });

  test('the last op on a document wins', () => {
    const after = applyOps(data(), [
      { col: 'cars', id: 'c1', data: { name: 'A' } },
      { col: 'cars', id: 'c1', data: null },
    ]);
    expect(after.cars).toEqual([]);
  });
});

describe('changes and inverseOps', () => {
  test('undo writes back each touched document as it was, removing new ones', () => {
    let current = data();
    const writes: Op[][] = [];
    const backend: Backend = {
      newId: () => 'new',
      write: (ops) => {
        writes.push(ops);
        current = applyOps(current, ops);
      },
    };
    const find = (col: string, id: string) => (current[col as 'cars' | 'visits'] as { id: string }[]).find((x) => x.id === id);
    const change = changes(backend, find);
    const original = data();
    const undo = change([
      { col: 'cars', id: 'c1', data: { name: 'Estate' } },
      { col: 'cars', id: 'c1', data: { name: 'Estate 2' } },
      { col: 'visits', id: 'v1', data: null },
      { col: 'visits', id: 'v2', data: { carId: 'c1', what: 'Tyres' } },
    ]);
    expect(current.cars).toEqual([{ id: 'c1', name: 'Estate 2' }]);
    undo();
    expect(writes[1]).toEqual([
      { col: 'visits', id: 'v2', data: null },
      { col: 'visits', id: 'v1', data: { carId: 'c1', what: 'Oil change' } },
      { col: 'cars', id: 'c1', data: { name: 'Hatchback' } },
    ]);
    expect(current.cars).toEqual(original.cars);
    expect(current.visits).toEqual(original.visits);
  });

  test('inverseOps names each document once', () => {
    const inverse = inverseOps(
      [
        { col: 'a', id: '1', data: {} },
        { col: 'a', id: '1', data: null },
      ],
      () => undefined,
    );
    expect(inverse).toEqual([{ col: 'a', id: '1', data: null }]);
  });
});

describe('memoryStore', () => {
  test('applies writes at once and reports each version', () => {
    const seen: Data[] = [];
    const store = memoryStore<Data>(data(), (d) => seen.push(d));
    const id = store.backend.newId('cars');
    expect(id).toMatch(/^local-cars-\d+-0$/);
    store.backend.write([{ col: 'cars', id, data: { name: 'Van' } }]);
    expect(store.read().cars.map((c) => c.name)).toEqual(['Hatchback', 'Van']);
    store.patch((d) => ({ ...d, settings: { unit: 'km' } }));
    expect(store.read().settings).toEqual({ unit: 'km' });
    expect(seen).toHaveLength(2);
  });
});

describe('helpers', () => {
  test('stampFor keeps the original author on an edit', () => {
    expect(stampFor(undefined, 'sam@example.com', 5)).toEqual({ createdAt: 5, by: 'sam@example.com' });
    expect(stampFor({ createdAt: 1, by: 'alex@example.com' }, 'sam@example.com', 5)).toEqual({ createdAt: 1, by: 'alex@example.com', updatedAt: 5 });
  });

  test('withoutId, upsert, localIds', () => {
    expect(withoutId({ id: 'x', a: 1 })).toEqual({ a: 1 });
    expect(upsert([{ id: 'a', n: 1 }, { id: 'b', n: 2 }], { id: 'a', n: 3 })).toEqual([{ id: 'b', n: 2 }, { id: 'a', n: 3 }]);
    const ids = localIds();
    expect(ids()).not.toBe(ids());
  });
});

describe('merge', () => {
  test('changes only the given fields, in place; adds a missing document', () => {
    const after = applyOps(data(), [
      { col: 'visits', id: 'v1', data: { what: 'Oil and filter' }, merge: true },
      { col: 'cars', id: 'c9', data: { name: 'Scooter' }, merge: true },
    ]);
    expect(after.visits).toEqual([{ id: 'v1', carId: 'c1', what: 'Oil and filter' }]);
    expect(after.cars.map((c) => c.id)).toEqual(['c1', 'c9']);
  });

  test('undo of a merge writes the whole document back', () => {
    let current = data();
    const backend: Backend = { newId: () => 'x', write: (ops) => (current = applyOps(current, ops)) };
    const undo = changes(backend, (col, id) => (current[col as 'visits'] as { id: string }[]).find((x) => x.id === id))([{ col: 'visits', id: 'v1', data: { what: 'Tyres' }, merge: true }]);
    expect(current.visits[0].what).toBe('Tyres');
    undo();
    expect(current.visits).toEqual(data().visits);
  });
});
