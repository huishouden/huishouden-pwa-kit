import type { Lang } from '../i18n.js';
import { type AuditEntry, type Session } from './context.js';
import { type ToolDef, type ToolResult } from './registry.js';
export { Session, UserError, isDenied, pickHousehold, toHousehold, type AuditEntry, type Here, type Household, type Profile, type SessionProps } from './context.js';
export { common, defineTool, failureText, idempotency, render, withHealthNote, type ToolContext, type ToolDef, type ToolResult } from './registry.js';
export { t as toolText, type ToolMessageKey } from './i18n.js';
export { GROCERY_CATEGORIES, writesOf } from './lists.js';
/** Every tool, in the order clients list them. */
export declare const TOOLS: readonly ToolDef[];
export declare const toolNamed: (name: string) => ToolDef | undefined;
/** The tool's arguments checked against its input schema: the parsed arguments, or what is wrong with them. */
export declare function checkArgs(tool: ToolDef, raw: Record<string, unknown>): {
    ok: true;
    args: Record<string, unknown>;
} | {
    ok: false;
    issues: string[];
};
/** One tool call's outcome: the answer (Health ones with their note) and what it touched, for logs and audits. */
export interface ToolCall {
    result: ToolResult;
    lang: Lang;
    /** The household it acted in, once known. */
    householdId?: string;
    touched: Pick<AuditEntry, 'app' | 'ref'>;
    /** What went wrong, when it did (the result's text already says so in the person's language). */
    error?: unknown;
}
export interface RunOptions {
    /** Whether this call may go ahead (rate limits); false answers "too many requests". */
    allow?: (kind: 'read' | 'write') => Promise<boolean>;
}
/**
 * Runs `tool` as `session`'s person with already-checked `args` (`checkArgs`, or an MCP server's
 * own validation): the household (`args.household` or the one the apps open), their language and
 * clock, then the tool. Never throws for the person's or the rules' reasons: the result says why.
 */
export declare function runTool(session: Session, tool: ToolDef, args: Record<string, unknown>, { allow }?: RunOptions): Promise<ToolCall>;
/** A short code for what went wrong, never a message (messages may hold names): for logs. */
export declare const errorCode: (e: unknown) => string;
/** The person's Firebase sign-in has ended for good (signed out everywhere, account disabled). */
export declare const signInEnded: (e: unknown) => boolean;
