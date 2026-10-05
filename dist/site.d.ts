/**
 * The suite's one site (docs/one-site.md): every app under its own path on one Firebase Hosting
 * site, assembled from each app's latest build. This module is the pure part: the registry, the
 * combined `firebase.json`, the redirects that replace the old per-app sites and the manifest of
 * what a deploy holds. `pwa-site` (scripts/site.ts) does the downloading, packing and deploying.
 *
 * In an app, only `appUrl` is for the browser.
 */
import { type DeviceFeatures } from './security-headers.js';
export { SUITE_SITE, SUITE_HOST, SUITE_ORIGIN } from './suite.js';
/** One entry of the portal's `apps.json`, the suite's list of apps. */
export interface RegistryEntry {
    name?: string;
    repo: string;
    /**
     * The app's own Firebase Hosting site: its old address, and its staging site's name. The
     * portal's is the suite's former address (the project's default site); the suite itself is
     * served from `SUITE_SITE`.
     */
    site: string;
    /** Where it is served on the shared site: `/` for the portal, `/<app>/` for an app. Missing: not on it yet. */
    path?: string;
    /** The old `<site>.web.app` redirects to the app's path on the shared site (the portal's: to its root). */
    redirect?: boolean;
    [key: string]: unknown;
}
/** `pet`, `/pet` or `/pet/` as `/pet/`; empty as `/`. */
export declare function normalizePath(path: string): string;
/**
 * An absolute link into this app, for anything that leaves the page (agenda items, reminders,
 * invitations): `appUrl(import.meta.env.BASE_URL, '?tab=care')`. The origin is the page's, so a
 * staging build links to staging. `origin` is for code that runs without a page (tests, scripts).
 * The household rules accept only https links on agenda items and reminders, so a page served over
 * http (a local dev or emulator server) should pass the production origin instead.
 */
export declare function appUrl(base: string, path?: string, origin?: string): string;
/** Checks the registry and returns the apps on the shared site, the portal (`/`) first. */
export declare function siteApps(registry: unknown): (RegistryEntry & {
    path: string;
})[];
/** The shared site's Firebase Hosting name, `SUITE_SITE`, once the registry checks out. */
export declare function sharedSite(registry: unknown): string;
/** An absolute link into an app on the production suite site: `suiteUrl('/pet/', '?tab=care')`. For code with no page (tests, scripts, Workers). */
export declare function suiteUrl(base: string, path?: string): string;
/** Old sites that redirect to the suite: each app's, and the portal's (the suite's former address). */
export declare function redirectingSites(registry: unknown): (RegistryEntry & {
    path: string;
})[];
/** Which device features a `Permissions-Policy` value turns on. */
export declare function featuresOf(policy: string | undefined): DeviceFeatures;
/** Files that must be fetched fresh for an update to reach a device. */
export declare const FRESH_FILES: string[];
export interface HostingSite {
    site: string;
    public: string;
    ignore?: string[];
    redirects?: {
        source?: string;
        regex?: string;
        destination: string;
        type: number;
    }[];
    rewrites?: {
        source: string;
        destination: string;
    }[];
    headers?: {
        source?: string;
        regex?: string;
        headers: {
            key: string;
            value: string;
        }[];
    }[];
}
/** One app in a deploy: its path and the device features its own firebase.json turns on. */
export interface SiteEntry {
    path: string;
    features?: DeviceFeatures;
}
/**
 * The shared site's hosting config: `/<app>` → `/<app>/`, each app's routes to its own
 * `index.html`, everything else to the portal's; Firebase's `/__/` untouched. `entries` are the
 * apps this deploy holds (others fall to the portal until they publish a build).
 *
 * `Permissions-Policy` applies to the document it comes with, so each app's pages get only the
 * features that app turns on (a later header rule overrides an earlier one on Hosting): Car's
 * camera is not Tasks' camera.
 */
export declare function siteConfig(site: string, entries: SiteEntry[], publicDir?: string): HostingSite;
/**
 * Every path but `/sw.js`, with the rest of the path captured as `rest`. Firebase checks redirects
 * before files, and RE2 has no lookahead, so the exception is spelled out.
 */
export declare const REDIRECT_ALL_BUT_WORKER = "^/(?P<rest>(?:[^s]|s[^w]|sw[^.]|sw\\.[^j]|sw\\.j[^s]|sw\\.js.).*|s|sw|sw\\.|sw\\.j)?$";
/**
 * An RE2 pattern (no anchors) for every string except those in `except`, which must be non-empty
 * strings. RE2 has no lookahead, so the complement is spelled out along a trie of the exceptions.
 */
export declare function allBut(except: string[]): string;
/**
 * The hosting config of an old site: everything 301s to `target` (`https://<shared>/pet/`), query
 * kept by Hosting, except the workers in `workers` (paths under the site's root, default `sw.js`),
 * which it serves from `publicDir`: the retiring worker, so an installed copy leaves its cache.
 */
export declare function redirectConfig(site: string, target: string, publicDir: string, workers?: string[]): HostingSite;
/** The workers an old site retires: the portal's former address held every app's, an app's site only its own. */
export declare function retiringWorkers(app: {
    path: string;
}, apps: {
    path: string;
}[]): string[];
/** Marks the retiring worker, so a check can tell it is the one being served. */
export declare const RETIRED_WORKER_MARK = "huishouden: this address moved";
/**
 * Served as `/sw.js` on an old site. A device that installed the app there runs the old worker,
 * which answers every launch from its precache and so never sees the redirect. Its next update
 * check fetches this instead: it clears the caches, unregisters itself and reloads the open
 * windows, which then reach the redirect.
 */
export declare function retiredWorkerSource(): string;
/** Written at the site's root: which build of each app a deploy holds. */
export declare const SITE_MANIFEST = "hh-site.json";
/** Written into each packed build. */
export declare const BUILD_STAMP = "hh-build.json";
export interface BuildStamp {
    repo: string;
    path: string;
    sha: string;
    version: string;
    builtAt: string;
    /** The app's own `Permissions-Policy` (from its firebase.json), for the site's union. */
    permissionsPolicy?: string;
}
export interface SiteManifest {
    site: string;
    flavor: 'production' | 'staging';
    deployedAt: string;
    /** By path: the release asset each app's files came from (`null`: this run's own build). */
    apps: Record<string, {
        repo: string;
        asset: number | null;
        sha?: string;
        version?: string;
    }>;
    /** The portal's `observability.json` release asset behind `/hh-observability.json` (production only). */
    observability?: number | null;
    /** Where this deploy's pages load their hashed assets from (./asset-cdn); null: the site itself. */
    assetOrigin?: string | null;
    /**
     * Apps whose pages load the site's own assets although `assetOrigin` is set: their build was
     * new to the CDN and this deploy, without the Cloudflare token, could not upload it. The next
     * deploy with the token (the portal's) puts them on the CDN.
     */
    offCdn?: string[];
}
/** Paths whose published build differs from what `manifest` holds (a newer one, or one it lacks). */
export declare function staleApps(manifest: SiteManifest | null, latest: Record<string, number | null>): string[];
/**
 * Why the live site's asset CDN is not as this run would deploy it, or null: a different origin
 * (on, off, the other flavor), or, for a run that can upload (`canUpload`, the portal's, with the
 * Cloudflare token), apps whose build the CDN does not hold yet (`offCdn`). A run without the token
 * (`--cdn-held`) leaves those to the portal, so for it they are not stale.
 */
export declare function staleCdn(manifest: SiteManifest | null, wantOrigin: string | null, canUpload: boolean): string | null;
/** Whether the published observability settings (`latest`, an asset id) differ from what `manifest` holds. */
export declare function staleObservability(manifest: SiteManifest | null, latest: number | null): boolean;
