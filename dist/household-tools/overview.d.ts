import { z } from 'zod';
/** The app's name in the reader's language ("Tareas"), or its id. Call inside `render`. */
export declare function appName(app: string): string;
export declare const households: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const householdHome: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const today: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const calendar: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const todos: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
