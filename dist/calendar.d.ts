import type { Auth } from 'firebase/auth';
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
    }
}
/** Search phrases, most specific first: "Get car seat checked at fire station" → "car seat fire station", "car seat", ... */
export declare function searchPhrases(text: string): string[];
/**
 * A token that can read the signed-in person's calendars. The first time, Google asks to allow
 * access in a popup (call from a tap); the token is then reused for its hour.
 */
export declare function calendarAccessToken(auth: Auth): Promise<string>;
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
export {};
