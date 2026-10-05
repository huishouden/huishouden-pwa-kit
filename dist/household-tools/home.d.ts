import { z } from 'zod';
import { type ToolContext } from './registry.js';
export declare const homeUpkeepDue: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
export declare const homeAddEvent: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
declare function create(ctx: ToolContext, path: string, doc: Record<string, unknown>): Promise<boolean>;
export { create };
