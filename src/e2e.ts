import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { assertStagingProject, mintCustomToken, stagingCredentialsFromEnv, testUser } from './staging.js';

/** Loads `path` and fails on any uncaught page error. Returns the errors seen for further checks. */
export async function expectCleanLoad(page: Page, path = '/'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path, { waitUntil: 'networkidle' });
  expect(errors, 'uncaught page errors').toEqual([]);
  return errors;
}

/**
 * Installability as browsers judge it: a standalone manifest with a 512px icon, every icon URL
 * loading, and a service worker controlling the page after one reload.
 */
export async function expectInstallable(page: Page, request: APIRequestContext, path = '/') {
  await page.goto(path, { waitUntil: 'networkidle' });
  const href = await page.locator('link[rel="manifest"]').first().getAttribute('href');
  expect(href, 'manifest link').toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes.includes('512x512')), '512px icon').toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker in control').toBe(true);
}

/**
 * Clicks through to the Google sign-in popup and checks it reaches Google with a Firebase
 * /__/auth/handler redirect that Google accepts. Runs on a second load so the service worker is in
 * control, which is when a cached-app fallback would hijack the popup. Needs no credentials.
 */
export async function expectGoogleSignInPopup(
  page: Page,
  context: BrowserContext,
  openPopup: (page: Page) => Promise<void>,
  path = '/',
) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const [popup] = await Promise.all([context.waitForEvent('page'), openPopup(page)]);
  await popup.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });
  const redirect = new URL(popup.url()).searchParams.get('redirect_uri') ?? '';
  expect(redirect).toMatch(/\/__\/auth\/handler$/);
  await expect(popup.locator('body')).not.toContainText('redirect_uri_mismatch');
  await expect(popup.locator('body')).toContainText(/Sign in|Choose an account/);
}

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
export async function captureScreenshot(page: Page, name: string, options: ScreenshotOptions = {}) {
  // SCREENSHOT_DIR lets CI shoot the same scenes into before/ and after/ folders for PR evidence.
  const { path = '/', fixedTime, dir = process.env.SCREENSHOT_DIR || 'docs/screenshots', prepare } = options;
  if (fixedTime) await page.clock.setFixedTime(fixedTime);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (prepare) await prepare(page);
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', caret: 'hide' });
}

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
export async function expectHuishoudenFrame(page: Page, { app, portalUrl, path }: FrameOptions) {
  if (path !== undefined) await page.goto(path, { waitUntil: 'networkidle' });
  const bar = page.locator('hh-app-bar');
  await expect(bar, 'Huishouden app bar').toHaveCount(1);
  await expect(bar).toBeVisible();
  const home = bar.getByRole('link', { name: 'Huishouden home' });
  await expect(home, 'logo links to the portal').toHaveAttribute('href', portalUrl ?? /^(https:\/\/|\/$)/);
  await expect(home.locator('.logo svg'), 'family logo').toBeVisible();
  await expect(bar.getByRole('heading', { level: 1 }), 'app name').toHaveText(app);
  const font = await bar.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font, 'app bar typeface').toMatch(/^["']?Inter\b/);
}

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
export async function stubGoogleTokens(page: Page, { token = 'test-token', fail }: GoogleTokenStubOptions = {}) {
  const script = `(() => {
  const token = ${JSON.stringify(token)}, fail = ${JSON.stringify(fail ?? null)};
  window.__gisTokenRequests = [];
  window.google = { accounts: {
    id: {
      initialize() {},
      prompt(listener) { if (listener) listener({ isNotDisplayed: () => true, getNotDisplayedReason: () => 'stubbed' }); },
      disableAutoSelect() {},
    },
    oauth2: {
      initTokenClient(cfg) {
        return { requestAccessToken() {
          window.__gisTokenRequests.push({ client_id: cfg.client_id, scope: cfg.scope });
          setTimeout(() => {
            if (fail === 'access_denied') cfg.callback({ error: 'access_denied' });
            else if (fail) cfg.error_callback && cfg.error_callback({ type: fail });
            else cfg.callback({ access_token: token, expires_in: 3599, scope: cfg.scope, token_type: 'Bearer' });
          });
        } };
      },
      hasGrantedAllScopes() { return !fail; },
    },
  } };
})();`;
  await page.route('https://accounts.google.com/gsi/client*', (route) => route.fulfill({ contentType: 'text/javascript', body: script }));
}

export interface SignInTestUserOptions {
  /** One of the seeded test users (`TEST_USERS` in `@huishouden/pwa-kit/staging`). */
  email: string;
  /** Page to open once signed in (default `/`). */
  path?: string;
  /** Firebase JS SDK version loaded from gstatic for the sign-in (default `FIREBASE_WEB_SDK`). */
  sdkVersion?: string;
}

/** The Firebase web SDK the test sign-in loads; its saved session is read by any v9+ app build. */
export const FIREBASE_WEB_SDK = '12.19.0';

/**
 * Signs a seeded test user in on a staging site, then opens `path` signed in. Staging only: it
 * throws unless the build's Firebase project (VITE_FIREBASE_PROJECT_ID, or the site's own
 * /__/firebase/init.json) is huishouden-staging, and the custom token it mints is signed by the
 * staging service account, so Firebase would refuse it anywhere else too.
 *
 * How: on the site's /__/firebase/init.json (same origin, no app code running) it loads the Firebase
 * SDK from gstatic, runs `signInWithCustomToken`, and leaves the session in IndexedDB where the
 * app's own Firebase finds it on load, exactly as after a real sign-in. Needs the staging CI job's
 * HH_STAGING_ACCESS_TOKEN and HH_STAGING_SA; call `test.skip(!process.env.HH_STAGING_SA)` around it.
 */
export async function signInTestUser(page: Page, { email, path = '/', sdkVersion = FIREBASE_WEB_SDK }: SignInTestUserOptions) {
  const { accessToken, serviceAccount } = stagingCredentialsFromEnv(process.env);
  testUser(email);
  const res = await page.goto('/__/firebase/init.json');
  const site = res?.ok() ? ((await res.json().catch(() => null)) as { apiKey?: string; projectId?: string; authDomain?: string } | null) : null;
  if (site?.projectId) assertStagingProject(site.projectId, 'This site\'s Hosting project');
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || site?.apiKey,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || site?.projectId,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || site?.authDomain,
  };
  assertStagingProject(config.projectId, 'The app\'s Firebase project');
  if (!config.apiKey) throw new Error('No Firebase API key: set VITE_FIREBASE_API_KEY or test a Firebase Hosting site');
  const token = await mintCustomToken({ email, serviceAccount, accessToken });
  const signedIn = await page.evaluate(
    async ({ config, token, base }) => {
      const { initializeApp } = await import(`${base}/firebase-app.js`);
      const { getAuth, signInWithCustomToken } = await import(`${base}/firebase-auth.js`);
      const cred = await signInWithCustomToken(getAuth(initializeApp(config)), token);
      return cred.user.email as string | null;
    },
    { config, token, base: `https://www.gstatic.com/firebasejs/${sdkVersion}` },
  );
  expect(signedIn, 'signed in as the test user').toBe(email.toLowerCase());
  // Not networkidle: a signed-in app keeps Firestore's listen channel open.
  await page.goto(path);
}
