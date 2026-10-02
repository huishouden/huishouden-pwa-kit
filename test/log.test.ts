import { describe, expect, test } from 'bun:test';
import { dailyCounts, latest, onDay, recent, running, spans, timeWithin } from '../src/log';
import { HOUR, MINUTE } from '../src/time';

const day = new Date(2031, 2, 14).getTime(); // midnight, local
const now = day + 15 * HOUR;
type E = { id: string; kind: 'feed' | 'sleep' | 'diaper'; at: number; endAt?: number | null };
const entries: E[] = [
  { id: 'f1', kind: 'feed', at: day + 7 * HOUR },
  { id: 'f2', kind: 'feed', at: day + 12 * HOUR + 50 * MINUTE },
  { id: 'later', kind: 'feed', at: now + HOUR },
  { id: 's1', kind: 'sleep', at: day - 2 * HOUR, endAt: day + 4 * HOUR },
  { id: 's2', kind: 'sleep', at: day + 14 * HOUR, endAt: null },
  { id: 'd1', kind: 'diaper', at: day - 26 * HOUR },
];
const feed = (e: E) => e.kind === 'feed';
const sleep = (e: E) => e.kind === 'sleep';

describe('latest and running', () => {
  test('the newest up to now, of one kind', () => {
    expect(latest(entries, now, feed)?.id).toBe('f2');
    expect(latest(entries, now)?.id).toBe('s2');
    expect(latest(entries, now, (e) => e.kind === 'diaper')?.id).toBe('d1');
    expect(latest([], now)).toBeNull();
  });

  test('running: the newest timed one without an end', () => {
    expect(running(entries, now, sleep)?.id).toBe('s2');
    expect(running(entries, day + 5 * HOUR, sleep)).toBeNull();
  });
});

describe('days', () => {
  test('onDay: that calendar day, newest first', () => {
    expect(onDay(entries, now, feed).map((e) => e.id)).toEqual(['later', 'f2', 'f1']);
    expect(onDay(entries, day - HOUR).map((e) => e.id)).toEqual(['s1']);
  });

  test('recent: whole calendar days back from today', () => {
    expect(recent(entries, now, 1).map((e) => e.id)).toEqual(['later', 's2', 'f2', 'f1']);
    expect(recent(entries, now, 2).map((e) => e.id)).toEqual(['later', 's2', 'f2', 'f1', 's1']);
  });

  test('dailyCounts: one per day oldest first, from the start of the first day', () => {
    expect(dailyCounts(entries, now, 3)).toEqual([
      { day: '2031-03-12', count: 1 },
      { day: '2031-03-13', count: 1 },
      { day: '2031-03-14', count: 4 },
    ]);
    expect(dailyCounts(entries, now, 2, feed).map((d) => d.count)).toEqual([0, 3]);
  });
});

describe('spans', () => {
  test('timed entries overlapping a range, running ones up to now', () => {
    const s = spans(entries, day, day + 24 * HOUR, now, sleep);
    expect(s.map((x) => [x.entry.id, x.running])).toEqual([
      ['s2', true],
      ['s1', false],
    ]);
    expect(s[0].end).toBe(now);
  });

  test('timeWithin clips to the range and to now', () => {
    // s1 from midnight to 4:00 (4 h), s2 from 14:00 to now 15:00 (1 h).
    expect(timeWithin(entries, day, day + 24 * HOUR, now, sleep)).toBe(5 * HOUR);
    expect(timeWithin(entries, day - 24 * HOUR, day, now, sleep)).toBe(2 * HOUR);
  });
});
