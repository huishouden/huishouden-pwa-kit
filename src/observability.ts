/**
 * Errors, performance and anonymous usage counts from real visits, sent to New Relic Browser (free
 * tier), so the maintainers hear when something breaks for someone and see which features are used.
 *
 * Always on (where configured): JavaScript errors, failed Firestore or Google calls (`reportError`),
 * page loads and Core Web Vitals. Usage counts: screens and features used (`track`, `trackView`)
 * and a hash of the household id (`householdTag`), skipped silently when the browser sends Global
 * Privacy Control or Do Not Track. Nothing is stored on the device: the agent runs with session
 * tracking off (no cookies, no localStorage id), so every count is per visit and nothing links one
 * visit to the next. Device and browser type and the country and region come from the request; no
 * names, emails, household ids, entries, query strings or precise location are sent (`redact` and
 * the agent's obfuscation rules run over every message, stack trace and URL).
 *
 * Nothing at all is sent from automated browsers (Playwright, CI), local builds, hosts other than
 * the apps' own, or apps the site's `hh-observability.json` (or the New Relic variables) don't
 * configure. The portal's /privacy page says this in
 * plain words.
 */

export interface NewRelicConfig {
  accountId: string;
  /** The browser application's id: one per app, so each has its own error rate. */
  appId: string;
  /** The browser ingest key (`NRJS-…`). Public by design: it can only send data. */
  browserKey: string;
}

/** `VITE_NEWRELIC_ACCOUNT_ID`, `VITE_NEWRELIC_APP_ID`, `VITE_NEWRELIC_BROWSER_KEY`; null when any is missing. */
export function newRelicConfigFromEnv(env: Record<string, unknown>): NewRelicConfig | null {
  const get = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  const accountId = get('VITE_NEWRELIC_ACCOUNT_ID');
  const appId = get('VITE_NEWRELIC_APP_ID');
  const browserKey = get('VITE_NEWRELIC_BROWSER_KEY');
  return accountId && appId && browserKey ? { accountId, appId, browserKey } : null;
}

/**
 * Served at the root of the suite's one site: the browser-agent settings for every app on it, by the
 * app's path. Written by the deploy from the portal's `observability` release asset, which the
 * portal's monitoring workflow publishes (docs/observability.md), so no app needs repo variables
 * and a new app reports from its first deploy. Every value in it is public by design.
 */
export const SITE_OBSERVABILITY = 'hh-observability.json';

export interface SiteObservability {
  accountId: string;
  /** By path (`/`, `/pet/`). */
  apps: Record<string, { appId: string; browserKey: string }>;
}

const DIGITS = /^\d{1,20}$/;
const BROWSER_KEY = /^NRJS-[A-Za-z0-9]{10,64}$/;

/**
 * Checks a `hh-observability.json` and returns it with nothing but the expected fields, or null when
 * anything in it is not an account id, app id or browser key (`NRJS-…`). The check is what keeps a
 * user key (`NRAK-…`) or anything else from ever being published to the site.
 */
export function parseSiteObservability(value: unknown): SiteObservability | null {
  const v = value as { accountId?: unknown; apps?: unknown } | null;
  if (!v || typeof v !== 'object' || typeof v.accountId !== 'string' || !DIGITS.test(v.accountId)) return null;
  if (!v.apps || typeof v.apps !== 'object' || Array.isArray(v.apps)) return null;
  const apps: SiteObservability['apps'] = {};
  for (const [path, entry] of Object.entries(v.apps as Record<string, unknown>)) {
    const e = entry as { appId?: unknown; browserKey?: unknown } | null;
    if (!/^\/(?:[a-z0-9-]+\/)?$/.test(path)) return null;
    if (!e || typeof e.appId !== 'string' || !DIGITS.test(e.appId) || typeof e.browserKey !== 'string' || !BROWSER_KEY.test(e.browserKey)) return null;
    apps[path] = { appId: e.appId, browserKey: e.browserKey };
  }
  return { accountId: v.accountId, apps };
}

/** This app's settings from the site's `hh-observability.json`, by its base (`import.meta.env.BASE_URL`). */
export function newRelicConfigFromSite(file: unknown, base: string): NewRelicConfig | null {
  const parsed = parseSiteObservability(file);
  const entry = parsed?.apps[base];
  return parsed && entry ? { accountId: parsed.accountId, appId: entry.appId, browserKey: entry.browserKey } : null;
}

/** Hosting sites the apps are served from. Anything else (localhost, previews) sends nothing. */
export const DEFAULT_HOSTS = /(^|\.)(web\.app|firebaseapp\.com)$/;

/** Why nothing is sent from this page. */
export type ObservabilityBlock = 'not-configured' | 'automation' | 'host';

interface Env {
  navigator?: { doNotTrack?: string | null; globalPrivacyControl?: boolean; webdriver?: boolean };
  location?: { hostname: string; protocol: string };
}

const env = (): Env => globalThis as unknown as Env;

/** Why nothing would be sent from this page, or null when errors and performance would be. */
export function observabilityBlock(config: NewRelicConfig | null, hosts: RegExp = DEFAULT_HOSTS): ObservabilityBlock | null {
  if (!config) return 'not-configured';
  return pageBlock(hosts);
}

function pageBlock(hosts: RegExp): ObservabilityBlock | null {
  const { navigator: nav, location: loc } = env();
  if (nav?.webdriver) return 'automation';
  if (!loc || loc.protocol !== 'https:' || !hosts.test(loc.hostname)) return 'host';
  return null;
}

/** Fetches the site's `hh-observability.json`; null when there is none or it can't be read. */
export type SiteObservabilityFetch = () => Promise<unknown | null>;

const fetchSiteObservability: SiteObservabilityFetch = async () => {
  const res = await fetch(`/${SITE_OBSERVABILITY}`, { cache: 'no-cache', credentials: 'omit' });
  return res.ok ? res.json() : null;
};

/** Whether usage counts may be sent: not when the browser sends Global Privacy Control or Do Not Track. */
export function usageAllowed(): boolean {
  const nav = env().navigator;
  return !(nav?.globalPrivacyControl === true || nav?.doNotTrack === '1');
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const QUERY = /(https?:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi;
const ID_PATH = /(households|profiles)\/[^/\s"'<>]+/g;
const LONG_NUMBER = /\b\d(?:[ -]?\d){9,}\b/g;

// Words an app has said must never leave the device (Health's medicine and people's names), by the
// key the app set them under.
const sensitive = new Map<string, string[]>();
let sensitivePattern: RegExp | null = null;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A RegExp whose matching follows the current `setSensitiveWords` lists, so the agent's own
 * obfuscation (which reads its rules on every send) takes out words set after it started.
 */
class SensitiveWords extends RegExp {
  constructor() {
    super('(?!)', 'g');
  }
  [Symbol.replace](text: string, replacement: string | ((substring: string, ...args: unknown[]) => string)): string {
    if (!sensitivePattern) return text;
    sensitivePattern.lastIndex = 0;
    return typeof replacement === 'string' ? text.replace(sensitivePattern, replacement) : text.replace(sensitivePattern, replacement);
  }
  test(text: string): boolean {
    if (!sensitivePattern) return false;
    sensitivePattern.lastIndex = 0;
    return sensitivePattern.test(text);
  }
}

const SENSITIVE = new SensitiveWords();

/**
 * Words that must never be sent, whatever carries them (an error message, a stack, an attribute):
 * Health passes its medicine names and the names of the people it looks after, and calls it again
 * when they change. Each app's list is kept under its own `key`; an empty list clears it. Matching
 * ignores case; words shorter than three characters are left alone (they would blank out ordinary
 * text). Replaced with `[redacted]`.
 */
export function setSensitiveWords(key: string, words: readonly string[]): void {
  const clean = [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 3))];
  if (clean.length) sensitive.set(key, clean);
  else sensitive.delete(key);
  const all = [...new Set([...sensitive.values()].flat())].sort((a, b) => b.length - a.length);
  sensitivePattern = all.length ? new RegExp(all.map(escapeRegExp).join('|'), 'gi') : null;
}

/** Whether `text` holds one of the words set with `setSensitiveWords`. */
export function hasSensitiveWords(text: string): boolean {
  return SENSITIVE.test(text);
}

/** Rules the agent applies to everything it sends (messages, stack traces, page URLs, attributes). */
export const OBFUSCATION_RULES = [
  { regex: EMAIL, replacement: '[email]' },
  { regex: QUERY, replacement: '$1' },
  { regex: ID_PATH, replacement: '$1/[id]' },
  { regex: LONG_NUMBER, replacement: '[number]' },
  { regex: SENSITIVE as RegExp, replacement: '[redacted]' },
];

/** A message or URL with emails, query strings, household paths, long numbers and sensitive words taken out. */
export function redact(text: string, max = 300): string {
  return OBFUSCATION_RULES.reduce((s, r) => s.replace(r.regex, r.replacement), text).slice(0, max);
}

/** A stable, anonymous tag for a household: the first 16 hex digits of SHA-256 over its id. */
export async function householdTag(householdId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`huishouden-household:${householdId}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The part of the New Relic agent this module uses. */
export interface BrowserAgent {
  noticeError(error: Error | string, attributes?: object): unknown;
  addPageAction(name: string, attributes?: object): unknown;
  setCustomAttribute(name: string, value: string | number | boolean | null, persist?: boolean): unknown;
  setApplicationVersion(value: string | null): unknown;
  setErrorHandler(callback: (error: Error | string) => boolean): unknown;
}

export type AgentLoader = (options: { config: NewRelicConfig; init: object; usage: boolean }) => Promise<BrowserAgent>;

async function loadNewRelic({ config, init, usage }: { config: NewRelicConfig; init: object; usage: boolean }): Promise<BrowserAgent> {
  const [{ Agent }, { JSErrors }, { PageViewEvent }, { PageViewTiming }, { GenericEvents }] = await Promise.all([
    import('@newrelic/browser-agent/loaders/agent'),
    import('@newrelic/browser-agent/features/jserrors'),
    import('@newrelic/browser-agent/features/page_view_event'),
    import('@newrelic/browser-agent/features/page_view_timing'),
    import('@newrelic/browser-agent/features/generic_events'),
  ]);
  return new Agent({
    features: usage ? [JSErrors, PageViewEvent, PageViewTiming, GenericEvents] : [JSErrors, PageViewEvent, PageViewTiming],
    info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', licenseKey: config.browserKey, applicationID: config.appId, sa: 1 },
    loader_config: { accountID: config.accountId, trustKey: config.accountId, agentID: config.appId, licenseKey: config.browserKey, applicationID: config.appId },
    init,
  }) as unknown as BrowserAgent;
}

/**
 * Agent settings. `privacy.cookies_enabled: false` turns session tracking off: no cookie and no
 * localStorage id, so nothing identifies a device between visits and no consent banner is needed.
 * Replay, traces, AJAX URLs and click tracking are off.
 */
export const AGENT_INIT = {
  obfuscate: OBFUSCATION_RULES,
  privacy: { cookies_enabled: false },
  ajax: { enabled: false, autoStart: false },
  session_replay: { enabled: false },
  session_trace: { enabled: false },
  soft_navigations: { enabled: false },
  user_actions: { enabled: false },
  performance: { capture_marks: false, capture_measures: false },
  distributed_tracing: { enabled: false },
  logging: { enabled: false },
};

export interface ObservabilityOptions {
  /** The app's short name (`baby`, `portal`), the `app` attribute on everything sent. */
  app: string;
  /**
   * `import.meta.env`: `BASE_URL` (the app's path, to find it in the site's `hh-observability.json`),
   * `VITE_APP_VERSION`, `VITE_BUILD_SHA`, and the `VITE_NEWRELIC_*` variables for builds served
   * without the file (a site of their own).
   */
  env: Record<string, unknown>;
  /** Hostnames allowed to send (default `*.web.app` and `*.firebaseapp.com`). */
  hosts?: RegExp;
  /** Replaces the New Relic loader (tests). */
  loader?: AgentLoader;
  /** Replaces the request for the site's `hh-observability.json` (tests). */
  siteConfig?: SiteObservabilityFetch;
}

type Queued = { kind: 'error'; error: Error | string; attrs: Record<string, unknown> } | { kind: 'action'; name: string; attrs: Record<string, unknown> };

const MAX_QUEUED = 30;
const MAX_ERRORS_PER_PAGE = 50;
const REPEAT_MS = 60_000;

let state: {
  agent: BrowserAgent | null;
  queue: Queued[];
  usage: boolean;
  household: string | null;
  errorsSent: number;
  recent: Map<string, number>;
} | null = null;

/** Whether this page sends errors and performance. */
export function observabilityActive(): boolean {
  return state !== null;
}

function deliver(item: Queued) {
  if (!state) return;
  if (!state.agent) {
    if (state.queue.length < MAX_QUEUED) state.queue.push(item);
    return;
  }
  if (item.kind === 'error') state.agent.noticeError(redactedError(item.error), item.attrs);
  else state.agent.addPageAction(item.name, item.attrs);
}

const IGNORED_ERRORS = [/ResizeObserver loop/, /^Script error\.?$/, /chrome-extension:|moz-extension:|safari-extension:/];

/**
 * Starts reporting for this app, once, as early as possible (in `firebase.ts` or `main.tsx`, before
 * rendering). Does nothing on pages `observabilityBlock` rules out (automated browsers, other
 * hosts). Otherwise the settings come from the site's `hh-observability.json` (the entry for
 * `env.BASE_URL`), else from the `VITE_NEWRELIC_*` variables; with neither, nothing is sent and
 * anything queued meanwhile is dropped. The agent is downloaded only when it will be used.
 */
export function startObservability(options: ObservabilityOptions): ObservabilityBlock | null {
  if (state) return null;
  const fromEnv = newRelicConfigFromEnv(options.env);
  const base = typeof options.env.BASE_URL === 'string' && options.env.BASE_URL.startsWith('/') ? options.env.BASE_URL : '';
  if (!fromEnv && !base) return 'not-configured';
  const block = pageBlock(options.hosts ?? DEFAULT_HOSTS);
  if (block) return block;
  const usage = usageAllowed();
  state = { agent: null, queue: [], usage, household: null, errorsSent: 0, recent: new Map() };

  // Errors thrown while the agent downloads; it catches everything after that itself.
  const early = (e: ErrorEvent | PromiseRejectionEvent) =>
    deliver({ kind: 'error', error: 'reason' in e ? toError(e.reason) : (e.error ?? e.message), attrs: { source: 'early' } });
  const w = globalThis as unknown as { addEventListener?: typeof addEventListener; removeEventListener?: typeof removeEventListener };
  w.addEventListener?.('error', early as EventListener);
  w.addEventListener?.('unhandledrejection', early as EventListener);

  const version = typeof options.env.VITE_APP_VERSION === 'string' ? options.env.VITE_APP_VERSION : null;
  const sha = typeof options.env.VITE_BUILD_SHA === 'string' ? options.env.VITE_BUILD_SHA : '';
  const started = state;
  const siteConfig = base ? (options.siteConfig ?? fetchSiteObservability)().catch(() => null) : Promise.resolve(null);
  siteConfig
    .then((file) => {
      const config = (file ? newRelicConfigFromSite(file, base) : null) ?? fromEnv;
      if (!config) throw new Error('not configured');
      if (state !== started) throw new Error('reset');
      return (options.loader ?? loadNewRelic)({ config, init: AGENT_INIT, usage });
    })
    .then((agent) => {
      w.removeEventListener?.('error', early as EventListener);
      w.removeEventListener?.('unhandledrejection', early as EventListener);
      if (state !== started || !state) return;
      agent.setApplicationVersion(version);
      agent.setCustomAttribute('app', options.app);
      if (sha) agent.setCustomAttribute('buildSha', sha);
      agent.setErrorHandler((e) => {
        const text = typeof e === 'string' ? e : `${e?.message ?? ''} ${e?.stack ?? ''}`;
        if (IGNORED_ERRORS.some((r) => r.test(text))) return true;
        // An uncaught error naming a sensitive word is dropped and sent again with the words taken
        // out, whatever the agent's own obfuscation does with it.
        if (hasSensitiveWords(text)) {
          agent.noticeError(redactedError(e), { source: 'redacted' });
          return true;
        }
        return false;
      });
      if (state.household) agent.setCustomAttribute('household', state.household);
      state.agent = agent;
      const queued = state.queue;
      state.queue = [];
      queued.forEach(deliver);
    })
    .catch(() => {
      // Not configured, an ad blocker or no network: the app works the same without reports.
      w.removeEventListener?.('error', early as EventListener);
      w.removeEventListener?.('unhandledrejection', early as EventListener);
      if (state === started) state = null;
    });
  return null;
}

/**
 * Tags this visit's usage counts with the household's hash, so active households can be counted
 * without knowing which. `saveMyProfile` calls it; skipped under Global Privacy Control.
 */
export async function observeHousehold(householdId: string): Promise<void> {
  if (!state?.usage || !householdId) return;
  const tag = await householdTag(householdId);
  if (!state) return;
  state.household = tag;
  state.agent?.setCustomAttribute('household', tag);
}

function toError(e: unknown): Error | string {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return e;
  const m = (e as { message?: unknown })?.message;
  return typeof m === 'string' ? m : 'Unknown error';
}

/** A copy of an error with its message and stack passed through `redact`. */
function redactedError(e: Error | string): Error | string {
  if (typeof e === 'string') return redact(e);
  return Object.assign(new Error(redact(e.message ?? '')), { name: e.name, stack: e.stack ? redact(e.stack, 4000) : undefined });
}

type Attrs = Record<string, string | number | boolean | undefined | null>;

function cleanAttrs(attrs: Attrs): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs).slice(0, 20)) {
    if (v === undefined || v === null) continue;
    out[k.slice(0, 40)] = typeof v === 'string' ? redact(v, 120) : v;
  }
  return out;
}

/**
 * Reports a failure the app handled (a save that failed, a Google call that answered an error),
 * which the agent cannot see by itself. `context.where` names the action ("save feed"). Firestore's
 * and Google's codes are kept; messages are redacted. The same failure is sent once a minute at most.
 */
export function reportError(e: unknown, context: Attrs = {}): void {
  if (!state) return;
  const error = toError(e);
  const message = redact(typeof error === 'string' ? error : error.message);
  const code = (e as { code?: unknown })?.code;
  const status = (e as { status?: unknown })?.status;
  const key = `${message}|${context.where ?? ''}`;
  const now = Date.now();
  if ((state.recent.get(key) ?? 0) > now - REPEAT_MS || state.errorsSent >= MAX_ERRORS_PER_PAGE) return;
  state.recent.set(key, now);
  state.errorsSent++;
  const attrs = cleanAttrs({ ...context, handled: true, ...(typeof code === 'string' ? { code } : {}), ...(typeof status === 'number' ? { status } : {}) });
  const sent = typeof error === 'string' ? message : Object.assign(new Error(message), { name: error.name, stack: error.stack ? redact(error.stack, 4000) : undefined });
  deliver({ kind: 'error', error: sent, attrs });
}

/**
 * Counts a feature being used ("log feed", "check email"). Name the action, not the data: attributes
 * are for small facts like `{ kind: 'bottle' }` or `{ count: 3 }`, never names or free text.
 */
export function track(action: string, attrs: Attrs = {}): void {
  if (!state?.usage) return;
  deliver({ kind: 'action', name: redact(action, 60), attrs: cleanAttrs(attrs) });
}

/** Counts a screen or tab being shown, and labels later errors with it. */
export function trackView(view: string): void {
  if (!state) return;
  state.agent?.setCustomAttribute('view', redact(view, 40));
  track('view', { view });
}

/** For tests: forget everything started. */
export function resetObservability(): void {
  state = null;
}
