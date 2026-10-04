import type { Auth } from 'firebase/auth';
import { type EventRule, type PrepOffset } from './schedule';
import { type Hhmm } from './time';
/**
 * Finds Google Calendar events that match a piece of household data (a task, an appointment), so
 * an app can fill in its date, time and place from the calendar instead of retyping them.
 * Read-only: the app never writes to the calendar.
 */
export declare const CALENDAR_SCOPES: string[];
export interface CalendarMatch {
    id: string;
    title: string;
    /** ms since epoch; for all-day events, local midnight of the day. */
    start: number;
    /** ms since epoch, when the event has an end. */
    end?: number;
    allDay: boolean;
    location: string;
    description: string;
    link: string;
    calendarName: string;
    /** The calendar it is in, for fetching its series. */
    calendarId?: string;
    /** Set on one occurrence of a repeating event: the id of the series. */
    recurringEventId?: string;
    /**
     * When the series began (ms; local midnight for all-day), with `findCalendarEvents(..., { seriesStart: true })`.
     * A yearly birthday entered on the day itself begins on the birth date.
     */
    seriesStart?: number;
}
declare global {
    interface Window {
        /** Browser tests set this to stand in for Google Calendar, which has no emulator. */
        __mockCalendarEvents?: CalendarMatch[];
        /** Browser tests set this to stand in for a calendar token already granted on this device. */
        __mockCalendarToken?: string;
    }
}
/** Search phrases, most specific first: "Get car seat checked at fire station" → "car seat fire station", "car seat", ... */
export declare function searchPhrases(text: string): string[];
/**
 * A token that can read the signed-in person's calendars. The first time, Google asks to allow
 * access in a window (call from a tap); the token is then reused until it ends. It is kept in
 * localStorage until then, so reopening the app within the hour can look for new events
 * (`cachedCalendarToken`) without asking again.
 */
export declare function calendarAccessToken(auth: Auth): Promise<string>;
/**
 * The calendar token this device already has, without asking anyone; null when there is none.
 * Code that runs on its own (when the app opens) uses this and does nothing without one. Browser
 * tests stand in for it with `window.__mockCalendarToken`.
 */
export declare function cachedCalendarToken(auth: Auth): string | null;
interface GoogleEvent {
    id: string;
    summary?: string;
    location?: string;
    description?: string;
    htmlLink: string;
    status?: string;
    recurringEventId?: string;
    start: {
        dateTime?: string;
        date?: string;
    };
    end?: {
        dateTime?: string;
        date?: string;
    };
}
export declare function toMatch(e: GoogleEvent, calendarName: string, calendarId?: string): CalendarMatch | null;
export interface FindEventsOptions {
    /** Window searched, ms since epoch. Default: a week ago to a year ahead. */
    from?: number;
    to?: number;
    /** At most this many results. Default 10. */
    limit?: number;
    /** Also look up when each repeating match's series began (`seriesStart`): one more request per series. */
    seriesStart?: boolean;
    /** Use this token (from `cachedCalendarToken`) instead of asking for one, so the search never opens a window. */
    token?: string;
}
/**
 * Events in any of the person's calendars matching one of the queries, soonest first. Each query
 * is tried as given and then as `searchPhrases` of it, stopping at the first that matches
 * anything; pass several queries to scan for a theme ("prenatal", "pediatric", ...).
 */
export declare function findCalendarEvents(auth: Auth, queries: string | string[], options?: FindEventsOptions): Promise<CalendarMatch[]>;
/**
 * Calendar descriptions often arrive as HTML: line breaks kept, tags dropped, common entities
 * decoded, at most `max` characters (cut with "…") so notes stay within the app's rules.
 */
export declare function plainText(description: string, max?: number): string;
/**
 * What an app keeps from an imported event: its id and link, and either the moment (`at`, for an
 * appointment) or the day (`date`, for a log entry).
 */
export interface ImportedRecord {
    title: string;
    at?: number;
    date?: string;
    calendarEventId?: string;
    calendarLink?: string;
}
/** Whether a record already stands for this event: the same event id or link, or the same title at the same time (or on the same day). */
export declare function isImported(m: CalendarMatch, records: ImportedRecord[]): boolean;
/** Events not yet imported, each once, soonest first. */
export declare function notImported(matches: CalendarMatch[], records: ImportedRecord[]): CalendarMatch[];
/** A readable reason for a failed calendar search; every case offers Try again. */
export declare function calendarError(e: unknown): string;
export { SUGGESTION_RESCAN_MS } from './suggestions';
/** Event ids this household member said "Not this one" to in this app, on this device. */
export declare function dismissedEvents(app: string, member: string): string[];
/** Remembers "Not this one" for an event, so it is never suggested to this member again. */
export declare function dismissEvent(app: string, member: string, eventId: string): string[];
/** Events worth suggesting: not imported, not dismissed, each once, soonest first. */
export declare function newSuggestions(matches: CalendarMatch[], { isImported, dismissed }: {
    isImported: (m: CalendarMatch) => boolean;
    dismissed: readonly string[];
}): CalendarMatch[];
/**
 * When a suggested event is, short enough for one line: "Today 3:00 PM", "Tomorrow 9:30 AM",
 * "Tue 3:00 PM" within the week, then "Tue, Oct 14, 3:00 PM"; all-day events drop the time.
 */
export declare function suggestionWhen(m: CalendarMatch, now: number): string;
/** Occurrences of one repeating calendar event, with the schedule they follow. */
export interface CalendarSeries {
    /** The series id (`recurringEventId`), or the lowercased title when the calendar gave none. */
    key: string;
    title: string;
    /** Soonest first. */
    matches: CalendarMatch[];
    rule: EventRule;
    /** 'HH:MM' when every occurrence starts at the same time; all day or varying times give none. */
    time?: Hhmm;
}
/**
 * Splits matches into repeating events and the rest: occurrences of one series (or, without a
 * series id, with the same title), at least two of them, on dates a schedule fits (`inferRule`).
 * "Garbage pickup" every Thursday becomes one series to add as a regular event; a one-off visit,
 * or a series with a single occurrence in the window, stays in `rest`.
 */
export declare function recurringSeries(matches: CalendarMatch[]): {
    series: CalendarSeries[];
    rest: CalendarMatch[];
};
/** A regular event an app already keeps, as far as comparing it with a calendar series goes. */
export interface ScheduledEvent {
    title: string;
    rule: EventRule;
    time?: Hhmm;
    prep?: {
        offset: PrepOffset;
    };
}
/** How an existing event covers a series. */
export interface SeriesCover<E> {
    event: E;
    /**
     * `occurrences`: the series is the event itself (the same days, rhythm and time). `prep`: it falls
     * before each occurrence, where the thing to do before goes ("Garbage out" the evening before a
     * Monday pickup), with `offset` where it falls.
     */
    as: 'occurrences' | 'prep';
    offset?: PrepOffset;
}
export interface SeriesCoverOptions<E> {
    /** Whether the event is about the same thing as the series (both garbage, say). Only related events cover. */
    related: (series: CalendarSeries, event: E) => boolean;
    /** Share of the series' dates that must fit (default 0.75, so a holiday-shifted one doesn't break it). */
    share?: number;
    /** How far a reminder may be from the thing to do before: days (default 1) and hours (default 2). */
    slackDays?: number;
    slackHours?: number;
}
/**
 * The existing event a calendar series repeats, or null when it is new: a related event whose
 * occurrences fall on the series' dates (at about its time), or whose thing to do before does (the
 * evening-before reminder: within `slackDays` and `slackHours` of the prep's offset). An event
 * with no thing to do before is matched against the day or two before it, when the series reads
 * as a reminder (`looksLikePrep`).
 * Occurrence matches win over prep matches; among events, the first in `events` wins.
 */
export declare function seriesCover<E extends ScheduledEvent>(series: CalendarSeries, events: readonly E[], options: SeriesCoverOptions<E>): SeriesCover<E> | null;
/**
 * Whether a calendar series reads as a reminder to do something before an event rather than the
 * event itself: "Garbage out for Monday pickup", "Put the bins out", "Sacar la basura", "Container
 * buiten zetten", or anything in the evening.
 */
export declare function looksLikePrep(series: Pick<CalendarSeries, 'title' | 'time'>): boolean;
/**
 * Whether two titles name the same thing: the words they share, of all the words in either (filler
 * like "the", "for" left out), reach `threshold`. "Trash pickup" and "trash  Pickup!" do; "Garbage
 * pickup" and "Garbage out for Monday pickup" (2 of 4) don't.
 */
export declare function similarTitles(a: string, b: string, threshold?: number): boolean;
