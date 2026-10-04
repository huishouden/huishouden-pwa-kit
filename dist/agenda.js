import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { writeBatch } from './firestore.js';
import { MONEY_APPS } from './roles.js';
import { cleanAudience, inAudience } from './audience.js';
import { HOUR, daysBetween, dueText, dueWords, formatTime, longDate, startOfDay, toYmd, ymdToTime, addDays } from './time.js';
import { capitalize, cleanLocalTexts, kt, localizeRecords, localized } from './i18n.js';
export const AGENDA_KINDS = ['appointment', 'due', 'renewal', 'bill', 'birthday', 'medicine', 'feeding', 'task', 'other'];
export const AGENDA_STATUSES = ['upcoming', 'overdue', 'done'];
export const AGENDA_FIELDS = ['app', 'ref', 'kind', 'title', 'start', 'end', 'allDay', 'detail', 'url', 'who', 'status', 'private', 'texts', 'updatedAt', 'by'];
/** The collection of items for named members only (`./audience`). */
export const PERSONAL_AGENDA = 'personalAgenda';
/** Fields of a `personalAgenda` item: the agenda's plus `audience`. */
export const PERSONAL_AGENDA_FIELDS = [...AGENDA_FIELDS, 'audience'];
/** Maximum lengths, the same as the rules. */
export const AGENDA_LIMITS = { app: 40, ref: 200, title: 120, detail: 200, url: 2000, who: 60, by: 254 };
/** Limits inside `texts`, the same as the fields they translate. */
export const AGENDA_TEXT_LIMITS = { title: AGENDA_LIMITS.title, detail: AGENDA_LIMITS.detail };
/**
 * Runs `build` once per language and gives its items with `texts` (title and detail), so the
 * portal shows each reader their own language:
 *
 * ```ts
 * syncAgenda(db, id, 'bills', await localizeAgenda(() => billAgenda(bills)), { by: me });
 * ```
 */
export function localizeAgenda(build) {
    return localizeRecords(build, (item) => ({ title: item.title, detail: item.detail }));
}
/** An item's title and detail in the reader's language. */
export function agendaWords(item) {
    return { title: localized(item, 'title', item.title) ?? item.title, detail: localized(item, 'detail', item.detail) };
}
/** Apps publish items from this many days ago (overdue ones whatever their age)... */
export const AGENDA_PAST_DAYS = 30;
/** ...to this many days ahead. */
export const AGENDA_AHEAD_DAYS = 180;
/** An all-day item's `start` (and, for the day after its last, `end`): local midnight of a day. */
export const allDayStart = (day) => ymdToTime(day);
const agendaOf = (db, householdId) => collection(db, 'households', householdId, 'agenda');
const personalOf = (db, householdId) => collection(db, 'households', householdId, PERSONAL_AGENDA);
const safe = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '_');
/** The same id for the same item however often it is published: `<app>_<ref>_<start>`, Firestore-safe. */
export function agendaId(app, ref, start) {
    return `${safe(app).slice(0, 40)}_${safe(ref).slice(0, 200)}_${Math.round(start)}`;
}
const clip = (s, max) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules would refuse. */
export function agendaDoc(app, input, by, now = Date.now()) {
    if (!/^https:\/\//.test(input.url))
        throw new Error('Agenda url must be an https deep link into the app.');
    if (!AGENDA_KINDS.includes(input.kind))
        throw new Error(`Unknown agenda kind: ${input.kind}`);
    if (input.status !== undefined && !AGENDA_STATUSES.includes(input.status))
        throw new Error(`Unknown agenda status: ${input.status}`);
    if (!Number.isFinite(input.start))
        throw new Error('Agenda item has no start.');
    const title = clip(input.title, AGENDA_LIMITS.title);
    if (!title)
        throw new Error('Agenda item has no title.');
    if (!input.ref)
        throw new Error('Agenda item has no ref.');
    const start = Math.round(input.start);
    const end = input.end !== undefined && Number.isFinite(input.end) && Math.round(input.end) > start ? Math.round(input.end) : undefined;
    const detail = clip(input.detail, AGENDA_LIMITS.detail);
    const who = clip(input.who, AGENDA_LIMITS.who);
    const texts = cleanLocalTexts(input.texts, AGENDA_TEXT_LIMITS);
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
        private: input.private === true || MONEY_APPS.includes(app),
        ...(texts ? { texts } : {}),
        updatedAt: now,
        by: by.trim().toLowerCase(),
    };
}
/**
 * A `personalAgenda` document: as `agendaDoc`, private, with the audience cleaned. Throws when the
 * audience is empty or leaves out the writer (the rules refuse both).
 */
export function personalAgendaDoc(app, input, by, now = Date.now()) {
    const audience = cleanAudience(input.audience);
    if (!inAudience(audience, by))
        throw new Error('A personal agenda item must name its writer in its audience.');
    const { audience: _a, ...rest } = input;
    return { ...agendaDoc(app, { ...rest, private: true }, by, now), audience };
}
/** The window apps publish: from `AGENDA_PAST_DAYS` ago to `AGENDA_AHEAD_DAYS` ahead, whole days. */
export function agendaWindow(now) {
    return { from: addDays(now, -AGENDA_PAST_DAYS), to: addDays(now, AGENDA_AHEAD_DAYS + 1) };
}
/** Whether an item belongs in the published window: overlapping it, or overdue whatever its age. */
export function inAgendaWindow(item, now) {
    const { from, to } = agendaWindow(now);
    if (item.start >= to)
        return false;
    return item.status === 'overdue' || (item.end ?? item.start) >= from;
}
const comparable = ({ updatedAt: _u, by: _b, ...rest }) => {
    delete rest.id;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
};
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
/** Makes `stored` (this app's items, or one ref's) exactly `items`, writing only what changed. */
async function reconcile(db, householdId, app, stored, items, { by, restricted = false, now = Date.now() }, { col = agendaOf(db, householdId), build = (item) => agendaDoc(app, item, by, now) } = {}) {
    const wanted = new Map();
    for (const item of items) {
        if (!inAgendaWindow(item, now))
            continue;
        // A helper's device can't see private items, so it never publishes or removes them.
        if (restricted && item.private)
            continue;
        wanted.set(agendaId(app, item.ref, item.start), build(item));
    }
    const ops = [];
    let unchanged = 0;
    const have = new Map(stored.map((s) => [s.id, s.data]));
    for (const { id } of stored)
        if (!wanted.has(id))
            ops.push((b) => b.delete(doc(col, id)));
    const deleted = ops.length;
    for (const [id, data] of wanted) {
        const old = have.get(id);
        if (old && comparable(toAgendaItem(id, old)) === comparable({ ...data }))
            unchanged++;
        else
            ops.push((b) => b.set(doc(col, id), data));
    }
    await commit(db, ops, restricted);
    return { written: ops.length - deleted, deleted, unchanged };
}
/** The agenda, or for a helper or kid only its open items (what the rules let them read). */
const visible = (db, householdId, restricted, ...filters) => query(agendaOf(db, householdId), ...filters, ...(restricted ? [where('private', '==', false)] : []));
const snapshotDocs = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
/**
 * Makes one source record's items exactly `items` (each gets `ref`): call it when the record is
 * saved. Ids are idempotent, unchanged items are not rewritten, and items this record no longer
 * has (a moved appointment's old time) are deleted. An empty list removes the record's items.
 */
export async function replaceAgenda(db, householdId, app, ref, items, options) {
    const snap = await getDocs(visible(db, householdId, options.restricted, where('app', '==', app), where('ref', '==', ref)));
    return reconcile(db, householdId, app, snapshotDocs(snap), items.map((i) => ({ ...i, ref })), options);
}
/** Deletes one source record's items (the record was deleted). */
export async function removeAgenda(db, householdId, app, ref, { restricted = false } = {}) {
    const snap = await getDocs(visible(db, householdId, restricted, where('app', '==', app), where('ref', '==', ref)));
    await commit(db, snap.docs.map((d) => (b) => b.delete(d.ref)), restricted);
    return snap.docs.length;
}
/**
 * Makes everything this app has published exactly `items`: for apps that work out all their dates
 * when they open. Writes only what changed and deletes what is no longer there, so running it on
 * every open costs one read of the app's items and almost no writes.
 */
export async function syncAgenda(db, householdId, app, items, options) {
    const snap = await getDocs(visible(db, householdId, options.restricted, where('app', '==', app)));
    return reconcile(db, householdId, app, snapshotDocs(snap), items, options);
}
/**
 * Makes this app's items for named members exactly `items`, as `syncAgenda` does for the shared
 * agenda: the items whose audience includes `by` (the only ones this member may read or write).
 * Items whose audience leaves `by` out are skipped; another allowed member's device keeps them.
 */
export async function syncPersonalAgenda(db, householdId, app, items, { by, now = Date.now() }) {
    const me = by.trim().toLowerCase();
    const col = personalOf(db, householdId);
    const snap = await getDocs(query(col, where('app', '==', app), where('audience', 'array-contains', me)));
    const mine = items.filter((i) => inAudience(cleanAudience(i.audience), me));
    return reconcile(db, householdId, app, snapshotDocs(snap), mine, { by: me, now }, { col, build: (item) => personalAgendaDoc(app, item, me, now) });
}
const str = (v) => (typeof v === 'string' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** A stored document as an item, read defensively. */
export function toAgendaItem(id, data) {
    const kind = AGENDA_KINDS.includes(data.kind) ? data.kind : 'other';
    const status = AGENDA_STATUSES.includes(data.status) ? data.status : undefined;
    const end = num(data.end);
    const detail = str(data.detail);
    const who = str(data.who);
    const texts = cleanLocalTexts(data.texts, AGENDA_TEXT_LIMITS);
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
        // Left out when the document has no flag, so an admin's or member's sync writes one.
        ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
        ...(Array.isArray(data.audience) ? { audience: data.audience.filter((e) => typeof e === 'string') } : {}),
        ...(texts ? { texts } : {}),
        updatedAt: num(data.updatedAt) ?? 0,
        by: str(data.by) ?? '',
    };
}
const byStart = (a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title);
/**
 * Follows the household's items overlapping `from`..`to` (and any overdue), soonest first; with
 * `me`, the member's personal items too. Waits for both lists before the first answer.
 */
export function watchAgenda(db, householdId, range, onChange) {
    const { from, to, apps, restricted, me, onError } = range;
    const keep = (i) => i.start < to && (!apps || apps.includes(i.app)) && (i.status === 'overdue' || (i.end ?? i.start) >= from);
    let shared = null;
    let personal = me ? null : [];
    const emit = () => {
        if (shared && personal)
            onChange([...shared, ...personal].filter(keep).sort(byStart));
    };
    const unsubs = [
        onSnapshot(visible(db, householdId, restricted, where('start', '<', to)), (snap) => {
            shared = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
            emit();
        }, (error) => onError?.(error)),
    ];
    if (me) {
        unsubs.push(onSnapshot(query(personalOf(db, householdId), where('audience', 'array-contains', me.trim().toLowerCase())), (snap) => {
            personal = snap.docs.map((d) => toAgendaItem(d.id, d.data()));
            emit();
        }, 
        // Rules from before personal items refuse the query: the shared agenda still shows.
        () => {
            personal = [];
            emit();
        }));
    }
    return () => unsubs.forEach((u) => u());
}
// ---- Reading the agenda: Today and days ----
/**
 * Where an item stands now. Items with a status become overdue once their time passes even if the
 * app that wrote them hasn't been opened since: an all-day one after its last day, a timed one after
 * its start. Items without a status (appointments, birthdays) have none.
 */
export function agendaStatus(item, now) {
    if (!item.status || item.status === 'done')
        return item.status;
    if (item.status === 'overdue')
        return 'overdue';
    const passed = item.allDay ? lastDay(item) < toYmd(now) : item.start < now;
    return passed ? 'overdue' : 'upcoming';
}
/** The day an item's last moment falls on (an all-day `end` is the midnight after it). */
function lastDay(item) {
    if (item.end === undefined)
        return toYmd(item.start);
    return toYmd(item.allDay ? item.end - 1 : item.end);
}
/** "All day", "3:30 PM", "3:30 PM – 4:30 PM". */
export function agendaTime(item) {
    if (item.allDay)
        return kt('agenda.allDay');
    const start = formatTime(item.start);
    return item.end !== undefined && toYmd(item.end) === toYmd(item.start) ? kt('agenda.timeRange', { start, end: formatTime(item.end) }) : start;
}
/** Kinds tied to one occasion: a meal or a dose not given by the end of its day is missed, not still to do. */
const OCCASIONS = ['feeding', 'medicine'];
/**
 * What needs attention: overdue things first (oldest first), then today's (all-day first, then by
 * time; finished appointments left out), then the next `soonHours`. Done items are left out, and so
 * are feeds and doses from earlier days (`feeding`, `medicine`) and timed items with a status whose
 * `end` has passed (a window to do it in that has closed): those are missed, not overdue.
 * Ongoing spans (all-day, several days, no status: a medicine course, a trip) are context for the
 * calendar, not something to do today, so they are left out too. With `includeDone`, today's
 * finished items come back as the 'done' group, last.
 */
export function todayItems(items, now, { soonHours = 48, includeDone = false } = {}) {
    const today = toYmd(now);
    const soonUntil = now + soonHours * HOUR;
    const out = [];
    for (const item of items) {
        const status = agendaStatus(item, now);
        const first = toYmd(item.start);
        if (status === 'done') {
            if (includeDone && first <= today && lastDay(item) >= today)
                out.push({ item, group: 'done', when: kt('agenda.done') });
            continue;
        }
        if (item.allDay && !status && lastDay(item) > first)
            continue;
        if (status === 'overdue') {
            const due = item.allDay ? lastDay(item) : first;
            if (due < today && OCCASIONS.includes(item.kind))
                continue;
            // A timed one with an end is due within a window (put the bins out before pickup): once the
            // window has closed it is missed, not something still to do.
            if (!item.allDay && item.end !== undefined && item.end <= now)
                continue;
            const when = due < today || item.allDay ? dueText(due, today) : kt('agenda.overdueSince', { time: formatTime(item.start) });
            out.push({ item, group: 'overdue', when });
            continue;
        }
        if (first <= today && lastDay(item) >= today) {
            if (!item.allDay && !status && (item.end ?? item.start) < now)
                continue;
            const when = item.allDay ? (status ? kt('time.dueToday') : capitalize(kt('time.today'))) : agendaTime(item);
            out.push({ item, group: 'today', when });
            continue;
        }
        if (first > today && item.start < soonUntil) {
            const day = dueWords(first, today);
            out.push({ item, group: 'soon', when: item.allDay ? day : kt('agenda.dayAtTime', { day, time: formatTime(item.start) }) });
        }
    }
    const rank = { overdue: 0, today: 1, soon: 2, done: 3 };
    return out.sort((a, b) => rank[a.group] - rank[b.group] || byStart(a.item, b.item));
}
/** The longest span an item is shown on every day of; longer ones show on their first day only. */
const MAX_SPAN_DAYS = 31;
/** A calendar label for a day relative to now: "Today", "Tomorrow", "Yesterday", or its long date. */
export function dayLabel(day, now) {
    const today = toYmd(now);
    const n = daysBetween(today, day);
    if (n === 0)
        return capitalize(kt('time.today'));
    if (n === 1)
        return capitalize(kt('time.tomorrow'));
    if (n === -1)
        return capitalize(kt('time.yesterday'));
    return capitalize(longDate(day, today));
}
/** Items by local day, for a calendar list: an item spanning several days shows on each of them. */
export function agendaDays(items, now, { from, to, emptyDays = false } = {}) {
    const days = new Map();
    const add = (day, item) => {
        if ((from && day < from) || (to && day > to))
            return;
        const list = days.get(day);
        if (list)
            list.push(item);
        else
            days.set(day, [item]);
    };
    for (const item of items) {
        const first = toYmd(item.start);
        const last = lastDay(item);
        const span = daysBetween(first, last);
        if (span <= 0 || span > MAX_SPAN_DAYS)
            add(first, item);
        else
            for (let d = 0; d <= span; d++)
                add(addDays(first, d), item);
    }
    if (emptyDays && from && to)
        for (let d = from; d <= to; d = addDays(d, 1))
            if (!days.has(d))
                days.set(d, []);
    return [...days.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([day, list]) => ({ day, label: dayLabel(day, now), items: list.sort(byStart) }));
}
/** Local midnight today and `days` later: a range for `watchAgenda`. */
export function agendaRange(now, days, pastDays = 0) {
    const start = startOfDay(now);
    return { from: addDays(start, -pastDays), to: addDays(start, days) };
}
