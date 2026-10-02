import type { Auth } from 'firebase/auth';
/**
 * Reads the person's Google Tasks (read-only), so something said to an assistant ("add eggs to my
 * list": the Gemini app and Google Assistant write Google Tasks) can reach a household list. The
 * app never writes to Google Tasks.
 *
 * Like every Google API here, the token comes from Google Identity Services (`./google-token`):
 * `googleTasksToken` from a tap asks once, then `cachedGoogleTasksToken` lets code that runs on
 * its own (on open, when the app comes back into view) read for the rest of that token's hour,
 * without ever opening a window. Browser tests stand in with `window.__mockGoogleTasks`,
 * `window.__mockGoogleTaskLists` and `window.__mockGoogleTasksToken`.
 */
export declare const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";
export interface GoogleTaskList {
    id: string;
    title: string;
}
export interface GoogleTask {
    id: string;
    /** The Google Tasks list it is in. */
    listId: string;
    title: string;
    notes: string;
    /** Google Tasks keeps only a date ('YYYY-MM-DD'); the time of day is not shared by the API. */
    due?: string;
    /** Last change, ms since epoch. */
    updated: number;
    completed: boolean;
}
declare global {
    interface Window {
        /** Browser tests: the tasks to answer with, all lists together (each carries its `listId`). */
        __mockGoogleTasks?: GoogleTask[];
        /** Browser tests: the task lists to answer with. */
        __mockGoogleTaskLists?: GoogleTaskList[];
        /** Browser tests: a token this device already has. */
        __mockGoogleTasksToken?: string;
    }
}
/** A token that can read Google Tasks: from a tap, asking once; kept for its hour on this device. */
export declare function googleTasksToken(auth: Auth): Promise<string>;
/** The Google Tasks token this device already has, without asking anyone; null when there is none. */
export declare function cachedGoogleTasksToken(auth: Auth): string | null;
interface RawTask {
    id?: string;
    title?: string;
    notes?: string;
    due?: string;
    updated?: string;
    status?: string;
    deleted?: boolean;
    hidden?: boolean;
    parent?: string;
}
/** One task as the API returns it, read defensively; null for deleted, untitled or malformed ones. */
export declare function toGoogleTask(raw: RawTask, listId: string): GoogleTask | null;
/** The person's Google Tasks lists ("My Tasks", "Groceries"), in Google's order. */
export declare function googleTaskLists(token: string): Promise<GoogleTaskList[]>;
export interface GoogleTasksOptions {
    /** Only tasks changed since then (ms), for picking up what is new since the last look. */
    updatedSince?: number;
    /** Include ticked-off tasks (default false). */
    showCompleted?: boolean;
}
/** The open tasks in one list (all pages), oldest change first. */
export declare function googleTasks(token: string, listId: string, { updatedSince, showCompleted }?: GoogleTasksOptions): Promise<GoogleTask[]>;
/** Records that store a Google task's id (`googleTaskId`) once they have taken it in. */
export interface ImportedTaskRecord {
    googleTaskId?: string | null;
}
/** Tasks no record has taken in yet, oldest first. */
export declare function notImportedTasks(tasks: GoogleTask[], records: ImportedTaskRecord[]): GoogleTask[];
export {};
