import { describe, expect, test } from 'bun:test';
import { withLang, loadLang } from '../src/i18n';
import {
  DEFAULT_REMIND_BEFORE, cleanRemindBefore, followUpDay, followUpOpen, followUpTodo, guessVisitKind, leadWords, reminderTimes, toVisit,
  visitAgendaItem, visitCalendarWords, visitDoc, visitEnd, visitMark, visitReminders, visitUnmarked, visitState, visitTitle, visitWhat, visitWhen, type Visit,
} from '../src/visit';
import { todoDoc, todoOpsAllowed } from '../src/todo-core';
import { personalAgendaDoc } from '../src/agenda-core';
import { namedIn } from '../src/people';
import { publishedContact, visitRecipients } from '../src/visit';
import { personAudience } from '../src/audience';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const AT = local(2031, 5, 15, 10, 0);
const NOW = local(2031, 5, 13, 12, 0);
const person = { id: 'p1', name: 'Ana' };
const audience = ['admin@example.com', 'jo@example.com'];
const household = { members: ['admin@example.com', 'jo@example.com'], roles: { 'jo@example.com': 'helper' as const } };
const url = 'https://example.com/health/?tab=visits&person=p1&visit=v1';

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v1', personId: 'p1', kind: 'dentist', title: 'Cleaning', at: AT, remindBefore: [...DEFAULT_REMIND_BEFORE], createdAt: NOW, by: 'admin@example.com', ...over,
});

describe('visit documents', () => {
  test('visitDoc keeps what the rules accept: clipped, no defaults stored, lead times sorted', () => {
    const d = visitDoc(
      { personId: 'p1', kind: 'lab', title: '  Blood   work ', at: AT + 0.4, minutes: 60, location: ' Example Lab ', link: 'http://insecure.example.com', prep: ['Fasting from midnight', 'Fasting from midnight', ''], medList: true, remindBefore: [120, 1440, 120, -5, 99999] },
      { createdAt: NOW, by: 'admin@example.com' },
    );
    expect(d).toEqual({ personId: 'p1', kind: 'lab', title: 'Blood work', at: AT, location: 'Example Lab', prep: ['Fasting from midnight'], medList: true, remindBefore: [1440, 120], createdAt: NOW, by: 'admin@example.com' });
    const untitled = visitDoc({ personId: 'p1', kind: 'eye', title: '', at: AT, link: 'https://video.example.com/r/1' }, { createdAt: NOW, by: 'a@example.com' }, 'assistant');
    expect(untitled).toMatchObject({ link: 'https://video.example.com/r/1', remindBefore: [1440, 120], via: 'assistant' });
    expect('title' in untitled).toBe(false);
    expect(visitMark('attended', 'jo@example.com', 7)).toEqual({ status: 'attended', markedAt: 7, markedBy: 'jo@example.com', updatedAt: 7 });
    // Undo is the whole document without the mark's fields (and never the reader's `id`): written as a replace, they are gone.
    const undone = visitUnmarked(visit({ status: 'missed', markedAt: 3, markedBy: 'sam@example.com' }), 8);
    for (const k of ['status', 'markedAt', 'markedBy', 'id']) expect(k in undone).toBe(false);
    expect(undone).toMatchObject({ title: 'Cleaning', personId: 'p1', remindBefore: [1440, 120], updatedAt: 8 });
    expect(cleanRemindBefore([0, 30, 60, 120, 1440])).toEqual([1440, 120, 60, 30]);
  });

  test('toVisit reads defensively', () => {
    const v = toVisit('v9', { kind: 'nonsense', title: 'X', at: AT, prep: ['a', 3], followUp: { every: 3, unit: 'month' }, status: 'gone' }, 'p1');
    expect(v).toMatchObject({ id: 'v9', personId: 'p1', kind: 'other', prep: ['a'], followUp: { every: 3, unit: 'month' }, remindBefore: [1440, 120] });
    expect(v.status).toBeUndefined();
  });

  test('state, end and follow-up', () => {
    expect(visitState(visit(), NOW)).toBe('upcoming');
    expect(visitState(visit(), AT + 30 * 60_000)).toBe('now');
    expect(visitState(visit(), AT + 2 * 3_600_000)).toBe('unmarked');
    expect(visitState(visit({ status: 'missed' }), AT)).toBe('missed');
    expect(visitEnd(visit({ minutes: 30 }))).toBe(AT + 30 * 60_000);
    const v = visit({ followUp: { every: 3, unit: 'month' } });
    expect(followUpDay(v)).toBe('2031-08-15');
    expect(followUpOpen(v, [], NOW)).toBe(false);
    expect(followUpOpen(v, [], AT + 2 * 3_600_000)).toBe(true);
    expect(followUpOpen(v, [{ followUpOf: 'v1' }], AT + 2 * 3_600_000)).toBe(false);
    expect(followUpOpen({ ...v, followUpDoneAt: AT }, [], AT + 2 * 3_600_000)).toBe(false);
    expect(followUpOpen({ ...v, status: 'missed' }, [], AT + 2 * 3_600_000)).toBe(false);
  });
});

describe('publishing', () => {
  test('the agenda item says only "Appointment for Ana"; the rest is calendar detail', () => {
    const item = visitAgendaItem(visit({ prep: ['Fasting from midnight'], medList: true }), { person, audience, household, url, contact: { name: 'Dr. Example', address: '12 Example Street', private: false } });
    expect(item).toMatchObject({ ref: 'visit:p1:v1', kind: 'appointment', title: 'Appointment for Ana', start: AT, end: AT + 3_600_000, allDay: false, who: 'Ana', private: true });
    expect(item.detail).toBeUndefined();
    expect(item.calendarDetail).toBe('Dentist: Cleaning with Dr. Example · 12 Example Street · Fasting from midnight · bring the medicine list');
    expect(visitAgendaItem(visit({ status: 'attended' }), { person, audience, household, url }).status).toBe('done');
    expect(() => personalAgendaDoc('health', item, 'admin@example.com', NOW)).not.toThrow();
  });

  test('reminders the day before and two hours before, to the carers, until it is marked', () => {
    const list = visitReminders(visit({ link: 'https://video.example.com/1' }), { person, audience, household, url, recipients: ['jo@example.com'], now: NOW, contact: { name: 'Dr. Example', private: false } });
    expect(list.map((r) => r.at)).toEqual([AT - 86_400_000, AT - 2 * 3_600_000]);
    expect(list[0]).toMatchObject({ app: 'health', title: 'Appointment for Ana', recipients: ['jo@example.com'], ref: 'health:visit:v1', private: true, audience });
    expect(list[0].body).toBe('Tomorrow at 10 AM: Dentist: Cleaning with Dr. Example, Video visit.');
    expect(list[1].body).toBe('At 10 AM: Dentist: Cleaning with Dr. Example, Video visit.');
    expect(visitReminders(visit(), { person, audience, household, url, recipients: ['jo@example.com'], now: AT - 3_600_000 })).toHaveLength(0);
    expect(visitReminders(visit({ status: 'attended' }), { person, audience, household, url, recipients: ['jo@example.com'], now: NOW })).toHaveLength(0);
    expect(visitReminders(visit(), { person, audience, household, url, recipients: [], now: NOW })).toHaveLength(0);
  });

  test('an all-day visit is reminded at 9 AM the day before and 8 AM on the day', () => {
    const day = local(2031, 5, 15);
    expect(reminderTimes(visit({ at: day, allDay: true }))).toEqual([day - 15 * 3_600_000, day + 8 * 3_600_000]);
    expect(visitWhen(visit({ at: day, allDay: true }), day - 15 * 3_600_000)).toBe('Tomorrow');
  });

  test('a follow-up to book: due two weeks before, Booked and Not needed mark the visit', () => {
    const v = visit({ followUp: { every: 3, unit: 'month' } });
    const after = AT + 2 * 3_600_000;
    const todo = followUpTodo(v, [], { person, audience, url, givers: ['jo@example.com'], now: after })!;
    expect(todo).toMatchObject({ ref: 'followup:p1:v1', title: 'Book a follow-up for Ana', detail: 'Around Aug 15', due: local(2031, 8, 1), who: 'Ana' });
    expect(todo.done!.ops).toEqual([{ col: 'healthPeople/p1/visits', id: 'v1', data: { followUpDoneAt: '$now', updatedAt: '$now' }, merge: true }]);
    expect(todo.done).toMatchObject({ label: 'Booked', roles: ['admin'], emails: ['jo@example.com'] });
    expect(todo.cancel!.label).toBe('Not needed');
    expect(todoOpsAllowed('health', todo.done!.ops)).toBe(true);
    expect(() => todoDoc('health', todo, 'jo@example.com', after)).not.toThrow();
    expect(followUpTodo(v, [], { person, audience, url, givers: [], now: NOW })).toBeNull();
  });

  test('a server passes its local frame, so the words name the household\'s day', () => {
    const shift = 5 * 3_600_000;
    const atUtc = AT; // absolute
    const v = visit({ at: atUtc });
    const [first] = visitReminders(v, { person, audience, household, url, recipients: ['jo@example.com'], now: NOW, local: (t) => t - shift });
    expect(first.at).toBe(AT - 86_400_000);
    expect(first.body?.startsWith('Tomorrow at 5 AM')).toBe(true);
  });

  test("an untitled visit says its kind in the reader's language", async () => {
    await loadLang('es');
    const v = toVisit('v1', { ...visitDoc({ personId: 'p1', kind: 'eye', at: AT }, { createdAt: NOW, by: 'a@example.com' }) }, 'p1');
    expect(withLang('en', () => visitTitle(v))).toBe('Eye doctor');
    expect(withLang('es', () => visitWhat(v, { name: 'Dr. Example' }))).toBe('Oculista con Dr. Example');
    expect(withLang('en', () => visitWhat(visit({ kind: 'other', title: 'Hearing test' })))).toBe('Hearing test');
  });

  test('words in Spanish and Dutch', async () => {
    await loadLang('es');
    await loadLang('nl');
    expect(withLang('es', () => visitAgendaItem(visit(), { person, audience, household, url }).title)).toBe('Cita para Ana');
    expect(withLang('nl', () => leadWords(1440))).toBe('De dag ervoor');
    expect(withLang('en', () => leadWords(120))).toBe('2 hours before');
    expect(withLang('en', () => leadWords(10080))).toBe('A week before');
  });
});

describe('calendar import', () => {
  test('kinds from titles in three languages', () => {
    expect(guessVisitKind('Dentist cleaning')).toBe('dentist');
    expect(guessVisitKind('Tandarts controle')).toBe('dentist');
    expect(guessVisitKind('Eye exam')).toBe('eye');
    expect(guessVisitKind('Blood work at Example Lab')).toBe('lab');
    expect(guessVisitKind('Flu shot')).toBe('vaccine');
    expect(guessVisitKind('Physio')).toBe('therapy');
    expect(guessVisitKind('Cardiology follow-up')).toBe('specialist');
    expect(guessVisitKind('Annual physical with Dr. Example')).toBe('checkup');
    expect(guessVisitKind('Huisarts')).toBe('checkup');
    expect(guessVisitKind('Coffee')).toBe('other');
  });

  test('the person a title names, by full, first or last name; never assumed', () => {
    const people = [{ id: 'p1', name: 'Ana Example' }, { id: 'p2', name: 'Noor' }];
    expect(namedIn("Ana's dentist", people)?.id).toBe('p1');
    expect(namedIn('Dentist for Example', people)?.id).toBe('p1');
    expect(namedIn('Noor checkup', people)?.id).toBe('p2');
    expect(namedIn('Dentist', people)).toBeNull();
    expect(namedIn('Dentist', [people[1]])).toBeNull();
    expect(namedIn('Ana and Noor: flu shots', people)).toBeNull();
    expect(namedIn('Anabel checkup', people)).toBeNull();
    expect(visitCalendarWords('nl')).toContain('tandarts');
    expect(visitCalendarWords('en')).not.toContain('tandarts');
  });
});

describe('who reads and who is told', () => {
  const h = { members: ['sam@example.com', 'jo@example.com', 'kid@example.com', 'alex@example.com'], roles: { 'jo@example.com': 'helper' as const, 'kid@example.com': 'kid' as const } };
  test('admins and the readers who are members and not kids', () => {
    expect(personAudience({ readers: ['jo@example.com', 'kid@example.com', 'gone@example.com'] }, h)).toEqual(['jo@example.com', 'sam@example.com']);
  });
  test('reminded: the carers who are not kids, else the person, else the first admin', () => {
    expect(visitRecipients({ carers: ['Jo@example.com', 'kid@example.com'] }, h)).toEqual(['jo@example.com']);
    expect(visitRecipients({ carers: ['kid@example.com'], email: 'alex@example.com' }, h)).toEqual(['alex@example.com']);
    expect(visitRecipients({ carers: [], email: 'kid@example.com' }, h)).toEqual(['sam@example.com']);
  });
});

describe('a private doctor in what is published', () => {
  const h = { members: ['sam@example.com', 'jo@example.com', 'alex@example.com'], roles: { 'jo@example.com': 'helper' as const } };
  const doctor = { name: 'Dr. Example', address: '1 Example Way', private: true };
  test('named only when no helper reads it', () => {
    expect(publishedContact(doctor, ['jo@example.com', 'sam@example.com'], h)).toBeUndefined();
    expect(publishedContact(doctor, ['alex@example.com', 'sam@example.com'], h)).toEqual({ name: 'Dr. Example', address: '1 Example Way' });
    expect(publishedContact({ ...doctor, private: false }, ['jo@example.com', 'sam@example.com'], h)).toEqual({ name: 'Dr. Example', address: '1 Example Way' });
    expect(publishedContact({ name: 'Old' }, ['jo@example.com'], h)).toBeUndefined();
  });
});

describe('publishing never names a private doctor to a helper carer', () => {
  test('agenda and reminders drop it on their own when a helper reads them', () => {
    const doctor = { name: 'Dr. Private', address: '9 Example Lane', private: true };
    const item = visitAgendaItem(visit(), { person, audience, household, url, contact: doctor });
    const reminders = visitReminders(visit(), { person, audience, household, url, contact: doctor, recipients: ['jo@example.com'], now: NOW });
    expect(JSON.stringify([item, ...reminders])).not.toContain('Private');
    expect(JSON.stringify([item, ...reminders])).not.toContain('9 Example Lane');
    const staffOnly = visitAgendaItem(visit(), { person, audience: ['admin@example.com'], household, url, contact: doctor });
    expect(staffOnly.calendarDetail).toContain('Dr. Private');
  });
});
