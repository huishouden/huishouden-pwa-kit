import { MONEY_APPS } from './role-core.js';
import { cleanAudience, inAudience } from './audience.js';
import { HOUR, daysBetween, dueText, dueWords, formatTime, longDate, startOfDay, toYmd, ymdToTime, addDays } from './time.js';
import { capitalize, cleanLocalTexts, kt, localizeRecords, localized } from './i18n.js';
import { cleanRule, isEventRule } from './schedule.js';
import { isHhmm, isYmd } from './time.js';
import { ROLES } from './role-core.js';
export const AGENDA_KINDS = ['appointment', 'due', 'renewal', 'bill', 'birthday', 'medicine', 'feeding', 'task', 'other'];
export const AGENDA_STATUSES = ['upcoming', 'overdue', 'done'];
export const AGENDA_FIELDS = ['app', 'ref', 'kind', 'title', 'start', 'end', 'allDay', 'detail', 'url', 'who', 'status', 'private', 'texts', 'series', 'edit', 'updatedAt', 'by'];
export const SERIES_FIELDS = ['rule', 'time', 'minutes', 'original', 'through'];
export const SERIES_DEFAULT_MINUTES = 60;
export const AGENDA_EDIT_KINDS = ['reschedule', 'retime', 'rename', 'notes', 'skip', 'cancel'];
/** The most writes one action may make, and members it may name. */
export const AGENDA_EDIT_LIMITS = { ops: 4, emails: 12 };
/**
 * The collections each app's agenda edits may write. A change from a calendar that would touch
 * anything else is refused, so an item can't be made to change money or settings.
 */
export const AGENDA_EDIT_COLLECTIONS = {
    home: ['homeTasks', 'homeServiceLog', 'homeEvents'],
    baby: ['babyAppointments', 'babyChecklists'],
    pet: ['petAppointments', 'petReminders'],
    car: ['carAppointments', 'carRenewals', 'carServiceItems'],
    tasks: ['items'],
    health: [],
    bills: [],
    groceries: [],
};
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
    const series = input.series === undefined ? undefined : cleanSeries(input.series);
    if (input.series !== undefined && !series)
        throw new Error('Agenda series is not a schedule the rules accept.');
    const edit = input.edit === undefined ? undefined : cleanEdit(app, input.edit);
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
        ...(series ? { series } : {}),
        ...(edit ? { edit } : {}),
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
const str = (v) => (typeof v === 'string' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** A series as stored: known keys only, or undefined when it isn't one. */
export function cleanSeries(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return undefined;
    const s = v;
    if (!isEventRule(s.rule) || !isYmd(s.original) || !isYmd(s.through))
        return undefined;
    if (s.time !== undefined && !isHhmm(s.time))
        return undefined;
    const minutes = typeof s.minutes === 'number' && Number.isInteger(s.minutes) && s.minutes > 0 && s.minutes <= 24 * 60 ? s.minutes : undefined;
    return {
        rule: cleanRule(s.rule),
        ...(s.time ? { time: s.time } : {}),
        ...(minutes ? { minutes } : {}),
        original: s.original,
        through: s.through,
    };
}
/** Whether a collection path matches an entry of `AGENDA_EDIT_COLLECTIONS` (`*` is one id). */
function collectionMatches(pattern, col) {
    const want = pattern.split('/');
    const have = col.split('/');
    return want.length === have.length && want.every((w, i) => (w === '*' ? /^[^/]{1,200}$/.test(have[i]) && have[i] !== '.' && have[i] !== '..' : w === have[i]));
}
/** Whether every op writes only collections `app`'s edits may (`AGENDA_EDIT_COLLECTIONS`), and at most `AGENDA_EDIT_LIMITS.ops`. */
export function agendaOpsAllowed(app, ops) {
    const allowed = AGENDA_EDIT_COLLECTIONS[app] ?? [];
    return (ops.length > 0 &&
        ops.length <= AGENDA_EDIT_LIMITS.ops &&
        ops.every((op) => allowed.some((p) => collectionMatches(p, op.col)) &&
            typeof op.id === 'string' &&
            /^[^/]{1,200}$/.test(op.id) &&
            op.id !== '.' &&
            op.id !== '..' &&
            (op.data === null || (typeof op.data === 'object' && !Array.isArray(op.data)))));
}
const plain = (v) => JSON.parse(JSON.stringify(v));
function readAction(app, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return undefined;
    const a = v;
    if (!Array.isArray(a.ops))
        return undefined;
    const ops = a.ops.flatMap((o) => {
        if (!o || typeof o !== 'object')
            return [];
        const { col, id, data, merge } = o;
        if (typeof col !== 'string' || typeof id !== 'string')
            return [];
        if (data !== null && (typeof data !== 'object' || Array.isArray(data)))
            return [];
        return [{ col, id, data: data === null ? null : plain(data), ...(merge === true ? { merge: true } : {}) }];
    });
    if (!agendaOpsAllowed(app, ops))
        return undefined;
    const roles = Array.isArray(a.roles) ? ROLES.filter((r) => a.roles.includes(r)) : [];
    const emails = Array.isArray(a.emails)
        ? [...new Set(a.emails.filter((e) => typeof e === 'string').map((e) => e.trim().toLowerCase()))].slice(0, AGENDA_EDIT_LIMITS.emails)
        : [];
    if (roles.length === 0 && emails.length === 0)
        return undefined;
    return { ops, roles, ...(emails.length ? { emails } : {}) };
}
function readEdit(app, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return undefined;
    const e = v;
    const out = {};
    for (const kind of AGENDA_EDIT_KINDS) {
        const action = readAction(app, e[kind]);
        if (action)
            out[kind] = action;
    }
    return Object.keys(out).length ? out : undefined;
}
/** An item's edits as stored; throws on one that writes outside the app's collections (`AGENDA_EDIT_COLLECTIONS`). */
export function cleanEdit(app, edit) {
    for (const kind of Object.keys(edit)) {
        if (!AGENDA_EDIT_KINDS.includes(kind))
            throw new Error(`Unknown agenda edit: ${kind}`);
        const action = edit[kind];
        if (action && !agendaOpsAllowed(app, action.ops))
            throw new Error(`Agenda ${kind} writes outside ${app}'s collections.`);
    }
    return readEdit(app, edit);
}
/** Whether `me` with `role` may make the item's `kind` edit: it exists, is allowed for the app, and names their role or them. */
export function canEdit(item, kind, role, me) {
    const action = item.edit?.[kind];
    if (!action || !role || !agendaOpsAllowed(item.app, action.ops))
        return false;
    if (MONEY_APPS.includes(item.app) && role !== 'admin' && role !== 'member')
        return false;
    if (action.roles.includes(role))
        return true;
    const email = me?.trim().toLowerCase() ?? '';
    return !!email && (action.emails ?? []).includes(email);
}
/** Sentinel the writer turns into a field delete (Firestore REST: the field left out of a merge's values). */
export const DELETE_FIELD = '$delete';
function fillValue(v, values) {
    if (typeof v === 'string') {
        switch (v) {
            case '$start':
                return values.start ?? v;
            case '$end':
                return values.end ?? v;
            case '$date':
                return values.date ?? v;
            case '$time':
                return values.time === null ? DELETE_FIELD : (values.time ?? v);
            case '$title':
                return values.title ?? v;
            case '$notes':
                return values.notes ?? v;
            case '$original':
                return values.original ?? v;
            default:
                return v;
        }
    }
    if (Array.isArray(v))
        return v.map((x) => fillValue(x, values));
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === '$original' && values.original ? values.original : k, fillValue(x, values)]));
    return v;
}
const EDIT_PLACEHOLDER = /^\$(start|end|date|time|title|notes|original)$/;
function hasUnfilled(v) {
    if (typeof v === 'string')
        return EDIT_PLACEHOLDER.test(v);
    if (Array.isArray(v))
        return v.some(hasUnfilled);
    if (v && typeof v === 'object')
        return Object.entries(v).some(([k, x]) => EDIT_PLACEHOLDER.test(k) || hasUnfilled(x));
    return false;
}
/**
 * An edit's ops with the change's values in place of `'$start'`, `'$date'`, `'$time'`, `'$title'`
 * and so on (the to-do placeholders such as `'$now'` are left for `resolveOps`). Throws when the
 * change lacks a value an op needs. `'$time'` for an item that became all day is `DELETE_FIELD`.
 */
export function fillEditOps(ops, values) {
    const out = ops.map((op) => ({ ...op, data: op.data === null ? null : fillValue(op.data, values) }));
    if (out.some((op) => hasUnfilled(op.data)))
        throw new Error('The change is missing a value this edit needs.');
    return out;
}
/** A stored document as an item, read defensively. */
export function toAgendaItem(id, data) {
    const kind = AGENDA_KINDS.includes(data.kind) ? data.kind : 'other';
    const status = AGENDA_STATUSES.includes(data.status) ? data.status : undefined;
    const end = num(data.end);
    const detail = str(data.detail);
    const who = str(data.who);
    const texts = cleanLocalTexts(data.texts, AGENDA_TEXT_LIMITS);
    const series = cleanSeries(data.series);
    const edit = readEdit(str(data.app) ?? '', data.edit);
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
        ...(series ? { series } : {}),
        ...(edit ? { edit } : {}),
        updatedAt: num(data.updatedAt) ?? 0,
        by: str(data.by) ?? '',
    };
}
const byStart = (a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title);
/**
 * The items overlapping `from`..`to` (and any overdue), soonest first, optionally only `apps`':
 * what `watchAgenda` shows, for a reader of stored items without Firebase.
 */
export function agendaInRange(items, { from, to, apps }) {
    return items.filter((i) => i.start < to && (!apps || apps.includes(i.app)) && (i.status === 'overdue' || (i.end ?? i.start) >= from)).sort(byStart);
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
