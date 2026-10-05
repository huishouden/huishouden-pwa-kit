import { z } from 'zod';
import { type Ymd } from '../time.js';
import { type OutingPlanLike, type OutingSlotTime } from '../pet-outings.js';
import type { Doc } from '../firestore-rest.js';
import { type ToolContext } from './registry.js';
interface Meal {
    id: string;
    petId: string;
    name: string;
    time: string;
    food?: string;
    portion?: string;
}
declare const petUrl: (ctx: ToolContext, query?: string) => string;
/** petOutingPlans/{petId} as this tool reads it (only plans that are on). */
interface OutingPlan extends OutingPlanLike {
    poopMin: number;
    walkGoal: number;
}
/** One scheduled outing of a day, named as Pet names it: the meal's name, or the time. */
interface OutingSlot extends OutingSlotTime {
    label: string;
}
/** A pet's outings today: each slot's state, the poops against the minimum, the walk, and days under it. */
export declare function outingSummary(ctx: ToolContext, plan: OutingPlan, meals: Meal[], outings: Doc[], today: Ymd, localNow: number): {
    slots: {
        slot: OutingSlot;
        at: number;
        outing: Doc;
        state: "done" | "due" | "late";
    }[];
    extra: number;
    poops: number;
    walked: number;
    under: number;
};
export declare const petToday: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const petLogFeeding: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const petLogDose: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const petLogOuting: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export { petUrl };
