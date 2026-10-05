import { z } from 'zod';
import { type ToolContext } from './registry.js';
declare const petUrl: (ctx: ToolContext, query?: string) => string;
export declare const petToday: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const petLogFeeding: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const petLogDose: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export { petUrl };
