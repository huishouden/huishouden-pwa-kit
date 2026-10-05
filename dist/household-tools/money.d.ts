import { z } from 'zod';
export declare const billsDue: import("./registry.js").ToolDef<{
    days: z.ZodOptional<z.ZodNumber>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
