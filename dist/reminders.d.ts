import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type MedCourse } from './dose.js';
import { type Lang } from './i18n.js';
/**
 * Reminders any app writes and the shared sender (huishouden/notify) delivers as push
 * notifications: one collection, `households/{id}/reminders`. The sender checks every five
 * minutes for reminders that are due and not yet sent, pushes them to the recipients' devices,
 * and marks them sent. Apps never send anything themselves.
 *
 * Each device is notified in its own language. A reminder's `title` and `body` are in the writer's
 * language; `texts` carries the same title and body in every language the suite speaks, and the
 * sender shows the one matching the device's push subscription (`./push` `lang`), falling back to
 * `title`/`body`. Kit builders fill `texts` (`remindersForCourseInEveryLang`); an app wraps its own
 * reminder builder with `localizeReminders(() => build())`, which runs it once per language.
 *
 * Fields match the rules exactly (see REMINDER_FIELDS); keep them in step.
 */
/** A reminder's words in one language. */
export interface ReminderText {
    title: string;
    body: string;
}
/** The same title and body per language (`en`, `es`, `nl`), for the sender to pick by the device's language. */
export type ReminderTexts = Partial<Record<Lang, ReminderText>>;
export interface Reminder {
    id: string;
    /** Short name of the app that owns it ("pet"); its notification opens in that app when it can. */
    app: string;
    title: string;
    body: string;
    /** `title` and `body` in each language; the sender uses the device's (`./push` `lang`), else `title`/`body`. */
    texts?: ReminderTexts;
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
export declare const REMINDER_FIELDS: readonly ["app", "title", "body", "texts", "at", "url", "recipients", "ref", "private", "sent", "sentAt", "createdAt", "by"];
/** Limits of a stored title and body, also inside `texts` (the rules check the same). */
export declare const REMINDER_LIMITS: {
    readonly title: 120;
    readonly body: 500;
};
/** The collection of reminders for named members only (`./audience`); the sender reads it too. */
export declare const PERSONAL_REMINDERS = "personalReminders";
/** Fields of a `personalReminders` document: a reminder's plus `audience`. */
export declare const PERSONAL_REMINDER_FIELDS: readonly ["app", "title", "body", "texts", "at", "url", "recipients", "ref", "private", "sent", "sentAt", "createdAt", "by", "audience"];
export type ReminderInput = Pick<Reminder, 'app' | 'title' | 'at' | 'url'> & Partial<Pick<Reminder, 'id' | 'body' | 'texts' | 'recipients' | 'ref' | 'private'>>;
/** `texts` as stored: known languages only, each title and body trimmed and clipped; undefined when none is left. */
export declare function cleanTexts(texts: ReminderTexts | undefined | null): ReminderTexts | undefined;
/**
 * Runs `build` once per language (its `t`/`kt` and formatters in that language) and returns its
 * reminders in the page's language, each with `texts` holding every language's title and body, so
 * each device is notified in its own. `build` must be synchronous and return the same reminders in
 * the same order every time (only the words differ).
 *
 * ```ts
 * syncReminders(db, id, 'car', await localizeReminders(() => carReminders(data)), me);
 * ```
 */
export declare function localizeReminders<R extends ReminderInput>(build: () => R[]): Promise<(R & {
    texts: ReminderTexts;
})[]>;
/**
 * For writes from a helper's or kid's device (`isRestricted(role)`): only reminders not marked
 * private are read and written, each on its own, and one the rules refuse (written before the
 * flag, until an admin's or member's device rewrites it) is skipped rather than failing the rest.
 */
export interface ReminderWriteOptions {
    restricted?: boolean;
}
/** A reminder for named members only: who may read it (`./audience`); `recipients` must be a list of some of them. */
export type PersonalReminderInput = ReminderInput & {
    audience: readonly string[];
    recipients: string[];
};
/**
 * The same id for the same reminder however often it is written, so re-saving a course
 * overwrites its reminders instead of doubling them: `<ref or app>-<at>`, Firestore-safe.
 */
export declare function reminderId(refOrApp: string, at: number): string;
/** The document a reminder is stored as: trimmed, recipients lowercased, unsent. */
export declare function reminderDoc(input: ReminderInput, by: string, now?: number): Omit<Reminder, 'id'>;
/**
 * Creates or replaces a reminder (id from `reminderId(ref ?? app, at)` unless given). Writing it
 * again marks it unsent, so it is delivered again if its time has come.
 */
export declare function upsertReminder(db: Firestore, householdId: string, input: ReminderInput, by: string): Promise<string>;
export declare function cancelReminder(db: Firestore, householdId: string, id: string): Promise<void>;
/** Deletes every reminder with this `ref` (a course stopped, an appointment cancelled). */
export declare function cancelReminders(db: Firestore, householdId: string, ref: string, { restricted }?: ReminderWriteOptions): Promise<number>;
/**
 * Makes the reminders with this `ref` exactly `inputs` from now on: future ones not in the list are
 * deleted, the list is written (unchanged ones keep their ids), and past ones are left alone so a
 * sent reminder is never sent twice. Use it whenever a course or appointment is saved.
 */
export declare function replaceReminders(db: Firestore, householdId: string, ref: string, inputs: ReminderInput[], by: string, now?: number, { restricted }?: ReminderWriteOptions): Promise<string[]>;
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
export declare function syncReminders(db: Firestore, householdId: string, app: string, inputs: ReminderInput[], by: string, now?: number, { restricted }?: ReminderWriteOptions): Promise<SyncRemindersResult>;
/**
 * A `personalReminders` document: as `reminderDoc`, private, with the audience cleaned and the
 * recipients narrowed to it. Throws when the audience leaves out the writer or no recipient is in it.
 */
export declare function personalReminderDoc(input: PersonalReminderInput, by: string, now?: number): Omit<Reminder, 'id'>;
/**
 * Makes this app's reminders for named members exactly `inputs` from now on, as `syncReminders`
 * does for shared ones: the reminders whose audience includes `by`. Past and sent ones are never
 * touched; inputs whose audience leaves `by` out, or with no recipient in it, are skipped.
 */
export declare function syncPersonalReminders(db: Firestore, householdId: string, app: string, inputs: PersonalReminderInput[], by: string, now?: number): Promise<SyncRemindersResult>;
export declare function toReminder(id: string, data: Record<string, unknown>): Reminder;
/** Follows the household's reminders, optionally one app's, soonest first. */
export declare function watchReminders(db: Firestore, householdId: string, onChange: (reminders: Reminder[]) => void, { app, restricted, onError }?: {
    app?: string;
    restricted?: boolean;
    onError?: (error: Error) => void;
}): Unsubscribe;
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
export declare function remindersForCourse(course: MedCourse & {
    id: string;
}, options: CourseReminderOptions): ReminderInput[];
/** `remindersForCourse` with `texts` in every language (`localizeReminders`), so each device is notified in its own. */
export declare function remindersForCourseInEveryLang(course: MedCourse & {
    id: string;
}, options: CourseReminderOptions): Promise<ReminderInput[]>;
