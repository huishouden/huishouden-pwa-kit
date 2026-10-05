import { type Json, type Op } from './outbox-codec.js';
/**
 * Which of a write note's writes to one document to repeat, internal to
 * `@huishouden/pwa-kit/firestore` (see `stillNeeded` there for where `doc` comes from).
 */
/** The document as the replay sees it: the server's copy, or the local cache's. */
export interface DocState {
    exists: boolean;
    /** Its data, encoded; null when it exists but has no JSON form (then every write is repeated). */
    data: Json | null;
    /** Its numeric `updatedAt`, if any. */
    updatedAt?: number;
    /** The local cache shows writes still in Firestore's own queue (not this replay's). */
    queued: boolean;
}
/**
 * `ops` (one note's writes to one document, in order) that are still needed, in order.
 *
 * - A document whose `updatedAt` is at or after the note (`at`) was changed since, by someone or
 *   something newer: none are repeated. Both times come from device clocks, so a writer whose clock
 *   runs ahead of the other member's by more than the time between the two edits still wins.
 * - A write the document already shows (every field as it sets it) landed: not needed. A field a
 *   later write in the note sets again is that write's to judge; a later delete or full set makes
 *   every earlier write unneeded.
 * - Once one write is needed, it and every later write are repeated, so the document never ends at
 *   an earlier write's value.
 * - An increment Firestore's own queue still holds is left to it: repeated, it would count twice.
 * - A missing document gets sets and deletes, and updates only after a set in the note creates it
 *   (an update to a missing document would fail the whole batch).
 */
export declare function opsToRepeat(ops: readonly Op[], doc: DocState, at: number): Op[];
