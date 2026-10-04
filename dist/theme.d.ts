/**
 * Light or dark for the whole suite (DESIGN.md "Dark"). One choice, Automatic (the device's
 * setting), Light or Dark, kept in localStorage under `hh-theme`. Every app lives on the suite's
 * one origin (docs/one-site.md), so choosing Dark in one app turns every app dark, and open tabs
 * follow at once (the `storage` event).
 *
 * Dark is the `.dark` class on <html> (`dark:` variants and the semantic colours in theme.css
 * follow it), with `color-scheme` for the browser's own controls and the theme-color meta for the
 * phone's status bar. `pwaApp` puts `THEME_BOOT_SCRIPT` at the top of every page's <head>, so the
 * class is there before the first paint; `startTheme()` (called by `<hh-app-bar>` and `useTheme`)
 * keeps it right as the device setting, the choice or another tab changes. Printing is always light.
 *
 * ```ts
 * import { setThemeMode } from '@huishouden/pwa-kit/theme';
 * setThemeMode('dark');
 * ```
 * React: `useTheme()` from `@huishouden/pwa-kit/react/theme`.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';
export declare const THEME_MODES: readonly ThemeMode[];
/** What the choices are called in English. Shown text uses `themeLabel` (the active language). */
export declare const THEME_LABELS: Record<ThemeMode, string>;
/** What a choice is called in the active language: "Automatic", "Automático", "Automatisch". */
export declare function themeLabel(mode: ThemeMode): string;
/** The suite's one stored choice. */
export declare const THEME_KEY = "hh-theme";
/** Where Tasks and Groceries kept their own choice (JSON, under the app's original name); read once and moved. */
export declare const LEGACY_THEME_KEYS: string[];
/** Fired on `window` when the choice or the result changes in this page. */
export declare const THEME_EVENT = "hh-theme-change";
/** The status-bar colour in dark (forest-900, the dark page). Light keeps the page's own theme-color. */
export declare const DARK_THEME_COLOR = "#081c15";
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export declare function isThemeMode(value: unknown): value is ThemeMode;
/** Dark or not, for a choice and the device's setting. */
export declare function resolveDark(mode: ThemeMode, systemDark: boolean): boolean;
/**
 * The stored choice, `auto` when there is none. A choice Tasks or Groceries saved under their old
 * key is copied to `hh-theme` the first time, so it carries over to every app.
 */
export declare function readThemeMode(store?: Store | null): ThemeMode;
/** Whether the device asks for dark. */
export declare function systemPrefersDark(): boolean;
/** Whether the page is dark right now. */
export declare function isDark(doc?: Document | undefined): boolean;
/** Puts the result on the page: `.dark`, `color-scheme` and the theme-color meta. */
export declare function applyTheme(dark: boolean, doc?: Document | undefined): void;
/** Stores the choice for the whole suite and applies it here; other tabs follow by the `storage` event. */
export declare function setThemeMode(mode: ThemeMode, store?: Store | null): void;
/** The choice this page is using. */
export declare function getThemeMode(): ThemeMode;
/**
 * Applies the stored choice and keeps it applied: the device switching between light and dark,
 * another tab or app changing the choice, and printing (always light). Safe to call many times;
 * it starts once per page.
 */
export declare function startTheme(): void;
/** Calls `listener` whenever the choice or the result changes in this page; returns the unsubscribe. */
export declare function onThemeChange(listener: (state: {
    mode: ThemeMode;
    dark: boolean;
}) => void): () => void;
/** For tests: forget this page's state so the next `startTheme` reads storage again. */
export declare function resetThemeForTests(): void;
/**
 * The same reading as `readThemeMode` + `applyTheme`, as a classic script small enough to inline at
 * the top of <head>, so the first paint is already in the right theme. `pwaApp` adds it.
 */
export declare const THEME_BOOT_SCRIPT: string;
export {};
