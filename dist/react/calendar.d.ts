/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row, the one-line
 * hint before Google's first permission window, and suggestions of new events found when the app
 * opens. Built on `findCalendarEvents` in `../calendar`.
 *
 * `app` is the app's short name ("Baby"): it words the hint and keys whether this browser has
 * already been asked (`<app>-calendar-allowed` in localStorage).
 */
import { type ReactNode } from 'react';
import type { Auth } from 'firebase/auth';
import { type CalendarMatch, type FindEventsOptions, type ImportedRecord } from '../calendar';
/**
 * Whether calendar search can run: signed in, or a browser test standing in for Google with
 * `window.__mockCalendarEvents` (signed-out sample mode has no account to read).
 */
export declare function calendarAvailable(user: unknown): boolean;
/** Google has already asked this browser for calendar access once. */
export declare const calendarAsked: (app: string) => boolean;
export type CalendarSearchState = {
    status: 'idle';
} | {
    status: 'searching';
} | {
    status: 'done';
    matches: CalendarMatch[];
} | {
    status: 'error';
    message: string;
};
/**
 * One calendar search at a time; a newer search wins. Call `run` straight from a click: the first
 * search opens Google's permission window, which browsers only allow in answer to a tap.
 */
export declare function useCalendarSearch(auth: Auth, app: string): {
    state: CalendarSearchState;
    run: (queries: string | string[], options?: FindEventsOptions) => Promise<void>;
    reset: () => void;
};
/** "Sun, Oct 19, 9:00 AM · Family", in the device's locale. */
export declare function matchWhen(m: CalendarMatch): string;
/** One line before Google's first permission window, or why the search is off. */
export declare function CalendarHint({ app, available }: {
    app: string;
    available: boolean;
}): import("react").JSX.Element | null;
/**
 * "Find in my calendar" inside a dialog: searches for `query` (what the person typed as the title)
 * and hands the picked event back. The first search opens Google's permission window, so it runs on the tap.
 */
export declare function CalendarFind({ auth, app, query, available, onPick }: {
    auth: Auth;
    app: string;
    query: string;
    available: boolean;
    onPick: (m: CalendarMatch) => void;
}): import("react").JSX.Element;
/** The linked calendar event inside a dialog, with a way to unlink it. */
export declare function LinkedEvent({ link, onUnlink }: {
    link?: string;
    onUnlink: () => void;
}): import("react").JSX.Element;
/**
 * Import from calendar: the theme scan's events that are not in the app yet, each with Add, and
 * Add all. `records` are the app's own (appointments, log entries); an added event leaves the
 * list as soon as its record arrives.
 */
export declare function CalendarImportDialog({ state, records, intro, noneFound, allImported, onRetry, onAdd, onClose, children }: {
    state: CalendarSearchState;
    records: ImportedRecord[];
    /** What the scan looks for: "Prenatal, midwife, ultrasound and other baby events from last week to a year ahead." */
    intro: string;
    /** "No baby events found in your calendars." */
    noneFound: string;
    /** "Every baby event in your calendar is already in Baby." */
    allImported: string;
    onRetry: () => void;
    onAdd: (matches: CalendarMatch[]) => void;
    onClose: () => void;
    /** Shown above the events: an app's own suggestions from the same scan (Pet's birthdays). */
    children?: ReactNode;
}): import("react").JSX.Element;
export interface CalendarSuggestionsOptions {
    /** The app's one `Auth` (a new object each render would look again each render). */
    auth: Auth;
    /** The theme words Import from calendar scans for (the app's own list). */
    words: readonly string[];
    /** Whether the app already has a record for this event, e.g. `(m) => isImported(m, appointments)`. */
    isImported: (m: CalendarMatch) => boolean;
    /** The app's short name ("Pet"): keys the dismissals. */
    app: string;
    /** How far ahead to look, in days (default 60). */
    horizonDays?: number;
    /** Most events per scan (default 25). */
    limit?: number;
}
export interface CalendarSuggestionsState {
    /** This device has a calendar token, so a scan can run without asking. False: no suggestions. */
    canScan: boolean;
    /** New events, soonest first: not in the app, not dismissed by this member. */
    suggestions: CalendarMatch[];
    /** "Not this one": never suggest this event to this member again, on this device. */
    dismiss: (m: CalendarMatch) => void;
    /** Look again now (it also looks on its own; see `useCalendarSuggestions`). */
    scan: () => Promise<void>;
}
/**
 * New calendar events that belong in the app, so "add a vet appointment for Biscuit Tuesday at 3"
 * told to an assistant that writes to Google Calendar turns up in Pet without anyone importing it.
 *
 * Looks when the app opens (and when the signed-in member changes), and again when it comes back
 * into view, at most every 30 minutes, for `words` from now to `horizonDays` ahead. Only with a
 * calendar token this device already has (`cachedCalendarToken`): it never opens Google's window,
 * so without one `canScan` is false and there are no suggestions until the member next uses Import
 * from calendar or Find in my calendar. A failed look is silent; the next one tries again.
 *
 * Mount it once in the app's shell, not in a screen that comes and goes, so switching tabs does not
 * look again. Dismissals are kept per member in localStorage (`<app>-calendar-dismissed-<uid>`).
 */
export declare function useCalendarSuggestions({ auth, words, isImported, app, horizonDays, limit }: CalendarSuggestionsOptions): CalendarSuggestionsState;
/**
 * The calm one-line card for new calendar events: "New in your calendar: Vet — Biscuit · Tue 3:00 PM"
 * with Add and Not this one, and "+2 more" opening the rest as a list. Renders nothing without
 * suggestions. `onAdd` is the app's own import (the same as Import from calendar's Add); the event
 * leaves the card at once and stays gone when its record arrives (if none arrives within ten
 * seconds, the save failed and it comes back). After either button, focus stays on the card.
 */
export declare function CalendarSuggestions({ suggestions, onAdd, onDismiss, now }: {
    suggestions: CalendarMatch[];
    onAdd: (m: CalendarMatch) => void;
    onDismiss: (m: CalendarMatch) => void;
    /** For the day words ("Today", "Tue"); default the current time. */
    now?: number;
}): import("react").JSX.Element | null;
