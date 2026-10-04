import { describe, expect, mock, test } from 'bun:test';
import * as real from 'firebase/firestore';

// An in-memory stand-in for the few Firestore calls reminders.ts makes (no emulator in this repo;
// the rules themselves are tested in the repo that owns them).
const store = new Map<string, Record<string, unknown>>();
// Paths the stand-in refuses like the rules would (a helper writing over a reminder without the flag).
const refuse = new Set<string>();
type Ref = { path: string; id: string };
const ref = (path: string): Ref => ({ path, id: path.split('/').pop()! });
mock.module('firebase/firestore', () => ({
  ...real,
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (col: { path: string }, id: string) => ref(`${col.path}/${id}`),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (col: { path: string }, ...ws: { field: string; op?: string; value: unknown }[]) => ({ ...col, ws }),
  setDoc: async (r: Ref, data: Record<string, unknown>) => void store.set(r.path, data),
  deleteDoc: async (r: Ref) => void store.delete(r.path),
  getDocs: async (q: { path: string; ws: { field: string; op?: string; value: unknown }[] }) => {
    const docs = [...store.entries()]
      .filter(([p, d]) => p.startsWith(`${q.path}/`) && q.ws.every((w) => ((w as { op?: string }).op === 'array-contains' ? Array.isArray(d[w.field]) && (d[w.field] as unknown[]).includes(w.value) : d[w.field] === w.value)))
      .map(([p, d]) => ({ id: p.split('/').pop()!, ref: ref(p), data: () => d }));
    return { docs, size: docs.length };
  },
  writeBatch: () => {
    const ops: (() => void)[] = [];
    const paths: string[] = [];
    return {
      set: (r: Ref, d: Record<string, unknown>) => (paths.push(r.path), ops.push(() => store.set(r.path, d))),
      delete: (r: Ref) => (paths.push(r.path), ops.push(() => store.delete(r.path))),
      commit: async () => {
        if (paths.some((p) => refuse.has(p))) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        ops.forEach((op) => op());
      },
    };
  },
}));

const { PERSONAL_REMINDER_FIELDS, personalReminderDoc, syncPersonalReminders, REMINDER_FIELDS, cancelReminders, reminderDoc, reminderId, remindersForCourse, replaceReminders, syncReminders, toReminder, upsertReminder } = await import('../src/reminders');

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
    expect(d).toEqual({ app: 'pet', title: 'Dose', body: '', at: 5, url: 'https://pet.example.com/', recipients: ['sam@example.com'], ref: 'r', private: false, sent: false, createdAt: 100, by: 'alex@example.com' });
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

describe('private reminders', () => {
  const path = (id: string) => `households/h1/reminders/${id}`;
  const input = (title: string, at: number, extra: Record<string, unknown> = {}) => ({ app: 'pet', title, at, url: 'https://pet.example.com/', ref: title, ...extra });

  test('are written with the flag, and a course can be private', () => {
    expect(reminderDoc(input('Dose', 5), 'a@example.com').private).toBe(false);
    expect(reminderDoc(input('Vet', 5, { private: true }), 'a@example.com').private).toBe(true);
    expect(reminderDoc({ ...input('Electric bill', 5), app: 'bills' }, 'a@example.com').private).toBe(true);
    expect(remindersForCourse(course, { app: 'pet', url: 'https://pet.example.com/', private: true, now: NOW }).every((r) => r.private)).toBe(true);
  });

  test("a helper's sync touches only open reminders, and one refused write doesn't stop the rest", async () => {
    store.clear();
    refuse.clear();
    const later = NOW + 3_600_000;
    await syncReminders(db, 'h1', 'pet', [input('Vet visit', later, { id: 'vet', private: true }), input('Dose 1', later, { id: 'd1' }), input('Dose 2', later, { id: 'd2' })], 'a@example.com', NOW);
    const { private: _p, ...legacy } = store.get(path('d2'))!;
    store.set(path('d3'), { ...legacy, title: 'Dose 3' });
    refuse.add(path('d3'));
    // Dose 2 was given on the helper's device: its reminder goes; the private vet visit stays.
    const result = await syncReminders(db, 'h1', 'pet', [input('Dose 1', later, { id: 'd1' }), input('Dose 3', later, { id: 'd3' })], 'h@example.com', NOW, { restricted: true });
    expect(result.deleted).toBe(1);
    expect(store.has(path('vet'))).toBe(true);
    expect(store.has(path('d2'))).toBe(false);
    expect(store.get(path('d3'))?.private).toBeUndefined();
  });
});

describe('reminders for named members only', () => {
  const A = 'alex@example.com';
  const N = 'nan@example.com';
  const input = (at: number, recipients: string[], audience = [A, N]) => ({
    app: 'health', title: 'Medicine for Nan', body: '8:00 AM: Lisinopril 10 mg', at, url: 'https://example.web.app/health/', recipients, audience, ref: 'health:dose:p1',
  });

  test('the document keeps recipients within the audience, private, unsent', () => {
    const d = personalReminderDoc(input(at(15, 8), ['Nan@example.com', 'sam@example.com']), A, NOW);
    expect(d.recipients).toEqual([N]);
    expect(d.audience).toEqual([A, N]);
    expect(d.private).toBe(true);
    expect(d.sent).toBe(false);
    for (const k of Object.keys(d)) expect(PERSONAL_REMINDER_FIELDS as readonly string[]).toContain(k);
    expect(() => personalReminderDoc(input(at(15, 8), [N], [N]), A, NOW)).toThrow();
    expect(() => personalReminderDoc(input(at(15, 8), ['sam@example.com']), A, NOW)).toThrow();
  });

  test('sync writes future ones naming the writer, deletes dropped ones, never touches sent or others', async () => {
    store.clear();
    const col = 'households/h1/personalReminders';
    store.set(`${col}/sent`, { app: 'health', at: at(14, 8), sent: true, audience: [A] });
    store.set(`${col}/someone-else`, { app: 'health', at: at(16, 8), sent: false, audience: [N] });
    const first = await syncPersonalReminders(db, 'h1', 'health', [input(at(15, 8), [A]), input(at(15, 20), [A], [N]), input(at(13, 8), [A])], A, NOW);
    expect(first).toEqual({ written: 1, deleted: 0, unchanged: 0 });
    expect(await syncPersonalReminders(db, 'h1', 'health', [input(at(15, 8), [A])], A, NOW)).toEqual({ written: 0, deleted: 0, unchanged: 1 });
    expect(await syncPersonalReminders(db, 'h1', 'health', [], A, NOW)).toEqual({ written: 0, deleted: 1, unchanged: 0 });
    expect([...store.keys()].sort()).toEqual([`${col}/sent`, `${col}/someone-else`]);
  });
});

const { localizeReminders, remindersForCourseInEveryLang, cleanTexts } = await import('../src/reminders');
const { kt, resetI18nForTests, setLangForTests } = await import('../src/i18n');

describe('reminders in every language', () => {
  test('course reminders carry texts in en, es and nl; title and body stay in the page language', async () => {
    const list = await remindersForCourseInEveryLang(course, options);
    expect(list[0].title).toBe('Biscuit: Carprofen 75 mg');
    expect(list[0].body).toBe('1 tablet at 20:00, with food');
    expect(list[0].texts).toEqual({
      en: { title: 'Biscuit: Carprofen 75 mg', body: '1 tablet at 20:00, with food' },
      es: { title: 'Biscuit: Carprofen 75 mg', body: '1 tablet a las 20:00, con comida' },
      nl: { title: 'Biscuit: Carprofen 75 mg', body: '1 tablet om 20:00, bij het eten' },
    });
  });

  test('the course text follows the language; without a dose or a name it still reads', async () => {
    try {
      await setLangForTests('nl');
      const [r] = remindersForCourse({ ...course, dose: '', name: '', withFood: false }, { ...options, forWhom: undefined });
      expect(r.title).toBe('Medicijn');
      expect(r.body).toBe('op een lege maag');
      const [s] = remindersForCourse({ ...course, dose: '', withFood: undefined }, options);
      expect(s.body).toBe('Dosis om 20:00');
    } finally {
      await setLangForTests('en').catch(() => {});
      resetI18nForTests();
    }
  });

  test('localizeReminders runs the builder once per language', async () => {
    const list = await localizeReminders(() => [{ app: 'car', title: kt('time.dueToday'), body: kt('agenda.allDay'), at: at(20, 9), url: 'https://car.example.com/' }]);
    expect(list[0].title).toBe('Due today');
    expect(list[0].texts?.es).toEqual({ title: 'Vence hoy', body: 'Todo el día' });
    expect(list[0].texts?.nl).toEqual({ title: 'Vandaag', body: 'Hele dag' });
  });

  test('texts are stored clipped, unknown languages dropped, and read back', () => {
    const texts = { es: { title: ` ${'x'.repeat(130)} `, body: 'b' }, fr: { title: 'non', body: '' } } as never;
    const d = reminderDoc({ app: 'pet', title: 'T', at: 5, url: 'https://pet.example.com/', texts }, 'alex@example.com', 100);
    expect(d.texts).toEqual({ es: { title: 'x'.repeat(120), body: 'b' } });
    expect(Object.keys(d).every((k) => (REMINDER_FIELDS as readonly string[]).includes(k))).toBe(true);
    expect(toReminder('r', { ...d }).texts).toEqual(d.texts);
    expect(cleanTexts({ en: { title: '  ', body: 'x' } })).toBeUndefined();
  });

  test('syncReminders rewrites a reminder whose texts changed, and leaves an identical one', async () => {
    store.clear();
    const input = { app: 'pet', title: 'T', at: at(20, 9), url: 'https://pet.example.com/', ref: 'x', texts: { es: { title: 'T es', body: '' } } };
    expect((await syncReminders(db, 'h', 'pet', [input], 'alex@example.com', NOW)).written).toBe(1);
    expect((await syncReminders(db, 'h', 'pet', [input], 'alex@example.com', NOW)).unchanged).toBe(1);
    expect((await syncReminders(db, 'h', 'pet', [{ ...input, texts: { es: { title: 'T es 2', body: '' } } }], 'alex@example.com', NOW)).written).toBe(1);
  });
});
