import type { PersonalAgendaInput } from './agenda-core.js';
import type { PersonalTodoInput } from './todo-core.js';
import { reminderId, type PersonalReminderInput } from './reminder-core.js';
import { capitalize, formatList, getLang, kt, type Lang } from './i18n.js';
import { addDays, atClock, DAY, formatDayShort, HOUR, MINUTE, shortDate, toHhmm, toYmd, ymdToTime, type Ymd } from './time.js';
import { addInterval } from './schedule.js';
import { audienceMember, audienceSeesPrivate, cleanAudience, householdAdmins, type AudienceHousehold } from './audience.js';

/**
 * Health visits (huishouden/health): a person's appointments with a doctor, a dentist, a lab, under
 * `households/{id}/healthPeople/{personId}/visits/{visitId}`, with their notes apart in
 * `visitNotes/{visitId}` (admins and member carers only: helpers who take someone to a visit see
 * when, where and what to bring, not what the doctor said). Server-safe: Health and the assistant
 * connector write and publish visits with the same code.
 *
 * What a visit publishes is for named people only (`./audience`: the household's admins, the
 * person's carers and the person themself):
 * - an agenda item (`visitAgendaItem`) titled "Appointment for Ana", never what kind or with whom,
 *   since the portal may be on a wall tablet; the detail goes in `calendarDetail`, which only a
 *   reader's own calendar shows, when they turn on Health details;
 * - reminders (`visitReminders`) at each of `remindBefore`, to the person's carers, naming the visit;
 * - after a visit with a follow-up, a to-do (`followUpTodo`) "Book a follow-up for Ana" until it is
 *   booked or not needed.
 *
 * Who may do what (huishouden/rules): every reader of the person reads visits; admins and member
 * carers change any; a helper carer adds their own and changes only those; any reader marks one
 * Attended or Missed (`visitMark`, `VISIT_MARK_FIELDS`) as themself.
 *
 * Times are absolute. On a server, pass `local` (absolute to the household's local frame, as
 * `toYmd`/`toHhmm` read it) so the words name the household's own day and time.
 */

export const VISIT_KINDS = ['checkup', 'specialist', 'dentist', 'eye', 'lab', 'vaccine', 'therapy', 'other'] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

export const VISIT_STATUSES = ['attended', 'missed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const FOLLOW_UP_UNITS = ['week', 'month'] as const;
export type FollowUpUnit = (typeof FOLLOW_UP_UNITS)[number];

export interface FollowUp {
  every: number;
  unit: FollowUpUnit;
}

/** The person's collections: `healthPeople/{personId}/visits` and `.../visitNotes`. */
export const VISITS = 'visits';
export const VISIT_NOTES = 'visitNotes';

/** healthPeople/{personId}/visits/{visitId}. */
export interface VisitData {
  /** The path's person, repeated (the rules check it). */
  personId: string;
  kind: VisitKind;
  /** "Annual physical", "Cardiology follow-up"; none says only the kind (`visitTitle`). */
  title?: string;
  /** When it starts (ms); an all-day visit's local midnight. */
  at: number;
  /** The time isn't known yet. */
  allDay?: boolean;
  /** How long, when not the default hour. */
  minutes?: number;
  /** The doctor or clinic: a household contact (`./contacts`). */
  contactId?: string;
  /** Where, when not the contact's address. */
  location?: string;
  /** A telehealth link (https). */
  link?: string;
  /** What to do or bring: "Fasting from midnight". */
  prep?: string[];
  /** Bring the printable medicine list (Health links to it). */
  medList?: boolean;
  /** Reminders this many minutes before (0 at the time), soonest last. */
  remindBefore: number[];
  /** Another visit is due this long after this one. */
  followUp?: FollowUp;
  /** The visit this one follows up. */
  followUpOf?: string;
  /** When the follow-up was booked or found not needed (the to-do's Booked or Not needed). */
  followUpDoneAt?: number;
  status?: VisitStatus;
  markedAt?: number;
  markedBy?: string;
  /** The calendar event it was imported from. */
  calendarEventId?: string;
  calendarLink?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
  /** Written by the person's assistant (huishouden/connector). */
  via?: 'assistant';
}
export interface Visit extends VisitData {
  id: string;
}

/** healthPeople/{personId}/visitNotes/{visitId}: the visit's notes, for admins and member carers. */
export interface VisitNoteData {
  personId: string;
  text: string;
  updatedAt: number;
  by: string;
  via?: 'assistant';
}
export interface VisitNote extends VisitNoteData {
  /** The visit's id. */
  id: string;
}

export const VISIT_FIELDS = [
  'personId', 'kind', 'title', 'at', 'allDay', 'minutes', 'contactId', 'location', 'link', 'prep', 'medList', 'remindBefore',
  'followUp', 'followUpOf', 'followUpDoneAt', 'status', 'markedAt', 'markedBy', 'calendarEventId', 'calendarLink', 'createdAt', 'updatedAt', 'by', 'via',
] as const;
export const VISIT_NOTE_FIELDS = ['personId', 'text', 'updatedAt', 'by', 'via'] as const;
/** What a carer who may not change the visit may still write: Attended or Missed, and the follow-up's answer. */
export const VISIT_MARK_FIELDS = ['status', 'markedAt', 'markedBy', 'followUpDoneAt', 'updatedAt'] as const;

export const VISIT_LIMITS = {
  title: 120,
  location: 200,
  link: 500,
  prepItem: 80,
  prep: 6,
  notes: 1000,
  minutes: 24 * 60,
  remindBefore: 4,
  /** Two weeks. */
  lead: 14 * 24 * 60,
  followUpEvery: 24,
  id: 128,
  calendarEventId: 1024,
  calendarLink: 2000,
} as const;

export const DEFAULT_VISIT_MINUTES = 60;
/** The day before and two hours before. */
export const DEFAULT_REMIND_BEFORE: readonly number[] = [1440, 120];
/** The lead times Health offers. */
export const REMIND_CHOICES: readonly number[] = [10080, 2880, 1440, 240, 120, 60, 30, 0];
export const FOLLOW_UP_CHOICES: readonly FollowUp[] = [
  { every: 2, unit: 'week' },
  { every: 1, unit: 'month' },
  { every: 3, unit: 'month' },
  { every: 6, unit: 'month' },
  { every: 12, unit: 'month' },
];

// ---- Reading and writing ----

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
const clip = (s: string | undefined, max: number) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const isKind = (v: unknown): v is VisitKind => typeof v === 'string' && (VISIT_KINDS as readonly string[]).includes(v);

/** Lead times as stored: whole minutes from 0 to two weeks, unique, longest first, at most four. */
export function cleanRemindBefore(list: readonly unknown[] | undefined): number[] {
  const ok = (list ?? []).map(int).filter((n): n is number => n !== undefined && n >= 0 && n <= VISIT_LIMITS.lead);
  return [...new Set(ok)].sort((a, b) => b - a).slice(0, VISIT_LIMITS.remindBefore);
}

export function cleanFollowUp(v: unknown): FollowUp | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { every, unit } = v as Record<string, unknown>;
  const n = int(every);
  if (n === undefined || n < 1 || n > VISIT_LIMITS.followUpEvery || !(FOLLOW_UP_UNITS as readonly unknown[]).includes(unit)) return undefined;
  return { every: n, unit: unit as FollowUpUnit };
}

export function cleanPrep(list: readonly unknown[] | undefined): string[] {
  const out = (list ?? []).filter((x): x is string => typeof x === 'string').map((x) => clip(x, VISIT_LIMITS.prepItem)).filter(Boolean);
  return [...new Set(out)].slice(0, VISIT_LIMITS.prep);
}

const httpsLink = (s: string | undefined, max: number = VISIT_LIMITS.link) => {
  const v = (s ?? '').trim();
  return v.length <= max && /^https:\/\/\S+$/i.test(v) ? v : undefined;
};

/** A stored visit, read defensively. */
export function toVisit(id: string, d: Record<string, unknown>, personId?: string): Visit {
  const status = (VISIT_STATUSES as readonly unknown[]).includes(d.status) ? (d.status as VisitStatus) : undefined;
  const prep = Array.isArray(d.prep) ? cleanPrep(d.prep) : [];
  const followUp = cleanFollowUp(d.followUp);
  return {
    id,
    personId: personId ?? String(d.personId ?? ''),
    kind: isKind(d.kind) ? d.kind : 'other',
    ...(str(d.title) ? { title: String(d.title) } : {}),
    at: int(d.at) ?? 0,
    ...(d.allDay === true ? { allDay: true } : {}),
    ...(int(d.minutes) ? { minutes: int(d.minutes) } : {}),
    ...(str(d.contactId) ? { contactId: str(d.contactId) } : {}),
    ...(str(d.location) ? { location: str(d.location) } : {}),
    ...(str(d.link) ? { link: str(d.link) } : {}),
    ...(prep.length ? { prep } : {}),
    ...(d.medList === true ? { medList: true } : {}),
    remindBefore: Array.isArray(d.remindBefore) ? cleanRemindBefore(d.remindBefore) : [...DEFAULT_REMIND_BEFORE],
    ...(followUp ? { followUp } : {}),
    ...(str(d.followUpOf) ? { followUpOf: str(d.followUpOf) } : {}),
    ...(int(d.followUpDoneAt) ? { followUpDoneAt: int(d.followUpDoneAt) } : {}),
    ...(status ? { status } : {}),
    ...(int(d.markedAt) ? { markedAt: int(d.markedAt) } : {}),
    ...(str(d.markedBy) ? { markedBy: str(d.markedBy) } : {}),
    ...(str(d.calendarEventId) ? { calendarEventId: str(d.calendarEventId) } : {}),
    ...(str(d.calendarLink) ? { calendarLink: str(d.calendarLink) } : {}),
    createdAt: int(d.createdAt) ?? 0,
    ...(int(d.updatedAt) ? { updatedAt: int(d.updatedAt) } : {}),
    by: String(d.by ?? ''),
    ...(d.via === 'assistant' ? { via: 'assistant' as const } : {}),
  };
}

export type VisitInput = Omit<VisitData, 'createdAt' | 'updatedAt' | 'by' | 'via' | 'remindBefore'> & { remindBefore?: readonly number[] };

/**
 * The stored document, exactly as the rules accept it: trimmed, clipped, no undefined fields, and
 * no words of the writer's language (no title stays no title: `visitTitle` says the kind in the
 * reader's). `stamp` is `createdAt`, `by` and, on a change, `updatedAt` (`./store` `stampFor`);
 * `via` the assistant's mark. Attended or Missed is kept as given (an edit keeps who marked it);
 * mark with `visitMark`.
 */
export function visitDoc(input: VisitInput, stamp: { createdAt: number; by: string; updatedAt?: number }, via?: 'assistant'): VisitData {
  const prep = cleanPrep(input.prep);
  const followUp = cleanFollowUp(input.followUp);
  const minutes = input.minutes !== undefined ? Math.round(input.minutes) : undefined;
  const location = clip(input.location, VISIT_LIMITS.location);
  const link = httpsLink(input.link);
  const id = (s: string | undefined) => clip(s, VISIT_LIMITS.id) || undefined;
  const title = clip(input.title, VISIT_LIMITS.title);
  return {
    personId: input.personId,
    kind: isKind(input.kind) ? input.kind : 'other',
    ...(title ? { title } : {}),
    at: Math.round(input.at),
    ...(input.allDay ? { allDay: true } : {}),
    ...(minutes && minutes >= 5 && minutes <= VISIT_LIMITS.minutes && minutes !== DEFAULT_VISIT_MINUTES && !input.allDay ? { minutes } : {}),
    ...(id(input.contactId) ? { contactId: id(input.contactId) } : {}),
    ...(location ? { location } : {}),
    ...(link ? { link } : {}),
    ...(prep.length ? { prep } : {}),
    ...(input.medList ? { medList: true } : {}),
    remindBefore: cleanRemindBefore(input.remindBefore ?? DEFAULT_REMIND_BEFORE),
    ...(followUp ? { followUp } : {}),
    ...(id(input.followUpOf) ? { followUpOf: id(input.followUpOf) } : {}),
    ...(input.followUpDoneAt ? { followUpDoneAt: Math.round(input.followUpDoneAt) } : {}),
    ...(input.status && (VISIT_STATUSES as readonly string[]).includes(input.status) ? { status: input.status, ...(input.markedAt ? { markedAt: Math.round(input.markedAt) } : {}), ...(input.markedBy ? { markedBy: input.markedBy } : {}) } : {}),
    ...(input.calendarEventId && input.calendarEventId.length <= VISIT_LIMITS.calendarEventId ? { calendarEventId: input.calendarEventId } : {}),
    ...(httpsLink(input.calendarLink, VISIT_LIMITS.calendarLink) ? { calendarLink: httpsLink(input.calendarLink, VISIT_LIMITS.calendarLink) } : {}),
    createdAt: stamp.createdAt,
    ...(stamp.updatedAt !== undefined ? { updatedAt: stamp.updatedAt } : {}),
    by: stamp.by,
    ...(via ? { via } : {}),
  };
}

/**
 * Attended or Missed, signed by `me` now: a patch to merge into the visit (only the mark's fields and
 * `updatedAt`, all a helper carer may write), so nothing else about the visit is touched.
 */
export function visitMark(status: VisitStatus, me: string, now: number): Required<Pick<VisitData, 'status' | 'markedAt' | 'markedBy' | 'updatedAt'>> {
  return { status, markedAt: now, markedBy: me, updatedAt: now };
}

/**
 * The visit with its mark taken back (Undo): the whole document without `status`, `markedAt` and
 * `markedBy`, built from `VISIT_FIELDS` only (no `id`), to write as a replace, since a merge would
 * keep the mark. Build it from the visit as just read (Health's live snapshot): a replace writes back
 * whatever else that copy holds.
 */
export function visitUnmarked(v: VisitData, now: number): VisitData {
  const out: Record<string, unknown> = {};
  for (const k of VISIT_FIELDS) {
    if (k === 'status' || k === 'markedAt' || k === 'markedBy') continue;
    const value = (v as unknown as Record<string, unknown>)[k];
    if (value !== undefined) out[k] = value;
  }
  return { ...(out as unknown as VisitData), updatedAt: now };
}

export function visitNoteDoc(personId: string, text: string, by: string, now: number, via?: 'assistant'): VisitNoteData {
  return { personId, text: (text ?? '').trim().slice(0, VISIT_LIMITS.notes), updatedAt: now, by, ...(via ? { via } : {}) };
}

// ---- When ----

/** When it ends: its length after `at`, or the end of its day when all day. */
export function visitEnd(v: Pick<Visit, 'at' | 'allDay' | 'minutes'>): number {
  return v.allDay ? v.at + DAY : v.at + (v.minutes ?? DEFAULT_VISIT_MINUTES) * MINUTE;
}

/**
 * Where a visit stands: `upcoming` before it starts, `now` while on, `unmarked` once over and nobody
 * said whether it happened, `attended` or `missed` once someone did.
 */
export type VisitState = 'upcoming' | 'now' | 'unmarked' | VisitStatus;

export function visitState(v: Pick<Visit, 'at' | 'allDay' | 'minutes' | 'status'>, now: number): VisitState {
  if (v.status) return v.status;
  if (now < v.at) return 'upcoming';
  return now < visitEnd(v) ? 'now' : 'unmarked';
}

/** The day the follow-up is due: `followUp` after the visit's day. */
export function followUpDay(v: Pick<Visit, 'at' | 'followUp'>, local: (t: number) => number = (t) => t): Ymd | null {
  if (!v.followUp) return null;
  return addInterval(toYmd(local(v.at)), v.followUp.every, v.followUp.unit);
}

/** A follow-up still to book: the visit is over and not missed, it wants one, and none is booked or waived. */
export function followUpOpen(v: Visit, visits: readonly Pick<Visit, 'followUpOf'>[], now: number): boolean {
  return !!v.followUp && !v.followUpDoneAt && v.status !== 'missed' && visitEnd(v) <= now && !visits.some((x) => x.followUpOf === v.id);
}

// ---- Words ----

/** "Checkup", "Eye doctor": the kind in the active language. */
export const visitKindLabel = (kind: VisitKind): string => kt(`visit.kind.${kind}`);

/** "1 day before", "2 hours before", "At the time". */
export function leadWords(minutes: number): string {
  if (minutes <= 0) return kt('visit.lead.atTime');
  if (minutes % (7 * 1440) === 0) return kt('visit.lead.weeks', { count: minutes / (7 * 1440) });
  if (minutes % 1440 === 0) return kt('visit.lead.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return kt('visit.lead.hours', { count: minutes / 60 });
  return kt('visit.lead.minutes', { count: minutes });
}

/** "In 3 months", "In 2 weeks". */
export const followUpWords = (f: FollowUp): string => kt(f.unit === 'week' ? 'visit.followUp.weeks' : 'visit.followUp.months', { count: f.every });

/** What to do before: the household's own lines, and the medicine list. */
export function prepWords(v: Pick<Visit, 'prep' | 'medList'>): string[] {
  return [...(v.prep ?? []), ...(v.medList ? [kt('visit.medList')] : [])];
}

/** Its title, or with none the kind in the reader's language: "Cleaning", "Dentist". */
export const visitTitle = (v: Pick<Visit, 'kind' | 'title'>): string => v.title?.trim() || visitKindLabel(v.kind);

/** What the person's own calendar and the reminders say about it: "Dentist: Cleaning with Dr. Hart", "Dentist with Dr. Hart". */
export function visitWhat(v: Pick<Visit, 'kind' | 'title'>, contact?: { name: string }): string {
  const own = v.title?.trim();
  const what = own && v.kind !== 'other' ? kt('visit.kindTitle', { kind: visitKindLabel(v.kind), title: own }) : visitTitle(v);
  return contact?.name ? kt('visit.with', { what, who: contact.name }) : what;
}

/** Where: the place typed, else the contact's address, and "Video visit" with a link. */
export function visitWhere(v: Pick<Visit, 'location' | 'link'>, contact?: { address?: string }): string[] {
  return [v.location || contact?.address || '', v.link ? kt('visit.video') : ''].filter(Boolean);
}

/** "At 10 AM", "Tomorrow at 10 AM", "Thu, May 15 at 10 AM", as said at `from`. */
export function visitWhen(v: Pick<Visit, 'at' | 'allDay'>, from: number, local: (t: number) => number = (t) => t): string {
  const at = local(v.at);
  const day = toYmd(at);
  const today = toYmd(local(from));
  const time = v.allDay ? '' : atClock(toHhmm(at));
  if (day === today) return v.allDay ? kt('visit.when.today') : capitalize(time);
  if (day === addDays(today, 1)) return v.allDay ? kt('visit.when.tomorrow') : kt('visit.when.tomorrowAt', { at: time });
  const date = formatDayShort(at);
  return v.allDay ? date : kt('visit.when.dayAt', { day: date, at: time });
}

// ---- Who reads and who is told ----

/** Told before a visit: the person's carers who aren't kids, else the person themself, else the first admin. */
export function visitRecipients(p: { carers: readonly string[]; email?: string }, h: AudienceHousehold): string[] {
  const carers = p.carers.map((e) => e.trim().toLowerCase()).filter((e) => audienceMember(h, e));
  if (carers.length) return cleanAudience(carers);
  const own = p.email?.trim().toLowerCase();
  if (own && audienceMember(h, own)) return [own];
  return householdAdmins(h).slice(0, 1);
}

/**
 * The doctor or clinic as a visit's published items may name it: a contact marked private (admins
 * and members only; one without the flag counts as private) only when everyone in the audience may
 * read private records, so a helper carer never learns it from a reminder or a calendar.
 * `visitAgendaItem` and `visitReminders` apply it themselves.
 */
export function publishedContact(c: VisitContact | undefined, audience: readonly string[], h: AudienceHousehold): { name: string; address?: string } | undefined {
  if (!c) return undefined;
  if (c.private !== false && !audienceSeesPrivate(h, audience)) return undefined;
  return { name: c.name, ...(c.address ? { address: c.address } : {}) };
}

// ---- Publishing ----

export interface VisitPerson {
  id: string;
  name: string;
}

/** A visit's doctor or clinic as the household's contacts hold it. */
export interface VisitContact {
  name: string;
  address?: string;
  /** Admins and members only; absent counts as private. */
  private?: boolean;
}

export interface PublishVisitOptions {
  person: VisitPerson;
  /** Who may read what it publishes: `./audience` `personAudience`. */
  audience: readonly string[];
  /** The household's members and roles: whether the audience may see a private doctor. */
  household: AudienceHousehold;
  /** The deep link into Health for this visit. */
  url: string;
  /** The doctor or clinic, when it has one, as stored: named only as `publishedContact` allows. */
  contact?: VisitContact;
  /** Absolute to the household's local frame, on a server. */
  local?: (t: number) => number;
}

/** The agenda item's `ref`: one per visit. */
export const visitRef = (v: Pick<Visit, 'id' | 'personId'>): string => `visit:${v.personId}:${v.id}`;

/**
 * One agenda item, for the portal's Today and Calendar and the readers' own calendars: "Appointment
 * for Ana" (nothing more where the portal shows it), with what, with whom, where and what to bring in
 * `calendarDetail`.
 */
export function visitAgendaItem(v: Visit, o: PublishVisitOptions): PersonalAgendaInput {
  const contact = publishedContact(o.contact, o.audience, o.household);
  const detail = [visitWhat(v, contact), ...visitWhere(v, contact), ...prepWords(v)].join(' · ').slice(0, 200);
  return {
    ref: visitRef(v),
    kind: 'appointment',
    title: kt('visit.appointmentFor', { name: o.person.name }).slice(0, 120),
    start: v.at,
    end: visitEnd(v),
    allDay: !!v.allDay,
    ...(detail ? { calendarDetail: detail } : {}),
    url: o.url,
    who: o.person.name.slice(0, 60),
    ...(v.status === 'attended' ? { status: 'done' as const } : {}),
    private: true,
    audience: [...o.audience],
  };
}

/** The reminders' `ref`: one group per visit. */
export const visitReminderRef = (v: Pick<Visit, 'id'>): string => `health:visit:${v.id}`;

/**
 * When each of a visit's reminders goes: `remindBefore` its start; an all-day visit's from 9 AM on
 * its day (so "the day before" is 9 AM the day before), and at least at 8 AM on the day.
 */
export function reminderTimes(v: Pick<Visit, 'at' | 'allDay' | 'remindBefore'>): number[] {
  const base = v.allDay ? v.at + 9 * HOUR : v.at;
  const times = v.remindBefore.map((m) => (v.allDay && m < 1440 ? v.at + 8 * HOUR : base - m * MINUTE));
  return [...new Set(times)].sort((a, b) => a - b);
}

/**
 * Notifications before a visit, to `recipients` (the person's carers), from now on: "Appointment for
 * Ana", "Tomorrow at 10 AM: Dentist: Cleaning with Dr. Hart, 12 Example Street. Fasting from midnight."
 * None once it is over or marked.
 */
export function visitReminders(v: Visit, o: PublishVisitOptions & { /** `visitRecipients`. */ recipients: readonly string[]; now: number }): PersonalReminderInput[] {
  if (v.status || !o.recipients.length) return [];
  const contact = publishedContact(o.contact, o.audience, o.household);
  const where = visitWhere(v, contact);
  const prep = prepWords(v);
  return reminderTimes(v)
    .filter((at) => at > o.now && at < v.at + (v.allDay ? DAY : 1))
    .map((at) => {
      const what = [visitWhat(v, contact), ...where].join(', ');
      const body = kt('visit.reminderBody', { when: visitWhen(v, at, o.local), what }) + (prep.length ? ` ${capitalize(formatList(prep))}.` : '');
      return {
        id: reminderId(visitReminderRef(v), at),
        app: 'health',
        title: kt('visit.appointmentFor', { name: o.person.name }).slice(0, 120),
        body: body.slice(0, 500),
        at,
        url: o.url,
        recipients: [...o.recipients],
        ref: visitReminderRef(v),
        private: true,
        audience: [...o.audience],
      };
    });
}

/**
 * The to-do to book a visit's follow-up, while `followUpOpen`: "Book a follow-up for Ana", "Around
 * Aug 15", due two weeks before that day (or when the visit ends, if sooner). Booked and Not needed
 * both mark the visit (`followUpDoneAt`), as the reader who taps them: `givers` (its readers among
 * the audience) and admins.
 */
export function followUpTodo(v: Visit, visits: readonly Pick<Visit, 'followUpOf'>[], o: Omit<PublishVisitOptions, 'contact' | 'household'> & { givers: readonly string[]; now: number }): PersonalTodoInput | null {
  if (!followUpOpen(v, visits, o.now)) return null;
  const day = followUpDay(v, o.local)!;
  const end = visitEnd(v);
  // `day` is the household's; back to absolute through the same shift `local` applies at that moment.
  const shift = (o.local ?? ((t: number) => t))(end) - end;
  const due = Math.max(end, ymdToTime(addDays(day, -14)) - shift);
  const ops = [{ col: `healthPeople/${v.personId}/${VISITS}`, id: v.id, data: { followUpDoneAt: '$now', updatedAt: '$now' }, merge: true }];
  const who = { roles: ['admin' as const], ...(o.givers.length ? { emails: [...o.givers] } : {}) };
  return {
    ref: `followup:${v.personId}:${v.id}`,
    title: kt('visit.followUpTitle', { name: o.person.name }).slice(0, 120),
    detail: kt('visit.followUpDetail', { date: shortDate(day, toYmd((o.local ?? ((t: number) => t))(o.now))) }),
    createdAt: end,
    due,
    who: o.person.name.slice(0, 60),
    url: o.url,
    done: { label: kt('visit.booked'), ops, ...who },
    cancel: { label: kt('visit.notNeeded'), ops, ...who },
    audience: [...o.audience],
  };
}

// ---- Finding visits in a calendar (whose it is: `./people` `namedIn`) ----

/** What calendar scans look for: health visits' words, by the language a household's calendar may be in. */
export const VISIT_CALENDAR_WORDS: Record<Lang, readonly string[]> = {
  en: ['doctor', 'dr.', 'dentist', 'dental', 'checkup', 'check-up', 'physical', 'specialist', 'clinic', 'cardiology', 'dermatology', 'eye exam', 'optometrist', 'ophthalmologist', 'lab', 'blood test', 'blood work', 'x-ray', 'mri', 'vaccine', 'flu shot', 'therapy', 'therapist', 'physio', 'telehealth'],
  es: ['médico', 'doctor', 'dentista', 'consulta', 'chequeo', 'especialista', 'clínica', 'oculista', 'oftalmólogo', 'análisis', 'laboratorio', 'vacuna', 'terapia', 'fisioterapia'],
  nl: ['huisarts', 'dokter', 'tandarts', 'mondhygiënist', 'controle', 'specialist', 'ziekenhuis', 'polikliniek', 'oogarts', 'opticien', 'bloedprikken', 'prikpost', 'vaccinatie', 'griepprik', 'therapie', 'fysiotherapie', 'fysio'],
};

/** English always, plus the app's language. */
export function visitCalendarWords(lang: Lang = getLang()): string[] {
  return [...new Set(lang === 'en' ? VISIT_CALENDAR_WORDS.en : [...VISIT_CALENDAR_WORDS.en, ...VISIT_CALENDAR_WORDS[lang]])];
}

/** The kind of visit a title or place describes (English, Spanish or Dutch); `other` when it says nothing recognisable. */
export function guessVisitKind(text: string): VisitKind {
  const s = text.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  if (has(/\b(dentist\w*|dental|teeth|tooth|hygienist|orthodont\w*|dentista|limpieza dental|tandarts|mondhygi[eë]nist|gebit)\b/)) return 'dentist';
  if (has(/\b(eye|eyes|optometr\w*|ophthalmolog\w*|optician|vision|oculista|oftalm[oó]log\w*|vista|oogarts|opticien|ogen)\b/)) return 'eye';
  if (has(/\b(vaccin\w*|vaccine|shot|booster|immuni[sz]ation|flu jab|vacuna\w*|inenting|griepprik|prik)\b/)) return 'vaccine';
  if (has(/\b(lab|labs|blood (test|work|draw)|x-?ray|mri|ct scan|ultrasound|scan|test|an[aá]lisis|laboratorio|radiograf[ií]a|bloedprik\w*|bloedonderzoek|prikpost|r[oö]ntgen|echo)\b/)) return 'lab';
  if (has(/\b(therap\w*|physio\w*|counsel\w*|psycholog\w*|terapia|fisioterapia|psic[oó]log\w*|fysio\w*|psycholoog)\b/)) return 'therapy';
  if (has(/\b(cardiolog\w*|dermatolog\w*|neurolog\w*|oncolog\w*|orthop\w*|urolog\w*|gastro\w*|endocrin\w*|rheumat\w*|specialist\w*|especialista|cardi[oó]log\w*|polikliniek|ziekenhuis)\b/)) return 'specialist';
  if (has(/\b(check-?ups?|physical|annual|well(ness)? visit|gp|doctor|dr\.?|chequeo|revisi[oó]n|consulta|m[eé]dic[oa]|huisarts|dokter|controle)\b/)) return 'checkup';
  return 'other';
}
