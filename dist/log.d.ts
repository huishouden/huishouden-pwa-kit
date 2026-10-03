/**
 * One-tap logs: a baby's feeds, sleeps and diapers, a pet's meals and doses. Each entry is a moment
 * (`at`, ms) with app fields on top; a timed one (a sleep) has an `endAt`, null while it runs. These
 * answer what a log screen shows: the last one ("last fed 2h 10m ago" with `formatAgo` from
 * `./time`), what is running, a day's entries and totals, and a count per day for a history.
 *
 * Pure: every function takes `now`. `match` narrows to one kind (`(e) => e.kind === 'feed'`).
 * Entries after `now` (a time typed in ahead) are not yet "last".
 */
import { type Ymd } from './time.js';
/** The part of a log entry these functions read. */
export interface LogEntry {
    at: number;
    /** When a timed entry ended; null or missing while it runs (a sleep in progress). */
    endAt?: number | null;
}
type Match<E> = (entry: E) => boolean;
/** The newest entry at or before `now` that `match`es, or null. */
export declare function latest<E extends LogEntry>(entries: readonly E[], now: number, match?: Match<E>): E | null;
/** The newest matching entry that is still running (no `endAt`), or null. */
export declare function running<E extends LogEntry>(entries: readonly E[], now: number, match?: Match<E>): E | null;
/** Newest first. */
export declare const newestFirst: <E extends LogEntry>(a: E, b: E) => number;
/** Matching entries on the calendar day of `day` (local time), newest first. */
export declare function onDay<E extends LogEntry>(entries: readonly E[], day: number, match?: Match<E>): E[];
/** Matching entries since the start of the day `days - 1` days before `now` (`days` calendar days with today), newest first. */
export declare function recent<E extends LogEntry>(entries: readonly E[], now: number, days: number, match?: Match<E>): E[];
/** Matching entries per calendar day for the `days` days up to and including today, oldest first. */
export declare function dailyCounts<E extends LogEntry>(entries: readonly E[], now: number, days: number, match?: Match<E>): {
    day: Ymd;
    count: number;
}[];
export interface Span<E> {
    entry: E;
    start: number;
    /** The end, or `now` while running. */
    end: number;
    running: boolean;
}
/** Timed entries overlapping [from, to), running ones ending at `now`; newest first. */
export declare function spans<E extends LogEntry>(entries: readonly E[], from: number, to: number, now: number, match?: Match<E>): Span<E>[];
/** Milliseconds the matching timed entries cover inside [from, to), running ones up to `now`. */
export declare function timeWithin<E extends LogEntry>(entries: readonly E[], from: number, to: number, now: number, match?: Match<E>): number;
export {};
