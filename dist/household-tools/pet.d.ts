import { z } from 'zod';
import { type ToolContext } from './registry.js';
declare const petUrl: (ctx: ToolContext, query?: string) => string;
export declare const petToday: import("./registry.js").ToolDef<{
    pet: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const petLogFeeding: import("./registry.js").ToolDef<{
    pet: z.ZodString;
    meal: z.ZodOptional<z.ZodString>;
    at: z.ZodOptional<z.ZodString>;
    portion: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const petLogDose: import("./registry.js").ToolDef<{
    pet: z.ZodString;
    medicine: z.ZodString;
    time: z.ZodOptional<z.ZodString>;
    skipped: z.ZodOptional<z.ZodBoolean>;
    confirm_again: z.ZodOptional<z.ZodBoolean>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export { petUrl };
