import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { HOUR, daysBetween, dueText, dueWords, formatTime, longDate, startOfDay, toYmd, type Ymd, ymdToTime, addDays } from './time.js';

/**
 * The household's agenda: dated things from every app in one collection,
 * `households/{id}/agenda`, so the portal can show one calendar and a Today view without reading
 * any app's own collections. Each app publishes its items here (appointments, due jobs, bills,
 * renewals) and keeps them current; the portal only reads.
 *
 * Every member can read every item, so titles and details are what anyone in the household may see.
 * Fields match the rules exactly (see AGENDA_FIELDS); keep them in step.
 */

export type AgendaKind = 'appointment' | 'due' | 'renewal' | 'bill' | 'birthday' | 'medicine' | 'feeding' | 'task' | 'other';
export const AGENDA_KINDS: readonly AgendaKind[] = ['appointment', 'due', 'renewal', 'bill', 'birthday', 'medicine', 'feeding', 'task', 'other'];

/**
 * For things someone has to do (a job, a bill, a dose): `upcoming` until done, `overdue` once its day
 * has passed, `done`. Leave it out for things that simply happen (an appointment, a birthday).
 */
export type AgendaStatus = 'upcoming' | 'overdue' | 'done';
export const AGENDA_STATUSES: readonly AgendaStatus[] = ['upcoming', 'overdue', 'done'];

export interface AgendaItem {
  id: string;
  /** The app's repo short name ("home"). */
  app: string;
  /** The source record within the app ("job:abc", "appointment:xyz"); one record may give several items. */
  ref: string;
  kind: AgendaKind;
  title: string;
  /** ms since epoch. All-day items start at local midnight of their day. */
  start: number;
  /** ms since epoch, after `start`. All-day items end at local midnight after their last day. */
  end?: number;
  allDay: boolean;
  /** One short line: a place, an amount, "autopay on". */
  detail?: string;
  /** https deep link to the record in the app. */
  url: string;
  /** Who or what it is for: a pet, a person, a car. */
  who?: string;
  status?: AgendaStatus;
  updatedAt: number;
  /** Lowercase email of the member whose app wrote it. */
  by: string;
}

export const AGENDA_FIELDS = ['app', 'ref', 'kind', 'title', 'start', 'end', 'allDay', 'detail', 'url', 'who', 'status', 'updatedAt', 'by'] as const;

/** Maximum lengths, the same as the rules. */
export const AGENDA_LIMITS = { app: 40, ref: 200, title: 120, detail: 200, url: 2000, who: 60, by: 254 } as const;

/** Apps publish items from this many days ago (overdue ones whatever their age)... */
export const AGENDA_PAST_DAYS = 30;
/** ...to this many days ahead. */
export const AGENDA_AHEAD_DAYS = 180;

/** What an app passes in: everything but the bookkeeping the kit fills in. */
export type AgendaInput = Omit<AgendaItem, 'id' | 'app' | 'updatedAt' | 'by'>;

/** An all-day item's `start` (and, for the day after its last, `end`): local midnight of a day. */
export const allDayStart = (day: Ymd): number => ymdToTime(day);

const agendaOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'agenda');

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_');

/** The same id for the same item however often it is published: `<app>_<ref>_<start>`, Firestore-safe. */
export function agendaId(app: string, ref: string, start: number): string {
  return `${safe(app).slice(0, 40)}_${safe(ref).slice(0, 200)}_${Math.round(start)}`;
}

const clip = (s: string | undefined, max: number) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules would refuse. */
export function agendaDoc(app: string, input: AgendaInput, by: string, now = Date.now()): Omit<AgendaItem, 'id'> {
  if (!/^https:\/\//.test(input.url)) throw new Error('Agenda url must be an https deep link into the app.');
  if (!AGENDA_KINDS.includes(input.kind)) throw new Error(`Unknown agenda kind: ${input.kind}`);
  if (input.status !== undefined && !AGENDA_STATUSES.includes(input.status)) throw new Error(`Unknown agenda status: ${input.status}`);
  if (!Number.isFinite(input.start)) throw new Error('Agenda item has no start.');
  const title = clip(input.title, AGENDA_LIMITS.title);
  if (!title) throw new Error('Agenda item has no title.');
  if (!input.ref) throw new Error('Agenda item has no ref.');
  const start = Math.round(input.start);
  const end = input.end !== undefined && Number.isFinite(input.end) && Math.round(input.end) > start ? Math.round(input.end) : undefined;
  const detail = clip(input.detail, AGENDA_LIMITS.detail);
  const who = clip(input.who, AGENDA_LIMITS.who);
  return {
    app,
    ref: input.ref.slice(0, AGENDA_LIMITS.ref),
    kind: input.kind,
    title,
    start,
    ...(end !== undefined ? { end } : {}),
    allDay: input.allDay === true,
    ...(detail ? { detail } : {}),
    url: input.url.slice(0, AGENDA_LIMITS.url),
    ...(who ? { who } : {}),
    ...(input.status ? { status: input.status } : {}),
    updatedAt: now,
    by: by.trim().toLowerCase(),
  };
}

/** The window apps publish: from `AGENDA_PAST_DAYS` ago to `AGENDA_AHEAD_DAYS` ahead, whole days. */
export function agendaWindow(now: number): { from: number; to: number } {
  return { from: addDays(now, -AGENDA_PAST_DAYS), to: addDays(now, AGENDA_AHEAD_DAYS + 1) };
}

/** Whether an item belongs in the published window: overlapping it, or overdue whatever its age. */
export function inAgendaWindow(item: Pick<AgendaItem, 'start' | 'end' | 'status'>, now: number): boolean {
  const { from, to } = agendaWindow(now);
  if (item.start >= to) return false;
  return item.status === 'overdue' || (item.end ?? item.start) >= from;
}

const comparable = ({ updatedAt: _u, by: _b, ...rest }: Omit<AgendaItem, 'id'> & { id?: string }) => {
  delete rest.id;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k as keyof typeof rest]]));
};

type Op = (b: ReturnType<typeof writeBatch>) => void;

async function commit(db: Firestore, ops: Op[]): Promise<void> {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) op(batch);
    await batch.commit();
  }
}

export interface AgendaWriteOptions {
  /** The signed-in member's email. */
  by: string;
  now?: number;
}

export interface AgendaWriteResult {
  written: number;
  deleted: number;
  unchanged: number;
}

/** Makes `stored` (this app's items, or one ref's) exactly `items`, writing only what changed. */
async function reconcile(
  db: Firestore,
  householdId: string,
  app: string,
  stored: { id: string; data: Record<string, unknown> }[],
  items: AgendaInput[],
  { by, now = Date.now() }: AgendaWriteOptions,
): Promise<AgendaWriteResult> {
  const wanted = new Map<string, Omit<AgendaItem, 'id'>>();
  for (const item of items) {
    if (!inAgendaWindow(item, now)) continue;
    wanted.set(agendaId(app, item.ref, item.start), agendaDoc(app, item, by, now));
  }
  const col = agendaOf(db, householdId);
  const ops: Op[] = [];
  let unchanged = 0;
  const have = new Map(stored.map((s) => [s.id, s.data]));
  for (const { id } of stored) if (!wanted.has(id)) ops.push((b) => b.delete(doc(col, id)));
  const deleted = ops.length;
  for (const [id, data] of wanted) {
    const old = have.get(id);
    if (old && comparable(toAgendaItem(id, old)) === comparable({ ...data })) unchanged++;
    else ops.push((b) => b.set(doc(col, id), data));
  }
  await commit(db, ops);
  return { written: ops.length - deleted, deleted, unchanged };
}

const snapshotDocs = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));

/**
 * Makes one source record's items exactly `items` (each gets `ref`): call it when the record is
 * saved. Ids are idempotent, unchanged items are not rewritten, and items this record no longer
 * has (a moved appointment's old time) are deleted. An empty list removes the record's items.
 */
export async function replaceAgenda(
  db: Firestore,
  householdId: string,
  app: string,
  ref: string,
  items: Omit<AgendaInput, 'ref'>[],
  options: AgendaWriteOptions,
): Promise<AgendaWriteResult> {
  const snap = await getDocs(query(agendaOf(db, householdId), where('app', '==', app), where('ref', '==', ref)));
  return reconcile(db, householdId, app, snapshotDocs(snap), items.map((i) => ({ ...i, ref })), options);
}

/** Deletes one source record's items (the record was deleted). */
export async function removeAgenda(db: Firestore, householdId: string, app: string, ref: string): Promise<number> {
  const snap = await getDocs(query(agendaOf(db, householdId), where('app', '==', app), where('ref', '==', ref)));
  await commit(db, snap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)));
  return snap.docs.length;
}

/**
 * Makes everything this app has published exactly `items`: for apps that work out all their dates
 * when they open. Writes only what changed and deletes what is no longer there, so running it on
 * every open costs one read of the app's items and almost no writes.
 */
export async function syncAgenda(db: Firestore, householdId: string, app: string, items: AgendaInput[], options: AgendaWriteOptions): Promise<AgendaWriteResult> {
  const snap = await getDocs(query(agendaOf(db, householdId), where('app', '==', app)));
  return reconcile(db, householdId, app, snapshotDocs(snap), items, options);
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A stored document as an item, read defensively. */
export function toAgendaItem(id: string, data: Record<string, unknown>): AgendaItem {
  const kind = AGENDA_KINDS.includes(data.kind as AgendaKind) ? (data.kind as AgendaKind) : 'other';
  const status = AGENDA_STATUSES.includes(data.status as AgendaStatus) ? (data.status as AgendaStatus) : undefined;
  const end = num(data.end);
  const detail = str(data.detail);
  const who = str(data.who);
  return {
    id,
    app: str(data.app) ?? '',
    ref: str(data.ref) ?? '',
    kind,
    title: str(data.title) ?? '',
    start: num(data.start) ?? 0,
    ...(end !== undefined ? { end } : {}),
    allDay: data.allDay === true,
    ...(detail ? { detail } : {}),
    url: str(data.url) ?? '',
    ...(who ? { who } : {}),
    ...(status ? { status } : {}),
    updatedAt: num(data.updatedAt) ?? 0,
    by: str(data.by) ?? '',
  };
}

const byStart = (a: AgendaItem, b: AgendaItem) =>
  a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title);

export interface AgendaRange {
  /** ms; items ending before this are left out, except overdue ones. */
  from: number;
  /** ms; items starting at or after this are left out. */
  to: number;
  /** Only these apps' items. */
  apps?: string[];
  onError?: (error: Error) => void;
}

/** Follows the household's items overlapping `from`..`to` (and any overdue), soonest first. */
export function watchAgenda(db: Firestore, householdId: string, range: AgendaRange, onChange: (items: AgendaItem[]) => void): Unsubscribe {
  const { from, to, apps, onError } = range;
  return onSnapshot(
    query(agendaOf(db, householdId), where('start', '<', to)),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => toAgendaItem(d.id, d.data()))
          .filter((i) => (!apps || apps.includes(i.app)) && (i.status === 'overdue' || (i.end ?? i.start) >= from))
          .sort(byStart),
      ),
    (error) => onError?.(error),
  );
}

// ---- Reading the agenda: Today and days ----

/**
 * Where an item stands now. Items with a status become overdue once their time passes even if the
 * app that wrote them hasn't been opened since: an all-day one after its last day, a timed one after
 * its start. Items without a status (appointments, birthdays) have none.
 */
export function agendaStatus(item: AgendaItem, now: number): AgendaStatus | undefined {
  if (!item.status || item.status === 'done') return item.status;
  if (item.status === 'overdue') return 'overdue';
  const passed = item.allDay ? lastDay(item) < toYmd(now) : item.start < now;
  return passed ? 'overdue' : 'upcoming';
}

/** The day an item's last moment falls on (an all-day `end` is the midnight after it). */
function lastDay(item: AgendaItem): Ymd {
  if (item.end === undefined) return toYmd(item.start);
  return toYmd(item.allDay ? item.end - 1 : item.end);
}

/** "All day", "3:30 PM", "3:30 PM – 4:30 PM". */
export function agendaTime(item: AgendaItem): string {
  if (item.allDay) return 'All day';
  const start = formatTime(item.start);
  return item.end !== undefined && toYmd(item.end) === toYmd(item.start) ? `${start} – ${formatTime(item.end)}` : start;
}

/** Kinds tied to one occasion: a meal or a dose not given by the end of its day is missed, not still to do. */
const OCCASIONS: readonly AgendaKind[] = ['feeding', 'medicine'];

export type TodayGroup = 'overdue' | 'today' | 'soon';

export interface TodayEntry {
  item: AgendaItem;
  group: TodayGroup;
  /** When, in words: "Overdue by 3 days", "Due today", "3:30 PM", "Tomorrow, 9:00 AM". */
  when: string;
}

export interface TodayOptions {
  /** How far ahead "soon" reaches. Default 48. */
  soonHours?: number;
}

/**
 * What needs attention: overdue things first (oldest first), then today's (all-day first, then by
 * time; finished appointments left out), then the next `soonHours`. Done items are left out, and so
 * are feeds and doses from earlier days (`feeding`, `medicine`): those are missed, not overdue.
 */
export function todayItems(items: AgendaItem[], now: number, { soonHours = 48 }: TodayOptions = {}): TodayEntry[] {
  const today = toYmd(now);
  const soonUntil = now + soonHours * HOUR;
  const out: TodayEntry[] = [];
  for (const item of items) {
    const status = agendaStatus(item, now);
    if (status === 'done') continue;
    const first = toYmd(item.start);
    if (status === 'overdue') {
      const due = item.allDay ? lastDay(item) : first;
      if (due < today && OCCASIONS.includes(item.kind)) continue;
      const when = due < today || item.allDay ? dueText(due, today) : `Overdue since ${formatTime(item.start)}`;
      out.push({ item, group: 'overdue', when });
      continue;
    }
    if (first <= today && lastDay(item) >= today) {
      if (!item.allDay && !status && (item.end ?? item.start) < now) continue;
      const when = item.allDay ? (status ? 'Due today' : 'Today') : agendaTime(item);
      out.push({ item, group: 'today', when });
      continue;
    }
    if (first > today && item.start < soonUntil) {
      const day = dueWords(first, today);
      out.push({ item, group: 'soon', when: item.allDay ? day : `${day}, ${formatTime(item.start)}` });
    }
  }
  const rank: Record<TodayGroup, number> = { overdue: 0, today: 1, soon: 2 };
  return out.sort((a, b) => rank[a.group] - rank[b.group] || byStart(a.item, b.item));
}

export interface AgendaDay {
  day: Ymd;
  /** "Today", "Tomorrow", "Yesterday", or "Tuesday, November 4" (with the year when it isn't this year's). */
  label: string;
  /** All-day items first, then by time. */
  items: AgendaItem[];
}

export interface AgendaDaysOptions {
  /** First and last day to show; default every day that has an item. */
  from?: Ymd;
  to?: Ymd;
  /** Include days with nothing on them between `from` and `to`. Default false. */
  emptyDays?: boolean;
}

/** The longest span an item is shown on every day of; longer ones show on their first day only. */
const MAX_SPAN_DAYS = 31;

/** A calendar label for a day relative to now: "Today", "Tomorrow", "Yesterday", or its long date. */
export function dayLabel(day: Ymd, now: number): string {
  const today = toYmd(now);
  const n = daysBetween(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return longDate(day, today);
}

/** Items by local day, for a calendar list: an item spanning several days shows on each of them. */
export function agendaDays(items: AgendaItem[], now: number, { from, to, emptyDays = false }: AgendaDaysOptions = {}): AgendaDay[] {
  const days = new Map<Ymd, AgendaItem[]>();
  const add = (day: Ymd, item: AgendaItem) => {
    if ((from && day < from) || (to && day > to)) return;
    const list = days.get(day);
    if (list) list.push(item);
    else days.set(day, [item]);
  };
  for (const item of items) {
    const first = toYmd(item.start);
    const last = lastDay(item);
    const span = daysBetween(first, last);
    if (span <= 0 || span > MAX_SPAN_DAYS) add(first, item);
    else for (let d = 0; d <= span; d++) add(addDays(first, d), item);
  }
  if (emptyDays && from && to) for (let d = from; d <= to; d = addDays(d, 1)) if (!days.has(d)) days.set(d, []);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({ day, label: dayLabel(day, now), items: list.sort(byStart) }));
}

/** Local midnight today and `days` later: a range for `watchAgenda`. */
export function agendaRange(now: number, days: number, pastDays = 0): { from: number; to: number } {
  const start = startOfDay(now);
  return { from: addDays(start, -pastDays), to: addDays(start, days) };
}
