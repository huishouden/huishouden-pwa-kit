import { type APIRequestContext, type Browser, type BrowserContext, type Page, type TestType } from '@playwright/test';
import { type DeviceFeatures } from './security-headers.js';
import { type TestHousehold, type TestRole, type TestUser } from './staging.js';
/** Loads `path` and fails on any uncaught page error. Returns the errors seen for further checks. */
export declare function expectCleanLoad(page: Page, path?: string): Promise<string[]>;
/**
 * Installability as browsers judge it: a standalone manifest with a 512px icon, every icon URL
 * loading, and a service worker controlling the page after one reload.
 */
export declare function expectInstallable(page: Page, request: APIRequestContext, path?: string): Promise<void>;
/**
 * Shares a contact card into the app the way Android's Share menu does (`pwaApp({ shareTarget:
 * { contacts: true } })`): a multipart POST to the manifest's share target, which the service
 * worker receives, then opens the page it sends the app to (`?share=contact`). Loads `path` and
 * waits for the service worker to be in control first.
 */
export declare function shareContactCard(page: Page, card: string, { name, path }?: {
    name?: string;
    path?: string;
}): Promise<void>;
/**
 * Clicks through to the Google sign-in popup and checks it reaches Google with a Firebase
 * /__/auth/handler redirect that Google accepts. Runs on a second load so the service worker is in
 * control, which is when a cached-app fallback would hijack the popup. Needs no credentials.
 */
export declare function expectGoogleSignInPopup(page: Page, context: BrowserContext, openPopup: (page: Page) => Promise<void>, path?: string): Promise<void>;
/**
 * The site's security headers as served (STANDARD.md "Security headers"): `url` (default `./`, the app's own path) is
 * frame-denied, sniff-proof and sends only the device permissions in `features`, while the same
 * origin's `/__/auth/handler` is not frame-denied, so Google sign-in keeps working.
 */
export declare function expectSecurityHeaders(request: APIRequestContext, url?: string, features?: DeviceFeatures): Promise<void>;
/**
 * The "Sample data" banner (`SampleBanner` from `/react/ui`) stays one line on a 390px phone: the
 * chip and the short text side by side. Restores the viewport afterwards.
 */
export declare function expectCompactSampleBanner(page: Page, path?: string): Promise<void>;
export interface BottomNavOptions {
    /** Page to load first; leave unset to check the page as it is. */
    path?: string;
    /** The bottom bar's labels in order, More included when the app has one ("Overview", …, "More"). */
    labels?: string[];
    /** What the More sheet lists, in order. */
    more?: string[];
}
/**
 * The phone's bottom tab bar (`SectionTabs` from /react/ui, DESIGN.md "Frame") at 390×844: one
 * labelled nav fixed to the bottom edge, at most five items of 48px or more, the current section
 * marked, the app bar's own tabs gone, the page padded so its end clears the bar, and More (when
 * there is one) opening a sheet that covers the bar. Then at 1280×800 the bar is gone and the tabs
 * are back in the app bar. Restores the viewport afterwards.
 */
export declare function expectBottomNav(page: Page, { path, labels, more }?: BottomNavOptions): Promise<void>;
export interface ScreenshotOptions {
    path?: string;
    /** Freeze the page clock so date-dependent screens render the same on every run. */
    fixedTime?: string | Date;
    /** Output directory, relative to the repo root. */
    dir?: string;
    /** Runs after load, before the capture (open a dialog, scroll, wait for a chart). */
    prepare?: (page: Page) => Promise<void>;
}
/**
 * Captures a README screenshot of the live app: animations and the caret off, reduced motion,
 * optional frozen clock, so the PNG only changes when the app's look does. The reusable workflow
 * commits docs/screenshots back to main when the bytes change.
 */
export declare function captureScreenshot(page: Page, name: string, options?: ScreenshotOptions): Promise<void>;
export interface FrameOptions {
    /** The app's short name as the bar shows it ("Spending"); the portal's is "Huishouden". */
    app: string;
    /** Where the logo must lead. Defaults to any https URL (or `/` on the portal). */
    portalUrl?: string | RegExp;
    /** Page to load first; leave unset to check the page as it is. */
    path?: string;
}
/**
 * The Huishouden frame (DESIGN.md "Frame") on the running app: an `<hh-app-bar>` with the family
 * logo linking to the portal, the app's name, and the bar set in Inter.
 */
export declare function expectHuishoudenFrame(page: Page, { app, portalUrl, path }: FrameOptions): Promise<void>;
/**
 * Opens the app's own settings from the app bar's menu (the avatar signed in, the sliders button
 * signed out): the bar holds them since apps dropped their own gear. `name` is the item's text,
 * e.g. "Tasks settings".
 *
 * Safe to call straight after `goto` or a sign-in: it waits for the bar to settle (the session
 * restored, the avatar or sliders button shown) and for the app to name its settings, which a
 * loading screen's bar lacks, and opens the menu again if the bar was replaced under it.
 */
export declare function openAppSettings(page: Page, name: string | RegExp, { timeout }?: {
    timeout?: number;
}): Promise<void>;
/**
 * The app bar's logo, name and account controls on one row at the current viewport (a phone's
 * 360–412px, in a long language): nothing pushed onto a second line. The nav row is not counted.
 */
export declare function expectAppBarOneRow(page: Page): Promise<void>;
export interface ThemeOptions {
    /** Page to load; defaults to the page as it is (reloaded). */
    path?: string;
    /** Also check that visible text reaches 4.5:1 (3:1 when large) against what is behind it, in dark. Default true. */
    contrast?: boolean;
    /** Text to leave out of the contrast check (a photo caption, a colour swatch). */
    ignore?: RegExp;
}
export interface ContrastFailure {
    text: string;
    ratio: number;
    color: string;
    background: string;
}
/**
 * The suite's theme (DESIGN.md "Dark") on the running app. With the choice on Automatic and the
 * device dark, the page is dark from its first paint: `.dark` on <html>, a dark `color-scheme`,
 * page and app bar on dark backgrounds, the dark status-bar colour, and (with `contrast`) no
 * visible text under 4.5:1. Turning the device light then turns the page light without a reload.
 */
export declare function expectThemeConsistent(page: Page, { path, contrast, ignore }?: ThemeOptions): Promise<void>;
/**
 * In the page: visible text whose colour is under 4.5:1 (3:1 for 24px, or 18.66px bold) against
 * the first solid background behind it. Text over images, inside hidden or faded parts, and SVG
 * text are left out. At most 12, worst first.
 */
export declare function lowContrastText(): ContrastFailure[];
export interface GoogleTokenStubOptions {
    /** The access token handed out (default "test-token"). */
    token?: string;
    /**
     * How Google answers instead: the window closed (`popup_closed`) or blocked
     * (`popup_failed_to_open`), or the person refusing (`access_denied`).
     */
    fail?: 'popup_closed' | 'popup_failed_to_open' | 'access_denied';
}
/**
 * Serves a stand-in for Google Identity Services (https://accounts.google.com/gsi/client) so
 * `googleAccessToken` gets a token with no Google account: the token client grants every scope
 * asked for (or fails as `fail` says), and One Tap reports "not displayed". Each request is
 * recorded in `window.__gisTokenRequests` (`{ client_id, scope }`). Call before `page.goto`.
 */
export declare function stubGoogleTokens(page: Page, { token, fail }?: GoogleTokenStubOptions): Promise<void>;
export interface CalendarStubOptions {
    /** What the calendar holds, as `findCalendarEvents` returns it (`CalendarMatch[]` from `./calendar`). */
    events: unknown[];
    /** Also stand in for a calendar token already granted on this device, so suggestions look on open (default true). */
    cachedToken?: boolean;
}
/**
 * Before the page loads: Google Calendar answers from `events` (`window.__mockCalendarEvents`) and,
 * with `cachedToken`, the device counts as having a calendar token (`window.__mockCalendarToken`),
 * which `useCalendarSuggestions` needs before it looks. Works signed out, in the sample app.
 */
export declare function stubCalendar(page: Page | BrowserContext, { events, cachedToken }: CalendarStubOptions): Promise<void>;
export interface MapStubOptions {
    /** What a Nominatim address search answers (its `jsonv2` objects with `address`); any search gets these. */
    search?: unknown[];
    /** What a reverse lookup (a position to an address) answers; zoom 14 and below (a neighbourhood) gets `area` instead. */
    reverse?: unknown;
    /** The neighbourhood a reverse lookup at suburb level answers, for "Approximate only". */
    area?: unknown;
}
/**
 * OpenStreetMap stands still for a test: Nominatim (search and reverse, `./home` and `./places`)
 * answers from `options`, and map tiles are a plain grey square, so nothing leaves the machine and
 * screenshots don't change with the map. Returns the URLs Nominatim was asked.
 */
export declare function stubOpenStreetMap(page: Page | BrowserContext, { search, reverse, area }?: MapStubOptions): Promise<string[]>;
/** The browser reports this position, with location permission granted for the page's origin. */
export declare function useGeolocation(context: BrowserContext, point: {
    lat: number;
    lng: number;
}, origin?: string): Promise<void>;
export interface SignInTestUserOptions {
    /** Which of the household's people signs in: `admin`, `member`, `helper` or `kid`. */
    as?: TestRole;
    /** Or one of the household's people by email (`household.users.helper.email`). */
    email?: string;
    /** The household (default the run's own, `testHousehold()`; `useTestHousehold` passes the spec's). */
    household?: TestHousehold;
    /** Page to open once signed in, relative to BASE_URL (default `./`, the app's own path). */
    path?: string;
    /** Firebase JS SDK version loaded from gstatic for the sign-in (default `FIREBASE_WEB_SDK`). */
    sdkVersion?: string;
    /** Where HH_* and VITE_FIREBASE_* are read from (default `process.env`). */
    env?: Record<string, string | undefined>;
}
/** The Firebase web SDK the test sign-in loads; its saved session is read by any v9+ app build. */
export declare const FIREBASE_WEB_SDK = "12.19.0";
/**
 * Signs one of a test household's people in, then opens `path` signed in. On staging (the kit's
 * staging job) it throws if the build's VITE_FIREBASE_PROJECT_ID or the site's /__/firebase/init.json
 * names any project but huishouden-staging, or neither names one (`stagingWebConfig`), and the
 * custom token is signed by the staging service account, so Firebase would refuse it anywhere else.
 * On the emulators (`HH_E2E_TARGET=emulator`, the kit's app-tests job) the token is unsigned and
 * the sign-in goes to the Auth emulator.
 *
 * How: on the site's /__/firebase/init.json (same origin, no app code running) it loads the Firebase
 * SDK from gstatic, runs `signInWithCustomToken`, and leaves the session in IndexedDB where the
 * app's own Firebase finds it on load, exactly as after a real sign-in. The household's people must
 * be seeded first (`useTestHousehold`, or `seedTestHousehold` in a `beforeAll`).
 */
export declare function signInTestUser(page: Page, { as, email, household, path, sdkVersion, env }: SignInTestUserOptions): Promise<TestUser>;
/** A spec file's own test household: see `useTestHousehold`. */
export interface TestHouseholdHandle {
    /** The household (resolved inside hooks and tests: its id comes from the spec file's name). */
    readonly household: TestHousehold;
    /** Its people: `users.helper.email`. */
    readonly users: Record<TestRole, TestUser>;
    /** Signs `as` in on `page` and opens `path` (default `./`). */
    signIn(page: Page, as: TestRole, path?: string): Promise<TestUser>;
    /**
     * A new page signed in as `as`, in a browser context the spec file keeps for that person: signed
     * in once per file, not once per test. Pages close after each test, so no Firestore listener is
     * left reading; the contexts close after the file.
     */
    open(browser: Browser, as: TestRole, path?: string): Promise<Page>;
    /** Writes app data under the household in one batched commit: `{ 'agenda/e1': {...} }`. */
    write(docs: Record<string, Record<string, unknown>>): Promise<void>;
    /** One document under the household, with admin access (one read), or null. */
    get(path: string): Promise<Record<string, unknown> | null>;
}
export interface UseTestHouseholdOptions {
    /** Default the spec file's name: each spec file has a household of its own in each run. */
    scope?: string;
    /** App data to seed with the household, in the same commit. */
    docs?: Record<string, Record<string, unknown>>;
}
/**
 * A household of its own for this spec file in this run, with an admin, a member, a helper and a
 * kid, seeded before its tests (one commit) and removed by the job after the run. Skips the file
 * where signed-in tests can't run (no staging credentials, no emulators).
 *
 * ```ts
 * const hh = useTestHousehold(test);
 * test('a helper ...', async ({ page }) => {
 *   await hh.signIn(page, 'helper');
 *   await expect(page.getByLabel(`Role for ${hh.users.helper.email}`)).toHaveValue('helper');
 * });
 * ```
 */
export declare function useTestHousehold(t: TestType<any, any>, { scope, docs }?: UseTestHouseholdOptions): TestHouseholdHandle;
export interface PortalTodoOptions {
    /** `done` (default) or `cancel`, which also confirms. */
    action?: 'done' | 'cancel';
    /** The portal's To-do page (default `/todo`, the site root's: the portal is at `/` on the one site). */
    path?: string;
    /** How long to wait for the app's item to be published (default 30 s: apps publish a few seconds after a change). */
    timeout?: number;
}
/**
 * Finds `title` on the portal's To-do tab (a list item named for it, published by an app through
 * `./todos`) and runs its Done or Cancel there, confirming a cancel, then waits for the item to leave
 * the list. For an app's signed-in staging test: create a record in the app, run this, then check the
 * app's own data changed. Each staging site is a full mirror, so the portal is at `/` on it.
 */
export declare function runPortalTodo(page: Page, title: string, { action, path, timeout }?: PortalTodoOptions): Promise<void>;
/** English words of the kit's chrome that should never show once a page is in another language. */
export declare const ENGLISH_CHROME: string[];
/** Makes every page in `page`'s context open in `lang` (the suite's stored choice), from the next load on. */
export declare function useLanguage(target: Page | BrowserContext, lang: 'auto' | 'en' | 'es' | 'nl'): Promise<void>;
export interface LocalizedOptions {
    path?: string;
    /** More English words the app's own chrome uses ("Bills due", "Add a bill"). Whole words, case-sensitive. */
    words?: string[];
    /** Words to allow after all (sample data that stays English, a brand). */
    allow?: string[];
}
/**
 * Opens `path` in `lang` and checks it took: `<html lang>`, and none of the kit's English chrome
 * words (plus `words`) in the visible page, app bar included. Data stays as entered, so mark an
 * element whose text is household data with `translate="no"` (or `data-hh-data`) to leave it out,
 * or name its words in `allow`. Returns the visible text it read.
 */
export declare function expectLocalized(page: Page, lang: 'es' | 'nl', { path, words, allow }?: LocalizedOptions): Promise<string>;
