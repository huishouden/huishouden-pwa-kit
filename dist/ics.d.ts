import { type Hhmm, type Ymd } from './time.js';
import { type EventRule } from './schedule.js';
/**
 * iCalendar (RFC 5545) text: a whole calendar for a subscribed feed (`./calendar-export`), or one
 * event for an "Add to calendar" download. Server-safe: no package, no DOM, no Firebase.
 *
 * Timed events are written in the calendar's time zone (`DTSTART;TZID=...`) with a VTIMEZONE built
 * from the runtime's own time zone data, so a 9:00 pickup stays at 9:00 across a clock change. All
 * day events are dates. Repeating events carry an RRULE from the kit's `EventRule` (`ruleToRrule`),
 * EXDATEs for skipped days and RECURRENCE-ID overrides for moved ones. Lines are folded at 75
 * octets and end in CRLF.
 */
export declare const CRLF = "\r\n";
/** Text escaped for a TEXT value: backslash, semicolon, comma and line breaks. */
export declare function escapeText(s: string): string;
/** One content line folded at 75 octets (never inside a UTF-8 character), continuation lines starting with a space. */
export declare function foldLine(line: string): string;
/** "20311105" for a day. */
export declare const icsDate: (day: Ymd) => string;
/** "20311105T143000Z" for an absolute time. */
export declare function icsUtc(t: number): string;
/** "20311105T143000" (local, no zone) for an absolute time on `timeZone`'s wall clock. */
export declare function icsLocal(t: number, timeZone: string): string;
/** The day `t` falls on in `timeZone`. */
export declare function dayIn(t: number, timeZone: string): Ymd;
/** "14:30" on `timeZone`'s wall clock at `t`. */
export declare function clockIn(t: number, timeZone: string): Hhmm;
/** The absolute time of a wall-clock day and time in `timeZone` (the earlier one on a repeated hour; a skipped hour moves forward). */
export declare function zonedTime(day: Ymd, time: Hhmm | undefined, timeZone: string): number;
/**
 * The day an all-day item's stored midnight stands for. The writer's device wrote its own local
 * midnight; in a zone a few hours apart that is late the evening before or early that morning, so
 * the nearest midnight on `timeZone`'s clock is the day.
 */
export declare function allDayOf(t: number, timeZone: string): Ymd;
interface Transition {
    /** Absolute instant of the change. */
    at: number;
    from: number;
    to: number;
}
/** Every offset change in `timeZone` during `year`, found by stepping a week at a time and narrowing to the minute. */
export declare function transitionsIn(timeZone: string, year: number): Transition[];
/**
 * The VTIMEZONE lines for `timeZone`, correct from `fromYear` on: each kind of change (into and out
 * of daylight saving time) as a yearly rule, starting the year before, when the years up to
 * `fromYear + 4` follow one; otherwise each change from two years before to `toYear` listed. A zone without changes gets one
 * STANDARD observance.
 */
export declare function vtimezone(timeZone: string, fromYear: number, toYear?: number): string[];
/**
 * The first day `rule` happens on (its DTSTART): `start` itself when the rule happens then, else
 * the first occurrence after it. Null when it never happens.
 */
export declare function firstOccurrence(rule: EventRule): Ymd | null;
/**
 * The RRULE value for an event rule, counted from `firstOccurrence(rule)`: weeks run Sunday to
 * Saturday (WKST=SU) as the kit counts them; a day of the month past the 28th falls on the last day
 * of shorter months, as the kit's schedules do (the 31st is BYMONTHDAY=-1, the 29th and 30th
 * BYMONTHDAY with BYSETPOS=-1); 29 February falls on the 28th in other years (BYMONTHDAY=-1). `until` is a date for all-day series; a timed one passes `untilUtc`, the
 * last occurrence's absolute start, since RFC 5545 wants UNTIL in UTC then.
 */
export declare function ruleToRrule(rule: EventRule, { untilUtc }?: {
    untilUtc?: number;
}): string;
/** The last day `rule` happens on, or null when it goes on for ever. */
export declare function lastOccurrence(rule: EventRule): Ymd | null;
/** When an event happens: a day (all day), or an absolute time. */
export type IcsWhen = {
    date: Ymd;
} | {
    at: number;
};
export interface IcsAlarm {
    /** Minutes before the start; 0 at the start. */
    minutesBefore: number;
    description: string;
}
export interface IcsEvent {
    /** Stable for the same event in every version of the feed. */
    uid: string;
    summary: string;
    description?: string;
    location?: string;
    url?: string;
    start: IcsWhen;
    /** Exclusive: the day after the last for all-day events. */
    end?: IcsWhen;
    /** The RRULE value (`ruleToRrule`). */
    rrule?: string;
    /** Days (all-day) or absolute starts (timed) of skipped occurrences. */
    exdates?: (Ymd | number)[];
    /** On an override: the original occurrence it replaces (day or absolute start). */
    recurrenceId?: Ymd | number;
    /** Bumped on every change; clients use it to tell newer versions. */
    sequence?: number;
    lastModified?: number;
    status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
    /** Shown as free time (a reminder to do something, not a meeting). */
    transparent?: boolean;
    alarms?: IcsAlarm[];
    categories?: string[];
    /** Extra X- properties ("X-HUISHOUDEN-APP": "home"). */
    x?: Record<string, string>;
}
export interface IcsCalendarOptions {
    /** X-WR-CALNAME: "Huishouden". */
    name: string;
    description?: string;
    /** IANA zone for timed events ("Europe/Amsterdam"); "UTC" writes times in UTC. */
    timeZone: string;
    events: IcsEvent[];
    /** DTSTAMP of every event: when the feed was made. */
    now: number;
    /** How often subscribers should refresh (REFRESH-INTERVAL, X-PUBLISHED-TTL). Default 60 minutes. */
    refreshMinutes?: number;
    /** "-//Huishouden//Calendar//EN" by default. */
    prodId?: string;
    /** METHOD:PUBLISH for a one-event download Outlook opens as an event; leave out for feeds. */
    method?: 'PUBLISH';
    /** The text's language ("nl"), as the calendar's LANGUAGE-less X-WR-LANGUAGE hint some clients read. */
    lang?: string;
}
/** The VEVENT lines of one event (unfolded). */
export declare function veventLines(e: IcsEvent, { timeZone, now }: {
    timeZone: string;
    now: number;
}): string[];
/** A whole VCALENDAR: header, the time zone, every event; folded, CRLF line ends. */
export declare function icsCalendar({ name, description, timeZone, events, now, refreshMinutes, prodId, method, lang }: IcsCalendarOptions): string;
/**
 * What is wrong with iCalendar text, by RFC 5545's structural rules: CRLF line ends, lines of at
 * most 75 octets, components that open and close in order, VERSION and PRODID on the calendar,
 * UID, DTSTAMP and DTSTART on every event, a VTIMEZONE for every TZID used, VALARMs with ACTION
 * and TRIGGER. Empty when it is fine. Used by the tests and by the feed's own self-check.
 */
export declare function icsProblems(text: string): string[];
export {};
