import { describe, expect, mock, test } from 'bun:test';
import * as real from 'firebase/firestore';

// An in-memory stand-in for the few Firestore calls reminders.ts makes (no emulator in this repo;
// the rules themselves are tested in the repo that owns them).
const store = new Map<string, Record<string, unknown>>();
type Ref = { path: string; id: string };
const ref = (path: string): Ref => ({ path, id: path.split('/').pop()! });
mock.module('firebase/firestore', () => ({
  ...real,
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (col: { path: string }, id: string) => ref(`${col.path}/${id}`),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  query: (col: { path: string }, w: { field: string; value: unknown }) => ({ ...col, w }),
  setDoc: async (r: Ref, data: Record<string, unknown>) => void store.set(r.path, data),
  deleteDoc: async (r: Ref) => void store.delete(r.path),
  getDocs: async (q: { path: string; w: { field: string; value: unknown } }) => {
    const docs = [...store.entries()]
      .filter(([p, d]) => p.startsWith(`${q.path}/`) && d[q.w.field] === q.w.value)
      .map(([p, d]) => ({ id: p.split('/').pop()!, ref: ref(p), data: () => d }));
    return { docs, size: docs.length };
  },
  writeBatch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (r: Ref, d: Record<string, unknown>) => ops.push(() => store.set(r.path, d)),
      delete: (r: Ref) => ops.push(() => store.delete(r.path)),
      commit: async () => ops.forEach((op) => op()),
    };
  },
}));

const { REMINDER_FIELDS, cancelReminders, reminderDoc, reminderId, remindersForCourse, replaceReminders, syncReminders, toReminder, upsertReminder } = await import('../src/reminders');

const db = {} as real.Firestore;
const NOW = new Date(2026, 2, 14, 12, 0).getTime();
const at = (d: number, h: number) => new Date(2026, 2, d, h, 0).getTime();
const course = {
  id: 'c1', name: 'Carprofen 75 mg', dose: '1 tablet', timesPerDay: 2, times: ['08:00', '20:00'],
  startDate: '2026-03-14', days: 3, withFood: true, notes: '',
};
const options = { app: 'pet', url: 'https://pet.example.com/pets/p1', now: NOW, forWhom: 'Biscuit' };

describe('reminder documents', () => {
  test('ids are stable and Firestore-safe', () => {
    expect(reminderId('pet:course:c1', 1773489600000)).toBe('pet_course_c1-1773489600000');
    expect(reminderId('pet:course:c1', 5)).toBe(reminderId('pet:course:c1', 5));
  });

  test('the stored document has exactly the rules fields, unsent, with lowercased recipients', () => {
    const d = reminderDoc({ app: 'pet', title: ' Dose ', at: 5.2, url: 'https://pet.example.com/', recipients: ['Sam@Example.com', 'sam@example.com'], ref: 'r' }, 'alex@example.com', 100);
    expect(d).toEqual({ app: 'pet', title: 'Dose', body: '', at: 5, url: 'https://pet.example.com/', recipients: ['sam@example.com'], ref: 'r', sent: false, createdAt: 100, by: 'alex@example.com' });
    for (const k of Object.keys(d)) expect(REMINDER_FIELDS as readonly string[]).toContain(k);
  });

  test('defaults to everyone in the household', () => {
    expect(reminderDoc({ app: 'pet', title: 't', at: 1, url: 'https://x.example.com' }, 'a@example.com').recipients).toBe('all');
  });

  test('refuses links that are not https and empty recipient lists', () => {
    expect(() => reminderDoc({ app: 'pet', title: 't', at: 1, url: '/pets' }, 'a')).toThrow(/https/);
    expect(() => reminderDoc({ app: 'pet', title: 't', at: 1, url: 'https://x.example.com', recipients: [' '] }, 'a')).toThrow(/recipients/);
  });

  test('toReminder reads stored documents defensively', () => {
    expect(toReminder('r1', { app: 'pet', at: 5, recipients: ['a@example.com'], sent: true })).toMatchObject({ id: 'r1', at: 5, recipients: ['a@example.com'], sent: true, body: '' });
    expect(toReminder('r2', { recipients: 'all' }).recipients).toBe('all');
  });
});

describe('remindersForCourse', () => {
  test('one reminder per remaining dose, titled for the pet, with stable ids', () => {
    const reminders = remindersForCourse(course, options);
    expect(reminders.map((r) => r.at)).toEqual([at(14, 20), at(15, 8), at(15, 20), at(16, 8), at(16, 20)]);
    expect(reminders[0]).toEqual({
      id: `pet_course_c1-${at(14, 20)}`, app: 'pet', title: 'Biscuit: Carprofen 75 mg', body: '1 tablet at 20:00, with food',
      at: at(14, 20), url: options.url, recipients: 'all', ref: 'pet:course:c1',
    });
    expect(remindersForCourse(course, options)).toEqual(reminders);
  });

  test('lead time moves the reminder earlier', () => {
    expect(remindersForCourse(course, { ...options, leadMinutes: 15 })[0].at).toBe(at(14, 20) - 15 * 60_000);
  });

  test('ongoing courses stop at the horizon', () => {
    const ongoing = { ...course, days: undefined };
    expect(remindersForCourse(ongoing, { ...options, horizonDays: 2 })).toHaveLength(4);
  });

  test('every other day', () => {
    const r = remindersForCourse({ ...course, days: 6, times: ['08:00'] }, { ...options, everyDays: 2 });
    expect(r.map((x) => new Date(x.at).getDate())).toEqual([16, 18]);
  });
});

describe('writing reminders', () => {
  test('upsert writes under its idempotent id', async () => {
    store.clear();
    const id = await upsertReminder(db, 'h1', { app: 'pet', title: 'Vet visit', at: 1000, url: 'https://pet.example.com/' }, 'a@example.com');
    expect(id).toBe('pet-1000');
    expect(store.get('households/h1/reminders/pet-1000')).toMatchObject({ title: 'Vet visit', sent: false });
  });

  test('replaceReminders swaps future reminders and leaves past ones alone', async () => {
    store.clear();
    const ref = 'pet:course:c1';
    store.set(`households/h1/reminders/old-past`, { ref, at: NOW - 1000, sent: true });
    store.set(`households/h1/reminders/old-future`, { ref, at: NOW + 1000, sent: false });
    store.set(`households/h1/reminders/other`, { ref: 'pet:course:c2', at: NOW + 1000, sent: false });
    const ids = await replaceReminders(db, 'h1', ref, remindersForCourse(course, options), 'a@example.com', NOW);
    expect(ids).toHaveLength(5);
    expect(store.has('households/h1/reminders/old-past')).toBe(true);
    expect(store.has('households/h1/reminders/old-future')).toBe(false);
    expect(store.has('households/h1/reminders/other')).toBe(true);
    for (const id of ids) expect(store.get(`households/h1/reminders/${id}`)).toMatchObject({ ref, sent: false, by: 'a@example.com' });

    // Saving the same course again changes nothing.
    const before = JSON.stringify([...store.keys()].sort());
    await replaceReminders(db, 'h1', ref, remindersForCourse(course, options), 'a@example.com', NOW);
    expect(JSON.stringify([...store.keys()].sort())).toBe(before);
  });

  test('cancelReminders deletes a whole course', async () => {
    const n = await cancelReminders(db, 'h1', 'pet:course:c1');
    expect(n).toBe(6);
    expect([...store.keys()]).toEqual(['households/h1/reminders/other']);
  });
});

describe('syncReminders', () => {
  const H = 'households/h1/reminders';
  const input = (ref: string, when: number, title = 'Drop off dry cleaning') => ({ app: 'tasks', title, at: when, url: 'https://tasks.example.com/?item=1', ref });

  test('writes new reminders, leaves unchanged ones, deletes future ones no longer wanted', async () => {
    store.clear();
    const first = await syncReminders(db, 'h1', 'tasks', [input('tasks:item:a', at(15, 9)), input('tasks:item:b', at(16, 9))], 'alex@example.com', NOW);
    expect(first).toEqual({ written: 2, deleted: 0, unchanged: 0 });
    const again = await syncReminders(db, 'h1', 'tasks', [input('tasks:item:a', at(15, 9)), input('tasks:item:b', at(16, 9))], 'sam@example.com', NOW);
    expect(again).toEqual({ written: 0, deleted: 0, unchanged: 2 });
    const moved = await syncReminders(db, 'h1', 'tasks', [input('tasks:item:a', at(15, 9), 'Pick up dry cleaning')], 'alex@example.com', NOW);
    expect(moved).toEqual({ written: 1, deleted: 1, unchanged: 0 });
    expect([...store.keys()]).toEqual([`${H}/${reminderId('tasks:item:a', at(15, 9))}`]);
    expect(store.get(`${H}/${reminderId('tasks:item:a', at(15, 9))}`)?.title).toBe('Pick up dry cleaning');
  });

  test('never touches past or sent reminders, or another app\'s', async () => {
    store.clear();
    store.set(`${H}/past`, { app: 'tasks', at: at(13, 9), sent: true, ref: 'tasks:item:old' });
    store.set(`${H}/sent`, { app: 'tasks', at: at(15, 9), sent: true, ref: 'tasks:item:s' });
    store.set(`${H}/pet`, { app: 'pet', at: at(15, 9), sent: false, ref: 'pet:course:c1' });
    const result = await syncReminders(db, 'h1', 'tasks', [], 'alex@example.com', NOW);
    expect(result).toEqual({ written: 0, deleted: 0, unchanged: 0 });
    expect([...store.keys()].sort()).toEqual([`${H}/past`, `${H}/pet`, `${H}/sent`]);
  });

  test('past times in the list are skipped', async () => {
    store.clear();
    expect(await syncReminders(db, 'h1', 'tasks', [input('tasks:item:a', at(14, 8))], 'alex@example.com', NOW)).toEqual({ written: 0, deleted: 0, unchanged: 0 });
  });
});
