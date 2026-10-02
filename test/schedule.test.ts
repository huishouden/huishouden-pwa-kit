import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/schedules.json';
import usage from './fixtures/usage-due.json';
import {
  addInterval, afterUsage, dailyPace, describeMonths, describeSchedule, firstDue, isSchedule, latestReading, nextDueAfterDone, nextRenewal,
  occurrenceOnOrAfter, occurrences, renewalDue, usageDue, type FixedSchedule, type Schedule, type Unit,
} from '../src/schedule';

describe('intervals', () => {
  for (const c of fixture.addInterval)
    test(`${c.from} + ${c.every} ${c.unit}${c.why ? ` (${c.why})` : ''}`, () => expect(addInterval(c.from, c.every, c.unit as Unit, c.day)).toBe(c.expected));
});

describe('fixed schedules', () => {
  for (const c of fixture.fixed)
    test(`${describeSchedule(c.schedule as Schedule)} from ${c.onOrAfter}${c.why ? ` (${c.why})` : ''}`, () =>
      expect(occurrenceOnOrAfter(c.schedule as FixedSchedule, c.onOrAfter)).toBe(c.expected));

  test('the 31st anchor survives short months over many steps', () => {
    const s: FixedSchedule = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-31' };
    expect(['2031-02-01', '2031-03-01', '2031-07-01', '2031-09-15'].map((d) => occurrenceOnOrAfter(s, d))).toEqual(['2031-02-28', '2031-03-31', '2031-07-31', '2031-09-30']);
    expect(occurrences(s, '2031-02-01', '2031-05-31')).toEqual(['2031-02-28', '2031-03-31', '2031-04-30', '2031-05-31']);
    expect(occurrences(s, '2031-06-01', '2031-06-29')).toEqual([]);
  });
});

describe('marking done', () => {
  for (const c of fixture.done)
    test(`${describeSchedule(c.schedule as Schedule)}, due ${c.due}, done ${c.doneOn}${c.why ? ` (${c.why})` : ''}`, () =>
      expect(nextDueAfterDone(c.schedule as Schedule, c.due, c.doneOn)).toBe(c.expected));
});

describe('first due date', () => {
  test('fixed: the next occurrence on or after today', () => {
    expect(firstDue({ kind: 'fixed', every: 1, unit: 'year', anchor: '2030-11-02' }, '2031-10-16')).toBe('2031-11-02');
  });
  test('after-done: one interval after the last time, or today', () => {
    expect(firstDue({ kind: 'after-done', every: 3, unit: 'month' }, '2031-10-16', '2031-08-01')).toBe('2031-11-01');
    expect(firstDue({ kind: 'after-done', every: 3, unit: 'month' }, '2031-10-16')).toBe('2031-10-16');
  });
});

describe('wording', () => {
  for (const c of fixture.describe) test(c.expected, () => expect(describeSchedule(c.schedule as Schedule)).toBe(c.expected));
  test.each([
    [undefined, 'Once'],
    [12, 'Every year'],
    [24, 'Every 2 years'],
    [6, 'Every 6 months'],
    [1, 'Every month'],
  ])('%p months reads %s', (m, text) => expect(describeMonths(m)).toBe(text));
});

test('only valid schedules pass', () => {
  expect(isSchedule({ kind: 'after-done', every: 3, unit: 'month' })).toBe(true);
  expect(isSchedule({ kind: 'fixed', every: 1, unit: 'year', anchor: '2031-02-01' })).toBe(true);
  expect(isSchedule({ kind: 'fixed', every: 1, unit: 'year' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 0, unit: 'month' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 1.5, unit: 'month' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 100, unit: 'month' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 1, unit: 'decade' })).toBe(false);
  expect(isSchedule(null)).toBe(false);
});

describe('meter readings', () => {
  test('latest date wins; on one day, the higher reading', () => {
    expect(
      latestReading([
        { date: '2031-03-01', reading: 40050 },
        { date: '2031-04-12', reading: 41400 },
        { date: '2031-04-12', reading: 41380 },
        { date: '2030-04-20', reading: 29200 },
      ]),
    ).toEqual({ date: '2031-04-12', reading: 41400 });
    expect(latestReading([])).toBeNull();
    expect(latestReading([{ date: 'soon', reading: 5 }])).toBeNull();
  });

  test('pace from the oldest reading within a year', () => {
    expect(dailyPace([{ date: '2029-01-01', reading: 1000 }, { date: '2030-04-20', reading: 29200 }, { date: '2031-04-12', reading: 41400 }])).toBeCloseTo(12200 / 357, 6);
  });

  test('pace needs two readings at least two weeks apart that moved forward', () => {
    expect(dailyPace([{ date: '2031-04-12', reading: 41400 }])).toBeNull();
    expect(dailyPace([{ date: '2031-04-01', reading: 41000 }, { date: '2031-04-12', reading: 41400 }])).toBeNull();
    expect(dailyPace([{ date: '2031-01-01', reading: 41400 }, { date: '2031-04-12', reading: 41400 }])).toBeNull();
    expect(dailyPace([{ date: '2031-04-01', reading: 41000 }, { date: '2031-04-12', reading: 41400 }], { minDays: 7 })).toBeCloseTo(400 / 11, 6);
  });
});

describe('usage schedules: time or meter, whichever comes first', () => {
  const now = new Date(usage.now).getTime();
  for (const c of usage.cases)
    test(c.label, () => {
      const due = usageDue(c.item, usage.latest, usage.pace, now);
      expect(due.state).toBe(c.state as typeof due.state);
      expect(due.daysLeft).toBe(c.daysLeft);
      expect(due.meterLeft).toBe(c.meterLeft);
    });

  test('without a reading, only time counts; overdue sorts first', () => {
    expect(usageDue({ everyMonths: 6, everyMeter: 5000, lastDate: '2031-01-10', lastReading: 38000 }, null, null, now).meterLeft).toBeNull();
    const over = usageDue({ everyMeter: 3000, lastReading: 38000 }, usage.latest, usage.pace, now);
    const today = usageDue({ everyMonths: 12, lastDate: '2030-04-15' }, usage.latest, usage.pace, now);
    const later = usageDue({ everyMonths: 12, lastDate: '2030-09-01' }, usage.latest, usage.pace, now);
    expect(over.sortDays).toBeLessThan(today.sortDays);
    expect(today.sortDays).toBeLessThan(later.sortDays);
  });

  test('the soon window is the caller’s', () => {
    expect(usageDue({ everyMonths: 12, lastDate: '2030-05-10' }, null, null, now).state).toBe('soon');
    expect(usageDue({ everyMonths: 12, lastDate: '2030-05-10' }, null, null, now, { soonDays: 14 }).state).toBe('ok');
  });

  test('a visit moves the record forward, never back', () => {
    expect(afterUsage({ lastDate: '2030-11-08', lastReading: 37000 }, '2031-04-15', 41500)).toEqual({ lastDate: '2031-04-15', lastReading: 41500 });
    expect(afterUsage({ lastDate: '2030-11-08', lastReading: 37000 }, '2031-04-15', undefined)).toEqual({ lastDate: '2031-04-15' });
    expect(afterUsage({ lastDate: '2031-02-01', lastReading: 39000 }, '2031-01-15', 38500)).toBeNull();
  });
});

describe('renewals', () => {
  const now = new Date('2031-04-15T09:30:00').getTime();
  test('state', () => {
    expect(renewalDue('2031-04-27', now)).toEqual({ state: 'soon', days: 12 });
    expect(renewalDue('2031-04-11', now).state).toBe('overdue');
    expect(renewalDue('2031-06-01', now).state).toBe('ok');
  });
  test('moves on from the old due date, keeping the anniversary, past today', () => {
    expect(nextRenewal('2031-04-27', 12, now)).toBe('2032-04-27');
    expect(nextRenewal('2031-06-01', 6, now)).toBe('2031-12-01');
    expect(nextRenewal('2029-03-31', 12, now)).toBe('2032-03-31');
    expect(nextRenewal('2031-01-31', 1, now)).toBe('2031-04-30');
    expect(nextRenewal('2031-04-27', undefined, now)).toBeNull();
  });
});
