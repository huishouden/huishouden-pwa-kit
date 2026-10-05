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
export const FRESH_MS = 6 * 60 * 60 * 1000;

const PREFIX = 'hh-published:';
const VOLATILE = new Set(['updatedAt', 'createdAt', 'by']);

/** Where the notes live: `localStorage` unless a caller passes its own (`published` in the write options), or null for none. */
export type PublishedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** The store a write option names: `undefined` means this page's `localStorage` (none outside a browser). */
export function publishedStore(option: PublishedStorage | null | undefined): PublishedStorage | null {
  if (option !== undefined) return option;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function project(db: Firestore): string {
  try {
    return db.app?.options?.projectId ?? db.app?.name ?? '';
  } catch {
    return '';
  }
}

/** The note's key: one per project, household, list, app and person. */
export function publishedKey(db: Firestore, householdId: string, list: string, app: string, by: string): string {
  return `${PREFIX}${project(db)}:${householdId}:${list}:${app}:${by.trim().toLowerCase()}`;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

/** FNV-1a over the items' JSON (ids sorted, volatile fields left out): equal items, equal print. */
export function fingerprint(wanted: Iterable<[string, object]>, extra = ''): string {
  const rows = [...wanted]
    .map(([id, data]) => [id, sortKeys(Object.fromEntries(Object.entries(data).filter(([k]) => !VOLATILE.has(k))))] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const text = JSON.stringify([extra, rows]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}.${rows.length}`;
}

/** Whether this device completed a sync of exactly these items under `key` less than `FRESH_MS` ago. */
export function alreadyPublished(store: PublishedStorage | null, key: string, print: string, now: number): boolean {
  if (!store) return false;
  try {
    const raw = store.getItem(key);
    if (!raw) return false;
    const note = JSON.parse(raw) as { p?: unknown; at?: unknown };
    return note.p === print && typeof note.at === 'number' && note.at <= now && now - note.at < FRESH_MS;
  } catch {
    return false;
  }
}

/** Notes that the sync of these items under `key` completed. */
export function rememberPublished(store: PublishedStorage | null, key: string, print: string, now: number): void {
  try {
    store?.setItem(key, JSON.stringify({ p: print, at: now }));
  } catch {
    // Storage full or unavailable: the next open reads again, as before.
  }
}

/**
 * The whole protocol for a sync: `skipped()` when this device published exactly `print` under `key`
 * within `FRESH_MS`, else `run()` and, once it has finished, the note.
 */
export async function unlessPublished<R>(store: PublishedStorage | null, key: string, print: string, now: number, skipped: () => R, run: () => Promise<R>): Promise<R> {
  if (alreadyPublished(store, key, print, now)) return skipped();
  const result = await run();
  rememberPublished(store, key, print, now);
  return result;
}

/**
 * Forgets every member's note for one household's list, for one app or (without `app`) every app:
 * a per-record write changed what is stored. Call it before the write, so a write that fails half
 * way leaves no note behind.
 */
export function forgetPublished(store: PublishedStorage | null, db: Firestore, householdId: string, list: string, app?: string): void {
  if (!store) return;
  const prefix = `${PREFIX}${project(db)}:${householdId}:${list}:${app === undefined ? '' : `${app}:`}`;
  try {
    const drop: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(prefix)) drop.push(k);
    }
    for (const k of drop) store.removeItem(k);
  } catch {
    // Nothing to forget.
  }
}
