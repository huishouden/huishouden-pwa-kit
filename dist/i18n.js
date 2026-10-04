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
/** The languages every app ships in, English first (the fallback). */
export const LANGS = ['en', 'es', 'nl'];
export const LANG_CHOICES = ['auto', 'en', 'es', 'nl'];
/** Each language in itself, as the choice is offered: a reader finds their own language whatever the page is in. */
export const LANG_NAMES = { en: 'English', es: 'Español', nl: 'Nederlands' };
/** The suite's one stored choice. */
export const LANG_KEY = 'hh-lang';
/** Fired on `window` when the language (or its catalogues) change in this page. */
export const LANG_EVENT = 'hh-lang-change';
/** The locale for a language when the device names no region at all. Spanish is Latin-American neutral. */
export const DEFAULT_LOCALES = { en: 'en-US', es: 'es-419', nl: 'nl-NL' };
export function isLang(value) {
    return value === 'en' || value === 'es' || value === 'nl';
}
export function isLangChoice(value) {
    return value === 'auto' || isLang(value);
}
/** The first of the device's languages the suite speaks ("es-MX" is Spanish), else English. */
export function matchLang(languages) {
    for (const tag of languages ?? []) {
        const primary = String(tag).toLowerCase().split(/[-_]/)[0];
        if (isLang(primary))
            return primary;
    }
    return 'en';
}
/**
 * The locale that formats dates, numbers and money for `lang`: the device's own tag for that
 * language when it has one (en-GB, es-MX, nl-BE), else the language with the device's region
 * (Spanish on an en-US phone is es-US), else `DEFAULT_LOCALES`.
 */
export function localeFor(lang, languages) {
    const tags = (languages ?? []).map(String);
    const own = tags.find((tag) => tag.toLowerCase().split(/[-_]/)[0] === lang);
    if (own)
        return canonical(own) ?? DEFAULT_LOCALES[lang];
    for (const tag of tags) {
        const region = regionOf(tag);
        if (region)
            return canonical(`${lang}-${region}`) ?? DEFAULT_LOCALES[lang];
    }
    return DEFAULT_LOCALES[lang];
}
function canonical(tag) {
    try {
        return Intl.getCanonicalLocales(tag.replace('_', '-'))[0] ?? null;
    }
    catch {
        return null;
    }
}
function regionOf(tag) {
    try {
        return new Intl.Locale(tag.replace('_', '-')).region;
    }
    catch {
        return undefined;
    }
}
function deviceLanguages() {
    if (typeof navigator === 'undefined')
        return [];
    return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}
function defaultStore() {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    }
    catch {
        return null; // storage blocked (private mode, sandboxed frame)
    }
}
/** The stored choice, `auto` when there is none. */
export function readLangChoice(store = defaultStore()) {
    try {
        const raw = store?.getItem(LANG_KEY);
        return isLangChoice(raw) ? raw : 'auto';
    }
    catch {
        return 'auto';
    }
}
/** The language a choice comes to on this device. */
export function resolveLang(choice, languages = deviceLanguages()) {
    return choice === 'auto' ? matchLang(languages) : choice;
}
const parsed = new Map();
/** Parses a message; throws on unbalanced braces or a malformed argument (the check and the kit's tests catch those). */
export function parseMessage(message) {
    let i = 0;
    const fail = (why) => {
        throw new Error(`Bad message (${why} at ${i}): ${message}`);
    };
    const ws = () => {
        while (i < message.length && /\s/.test(message[i]))
            i++;
    };
    const word = () => {
        ws();
        const start = i;
        while (i < message.length && /[^\s{},]/.test(message[i]))
            i++;
        if (start === i)
            fail('expected a name');
        return message.slice(start, i);
    };
    const nodes = (inPlural, nested) => {
        const out = [];
        let text = '';
        while (i < message.length) {
            const c = message[i];
            if (c === '{') {
                if (text)
                    out.push(text);
                text = '';
                i++;
                out.push(arg(inPlural));
            }
            else if (c === '}') {
                if (!nested)
                    fail('unmatched }');
                break;
            }
            else if (c === '#' && inPlural) {
                if (text)
                    out.push(text);
                text = '';
                out.push({ name: '#' });
                i++;
            }
            else {
                text += c;
                i++;
            }
        }
        if (text)
            out.push(text);
        return out;
    };
    const arg = (inPlural) => {
        const name = word();
        ws();
        if (message[i] === '}') {
            i++;
            return { name };
        }
        if (message[i] !== ',')
            fail('expected , or }');
        i++;
        const type = word();
        ws();
        if (type === 'number') {
            if (message[i] !== '}')
                fail('number takes no style');
            i++;
            return { name, type };
        }
        if (type !== 'plural' && type !== 'selectordinal' && type !== 'select')
            fail(`unknown type ${type}`);
        if (message[i] !== ',')
            fail('expected ,');
        i++;
        const options = {};
        for (;;) {
            ws();
            if (message[i] === '}') {
                i++;
                break;
            }
            const key = word();
            ws();
            if (message[i] !== '{')
                fail(`expected { after ${key}`);
            i++;
            options[key] = nodes(type !== 'select' || inPlural, true);
            if (message[i] !== '}')
                fail('unclosed option');
            i++;
        }
        if (!('other' in options))
            fail(`${type} needs an other option`);
        return { name, type: type, options };
    };
    const out = nodes(false, false);
    if (i < message.length)
        fail('trailing text');
    return out;
}
/** The argument names a message uses (`#` excluded), for checking a translation against its English. */
export function messageArgs(message) {
    const names = new Set();
    const walk = (list) => {
        for (const n of list) {
            if (typeof n === 'string' || n.name === '#')
                continue;
            names.add(n.name);
            for (const opt of Object.values(n.options ?? {}))
                walk(opt);
        }
    };
    walk(parseMessage(message));
    return [...names].sort();
}
const pluralRules = new Map();
function pluralCategory(locale, n, ordinal) {
    const key = `${locale}|${ordinal}`;
    let rules = pluralRules.get(key);
    if (!rules)
        pluralRules.set(key, (rules = new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' })));
    return rules.select(n);
}
/** Formats a message with `vars` in `locale`. Unknown variables are left as `{name}`, so a gap shows rather than vanishing. */
export function formatMessage(message, vars = {}, locale = getLocale()) {
    let tree = parsed.get(message);
    if (!tree) {
        try {
            tree = parseMessage(message);
        }
        catch {
            tree = [message];
        }
        parsed.set(message, tree);
    }
    return render(tree, vars, locale, undefined);
}
function render(list, vars, locale, hash) {
    let out = '';
    for (const n of list) {
        if (typeof n === 'string') {
            out += n;
            continue;
        }
        if (n.name === '#') {
            out += hash === undefined ? '#' : formatNumber(hash, locale);
            continue;
        }
        const value = vars[n.name];
        if (!n.type) {
            out += value === undefined || value === null ? `{${n.name}}` : typeof value === 'number' ? formatNumber(value, locale) : value;
        }
        else if (n.type === 'number') {
            out += typeof value === 'number' ? formatNumber(value, locale) : String(value ?? '');
        }
        else if (n.type === 'select') {
            const opts = n.options;
            out += render(opts[String(value)] ?? opts.other, vars, locale, hash);
        }
        else {
            const num = Number(value ?? 0);
            const opts = n.options;
            const exact = opts[`=${num}`];
            const branch = exact ?? opts[pluralCategory(locale, num, n.type === 'selectordinal')] ?? opts.other;
            out += render(branch, vars, locale, num);
        }
    }
    return out;
}
// ---- Catalogues and the current language ----
const kitLoaders = {
    es: () => import('./locales/es.js'),
    nl: () => import('./locales/nl.js'),
};
const apps = [];
const kitLoaded = { en: kitEn };
let choice = null;
let lang = 'en';
let locale = 'en-US';
let started = false;
let starting = null;
let version = 0;
/**
 * Adds an app's catalogue: its English (imported, so typed) and loaders for the others
 * (`() => import('./locales/es.json')`), which become their own chunks. Call once, at start-up,
 * before `startI18n` (a later call loads at once and re-renders).
 */
export function registerMessages(en, loaders = {}) {
    const entry = { en: en, loaders, loaded: { en: en } };
    apps.push(entry);
    if (started && lang !== 'en')
        void ensure(lang).then(changed);
}
async function load(loader) {
    if (!loader)
        return undefined;
    try {
        const mod = await loader();
        return ('default' in mod && typeof mod.default === 'object' ? mod.default : mod);
    }
    catch {
        return undefined; // offline before the chunk was cached: English for now
    }
}
async function ensure(target) {
    if (target === 'en')
        return;
    const jobs = [];
    if (!kitLoaded[target])
        jobs.push(load(kitLoaders[target]).then((m) => m && (kitLoaded[target] = m)));
    for (const app of apps) {
        if (!app.loaded[target])
            jobs.push(load(app.loaders[target]).then((m) => m && (app.loaded[target] = m)));
    }
    await Promise.all(jobs);
}
function lookupApp(key) {
    for (const app of apps) {
        const m = app.loaded[lang]?.[key];
        if (m !== undefined)
            return m;
    }
    for (const app of apps) {
        const m = app.en[key];
        if (m !== undefined)
            return m;
    }
    return undefined;
}
function lookupKit(key) {
    return kitLoaded[lang]?.[key] ?? kitEn[key];
}
/** The app's message for `key` (else the kit's) in the current language, formatted. Falls back to English, then the key itself. */
export function t(key, vars) {
    const message = lookupApp(key) ?? lookupKit(key);
    return message === undefined ? key : formatMessage(message, vars, locale);
}
/** The kit's own message (never an app's), for kit code. */
export function kt(key, vars) {
    const message = lookupKit(key);
    return message === undefined ? key : formatMessage(message, vars, locale);
}
/** Whether `key` has a message in the current language's own catalogue (not the English fallback). */
export function hasTranslation(key) {
    if (lang === 'en')
        return lookupApp(key) !== undefined || kitEn[key] !== undefined;
    return apps.some((a) => a.loaded[lang]?.[key] !== undefined) || kitLoaded[lang]?.[key] !== undefined;
}
/** The language this page shows. */
export function getLang() {
    return lang;
}
/** The stored choice this page is using (Automatic or a language). */
export function getLangChoice() {
    return (choice ??= readLangChoice());
}
/** The locale every kit formatter uses (see `localeFor`). */
export function getLocale() {
    return locale;
}
/** Bumps on every change; React's `useSyncExternalStore` snapshot. */
export function getI18nVersion() {
    return version;
}
function applyLang(doc = typeof document === 'undefined' ? undefined : document) {
    if (doc)
        doc.documentElement.lang = lang;
}
function changed() {
    version++;
    applyLang();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
        window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang, choice: getLangChoice(), locale } }));
}
async function switchTo(next) {
    choice = next;
    const target = resolveLang(next);
    await ensure(target);
    // A later switch may have finished first; the latest choice wins.
    if (choice !== next)
        return;
    lang = target;
    locale = localeFor(target, deviceLanguages());
    changed();
}
/**
 * Reads the choice, loads its catalogues and keeps the page in step: another tab or app changing
 * the choice, or the device's languages changing under Automatic. Await it before the first render.
 * Safe to call many times; it starts once per page.
 */
export function startI18n() {
    // Once started, the listeners keep it in step: later calls (every useLang mount) only wait.
    if (started && starting)
        return starting;
    if (typeof window !== 'undefined' && !started) {
        window.addEventListener('storage', (e) => {
            if (e.key !== null && e.key !== LANG_KEY)
                return;
            void switchTo(readLangChoice());
        });
        window.addEventListener('languagechange', () => {
            if (getLangChoice() === 'auto')
                void switchTo('auto');
        });
    }
    started = true;
    return (starting = switchTo(choice ?? readLangChoice()));
}
/** Stores the choice for the whole suite and switches this page once its catalogues are in; other tabs follow by the `storage` event. */
export function setLangChoice(next, store = defaultStore()) {
    if (!isLangChoice(next))
        return Promise.resolve();
    try {
        store?.setItem(LANG_KEY, next);
    }
    catch {
        // not stored, still applied for this page
    }
    return switchTo(next);
}
/** Calls `listener` whenever the language changes in this page; returns the unsubscribe. */
export function onLangChange(listener) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function')
        return () => { };
    const handler = (e) => listener(e.detail);
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
}
/** Loads a language's catalogues (the kit's and every registered app's) without switching to it. */
export function loadLang(target) {
    return ensure(target);
}
/**
 * Runs `fn` as if `target` were the page's language (its `t`, `kt` and formatters), then switches
 * back. `fn` must be synchronous, and the language loaded (`loadLang`); otherwise it gets English.
 */
export function withLang(target, fn) {
    const saved = { lang, locale };
    lang = target;
    locale = target === saved.lang ? saved.locale : localeFor(target, deviceLanguages());
    try {
        return fn();
    }
    finally {
        lang = saved.lang;
        locale = saved.locale;
    }
}
/**
 * `fn`'s result in every language, for text that leaves the device and is read on others: a
 * reminder's notification is shown in each device's own language (./reminders `texts`).
 * Loads the catalogues first.
 */
export async function inEveryLang(fn) {
    await Promise.all(LANGS.map((l) => ensure(l)));
    return Object.fromEntries(LANGS.map((l) => [l, withLang(l, fn)]));
}
/**
 * `texts` as stored: known languages and `fields` only, each trimmed and clipped to its limit,
 * empty ones dropped; undefined when nothing is left.
 */
export function cleanLocalTexts(texts, limits) {
    if (!texts || typeof texts !== 'object' || Array.isArray(texts))
        return undefined;
    const out = {};
    for (const l of LANGS) {
        const entry = texts[l];
        if (!entry || typeof entry !== 'object')
            continue;
        const clean = {};
        for (const field of Object.keys(limits)) {
            const value = entry[field];
            if (typeof value !== 'string')
                continue;
            const trimmed = value.trim().slice(0, limits[field]);
            if (trimmed)
                clean[field] = trimmed;
        }
        if (Object.keys(clean).length)
            out[l] = clean;
    }
    return Object.keys(out).length ? out : undefined;
}
/**
 * A stored record's `field` in the reader's language when the writer stored one (`texts`), else
 * the record's own: what the portal shows of another app's to-do or agenda item.
 */
export function localized(item, field, own, target = lang) {
    return item.texts?.[target]?.[field] ?? own;
}
/**
 * Runs `build` once per language and returns its records in the page's language, each with
 * `texts` holding what `pick` takes from it in every language. `build` must be synchronous and
 * return the same records in the same order each time (only the words differ). Used by
 * `localizeTodos` and `localizeAgenda`.
 */
export async function localizeRecords(build, pick) {
    const all = await inEveryLang(build);
    return all[lang].map((item, i) => {
        const texts = {};
        for (const l of LANGS) {
            const other = all[l][i];
            if (!other)
                continue;
            const words = Object.fromEntries(Object.entries(pick(other)).filter(([, v]) => typeof v === 'string' && v));
            if (Object.keys(words).length)
                texts[l] = words;
        }
        return { ...item, texts };
    });
}
/**
 * For tests and screenshots: switch to `next` with `languages` as the device's, without storage.
 * Resolves once its catalogues are loaded.
 */
export async function setLangForTests(next, languages = ['en-US']) {
    choice = next;
    const target = resolveLang(next, languages);
    await ensure(target);
    lang = target;
    locale = localeFor(target, languages);
    changed();
}
/** For tests: forget registered app catalogues and this page's state. */
export function resetI18nForTests() {
    apps.length = 0;
    choice = null;
    lang = 'en';
    locale = 'en-US';
    started = false;
    starting = null;
    version++;
}
// ---- Locale-aware formatting that is not about dates (dates: ./time) ----
const numberFormats = new Map();
/** A cached `Intl.NumberFormat` for the locale and options. */
export function numberFormat(options = {}, loc = locale) {
    const key = `${loc}|${JSON.stringify(options)}`;
    let f = numberFormats.get(key);
    if (!f)
        numberFormats.set(key, (f = new Intl.NumberFormat(loc, options)));
    return f;
}
/** 1234.5 → "1,234.5" (en), "1234,5" (es), "1.234,5" (nl). */
export function formatNumber(n, loc = locale, options) {
    return numberFormat(options, loc).format(n);
}
/** ["eggs", "milk", "bread"] → "eggs, milk, and bread" / "eggs, milk y bread" / "eggs, milk en bread". `or` for alternatives. */
export function formatList(items, { type = 'and', loc = locale } = {}) {
    const style = type === 'and' ? 'conjunction' : type === 'or' ? 'disjunction' : 'unit';
    return new Intl.ListFormat(loc, { type: style, style: type === 'unit' ? 'narrow' : 'long' }).format(items);
}
/** Upper-cases the first letter the locale's way: "hoy" → "Hoy". */
export function capitalize(text, loc = locale) {
    return text ? text.charAt(0).toLocaleUpperCase(loc) + text.slice(1) : text;
}
/** Compares two strings the way the locale sorts them (accents, case). */
export function compareText(a, b, loc = locale) {
    return a.localeCompare(b, loc, { sensitivity: 'base' });
}
/**
 * The same reading as `readLangChoice` + `resolveLang`, as a classic script small enough to inline
 * in <head>: `<html lang>` is right before the first paint. `pwaApp` adds it.
 */
export const LANG_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(LANG_KEY)}),s=${JSON.stringify(LANGS)},l=s.indexOf(c)>=0?c:null,n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''],i,p;for(i=0;!l&&i<n.length;i++){p=String(n[i]).toLowerCase().split(/[-_]/)[0];if(s.indexOf(p)>=0)l=p}document.documentElement.lang=l||'en'}catch(e){}})();`;
