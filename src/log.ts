/**
 * One-tap logs: a baby's feeds, sleeps and diapers, a pet's meals and doses. Each entry is a moment
 * (`at`, ms) with app fields on top; a timed one (a sleep) has an `endAt`, null while it runs. These
 * answer what a log screen shows: the last one ("last fed 2h 10m ago" with `formatAgo` from
 * `./time`), what is running, a day's entries and totals, and a count per day for a history.
 *
 * Pure: every function takes `now`. `match` narrows to one kind (`(e) => e.kind === 'feed'`).
 * Entries after `now` (a time typed in ahead) are not yet "last".
 */
import { addDays, startOfDay, toYmd, type Ymd } from './time.js';

/** The part of a log entry these functions read. */
export interface LogEntry {
  at: number;
  /** When a timed entry ended; null or missing while it runs (a sleep in progress). */
  endAt?: number | null;
}

type Match<E> = (entry: E) => boolean;
const any = () => true;

/** The newest entry at or before `now` that `match`es, or null. */
export function latest<E extends LogEntry>(entries: readonly E[], now: number, match: Match<E> = any): E | null {
  let best: E | null = null;
  for (const e of entries) if (e.at <= now && match(e) && (!best || e.at > best.at)) best = e;
  return best;
}

/** The newest matching entry that is still running (no `endAt`), or null. */
export function running<E extends LogEntry>(entries: readonly E[], now: number, match: Match<E> = any): E | null {
  const last = latest(entries, now, match);
  return last && last.endAt == null ? last : null;
}

/** Newest first. */
export const newestFirst = <E extends LogEntry>(a: E, b: E): number => b.at - a.at;

/** Matching entries on the calendar day of `day` (local time), newest first. */
export function onDay<E extends LogEntry>(entries: readonly E[], day: number, match: Match<E> = any): E[] {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  return entries.filter((e) => e.at >= start && e.at < end && match(e)).sort(newestFirst);
}

/** Matching entries since the start of the day `days - 1` days before `now` (`days` calendar days with today), newest first. */
export function recent<E extends LogEntry>(entries: readonly E[], now: number, days: number, match: Match<E> = any): E[] {
  const since = startOfDay(addDays(now, -(days - 1)));
  return entries.filter((e) => e.at >= since && match(e)).sort(newestFirst);
}

/** Matching entries per calendar day for the `days` days up to and including today, oldest first. */
export function dailyCounts<E extends LogEntry>(entries: readonly E[], now: number, days: number, match: Match<E> = any): { day: Ymd; count: number }[] {
  const first = startOfDay(addDays(now, -(days - 1)));
  const end = addDays(startOfDay(now), 1);
  const counts = new Map<Ymd, number>();
  for (const e of entries) {
    if (e.at < first || e.at >= end || !match(e)) continue;
    const day = toYmd(e.at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = toYmd(addDays(first, i));
    return { day, count: counts.get(day) ?? 0 };
  });
}

export interface Span<E> {
  entry: E;
  start: number;
  /** The end, or `now` while running. */
  end: number;
  running: boolean;
}

/** Timed entries overlapping [from, to), running ones ending at `now`; newest first. */
export function spans<E extends LogEntry>(entries: readonly E[], from: number, to: number, now: number, match: Match<E> = any): Span<E>[] {
  return entries
    .filter(match)
    .map((entry) => ({ entry, start: entry.at, end: entry.endAt ?? now, running: entry.endAt == null }))
    .filter((s) => s.start < to && s.end > from && s.end >= s.start)
    .sort((a, b) => b.start - a.start);
}

/** Milliseconds the matching timed entries cover inside [from, to), running ones up to `now`. */
export function timeWithin<E extends LogEntry>(entries: readonly E[], from: number, to: number, now: number, match: Match<E> = any): number {
  const until = Math.min(to, Math.max(now, from));
  let total = 0;
  for (const s of spans(entries, from, until, now, match)) total += Math.max(0, Math.min(s.end, until) - Math.max(s.start, from));
  return total;
}
