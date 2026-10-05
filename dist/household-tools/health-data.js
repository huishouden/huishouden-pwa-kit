import { asNeededCheck, adherence, doseSlots, doubleDoseWindowMs, recentlyGiven, slotStatuses } from '../dose.js';
import { cleanRule, describeRule, isEventRule } from '../schedule.js';
import { addDays, agoWords, clockWords, DAY, toHhmm, toYmd, ymdToTime } from '../time.js';
import { formatList } from '../i18n.js';
import { t } from './i18n.js';
/** A dose is due from 30 minutes before its time until two hours after; then it is missed (health meds.ts WINDOW). */
export const WINDOW = { earlyMinutes: 30, graceMinutes: 120 };
export const LOW_SUPPLY_DAYS = 7;
export const DEFAULT_ESCALATE_MINUTES = 30;
const str = (v) => (typeof v === 'string' && v ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
export function toPerson(id, d) {
    return { id, name: String(d.name ?? ''), birthDate: str(d.birthDate), email: str(d.email), carers: strings(d.carers), readers: strings(d.readers), allergies: str(d.allergies), notes: str(d.notes) };
}
export function toMed(id, d) {
    return {
        id,
        personId: String(d.personId ?? ''),
        name: String(d.name ?? ''),
        strength: str(d.strength),
        dose: str(d.dose),
        doseAmount: num(d.doseAmount),
        doseUnit: str(d.doseUnit),
        asNeeded: d.asNeeded === true,
        times: [...new Set(strings(d.times))].sort(),
        everyDays: num(d.everyDays),
        rule: isEventRule(d.rule) ? d.rule : undefined,
        minHours: num(d.minHours),
        maxPerDay: num(d.maxPerDay),
        withFood: typeof d.withFood === 'boolean' ? d.withFood : undefined,
        startDate: String(d.startDate ?? ''),
        endDate: str(d.endDate),
        prescriberId: str(d.prescriberId),
        pharmacyId: str(d.pharmacyId),
        refills: num(d.refills),
        supply: num(d.supply),
        supplyAt: num(d.supplyAt),
        refillOrderedAt: num(d.refillOrderedAt),
        escalateMinutes: num(d.escalateMinutes) ?? DEFAULT_ESCALATE_MINUTES,
        remind: d.remind === true,
        notes: str(d.notes),
        createdAt: num(d.createdAt) ?? 0,
        by: String(d.by ?? ''),
    };
}
export function toDose(id, d) {
    return { id, medId: String(d.medId ?? ''), personId: String(d.personId ?? ''), ...(str(d.slot) ? { slot: str(d.slot) } : {}), at: num(d.at) ?? 0, status: d.status === 'skipped' ? 'skipped' : 'given', ...(str(d.note) ? { note: str(d.note) } : {}), by: String(d.by ?? '') };
}
const personPath = (ctx, id) => `households/${ctx.here.id}/healthPeople/${id}`;
/** The people this person may read: everyone for admins, else those listing them as a reader; kids none. */
export async function loadPeople(ctx) {
    if (ctx.here.role === 'kid')
        return [];
    const docs = ctx.here.role === 'admin'
        ? await ctx.session.db.query(`households/${ctx.here.id}`, 'healthPeople')
        : await ctx.session.db.query(`households/${ctx.here.id}`, 'healthPeople', { where: [{ field: 'readers', op: 'ARRAY_CONTAINS', value: ctx.session.email }] });
    return docs.map((d) => toPerson(d.id, d.data)).sort((a, b) => a.name.localeCompare(b.name));
}
export async function loadMeds(ctx, person) {
    return (await ctx.session.db.query(personPath(ctx, person.id), 'meds')).map((d) => toMed(d.id, d.data));
}
/** Doses since `since` (absolute ms). */
export async function loadDoses(ctx, person, since) {
    return (await ctx.session.db.query(personPath(ctx, person.id), 'doses', { where: [{ field: 'at', op: 'GREATER_THAN_OR_EQUAL', value: since }] })).map((d) => toDose(d.id, d.data));
}
export const personUrl = (ctx, personId, tab = 'today') => ctx.session.link('health', `?tab=${tab}&person=${encodeURIComponent(personId)}`);
export const medUrl = (ctx, med) => ctx.session.link('health', `?tab=medicines&person=${encodeURIComponent(med.personId)}&med=${encodeURIComponent(med.id)}`);
export const printUrl = (ctx, personId) => ctx.session.link('health', `?print=${encodeURIComponent(personId)}`);
/** Same id for the same slot from any device (health meds.ts `doseId`). */
export const doseId = (medId, slot) => `${medId}_${slot.replace(/[^0-9T-]/g, '')}`;
export function scheduleOf(m) {
    return { startDate: m.startDate, times: m.asNeeded ? [] : m.times, ...(m.rule ? { rule: m.rule } : { everyDays: m.everyDays ?? 1 }), ...(m.endDate ? { until: m.endDate } : {}) };
}
/** Logs in the local frame, for the kit's day and slot logic. */
export const localLogs = (ctx, doses) => doses.map((d) => ({ ...d, at: ctx.clock.local(d.at) }));
export const logsOf = (doses, medId) => doses.filter((d) => d.medId === medId);
/** `today` and every `Ymd` here are local; `localNow` local-frame ms. */
export const isStopped = (m, today) => !!m.endDate && m.endDate < today;
export const isCurrent = (m, day) => m.startDate <= day && (!m.endDate || m.endDate >= day);
export function supplyLeft(m, doses) {
    if (m.supply === undefined)
        return null;
    const since = m.supplyAt ?? m.createdAt;
    const used = logsOf(doses, m.id).filter((d) => d.status === 'given' && d.at >= since).length * (m.doseAmount ?? 1);
    return Math.max(0, m.supply - used);
}
/** Units used on an average day: scheduled doses over the next four weeks, or as needed the last two. Local-frame `localNow`, absolute `now`. */
export function dailyUse(m, doses, now, localNow) {
    const amount = m.doseAmount ?? 1;
    if (m.asNeeded) {
        const recent = logsOf(doses, m.id).filter((d) => d.status === 'given' && d.at > now - 14 * DAY && d.at <= now).length;
        return recent ? (recent * amount) / 14 : null;
    }
    const slots = doseSlots(scheduleOf(m), localNow, localNow + 28 * DAY).length;
    return slots ? (slots * amount) / 28 : null;
}
export function daysLeft(m, doses, now, localNow) {
    const left = supplyLeft(m, doses);
    const use = dailyUse(m, doses, now, localNow);
    if (left === null || !use)
        return null;
    return Math.floor(left / use);
}
export function refillDue(m, doses, now, localNow) {
    if (isStopped(m, toYmd(localNow)))
        return false;
    const days = daysLeft(m, doses, now, localNow);
    if (days === null || days > LOW_SUPPLY_DAYS)
        return false;
    return !(m.refillOrderedAt && m.refillOrderedAt >= (m.supplyAt ?? m.createdAt));
}
// ---- Words (inside `render`) ----
export const medLabel = (m) => [m.name, m.strength].filter(Boolean).join(' ');
export function scheduleText(m) {
    if (m.asNeeded) {
        const parts = [t('meds.asNeeded')];
        if (m.minHours)
            parts.push(t('meds.minHours', { count: m.minHours }));
        if (m.maxPerDay)
            parts.push(t('meds.maxPerDay', { count: m.maxPerDay }));
        return parts.join(', ');
    }
    const days = m.rule ? describeRule(m.rule) : t('meds.everyDays', { count: m.everyDays ?? 1 });
    if (!m.times.length)
        return days;
    const times = m.times.map((x) => clockWords(x));
    return t('meds.daysAtTimes', { days, times: formatList(times), one: /^1(?!\d)/.test(times[0]) ? 'yes' : 'no' });
}
export const doseText = (m) => [m.dose, m.withFood === true ? t('meds.withFood') : m.withFood === false ? t('meds.emptyStomach') : ''].filter(Boolean).join(', ');
export function daysLeftText(days) {
    return days < 1 ? t('meds.lessThanDay') : t('meds.daysLeft', { count: days });
}
export function ageOn(birthDate, today) {
    if (!birthDate)
        return null;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
    return age >= 0 && age < 150 ? age : null;
}
/** The scheduled doses of current medicines from `fromDay` to `toDay` (local days), with what happened. */
export function rowsBetween(ctx, meds, doses, fromDay, toDay) {
    const localNow = ctx.clock.localNow();
    const logs = localLogs(ctx, doses);
    const from = ymdToTime(fromDay);
    const to = ymdToTime(addDays(toDay, 1)) - 1;
    return meds
        .filter((m) => !m.asNeeded)
        .flatMap((med) => slotStatuses(scheduleOf(med), logsOf(logs, med.id), from, to, localNow, WINDOW).map((row) => ({ ...row, med })))
        .sort((a, b) => a.slot.at - b.slot.at || medLabel(a.med).localeCompare(medLabel(b.med)));
}
export function adherenceOf(ctx, m, doses, fromDay, toDay) {
    const localNow = ctx.clock.localNow();
    return adherence(scheduleOf(m), logsOf(localLogs(ctx, doses), m.id), ymdToTime(fromDay), ymdToTime(addDays(toDay, 1)) - 1, localNow, WINDOW);
}
/**
 * The app's warning before a dose is marked given (health meds.ts `guardFor`): as needed, too soon
 * or too many in 24 hours; scheduled, that slot (or any dose within half the gap between doses)
 * already given. Health asks and lets the carer give it anyway; so does the connector, through
 * `confirm`. Call inside `render`.
 */
export function guardFor(ctx, m, doses, at, nameOf, slot) {
    const logs = logsOf(doses, m.id);
    if (m.asNeeded) {
        const check = asNeededCheck(logs, at, { minHours: m.minHours, maxPerDay: m.maxPerDay });
        if (check.ok)
            return null;
        const nextLocal = ctx.clock.local(check.nextAt);
        const next = t(toYmd(nextLocal) !== toYmd(ctx.clock.local(at)) ? 'guard.nextTomorrow' : 'guard.next', { time: clockWords(toHhmm(nextLocal)) });
        if (check.reason === 'max-reached')
            return `${t('guard.max', { count: check.inLastDay, med: medLabel(m) })} ${next}`;
        return `${t('guard.tooSoon', { ago: agoWords(check.last, at), med: medLabel(m), count: m.minHours ?? 0 })} ${next}`;
    }
    const same = slot ? logs.find((l) => l.slot === slot && l.status === 'given') : undefined;
    const recent = same ?? recentlyGiven(logs, at, doubleDoseWindowMs(m.times));
    if (!recent)
        return null;
    return t('guard.already', { med: medLabel(m), ago: agoWords(recent.at, at), name: nameOf(recent.by) });
}
export { cleanRule, isEventRule };
