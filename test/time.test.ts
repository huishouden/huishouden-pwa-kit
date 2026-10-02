import { describe, expect, test } from 'bun:test';
import {
  DAY, HOUR, MINUTE, addDays, addMonths, agoWords, daysAgo, daysBetween, daysUntil, dueHeadline, dueState, dueText, dueWords, formatAgo, formatDuration,
  formatHours, formatSpan, fromLocalInput, inDays, isYmd, longDate, midSentence, monthYear, ordinal, parseYmd, relativeDay, shortDate, startOfDay,
  toLocalInput, toYmd, weekday, ymdParts, ymdToTime,
} from '../src/time';

const now = new Date(2031, 3, 15, 9, 30).getTime();
const today = '2031-10-16';
const at = (d: number) => addDays(today, d);

describe('calendar days', () => {
  test('parse rejects malformed and impossible days', () => {
    expect(parseYmd('2031-02-30')).toBeNull();
    expect(parseYmd('2031-3-5')).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
    expect(ymdParts('2032-02-29')).toEqual({ y: 2032, m: 2, d: 29 });
    expect(isYmd('2031-02-29')).toBe(false);
    expect(isYmd(20310229)).toBe(false);
    expect(() => ymdToTime('soon')).toThrow('Not a date');
  });

  test('local midnight round trip', () => {
    expect(toYmd(parseYmd('2031-03-05')!)).toBe('2031-03-05');
    expect(toYmd(new Date(2031, 9, 16, 23, 59).getTime())).toBe('2031-10-16');
    expect(new Date(startOfDay(now)).getHours()).toBe(0);
  });

  test('day arithmetic is exact across DST and year ends, for days and moments', () => {
    expect(addDays('2031-03-08', 1)).toBe('2031-03-09');
    expect(addDays('2031-11-01', 2)).toBe('2031-11-03');
    expect(addDays('2031-12-31', 1)).toBe('2032-01-01');
    expect(toYmd(addDays(now, 1))).toBe('2031-04-16');
    expect(new Date(addDays(now, -1)).getHours()).toBe(0);
    expect(daysBetween('2031-10-16', '2031-10-20')).toBe(4);
    expect(daysBetween('2031-10-16', '2031-10-11')).toBe(-5);
    expect(daysBetween(now, new Date(2031, 3, 16, 0, 1).getTime())).toBe(1);
    expect(daysUntil('2031-04-27', now)).toBe(12);
    expect(daysUntil('2031-04-11', now)).toBe(-4);
    expect(weekday('2031-11-04')).toBe(2);
  });

  test.each([
    ['2031-01-31', 1, undefined, '2031-02-28'],
    ['2032-01-31', 1, undefined, '2032-02-29'],
    ['2031-08-31', 6, undefined, '2032-02-29'],
    ['2031-11-30', 3, undefined, '2032-02-29'],
    ['2031-05-10', -6, undefined, '2030-11-10'],
    ['2031-03-31', -1, undefined, '2031-02-28'],
    ['2031-02-28', 1, 31, '2031-03-31'],
  ] as const)('%s plus %p months (day %p) is %s', (from, n, day, to) => expect(addMonths(from, n, day)).toBe(to));

  test('months on a moment land on local midnight', () => {
    expect(toYmd(addMonths(new Date(2031, 0, 31, 15).getTime(), 1))).toBe('2031-02-28');
  });
});

describe('durations', () => {
  test.each([
    [0, '0m'],
    [59_000, '0m'],
    [35 * MINUTE, '35m'],
    [HOUR, '1h'],
    [2 * HOUR + 10 * MINUTE + 59_000, '2h 10m'],
    [DAY + 3 * HOUR + 5 * MINUTE, '1d 3h'],
    [2 * DAY, '2d'],
    [-5 * MINUTE, '0m'],
  ])('%p ms is %p', (ms, text) => expect(formatDuration(ms)).toBe(text));

  test('ago, short and long', () => {
    expect(formatAgo(now - 30_000, now)).toBe('just now');
    expect(formatAgo(now - 70 * MINUTE, now)).toBe('1h 10m ago');
    expect(agoWords(now - 30_000, now)).toBe('just now');
    expect(agoWords(now - MINUTE, now)).toBe('1 minute ago');
    expect(agoWords(now - 5 * MINUTE, now)).toBe('5 minutes ago');
    expect(agoWords(now - 2 * HOUR, now)).toBe('2 hours ago');
    expect(agoWords(now - 3 * DAY, now)).toBe('3 days ago');
    expect(agoWords(now + HOUR, now)).toBe('just now');
  });

  test('hours', () => {
    expect(formatHours(9 * HOUR + 30 * MINUTE)).toBe('9.5 h');
    expect(formatHours(14 * HOUR)).toBe('14 h');
    expect(formatHours(5 * HOUR + 35 * MINUTE)).toBe('5.6 h');
  });
});

describe('spans', () => {
  test.each([
    [0, '0 days'],
    [1, '1 day'],
    [12, '12 days'],
    [14, '2 weeks'],
    [23, '3 weeks'],
    [60, '8 weeks'],
    [61, '2 months'],
    [96, '3 months'],
    [364, '11 months'],
    [729, '23 months'],
    [800, '2 years'],
    [-18, '2 weeks'],
  ])('rounded down, %p days reads %s', (d, text) => expect(formatSpan(d)).toBe(text));

  test.each([
    [59, '8 weeks'],
    [60, '2 months'],
    [88, '3 months'],
    [365, '12 months'],
  ])('to the nearest month, %p days reads %s', (d, text) => expect(formatSpan(d, { months: 'nearest' })).toBe(text));

  test('days for longer when asked', () => expect(formatSpan(46, { daysUpTo: 90 })).toBe('46 days'));

  test('in and ago', () => {
    expect(inDays(0)).toBe('today');
    expect(inDays(1)).toBe('tomorrow');
    expect(inDays(12)).toBe('in 12 days');
    expect(inDays(23)).toBe('in 3 weeks');
    expect(daysAgo(1)).toBe('yesterday');
    expect(daysAgo(4)).toBe('4 days ago');
  });

  test.each([
    [0, 'Today'],
    [1, 'Tomorrow'],
    [-1, 'Yesterday'],
    [5, 'In 5 days'],
    [-12, '12 days ago'],
  ])('relative day %p is %s', (d, text) => expect(relativeDay(addDays(now, d) + 9 * HOUR, now)).toBe(text));
});

describe('due dates', () => {
  test.each([
    [-1, 'Overdue by 1 day'],
    [-5, 'Overdue by 5 days'],
    [-21, 'Overdue by 3 weeks'],
    [-95, 'Overdue by 3 months'],
    [0, 'Due today'],
    [1, 'Due tomorrow'],
    [4, 'Due in 4 days'],
    [13, 'Due in 13 days'],
    [17, 'Due in 2 weeks'],
    [47, 'Due in 6 weeks'],
    [151, 'Due in 4 months'],
    [800, 'Due in 2 years'],
  ])('%p days', (d, text) => expect(dueText(at(d), today)).toBe(text));

  test('to the nearest month when asked', () => expect(dueText(at(151), today, { months: 'nearest' })).toBe('Due in 5 months'));

  test('states, with the soon window', () => {
    expect(dueState(at(-1), today)).toEqual({ state: 'overdue', days: -1 });
    expect(dueState(at(0), today).state).toBe('today');
    expect(dueState(at(14), today).state).toBe('soon');
    expect(dueState(at(15), today).state).toBe('later');
    expect(dueState(at(15), today, 30).state).toBe('soon');
  });

  test('glanceable headlines', () => {
    expect(dueHeadline('Gutter cleaning', at(-5), today)).toBe('Overdue: gutter cleaning');
    expect(dueHeadline('HVAC filter', at(-5), today)).toBe('Overdue: HVAC filter');
    expect(dueHeadline('Filter change', at(4), today)).toBe('Filter change due in 4 days');
    expect(dueHeadline('Lawn service', at(1), today)).toBe('Lawn service due tomorrow');
    expect(dueHeadline('HOA dues', at(0), today)).toBe('HOA dues due today');
    expect(midSentence(' Gutter cleaning ')).toBe('gutter cleaning');
  });

  test('due words for a list', () => {
    const t = '2031-05-14';
    expect(dueWords('2031-05-14', t)).toBe('Today');
    expect(dueWords('2031-05-15', t)).toBe('Tomorrow');
    expect(dueWords('2031-05-13', t)).toBe('Yesterday');
    expect(dueWords('2031-05-16', t)).toBe('Friday');
    expect(dueWords('2031-05-30', t)).toBe('May 30');
    expect(dueWords('2032-01-04', t)).toBe('Jan 4, 2032');
  });
});

describe('dates as words', () => {
  test('long and short, with the year only when it is not this year', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st', '111th']);
    expect(longDate('2031-11-04', today)).toBe('Tuesday, November 4');
    expect(longDate('2032-02-01', today)).toBe('Sunday, February 1, 2032');
    expect(shortDate('2031-11-04', today)).toBe('Nov 4');
    expect(shortDate('2030-12-02', today)).toBe('Dec 2, 2030');
    expect(shortDate('2031-09-02')).toBe('Sep 2, 2031');
    expect(monthYear('2033-11-04')).toBe('November 2033');
  });

  test('datetime-local inputs', () => {
    expect(toLocalInput(now)).toBe('2031-04-15T09:30');
    expect(fromLocalInput('2031-04-15T09:30')).toBe(now);
    expect(fromLocalInput('')).toBeNull();
  });
});
