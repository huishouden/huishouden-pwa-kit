import { describe, expect, test } from 'bun:test';
import { DELETE_FIELD, agendaDoc, agendaOpsAllowed, canEdit, cleanSeries, fillEditOps, toAgendaItem, type AgendaEdit } from '../src/agenda-core';

const series = { rule: { freq: 'week' as const, every: 1, start: '2031-09-04' }, time: '07:00', minutes: 30, original: '2031-10-02', through: '2031-10-30' };
const reschedule = { ops: [{ col: 'homeEvents', id: 'bins', data: { exceptions: { '2031-10-02': { moved: { date: '$date', time: '$time' } } }, updatedAt: '$now' }, merge: true }], roles: ['admin' as const, 'member' as const] };
const input = { ref: 'event:bins', kind: 'other' as const, title: 'Garbage pickup', start: Date.parse('2031-10-02T07:00:00+02:00'), allDay: false, url: 'https://example.com/home/', private: false, series, edit: { reschedule } };

describe('series and edits on agenda items', () => {
  test('stored as given, read back the same', () => {
    const doc = agendaDoc('home', input, 'admin@example.com', 1);
    expect(doc.series).toEqual(series);
    expect(doc.edit?.reschedule?.ops).toHaveLength(1);
    expect(toAgendaItem('x', doc as unknown as Record<string, unknown>).edit).toEqual(doc.edit);
  });

  test('a series that is not a schedule is refused; stray keys are dropped', () => {
    expect(() => agendaDoc('home', { ...input, series: { ...series, rule: { freq: 'day' } } as never }, 'a@example.com')).toThrow();
    expect(cleanSeries({ ...series, extra: 1 })).toEqual(series);
    expect(cleanSeries({ ...series, time: '25:00' })).toBeUndefined();
  });

  test('an edit writing outside the app’s collections is refused', () => {
    const bad: AgendaEdit = { rename: { ops: [{ col: 'bills', id: 'x', data: { paid: true } }], roles: ['admin'] } };
    expect(() => agendaDoc('home', { ...input, edit: bad }, 'a@example.com')).toThrow(/outside home/);
    expect(agendaOpsAllowed('home', [{ col: 'homeEvents', id: '../x', data: {} }])).toBe(false);
    expect(agendaOpsAllowed('bills', [{ col: 'bills', id: 'x', data: {} }])).toBe(false);
    // Read defensively: a stored one that writes elsewhere is simply not there.
    expect(toAgendaItem('x', { app: 'home', edit: bad }).edit).toBeUndefined();
  });

  test('who may: the roles named, or the members named', () => {
    const item = toAgendaItem('x', { app: 'home', edit: { reschedule: { ...reschedule, roles: ['admin'], emails: ['Helper@Example.com'] } } });
    expect(canEdit(item, 'reschedule', 'admin', 'a@example.com')).toBe(true);
    expect(canEdit(item, 'reschedule', 'member', 'm@example.com')).toBe(false);
    expect(canEdit(item, 'reschedule', 'helper', 'helper@example.com')).toBe(true);
    expect(canEdit(item, 'rename', 'admin', 'a@example.com')).toBe(false);
  });

  test('placeholders filled from the change; an all-day move removes the time', () => {
    const [op] = fillEditOps(reschedule.ops, { date: '2031-10-03', time: '08:00' });
    expect(op.data).toEqual({ exceptions: { '2031-10-02': { moved: { date: '2031-10-03', time: '08:00' } } }, updatedAt: '$now' });
    const [allDay] = fillEditOps(reschedule.ops, { date: '2031-10-03', time: null });
    expect((allDay.data as { exceptions: Record<string, { moved: { time: string } }> }).exceptions['2031-10-02'].moved.time).toBe(DELETE_FIELD);
    expect(() => fillEditOps(reschedule.ops, { title: 'x' })).toThrow();
  });
});
