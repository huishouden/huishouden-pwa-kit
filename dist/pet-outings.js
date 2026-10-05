import { hhmmMinutes, isHhmm } from './time.js';
export const OUTING_DEFAULTS = { from: '07:00', to: '21:00', every: 4, flagDays: 2 };
/** The sizes the rules accept for a plan. */
export const OUTING_LIMITS = { times: 8, every: 12, slots: 24, poopMin: 10, flagDays: 14, walkMin: 600, note: 200, slotKey: 40 };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Every `every` hours (whole, 1 to 12) from `from`, while not after `to` and before midnight. */
export function everyTimes(every = OUTING_DEFAULTS.every, from = OUTING_DEFAULTS.from, to = OUTING_DEFAULTS.to) {
    const step = Math.min(OUTING_LIMITS.every, Math.max(1, Math.round(Number.isFinite(every) ? every : OUTING_DEFAULTS.every))) * 60;
    const end = hhmmMinutes(isHhmm(to) ? to : OUTING_DEFAULTS.to);
    const out = [];
    for (let m = hhmmMinutes(isHhmm(from) ? from : OUTING_DEFAULTS.from); m <= end && m < 24 * 60 && out.length < OUTING_LIMITS.slots; m += step)
        out.push(hhmm(m));
    return out;
}
/**
 * A pet's scheduled outings on any day, earliest first; none while its plan is off (`on: false`).
 * With meals: one per meal of the pet, at its time. Set times: each distinct one, at most 8.
 */
export function outingSlots(plan, meals) {
    if (!plan || plan.on === false)
        return [];
    if (plan.mode === 'meals')
        return meals
            .filter((m) => m.petId === plan.petId && isHhmm(m.time))
            .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name))
            .map((m) => ({ key: `meal-${m.id}`, time: m.time, meal: m.name.trim() }));
    const times = plan.mode === 'times' ? [...new Set((plan.times ?? []).filter((x) => isHhmm(x)))].sort().slice(0, OUTING_LIMITS.times) : everyTimes(plan.every, plan.from, plan.to);
    return times.map((time) => ({ key: `t-${time.replace(':', '')}`, time }));
}
/** The id of the outing logged for a slot on a (local) day: `out-<petId>-<YYYY-MM-DD>-<slot key>`. */
export const outingId = (petId, day, slotKey) => `out-${petId}-${day}-${slotKey}`;
