/**
 * New things found in one of the member's Google services that belong in the app (calendar events,
 * Google Tasks), offered as suggestions: looked for on open, when the signed-in member changes and
 * when the app comes back into view (at most every `rescanMs`), only with a token this device
 * already has (it never opens Google's window), minus what the app already has and what this member
 * said "Not this one" to. `useCalendarSuggestions` and Google Tasks suggestions are built on it.
 */
import { type ReactNode } from 'react';
import type { Auth } from 'firebase/auth';
import { SUGGESTION_RESCAN_MS, dismissId, dismissedIds } from '../suggestions';
export { SUGGESTION_RESCAN_MS, dismissId, dismissedIds };
export interface SuggestionsOptions<T> {
    auth: Auth;
    /** Where dismissals are kept, per app and service: "pet-calendar", "tasks-google-tasks". */
    source: string;
    /** The token this device already has for the service, or null (never asks). */
    cachedToken: () => string | null;
    /** Fetches the candidates with that token. A failure is silent; the next look tries again. */
    look: (token: string) => Promise<T[]>;
    idOf: (item: T) => string;
    /** Already in the app. */
    isImported: (item: T) => boolean;
    /** Order of the suggestions (default: as `look` returned them). */
    order?: (a: T, b: T) => number;
    rescanMs?: number;
}
export interface SuggestionsState<T> {
    /** This device has a token, so a look can run without asking. False: no suggestions. */
    canScan: boolean;
    /** Not in the app, not dismissed by this member, each once. */
    suggestions: T[];
    /** "Not this one": never suggest it to this member again, on this device. */
    dismiss: (item: T) => void;
    /** Look again now. */
    scan: () => Promise<void>;
}
/**
 * Mount it once in the app's shell, not in a screen that comes and goes, so switching screens does
 * not look again. `look`, `idOf`, `isImported` and `order` may change on every render.
 */
export declare function useSuggestions<T>({ auth, source, cachedToken, look, idOf, isImported, order, rescanMs }: SuggestionsOptions<T>): SuggestionsState<T>;
/** How long an added event stays hidden waiting for its record; a failed save brings it back. */
export declare const ADDED_HIDE_MS = 10000;
/**
 * The calm one-line card for new things from a Google service: "<lead>: <title> · <detail>" with
 * Add and Not this one, and "+2 more" opening the rest as a list. Renders nothing without
 * suggestions. `onAdd` is the app's own import; the item leaves the card at once and stays gone
 * when its record arrives (if none arrives within ten seconds, the save failed and it comes back).
 * After either button, focus stays on the card.
 */
export declare function SuggestionsCard<T>({ suggestions, idOf, titleOf, detailOf, lead, label, moreLabel, icon, onAdd, onDismiss }: {
    suggestions: T[];
    idOf: (item: T) => string;
    titleOf: (item: T) => string;
    /** After the title: when it is, which list it came from; nothing for no detail. */
    detailOf: (item: T) => string | null;
    /** "New in your calendar". */
    lead: string;
    /** The card's accessible name, e.g. "New in your calendar". */
    label: string;
    /** The list of the rest, e.g. "More new calendar events". */
    moreLabel: string;
    icon: ReactNode;
    onAdd: (item: T) => void;
    onDismiss: (item: T) => void;
}): import("react").JSX.Element | null;
