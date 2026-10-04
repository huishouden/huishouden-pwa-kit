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
export declare function newRelicConfigFromEnv(env: Record<string, unknown>): NewRelicConfig | null;
/**
 * Served at the root of the suite's one site: the browser-agent settings for every app on it, by the
 * app's path. Written by the deploy from the portal's `observability` release asset, which the
 * portal's monitoring workflow publishes (docs/observability.md), so no app needs repo variables
 * and a new app reports from its first deploy. Every value in it is public by design.
 */
export declare const SITE_OBSERVABILITY = "hh-observability.json";
export interface SiteObservability {
    accountId: string;
    /** By path (`/`, `/pet/`). */
    apps: Record<string, {
        appId: string;
        browserKey: string;
    }>;
}
/**
 * Checks a `hh-observability.json` and returns it with nothing but the expected fields, or null when
 * anything in it is not an account id, app id or browser key (`NRJS-…`). The check is what keeps a
 * user key (`NRAK-…`) or anything else from ever being published to the site.
 */
export declare function parseSiteObservability(value: unknown): SiteObservability | null;
/** This app's settings from the site's `hh-observability.json`, by its base (`import.meta.env.BASE_URL`). */
export declare function newRelicConfigFromSite(file: unknown, base: string): NewRelicConfig | null;
/** Hosting sites the apps are served from. Anything else (localhost, previews) sends nothing. */
export declare const DEFAULT_HOSTS: RegExp;
/** Why nothing is sent from this page. */
export type ObservabilityBlock = 'not-configured' | 'automation' | 'host';
/** Why nothing would be sent from this page, or null when errors and performance would be. */
export declare function observabilityBlock(config: NewRelicConfig | null, hosts?: RegExp): ObservabilityBlock | null;
/** Fetches the site's `hh-observability.json`; null when there is none or it can't be read. */
export type SiteObservabilityFetch = () => Promise<unknown | null>;
/** Whether usage counts may be sent: not when the browser sends Global Privacy Control or Do Not Track. */
export declare function usageAllowed(): boolean;
/**
 * Words that must never be sent, whatever carries them (an error message, a stack, an attribute):
 * Health passes its medicine names and the names of the people it looks after, and calls it again
 * when they change. Each app's list is kept under its own `key`; an empty list clears it. Matching
 * ignores case; words shorter than three characters are left alone (they would blank out ordinary
 * text). Replaced with `[redacted]`.
 */
export declare function setSensitiveWords(key: string, words: readonly string[]): void;
/** Whether `text` holds one of the words set with `setSensitiveWords`. */
export declare function hasSensitiveWords(text: string): boolean;
/** Rules the agent applies to everything it sends (messages, stack traces, page URLs, attributes). */
export declare const OBFUSCATION_RULES: {
    regex: RegExp;
    replacement: string;
}[];
/** A message or URL with emails, query strings, household paths, long numbers and sensitive words taken out. */
export declare function redact(text: string, max?: number): string;
/** A stable, anonymous tag for a household: the first 16 hex digits of SHA-256 over its id. */
export declare function householdTag(householdId: string): Promise<string>;
/** The part of the New Relic agent this module uses. */
export interface BrowserAgent {
    noticeError(error: Error | string, attributes?: object): unknown;
    addPageAction(name: string, attributes?: object): unknown;
    setCustomAttribute(name: string, value: string | number | boolean | null, persist?: boolean): unknown;
    setApplicationVersion(value: string | null): unknown;
    setErrorHandler(callback: (error: Error | string) => boolean): unknown;
}
export type AgentLoader = (options: {
    config: NewRelicConfig;
    init: object;
    usage: boolean;
}) => Promise<BrowserAgent>;
/**
 * Agent settings. `privacy.cookies_enabled: false` turns session tracking off: no cookie and no
 * localStorage id, so nothing identifies a device between visits and no consent banner is needed.
 * Replay, traces, AJAX URLs and click tracking are off.
 */
export declare const AGENT_INIT: {
    obfuscate: {
        regex: RegExp;
        replacement: string;
    }[];
    privacy: {
        cookies_enabled: boolean;
    };
    ajax: {
        enabled: boolean;
        autoStart: boolean;
    };
    session_replay: {
        enabled: boolean;
    };
    session_trace: {
        enabled: boolean;
    };
    soft_navigations: {
        enabled: boolean;
    };
    user_actions: {
        enabled: boolean;
    };
    performance: {
        capture_marks: boolean;
        capture_measures: boolean;
    };
    distributed_tracing: {
        enabled: boolean;
    };
    logging: {
        enabled: boolean;
    };
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
/** Whether this page sends errors and performance. */
export declare function observabilityActive(): boolean;
/**
 * Starts reporting for this app, once, as early as possible (in `firebase.ts` or `main.tsx`, before
 * rendering). Does nothing on pages `observabilityBlock` rules out (automated browsers, other
 * hosts). Otherwise the settings come from the site's `hh-observability.json` (the entry for
 * `env.BASE_URL`), else from the `VITE_NEWRELIC_*` variables; with neither, nothing is sent and
 * anything queued meanwhile is dropped. The agent is downloaded only when it will be used.
 */
export declare function startObservability(options: ObservabilityOptions): ObservabilityBlock | null;
/**
 * Tags this visit's usage counts with the household's hash, so active households can be counted
 * without knowing which. `saveMyProfile` calls it; skipped under Global Privacy Control.
 */
export declare function observeHousehold(householdId: string): Promise<void>;
type Attrs = Record<string, string | number | boolean | undefined | null>;
/**
 * Reports a failure the app handled (a save that failed, a Google call that answered an error),
 * which the agent cannot see by itself. `context.where` names the action ("save feed"). Firestore's
 * and Google's codes are kept; messages are redacted. The same failure is sent once a minute at most.
 */
export declare function reportError(e: unknown, context?: Attrs): void;
/**
 * Counts a feature being used ("log feed", "check email"). Name the action, not the data: attributes
 * are for small facts like `{ kind: 'bottle' }` or `{ count: 3 }`, never names or free text.
 */
export declare function track(action: string, attrs?: Attrs): void;
/** Counts a screen or tab being shown, and labels later errors with it. */
export declare function trackView(view: string): void;
/** For tests: forget everything started. */
export declare function resetObservability(): void;
export {};
