import { defineConfig, devices } from '@playwright/test';

// Browser tests run against a staging site or a local preview, never production (docs/one-site.md
// "Bandwidth"): BASE_URL, by default the app's path on the staging suite (STAGING_SITE, e.g.
// huishouden-staging). Keep it ending in `/` and use relative paths in tests (`./`,
// `?tab=x`): a leading `/` would leave the app for the portal.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: process.env.BASE_URL ?? 'https://STAGING_SITE.web.app/APP_PATH/', trace: 'retain-on-failure' },
  projects: [{ name: 'tablet', use: { ...devices['Galaxy Tab S4'], viewport: { width: 1280, height: 800 } } }],
});
