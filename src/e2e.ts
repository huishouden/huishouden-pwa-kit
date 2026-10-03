import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { CONTENT_SECURITY_POLICY, permissionsPolicy, type DeviceFeatures } from './security-headers.js';
import { mintCustomToken, stagingCredentialsFromEnv, stagingWebConfig, testUser } from './staging.js';

// Paths: every helper's default is `./`, which is BASE_URL itself. On the suite's one site BASE_URL
// is the app's path (`https://<site>/pet/`), so pass relative paths (`?tab=care`, `settings`): a
// leading `/` goes to the site root, which is the portal (docs/one-site.md).

/** Loads `path` and fails on any uncaught page error. Returns the errors seen for further checks. */
export async function expectCleanLoad(page: Page, path = './'): Promise<string[]> {
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
export async function expectInstallable(page: Page, request: APIRequestContext, path = './') {
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
 * Shares a contact card into the app the way Android's Share menu does (`pwaApp({ shareTarget:
 * { contacts: true } })`): a multipart POST to the manifest's share target, which the service
 * worker receives, then opens the page it sends the app to (`?share=contact`). Loads `path` and
 * waits for the service worker to be in control first.
 */
export async function shareContactCard(page: Page, card: string, { name = 'contact.vcf', path = './' }: { name?: string; path?: string } = {}) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'networkidle' });
  const target = await page.evaluate(
    async ({ card, name }) => {
      const href = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href;
      const target = (await (await fetch(href)).json()).share_target as { action: string; method: string; params: { files?: { name: string }[] } };
      if (target?.method !== 'POST' || !target.params.files?.length) throw new Error('The manifest has no share target for files.');
      const form = new FormData();
      form.append(target.params.files[0].name, new File([card], name, { type: 'text/x-vcard' }));
      const res = await fetch(new URL(target.action, href), { method: 'POST', body: form });
      return res.url;
    },
    { card, name },
  );
  expect(new URL(target).searchParams.get('share'), 'the service worker took the card').toBe('contact');
  await page.goto(target);
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
  path = './',
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

/**
 * The site's security headers as served (STANDARD.md "Security headers"): `url` (default `./`, the app's own path) is
 * frame-denied, sniff-proof and sends only the device permissions in `features`, while the same
 * origin's `/__/auth/handler` is not frame-denied, so Google sign-in keeps working.
 */
export async function expectSecurityHeaders(request: APIRequestContext, url = './', features: DeviceFeatures = {}) {
  const res = await request.get(url);
  expect(res.ok(), `${url} loads`).toBe(true);
  const h = res.headers();
  expect(h['x-frame-options'], 'X-Frame-Options').toBe('DENY');
  for (const part of CONTENT_SECURITY_POLICY.split('; ')) expect(h['content-security-policy'] ?? '', 'Content-Security-Policy').toContain(part);
  expect(h['referrer-policy'], 'Referrer-Policy').toBe('strict-origin-when-cross-origin');
  expect(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
  expect(h['permissions-policy'], 'Permissions-Policy').toBe(permissionsPolicy(features));
  const handler = await request.get(new URL('/__/auth/handler', res.url()).href);
  expect(handler.ok(), '/__/auth/handler loads').toBe(true);
  expect(handler.headers()['x-frame-options'], '/__/auth/handler is not frame-denied').toBeUndefined();
  expect(handler.headers()['content-security-policy'] ?? '', '/__/auth/handler has no frame-ancestors').not.toContain('frame-ancestors');
}

/**
 * The "Sample data" banner (`SampleBanner` from `/react/ui`) stays one line on a 390px phone: the
 * chip and the short text side by side. Restores the viewport afterwards.
 */
export async function expectCompactSampleBanner(page: Page, path?: string) {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    if (path !== undefined) await page.goto(path, { waitUntil: 'networkidle' });
    const line = page.locator('[data-sample-banner] [data-sample-line]').first();
    await expect(line, 'sample banner').toBeVisible();
    const chip = await line.locator('[data-sample-chip]').boundingBox();
    const text = await line.locator('[data-sample-short]').boundingBox();
    const box = await line.boundingBox();
    expect(chip && text && box, 'banner parts laid out').toBeTruthy();
    expect(Math.abs(chip!.y + chip!.height / 2 - (text!.y + text!.height / 2)), 'chip and text on one line').toBeLessThan(8);
    expect(box!.height, 'one line tall').toBeLessThanOrEqual(48);
  } finally {
    if (before) await page.setViewportSize(before);
  }
}

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
export async function expectBottomNav(page: Page, { path, labels, more }: BottomNavOptions = {}) {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    if (path !== undefined) await page.goto(path, { waitUntil: 'networkidle' });
    const nav = page.locator('nav[data-hh-bottom-nav]');
    await expect(nav, 'one bottom bar').toHaveCount(1);
    await expect(nav, 'bottom bar').toBeVisible();
    await expect(nav, 'bottom bar is labelled').toHaveAttribute('aria-label', /\S/);
    await expect(page.locator('hh-app-bar nav[slot="nav"]'), 'app bar tabs hidden on phones').toBeHidden();

    const box = (await nav.boundingBox())!;
    expect(Math.abs(box.y + box.height - 844), 'bar on the bottom edge').toBeLessThanOrEqual(1);
    expect(box.width, 'bar spans the screen').toBeGreaterThanOrEqual(389);
    expect(await nav.evaluate((el) => getComputedStyle(el).position), 'bar stays put').toBe('fixed');

    const items = nav.getByRole('button');
    const count = await items.count();
    expect(count, 'one to five items').toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      const b = (await items.nth(i).boundingBox())!;
      expect(Math.min(b.width, b.height), `item ${i + 1} is a 48px target`).toBeGreaterThanOrEqual(48);
    }
    if (labels) expect((await items.allInnerTexts()).map((t) => t.trim()), 'bar labels').toEqual(labels);
    const current = await nav.locator('[aria-current="page"]').count();
    const moreButton = nav.getByRole('button', { name: /^More/ });
    const moreShowing = (await moreButton.count()) > 0 && /^More, showing/.test((await moreButton.getAttribute('aria-label')) ?? '');
    expect(current + (moreShowing ? 1 : 0), 'the current section is marked').toBe(1);

    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-hh-bottom-nav')), 'page knows the bar shows').toBe(true);
    const padding = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    expect(padding, 'page padded for the bar').toBeGreaterThanOrEqual(box.height - 1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const main = page.locator('main').first();
    if ((await main.count()) > 0 && (await main.isVisible())) {
      const m = (await main.boundingBox())!;
      expect(m.y + m.height, 'content ends above the bar').toBeLessThanOrEqual(box.y + 1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    if ((await moreButton.count()) > 0) {
      await moreButton.click();
      const sheet = page.getByRole('dialog', { name: 'More' });
      await expect(sheet, 'More opens a sheet').toBeVisible();
      if (more) expect((await sheet.locator('ul').getByRole('button').allInnerTexts()).map((t) => t.trim()), 'More sheet items').toEqual(more);
      const covered = await page.evaluate(
        ({ x, y }) => !document.elementFromPoint(x, y)?.closest('nav[data-hh-bottom-nav]'),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(covered, 'the sheet covers the bar').toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(nav, 'no bottom bar on tablets').toBeHidden();
    await expect(page.locator('hh-app-bar nav[slot="nav"]'), 'tabs in the app bar on tablets').toBeVisible();
  } finally {
    if (before) await page.setViewportSize(before);
  }
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
  const { path = './', fixedTime, dir = process.env.SCREENSHOT_DIR || 'docs/screenshots', prepare } = options;
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
export async function stubCalendar(page: Page | BrowserContext, { events, cachedToken = true }: CalendarStubOptions) {
  await page.addInitScript(
    ({ events, cachedToken }) => {
      const w = window as unknown as { __mockCalendarEvents: unknown[]; __mockCalendarToken?: string };
      w.__mockCalendarEvents = events;
      if (cachedToken) w.__mockCalendarToken = 'test-token';
    },
    { events, cachedToken },
  );
}

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
export const FIREBASE_WEB_SDK = '12.19.0';

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
export async function signInTestUser(page: Page, { email, path = './', sdkVersion = FIREBASE_WEB_SDK, env = process.env }: SignInTestUserOptions) {
  const { accessToken, serviceAccount } = stagingCredentialsFromEnv(env);
  testUser(email);
  const res = await page.goto('/__/firebase/init.json');
  const site = res?.ok() ? ((await res.json().catch(() => null)) as { apiKey?: string; projectId?: string; authDomain?: string } | null) : null;
  const config = stagingWebConfig(env, site);
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
export async function runPortalTodo(page: Page, title: string, { action = 'done', path = '/todo', timeout = 30_000 }: PortalTodoOptions = {}) {
  await page.goto(path);
  const row = page.getByRole('listitem', { name: title, exact: true });
  await expect(row, `"${title}" on the portal's To-do list`).toBeVisible({ timeout });
  await row.locator(`[data-todo-action="${action}"]`).click();
  if (action === 'cancel') await page.getByRole('dialog').locator('[data-todo-confirm]').click();
  await expect(row, `"${title}" leaves the To-do list`).toHaveCount(0, { timeout: 15_000 });
}
