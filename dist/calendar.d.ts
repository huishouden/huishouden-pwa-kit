import { type Auth } from 'firebase/auth';
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
 * A short-lived token that can read the signed-in person's calendars. Re-confirms their Google
 * account in a popup with the calendar scopes added; the first time, Google asks to allow access.
 */
export declare function calendarAccessToken(auth: Auth): Promise<string>;
interface GoogleEvent {
    id: string;
    summary?: string;
    location?: string;
    description?: string;
    htmlLink: string;
    status?: string;
    start: {
        dateTime?: string;
        date?: string;
    };
    end?: {
        dateTime?: string;
        date?: string;
    };
}
export declare function toMatch(e: GoogleEvent, calendarName: string): CalendarMatch | null;
export interface FindEventsOptions {
    /** Window searched, ms since epoch. Default: a week ago to a year ahead. */
    from?: number;
    to?: number;
    /** At most this many results. Default 10. */
    limit?: number;
}
/**
 * Events in any of the person's calendars matching one of the queries, soonest first. Each query
 * is tried as given and then as `searchPhrases` of it, stopping at the first that matches
 * anything; pass several queries to scan for a theme ("prenatal", "pediatric", ...).
 */
export declare function findCalendarEvents(auth: Auth, queries: string | string[], options?: FindEventsOptions): Promise<CalendarMatch[]>;
export {};
