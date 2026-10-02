import { expect } from '@playwright/test';
/** Loads `path` and fails on any uncaught page error. Returns the errors seen for further checks. */
export async function expectCleanLoad(page, path = '/') {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(errors, 'uncaught page errors').toEqual([]);
    return errors;
}
/**
 * Installability as browsers judge it: a standalone manifest with a 512px icon, every icon URL
 * loading, and a service worker controlling the page after one reload.
 */
export async function expectInstallable(page, request, path = '/') {
    await page.goto(path, { waitUntil: 'networkidle' });
    const href = await page.locator('link[rel="manifest"]').first().getAttribute('href');
    expect(href, 'manifest link').toBeTruthy();
    const manifest = await (await request.get(href)).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes.includes('512x512')), '512px icon').toBe(true);
    for (const icon of manifest.icons)
        expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker in control').toBe(true);
}
/**
 * Clicks through to the Google sign-in popup and checks it reaches Google with a Firebase
 * /__/auth/handler redirect that Google accepts. Runs on a second load so the service worker is in
 * control, which is when a cached-app fallback would hijack the popup. Needs no credentials.
 */
export async function expectGoogleSignInPopup(page, context, openPopup, path = '/') {
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
 * Captures a README screenshot of the live app: animations and the caret off, reduced motion,
 * optional frozen clock, so the PNG only changes when the app's look does. The reusable workflow
 * commits docs/screenshots back to main when the bytes change.
 */
export async function captureScreenshot(page, name, options = {}) {
    // SCREENSHOT_DIR lets CI shoot the same scenes into before/ and after/ folders for PR evidence.
    const { path = '/', fixedTime, dir = process.env.SCREENSHOT_DIR || 'docs/screenshots', prepare } = options;
    if (fixedTime)
        await page.clock.setFixedTime(fixedTime);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (prepare)
        await prepare(page);
    await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled', caret: 'hide' });
}
/**
 * The Huishouden frame (DESIGN.md "Frame") on the running app: an `<hh-app-bar>` with the family
 * logo linking to the portal, the app's name, and the bar set in Inter.
 */
export async function expectHuishoudenFrame(page, { app, portalUrl, path }) {
    if (path !== undefined)
        await page.goto(path, { waitUntil: 'networkidle' });
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
