import { z } from 'zod';
import type { Op } from '../store.js';
import { type Write } from '../firestore-rest.js';
/** Store ops (`col` under the household) as a REST commit. */
export declare function writesOf(householdId: string, ops: readonly Op[]): Write[];
export declare const todoDone: import("./registry.js").ToolDef<{
    id: z.ZodString;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const todoCancel: import("./registry.js").ToolDef<{
    id: z.ZodString;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
/** Category names as Groceries stores them (in English; every device shows them in its own language). */
export declare const GROCERY_CATEGORIES: readonly ["Produce & Greens", "Dairy & Eggs", "Bakery & Bread", "Meat & Seafood", "Pantry & Dry Goods", "Frozen Foods", "Beverages & Coffee", "Snacks & Sweets", "Household & Cleaning", "Personal Care", "Hardware & Tools", "Other"];
export declare const groceriesList: import("./registry.js").ToolDef<{
    list: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const groceriesAdd: import("./registry.js").ToolDef<{
    name: z.ZodString;
    quantity: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<{
        Other: "Other";
        "Produce & Greens": "Produce & Greens";
        "Dairy & Eggs": "Dairy & Eggs";
        "Bakery & Bread": "Bakery & Bread";
        "Meat & Seafood": "Meat & Seafood";
        "Pantry & Dry Goods": "Pantry & Dry Goods";
        "Frozen Foods": "Frozen Foods";
        "Beverages & Coffee": "Beverages & Coffee";
        "Snacks & Sweets": "Snacks & Sweets";
        "Household & Cleaning": "Household & Cleaning";
        "Personal Care": "Personal Care";
        "Hardware & Tools": "Hardware & Tools";
    }>>;
    list: z.ZodOptional<z.ZodString>;
    urgency: z.ZodOptional<z.ZodEnum<{
        Standard: "Standard";
        "Need Today": "Need Today";
        Whenever: "Whenever";
    }>>;
    notes: z.ZodOptional<z.ZodString>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const groceriesCheck: import("./registry.js").ToolDef<{
    item: z.ZodString;
    list: z.ZodOptional<z.ZodString>;
    bought: z.ZodOptional<z.ZodBoolean>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const tasksAdd: import("./registry.js").ToolDef<{
    name: z.ZodString;
    due: z.ZodOptional<z.ZodString>;
    by: z.ZodOptional<z.ZodBoolean>;
    list: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    link: z.ZodOptional<z.ZodString>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
