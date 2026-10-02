import { type Ymd } from './time';
/**
 * Things that repeat, in three shapes:
 *
 * - **Calendar schedules** (`Schedule`): `after-done` floats ("change the HVAC filter 3 months after
 *   the last change"); `fixed` is anchored to the calendar ("HOA dues on the 1st of every month",
 *   "insurance renews every 1 February").
 * - **Usage schedules** (`usageDue`): every N months or every N on a meter (miles, hours), whichever
 *   comes first, with the meter's recent pace turning distance into days.
 * - **Renewals** (`renewalDue`, `nextRenewal`): a due date that moves on by whole months from the
 *   old due date, so the anniversary stays put.
 *
 * Pure and day-based: callers pass `today` (a `Ymd`) or `now` (ms). Month steps clamp to the
 * month's last day and keep the anchor's day for later months.
 */
export type Unit = 'day' | 'week' | 'month' | 'year';
export declare const UNITS: readonly Unit[];
export type FixedSchedule = {
    kind: 'fixed';
    every: number;
    unit: Unit;
    anchor: Ymd;
};
export type AfterDoneSchedule = {
    kind: 'after-done';
    every: number;
    unit: Unit;
};
export type Schedule = AfterDoneSchedule | FixedSchedule;
/** The most `every` a schedule may have (the household rules check the same). */
export declare const MAX_EVERY = 99;
/** `n` units after `from`. Months and years clamp to the month's end and keep `day` for later months. */
export declare function addInterval(from: Ymd, n: number, unit: Unit, day?: number): Ymd;
/** The k-th occurrence of a fixed schedule, counted from its anchor (k = 0 is the anchor). */
export declare function occurrence(s: FixedSchedule, k: number): Ymd;
/** The first occurrence of a fixed schedule on or after `day`. */
export declare function occurrenceOnOrAfter(s: FixedSchedule, day: Ymd): Ymd;
/** The first occurrence strictly after `day`. */
export declare const occurrenceAfter: (s: FixedSchedule, day: Ymd) => Ymd;
/** Every occurrence of a fixed schedule from `from` to `to`, both included. */
export declare function occurrences(s: FixedSchedule, from: Ymd, to: Ymd): Ymd[];
/**
 * The first due date for a new or edited schedule. Fixed: the first occurrence on or after today.
 * After-done: one interval after the last time it was done, or today when it never was.
 */
export declare function firstDue(s: Schedule, today: Ymd, lastDone?: Ymd): Ymd;
/**
 * The next due date once it is done on `doneOn`. After-done counts from that day. Fixed moves to
 * the occurrence after both the current due date and the day it was done: doing an overdue job
 * once covers the missed dates, and doing it early covers the coming one.
 */
export declare function nextDueAfterDone(s: Schedule, due: Ymd, doneOn: Ymd): Ymd;
/** "Every 3 months", "Every week", "Every month on the 1st", "Every year on November 2", "Every 2 weeks on Tuesday". */
export declare function describeSchedule(s: Schedule): string;
/** Whether a stored value is a schedule the apps (and the rules) accept. */
export declare function isSchedule(v: unknown): v is Schedule;
/** A reading of a meter (an odometer, an hour meter) on a day. */
export interface MeterReading {
    date: Ymd;
    reading: number;
}
/** The most recent reading: latest date, and on the same day the higher reading. */
export declare function latestReading(points: MeterReading[]): MeterReading | null;
export interface PaceOptions {
    /** How far back the pace looks (default 365 days). */
    windowDays?: number;
    /** Fewer days than this between the first and last point is too little to judge (default 14). */
    minDays?: number;
}
/**
 * Meter units per day, from the oldest reading within `windowDays` of the latest to the latest.
 * Null without two readings `minDays` apart, or when the meter went nowhere.
 */
export declare function dailyPace(points: MeterReading[], { windowDays, minDays }?: PaceOptions): number | null;
export type UsageState = 'overdue' | 'soon' | 'ok' | 'unknown';
/** What a usage schedule needs: either interval, and when (and at what reading) it was last done. */
export interface UsageSchedule {
    everyMonths?: number;
    /** Every this many meter units (miles, kilometres, hours). */
    everyMeter?: number;
    lastDate?: Ymd;
    lastReading?: number;
}
export interface UsageDue {
    state: UsageState;
    /** The time-based due day, when it repeats by time and the last time is known. */
    dueDate: Ymd | null;
    /** Calendar days to `dueDate`; negative once it has passed. */
    daysLeft: number | null;
    /** The reading it is due at, when it repeats by the meter and the last reading is known. */
    dueAt: number | null;
    /** Meter units left to `dueAt` from the latest reading; negative once passed. */
    meterLeft: number | null;
    /** Days until `meterLeft` runs out at the recent pace. */
    meterDays: number | null;
    /** Days until due by whichever comes first; for sorting. Infinity when nothing is known. */
    sortDays: number;
}
export interface UsageOptions {
    /** Within this many days it counts as coming up soon (default 30). */
    soonDays?: number;
    /** Within this share of the meter interval it counts as soon (default 0.1). */
    soonShare?: number;
}
/**
 * When a usage schedule is next due: by time (every N months from the last time), by the meter
 * (every N units from the reading then), whichever comes first. `pace` (units per day, from
 * `dailyPace`) estimates the days the meter has left.
 */
export declare function usageDue(s: UsageSchedule, latest: MeterReading | null, pace: number | null, now: number, { soonDays, soonShare }?: UsageOptions): UsageDue;
/** The last-done fields a visit on `date` (at `reading`) writes, or null when the schedule has a later record. */
export declare function afterUsage(s: Pick<UsageSchedule, 'lastDate' | 'lastReading'>, date: Ymd, reading: number | undefined): Pick<UsageSchedule, 'lastDate' | 'lastReading'> | null;
/** "Every month", "Every 6 months", "Every year", "Every 2 years"; "Once" without an interval. */
export declare function describeMonths(everyMonths: number | undefined): string;
export type RenewalState = 'overdue' | 'soon' | 'ok';
/** Where a renewal stands: overdue once its day has passed, soon within `soonDays` (default 30). */
export declare function renewalDue(dueDate: Ymd, now: number, soonDays?: number): {
    state: RenewalState;
    days: number;
};
/**
 * The due date after renewing: `everyMonths` on from the old due date (the anniversary stays put),
 * stepping past today if it was renewed very late. Null when it doesn't repeat.
 */
export declare function nextRenewal(dueDate: Ymd, everyMonths: number | undefined, now: number): Ymd | null;
