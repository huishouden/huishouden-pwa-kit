import { z } from 'zod';
import type { Op } from '../store.js';
import { type Write } from '../firestore-rest.js';
/** Store ops (`col` under the household) as a REST commit. */
export declare function writesOf(householdId: string, ops: readonly Op[]): Write[];
export declare const todoDone: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const todoCancel: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
/** Category names as Groceries stores them (in English; every device shows them in its own language). */
export declare const GROCERY_CATEGORIES: readonly ["Produce & Greens", "Dairy & Eggs", "Bakery & Bread", "Meat & Seafood", "Pantry & Dry Goods", "Frozen Foods", "Beverages & Coffee", "Snacks & Sweets", "Household & Cleaning", "Personal Care", "Hardware & Tools", "Other"];
export declare const groceriesList: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const groceriesAdd: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const groceriesCheck: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const tasksAdd: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
