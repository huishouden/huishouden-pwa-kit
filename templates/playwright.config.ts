import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the deployed site; CI sets BASE_URL to the workflow's site-url, the app's
// path on the suite's one site. Keep it ending in `/` and use relative paths in tests (`./`,
// `?tab=x`): a leading `/` would leave the app for the portal.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: process.env.BASE_URL ?? 'https://FAMILY_SITE.web.app/APP_PATH/', trace: 'retain-on-failure' },
  projects: [{ name: 'tablet', use: { ...devices['Galaxy Tab S4'], viewport: { width: 1280, height: 800 } } }],
});
