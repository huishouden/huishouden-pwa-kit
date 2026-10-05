import { type Lang } from './i18n.js';
import { type ReminderSource } from './reminder-source.js';
/**
 * The reminder documents (`./reminders`) without Firebase: their shape, ids and builders, for servers
 * that write the same documents over Firestore REST as a signed-in person (the household tools).
 * `./reminders` re-exports all of it.
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
    /**
     * What it is about, so the sender deletes it unsent once that is done anywhere: a bill paid from
     * the portal, a task ticked in Google Tasks (`./reminder-source`). Without one it is always sent.
     */
    source?: ReminderSource;
    sent: boolean;
    sentAt?: number;
    createdAt: number;
    by: string;
}
export declare const REMINDER_FIELDS: readonly ["app", "title", "body", "texts", "at", "url", "recipients", "ref", "private", "source", "sent", "sentAt", "createdAt", "by"];
/** Limits of a stored title and body, also inside `texts` (the rules check the same). */
export declare const REMINDER_LIMITS: {
    readonly title: 120;
    readonly body: 500;
};
/** The collection of reminders for named members only (`./audience`); the sender reads it too. */
export declare const PERSONAL_REMINDERS = "personalReminders";
/** Fields of a `personalReminders` document: a reminder's plus `audience`. */
export declare const PERSONAL_REMINDER_FIELDS: readonly ["app", "title", "body", "texts", "at", "url", "recipients", "ref", "private", "source", "sent", "sentAt", "createdAt", "by", "audience"];
export type ReminderInput = Pick<Reminder, 'app' | 'title' | 'at' | 'url'> & Partial<Pick<Reminder, 'id' | 'body' | 'texts' | 'recipients' | 'ref' | 'private' | 'source'>>;
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
 * A `personalReminders` document: as `reminderDoc`, private, with the audience cleaned and the
 * recipients narrowed to it. Throws when the audience leaves out the writer or no recipient is in it.
 */
export declare function personalReminderDoc(input: PersonalReminderInput, by: string, now?: number): Omit<Reminder, 'id'>;
export declare function toReminder(id: string, data: Record<string, unknown>): Reminder;
