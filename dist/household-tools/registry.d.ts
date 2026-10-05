import { z } from 'zod';
import { type Lang } from '../i18n.js';
import type { LocalClock } from '../local-clock.js';
import { type AuditEntry, type Here, type Session } from './context.js';
/** What a tool's handler has: the session, the household it acts in, and the person's clock and language. */
export interface ToolContext {
    session: Session;
    here: Here;
    clock: LocalClock;
    lang: Lang;
    /** Notes what the call touched for the audit log (`app` and record `ref`). */
    touched(app: string, ref?: string): void;
}
export interface ToolResult {
    /** Shown to the assistant: short, in the person's language, with deep links. */
    text: string;
    /** The same as data, for clients that read structured results. */
    data?: Record<string, unknown>;
    /** Refused or failed: the text says why. */
    error?: boolean;
}
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
    name: string;
    title: string;
    description: string;
    kind: 'read' | 'write';
    input: S;
    /** Answers about Health: every answer carries the one-line not-medical-advice note. */
    health?: boolean;
    /** Runs inside `withLang` for its rendering: build texts with `render`, which is synchronous. */
    run(ctx: ToolContext, args: z.infer<z.ZodObject<S>>): Promise<ToolResult>;
}
/** Every tool takes these: which household (the one the apps open by default) and the answer's language and time zone. */
export declare const common: {
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
};
export declare const idempotency: {
    idempotency_key: z.ZodOptional<z.ZodString>;
};
/**
 * A tool, checked against its own input (`run`'s arguments are the schema's) and then widened, so
 * the list of every tool needs no cast.
 */
export declare function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef;
/** Text in the person's language: `fn` runs with the kit's language switched (it must not await). */
export declare const render: <T>(lang: Lang, fn: () => T) => T;
/** Health answers end with the one-line not-medical-advice note, in the person's language. */
export declare function withHealthNote(result: ToolResult, lang: Lang, health?: boolean): ToolResult;
/** What a failure tells the assistant, in the person's language; nothing about the data. */
export declare function failureText(e: unknown, lang: Lang): string;
export type { AuditEntry };
