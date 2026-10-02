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
