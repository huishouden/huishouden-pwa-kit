/**
 * Finds app code that re-implements something the kit already exports: a function, hook or
 * component whose body is nearly the same as one in the kit's sources (a pasted `formatDuration`,
 * a local `ui.tsx` with the kit's `Dialog`). Copies drift; the fix is to import the kit's.
 *
 * The comparison is by top-level declaration: each is cut into tokens (comments and whitespace
 * dropped, string contents kept), then into overlapping runs of `SHINGLE` tokens, and two
 * declarations are alike in proportion to the runs they share (Jaccard). Renamed parameters lower
 * the score a little; a different algorithm lowers it a lot. Small declarations are skipped: one-line
 * helpers look alike by accident.
 *
 * A declaration can be kept on purpose with `// reuse-check:allow <reason>` on the line above it.
 */
export declare const SHINGLE = 4;
/** Declarations with fewer tokens are not compared. */
export declare const MIN_TOKENS = 30;
/** Reported from this similarity up. */
export declare const THRESHOLD = 0.7;
export interface Unit {
    name: string;
    /** 1-based line of the declaration. */
    line: number;
    tokens: string[];
}
export interface KitUnit extends Unit {
    /** The import path that exports it: `@huishouden/pwa-kit/time`. */
    module: string;
}
export interface Reuse {
    line: number;
    name: string;
    kit: {
        name: string;
        module: string;
    };
    /** 0 to 1. */
    similarity: number;
}
/** Comments removed, keeping line breaks so line numbers still hold. Strings, templates and regular expressions are left alone. */
export declare function stripComments(source: string): string;
export declare const tokenize: (code: string) => string[];
/**
 * Top-level functions, hooks and components (`function x`, `const x = (…) =>`), each running to
 * the next line that starts at column 0 with something other than a closing bracket.
 */
export declare function units(source: string): (Unit & {
    allowed: boolean;
    exported: boolean;
})[];
export declare function similarity(a: string[], b: string[]): number;
/** The kit declarations an app could import: exported from the modules `exports` lists, by import path. */
export declare function kitUnits(files: {
    path: string;
    source: string;
}[], exportsMap: Record<string, unknown>, packageName?: string): KitUnit[];
/** Declarations in an app file that look like a kit one, the most alike kit declaration for each. */
export declare function findReuse(source: string, kit: KitUnit[], threshold?: number): Reuse[];
