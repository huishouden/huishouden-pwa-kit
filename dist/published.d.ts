import type { Firestore } from 'firebase/firestore';
/**
 * What this device last published with `syncAgenda`, `syncTodos`, `syncReminders` and their
 * personal forms, so an app that opens again with the same items skips the sync's read.
 *
 * Each sync reads every item the app has published (a query to the server: the cache can't be
 * trusted to be complete) before writing what changed. Apps sync on every open, and most opens
 * change nothing, so most of those reads were for nothing: a tablet opening Pet a dozen times a day
 * read Pet's agenda, to-dos and reminders a dozen times. Now a sync whose items are the same as the
 * last one this device completed, for the same household, app, list and person, within `FRESH_MS`,
 * returns at once. Any change to the items (a record saved, a day passing out of the window, the
 * page's language) syncs as before, and so does the first open after `FRESH_MS`, which repairs
 * anything another device or a server changed in the meantime.
 *
 * The note is a fingerprint of the items (without `updatedAt`, `createdAt` and `by`, which differ
 * from run to run) in `localStorage` (or the store a caller passes as `published`), under
 * `hh-published:<project>:`. A per-record write (`replaceAgenda`, `removeAgenda`, `upsertReminder`,
 * `cancelReminder(s)`, `replaceReminders`, a to-do done) forgets the app's note first, since it
 * changes what is stored without changing what the next sync would compute.
 */
/** How long a completed sync stands in for the next identical one. */
export declare const FRESH_MS: number;
/** Where the notes live: `localStorage` unless a caller passes its own (`published` in the write options), or null for none. */
export type PublishedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
/** The store a write option names: `undefined` means this page's `localStorage` (none outside a browser). */
export declare function publishedStore(option: PublishedStorage | null | undefined): PublishedStorage | null;
/** The note's key: one per project, household, list, app and person. */
export declare function publishedKey(db: Firestore, householdId: string, list: string, app: string, by: string): string;
/** FNV-1a over the items' JSON (ids sorted, volatile fields left out): equal items, equal print. */
export declare function fingerprint(wanted: Iterable<[string, object]>, extra?: string): string;
/** Whether this device completed a sync of exactly these items under `key` less than `FRESH_MS` ago. */
export declare function alreadyPublished(store: PublishedStorage | null, key: string, print: string, now: number): boolean;
/** Notes that the sync of these items under `key` completed. */
export declare function rememberPublished(store: PublishedStorage | null, key: string, print: string, now: number): void;
/**
 * The whole protocol for a sync: `skipped()` when this device published exactly `print` under `key`
 * within `FRESH_MS`, else `run()` and, once it has finished, the note.
 */
export declare function unlessPublished<R>(store: PublishedStorage | null, key: string, print: string, now: number, skipped: () => R, run: () => Promise<R>): Promise<R>;
/**
 * Forgets every member's note for one household's list, for one app or (without `app`) every app:
 * a per-record write changed what is stored. Call it before the write, so a write that fails half
 * way leaves no note behind.
 */
export declare function forgetPublished(store: PublishedStorage | null, db: Firestore, householdId: string, list: string, app?: string): void;
