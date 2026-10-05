import { z } from 'zod';
/** The app's name in the reader's language ("Tareas"), or its id. Call inside `render`. */
export declare function appName(app: string): string;
export declare const households: import("./registry.js").ToolDef<{
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
}>;
export declare const householdHome: import("./registry.js").ToolDef<{
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
}>;
export declare const today: import("./registry.js").ToolDef<{
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const calendar: import("./registry.js").ToolDef<{
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    apps: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        home: "home";
        spending: "spending";
        bills: "bills";
        baby: "baby";
        pet: "pet";
        car: "car";
        tasks: "tasks";
        health: "health";
        groceries: "groceries";
        assistant: "assistant";
    }>>>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const todos: import("./registry.js").ToolDef<{
    filter: z.ZodOptional<z.ZodEnum<{
        all: "all";
        overdue: "overdue";
        due_soon: "due_soon";
        older_than_30_days: "older_than_30_days";
        undated: "undated";
    }>>;
    app: z.ZodOptional<z.ZodEnum<{
        home: "home";
        bills: "bills";
        baby: "baby";
        pet: "pet";
        car: "car";
        tasks: "tasks";
        health: "health";
        groceries: "groceries";
    }>>;
    sort: z.ZodOptional<z.ZodEnum<{
        app: "app";
        newest: "newest";
        due: "due";
        oldest: "oldest";
    }>>;
    limit: z.ZodOptional<z.ZodNumber>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
