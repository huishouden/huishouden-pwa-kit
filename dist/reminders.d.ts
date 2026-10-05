import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type MedCourse } from './dose.js';
import { type PersonalReminderInput, type Reminder, type ReminderInput } from './reminder-core.js';
export type { ReminderSource, SourceCheck, SourceCondition, SourceValue } from './reminder-source.js';
export * from './reminder-core.js';
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
/**
 * For writes from a helper's or kid's device (`isRestricted(role)`): only reminders not marked
 * private are read and written, each on its own, and one the rules refuse (written before the
 * flag, until an admin's or member's device rewrites it) is skipped rather than failing the rest.
 */
export interface ReminderWriteOptions {
    restricted?: boolean;
}
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
 * Makes this app's reminders for named members exactly `inputs` from now on, as `syncReminders`
 * does for shared ones: the reminders whose audience includes `by`. Past and sent ones are never
 * touched; inputs whose audience leaves `by` out, or with no recipient in it, are skipped.
 */
export declare function syncPersonalReminders(db: Firestore, householdId: string, app: string, inputs: PersonalReminderInput[], by: string, now?: number): Promise<SyncRemindersResult>;
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
