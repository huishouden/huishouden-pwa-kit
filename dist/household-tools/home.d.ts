import { z } from 'zod';
import { type ToolContext } from './registry.js';
export declare const homeUpkeepDue: import("./registry.js").ToolDef<{
    days: z.ZodOptional<z.ZodNumber>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const homeAddEvent: import("./registry.js").ToolDef<{
    type: z.ZodEnum<{
        regular: "regular";
        visit: "visit";
    }>;
    title: z.ZodString;
    kind: z.ZodOptional<z.ZodEnum<{
        other: "other";
        trash: "trash";
        recycling: "recycling";
        "yard waste": "yard waste";
        lawn: "lawn";
        hoa: "hoa";
        cleaning: "cleaning";
    }>>;
    start: z.ZodString;
    frequency: z.ZodOptional<z.ZodEnum<{
        week: "week";
        month: "month";
        year: "year";
    }>>;
    every: z.ZodOptional<z.ZodNumber>;
    weekdays: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        sunday: "sunday";
        monday: "monday";
        tuesday: "tuesday";
        wednesday: "wednesday";
        thursday: "thursday";
        friday: "friday";
        saturday: "saturday";
    }>>>;
    nth_weekday: z.ZodOptional<z.ZodObject<{
        nth: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<-1>]>;
        weekday: z.ZodEnum<{
            sunday: "sunday";
            monday: "monday";
            tuesday: "tuesday";
            wednesday: "wednesday";
            thursday: "thursday";
            friday: "friday";
            saturday: "saturday";
        }>;
    }, z.core.$strip>>;
    until: z.ZodOptional<z.ZodString>;
    time: z.ZodOptional<z.ZodString>;
    who: z.ZodOptional<z.ZodString>;
    cost: z.ZodOptional<z.ZodNumber>;
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
declare function create(ctx: ToolContext, path: string, doc: Record<string, unknown>): Promise<boolean>;
export { create };
