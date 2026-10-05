import { hasTag, sameJson, shows, TAG, type Json, type Op } from './outbox-codec.js';

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
export function opsToRepeat(ops: readonly Op[], doc: DocState, at: number): Op[] {
  if (doc.exists && doc.updatedAt !== undefined && doc.updatedAt >= at) return [];
  const from = ops.findIndex((op, i) => needed(op, ops.slice(i + 1), doc));
  if (from < 0) return [];
  const out: Op[] = [];
  let created = doc.exists;
  for (const op of ops.slice(from)) {
    if (doc.queued && op.kind !== 'delete' && hasTag(op.data, 'increment')) continue;
    if (op.kind === 'delete') created = false;
    else if (op.kind === 'set') created = true;
    else if (!created) continue;
    out.push(op);
  }
  return out;
}

/** Whether `op` is still needed, with `later` (the note's later writes to the document) judged on their own. */
function needed(op: Op, later: readonly Op[], doc: DocState): boolean {
  if (later.some((l) => l.kind === 'delete' || (l.kind === 'set' && !l.merge && !l.mergeFields))) return false;
  if (op.kind === 'delete') return doc.exists;
  if (!doc.exists) return op.kind === 'set';
  if (doc.queued && hasTag(op.data, 'increment')) return false;
  if (doc.data === null) return true;
  const update = op.kind === 'update';
  if (op.kind === 'set' && !op.merge && !op.mergeFields && !later.length) return !sameJson(doc.data, op.data);
  const own = withoutOverwritten(op.data, later, update);
  if (own === null) return true;
  // Every field already as the note sets it: landed or queued. Anything else is written again (a
  // plain value, arrayUnion, arrayRemove or deleteField twice is harmless).
  return !shows(doc.data, own, update);
}

/** `data` without the fields a later write sets again (a later merge's map merges in, so it doesn't count). */
function withoutOverwritten(data: Json, later: readonly Op[], update: boolean): Json | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(data)) {
    const overwritten = later.some((l) => {
      if (l.kind === 'delete' || l.data === null || typeof l.data !== 'object' || Array.isArray(l.data) || !(key in l.data)) return false;
      if (l.kind === 'update' || update) return true;
      const v = l.data[key];
      return !(v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v[TAG] !== 'string');
    });
    if (!overwritten) out[key] = value;
  }
  return out;
}
