import { MONEY_APPS, ROLES } from './role-core.js';
import { isSchedule, nextDueAfterDone } from './schedule.js';
import { cleanAudience, inAudience } from './audience.js';
import { inverseOps } from './store.js';
import { addDays, addMonths, DAY, daysBetween, dueText, isYmd, toYmd } from './time.js';
import { cleanLocalTexts, kt, localizeRecords, localized } from './i18n.js';
export const TODO_STATUSES = ['open', 'info'];
export const TODO_FIELDS = ['app', 'ref', 'title', 'detail', 'createdAt', 'due', 'who', 'url', 'status', 'private', 'owner', 'done', 'cancel', 'texts', 'updatedAt', 'by'];
/** The collection of to-dos for named members only (`./audience`). */
export const PERSONAL_TODOS = 'personalTodos';
/** Fields of a `personalTodos` item: the list's plus `audience`. */
export const PERSONAL_TODO_FIELDS = [...TODO_FIELDS, 'audience'];
export const TODO_ACTION_FIELDS = ['label', 'ops', 'roles', 'owner', 'emails'];
/** Maximum lengths and counts, the same as the rules. */
export const TODO_LIMITS = { app: 40, ref: 200, title: 120, detail: 200, url: 2000, who: 60, by: 254, label: 24, ops: 8, emails: 12 };
/** Limits inside `texts`, the same as the fields they translate. */
export const TODO_TEXT_LIMITS = { title: TODO_LIMITS.title, detail: TODO_LIMITS.detail, done: TODO_LIMITS.label, cancel: TODO_LIMITS.label };
/**
 * Runs `build` once per language and gives its to-dos with `texts` (title, detail, button words),
 * so the portal shows each reader their own language. Wrap the app's to-do builder:
 *
 * ```ts
 * syncTodos(db, id, 'bills', await localizeTodos(() => billTodos(bills, now)), { by: me });
 * ```
 */
export function localizeTodos(build) {
    return localizeRecords(build, (t) => ({ title: t.title, detail: t.detail, done: t.done?.label, cancel: t.cancel?.label }));
}
/** What the portal shows of a to-do in the reader's language: its title, detail and button words. */
export function todoWords(item) {
    return {
        title: localized(item, 'title', item.title) ?? item.title,
        detail: localized(item, 'detail', item.detail),
        done: item.done ? localized(item, 'done', item.done.label) : undefined,
        cancel: item.cancel ? localized(item, 'cancel', item.cancel.label) : undefined,
    };
}
/**
 * The collections each app's actions may write: the portal refuses an action touching anything
 * else (so an item can't be made to change money or settings when someone taps Done). An app that
 * publishes to-dos is listed here; one with an empty list publishes summary lines only. A `*` part
 * stands for one document id in a nested path: Health's entry for any person's doses is
 * `healthPeople`, `*`, `doses` joined with slashes.
 */
export const TODO_COLLECTIONS = {
    health: ['healthPeople/*/doses', 'healthPeople/*/meds', 'healthPeople/*/visits'],
    tasks: ['items'],
    groceries: [],
    home: ['homeTasks', 'homeServiceLog', 'homeEventPrep'],
    baby: ['babyChecklists', 'babyAppointments'],
    pet: ['petReminders', 'petDoses', 'petMedDoses', 'petOutings'],
    car: ['carRenewals', 'carServiceItems', 'carServiceLog'],
    bills: ['bills'],
};
/** Whether a collection path matches one of `TODO_COLLECTIONS`' entries (`*` is one id). */
function collectionMatches(pattern, col) {
    const want = pattern.split('/');
    const have = col.split('/');
    return want.length === have.length && want.every((w, i) => (w === '*' ? /^[^/]{1,200}$/.test(have[i]) && have[i] !== '.' && have[i] !== '..' : w === have[i]));
}
/** The same id for the same record however often it is published: `<app>:<ref>`, Firestore-safe. */
export function todoId(app, ref) {
    return `${app}:${ref.replace(/\//g, '_')}`.slice(0, 250);
}
const clip = (s, max) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const lower = (s) => s.trim().toLowerCase();
/** Whether every op of an action writes only collections `app` may (`TODO_COLLECTIONS`), and at most `TODO_LIMITS.ops`. */
export function todoOpsAllowed(app, ops) {
    const allowed = TODO_COLLECTIONS[app] ?? [];
    return (ops.length > 0 &&
        ops.length <= TODO_LIMITS.ops &&
        ops.every((op) => allowed.some((p) => collectionMatches(p, op.col)) && typeof op.id === 'string' && /^[^/]{1,200}$/.test(op.id) && (op.data === null || (typeof op.data === 'object' && !Array.isArray(op.data)))));
}
/** Firestore refuses `undefined`: drop it, as JSON does. */
const plain = (v) => JSON.parse(JSON.stringify(v));
function actionDoc(app, action, which) {
    if (!action)
        return undefined;
    const label = clip(action.label, TODO_LIMITS.label);
    if (!label)
        throw new Error(`To-do ${which} action has no label.`);
    if (!todoOpsAllowed(app, action.ops))
        throw new Error(`To-do ${which} action writes outside ${app}'s collections.`);
    const roles = ROLES.filter((r) => action.roles.includes(r));
    const emails = [...new Set((action.emails ?? []).map(lower))].slice(0, TODO_LIMITS.emails);
    return {
        label,
        ops: action.ops.map((op) => ({ col: op.col, id: op.id, data: op.data === null ? null : plain(op.data), ...(op.merge ? { merge: true } : {}) })),
        roles,
        ...(action.owner ? { owner: true } : {}),
        ...(emails.length ? { emails } : {}),
    };
}
/** The stored document: trimmed and clipped to the rules' sizes; throws on what the rules or the portal would refuse. */
export function todoDoc(app, input, by, now = Date.now()) {
    if (!/^[a-z]{1,40}$/.test(app))
        throw new Error(`Unknown app: ${app}`);
    if (!/^https:\/\//.test(input.url))
        throw new Error('To-do url must be an https deep link into the app.');
    const status = input.status ?? 'open';
    if (!TODO_STATUSES.includes(status))
        throw new Error(`Unknown to-do status: ${status}`);
    const title = clip(input.title, TODO_LIMITS.title);
    if (!title)
        throw new Error('To-do has no title.');
    if (!input.ref)
        throw new Error('To-do has no ref.');
    if (!Number.isFinite(input.createdAt))
        throw new Error('To-do has no createdAt.');
    const detail = clip(input.detail, TODO_LIMITS.detail);
    const who = clip(input.who, TODO_LIMITS.who);
    const owner = input.owner ? lower(input.owner).slice(0, TODO_LIMITS.by) : '';
    const done = status === 'open' ? actionDoc(app, input.done, 'done') : undefined;
    const cancel = status === 'open' ? actionDoc(app, input.cancel, 'cancel') : undefined;
    const texts = cleanLocalTexts(input.texts, TODO_TEXT_LIMITS);
    return {
        app,
        ref: input.ref.slice(0, TODO_LIMITS.ref),
        title,
        ...(detail ? { detail } : {}),
        createdAt: Math.round(input.createdAt),
        ...(input.due !== undefined && Number.isFinite(input.due) ? { due: Math.round(input.due) } : {}),
        ...(who ? { who } : {}),
        url: input.url.slice(0, TODO_LIMITS.url),
        status,
        private: input.private === true || MONEY_APPS.includes(app),
        ...(owner ? { owner } : {}),
        ...(done ? { done } : {}),
        ...(cancel ? { cancel } : {}),
        ...(texts ? { texts } : {}),
        updatedAt: now,
        by: lower(by),
    };
}
/**
 * A `personalTodos` document: as `todoDoc`, private, with the audience cleaned. Throws when the
 * audience leaves out the writer (the rules refuse it).
 */
export function personalTodoDoc(app, input, by, now = Date.now()) {
    const audience = cleanAudience(input.audience);
    if (!inAudience(audience, by))
        throw new Error('A personal to-do must name its writer in its audience.');
    const { audience: _a, ...rest } = input;
    return { ...todoDoc(app, { ...rest, private: true }, by, now), audience };
}
const str = (v) => (typeof v === 'string' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function toAction(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const a = v;
    const label = str(a.label);
    if (!label || !Array.isArray(a.ops))
        return undefined;
    const ops = a.ops.flatMap((o) => {
        if (!o || typeof o !== 'object')
            return [];
        const { col, id, data, merge } = o;
        if (typeof col !== 'string' || typeof id !== 'string')
            return [];
        if (data !== null && (typeof data !== 'object' || Array.isArray(data)))
            return [];
        return [{ col, id, data: data, ...(merge === true ? { merge: true } : {}) }];
    });
    const roles = Array.isArray(a.roles) ? ROLES.filter((r) => a.roles.includes(r)) : [];
    const emails = Array.isArray(a.emails) ? a.emails.filter((e) => typeof e === 'string') : [];
    return { label, ops, roles, ...(a.owner === true ? { owner: true } : {}), ...(emails.length ? { emails } : {}) };
}
/** A stored document as an item, read defensively. */
export function toTodoItem(id, data) {
    const detail = str(data.detail);
    const who = str(data.who);
    const owner = str(data.owner);
    const due = num(data.due);
    const done = toAction(data.done);
    const cancel = toAction(data.cancel);
    const texts = cleanLocalTexts(data.texts, TODO_TEXT_LIMITS);
    return {
        id,
        app: str(data.app) ?? '',
        ref: str(data.ref) ?? '',
        title: str(data.title) ?? '',
        ...(detail ? { detail } : {}),
        createdAt: num(data.createdAt) ?? 0,
        ...(due !== undefined ? { due } : {}),
        ...(who ? { who } : {}),
        url: str(data.url) ?? '',
        status: TODO_STATUSES.includes(data.status) ? data.status : 'open',
        ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
        ...(owner ? { owner } : {}),
        ...(done ? { done } : {}),
        ...(cancel ? { cancel } : {}),
        ...(texts ? { texts } : {}),
        ...(Array.isArray(data.audience) ? { audience: data.audience.filter((e) => typeof e === 'string') } : {}),
        updatedAt: num(data.updatedAt) ?? 0,
        by: str(data.by) ?? '',
    };
}
/**
 * `newest` / `oldest`: by when added. `due`: soonest due first, undated last (newest first among
 * them). `app`: by `appOrder` (the portal's tile order; unknown apps after, by name), newest first
 * within an app. Summary lines (`info`) always come last.
 */
export function sortTodos(items, sort, appOrder = []) {
    const rank = (app) => {
        const i = appOrder.indexOf(app);
        return i < 0 ? appOrder.length : i;
    };
    const newest = (a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title);
    const by = {
        newest,
        oldest: (a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title),
        due: (a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || newest(a, b),
        app: (a, b) => rank(a.app) - rank(b.app) || a.app.localeCompare(b.app) || newest(a, b),
    };
    const info = (i) => (i.status === 'info' ? 1 : 0);
    return [...items].sort((a, b) => info(a) - info(b) || by[sort](a, b));
}
/** Whether an item was added more than `days` days before `now` (default 30): the "Older than 30 days" filter. */
export function olderThan(item, now, days = 30) {
    return item.status === 'open' && item.createdAt > 0 && item.createdAt < now - days * DAY;
}
/** "Overdue by 5 days", "Due today", "Due in 3 weeks", or undefined when it has no due date. */
export function todoDueText(item, now) {
    return item.due === undefined ? undefined : dueText(toYmd(item.due), toYmd(now));
}
/** Whether its due day has passed. */
export function todoOverdue(item, now) {
    return item.status === 'open' && item.due !== undefined && toYmd(item.due) < toYmd(now);
}
/** "Added today", "Added yesterday", "Added 3 days ago", "Added 5 weeks ago", "Added Mar 2, 2031". */
export function addedText(item, now) {
    const days = Math.max(0, daysBetween(item.createdAt, now));
    if (days === 0)
        return kt('todos.addedToday');
    if (days === 1)
        return kt('todos.addedYesterday');
    if (days < 14)
        return kt('todos.addedDays', { n: days });
    if (days < 60)
        return kt('todos.addedWeeks', { n: Math.round(days / 7) });
    if (days < 365)
        return kt('todos.addedMonths', { n: Math.round(days / 30) });
    return kt('todos.addedYears', { n: Math.round(days / 365) });
}
/** Whether `me` with `role` may run the item's `done` or `cancel`: the action exists, is allowed for the app, and names their role, them as owner, or them. */
export function canDo(item, which, role, me) {
    const action = item[which];
    if (!action || !role || item.status !== 'open' || !todoOpsAllowed(item.app, action.ops))
        return false;
    if (MONEY_APPS.includes(item.app) && role !== 'admin' && role !== 'member')
        return false;
    if (action.roles.includes(role))
        return true;
    const email = me ? lower(me) : '';
    if (!email)
        return false;
    return (action.owner === true && item.owner === email) || (action.emails ?? []).includes(email);
}
const OFFSET = /^\$today([+-]\d{1,4})([dwmy])$/;
const isNextDue = (v) => Object.keys(v).length === 1 && '$nextDue' in v;
function resolveNextDue({ $nextDue: arg }, today) {
    const { schedule, due } = (arg ?? {});
    if (!isSchedule(schedule) || !isYmd(due))
        throw new TodoActionError(kt('todos.onlyInApp'));
    return nextDueAfterDone(schedule, due, today);
}
function resolveValue(v, ctx, today) {
    if (typeof v === 'string') {
        if (v === '$now')
            return ctx.now;
        if (v === '$me')
            return lower(ctx.me);
        if (v === '$today')
            return today;
        const m = OFFSET.exec(v);
        if (m) {
            const n = Number(m[1]);
            return m[2] === 'd' ? addDays(today, n) : m[2] === 'w' ? addDays(today, n * 7) : addMonths(today, m[2] === 'm' ? n : n * 12);
        }
        return v;
    }
    if (Array.isArray(v))
        return v.map((x) => resolveValue(x, ctx, today));
    if (v && typeof v === 'object' && isNextDue(v))
        return resolveNextDue(v, today);
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveValue(x, ctx, today)]));
    return v;
}
/** The ops with their placeholders (`'$now'`, `'$today'`, `'$today+3m'`, `'$me'`, `{ $nextDue }`) filled in; throws `TodoActionError` on a malformed `$nextDue`. */
export function resolveOps(ops, ctx) {
    const today = ctx.today ?? toYmd(ctx.now);
    return ops.map((op) => ({ ...op, data: op.data === null ? null : resolveValue(op.data, ctx, today) }));
}
/** The item as stored again (Undo), written by `me`. */
function restoredDoc(item, me, now) {
    const { id: _id, ...rest } = item;
    return plain({ ...rest, private: item.private === true || !!item.audience || MONEY_APPS.includes(item.app), updatedAt: now, by: lower(me) });
}
/** The collection an item lives in: the personal list when it names an audience. */
const listOf = (item) => (item.audience ? PERSONAL_TODOS : 'todos');
/** Thrown when an action can't run: its record is gone or it writes where it shouldn't. */
export class TodoActionError extends Error {
}
/**
 * The ops an item's `done` or `cancel` writes, placeholders filled in, or a `TodoActionError` when
 * the action is missing or writes outside its app (`todoOpsAllowed`).
 */
export function todoActionOps(item, which, ctx) {
    const action = item[which];
    if (!action || !todoOpsAllowed(item.app, action.ops))
        throw new TodoActionError(kt('todos.onlyInApp'));
    return resolveOps(action.ops, ctx);
}
/**
 * Plans an item's `done` or `cancel` without any database: `ops` from `todoActionOps`, `before` the
 * records they touch as they are now (undefined when missing). Throws `TodoActionError` when a merge
 * would land on a record that no longer exists (it was deleted in its app). `applyTodo` writes the
 * plan through the Firebase SDK; a server (huishouden/connector) writes it over Firestore REST as
 * the signed-in person, so the same rules decide.
 */
export function planTodo(item, ops, before, { me, now }) {
    if (ops.some((op) => op.merge && !before(op.col, op.id))) {
        throw new TodoActionError(kt('todos.changedInApp', { title: item.title }));
    }
    const inverse = inverseOps(ops, before);
    const list = listOf(item);
    return {
        writes: [...ops, { col: list, id: item.id, data: null }],
        undo: (at = now) => [...inverse, { col: list, id: item.id, data: restoredDoc(item, me, at) }],
    };
}
