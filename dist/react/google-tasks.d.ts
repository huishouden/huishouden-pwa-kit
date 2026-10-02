import type { Auth } from 'firebase/auth';
import { type GoogleTask } from '../google-tasks';
import { type SuggestionsState } from './suggestions';
export interface GoogleTasksSuggestionsOptions {
    /** The app's one `Auth`. */
    auth: Auth;
    /** The app's short name ("tasks"): keys the dismissals. */
    app: string;
    /** The Google Tasks lists to look in. */
    listIds: readonly string[];
    /** Whether the app already has this task, e.g. by a stored `googleTaskId`. */
    isImported: (t: GoogleTask) => boolean;
    /** Ignore tasks last changed before this (ms), e.g. when the list was connected. */
    since?: number;
}
/** Open tasks in the chosen lists that the app doesn't have and this member hasn't dismissed, oldest first. */
export declare function useGoogleTasksSuggestions({ auth, app, listIds, isImported, since }: GoogleTasksSuggestionsOptions): SuggestionsState<GoogleTask>;
/** "Due Fri" or "Due Oct 14" for a task with a date. */
export declare function googleTaskDue(t: GoogleTask, now?: number): string | null;
/**
 * The card for new Google Tasks: "New in Google Tasks: Call the dentist · Due Fri · My Tasks", with
 * Add and Not this one (`SuggestionsCard`). `listTitle` names the Google list it came from.
 */
export declare function GoogleTasksSuggestions({ suggestions, listTitle, onAdd, onDismiss, now }: {
    suggestions: GoogleTask[];
    listTitle?: (listId: string) => string | undefined;
    onAdd: (t: GoogleTask) => void;
    onDismiss: (t: GoogleTask) => void;
    now?: number;
}): import("react").JSX.Element;
