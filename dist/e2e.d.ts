import { type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { type DeviceFeatures } from './security-headers.js';
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
export interface SignInTestUserOptions {
    /** One of the seeded test users (`TEST_USERS` in `@huishouden/pwa-kit/staging`). */
    email: string;
    /** Page to open once signed in, relative to BASE_URL (default `./`, the app's own path). */
    path?: string;
    /** Firebase JS SDK version loaded from gstatic for the sign-in (default `FIREBASE_WEB_SDK`). */
    sdkVersion?: string;
    /** Where HH_STAGING_* and VITE_FIREBASE_* are read from (default `process.env`). */
    env?: Record<string, string | undefined>;
}
/** The Firebase web SDK the test sign-in loads; its saved session is read by any v9+ app build. */
export declare const FIREBASE_WEB_SDK = "12.19.0";
/**
 * Signs a seeded test user in on a staging site, then opens `path` signed in. Staging only: it
 * throws if the build's VITE_FIREBASE_PROJECT_ID or the site's /__/firebase/init.json names any
 * project but huishouden-staging, or neither names one (`stagingWebConfig`). The custom token it
 * mints is signed by the staging service account, so Firebase would refuse it anywhere else too.
 *
 * How: on the site's /__/firebase/init.json (same origin, no app code running) it loads the Firebase
 * SDK from gstatic, runs `signInWithCustomToken`, and leaves the session in IndexedDB where the
 * app's own Firebase finds it on load, exactly as after a real sign-in. Needs the staging CI job's
 * HH_STAGING_ACCESS_TOKEN and HH_STAGING_SA; call `test.skip(!process.env.HH_STAGING_SA)` around it.
 */
export declare function signInTestUser(page: Page, { email, path, sdkVersion, env }: SignInTestUserOptions): Promise<void>;
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
