import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

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
  const { path = '/', fixedTime, dir = 'docs/screenshots', prepare } = options;
  if (fixedTime) await page.clock.setFixedTime(fixedTime);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (prepare) await prepare(page);
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', caret: 'hide' });
}
