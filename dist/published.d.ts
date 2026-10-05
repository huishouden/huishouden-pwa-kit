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
 * from run to run) in `localStorage`, under `hh-published:<project>:`. A per-record write
 * (`replaceAgenda`, `removeAgenda`, `cancelReminders`, a to-do done) forgets the app's note, since
 * it changes what is stored without changing what the next sync would compute.
 */
/** How long a completed sync stands in for the next identical one. */
export declare const FRESH_MS: number;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export declare function setPublishedStorage(storage: StorageLike | null | undefined): void;
/** The note's key: one per project, household, list, app and person. */
export declare function publishedKey(db: Firestore, householdId: string, list: string, app: string, by: string): string;
/** FNV-1a over the items' JSON (ids sorted, volatile fields left out): equal items, equal print. */
export declare function fingerprint(wanted: Iterable<[string, object]>, extra?: string): string;
/** Whether this device completed a sync of exactly these items under `key` less than `FRESH_MS` ago. */
export declare function alreadyPublished(key: string, print: string, now: number): boolean;
/** Notes that the sync of these items under `key` completed. */
export declare function rememberPublished(key: string, print: string, now: number): void;
/** Forgets every person's note for one household's app and list (a per-record write by anyone on this device). */
export declare function forgetPublishedApp(db: Firestore, householdId: string, list: string, app: string): void;
export {};
