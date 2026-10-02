import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the deployed site; CI sets BASE_URL to the workflow's site-url.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: process.env.BASE_URL ?? 'https://APP_SITE.web.app', trace: 'retain-on-failure' },
  projects: [{ name: 'tablet', use: { ...devices['Galaxy Tab S4'], viewport: { width: 1280, height: 800 } } }],
});
