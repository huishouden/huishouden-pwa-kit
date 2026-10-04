import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  AGENT_INIT,
  householdTag,
  newRelicConfigFromEnv,
  newRelicConfigFromSite,
  parseSiteObservability,
  observabilityActive,
  observabilityBlock,
  observeHousehold,
  redact,
  reportError,
  resetObservability,
  hasSensitiveWords,
  setSensitiveWords,
  startObservability,
  track,
  trackView,
  usageAllowed,
  type AgentLoader,
  type BrowserAgent,
} from '../src/observability';
import { readError } from '../src/feedback';
import samples from './fixtures/observability/redact.json';
import siteFile from './fixtures/observability/site.json';

const ENV = { VITE_NEWRELIC_ACCOUNT_ID: '1234567', VITE_NEWRELIC_APP_ID: '7654321', VITE_NEWRELIC_BROWSER_KEY: 'NRJS-example0000000000', VITE_APP_VERSION: '1.2.3', VITE_BUILD_SHA: 'abc1234' };
const config = newRelicConfigFromEnv(ENV);

const g = globalThis as unknown as Record<string, unknown>;

function page({ host = 'example-baby.web.app', protocol = 'https:', dnt = null as string | null, gpc = false, webdriver = false } = {}) {
  g.location = { hostname: host, protocol };
  g.navigator = { doNotTrack: dnt, globalPrivacyControl: gpc, webdriver };
}

interface Call { fn: string; args: unknown[] }
function fakeAgent() {
  const calls: Call[] = [];
  const loads: { usage: boolean; init: object }[] = [];
  const rec = (fn: string) => (...args: unknown[]) => void calls.push({ fn, args });
  const agent: BrowserAgent = {
    noticeError: rec('noticeError'),
    addPageAction: rec('addPageAction'),
    setCustomAttribute: rec('setCustomAttribute'),
    setApplicationVersion: rec('setApplicationVersion'),
    setErrorHandler: rec('setErrorHandler'),
  };
  const loader: AgentLoader = async ({ usage, init }) => (loads.push({ usage, init }), agent);
  return { agent, calls, loads, loader };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => page());
afterEach(() => resetObservability());

describe('config and blocking', () => {
  test('needs all three variables', () => {
    expect(config).toEqual({ accountId: '1234567', appId: '7654321', browserKey: 'NRJS-example0000000000' });
    expect(newRelicConfigFromEnv({ ...ENV, VITE_NEWRELIC_APP_ID: '' })).toBeNull();
  });

  test('says why nothing is sent', () => {
    expect(observabilityBlock(null)).toBe('not-configured');
    expect(observabilityBlock(config)).toBeNull();
    page({ webdriver: true });
    expect(observabilityBlock(config)).toBe('automation');
    page({ host: 'localhost', protocol: 'http:' });
    expect(observabilityBlock(config)).toBe('host');
    page({ host: 'example.com' });
    expect(observabilityBlock(config)).toBe('host');
  });

  test('Global Privacy Control and Do Not Track stop usage counts, not error reports', () => {
    expect(usageAllowed()).toBe(true);
    page({ gpc: true });
    expect(usageAllowed()).toBe(false);
    expect(observabilityBlock(config)).toBeNull();
    page({ dnt: '1' });
    expect(usageAllowed()).toBe(false);
  });

  test('a blocked page never loads the agent', async () => {
    page({ webdriver: true });
    const { loads, loader } = fakeAgent();
    expect(startObservability({ app: 'baby', env: ENV, loader })).toBe('automation');
    reportError(new Error('x'));
    await tick();
    expect(loads).toHaveLength(0);
  });

  test('nothing identifies the device between visits', () => {
    expect(AGENT_INIT.privacy.cookies_enabled).toBe(false);
    expect(AGENT_INIT.session_replay.enabled).toBe(false);
    expect(AGENT_INIT.ajax.enabled).toBe(false);
    expect(AGENT_INIT.user_actions.enabled).toBe(false);
  });
});

describe('redact', () => {
  for (const s of samples) test(s.name, () => expect(redact(s.input)).toBe(s.expected));
});

test('householdTag is a stable 16-hex hash, not the id', async () => {
  const a = await householdTag('hh-example-1');
  expect(a).toMatch(/^[0-9a-f]{16}$/);
  expect(await householdTag('hh-example-1')).toBe(a);
  expect(await householdTag('hh-example-2')).not.toBe(a);
});

describe('reporting', () => {
  test('tags the app and sends redacted errors and events queued before the agent loaded', async () => {
    const { calls, loads, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    reportError(Object.assign(new Error('Write failed for parent@example.com at households/abc123/feeds'), { code: 'internal' }), { where: "Couldn't save" });
    track('log feed', { kind: 'bottle', note: 'call parent@example.com' });
    await tick();
    expect(loads[0].usage).toBe(true);
    expect(calls.find((c) => c.fn === 'setApplicationVersion')?.args).toEqual(['1.2.3']);
    expect(calls.filter((c) => c.fn === 'setCustomAttribute').map((c) => c.args)).toEqual([['app', 'baby'], ['buildSha', 'abc1234']]);
    const err = calls.find((c) => c.fn === 'noticeError')!;
    expect((err.args[0] as Error).message).toBe('Write failed for [email] at households/[id]/feeds');
    expect(err.args[1]).toEqual({ where: "Couldn't save", handled: true, code: 'internal' });
    expect(calls.find((c) => c.fn === 'addPageAction')?.args).toEqual(['log feed', { kind: 'bottle', note: 'call [email]' }]);
  });

  test('under Global Privacy Control: errors yes; usage events and household tag no', async () => {
    page({ gpc: true });
    const { calls, loads, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    await tick();
    expect(loads[0].usage).toBe(false);
    track('log feed');
    trackView('history');
    await observeHousehold('hh-example-1');
    reportError(new Error('boom'));
    expect(calls.some((c) => c.fn === 'addPageAction')).toBe(false);
    expect(calls.some((c) => c.fn === 'setCustomAttribute' && c.args[0] === 'household')).toBe(false);
    expect(calls.filter((c) => c.fn === 'noticeError')).toHaveLength(1);
  });

  test('the household tag is the hash, applied even when it arrives before the agent', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    await observeHousehold('hh-example-1');
    await tick();
    const tag = calls.find((c) => c.fn === 'setCustomAttribute' && c.args[0] === 'household')!.args[1];
    expect(tag).toBe(await householdTag('hh-example-1'));
  });

  test('the same failure is sent once a minute', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    await tick();
    reportError(new Error('boom'), { where: 'save' });
    reportError(new Error('boom'), { where: 'save' });
    reportError(new Error('boom'), { where: 'load' });
    expect(calls.filter((c) => c.fn === 'noticeError')).toHaveLength(2);
  });

  test('readError reports failures but not being offline', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    await tick();
    readError({ code: 'unavailable', message: 'offline' }, "Couldn't save");
    readError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }, "Couldn't save");
    const sent = calls.filter((c) => c.fn === 'noticeError');
    expect(sent).toHaveLength(1);
    expect(sent[0].args[1]).toEqual({ where: "Couldn't save", handled: true, code: 'permission-denied' });
  });

  test('trackView labels later errors and counts the view', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'baby', env: ENV, loader });
    await tick();
    trackView('history');
    expect(calls.some((c) => c.fn === 'setCustomAttribute' && c.args[0] === 'view' && c.args[1] === 'history')).toBe(true);
    expect(calls.find((c) => c.fn === 'addPageAction')?.args).toEqual(['view', { view: 'history' }]);
  });
});

describe("sensitive words (medicine and people's names)", () => {
  afterEach(() => setSensitiveWords('health', []));

  test('redact takes them out wherever they appear, ignoring case, longest first', () => {
    setSensitiveWords('health', ['Lisinopril 10 mg', 'Lisinopril', 'Ada Example', 'ab']);
    expect(redact("Couldn't save LISINOPRIL 10 mg for ada example")).toBe("Couldn't save [redacted] for [redacted]");
    expect(redact('lisinopril dose')).toBe('[redacted] dose');
    // Too short to be a name worth blanking: ordinary text stays readable.
    expect(redact('about the tablets')).toBe('about the tablets');
    expect(hasSensitiveWords('Metformin')).toBe(false);
    setSensitiveWords('health', []);
    expect(redact('Lisinopril')).toBe('Lisinopril');
  });

  test("the agent's own obfuscation rule follows words set after it started", () => {
    const rule = AGENT_INIT.obfuscate.find((r) => r.replacement === '[redacted]')!;
    expect('Warfarin 5 mg'.replace(rule.regex, rule.replacement)).toBe('Warfarin 5 mg');
    setSensitiveWords('health', ['Warfarin 5 mg']);
    expect('Saved Warfarin 5 mg'.replace(rule.regex, rule.replacement)).toBe('Saved [redacted]');
    expect(rule.regex).toBeInstanceOf(RegExp);
  });

  test('handled errors, usage counts and views never carry them', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'health', env: ENV, loader });
    await tick();
    setSensitiveWords('health', ['Metformin 500 mg', 'Grandma Example']);
    reportError(new Error('Missing Metformin 500 mg for Grandma Example'), { where: 'save Metformin 500 mg' });
    track('give Metformin 500 mg', { who: 'Grandma Example' });
    trackView('Grandma Example');
    const sent = JSON.stringify(calls.map((c) => c.args.map((a) => (a instanceof Error ? { message: a.message, stack: a.stack } : a))));
    expect(sent).not.toContain('Metformin');
    expect(sent).not.toContain('Grandma');
    expect(sent).toContain('[redacted]');
  });

  test('an uncaught error naming one is dropped and sent again redacted', async () => {
    const { calls, loader } = fakeAgent();
    startObservability({ app: 'health', env: ENV, loader });
    await tick();
    setSensitiveWords('health', ['Atorvastatin']);
    const handler = calls.find((c) => c.fn === 'setErrorHandler')!.args[0] as (e: Error | string) => boolean;
    expect(handler(new Error('TypeError in Atorvastatin row'))).toBe(true);
    const resent = calls.filter((c) => c.fn === 'noticeError').map((c) => c.args[0] as Error);
    expect(resent).toHaveLength(1);
    expect(resent[0].message).toBe('TypeError in [redacted] row');
    expect(handler(new Error('Something else broke'))).toBe(false);
  });
});

describe("the site's hh-observability.json", () => {
  test('keeps only account and app ids and browser keys, by path', () => {
    expect(parseSiteObservability(siteFile)).toEqual({
      accountId: '1234567',
      apps: { '/': { appId: '1000001', browserKey: 'NRJS-example1111111111' }, '/baby/': { appId: '1000002', browserKey: 'NRJS-example1111111111' } },
    });
    expect(newRelicConfigFromSite(siteFile, '/baby/')).toEqual({ accountId: '1234567', appId: '1000002', browserKey: 'NRJS-example1111111111' });
    expect(newRelicConfigFromSite(siteFile, '/pet/')).toBeNull();
  });

  test('refuses anything that is not a browser key, so a user key is never published', () => {
    const withKey = (browserKey: string) => ({ accountId: '1234567', apps: { '/': { appId: '1', browserKey } } });
    expect(parseSiteObservability(withKey('NRAK-EXAMPLE0000000000000000'))).toBeNull();
    expect(parseSiteObservability(withKey('NRJS-<script>'))).toBeNull();
    expect(parseSiteObservability({ accountId: 'x', apps: {} })).toBeNull();
    expect(parseSiteObservability({ accountId: '1', apps: { '../': { appId: '1', browserKey: 'NRJS-example1111111111' } } })).toBeNull();
    expect(parseSiteObservability(null)).toBeNull();
  });

  test("an app on the site reports with the file's settings for its path, over its build variables", async () => {
    const { loads, loader } = fakeAgent();
    const used: unknown[] = [];
    const recording: AgentLoader = async (o) => (used.push(o.config), loader(o));
    expect(startObservability({ app: 'baby', env: { ...ENV, BASE_URL: '/baby/' }, loader: recording, siteConfig: async () => siteFile })).toBeNull();
    await tick();
    expect(loads).toHaveLength(1);
    expect(used[0]).toEqual({ accountId: '1234567', appId: '1000002', browserKey: 'NRJS-example1111111111' });
  });

  test('without an entry, the build variables; with neither, nothing is loaded and the queue is dropped', async () => {
    const one = fakeAgent();
    const used: unknown[] = [];
    startObservability({ app: 'pet', env: { ...ENV, BASE_URL: '/pet/' }, loader: async (o) => (used.push(o.config), one.loader(o)), siteConfig: async () => siteFile });
    await tick();
    expect(used[0]).toEqual(config);
    resetObservability();

    const none = fakeAgent();
    startObservability({ app: 'pet', env: { BASE_URL: '/pet/' }, loader: none.loader, siteConfig: async () => { throw new Error('offline'); } });
    reportError(new Error('queued'));
    await tick();
    await tick();
    expect(none.loads).toHaveLength(0);
    expect(observabilityActive()).toBe(false);
  });

  test('no file is asked for on a blocked page or without a base and variables', () => {
    let asked = 0;
    const siteConfig = async () => (asked++, siteFile);
    expect(startObservability({ app: 'x', env: {}, siteConfig })).toBe('not-configured');
    page({ host: 'localhost', protocol: 'http:' });
    expect(startObservability({ app: 'x', env: { BASE_URL: '/' }, siteConfig })).toBe('host');
    expect(asked).toBe(0);
  });
});
