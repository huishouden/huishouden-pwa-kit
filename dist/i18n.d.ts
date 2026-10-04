/**
 * Every app in the language its reader chose (docs/i18n.md). English, Spanish and Dutch; one choice
 * for the whole suite, Automatic (the device's languages) or a language, kept in localStorage under
 * `hh-lang`. Every app lives on the suite's one origin (docs/one-site.md), so choosing Español in one
 * app turns every app Spanish, and open tabs follow at once (the `storage` event).
 *
 * Text lives in catalogues, flat JSON objects of ICU-style messages: the kit's own (`./locales`) and
 * each app's `src/locales/{en,es,nl}.json`, registered with `registerMessages`. English is bundled;
 * the others are loaded when chosen (their own chunks), and a key a catalogue lacks falls back to
 * English. `t(key, vars)` formats one:
 *
 * ```ts
 * t('bills.dueCount', { count: 3 }); // "{count, plural, one {# bill due} other {# bills due}}"
 * ```
 *
 * Messages take `{name}`, `{n, number}`, `{n, plural, =0 {…} one {…} other {…}}` (`#` is the
 * number), `{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` and
 * `{x, select, a {…} other {…}}`, nested. A missing plural form falls back to `other`. There is no
 * quoting: an apostrophe is just an apostrophe, and a message never contains a literal `{` or `}`.
 *
 * One locale formats everything, `getLocale()`: the chosen language with the device's region where
 * the device has one ("es" on an en-US phone is es-US: dollars, miles, the week starting Sunday).
 * Kit formatters (./time, ./money, ./places, ./hours) default to it.
 *
 * Start-up: `pwaApp` puts `LANG_BOOT_SCRIPT` in every page's <head>, so `<html lang>` is right before
 * the first paint, and the app awaits `startI18n()` before its first render so no English flashes:
 *
 * ```ts
 * import './i18n'; // the app's registerMessages(...)
 * import { startI18n } from '@huishouden/pwa-kit/i18n';
 * startI18n().finally(() => createRoot(root).render(<App />));
 * ```
 * React: `useT()`, `useLocale()`, `useLang()` from `@huishouden/pwa-kit/react/i18n`.
 */
import kitEn from './locales/en.js';
export type Lang = 'en' | 'es' | 'nl';
export type LangChoice = 'auto' | Lang;
/** The languages every app ships in, English first (the fallback). */
export declare const LANGS: readonly Lang[];
export declare const LANG_CHOICES: readonly LangChoice[];
/** Each language in itself, as the choice is offered: a reader finds their own language whatever the page is in. */
export declare const LANG_NAMES: Record<Lang, string>;
/** The suite's one stored choice. */
export declare const LANG_KEY = "hh-lang";
/** Fired on `window` when the language (or its catalogues) change in this page. */
export declare const LANG_EVENT = "hh-lang-change";
/** The locale for a language when the device names no region at all. Spanish is Latin-American neutral. */
export declare const DEFAULT_LOCALES: Record<Lang, string>;
/** A flat catalogue: key to ICU-style message. */
export type Messages = Record<string, string>;
/** The same keys as `T` (a catalogue's English), each a message: what es/nl must satisfy. */
export type CatalogueOf<T> = {
    [K in keyof T]: string;
};
/**
 * The app's English catalogue, merged in by each app so its keys type-check (docs/i18n.md):
 *
 * ```ts
 * import en from './locales/en.json';
 * type AppEn = typeof en;
 * declare module '@huishouden/pwa-kit/i18n' { interface AppMessages extends AppEn {} }
 * ```
 */
export interface AppMessages {
}
export type KitKey = keyof typeof kitEn;
export type AppKey = Extract<keyof AppMessages, string>;
/** Any key `t` takes: the app's own, then the kit's. */
export type MessageKey = AppKey | KitKey;
export type Vars = Record<string, string | number | null | undefined>;
type Loader = () => Promise<{
    default: Messages;
} | Messages>;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export declare function isLang(value: unknown): value is Lang;
export declare function isLangChoice(value: unknown): value is LangChoice;
/** The first of the device's languages the suite speaks ("es-MX" is Spanish), else English. */
export declare function matchLang(languages: readonly string[] | undefined): Lang;
/**
 * The locale that formats dates, numbers and money for `lang`: the device's own tag for that
 * language when it has one (en-GB, es-MX, nl-BE), else the language with the device's region
 * (Spanish on an en-US phone is es-US), else `DEFAULT_LOCALES`.
 */
export declare function localeFor(lang: Lang, languages: readonly string[] | undefined): string;
/** The stored choice, `auto` when there is none. */
export declare function readLangChoice(store?: Store | null): LangChoice;
/** The language a choice comes to on this device. */
export declare function resolveLang(choice: LangChoice, languages?: readonly string[] | undefined): Lang;
type Node = string | Arg;
interface Arg {
    name: string;
    type?: 'number' | 'plural' | 'selectordinal' | 'select';
    options?: Record<string, Node[]>;
}
/** Parses a message; throws on unbalanced braces or a malformed argument (the check and the kit's tests catch those). */
export declare function parseMessage(message: string): Node[];
/** The argument names a message uses (`#` excluded), for checking a translation against its English. */
export declare function messageArgs(message: string): string[];
/** Formats a message with `vars` in `locale`. Unknown variables are left as `{name}`, so a gap shows rather than vanishing. */
export declare function formatMessage(message: string, vars?: Vars, locale?: string): string;
/**
 * Adds an app's catalogue: its English (imported, so typed) and loaders for the others
 * (`() => import('./locales/es.json')`), which become their own chunks. Call once, at start-up,
 * before `startI18n` (a later call loads at once and re-renders).
 */
export declare function registerMessages(en: object, loaders?: Partial<Record<Exclude<Lang, 'en'>, Loader>>): void;
/** The app's message for `key` (else the kit's) in the current language, formatted. Falls back to English, then the key itself. */
export declare function t(key: MessageKey, vars?: Vars): string;
/** The kit's own message (never an app's), for kit code. */
export declare function kt(key: KitKey, vars?: Vars): string;
/** Whether `key` has a message in the current language's own catalogue (not the English fallback). */
export declare function hasTranslation(key: MessageKey): boolean;
/** The language this page shows. */
export declare function getLang(): Lang;
/** The stored choice this page is using (Automatic or a language). */
export declare function getLangChoice(): LangChoice;
/** The locale every kit formatter uses (see `localeFor`). */
export declare function getLocale(): string;
/** Bumps on every change; React's `useSyncExternalStore` snapshot. */
export declare function getI18nVersion(): number;
/**
 * Reads the choice, loads its catalogues and keeps the page in step: another tab or app changing
 * the choice, or the device's languages changing under Automatic. Await it before the first render.
 * Safe to call many times; it starts once per page.
 */
export declare function startI18n(): Promise<void>;
/** Stores the choice for the whole suite and switches this page once its catalogues are in; other tabs follow by the `storage` event. */
export declare function setLangChoice(next: LangChoice, store?: Store | null): Promise<void>;
/** Calls `listener` whenever the language changes in this page; returns the unsubscribe. */
export declare function onLangChange(listener: (state: {
    lang: Lang;
    choice: LangChoice;
    locale: string;
}) => void): () => void;
/** Loads a language's catalogues (the kit's and every registered app's) without switching to it. */
export declare function loadLang(target: Lang): Promise<void>;
/**
 * Runs `fn` as if `target` were the page's language (its `t`, `kt` and formatters), then switches
 * back. `fn` must be synchronous, and the language loaded (`loadLang`); otherwise it gets English.
 */
export declare function withLang<T>(target: Lang, fn: () => T): T;
/**
 * `fn`'s result in every language, for text that leaves the device and is read on others: a
 * reminder's notification is shown in each device's own language (./reminders `texts`).
 * Loads the catalogues first.
 */
export declare function inEveryLang<T>(fn: () => T): Promise<Record<Lang, T>>;
/** Words of a stored record in other languages: `{ es: { title: '…' }, nl: { … } }` (to-dos, agenda items). */
export type LocalTexts<F extends string> = Partial<Record<Lang, Partial<Record<F, string>>>>;
/**
 * `texts` as stored: known languages and `fields` only, each trimmed and clipped to its limit,
 * empty ones dropped; undefined when nothing is left.
 */
export declare function cleanLocalTexts<F extends string>(texts: unknown, limits: Record<F, number>): LocalTexts<F> | undefined;
/**
 * A stored record's `field` in the reader's language when the writer stored one (`texts`), else
 * the record's own: what the portal shows of another app's to-do or agenda item.
 */
export declare function localized<F extends string>(item: {
    texts?: LocalTexts<F>;
}, field: F, own: string | undefined, target?: Lang): string | undefined;
/**
 * Runs `build` once per language and returns its records in the page's language, each with
 * `texts` holding what `pick` takes from it in every language. `build` must be synchronous and
 * return the same records in the same order each time (only the words differ). Used by
 * `localizeTodos` and `localizeAgenda`.
 */
export declare function localizeRecords<T, F extends string>(build: () => T[], pick: (item: T) => Partial<Record<F, string | undefined>>): Promise<(T & {
    texts: LocalTexts<F>;
})[]>;
/**
 * For tests and screenshots: switch to `next` with `languages` as the device's, without storage.
 * Resolves once its catalogues are loaded.
 */
export declare function setLangForTests(next: LangChoice, languages?: readonly string[]): Promise<void>;
/** For tests: forget registered app catalogues and this page's state. */
export declare function resetI18nForTests(): void;
/** A cached `Intl.NumberFormat` for the locale and options. */
export declare function numberFormat(options?: Intl.NumberFormatOptions, loc?: string): Intl.NumberFormat;
/** 1234.5 → "1,234.5" (en), "1234,5" (es), "1.234,5" (nl). */
export declare function formatNumber(n: number, loc?: string, options?: Intl.NumberFormatOptions): string;
/** ["eggs", "milk", "bread"] → "eggs, milk, and bread" / "eggs, milk y bread" / "eggs, milk en bread". `or` for alternatives. */
export declare function formatList(items: readonly string[], { type, loc }?: {
    type?: 'and' | 'or' | 'unit';
    loc?: string;
}): string;
/** Upper-cases the first letter the locale's way: "hoy" → "Hoy". */
export declare function capitalize(text: string, loc?: string): string;
/** Compares two strings the way the locale sorts them (accents, case). */
export declare function compareText(a: string, b: string, loc?: string): number;
/**
 * The same reading as `readLangChoice` + `resolveLang`, as a classic script small enough to inline
 * in <head>: `<html lang>` is right before the first paint. `pwaApp` adds it.
 */
export declare const LANG_BOOT_SCRIPT: string;
export {};
