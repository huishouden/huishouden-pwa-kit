/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row and the one-line
 * hint before Google's first permission window. Built on `findCalendarEvents` in `../calendar`.
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
