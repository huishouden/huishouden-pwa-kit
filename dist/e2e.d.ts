import { type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
/** Loads `path` and fails on any uncaught page error. Returns the errors seen for further checks. */
export declare function expectCleanLoad(page: Page, path?: string): Promise<string[]>;
/**
 * Installability as browsers judge it: a standalone manifest with a 512px icon, every icon URL
 * loading, and a service worker controlling the page after one reload.
 */
export declare function expectInstallable(page: Page, request: APIRequestContext, path?: string): Promise<void>;
/**
 * Clicks through to the Google sign-in popup and checks it reaches Google with a Firebase
 * /__/auth/handler redirect that Google accepts. Runs on a second load so the service worker is in
 * control, which is when a cached-app fallback would hijack the popup. Needs no credentials.
 */
export declare function expectGoogleSignInPopup(page: Page, context: BrowserContext, openPopup: (page: Page) => Promise<void>, path?: string): Promise<void>;
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
