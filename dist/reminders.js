import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { deleteDoc, setDoc, writeBatch } from './firestore.js';
import { doseSlots } from './dose.js';
import { cleanAudience, inAudience } from './audience.js';
import { kt } from './i18n.js';
import { atClock } from './time.js';
import { readSource } from './reminder-source.js';
import { cleanTexts, localizeReminders, PERSONAL_REMINDERS, personalReminderDoc, reminderDoc, reminderId, toReminder } from './reminder-core.js';
export * from './reminder-core.js';
const remindersOf = (db, householdId) => collection(db, 'households', householdId, 'reminders');
const personalOf = (db, householdId) => collection(db, 'households', householdId, PERSONAL_REMINDERS);
/** Reminders matching `filters`, or for a helper or kid only the open ones (what the rules let them read). */
const visible = (db, householdId, restricted, ...filters) => query(remindersOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));
const refused = (e) => e?.code === 'permission-denied';
async function commit(db, ops, restricted = false) {
    if (restricted) {
        for (const op of ops) {
            const batch = writeBatch(db);
            op(batch);
            await batch.commit().catch((e) => {
                if (!refused(e))
                    throw e;
            });
        }
        return;
    }
    for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 450))
            op(batch);
        await batch.commit();
    }
}
/**
 * Creates or replaces a reminder (id from `reminderId(ref ?? app, at)` unless given). Writing it
 * again marks it unsent, so it is delivered again if its time has come.
 */
export async function upsertReminder(db, householdId, input, by) {
    const id = input.id ?? reminderId(input.ref ?? input.app, input.at);
    await setDoc(doc(remindersOf(db, householdId), id), reminderDoc(input, by));
    return id;
}
export async function cancelReminder(db, householdId, id) {
    await deleteDoc(doc(remindersOf(db, householdId), id));
}
/** Deletes every reminder with this `ref` (a course stopped, an appointment cancelled). */
export async function cancelReminders(db, householdId, ref, { restricted } = {}) {
    const snap = await getDocs(visible(db, householdId, restricted, where('ref', '==', ref)));
    await commit(db, snap.docs.map((d) => (b) => b.delete(d.ref)), restricted);
    return snap.size;
}
/**
 * Makes the reminders with this `ref` exactly `inputs` from now on: future ones not in the list are
 * deleted, the list is written (unchanged ones keep their ids), and past ones are left alone so a
 * sent reminder is never sent twice. Use it whenever a course or appointment is saved.
 */
export async function replaceReminders(db, householdId, ref, inputs, by, now = Date.now(), { restricted } = {}) {
    const wanted = new Map(inputs
        .filter((r) => r.at > now && !(restricted && r.private))
        .map((r) => [r.id ?? reminderId(ref, r.at), reminderDoc({ ...r, ref }, by, now)]));
    const existing = await getDocs(visible(db, householdId, restricted, where('ref', '==', ref)));
    const ops = [];
    for (const d of existing.docs) {
        const at = d.data().at;
        if (at > now && !wanted.has(d.id))
            ops.push((b) => b.delete(d.ref));
    }
    for (const [id, data] of wanted)
        ops.push((b) => b.set(doc(remindersOf(db, householdId), id), data));
    await commit(db, ops, restricted);
    return [...wanted.keys()];
}
/** A reminder as it would be sent, for telling whether a stored one needs rewriting. */
const sameReminder = (a, b) => ['app', 'title', 'body', 'at', 'url', 'ref', 'private'].every((k) => a[k] === b[k]) &&
    JSON.stringify(a.recipients) === JSON.stringify(b.recipients) &&
    JSON.stringify(cleanTexts(a.texts) ?? null) === JSON.stringify(b.texts ?? null) &&
    JSON.stringify(readSource(String(a.app ?? ''), a.source) ?? null) === JSON.stringify(b.source ?? null) &&
    a.sent === false;
/**
 * Makes everything this app has scheduled from now on exactly `inputs` (each with its own `ref`):
 * for apps that work out all their reminders from their data, on open and whenever it changes. Future
 * reminders not in the list are deleted, new or changed ones written, and unchanged ones left alone,
 * so running it often costs one read and almost no writes. Past and sent reminders are never
 * touched, so nothing is sent twice.
 */
export async function syncReminders(db, householdId, app, inputs, by, now = Date.now(), { restricted } = {}) {
    const wanted = new Map(inputs
        .filter((r) => r.at > now && !(restricted && r.private))
        .map((r) => {
        const data = reminderDoc({ ...r, app }, by, now);
        return [r.id ?? reminderId(r.ref ?? app, data.at), data];
    }));
    const existing = await getDocs(visible(db, householdId, restricted, where('app', '==', app)));
    const have = new Map(existing.docs.map((d) => [d.id, d.data()]));
    const ops = [];
    for (const d of existing.docs) {
        const data = d.data();
        if (typeof data.at === 'number' && data.at > now && data.sent !== true && !wanted.has(d.id))
            ops.push((b) => b.delete(d.ref));
    }
    const deleted = ops.length;
    let unchanged = 0;
    for (const [id, data] of wanted) {
        const old = have.get(id);
        if (old && sameReminder(old, data))
            unchanged++;
        else if (old?.sent === true)
            unchanged++;
        else
            ops.push((b) => b.set(doc(remindersOf(db, householdId), id), data));
    }
    await commit(db, ops, restricted);
    return { written: ops.length - deleted, deleted, unchanged };
}
/**
 * Makes this app's reminders for named members exactly `inputs` from now on, as `syncReminders`
 * does for shared ones: the reminders whose audience includes `by`. Past and sent ones are never
 * touched; inputs whose audience leaves `by` out, or with no recipient in it, are skipped.
 */
export async function syncPersonalReminders(db, householdId, app, inputs, by, now = Date.now()) {
    const me = by.trim().toLowerCase();
    const wanted = new Map();
    for (const r of inputs) {
        if (r.at <= now || !inAudience(cleanAudience(r.audience), me))
            continue;
        let data;
        try {
            data = personalReminderDoc({ ...r, app }, me, now);
        }
        catch {
            continue;
        }
        wanted.set(r.id ?? reminderId(r.ref ?? app, data.at), data);
    }
    const col = personalOf(db, householdId);
    const existing = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
    const ops = [];
    for (const d of existing.docs) {
        const data = d.data();
        if (typeof data.at === 'number' && data.at > now && data.sent !== true && !wanted.has(d.id))
            ops.push((b) => b.delete(d.ref));
    }
    const deleted = ops.length;
    const have = new Map(existing.docs.map((d) => [d.id, d.data()]));
    let unchanged = 0;
    for (const [id, data] of wanted) {
        const old = have.get(id);
        if (old && sameReminder(old, data) && JSON.stringify(old.audience) === JSON.stringify(data.audience))
            unchanged++;
        else if (old?.sent === true)
            unchanged++;
        else
            ops.push((b) => b.set(doc(col, id), data));
    }
    await commit(db, ops);
    return { written: ops.length - deleted, deleted, unchanged };
}
/** Follows the household's reminders, optionally one app's, soonest first. */
export function watchReminders(db, householdId, onChange, { app, restricted, onError } = {}) {
    const source = visible(db, householdId, restricted, ...(app ? [where('app', '==', app)] : []));
    return onSnapshot(source, (snap) => onChange(snap.docs.map((d) => toReminder(d.id, d.data())).sort((a, b) => a.at - b.at)), (error) => onError?.(error));
}
/**
 * One reminder per future dose of a course, with stable ids (`reminderId(ref, at)`), ready for
 * `replaceReminders(db, householdId, ref, reminders, by)`. Courses with a length get every
 * remaining dose; ongoing ones the next `horizonDays`.
 */
export function remindersForCourse(course, options) {
    const now = options.now ?? Date.now();
    const ref = options.ref ?? `${options.app}:course:${course.id}`;
    const lead = (options.leadMinutes ?? 0) * 60_000;
    const horizon = now + (options.horizonDays ?? 14) * 86_400_000;
    const to = course.days !== undefined ? Number.MAX_SAFE_INTEGER : horizon;
    const slots = doseSlots({ startDate: course.startDate, days: course.days, times: course.times, everyDays: options.everyDays }, now + lead, Math.min(to, now + 366 * 86_400_000));
    const title = options.forWhom && course.name ? kt('reminders.titleFor', { who: options.forWhom, name: course.name }) : options.forWhom || course.name || kt('reminders.medicine');
    const food = course.withFood === true ? 'with' : course.withFood === false ? 'without' : null;
    // The dose's time as said in the reader's language ("at 8 PM", "a las 8 p.m.", "om 20:00"), not 'HH:MM'.
    const body = (time) => {
        const at = atClock(time);
        return course.dose && food
            ? kt('reminders.bodyDoseFood', { dose: course.dose, at, food })
            : course.dose
                ? kt('reminders.bodyDose', { dose: course.dose, at })
                : food
                    ? kt('reminders.bodyFood', { food })
                    : kt('reminders.bodyTime', { at });
    };
    return slots.map((slot) => ({
        id: reminderId(ref, slot.at - lead),
        app: options.app,
        title,
        body: body(slot.time),
        at: slot.at - lead,
        url: options.url,
        recipients: options.recipients ?? 'all',
        ...(options.private ? { private: true } : {}),
        ref,
    }));
}
/** `remindersForCourse` with `texts` in every language (`localizeReminders`), so each device is notified in its own. */
export function remindersForCourseInEveryLang(course, options) {
    const now = options.now ?? Date.now();
    return localizeReminders(() => remindersForCourse(course, { ...options, now }));
}
