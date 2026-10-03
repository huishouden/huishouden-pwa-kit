import { collection, doc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { deleteDoc, setDoc, writeBatch } from './firestore.js';
import { doseSlots, type MedCourse } from './dose.js';
import { MONEY_APPS } from './roles.js';
import { cleanAudience, inAudience } from './audience.js';

/**
 * Reminders any app writes and the shared sender (huishouden/notify) delivers as push
 * notifications: one collection, `households/{id}/reminders`. The sender checks every five
 * minutes for reminders that are due and not yet sent, pushes them to the recipients' devices,
 * and marks them sent. Apps never send anything themselves.
 *
 * Fields match the rules exactly (see REMINDER_FIELDS); keep them in step.
 */
export interface Reminder {
  id: string;
  /** Short name of the app that owns it ("pet"); its notification opens in that app when it can. */
  app: string;
  title: string;
  body: string;
  /** When to notify, ms since epoch. */
  at: number;
  /** Deep link opened when the notification is tapped (https). */
  url: string;
  /** Everyone in the household, or these members (lowercase emails). */
  recipients: 'all' | string[];
  /** What it belongs to, for replacing or cancelling a group ("pet:course:abc"). */
  ref?: string;
  /**
   * For admins and members only (a private appointment, a bill): helpers and kids neither read it
   * nor get it on their devices. Always written; one without it counts as private to them.
   */
  private?: boolean;
  /**
   * Only these members read it (lowercase emails): a reminder in `personalReminders` (`./audience`),
   * about one person's care; `recipients` are some of them. Absent on shared reminders.
   */
  audience?: string[];
  sent: boolean;
  sentAt?: number;
  createdAt: number;
  by: string;
}

export const REMINDER_FIELDS = ['app', 'title', 'body', 'at', 'url', 'recipients', 'ref', 'private', 'sent', 'sentAt', 'createdAt', 'by'] as const;

/** The collection of reminders for named members only (`./audience`); the sender reads it too. */
export const PERSONAL_REMINDERS = 'personalReminders';

/** Fields of a `personalReminders` document: a reminder's plus `audience`. */
export const PERSONAL_REMINDER_FIELDS = [...REMINDER_FIELDS, 'audience'] as const;

export type ReminderInput = Pick<Reminder, 'app' | 'title' | 'at' | 'url'> & Partial<Pick<Reminder, 'id' | 'body' | 'recipients' | 'ref' | 'private'>>;

/**
 * For writes from a helper's or kid's device (`isRestricted(role)`): only reminders not marked
 * private are read and written, each on its own, and one the rules refuse (written before the
 * flag, until an admin's or member's device rewrites it) is skipped rather than failing the rest.
 */
export interface ReminderWriteOptions {
  restricted?: boolean;
}

const remindersOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, 'reminders');
const personalOf = (db: Firestore, householdId: string) => collection(db, 'households', householdId, PERSONAL_REMINDERS);

/** A reminder for named members only: who may read it (`./audience`); `recipients` must be a list of some of them. */
export type PersonalReminderInput = ReminderInput & { audience: readonly string[]; recipients: string[] };

/** Reminders matching `filters`, or for a helper or kid only the open ones (what the rules let them read). */
const visible = (db: Firestore, householdId: string, restricted: boolean | undefined, ...filters: ReturnType<typeof where>[]) =>
  query(remindersOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));

const refused = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

type Op = (b: ReturnType<typeof writeBatch>) => void;

async function commit(db: Firestore, ops: Op[], restricted = false): Promise<void> {
  if (restricted) {
    for (const op of ops) {
      const batch = writeBatch(db);
      op(batch);
      await batch.commit().catch((e) => {
        if (!refused(e)) throw e;
      });
    }
    return;
  }
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) op(batch);
    await batch.commit();
  }
}

/**
 * The same id for the same reminder however often it is written, so re-saving a course
 * overwrites its reminders instead of doubling them: `<ref or app>-<at>`, Firestore-safe.
 */
export function reminderId(refOrApp: string, at: number): string {
  return `${refOrApp.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 200)}-${at}`;
}

/** The document a reminder is stored as: trimmed, recipients lowercased, unsent. */
export function reminderDoc(input: ReminderInput, by: string, now = Date.now()): Omit<Reminder, 'id'> {
  if (!/^https:\/\//.test(input.url)) throw new Error('Reminder url must be an https deep link into the app.');
  const recipients = input.recipients === undefined || input.recipients === 'all'
    ? 'all'
    : [...new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (Array.isArray(recipients) && recipients.length === 0) throw new Error('Reminder has no recipients.');
  return {
    app: input.app,
    title: input.title.trim().slice(0, 120),
    body: (input.body ?? '').trim().slice(0, 500),
    at: Math.round(input.at),
    url: input.url,
    recipients,
    ...(input.ref ? { ref: input.ref } : {}),
    private: input.private === true || MONEY_APPS.includes(input.app),
    sent: false,
    createdAt: now,
    by,
  };
}

/**
 * Creates or replaces a reminder (id from `reminderId(ref ?? app, at)` unless given). Writing it
 * again marks it unsent, so it is delivered again if its time has come.
 */
export async function upsertReminder(db: Firestore, householdId: string, input: ReminderInput, by: string): Promise<string> {
  const id = input.id ?? reminderId(input.ref ?? input.app, input.at);
  await setDoc(doc(remindersOf(db, householdId), id), reminderDoc(input, by));
  return id;
}

export async function cancelReminder(db: Firestore, householdId: string, id: string): Promise<void> {
  await deleteDoc(doc(remindersOf(db, householdId), id));
}

/** Deletes every reminder with this `ref` (a course stopped, an appointment cancelled). */
export async function cancelReminders(db: Firestore, householdId: string, ref: string, { restricted }: ReminderWriteOptions = {}): Promise<number> {
  const snap = await getDocs(visible(db, householdId, restricted, where('ref', '==', ref)));
  await commit(db, snap.docs.map((d) => (b) => b.delete(d.ref)), restricted);
  return snap.size;
}

/**
 * Makes the reminders with this `ref` exactly `inputs` from now on: future ones not in the list are
 * deleted, the list is written (unchanged ones keep their ids), and past ones are left alone so a
 * sent reminder is never sent twice. Use it whenever a course or appointment is saved.
 */
export async function replaceReminders(
  db: Firestore,
  householdId: string,
  ref: string,
  inputs: ReminderInput[],
  by: string,
  now = Date.now(),
  { restricted }: ReminderWriteOptions = {},
): Promise<string[]> {
  const wanted = new Map(
    inputs
      .filter((r) => r.at > now && !(restricted && r.private))
      .map((r) => [r.id ?? reminderId(ref, r.at), reminderDoc({ ...r, ref }, by, now)] as const),
  );
  const existing = await getDocs(visible(db, householdId, restricted, where('ref', '==', ref)));
  const ops: Op[] = [];
  for (const d of existing.docs) {
    const at = d.data().at as number;
    if (at > now && !wanted.has(d.id)) ops.push((b) => b.delete(d.ref));
  }
  for (const [id, data] of wanted) ops.push((b) => b.set(doc(remindersOf(db, householdId), id), data));
  await commit(db, ops, restricted);
  return [...wanted.keys()];
}

/** A reminder as it would be sent, for telling whether a stored one needs rewriting. */
const sameReminder = (a: Record<string, unknown>, b: Omit<Reminder, 'id'>) =>
  (['app', 'title', 'body', 'at', 'url', 'ref', 'private'] as const).every((k) => a[k] === b[k]) &&
  JSON.stringify(a.recipients) === JSON.stringify(b.recipients) &&
  a.sent === false;

export interface SyncRemindersResult {
  written: number;
  deleted: number;
  unchanged: number;
}

/**
 * Makes everything this app has scheduled from now on exactly `inputs` (each with its own `ref`):
 * for apps that work out all their reminders from their data, on open and whenever it changes. Future
 * reminders not in the list are deleted, new or changed ones written, and unchanged ones left alone,
 * so running it often costs one read and almost no writes. Past and sent reminders are never
 * touched, so nothing is sent twice.
 */
export async function syncReminders(
  db: Firestore,
  householdId: string,
  app: string,
  inputs: ReminderInput[],
  by: string,
  now = Date.now(),
  { restricted }: ReminderWriteOptions = {},
): Promise<SyncRemindersResult> {
  const wanted = new Map(
    inputs
      .filter((r) => r.at > now && !(restricted && r.private))
      .map((r) => {
        const data = reminderDoc({ ...r, app }, by, now);
        return [r.id ?? reminderId(r.ref ?? app, data.at), data] as const;
      }),
  );
  const existing = await getDocs(visible(db, householdId, restricted, where('app', '==', app)));
  const have = new Map(existing.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const ops: Op[] = [];
  for (const d of existing.docs) {
    const data = d.data() as Record<string, unknown>;
    if (typeof data.at === 'number' && data.at > now && data.sent !== true && !wanted.has(d.id)) ops.push((b) => b.delete(d.ref));
  }
  const deleted = ops.length;
  let unchanged = 0;
  for (const [id, data] of wanted) {
    const old = have.get(id);
    if (old && sameReminder(old, data)) unchanged++;
    else if (old?.sent === true) unchanged++;
    else ops.push((b) => b.set(doc(remindersOf(db, householdId), id), data));
  }
  await commit(db, ops, restricted);
  return { written: ops.length - deleted, deleted, unchanged };
}

/**
 * A `personalReminders` document: as `reminderDoc`, private, with the audience cleaned and the
 * recipients narrowed to it. Throws when the audience leaves out the writer or no recipient is in it.
 */
export function personalReminderDoc(input: PersonalReminderInput, by: string, now = Date.now()): Omit<Reminder, 'id'> {
  const audience = cleanAudience(input.audience);
  if (!inAudience(audience, by)) throw new Error('A personal reminder must name its writer in its audience.');
  const recipients = cleanAudience(input.recipients).filter((e) => audience.includes(e));
  const { audience: _a, ...rest } = input;
  return { ...reminderDoc({ ...rest, recipients, private: true }, by, now), audience };
}

/**
 * Makes this app's reminders for named members exactly `inputs` from now on, as `syncReminders`
 * does for shared ones: the reminders whose audience includes `by`. Past and sent ones are never
 * touched; inputs whose audience leaves `by` out, or with no recipient in it, are skipped.
 */
export async function syncPersonalReminders(
  db: Firestore,
  householdId: string,
  app: string,
  inputs: PersonalReminderInput[],
  by: string,
  now = Date.now(),
): Promise<SyncRemindersResult> {
  const me = by.trim().toLowerCase();
  const wanted = new Map<string, Omit<Reminder, 'id'>>();
  for (const r of inputs) {
    if (r.at <= now || !inAudience(cleanAudience(r.audience), me)) continue;
    let data: Omit<Reminder, 'id'>;
    try {
      data = personalReminderDoc({ ...r, app }, me, now);
    } catch {
      continue;
    }
    wanted.set(r.id ?? reminderId(r.ref ?? app, data.at), data);
  }
  const col = personalOf(db, householdId);
  const existing = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
  const ops: Op[] = [];
  for (const d of existing.docs) {
    const data = d.data() as Record<string, unknown>;
    if (typeof data.at === 'number' && data.at > now && data.sent !== true && !wanted.has(d.id)) ops.push((b) => b.delete(d.ref));
  }
  const deleted = ops.length;
  const have = new Map(existing.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  let unchanged = 0;
  for (const [id, data] of wanted) {
    const old = have.get(id);
    if (old && sameReminder(old, data) && JSON.stringify(old.audience) === JSON.stringify(data.audience)) unchanged++;
    else if (old?.sent === true) unchanged++;
    else ops.push((b) => b.set(doc(col, id), data));
  }
  await commit(db, ops);
  return { written: ops.length - deleted, deleted, unchanged };
}

export function toReminder(id: string, data: Record<string, unknown>): Reminder {
  return {
    id,
    app: String(data.app ?? ''),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    at: typeof data.at === 'number' ? data.at : 0,
    url: String(data.url ?? ''),
    recipients: Array.isArray(data.recipients) ? data.recipients.map(String) : 'all',
    ref: typeof data.ref === 'string' ? data.ref : undefined,
    ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
    ...(Array.isArray(data.audience) ? { audience: data.audience.filter((e): e is string => typeof e === 'string') } : {}),
    sent: data.sent === true,
    sentAt: typeof data.sentAt === 'number' ? data.sentAt : undefined,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    by: String(data.by ?? ''),
  };
}

/** Follows the household's reminders, optionally one app's, soonest first. */
export function watchReminders(
  db: Firestore,
  householdId: string,
  onChange: (reminders: Reminder[]) => void,
  { app, restricted, onError }: { app?: string; restricted?: boolean; onError?: (error: Error) => void } = {},
): Unsubscribe {
  const source = visible(db, householdId, restricted, ...(app ? [where('app', '==', app)] : []));
  return onSnapshot(
    source,
    (snap) => onChange(snap.docs.map((d) => toReminder(d.id, d.data())).sort((a, b) => a.at - b.at)),
    (error) => onError?.(error),
  );
}

export interface CourseReminderOptions {
  app: string;
  /** Deep link to the course or the pet in the app (https). */
  url: string;
  /** Groups the course's reminders; default `<app>:course:<course id>`. */
  ref?: string;
  recipients?: 'all' | string[];
  /** Only for admins and members. */
  private?: boolean;
  /** Notify this many minutes before each dose. Default 0. */
  leadMinutes?: number;
  /** Ongoing courses get reminders this many days ahead; re-run when the app opens. Default 14. */
  horizonDays?: number;
  /** Days between dosing days (2 for every other day). Default 1. */
  everyDays?: number;
  /** Who the medicine is for, shown in the title: "Biscuit: Carprofen 75 mg". */
  forWhom?: string;
  now?: number;
}

/**
 * One reminder per future dose of a course, with stable ids (`reminderId(ref, at)`), ready for
 * `replaceReminders(db, householdId, ref, reminders, by)`. Courses with a length get every
 * remaining dose; ongoing ones the next `horizonDays`.
 */
export function remindersForCourse(course: MedCourse & { id: string }, options: CourseReminderOptions): ReminderInput[] {
  const now = options.now ?? Date.now();
  const ref = options.ref ?? `${options.app}:course:${course.id}`;
  const lead = (options.leadMinutes ?? 0) * 60_000;
  const horizon = now + (options.horizonDays ?? 14) * 86_400_000;
  const to = course.days !== undefined ? Number.MAX_SAFE_INTEGER : horizon;
  const slots = doseSlots({ startDate: course.startDate, days: course.days, times: course.times, everyDays: options.everyDays }, now + lead, Math.min(to, now + 366 * 86_400_000));
  const title = [options.forWhom, course.name].filter(Boolean).join(': ') || 'Medicine';
  return slots.map((slot) => ({
    id: reminderId(ref, slot.at - lead),
    app: options.app,
    title,
    body: [course.dose && `${course.dose} at ${slot.time}`, course.withFood === true ? 'with food' : course.withFood === false ? 'on an empty stomach' : '']
      .filter(Boolean)
      .join(', ') || `Dose at ${slot.time}`,
    at: slot.at - lead,
    url: options.url,
    recipients: options.recipients ?? 'all',
    ...(options.private ? { private: true } : {}),
    ref,
  }));
}
