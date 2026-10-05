import { isHhmm, type Ymd } from './time.js';

/**
 * Huishouden Pet's outings (bathroom breaks), the part every writer must agree on: which scheduled
 * outings a pet has on a day (`outingSlots`) and the id of the outing logged for one
 * (`outingId`). Pet's own buttons, the portal's To-do list (Pet publishes its actions) and the
 * assistant's `pet_log_outing` all write `petOutings/<outingId>`, and a slot's reminder is
 * cancelled by the sender while that document is absent (`./reminder-source`), so a drift here
 * would log an outing twice or notify after it was logged.
 *
 * Server-safe: no Firebase, no DOM.
 */

export type OutingMode = 'meals' | 'times' | 'every';

/** What `outingSlots` reads of a `petOutingPlans/{petId}` document (`petId` is its id). */
export interface OutingPlanLike {
  petId: string;
  on?: boolean;
  mode: OutingMode;
  /** `mode: 'times'`: 'HH:MM' each. */
  times?: readonly string[];
  /** `mode: 'every'`: hours between outings, from `from` while not after `to`. */
  every?: number;
  from?: string;
  to?: string;
}

/** What `outingSlots` reads of a `petMeals` document. */
export interface OutingMealLike {
  id: string;
  petId: string;
  name: string;
  time: string;
}

/** One scheduled outing: `meal-<mealId>` at the meal's time, or `t-HHMM`. `meal` is the meal's name. */
export interface OutingSlotTime {
  key: string;
  time: string;
  meal?: string;
}

export const OUTING_DEFAULTS = { from: '07:00', to: '21:00', every: 4, flagDays: 2 } as const;
/** The sizes the rules accept for a plan. */
export const OUTING_LIMITS = { times: 8, every: 12, slots: 24, poopMin: 10, flagDays: 14, walkMin: 600, note: 200, slotKey: 40 } as const;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Every `every` hours (whole, 1 to 12) from `from`, while not after `to` and before midnight. */
export function everyTimes(every: number = OUTING_DEFAULTS.every, from: string = OUTING_DEFAULTS.from, to: string = OUTING_DEFAULTS.to): string[] {
  const step = Math.min(OUTING_LIMITS.every, Math.max(1, Math.round(Number.isFinite(every) ? every : OUTING_DEFAULTS.every))) * 60;
  const end = minutes(isHhmm(to) ? to : OUTING_DEFAULTS.to);
  const out: string[] = [];
  for (let m = minutes(isHhmm(from) ? from : OUTING_DEFAULTS.from); m <= end && m < 24 * 60 && out.length < OUTING_LIMITS.slots; m += step) out.push(hhmm(m));
  return out;
}

/**
 * A pet's scheduled outings on any day, earliest first; none while its plan is off (`on: false`).
 * With meals: one per meal of the pet, at its time. Set times: each distinct one, at most 8.
 */
export function outingSlots(plan: OutingPlanLike | undefined, meals: readonly OutingMealLike[]): OutingSlotTime[] {
  if (!plan || plan.on === false) return [];
  if (plan.mode === 'meals')
    return meals
      .filter((m) => m.petId === plan.petId && isHhmm(m.time))
      .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name))
      .map((m) => ({ key: `meal-${m.id}`, time: m.time, meal: m.name.trim() }));
  const times = plan.mode === 'times' ? [...new Set((plan.times ?? []).filter((x) => isHhmm(x)))].sort().slice(0, OUTING_LIMITS.times) : everyTimes(plan.every, plan.from, plan.to);
  return times.map((time) => ({ key: `t-${time.replace(':', '')}`, time }));
}

/** The id of the outing logged for a slot on a (local) day: `out-<petId>-<YYYY-MM-DD>-<slot key>`. */
export const outingId = (petId: string, day: Ymd, slotKey: string) => `out-${petId}-${day}-${slotKey}`;
