import { type Hhmm, type Ymd } from './time';
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
 * - **Events** (`EventRule`, `eventOccurrences`): things that come and go on a schedule whether or
 *   not anyone does anything (garbage pickup every Thursday, a lawn service every other Friday, the
 *   HOA meeting on the second Tuesday), with one occurrence moved or skipped (`OccurrenceChanges`)
 *   and an optional thing to do before each (`PrepOffset`: put the bins out the evening before).
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
export type EventFreq = 'week' | 'month' | 'year';
export declare const EVENT_FREQS: readonly EventFreq[];
/** Which weekday of the month: the first to the fourth, or -1 for the last. */
export type Nth = 1 | 2 | 3 | 4 | -1;
export declare const NTHS: readonly Nth[];
/**
 * When an event happens. Holidays are not built in: a holiday that shifts one occurrence is a
 * change to that occurrence (`OccurrenceChanges`), entered as data.
 *
 * - `week`: every `every` weeks on `days` (weekdays, 0 = Sunday; default `start`'s), counting
 *   weeks (Sunday to Saturday) from the week of `start`. "Every Thursday", "every other Friday",
 *   "every Monday and Thursday".
 * - `month`: every `every` months from `start`'s month, on `start`'s day of the month (the 31st
 *   falls on the last day of shorter months), or with `nth` on the nth `weekday` ("the third
 *   Tuesday", -1 "the last Friday").
 * - `year`: every `every` years on `start`'s month and day (29 February falls on the 28th).
 *
 * Nothing happens before `start` or after `until`.
 */
export interface EventRule {
    freq: EventFreq;
    every: number;
    start: Ymd;
    days?: number[];
    nth?: Nth;
    weekday?: number;
    until?: Ymd;
}
export declare const EVENT_RULE_KEYS: readonly ["freq", "every", "start", "days", "nth", "weekday", "until"];
/** Whether a stored value is an event rule the apps (and the rules) accept. */
export declare function isEventRule(v: unknown): v is EventRule;
/** The rule as stored: known keys only, days sorted and unique, defaults left out. */
export declare function cleanRule(rule: EventRule): EventRule;
/** The nth `weekday` (0 = Sunday) of a month (`m` 1 to 12), or with -1 the last. */
export declare function nthWeekday(y: number, m: number, nth: Nth, wd: number): Ymd;
/** Which weekday of its month a day is: the 3rd Tuesday, and whether it is also the last one. */
export declare function weekdayOfMonth(day: Ymd): {
    nth: 1 | 2 | 3 | 4 | 5;
    weekday: number;
    last: boolean;
};
/** Every day the rule happens from `from` to `to`, both included, soonest first (at most 1000). */
export declare function ruleOccurrences(rule: EventRule, from: Ymd, to: Ymd): Ymd[];
/** Whether the rule happens on `day`. */
export declare const happensOn: (rule: EventRule, day: Ymd) => boolean;
/**
 * "Every Thursday", "Every other Friday", "Every 3 weeks on Monday", "Every Monday and Thursday",
 * "Every month on the 15th", "Every month on the third Tuesday", "Every 2 months on the last
 * Friday", "Every year on November 2".
 */
export declare function describeRule(rule: EventRule): string;
/** One occurrence changed: moved to another day (and time), or skipped, with an optional note ("Holiday week"). */
export interface OccurrenceChange {
    moved?: {
        date: Ymd;
        time?: Hhmm;
    };
    skipped?: true;
    note?: string;
}
/** Changes keyed by the day the occurrence was originally on, so the schedule itself never changes. */
export type OccurrenceChanges = Record<Ymd, OccurrenceChange>;
/** At most this many changes are kept per event (the rules check the same); the oldest go first. */
export declare const MAX_CHANGES = 100;
export declare const NOTE_MAX = 200;
/** One occurrence as it will happen. */
export interface Occurrence {
    /** The day the schedule puts it on: the key of its change, and its id among the event's occurrences. */
    original: Ymd;
    /** The day it happens: `original`, or the day it was moved to. */
    date: Ymd;
    /** The time of day it happens, when it has one. */
    time?: Hhmm;
    moved: boolean;
    skipped: boolean;
    note?: string;
}
/** A stored change read defensively: null when it says nothing usable. */
export declare function toChange(v: unknown): OccurrenceChange | null;
/** How far an occurrence may be moved, in days either way, so a window search finds every moved one. */
export declare const MAX_MOVE_DAYS = 31;
export interface OccurrenceOptions {
    /** The event's usual time of day; all day without one. */
    time?: Hhmm;
    changes?: OccurrenceChanges | null;
    /** Also return skipped occurrences (marked `skipped`), on their original day. Default false. */
    includeSkipped?: boolean;
}
/**
 * The occurrences that happen from `from` to `to` (both included, by the day they happen on), with
 * each one's change applied: a moved one appears on its new day, even when its original day is
 * outside the window, and a skipped one is left out (or kept, marked, with `includeSkipped`).
 * Changes keyed by a day the rule doesn't happen on are ignored. Soonest first, then by time.
 */
export declare function eventOccurrences(rule: EventRule, from: Ymd, to: Ymd, { time, changes, includeSkipped }?: OccurrenceOptions): Occurrence[];
/** The next occurrence that happens on or after `today` (skipped ones passed over), within `withinDays` (default 400). */
export declare function nextOccurrence(rule: EventRule, today: Ymd, options?: Omit<OccurrenceOptions, 'includeSkipped'> & {
    withinDays?: number;
}): Occurrence | null;
/** When an occurrence starts: its time on its day, or local midnight when it is all day. */
export declare const occurrenceStart: (o: Pick<Occurrence, "date" | "time">) => number;
/** Changes with one more: `change` null clears it. Keeps at most `MAX_CHANGES`, dropping the oldest days first. */
export declare function withChange(changes: OccurrenceChanges | null | undefined, original: Ymd, change: OccurrenceChange | null): OccurrenceChanges;
/** Changes for occurrences before `keepFrom` dropped: what is past no longer needs remembering. */
export declare function pruneChanges(changes: OccurrenceChanges | null | undefined, keepFrom: Ymd): OccurrenceChanges;
/** When the thing to do before is due: `daysBefore` the occurrence's day (0, the day itself), at `time`. */
export interface PrepOffset {
    daysBefore: number;
    time: Hhmm;
}
export declare const MAX_PREP_DAYS = 14;
export declare const isPrepOffset: (v: unknown) => v is PrepOffset;
/** The usual ones, for a picker: the evening before, the morning of. */
export declare const PREP_PRESETS: readonly {
    label: string;
    offset: PrepOffset;
}[];
/** "The evening before at 7 PM", "The morning of, by 7 AM", "2 days before at 9 AM", "The day before at 12 PM". */
export declare function describePrep(offset: PrepOffset): string;
/**
 * The thing to do before an occurrence: due at `deadline`, and missed at `missedAt`, when the
 * event begins (or, for an all-day event or one before the deadline, at the end of its day).
 */
export declare function prepWindow(o: Pick<Occurrence, 'date' | 'time'>, offset: PrepOffset): {
    day: Ymd;
    deadline: number;
    missedAt: number;
};
/**
 * Where a thing to do before stands: `later`; `soon` within `leadHours` (default 24) of its
 * deadline, when it belongs on a to-do list; `due` once the deadline has passed but it can still
 * be done; `missed` once the event has begun; `done`.
 */
export type PrepState = 'later' | 'soon' | 'due' | 'missed' | 'done';
export declare function prepState(window: {
    deadline: number;
    missedAt: number;
}, now: number, done: boolean, leadHours?: number): PrepState;
/** "tonight by 7 PM", "today by 7 AM", "tomorrow by 7 PM", "Wednesday by 7 PM", "Oct 22 by 7 PM". */
export declare function prepWhen(deadline: number, now: number): string;
/**
 * The rule a handful of dates follow, or null when they follow none: the occurrences of a repeating
 * calendar event, say. Weekly (the same weekday, every N weeks: the largest step every gap is a
 * multiple of, so a skipped holiday week doesn't break it), monthly on the same day or the same
 * nth weekday, or yearly. Needs at least two different dates; starts on the first.
 */
export declare function inferRule(dates: Ymd[]): EventRule | null;
/** Something to do before each occurrence ("Take the garbage out"), when, and whether to send a reminder then. */
export interface EventPrep {
    title: string;
    offset: PrepOffset;
    remind: boolean;
}
export declare const PREP_TITLE_MAX = 120;
export declare const isEventPrep: (v: unknown) => v is EventPrep;
