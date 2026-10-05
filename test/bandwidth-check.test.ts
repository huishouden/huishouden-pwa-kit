import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { bandwidthFindings } from '../src/bandwidth-check';

const wf = (steps: unknown[], env?: Record<string, string>) => ({ jobs: { j: { env, steps } } });

test("the kit's own pwa.yml opens no browser against production", () => {
  expect(bandwidthFindings(Bun.YAML.parse(readFileSync('.github/workflows/pwa.yml', 'utf8')))).toEqual([]);
});

test('a browser step against the live site fails', () => {
  const f = bandwidthFindings(wf([{ name: 'smoke', run: 'BASE_URL="$LIVE_URL" bun run e2e' }]));
  expect(f).toHaveLength(1);
  expect(f[0].reason).toContain('production');
});

test('a browser step naming the production host in env fails', () => {
  expect(bandwidthFindings(wf([{ run: 'bun run screenshots', env: { BASE_URL: 'https://huishouden-piekstra.web.app/pet/' } }]))).toHaveLength(1);
});

test('a browser step without BASE_URL fails', () => {
  const f = bandwidthFindings(wf([{ run: 'bunx playwright test' }]));
  expect(f[0].reason).toContain('without BASE_URL');
});

test('staging, local previews and job-level BASE_URL pass', () => {
  expect(bandwidthFindings(wf([{ run: 'bun run e2e' }], { BASE_URL: 'https://huishouden-staging-pet.web.app/pet/' }))).toEqual([]);
  expect(bandwidthFindings(wf([{ run: 'BASE_URL="http://localhost:4173/" bun run screenshots' }]))).toEqual([]);
  expect(bandwidthFindings(wf([{ run: 'export BASE_URL="http://localhost:4173$BASE"\nbun run e2e:emulator' }]))).toEqual([]);
});

test('installing Playwright and HTTP checks are not browser runs', () => {
  expect(bandwidthFindings(wf([{ run: 'bun install && bunx playwright install --with-deps chromium' }]))).toEqual([]);
  expect(bandwidthFindings(wf([{ run: 'curl -sI https://huishouden-piekstra.web.app/' }]))).toEqual([]);
  expect(bandwidthFindings(wf([{ run: '# playwright used to run here\necho hi' }]))).toEqual([]);
});

test('a step marked local passes without BASE_URL', () => {
  expect(bandwidthFindings(wf([{ run: '# pwa-bandwidth-check: local (localhost ports in e2e/ports.ts)\nbun run e2e:local' }]))).toEqual([]);
});
