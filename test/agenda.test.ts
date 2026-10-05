import { describe, expect, mock, test } from 'bun:test';
import * as real from 'firebase/firestore';
import { formatTime } from '../src/time';

// An in-memory stand-in for the few Firestore calls agenda.ts makes (the rules themselves are
// tested in huishouden/rules). Counts writes so "unchanged items are not rewritten" is checkable.
const store = new Map<string, Record<string, unknown>>();
let writes = 0;
type Ref = { path: string; id: string };
type Where = { field: string; op: string; value: unknown };
const ref = (path: string): Ref => ({ path, id: path.split('/').pop()! });
const matches = (d: Record<string, unknown>, w: Where) =>
  w.op === '==' ? d[w.field] === w.value : w.op === '<' ? (d[w.field] as number) < (w.value as number) : w.op === 'array-contains' ? Array.isArray(d[w.field]) && (d[w.field] as unknown[]).includes(w.value) : false;
const docsOf = (q: { path: string; w: Where[] }) =>
  [...store.entries()]
    .filter(([p, d]) => p.startsWith(`${q.path}/`) && !p.slice(q.path.length + 1).includes('/') && q.w.every((w) => matches(d, w)))
    .map(([p, d]) => ({ id: p.split('/').pop()!, ref: ref(p), data: () => d }));
const listeners = new Set<() => void>();
// Paths the stand-in refuses like the rules would (a helper writing over an item without the flag).
const refuse = new Set<string>();
mock.module('firebase/firestore', () => ({
  ...real,
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (col: { path: string }, id: string) => ref(`${col.path}/${id}`),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (col: { path: string }, ...w: Where[]) => ({ ...col, w }),
  getDocs: async (q: { path: string; w: Where[] }) => ({ docs: docsOf(q) }),
  onSnapshot: (q: { path: string; w: Where[] }, next: (s: unknown) => void) => {
    const listener = () => next({ docs: docsOf(q) });
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
  },
  writeBatch: () => {
    const ops: (() => void)[] = [];
    const paths: string[] = [];
    return {
      set: (r: Ref, d: Record<string, unknown>) => (paths.push(r.path), ops.push(() => (writes++, store.set(r.path, d)))),
      delete: (r: Ref) => (paths.push(r.path), ops.push(() => (writes++, store.delete(r.path)))),
      commit: async () => {
        if (paths.some((p) => refuse.has(p))) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        ops.forEach((op) => op());
        listeners.forEach((l) => l());
      },
    };
  },
}));

const agenda = await import('../src/agenda');
// Another test file's DOM leaves a real localStorage behind: syncs here read every time unless a test gives its own notes.
const published = await import('../src/published');
published.setPublishedStorage(null);
const {
  AGENDA_FIELDS, agendaDays, agendaDoc, agendaId, agendaStatus, agendaTime, allDayStart, inAgendaWindow,
  removeAgenda, replaceAgenda, syncAgenda, toAgendaItem, todayItems, watchAgenda,
  personalAgendaDoc, syncPersonalAgenda, PERSONAL_AGENDA_FIELDS,
} = agenda;
type AgendaInput = import('../src/agenda').AgendaInput;
type AgendaItem = import('../src/agenda').AgendaItem;

const db = {} as real.Firestore;
const H = 'h1';
const BY = { by: 'Alex@Example.com', now: new Date(2026, 9, 2, 10, 0).getTime() };
const NOW = BY.now;
const at = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const url = 'https://home.example.com/jobs/j1';
const stored = () => [...store.entries()].filter(([p]) => p.startsWith(`households/${H}/agenda/`)).map(([p, d]) => toAgendaItem(p.split('/').pop()!, d));
const reset = () => {
  store.clear();
  refuse.clear();
  writes = 0;
};

const job = (over: Partial<AgendaInput> = {}): AgendaInput => ({
  ref: 'job:j1', kind: 'due', title: 'Change HVAC filter', start: allDayStart('2026-10-05'), allDay: true, url, status: 'upcoming', ...over,
});
const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  id: 'x', app: 'home', ref: 'r', kind: 'appointment', title: 'Visit', start: at(10, 2, 15), allDay: false, url, updatedAt: 0, by: '', ...over,
});

describe('agenda documents', () => {
  test('ids are stable and Firestore-safe', () => {
    expect(agendaId('home', 'job:j1', 1790000000000)).toBe('home_job_j1_1790000000000');
    expect(agendaId('home', 'job:j1', 5)).toBe(agendaId('home', 'job:j1', 5.2));
  });

  test('the stored document has only rules fields, clipped and trimmed, by in lowercase', () => {
    const d = agendaDoc('home', job({ title: `  ${'x'.repeat(130)} `, detail: ' Furnace   room ', who: '' }), 'Alex@Example.com', 7);
    expect(d.title).toHaveLength(120);
    expect(d.detail).toBe('Furnace room');
    expect('who' in d).toBe(false);
    expect(d.by).toBe('alex@example.com');
    expect(d.updatedAt).toBe(7);
    for (const k of Object.keys(d)) expect(AGENDA_FIELDS as readonly string[]).toContain(k);
  });

  test('drops an end that is not after the start', () => {
    expect('end' in agendaDoc('home', job({ end: allDayStart('2026-10-05') }), 'a')).toBe(false);
    expect(agendaDoc('home', job({ end: allDayStart('2026-10-06') }), 'a').end).toBe(allDayStart('2026-10-06'));
  });

  test('refuses what the rules would refuse', () => {
    expect(() => agendaDoc('home', job({ url: '/jobs/j1' }), 'a')).toThrow(/https/);
    expect(() => agendaDoc('home', job({ kind: 'party' as never }), 'a')).toThrow(/kind/);
    expect(() => agendaDoc('home', job({ status: 'late' as never }), 'a')).toThrow(/status/);
    expect(() => agendaDoc('home', job({ title: '  ' }), 'a')).toThrow(/title/);
    expect(() => agendaDoc('home', job({ start: Number.NaN }), 'a')).toThrow(/start/);
  });

  test('toAgendaItem reads stored documents defensively', () => {
    expect(toAgendaItem('a1', { app: 'car', kind: 'nonsense', status: 'maybe', start: 5, allDay: 'yes' })).toEqual({
      id: 'a1', app: 'car', ref: '', kind: 'other', title: '', start: 5, allDay: false, url: '', updatedAt: 0, by: '',
    });
  });

  test('the window reaches 30 days back and 180 ahead; overdue items stay whatever their age', () => {
    expect(inAgendaWindow({ start: at(9, 3) }, NOW)).toBe(true);
    expect(inAgendaWindow({ start: at(8, 1) }, NOW)).toBe(false);
    expect(inAgendaWindow({ start: at(8, 1), status: 'overdue' }, NOW)).toBe(true);
    expect(inAgendaWindow({ start: at(8, 1), end: at(9, 20) }, NOW)).toBe(true);
    expect(inAgendaWindow({ start: new Date(2027, 2, 31).getTime() }, NOW)).toBe(true);
    expect(inAgendaWindow({ start: new Date(2027, 3, 2).getTime() }, NOW)).toBe(false);
  });
});

describe('replaceAgenda and removeAgenda', () => {
  test('writes a record\'s items with idempotent ids, and again changes nothing', async () => {
    reset();
    const ids = await replaceAgenda(db, H, 'home', 'job:j1', [job()], BY);
    expect(ids).toEqual({ written: 1, deleted: 0, unchanged: 0 });
    expect(stored()).toEqual([{ ...agendaDoc('home', job(), BY.by, NOW), id: agendaId('home', 'job:j1', job().start) }]);
    writes = 0;
    expect(await replaceAgenda(db, H, 'home', 'job:j1', [job()], { ...BY, now: NOW + 1000 })).toEqual({ written: 0, deleted: 0, unchanged: 1 });
    expect(writes).toBe(0);
  });

  test('a moved date replaces the old item; other records and apps are untouched', async () => {
    reset();
    await replaceAgenda(db, H, 'home', 'job:j1', [job()], BY);
    await replaceAgenda(db, H, 'home', 'job:j2', [job({ title: 'Clean gutters' })], BY);
    await replaceAgenda(db, H, 'car', 'job:j1', [job({ title: 'Oil change' })], BY);
    const result = await replaceAgenda(db, H, 'home', 'job:j1', [job({ start: allDayStart('2026-10-09') })], BY);
    expect(result).toEqual({ written: 1, deleted: 1, unchanged: 0 });
    expect(stored().map((i) => `${i.app}/${i.ref}/${i.title}/${i.start === allDayStart('2026-10-09') ? 'moved' : 'same'}`).sort()).toEqual([
      'car/job:j1/Oil change/same', 'home/job:j1/Change HVAC filter/moved', 'home/job:j2/Clean gutters/same',
    ]);
  });

  test('a changed title rewrites; items outside the window are not published', async () => {
    reset();
    await replaceAgenda(db, H, 'home', 'job:j1', [job()], BY);
    expect(await replaceAgenda(db, H, 'home', 'job:j1', [job({ title: 'Change furnace filter' }), job({ start: at(12, 25, 0) + 400 * 86_400_000 })], BY))
      .toEqual({ written: 1, deleted: 0, unchanged: 0 });
    expect(stored().map((i) => i.title)).toEqual(['Change furnace filter']);
  });

  test('removeAgenda and an empty list delete only that record', async () => {
    reset();
    await replaceAgenda(db, H, 'home', 'job:j1', [job(), job({ start: allDayStart('2026-11-05') })], BY);
    await replaceAgenda(db, H, 'home', 'job:j2', [job()], BY);
    expect(await removeAgenda(db, H, 'home', 'job:j1')).toBe(2);
    expect(stored().map((i) => i.ref)).toEqual(['job:j2']);
    expect(await replaceAgenda(db, H, 'home', 'job:j2', [], BY)).toEqual({ written: 0, deleted: 1, unchanged: 0 });
    expect(stored()).toEqual([]);
  });
});

describe('syncAgenda', () => {
  test('makes an app\'s items exactly the list, writing only differences', async () => {
    reset();
    await syncAgenda(db, H, 'home', [job(), job({ ref: 'job:j2', title: 'Clean gutters' }), job({ ref: 'job:j3', title: 'Test smoke alarms' })], BY);
    await replaceAgenda(db, H, 'car', 'service:s1', [job({ title: 'Oil change' })], BY);
    writes = 0;
    const result = await syncAgenda(db, H, 'home', [job(), job({ ref: 'job:j2', title: 'Clean gutters', status: 'overdue' }), job({ ref: 'job:j4', title: 'Drain water heater' })], BY);
    expect(result).toEqual({ written: 2, deleted: 1, unchanged: 1 });
    expect(writes).toBe(3);
    expect(stored().map((i) => `${i.app}:${i.title}:${i.status}`).sort()).toEqual([
      'car:Oil change:upcoming', 'home:Change HVAC filter:upcoming', 'home:Clean gutters:overdue', 'home:Drain water heater:upcoming',
    ]);
  });

  test('an empty list clears the app', async () => {
    reset();
    await syncAgenda(db, H, 'bills', [job({ kind: 'bill', ref: 'bill:b1', title: 'Electric' })], BY);
    expect(await syncAgenda(db, H, 'bills', [], BY)).toEqual({ written: 0, deleted: 1, unchanged: 0 });
  });
});

describe('a sync this device already made', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };

  test('the same items again skip the read; a change, a per-record write or six hours sync again', async () => {
    reset();
    const { setPublishedStorage } = await import('../src/published');
    setPublishedStorage(memory());
    try {
      const items = [job(), job({ ref: 'job:j2', title: 'Clean gutters' })];
      expect(await syncAgenda(db, H, 'home', items, BY)).toEqual({ written: 2, deleted: 0, unchanged: 0 });
      // Another device (or the Worker) removed one meanwhile: within the hours, this device doesn't look.
      store.delete(`households/${H}/agenda/${agendaId('home', 'job:j2', job().start)}`);
      expect(await syncAgenda(db, H, 'home', items, { ...BY, now: NOW + 60_000 })).toEqual({ written: 0, deleted: 0, unchanged: 2, skipped: true });
      // A changed item syncs (and repairs the removed one).
      const changed = [job({ title: 'Change the filter' }), job({ ref: 'job:j2', title: 'Clean gutters' })];
      expect(await syncAgenda(db, H, 'home', changed, { ...BY, now: NOW + 120_000 })).toEqual({ written: 2, deleted: 0, unchanged: 0 });
      expect(await syncAgenda(db, H, 'home', changed, { ...BY, now: NOW + 180_000 })).toMatchObject({ skipped: true });
      // Another member on this device, or a helper's view, is its own sync.
      expect(await syncAgenda(db, H, 'home', changed, { by: 'sam@example.com', now: NOW + 180_000 })).toEqual({ written: 0, deleted: 0, unchanged: 2 });
      // A per-record write forgets the app's note.
      await replaceAgenda(db, H, 'home', 'job:j2', [job({ ref: 'job:j2', title: 'Clean gutters' })], { ...BY, now: NOW + 200_000 });
      expect(await syncAgenda(db, H, 'home', changed, { ...BY, now: NOW + 240_000 })).toEqual({ written: 0, deleted: 0, unchanged: 2 });
      // Six hours on, the same items read again.
      expect(await syncAgenda(db, H, 'home', changed, { ...BY, now: NOW + 6 * 3_600_000 + 240_000 })).toEqual({ written: 0, deleted: 0, unchanged: 2 });
    } finally {
      setPublishedStorage(null);
    }
  });

  test('personal items keep their own note per member', async () => {
    reset();
    const { setPublishedStorage } = await import('../src/published');
    setPublishedStorage(memory());
    try {
      const mine = [{ ...job({ ref: 'med:1' }), audience: ['alex@example.com'] }];
      expect(await syncPersonalAgenda(db, H, 'health', mine, BY)).toEqual({ written: 1, deleted: 0, unchanged: 0 });
      expect(await syncPersonalAgenda(db, H, 'health', mine, { ...BY, now: NOW + 1000 })).toMatchObject({ skipped: true });
      expect(await syncPersonalAgenda(db, H, 'health', [], { ...BY, now: NOW + 2000 })).toEqual({ written: 0, deleted: 1, unchanged: 0 });
    } finally {
      setPublishedStorage(null);
    }
  });
});

describe('private items', () => {
  const path = (ref: string) => `households/${H}/agenda/${agendaId('pet', ref, job().start)}`;

  test('every item is written with the flag, private only when asked', () => {
    expect(agendaDoc('home', job(), 'a@example.com').private).toBe(false);
    expect(agendaDoc('home', job({ private: true }), 'a@example.com').private).toBe(true);
    expect(AGENDA_FIELDS).toContain('private');
    // Spending's and Bills' are money: always private, as the rules require.
    expect(agendaDoc('bills', job(), 'a@example.com').private).toBe(true);
  });

  test("an admin's or member's sync writes the flag on items saved before it", async () => {
    reset();
    const { private: _p, ...legacy } = agendaDoc('pet', job({ ref: 'feed:1' }), 'a@example.com', NOW);
    store.set(path('feed:1'), legacy);
    expect(await syncAgenda(db, H, 'pet', [job({ ref: 'feed:1' })], BY)).toEqual({ written: 1, deleted: 0, unchanged: 0 });
    expect(store.get(path('feed:1'))?.private).toBe(false);
  });

  test("a helper's sync reads and writes only open items, and one refused write doesn't stop the rest", async () => {
    reset();
    await syncAgenda(db, H, 'pet', [job({ ref: 'vet:1', private: true }), job({ ref: 'feed:1' }), job({ ref: 'feed:2' })], BY);
    const { private: _p, ...legacy } = agendaDoc('pet', job({ ref: 'feed:3' }), 'a@example.com', NOW);
    store.set(path('feed:3'), legacy);
    refuse.add(path('feed:3'));
    // The helper's device can't see the private vet visit, so it neither publishes nor deletes it.
    const result = await syncAgenda(db, H, 'pet', [job({ ref: 'feed:1', status: 'done' }), job({ ref: 'feed:3' })], { ...BY, restricted: true });
    expect(result).toEqual({ written: 2, deleted: 1, unchanged: 0 });
    expect(store.has(path('vet:1'))).toBe(true);
    expect(store.get(path('feed:1'))?.status).toBe('done');
    expect(store.has(path('feed:2'))).toBe(false);
    expect(store.get(path('feed:3'))?.private).toBeUndefined();
  });

  test('a helper watches only open items', async () => {
    reset();
    await syncAgenda(db, H, 'pet', [job({ ref: 'vet:1', title: 'Vet', private: true }), job({ ref: 'feed:1', title: 'Feed' })], BY);
    let seen: AgendaItem[] = [];
    watchAgenda(db, H, { from: at(10, 1), to: at(11, 1), restricted: true }, (items) => (seen = items));
    expect(seen.map((i) => i.title)).toEqual(['Feed']);
  });
});

describe('watchAgenda', () => {
  test('items in range and overdue ones, filtered by app, soonest first, kept current', async () => {
    reset();
    await syncAgenda(db, H, 'home', [
      job({ ref: 'job:late', title: 'Clean gutters', start: allDayStart('2026-08-01'), status: 'overdue' }),
      job({ ref: 'job:old', title: 'Old visit', kind: 'appointment', start: at(8, 20, 9), allDay: false, status: undefined }),
      job(),
      job({ ref: 'job:far', title: 'Far away', start: allDayStart('2027-01-10') }),
    ], BY);
    await syncAgenda(db, H, 'car', [job({ ref: 'renewal:r1', kind: 'renewal', title: 'Registration', start: allDayStart('2026-10-04') })], BY);
    let seen: AgendaItem[] = [];
    const stop = watchAgenda(db, H, { from: at(10, 1), to: at(11, 1), apps: ['home', 'car'] }, (items) => (seen = items));
    expect(seen.map((i) => i.title)).toEqual(['Clean gutters', 'Registration', 'Change HVAC filter']);
    await replaceAgenda(db, H, 'home', 'job:new', [job({ title: 'Test smoke alarms', start: allDayStart('2026-10-03') })], BY);
    expect(seen.map((i) => i.title)).toEqual(['Clean gutters', 'Test smoke alarms', 'Registration', 'Change HVAC filter']);
    stop();
    watchAgenda(db, H, { from: at(10, 1), to: at(11, 1), apps: ['car'] }, (items) => (seen = items));
    expect(seen.map((i) => i.title)).toEqual(['Registration']);
  });
});

describe('Today', () => {
  test('a status turns overdue once its day or time passes, without the app rewriting it', () => {
    expect(agendaStatus(item({ allDay: true, start: allDayStart('2026-10-02'), status: 'upcoming' }), NOW)).toBe('upcoming');
    expect(agendaStatus(item({ allDay: true, start: allDayStart('2026-10-01'), status: 'upcoming' }), NOW)).toBe('overdue');
    expect(agendaStatus(item({ start: at(10, 2, 8), status: 'upcoming' }), NOW)).toBe('overdue');
    expect(agendaStatus(item({ start: at(10, 2, 8), status: 'done' }), NOW)).toBe('done');
    expect(agendaStatus(item({ start: at(9, 2, 8) }), NOW)).toBeUndefined();
  });

  test('overdue first, then today, then the next 48 hours, with the time in words', () => {
    const items = [
      item({ id: 'soon', title: 'Dentist', start: at(10, 3, 9), end: at(10, 3, 10) }),
      item({ id: 'later', title: 'Far', start: at(10, 6, 9) }),
      item({ id: 'done', title: 'Paid', kind: 'bill', allDay: true, start: allDayStart('2026-10-02'), status: 'done' }),
      item({ id: 'past', title: 'Morning visit', start: at(10, 2, 8), end: at(10, 2, 9) }),
      item({ id: 'visit', title: 'Plumber', start: at(10, 2, 15), end: at(10, 2, 16) }),
      item({ id: 'bill', title: 'Electric', kind: 'bill', allDay: true, start: allDayStart('2026-10-02'), status: 'upcoming' }),
      item({ id: 'late', title: 'Clean gutters', kind: 'due', allDay: true, start: allDayStart('2026-09-29'), status: 'upcoming' }),
      item({ id: 'feed', title: 'Breakfast', kind: 'feeding', start: at(10, 2, 8), status: 'upcoming' }),
      item({ id: 'bday', title: 'Birthday', kind: 'birthday', allDay: true, start: allDayStart('2026-10-05') }),
      item({ id: 'trip', title: 'Trip', allDay: true, start: allDayStart('2026-10-01'), end: allDayStart('2026-10-04') }),
    ];
    expect(todayItems(items, NOW).map((e) => [e.item.id, e.group, e.when])).toEqual([
      ['late', 'overdue', 'Overdue by 3 days'],
      ['feed', 'overdue', `Overdue since ${formatTime(at(10, 2, 8))}`],
      ['bill', 'today', 'Due today'],
      ['visit', 'today', `${formatTime(at(10, 2, 15))} – ${formatTime(at(10, 2, 16))}`],
      ['soon', 'soon', `Tomorrow, ${formatTime(at(10, 3, 9))}`],
    ]);
    expect(todayItems(items, NOW, { soonHours: 24 * 3 }).map((e) => e.item.id)).toContain('bday');
  });

  test('an ongoing span (several days, no status) is calendar context, not something to do today', () => {
    const course = item({ id: 'course', kind: 'medicine', allDay: true, start: allDayStart('2026-09-30'), end: allDayStart('2026-10-05') });
    expect(todayItems([course], NOW)).toEqual([]);
  });

  test("with includeDone, today's finished items come back last as 'done'", () => {
    const items = [
      item({ id: 'fed', kind: 'feeding', start: at(10, 2, 8), status: 'done' }),
      item({ id: 'yesterday', kind: 'feeding', start: at(10, 1, 8), status: 'done' }),
      item({ id: 'pm', kind: 'feeding', start: at(10, 2, 19), status: 'upcoming' }),
    ];
    expect(todayItems(items, NOW).map((e) => e.item.id)).toEqual(['pm']);
    expect(todayItems(items, NOW, { includeDone: true }).map((e) => [e.item.id, e.group])).toEqual([
      ['pm', 'today'],
      ['fed', 'done'],
    ]);
  });

  test('an all-day span stays upcoming until its last day has passed', () => {
    const course = item({ kind: 'medicine', allDay: true, start: allDayStart('2026-09-30'), end: allDayStart('2026-10-03'), status: 'upcoming' });
    expect(agendaStatus(course, NOW)).toBe('upcoming');
    expect(todayItems([course], NOW).map((e) => [e.group, e.when])).toEqual([['today', 'Due today']]);
    expect(agendaStatus(course, at(10, 3, 9))).toBe('overdue');
  });

  test('feeds and doses from earlier days are missed, not overdue; today\'s still show', () => {
    const items = [
      item({ id: 'y', kind: 'feeding', title: 'Dinner', start: at(10, 1, 18), status: 'upcoming' }),
      item({ id: 'd', kind: 'medicine', title: 'Dose', start: at(10, 1, 20), status: 'overdue' }),
      item({ id: 't', kind: 'feeding', title: 'Breakfast', start: at(10, 2, 8), status: 'upcoming' }),
      item({ id: 'b', kind: 'bill', title: 'Water', allDay: true, start: allDayStart('2026-10-01'), status: 'upcoming' }),
    ];
    expect(todayItems(items, NOW).map((e) => e.item.id)).toEqual(['b', 't']);
  });

  test('a timed task whose window has closed is missed, not overdue; until then it is overdue', () => {
    const bins = item({ id: 'bins', kind: 'task', title: 'Put the bins out', start: at(10, 1, 19), end: at(10, 1, 23, 59), status: 'upcoming' });
    const tonight = item({ id: 'tonight', kind: 'task', title: 'Put the bins out', start: at(10, 2, 7), end: at(10, 2, 23, 59), status: 'upcoming' });
    expect(todayItems([bins, tonight], NOW).map((e) => [e.item.id, e.group])).toEqual([['tonight', 'overdue']]);
    expect(todayItems([bins], at(10, 1, 21)).map((e) => [e.item.id, e.group])).toEqual([['bins', 'overdue']]);
  });

  test('agendaTime', () => {
    expect(agendaTime(item({ allDay: true }))).toBe('All day');
    expect(agendaTime(item({ start: at(10, 2, 15) }))).toBe(formatTime(at(10, 2, 15)));
  });
});

describe('agendaDays', () => {
  test('groups by day with labels; spans show on each day; all-day first', () => {
    const days = agendaDays([
      item({ id: 'b', title: 'Plumber', start: at(10, 3, 9) }),
      item({ id: 'a', title: 'Registration', allDay: true, start: allDayStart('2026-10-03') }),
      item({ id: 't', title: 'Trip', allDay: true, start: allDayStart('2026-10-02'), end: allDayStart('2026-10-04') }),
      item({ id: 'y', title: 'Old', start: at(10, 1, 9) }),
      item({ id: 'n', title: 'Next year', allDay: true, start: allDayStart('2027-01-05') }),
    ], NOW);
    expect(days.map((d) => [d.day, d.label, d.items.map((i) => i.id)])).toEqual([
      ['2026-10-01', 'Yesterday', ['y']],
      ['2026-10-02', 'Today', ['t']],
      ['2026-10-03', 'Tomorrow', ['t', 'a', 'b']],
      ['2027-01-05', 'Tuesday, January 5, 2027', ['n']],
    ]);
  });

  test('a range, with empty days when asked', () => {
    const days = agendaDays([item({ start: at(10, 3, 9) }), item({ start: at(10, 9, 9) })], NOW, { from: '2026-10-02', to: '2026-10-04', emptyDays: true });
    expect(days.map((d) => [d.label, d.items.length])).toEqual([['Today', 0], ['Tomorrow', 1], ['Sunday, October 4', 0]]);
  });

  test('a timed item ending on a later day shows on both', () => {
    const days = agendaDays([item({ start: at(10, 2, 22), end: at(10, 3, 2) })], NOW);
    expect(days.map((d) => d.day)).toEqual(['2026-10-02', '2026-10-03']);
  });
});

describe('items for named members only', () => {
  const item = (ref: string, start: number, audience: string[]): import('../src/agenda').PersonalAgendaInput => ({
    ref, kind: 'medicine', title: 'Medicine for Nan', start, allDay: false, url: 'https://example.web.app/health/', status: 'upcoming', audience,
  });

  test('the document names its audience, lowercased and sorted, and is private', () => {
    const d = personalAgendaDoc('health', item('dose:p1:0800', at(10, 2, 8), ['Sam@Example.com', 'alex@example.com', 'sam@example.com']), 'alex@example.com', NOW);
    expect(d.audience).toEqual(['alex@example.com', 'sam@example.com']);
    expect(d.private).toBe(true);
    for (const k of Object.keys(d)) expect(PERSONAL_AGENDA_FIELDS as readonly string[]).toContain(k);
    expect(() => personalAgendaDoc('health', item('x', at(10, 2, 8), ['sam@example.com']), 'alex@example.com', NOW)).toThrow();
  });

  test('a sync writes the items that name the writer, keeps others', async () => {
    store.clear();
    const mine = item('dose:p1:0800', at(10, 2, 8), ['alex@example.com', 'sam@example.com']);
    const notMine = item('dose:p2:0800', at(10, 2, 8), ['sam@example.com']);
    // Another carer's item the writer can't see stays put.
    store.set(`households/${H}/personalAgenda/other`, { app: 'health', audience: ['sam@example.com'], start: at(10, 2, 9) });
    const r = await syncPersonalAgenda(db, H, 'health', [mine, notMine], BY);
    expect(r).toEqual({ written: 1, deleted: 0, unchanged: 0 });
    expect([...store.keys()].filter((k) => k.includes('personalAgenda')).sort()).toEqual([
      `households/${H}/personalAgenda/health_dose_p1_0800_${at(10, 2, 8)}`,
      `households/${H}/personalAgenda/other`,
    ]);
    expect(await syncPersonalAgenda(db, H, 'health', [mine], BY)).toEqual({ written: 0, deleted: 0, unchanged: 1 });
    expect(await syncPersonalAgenda(db, H, 'health', [], BY)).toEqual({ written: 0, deleted: 1, unchanged: 0 });
    expect(store.has(`households/${H}/personalAgenda/other`)).toBe(true);
  });

  test("watchAgenda with me follows the shared items and the member's own", async () => {
    store.clear();
    await syncAgenda(db, H, 'home', [{ ref: 'job:1', kind: 'due', title: 'Change filter', start: at(10, 3), allDay: true, url: 'https://example.web.app/home/', status: 'upcoming', private: false }], BY);
    await syncPersonalAgenda(db, H, 'health', [item('dose:p1:0800', at(10, 2, 8), ['alex@example.com'])], BY);
    const seen: string[][] = [];
    const stop = watchAgenda(db, H, { from: at(10, 1), to: at(10, 10), me: 'alex@example.com' }, (items) => seen.push(items.map((i) => i.title)));
    expect(seen.at(-1)).toEqual(['Medicine for Nan', 'Change filter']);
    const others: string[][] = [];
    const stop2 = watchAgenda(db, H, { from: at(10, 1), to: at(10, 10), me: 'sam@example.com' }, (items) => others.push(items.map((i) => i.title)));
    expect(others.at(-1)).toEqual(['Change filter']);
    const without: string[][] = [];
    const stop3 = watchAgenda(db, H, { from: at(10, 1), to: at(10, 10) }, (items) => without.push(items.map((i) => i.title)));
    expect(without.at(-1)).toEqual(['Change filter']);
    stop();
    stop2();
    stop3();
  });
});
