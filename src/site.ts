/**
 * The suite's one site (docs/one-site.md): every app under its own path on one Firebase Hosting
 * site, assembled from each app's latest build. This module is the pure part: the registry, the
 * combined `firebase.json`, the redirects that replace the old per-app sites and the manifest of
 * what a deploy holds. `pwa-site` (scripts/site.ts) does the downloading, packing and deploying.
 *
 * In an app, only `appUrl` is for the browser.
 */
import { APP_PATHS_REGEX, permissionsPolicy, securityHeaders, type DeviceFeatures } from './security-headers.js';

/** One entry of the portal's `apps.json`, the suite's list of apps. */
export interface RegistryEntry {
  name?: string;
  repo: string;
  /** The app's own Firebase Hosting site: the old address, and its staging site's name. The portal's is the shared site. */
  site: string;
  /** Where it is served on the shared site: `/` for the portal, `/<app>/` for an app. Missing: not on it yet. */
  path?: string;
  /** The old `<site>.web.app` redirects to the app's path on the shared site. */
  redirect?: boolean;
  [key: string]: unknown;
}

/** `pet`, `/pet` or `/pet/` as `/pet/`; empty as `/`. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/**
 * An absolute link into this app, for anything that leaves the page (agenda items, reminders,
 * invitations): `appUrl(import.meta.env.BASE_URL, '?tab=care')`. The origin is the page's, so a
 * staging build links to staging. `origin` is for code that runs without a page (tests, scripts).
 * The household rules accept only https links on agenda items and reminders, so a page served over
 * http (a local dev or emulator server) should pass the production origin instead.
 */
export function appUrl(base: string, path = '', origin: string = globalThis.location?.origin ?? ''): string {
  if (!origin) throw new Error('appUrl needs an origin outside a browser');
  return new URL(path.replace(/^\/+/, ''), new URL(normalizePath(base), origin)).href;
}

/** Checks the registry and returns the apps on the shared site, the portal (`/`) first. */
export function siteApps(registry: unknown): (RegistryEntry & { path: string })[] {
  if (!Array.isArray(registry)) throw new Error('apps.json must be a list');
  const apps = (registry as RegistryEntry[])
    .filter((e) => e && typeof e.path === 'string')
    .map((e) => {
      if (typeof e.repo !== 'string' || !/^[A-Za-z0-9._-]+$/.test(e.repo)) throw new Error(`apps.json: bad repo ${JSON.stringify(e.repo)}`);
      if (typeof e.site !== 'string' || !/^[a-z0-9-]+$/.test(e.site)) throw new Error(`apps.json: bad site for ${e.repo}`);
      const path = normalizePath(e.path!);
      if (path === '/__/') throw new Error("apps.json: /__/ is Firebase's");
      if (!/^\/(?:[a-z0-9-]+\/)?$/.test(path)) throw new Error(`apps.json: ${e.repo}'s path ${e.path} must be / or one lowercase folder`);
      return { ...e, path };
    });
  const seen = new Set<string>();
  for (const a of apps) {
    if (seen.has(a.path)) throw new Error(`apps.json: two apps at ${a.path}`);
    seen.add(a.path);
  }
  const roots = apps.filter((a) => a.path === '/');
  if (roots.length !== 1) throw new Error('apps.json: exactly one entry (the portal) must have path "/"');
  return [...roots, ...apps.filter((a) => a.path !== '/')];
}

/** The shared site's Firebase Hosting name: the portal's site. */
export function sharedSite(registry: unknown): string {
  return siteApps(registry)[0].site;
}

/** Which device features a `Permissions-Policy` value turns on. */
export function featuresOf(policy: string | undefined): DeviceFeatures {
  const on = (name: string) => new RegExp(`(?:^|,)\\s*${name}=\\(\\s*self\\s*\\)`).test(policy ?? '');
  return { camera: on('camera'), geolocation: on('geolocation') };
}


const NO_CACHE = [{ key: 'Cache-Control', value: 'no-cache' }];
const IMMUTABLE = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
/** Files that must be fetched fresh for an update to reach a device. */
export const FRESH_FILES = ['sw.js', 'registerSW.js', 'hh-push-sw.js', 'hh-share-sw.js', 'index.html', 'manifest.webmanifest', 'manifest.json'];

export interface HostingSite {
  site: string;
  public: string;
  ignore?: string[];
  redirects?: { source?: string; regex?: string; destination: string; type: number }[];
  rewrites?: { source: string; destination: string }[];
  headers?: { source?: string; regex?: string; headers: { key: string; value: string }[] }[];
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
export function siteConfig(site: string, entries: SiteEntry[], publicDir = 'public'): HostingSite {
  const byPath = new Map(entries.map((e) => [normalizePath(e.path), e.features ?? {}]));
  const apps = [...byPath.keys()].filter((p) => p !== '/').sort();
  const bases = ['/', ...apps];
  return {
    site,
    public: publicDir,
    ignore: ['firebase.json', '**/.*'],
    // An exact regex: Hosting's glob `/pet` also matches `/pet/`, which would redirect to itself.
    redirects: apps.map((p) => ({ regex: `^${p.slice(0, -1)}$`, destination: p, type: 301 })),
    rewrites: [...apps.map((p) => ({ source: `${p}**`, destination: `${p}index.html` })), { source: '**', destination: '/index.html' }],
    headers: [
      { regex: APP_PATHS_REGEX, headers: securityHeaders(byPath.get('/') ?? {}) },
      ...apps.map((p) => ({ source: `${p}**`, headers: [{ key: 'Permissions-Policy', value: permissionsPolicy(byPath.get(p)) }] })),
      ...bases.map((p) => ({ source: `${p}@(${FRESH_FILES.join('|')})`, headers: NO_CACHE })),
      // The page itself at each app's address (`/pet/` serves /pet/index.html).
      { regex: `^(?:${bases.join('|')})$`, headers: NO_CACHE },
      { source: `/${SITE_MANIFEST}`, headers: NO_CACHE },
      ...bases.map((p) => ({ source: `${p}assets/**`, headers: IMMUTABLE })),
    ],
  };
}

/**
 * Every path but `/sw.js`, with the rest of the path captured as `rest`. Firebase checks redirects
 * before files, and RE2 has no lookahead, so the exception is spelled out.
 */
export const REDIRECT_ALL_BUT_WORKER = '^/(?P<rest>(?:[^s]|s[^w]|sw[^.]|sw\\.[^j]|sw\\.j[^s]|sw\\.js.).*|s|sw|sw\\.|sw\\.j)?$';

/** The hosting config of an old per-app site: everything 301s to `target` (`https://<shared>/pet/`), query kept by Hosting. */
export function redirectConfig(site: string, target: string, publicDir: string): HostingSite {
  const to = target.endsWith('/') ? target : `${target}/`;
  return {
    site,
    public: publicDir,
    ignore: ['firebase.json', '**/.*'],
    redirects: [{ regex: REDIRECT_ALL_BUT_WORKER, destination: `${to}:rest`, type: 301 }],
    headers: [{ source: '/sw.js', headers: NO_CACHE }],
  };
}

/** Marks the retiring worker, so a check can tell it is the one being served. */
export const RETIRED_WORKER_MARK = 'huishouden: this address moved';

/**
 * Served as `/sw.js` on an old site. A device that installed the app there runs the old worker,
 * which answers every launch from its precache and so never sees the redirect. Its next update
 * check fetches this instead: it clears the caches, unregisters itself and reloads the open
 * windows, which then reach the redirect.
 */
export function retiredWorkerSource(): string {
  return `// ${RETIRED_WORKER_MARK}; this worker removes itself so the app's new address loads.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
  })());
});
`;
}

/** Written at the site's root: which build of each app a deploy holds. */
export const SITE_MANIFEST = 'hh-site.json';
/** Written into each packed build. */
export const BUILD_STAMP = 'hh-build.json';

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
  apps: Record<string, { repo: string; asset: number | null; sha?: string; version?: string }>;
}

/** Paths whose published build differs from what `manifest` holds (a newer one, or one it lacks). */
export function staleApps(manifest: SiteManifest | null, latest: Record<string, number | null>): string[] {
  return Object.entries(latest)
    .filter(([path, asset]) => asset !== null && manifest?.apps[path]?.asset !== asset)
    .map(([path]) => path);
}
