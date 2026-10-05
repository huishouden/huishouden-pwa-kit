import type { PersonalAgendaInput } from './agenda-core.js';
import type { PersonalTodoInput } from './todo-core.js';
import { type PersonalReminderInput } from './reminder-core.js';
import { type Lang } from './i18n.js';
import { type Ymd } from './time.js';
import { type AudienceHousehold } from './audience.js';
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
export declare const VISIT_KINDS: readonly ["checkup", "specialist", "dentist", "eye", "lab", "vaccine", "therapy", "other"];
export type VisitKind = (typeof VISIT_KINDS)[number];
export declare const VISIT_STATUSES: readonly ["attended", "missed"];
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export declare const FOLLOW_UP_UNITS: readonly ["week", "month"];
export type FollowUpUnit = (typeof FOLLOW_UP_UNITS)[number];
export interface FollowUp {
    every: number;
    unit: FollowUpUnit;
}
/** The person's collections: `healthPeople/{personId}/visits` and `.../visitNotes`. */
export declare const VISITS = "visits";
export declare const VISIT_NOTES = "visitNotes";
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
export declare const VISIT_FIELDS: readonly ["personId", "kind", "title", "at", "allDay", "minutes", "contactId", "location", "link", "prep", "medList", "remindBefore", "followUp", "followUpOf", "followUpDoneAt", "status", "markedAt", "markedBy", "calendarEventId", "calendarLink", "createdAt", "updatedAt", "by", "via"];
export declare const VISIT_NOTE_FIELDS: readonly ["personId", "text", "updatedAt", "by", "via"];
/** What a carer who may not change the visit may still write: Attended or Missed, and the follow-up's answer. */
export declare const VISIT_MARK_FIELDS: readonly ["status", "markedAt", "markedBy", "followUpDoneAt", "updatedAt"];
export declare const VISIT_LIMITS: {
    readonly title: 120;
    readonly location: 200;
    readonly link: 500;
    readonly prepItem: 80;
    readonly prep: 6;
    readonly notes: 1000;
    readonly minutes: number;
    readonly remindBefore: 4;
    /** Two weeks. */
    readonly lead: number;
    readonly followUpEvery: 24;
    readonly id: 128;
    readonly calendarEventId: 1024;
    readonly calendarLink: 2000;
};
export declare const DEFAULT_VISIT_MINUTES = 60;
/** The day before and two hours before. */
export declare const DEFAULT_REMIND_BEFORE: readonly number[];
/** The lead times Health offers. */
export declare const REMIND_CHOICES: readonly number[];
export declare const FOLLOW_UP_CHOICES: readonly FollowUp[];
/** Lead times as stored: whole minutes from 0 to two weeks, unique, longest first, at most four. */
export declare function cleanRemindBefore(list: readonly unknown[] | undefined): number[];
export declare function cleanFollowUp(v: unknown): FollowUp | undefined;
export declare function cleanPrep(list: readonly unknown[] | undefined): string[];
/** A stored visit, read defensively. */
export declare function toVisit(id: string, d: Record<string, unknown>, personId?: string): Visit;
export type VisitInput = Omit<VisitData, 'createdAt' | 'updatedAt' | 'by' | 'via' | 'remindBefore'> & {
    remindBefore?: readonly number[];
};
/**
 * The stored document, exactly as the rules accept it: trimmed, clipped, no undefined fields, and
 * no words of the writer's language (no title stays no title: `visitTitle` says the kind in the
 * reader's). `stamp` is `createdAt`, `by` and, on a change, `updatedAt` (`./store` `stampFor`);
 * `via` the assistant's mark. Attended or Missed is kept as given (an edit keeps who marked it);
 * mark with `visitMark`.
 */
export declare function visitDoc(input: VisitInput, stamp: {
    createdAt: number;
    by: string;
    updatedAt?: number;
}, via?: 'assistant'): VisitData;
/**
 * Attended or Missed, signed by `me` now: a patch to merge into the visit (only the mark's fields and
 * `updatedAt`, all a helper carer may write), so nothing else about the visit is touched.
 */
export declare function visitMark(status: VisitStatus, me: string, now: number): Required<Pick<VisitData, 'status' | 'markedAt' | 'markedBy' | 'updatedAt'>>;
/**
 * The visit with its mark taken back (Undo): the whole document without `status`, `markedAt` and
 * `markedBy`, built from `VISIT_FIELDS` only (no `id`), to write as a replace, since a merge would
 * keep the mark. Build it from the visit as just read (Health's live snapshot): a replace writes back
 * whatever else that copy holds.
 */
export declare function visitUnmarked(v: VisitData, now: number): VisitData;
export declare function visitNoteDoc(personId: string, text: string, by: string, now: number, via?: 'assistant'): VisitNoteData;
/** When it ends: its length after `at`, or the end of its day when all day. */
export declare function visitEnd(v: Pick<Visit, 'at' | 'allDay' | 'minutes'>): number;
/**
 * Where a visit stands: `upcoming` before it starts, `now` while on, `unmarked` once over and nobody
 * said whether it happened, `attended` or `missed` once someone did.
 */
export type VisitState = 'upcoming' | 'now' | 'unmarked' | VisitStatus;
export declare function visitState(v: Pick<Visit, 'at' | 'allDay' | 'minutes' | 'status'>, now: number): VisitState;
/** The day the follow-up is due: `followUp` after the visit's day. */
export declare function followUpDay(v: Pick<Visit, 'at' | 'followUp'>, local?: (t: number) => number): Ymd | null;
/** A follow-up still to book: the visit is over and not missed, it wants one, and none is booked or waived. */
export declare function followUpOpen(v: Visit, visits: readonly Pick<Visit, 'followUpOf'>[], now: number): boolean;
/** "Checkup", "Eye doctor": the kind in the active language. */
export declare const visitKindLabel: (kind: VisitKind) => string;
/** "1 day before", "2 hours before", "At the time". */
export declare function leadWords(minutes: number): string;
/** "In 3 months", "In 2 weeks". */
export declare const followUpWords: (f: FollowUp) => string;
/** What to do before: the household's own lines, and the medicine list. */
export declare function prepWords(v: Pick<Visit, 'prep' | 'medList'>): string[];
/** Its title, or with none the kind in the reader's language: "Cleaning", "Dentist". */
export declare const visitTitle: (v: Pick<Visit, "kind" | "title">) => string;
/** What the person's own calendar and the reminders say about it: "Dentist: Cleaning with Dr. Hart", "Dentist with Dr. Hart". */
export declare function visitWhat(v: Pick<Visit, 'kind' | 'title'>, contact?: {
    name: string;
}): string;
/** Where: the place typed, else the contact's address, and "Video visit" with a link. */
export declare function visitWhere(v: Pick<Visit, 'location' | 'link'>, contact?: {
    address?: string;
}): string[];
/** "At 10 AM", "Tomorrow at 10 AM", "Thu, May 15 at 10 AM", as said at `from`. */
export declare function visitWhen(v: Pick<Visit, 'at' | 'allDay'>, from: number, local?: (t: number) => number): string;
/** Told before a visit: the person's carers who aren't kids, else the person themself, else the first admin. */
export declare function visitRecipients(p: {
    carers: readonly string[];
    email?: string;
}, h: AudienceHousehold): string[];
/**
 * The doctor or clinic as a visit's published items may name it: a contact marked private (admins
 * and members only; one without the flag counts as private) only when everyone in the audience may
 * read private records, so a helper carer never learns it from a reminder or a calendar.
 * `visitAgendaItem` and `visitReminders` apply it themselves.
 */
export declare function publishedContact(c: VisitContact | undefined, audience: readonly string[], h: AudienceHousehold): {
    name: string;
    address?: string;
} | undefined;
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
export declare const visitRef: (v: Pick<Visit, "id" | "personId">) => string;
/**
 * One agenda item, for the portal's Today and Calendar and the readers' own calendars: "Appointment
 * for Ana" (nothing more where the portal shows it), with what, with whom, where and what to bring in
 * `calendarDetail`.
 */
export declare function visitAgendaItem(v: Visit, o: PublishVisitOptions): PersonalAgendaInput;
/** The reminders' `ref`: one group per visit. */
export declare const visitReminderRef: (v: Pick<Visit, "id">) => string;
/**
 * When each of a visit's reminders goes: `remindBefore` its start; an all-day visit's from 9 AM on
 * its day (so "the day before" is 9 AM the day before), and at least at 8 AM on the day.
 */
export declare function reminderTimes(v: Pick<Visit, 'at' | 'allDay' | 'remindBefore'>): number[];
/**
 * Notifications before a visit, to `recipients` (the person's carers), from now on: "Appointment for
 * Ana", "Tomorrow at 10 AM: Dentist: Cleaning with Dr. Hart, 12 Example Street. Fasting from midnight."
 * None once it is over or marked.
 */
export declare function visitReminders(v: Visit, o: PublishVisitOptions & {
    recipients: readonly string[];
    now: number;
}): PersonalReminderInput[];
/**
 * The to-do to book a visit's follow-up, while `followUpOpen`: "Book a follow-up for Ana", "Around
 * Aug 15", due two weeks before that day (or when the visit ends, if sooner). Booked and Not needed
 * both mark the visit (`followUpDoneAt`), as the reader who taps them: `givers` (its readers among
 * the audience) and admins.
 */
export declare function followUpTodo(v: Visit, visits: readonly Pick<Visit, 'followUpOf'>[], o: Omit<PublishVisitOptions, 'contact' | 'household'> & {
    givers: readonly string[];
    now: number;
}): PersonalTodoInput | null;
/** What calendar scans look for: health visits' words, by the language a household's calendar may be in. */
export declare const VISIT_CALENDAR_WORDS: Record<Lang, readonly string[]>;
/** English always, plus the app's language. */
export declare function visitCalendarWords(lang?: Lang): string[];
/** The kind of visit a title or place describes (English, Spanish or Dutch); `other` when it says nothing recognisable. */
export declare function guessVisitKind(text: string): VisitKind;
