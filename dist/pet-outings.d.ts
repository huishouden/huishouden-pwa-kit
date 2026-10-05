import { type Ymd } from './time.js';
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
export declare const OUTING_DEFAULTS: {
    readonly from: "07:00";
    readonly to: "21:00";
    readonly every: 4;
    readonly flagDays: 2;
};
/** The sizes the rules accept for a plan. */
export declare const OUTING_LIMITS: {
    readonly times: 8;
    readonly every: 12;
    readonly slots: 24;
    readonly poopMin: 10;
    readonly flagDays: 14;
    readonly walkMin: 600;
    readonly note: 200;
    readonly slotKey: 40;
};
/** Every `every` hours (whole, 1 to 12) from `from`, while not after `to` and before midnight. */
export declare function everyTimes(every?: number, from?: string, to?: string): string[];
/**
 * A pet's scheduled outings on any day, earliest first; none while its plan is off (`on: false`).
 * With meals: one per meal of the pet, at its time. Set times: each distinct one, at most 8.
 */
export declare function outingSlots(plan: OutingPlanLike | undefined, meals: readonly OutingMealLike[]): OutingSlotTime[];
/** The id of the outing logged for a slot on a (local) day: `out-<petId>-<YYYY-MM-DD>-<slot key>`. */
export declare const outingId: (petId: string, day: Ymd, slotKey: string) => string;
