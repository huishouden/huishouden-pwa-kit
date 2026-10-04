/**
 * Calendar days and the words for them. Pure: nothing reads the clock, every function takes `now`
 * (ms) or `today` (a `Ymd`), so tests pin them and a demo can run on a fixed day.
 *
 * Two representations, both local time:
 * - a moment, ms since the epoch (`number`): when something happened;
 * - a calendar day, `'YYYY-MM-DD'` (`Ymd`): when something is due. Day arithmetic on these is exact
 *   (no DST or time-zone drift) and month arithmetic clamps to the month's last day.
 * `addDays`, `addMonths` and `daysBetween` take either and give back the same kind.
 */
export declare const MINUTE = 60000;
export declare const HOUR: number;
export declare const DAY: number;
/** 'YYYY-MM-DD', a local calendar day. */
export type Ymd = string;
export declare function daysInMonth(y: number, m: number): number;
/** 'YYYY-MM-DD' to its parts, or null when malformed or not a real day (2031-02-30). */
export declare function ymdParts(s: string | undefined | null): {
    y: number;
    m: number;
    d: number;
} | null;
export declare const isYmd: (s: unknown) => s is Ymd;
export declare const ymd: (y: number, m: number, d: number) => Ymd;
/** The local day containing a moment. */
export declare function toYmd(t: number): Ymd;
/** 'YYYY-MM-DD' to local midnight, or null when malformed or not a real day. */
export declare function parseYmd(s: string | undefined | null): number | null;
/** Local midnight of a calendar day; throws on anything that isn't one. */
export declare function ymdToTime(s: Ymd): number;
/** Local midnight at the start of the day containing `t`. */
export declare function startOfDay(t: number): number;
/** `days` calendar days later: a `Ymd` stays a `Ymd`; a moment becomes local midnight of that day (DST-safe). */
export declare function addDays(s: Ymd, days: number): Ymd;
export declare function addDays(t: number, days: number): number;
/**
 * The same day `months` later (or earlier), clamped to the month's last day: 31 January plus one
 * month is 28 or 29 February. `day` keeps an intended day of month for later steps (the 31st).
 * A moment gives local midnight of the resulting day.
 */
export declare function addMonths(s: Ymd, months: number, day?: number): Ymd;
export declare function addMonths(t: number, months: number, day?: number): number;
/** Whole calendar days from `from` to `to`, negative when `to` is earlier. Moments count by the day they fall on. */
export declare function daysBetween(from: Ymd | number, to: Ymd | number): number;
/** Calendar days from now to a day or moment; negative once it has passed. */
export declare const daysUntil: (due: Ymd | number, now: number) => number;
/** 0 = Sunday. */
export declare const weekday: (s: Ymd) => number;
/** English month names. Kit text uses `monthName` (the active locale); kept for callers that parse English. */
export declare const MONTHS: string[];
/** English weekday names, 0 = Sunday. Kit text uses `weekdayName`. */
export declare const WEEKDAYS: string[];
/** A cached `Intl.DateTimeFormat` in the active locale (or `locale`). */
export declare function dateFormat(options: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat;
/** Month 1-12 in the active locale: "November", "noviembre", "november"; `short`: "Nov", "nov", "nov". */
export declare function monthName(m: number, { short, locale }?: {
    short?: boolean;
    locale?: string;
}): string;
/** Weekday 0-6 (0 = Sunday) in the active locale: "Friday", "viernes", "vrijdag"; `short`: "Fri". */
export declare function weekdayName(day: number, { short, locale }?: {
    short?: boolean;
    locale?: string;
}): string;
/** "1st", "2nd", "23rd" (English); "1.º" (Spanish); "1e" (Dutch): a day of the month as a rank. */
export declare function ordinal(n: number): string;
/** "35m", "1h", "2h 10m", "1d 3h" (Spanish "2 h 10 min", Dutch "2 u 10 min"). Rounds down to the minute; under a minute is "0m". */
export declare function formatDuration(ms: number): string;
/** "just now" under a minute, otherwise "2h 10m ago". */
export declare function formatAgo(at: number, now: number): string;
/** Hours with one decimal, for totals: "9.5 h" ("9,5 h"). */
export declare function formatHours(ms: number): string;
/** "just now", "5 minutes ago", "2 hours ago", "3 days ago": the long form, to the nearest unit. */
export declare function agoWords(at: number, now: number): string;
export interface SpanOptions {
    /** Say days up to this many (default 13: "13 days", then "2 weeks"). */
    daysUpTo?: number;
    /**
     * Months rounded `down` (default: "3 weeks" never means 20 days, weeks run to 60 days so it
     * never says "1 month") or to the `nearest` month (weeks under 60 days, then at least 2 months).
     */
    months?: 'down' | 'nearest';
}
/**
 * "5 days", "3 weeks", "4 months", "2 years" in the active locale ("3 semanas", "3 weken"). The
 * sign is ignored: callers say "in" or "ago". Days under two weeks, weeks under two months, months
 * under two years, then whole years.
 */
export declare function formatSpan(days: number, { daysUpTo, months }?: SpanOptions): string;
/** "today", "tomorrow", "in 12 days", "in 3 weeks". */
export declare function inDays(days: number, options?: SpanOptions): string;
/** "today", "yesterday", "4 days ago", "2 months ago". */
export declare function daysAgo(days: number, options?: SpanOptions): string;
/** "Today", "Tomorrow", "In 5 days", "Yesterday", "12 days ago", by calendar day. */
export declare function relativeDay(t: number, now: number): string;
export type DueState = 'overdue' | 'today' | 'soon' | 'later';
/** Within this many days something counts as "due soon" unless the caller says otherwise. */
export declare const SOON_DAYS = 14;
/** Where a due day stands from `today`, and how many days away it is (negative when overdue). */
export declare function dueState(due: Ymd, today: Ymd, soonDays?: number): {
    state: DueState;
    days: number;
};
/** "Overdue by 5 days", "Due today", "Due tomorrow", "Due in 4 days", "Due in 3 weeks". */
export declare function dueText(due: Ymd, today: Ymd, options?: SpanOptions): string;
/** A title used mid-sentence: "Gutter cleaning" becomes "gutter cleaning"; "HVAC filter" and names that start "McX" stay. */
export declare function midSentence(title: string): string;
/** The glanceable line: "Overdue: gutter cleaning", "Filter change due in 4 days", "Lawn service due today". */
export declare function dueHeadline(title: string, due: Ymd, today: Ymd, options?: SpanOptions): string;
/** "Nov 4" ("4 nov"), with the year when it isn't today's year (or `today` isn't given): "Dec 2, 2030". */
export declare function shortDate(s: Ymd, today?: Ymd): string;
/** "Tuesday, November 4" ("martes, 4 de noviembre"), with the year when it isn't today's year: "Sunday, February 1, 2032". */
export declare function longDate(s: Ymd, today?: Ymd): string;
/** "November 2033" ("noviembre de 2033"). */
export declare function monthYear(s: Ymd): string;
/**
 * A due day as a list shows it: "Today", "Tomorrow", "Yesterday", "Friday" (this week), "May 30",
 * "Jan 4, 2032". `inline` for mid-sentence: "today", "tomorrow", and weekdays as the language writes
 * them ("Friday", "viernes", "vrijdag").
 */
export declare function dueWords(due: Ymd, today: Ymd, { inline }?: {
    inline?: boolean;
}): string;
/** "7:30 PM" ("7:30 p.m.", "19:30"): 12 or 24 hours as the locale says. */
export declare const formatTime: (t: number, locale?: string) => string;
/** "Tuesday, November 4". */
export declare const formatDayLong: (t: number, locale?: string) => string;
/** "Tuesday, November 4, 2031". */
export declare const formatDateLong: (t: number, locale?: string) => string;
/** "Tue, Nov 4" ("mar, 4 nov", "di 4 nov"). */
export declare const formatDayShort: (t: number, locale?: string) => string;
/** "Nov". */
export declare const monthShort: (t: number, locale?: string) => string;
/** "Tue" ("mar", "di"). */
export declare const weekdayShort: (t: number, locale?: string) => string;
/** A calendar day in the active locale: "Apr 22, 2031", "22 abr 2031", "22 apr 2031". */
export declare const formatYmd: (s: Ymd, options?: Intl.DateTimeFormatOptions, locale?: string) => string;
/** Value for <input type="datetime-local">, in local time. */
export declare function toLocalInput(t: number): string;
/** An <input type="datetime-local"> value back to a moment; null when empty or malformed. */
export declare function fromLocalInput(value: string): number | null;
/** 'HH:MM', 24-hour local time of day: '07:00', '19:30'. */
export type Hhmm = string;
export declare const isHhmm: (s: unknown) => s is Hhmm;
/** Minutes after midnight of an 'HH:MM'; throws on anything else. */
export declare function hhmmMinutes(s: Hhmm): number;
/**
 * A day at a time of day, local, as a moment: 19:00 on the day the clocks change is still 19:00 on
 * the wall. Without a time, local midnight. On the one hour a spring-forward day skips, the moment
 * after the gap (02:30 becomes 03:30).
 */
export declare function atTime(day: Ymd, time?: Hhmm): number;
/** The local 'HH:MM' of a moment. */
export declare function toHhmm(t: number): Hhmm;
/** "at 7 PM", "a las 7 p.m." / "a la 1 p.m.", "om 19:00": a time of day after a verb. */
export declare function atClock(time: Hhmm): string;
/** "by 7 PM", "antes de las 7 p.m." / "antes de la 1 p.m.", "vóór 19:00": a deadline. */
export declare function byClock(time: Hhmm): string;
/**
 * "7 PM", "7:30 AM", "12 PM" (noon), "12 AM" (midnight) in English; "7 p.m." in Latin-American
 * Spanish; "19:00" where the locale counts 24 hours (Dutch): how a time is said on a household screen.
 */
export declare function clockWords(time: Hhmm, locale?: string): string;
