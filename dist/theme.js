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
export const THEME_MODES = ['auto', 'light', 'dark'];
/** What the choices are called wherever they are offered. */
export const THEME_LABELS = { auto: 'Automatic', light: 'Light', dark: 'Dark' };
/** The suite's one stored choice. */
export const THEME_KEY = 'hh-theme';
/** Where Tasks and Groceries kept their own choice (JSON, under the app's original name); read once and moved. */
export const LEGACY_THEME_KEYS = ['hearthlist.theme'];
/** Fired on `window` when the choice or the result changes in this page. */
export const THEME_EVENT = 'hh-theme-change';
/** The status-bar colour in dark (forest-900, the dark page). Light keeps the page's own theme-color. */
export const DARK_THEME_COLOR = '#081c15';
const LIGHT_THEME_COLOR = '#1b4332';
const DARK_QUERY = '(prefers-color-scheme: dark)';
export function isThemeMode(value) {
    return value === 'auto' || value === 'light' || value === 'dark';
}
/** Dark or not, for a choice and the device's setting. */
export function resolveDark(mode, systemDark) {
    return mode === 'dark' || (mode === 'auto' && systemDark);
}
function parseLegacy(raw) {
    if (raw === null)
        return null;
    try {
        const value = JSON.parse(raw);
        return isThemeMode(value) ? value : null;
    }
    catch {
        return isThemeMode(raw) ? raw : null;
    }
}
function defaultStore() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    }
    catch {
        return null; // storage blocked (private mode, sandboxed frame)
    }
}
/**
 * The stored choice, `auto` when there is none. A choice Tasks or Groceries saved under their old
 * key is copied to `hh-theme` the first time, so it carries over to every app.
 */
export function readThemeMode(store = defaultStore()) {
    if (!store)
        return 'auto';
    try {
        const raw = store.getItem(THEME_KEY);
        if (isThemeMode(raw))
            return raw;
        for (const key of LEGACY_THEME_KEYS) {
            const legacy = parseLegacy(store.getItem(key));
            if (legacy) {
                store.setItem(THEME_KEY, legacy);
                return legacy;
            }
        }
    }
    catch {
        // unreadable storage: fall through to the default
    }
    return 'auto';
}
/** Whether the device asks for dark. */
export function systemPrefersDark() {
    return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
}
/** Whether the page is dark right now. */
export function isDark(doc = typeof document === 'undefined' ? undefined : document) {
    return !!doc?.documentElement.classList.contains('dark');
}
/** Puts the result on the page: `.dark`, `color-scheme` and the theme-color meta. */
export function applyTheme(dark, doc = typeof document === 'undefined' ? undefined : document) {
    if (!doc)
        return;
    const root = doc.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    let meta = doc.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = doc.createElement('meta');
        meta.name = 'theme-color';
        meta.content = LIGHT_THEME_COLOR;
        doc.head.append(meta);
    }
    // The page's own colour is kept for light; the boot script stores it the same way.
    if (!meta.dataset.light)
        meta.dataset.light = meta.content || LIGHT_THEME_COLOR;
    meta.content = dark ? DARK_THEME_COLOR : meta.dataset.light;
}
/** Stores the choice for the whole suite and applies it here; other tabs follow by the `storage` event. */
export function setThemeMode(mode, store = defaultStore()) {
    if (!isThemeMode(mode))
        return;
    try {
        store?.setItem(THEME_KEY, mode);
    }
    catch {
        // not stored, still applied for this page
    }
    current = mode;
    refresh();
}
let current = null;
let printing = false;
let startedOn = null;
/** The choice this page is using. */
export function getThemeMode() {
    return (current ??= readThemeMode());
}
function refresh() {
    const mode = getThemeMode();
    const dark = !printing && resolveDark(mode, systemPrefersDark());
    applyTheme(dark);
    if (typeof window !== 'undefined')
        window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { mode, dark } }));
}
/**
 * Applies the stored choice and keeps it applied: the device switching between light and dark,
 * another tab or app changing the choice, and printing (always light). Safe to call many times;
 * it starts once per page.
 */
export function startTheme() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    if (startedOn === window) {
        refresh();
        return;
    }
    startedOn = window;
    current = readThemeMode();
    refresh();
    if (typeof matchMedia === 'function') {
        const media = matchMedia(DARK_QUERY);
        media.addEventListener?.('change', refresh);
    }
    window.addEventListener('storage', (e) => {
        if (e.key !== null && e.key !== THEME_KEY)
            return;
        current = readThemeMode();
        refresh();
    });
    window.addEventListener('beforeprint', () => {
        printing = true;
        refresh();
    });
    window.addEventListener('afterprint', () => {
        printing = false;
        refresh();
    });
}
/** Calls `listener` whenever the choice or the result changes in this page; returns the unsubscribe. */
export function onThemeChange(listener) {
    if (typeof window === 'undefined')
        return () => { };
    const handler = (e) => listener(e.detail);
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
}
/** For tests: forget this page's state so the next `startTheme` reads storage again. */
export function resetThemeForTests() {
    current = null;
    printing = false;
    startedOn = null;
}
/**
 * The same reading as `readThemeMode` + `applyTheme`, as a classic script small enough to inline at
 * the top of <head>, so the first paint is already in the right theme. `pwaApp` adds it.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document,r=d.documentElement,s=localStorage,k=${JSON.stringify(THEME_KEY)},m=s.getItem(k),o=${JSON.stringify(LEGACY_THEME_KEYS)},i,v;function ok(x){return x==='auto'||x==='light'||x==='dark'}if(!ok(m)){m='auto';for(i=0;i<o.length;i++){v=s.getItem(o[i]);if(v===null)continue;try{v=JSON.parse(v)}catch(e){}if(ok(v)){m=v;s.setItem(k,v);break}}}var dk=m==='dark'||(m==='auto'&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);r.classList.toggle('dark',dk);r.style.colorScheme=dk?'dark':'light';var t=d.querySelector('meta[name="theme-color"]');if(t){if(!t.dataset.light)t.dataset.light=t.content||${JSON.stringify(LIGHT_THEME_COLOR)};t.content=dk?${JSON.stringify(DARK_THEME_COLOR)}:t.dataset.light}}catch(e){}})();`;
