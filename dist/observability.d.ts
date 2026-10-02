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
 * the apps' own, or builds without the New Relic variables. The portal's /privacy page says this in
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
/** Hosting sites the apps are served from. Anything else (localhost, previews) sends nothing. */
export declare const DEFAULT_HOSTS: RegExp;
/** Why nothing is sent from this page. */
export type ObservabilityBlock = 'not-configured' | 'automation' | 'host';
/** Why nothing would be sent from this page, or null when errors and performance would be. */
export declare function observabilityBlock(config: NewRelicConfig | null, hosts?: RegExp): ObservabilityBlock | null;
/** Whether usage counts may be sent: not when the browser sends Global Privacy Control or Do Not Track. */
export declare function usageAllowed(): boolean;
/** Rules the agent applies to everything it sends (messages, stack traces, page URLs, attributes). */
export declare const OBFUSCATION_RULES: {
    regex: RegExp;
    replacement: string;
}[];
/** A message or URL with emails, query strings, household paths and long numbers taken out. */
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
    /** `import.meta.env`: the New Relic variables, `VITE_APP_VERSION` and `VITE_BUILD_SHA`. */
    env: Record<string, unknown>;
    /** Hostnames allowed to send (default `*.web.app` and `*.firebaseapp.com`). */
    hosts?: RegExp;
    /** Replaces the New Relic loader (tests). */
    loader?: AgentLoader;
}
/** Whether this page sends errors and performance. */
export declare function observabilityActive(): boolean;
/**
 * Starts reporting for this app, once, as early as possible (in `firebase.ts` or `main.tsx`, before
 * rendering). Does nothing when `observabilityBlock` gives a reason; the agent is downloaded only
 * when it will be used.
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
