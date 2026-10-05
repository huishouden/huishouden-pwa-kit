import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { APP_PATHS_REGEX, checkSecurityHeaders, globToRegExp, headersFor, permissionsPolicy, securityHeaders } from '../src/security-headers';
import template from '../templates/firebase.json';
import before from './fixtures/headers/before.json';
import everywhere from './fixtures/headers/everywhere.json';
import weak from './fixtures/headers/weak.json';

describe('security headers', () => {
  test('the app-path regex takes every path but Firebase /__/ ones', () => {
    const re = new RegExp(APP_PATHS_REGEX);
    for (const p of ['/', '/index.html', '/meds/c1', '/_', '/_x', '/a__b', '/assets/__x.js']) expect(re.test(p), p).toBe(true);
    for (const p of ['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json', '/__']) expect(re.test(p), p).toBe(false);
  });

  test('the template passes; its headers are the kit defaults', () => {
    expect(checkSecurityHeaders(template)).toEqual([]);
    expect(template.hosting.headers[0].headers).toEqual(securityHeaders());
  });

  test('an app without the headers fails on every app path', () => {
    const problems = checkSecurityHeaders(before);
    expect(problems).toContain('/: no X-Frame-Options');
    expect(problems).toContain('/settings: no Permissions-Policy');
    expect(problems.some((p) => p.startsWith('/__/'))).toBe(false);
  });

  test('frame-denying everything, /__/auth included, fails: it would break Google sign-in', () => {
    const problems = checkSecurityHeaders(everywhere);
    expect(problems.filter((p) => p.startsWith('/__/auth/handler'))).toHaveLength(2);
    expect(problems.some((p) => p.startsWith('/:'))).toBe(false);
  });

  test('weak values are named', () => {
    expect(checkSecurityHeaders(weak)).toEqual(
      expect.arrayContaining([
        '/: X-Frame-Options is "SAMEORIGIN", want "DENY"',
        "/: Content-Security-Policy lacks frame-ancestors 'none'",
        '/: no X-Content-Type-Options',
        '/: Permissions-Policy must include microphone=() (got "geolocation=(self)")',
      ]),
    );
  });

  test('device features per app', () => {
    expect(permissionsPolicy()).toBe('camera=(), microphone=(), geolocation=()');
    expect(permissionsPolicy({ camera: true })).toBe('camera=(self), microphone=(), geolocation=()');
    expect(permissionsPolicy({ geolocation: true })).toBe('camera=(), microphone=(), geolocation=(self)');
  });

  test('Firebase globs', () => {
    const cache = globToRegExp('/@(sw.js|registerSW.js|index.html)');
    expect(cache.test('/sw.js')).toBe(true);
    expect(cache.test('/swXjs')).toBe(false);
    expect(globToRegExp('/assets/**').test('/assets/a/b.js')).toBe(true);
    expect(globToRegExp('**').test('/__/auth/handler')).toBe(true);
    expect(globToRegExp('**/*.@(js|css)').test('/assets/x.css')).toBe(true);
    expect(globToRegExp('/!(__)/**').test('/__/auth/handler')).toBe(false);
    expect(globToRegExp('/!(__)/**').test('/meds/c1')).toBe(true);
    expect(headersFor(template.hosting.headers, '/index.html').get('cache-control')).toBe('no-cache');
  });
});

describe('pwa-headers-check', () => {
  const script = new URL('../scripts/headers-check.ts', import.meta.url).pathname;
  const run = (files: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), 'headers-check-'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
    return Bun.spawnSync(['bun', script], { cwd: dir }).exitCode;
  };

  test('a repo that serves no pages (a Worker) has nothing to check', () => {
    expect(run({})).toBe(0);
    expect(run({ 'firebase.json': { emulators: { firestore: { port: 8080 } } }, 'wrangler.toml': 'name = "w"' })).toBe(0);
  });

  test('a firebase.json that lost its hosting, outside a Worker, fails', () => {
    expect(run({ 'firebase.json': { emulators: { firestore: { port: 8080 } } } })).toBe(1);
  });

  test('a site without the headers still fails', () => {
    expect(run({ 'firebase.json': { hosting: { public: 'dist' } } })).toBe(1);
  });
});
