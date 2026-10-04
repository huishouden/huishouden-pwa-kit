export interface Problem {
    file: string;
    line?: number;
    message: string;
}
export interface CatalogueReport {
    errors: Problem[];
    warnings: Problem[];
}
/** Languages beside English that every app ships. */
export declare const CHECK_LANGS: readonly ["es", "nl"];
/**
 * Compares the other languages with English: missing and extra keys, messages that don't parse, and
 * translations using a variable the English doesn't pass (a renamed `{count}` would show as text).
 * A translation may leave a variable out (a warning: usually a slip, sometimes the grammar), and the
 * English may pass a variable only one language uses (Spanish's "a la 1" against "a las 2").
 * Also warns on a translation identical to its English, which is usually a copy left untranslated.
 */
export declare function checkCatalogues(en: Record<string, unknown>, others: Record<string, Record<string, unknown> | undefined>, dir?: string): CatalogueReport;
/** Keys from `keys` that no source mentions as a string literal, nor match a declared dynamic prefix (`i18n-dynamic: bills.status.`). */
export declare function unusedKeys(keys: string[], sources: string[]): string[];
/** Attributes whose plain-string value someone reads or hears. */
export declare const TEXT_ATTRIBUTES: string[];
export interface Literal {
    line: number;
    text: string;
    /** `text` for element children, else the attribute's name. */
    where: string;
}
/**
 * English left in JSX: element text and text attributes with letters in them. `{'literal'}`
 * children count too. Lines marked `i18n-ignore` (or below such a line) and files marked
 * `i18n-ignore-file` give nothing.
 */
export declare function findJsxLiterals(source: string, attributes?: readonly string[]): Literal[];
/** `notify('Saved')`, `fail("Couldn't save")`: toasts and errors given an English literal. */
export declare function findMessageLiterals(source: string, calls?: readonly string[]): Literal[];
/** App source files the scans read: TypeScript, not tests, fixtures or the catalogues. */
export declare const isCheckedSource: (path: string) => boolean;
