/**
 * The asset CDN (docs/one-site.md "Asset CDN"): the suite's hashed build files (`<base>assets/*`:
 * JS, CSS, fonts, wasm, imported images) are served from a Cloudflare Worker with static assets
 * instead of Firebase Hosting, whose free plan has 10 GB of transfer a month for the whole suite.
 * Cloudflare serves static assets free and without a request limit. HTML, `sw.js`, the web
 * manifest and icons stay on Firebase, so the app's address, service worker scope and install
 * identity do not change; Firebase keeps a copy of every asset too, which the page falls back to.
 *
 * This module is the pure part: the CDN's addresses, its `_headers`, the Worker's config, which
 * earlier files a deploy keeps, and the page's fallback script. `pwa-site cdn` builds the upload
 * and the reusable workflow deploys it with wrangler, before Firebase deploys the HTML.
 */
export type Flavor = 'production' | 'staging';
/** The Worker that serves each flavor's assets (Workers static assets, no script). */
export declare const ASSET_WORKERS: Record<Flavor, string>;
/** The account's workers.dev subdomain, shared with the connector and calendar Workers. */
export declare const WORKERS_SUBDOMAIN = "huishouden-app.workers.dev";
/** `https://<worker>.<WORKERS_SUBDOMAIN>`: where each flavor's built pages load their assets from. */
export declare const ASSET_ORIGINS: Record<Flavor, string>;
/**
 * Who may read the assets with CORS (module scripts and the service worker's precache fetch with
 * CORS). Production: the suite's site only (`SUITE_ORIGIN`); a page opened at the project's
 * firebaseapp.com host fails CORS and falls back to the site's own assets. Staging has a site per
 * app plus the suite's, and local previews, and one header value can't list several origins, so any.
 */
export declare const ASSET_CORS_ORIGINS: Record<Flavor, string>;
/** Written at the CDN's root: every file it serves and when each was last part of a live build. */
export declare const ASSET_MANIFEST = "hh-assets.json";
/**
 * How long a file stays on the CDN after the last deploy that held it: a page loaded before an
 * update still finds its lazily loaded chunks, and a service worker that was installing its
 * precache finishes. Firebase keeps no history at all, so this is more than before.
 */
export declare const ASSET_RETENTION_DAYS = 30;
/** Workers static assets on the free plan: at most 20,000 files per version. Kept below with room to spare. */
export declare const ASSET_FILE_LIMIT = 18000;
export interface AssetManifest {
    flavor: Flavor;
    deployedAt: string;
    /** By path (`/spending/assets/index-abc.js`): when it was last part of a live build. */
    files: Record<string, {
        last: string;
    }>;
}
/** Whether `path` (from the site's root) is one the CDN serves: a file in `/assets/` or `/<app>/assets/`. */
export declare function isCdnAsset(path: string): boolean;
/**
 * The next manifest and which earlier files to carry over: every file of this deploy (`live`)
 * marked as seen now, plus earlier files last seen within the retention period, newest first, up to
 * the file limit. `previous` is the CDN's current manifest (null on the first deploy).
 */
export declare function retainAssets(previous: AssetManifest | null, live: string[], flavor: Flavor, now: Date, retentionDays?: number, limit?: number): {
    manifest: AssetManifest;
    carried: string[];
};
/** Parses a manifest fetched from the CDN; null for anything that isn't one. */
export declare function parseAssetManifest(json: unknown): AssetManifest | null;
/**
 * The CDN's `_headers` (Workers static assets): CORS for the site, a year's immutable caching for
 * the hashed files, readable cross-origin, never sniffed. The manifest is revalidated every time.
 * Content-Type comes from the file's extension.
 */
export declare function cdnHeaders(flavor: Flavor): string;
/** The Worker's wrangler.toml: static assets only, no script, on workers.dev; a missing file is a 404. */
export declare function cdnWranglerConfig(flavor: Flavor, directory?: string, compatibilityDate?: string): string;
/** Files of a built site that name the CDN and are served by Firebase: pages, service workers and their helpers (never the hashed assets). */
export declare function namesCdn(path: string): boolean;
/**
 * The site's files with the CDN turned off: every CDN address removed, so pages and the service
 * worker load the same files from the site's own `/<app>/assets/` (Firebase holds a copy of every
 * asset). The rollback, and what a deploy without the Cloudflare token serves.
 */
export declare function stripCdn(text: string): string;
/**
 * The connection hints for the CDN, right after the fallback script: the browser opens the TLS
 * connection (with CORS credentials mode, as the module scripts use) while it parses the page.
 */
export declare function cdnHints(origin: string): string;
/**
 * What the assembler does to the site's pages for `origin` (null: the CDN off): with the CDN on,
 * checks every page and worker names at most that origin and writes `index.site.html` (the
 * fallback, `stripCdn`) beside each index.html that names it; off, strips the CDN from every file
 * that names it. `files` are the site's files that `namesCdn` picks, by path from the site's root.
 * `offCdn` (with an origin): files whose app's assets the CDN does not hold yet (`appsOffCdn`),
 * stripped as if the CDN were off for that app alone.
 */
export declare function planAssetOrigin(files: {
    path: string;
    text: string;
}[], origin: string | null, offCdn?: (path: string) => boolean): {
    writes: {
        path: string;
        text: string;
    }[];
    naming: number;
    error?: string;
};
/** `planAssetOrigin`'s `offCdn` for the apps `offApps` (of `appPaths`): whether a file is in one of their folders. */
export declare function offCdnPredicate(offApps: string[], appPaths: string[]): (path: string) => boolean;
/**
 * The apps (of `appPaths`) with an asset the live CDN (`live`, its manifest; null: none yet) does
 * not hold. A deploy without the Cloudflare token can't upload them, so their pages load the
 * site's own copy until a deploy with the token (the portal's) puts them on the CDN; every other
 * app keeps the CDN, so no page ever names a file the CDN lacks.
 */
export declare function appsOffCdn(assets: string[], appPaths: string[], live: AssetManifest | null): string[];
/** The asset origin a built file names, if any. */
export declare function cdnOriginIn(text: string): string | null;
/** The site's own copy of each app's page with the CDN removed (`stripCdn`), next to its index.html. */
export declare const SITE_PAGE = "index.site.html";
/**
 * The page's fallback, inline first in <head>. When a script or stylesheet from the CDN fails to
 * load, or a CDN script fails to parse before the page has loaded (the CDN's Brotli reaching a
 * client that didn't ask for it, through a proxy that rewrote Accept-Encoding), the page is
 * replaced once by `<base>index.site.html`, the same page naming the site's own assets, with the
 * address kept in the fragment. That page (origin empty) only puts the address back, before the
 * app reads it. The service worker leaves index.site.html to the network.
 */
export declare function cdnFallbackScript(origin: string, sitePage: string): string;
