# One site for the whole suite

Every Huishouden app is served from one Firebase Hosting site, under its own path:

| Path | App | Repo |
|---|---|---|
| `/` | Portal | `portal` |
| `/<app>/` (`/spending/`, `/baby/`, `/pet/`, `/home/`, `/car/`, `/bills/`, `/tasks/`) | that app | `<app>` |

Production is `https://huishouden-piekstra.web.app/`, staging mirrors it on the staging sites.
Repos, tests, staging runs and releases stay separate: only hosting is shared.

## Why

An installed PWA shows no browser UI only while it navigates inside its manifest `scope`, and a
scope can't leave its origin. With one site per app, every tile in the installed portal opened a
second origin: a browser bar, a second sign-in, a second set of permissions. On one origin the
portal's scope `/` covers every app, and Firebase Auth keeps one session for all of them (they
share the project's browser API key, so the IndexedDB session record is the same one).

## Paths and builds

- `pwaApp({ base: '/pet/' })` (from `./vite`) sets Vite's `base`, so assets, `index.html` links and
  the manifest link carry the prefix. Apps use `import.meta.env.BASE_URL` for anything they build
  by hand, and `appUrl(import.meta.env.BASE_URL, '?tab=care')` for absolute links (agenda items,
  reminders, invitations): the origin comes from the page, so a staging build links to staging.
- Manifest: `id`, `start_url` and `scope` are the base (`/pet/`), icons and the share target live
  under it. The portal keeps `/` for all three: installing the portal covers every app, so moving
  from a tile into `/pet/` stays in the installed window with no browser bar. Each app stays
  installable on its own (its own id and scope); an installed app opens only its own path.
- Links between apps are same-origin paths (`/`, `/pet/`, `/privacy`), never absolute URLs, so the
  staging portal leads to staging apps.

## Service workers

Each app registers `<base>sw.js` with scope `<base>` and precaches only its own build (the build
runs before assembly, so other apps' files are never in its glob). Workbox's navigation fallback is
`<base>index.html`.

The portal's worker has scope `/`, which also matches `/pet/…` until the Pet worker is installed
(a browser picks the registration with the longest matching scope, so once `/pet/sw.js` is
registered it controls `/pet/` pages). Without care, the first tap on a tile would get the portal's
cached `index.html`. `pwaApp({ base: '/', otherApps: ['pet', …] })` adds every app path, and
Firebase's `/__/`, to `navigateFallbackDenylist`, so those navigations go to the network. The portal
reads the paths from `apps.json`. Asset requests from an app page the portal's worker controls fall
through to the network: no precache route matches them.

Updates are unchanged: `registerType: 'autoUpdate'`, `skipWaiting` and `clientsClaim` per worker;
`sw.js`, `registerSW.js`, `index.html` and manifests are `no-cache` under every base.

Push: the notification click handler reuses a window inside the tapped worker's scope (not any
window of the origin, which would now be another app), and icons resolve against the scope.

## Same origin: storage

One origin means one `localStorage`, one IndexedDB and one Cache Storage for every app.

| Store | Key | Shared? |
|---|---|---|
| Firebase Auth | IndexedDB `firebaseLocalStorageDb`, `firebase:authUser:<apiKey>:[DEFAULT]` | Shared on purpose: one sign-in |
| Firestore cache | IndexedDB `firestore/[DEFAULT]/<project>/main`, multi-tab manager | Shared: one cache, any number of tabs and apps. A failed open falls back to memory |
| Write outbox | `hh-outbox:<project>:<time>-<seq>-<tab>` | Shared on purpose: a note is a complete write (path and data), so whichever app opens next replays it for the same member |
| Google API tokens | `hh-google-tokens` (entries keyed by uid and scopes) | Shared on purpose: the same OAuth client, so a Calendar token granted in Pet serves Home |
| Calendar asked | `<app>-calendar-allowed` | Per app already |
| Suggestion dismissals | `<app>-calendar-dismissed-<uid>`, `<app>-google-tasks-dismissed-<uid>` | Per app already |
| Portal layout cache | `hh-portal-layout` | Portal only |
| Spending, Baby, Tasks | `spending-seen-alerts-*`, `baby-seeded-*`, `hearthlist.*` | Per app already |
| Workbox precache | `workbox-precache-v2-<scope>` | Per app (the scope is in the name) |
| OCR runtime cache | `hh-ocr` | Shared on purpose: versioned CDN files |

Nothing needed renaming. New keys follow the rule in STANDARD.md "One site": prefix with the app's
short name unless sharing is the point, and say so.

## Deploys without cross-repo secrets

Firebase Hosting replaces a whole site on each deploy, so every deploy ships every app. Each repo
keeps its own credentials (Workload Identity Federation, the same deploy account it already uses)
and reads the other apps only from public release assets:

1. `build` (every run) builds `dist`. On `main` it also builds `dist-staging` with the
   `STAGING_VITE_*` variables.
2. `publish` (`main` only, `contents: write` on its own repo) packs each as a tarball with an
   `hh-build.json` stamp (repo, base, sha, version, time) and uploads `site.tar.gz` and
   `site-staging.tar.gz` to the repo's rolling `hosting` pre-release, replacing the previous ones.
   A build that fails never gets here, so the last good asset stays.
3. `deploy` (`main` only, production credentials) runs `pwa-site assemble`: reads the registry
   (`apps.json` in the portal repo, public), downloads each other app's latest `site.tar.gz` by
   asset id, unpacks each under its path, puts this run's own `dist` under its own, writes the
   combined `firebase.json` and `/hh-site.json` (which asset of each app is in this deploy) and
   deploys. Then `pwa-site stale` asks GitHub for the assets again; if any app published since the
   download, it assembles and deploys again (up to three rounds). Apps without an asset yet are
   left out (their path falls to the portal).
4. `smoke` runs the app's `e2e` against `https://<site>/<app>/`.

Races: two repos deploying at once each include the other's newest asset or notice it afterwards
(step 3's recheck), and the last deploy wins with both. The portal's scheduled run (every 30
minutes, `reconcile: true`) compares the live `/hh-site.json` with the latest assets and deploys only
when they differ, so a lost update lives at most half an hour.

Rejected: cloning the live Hosting version and replacing one path (Hosting API `versions.clone`).
No deploy would hold every app's source, so a lost update could not be repaired, and the site's
config would have no owner.

### The combined firebase.json

Generated by `siteConfig()` (`./site`), never hand-edited:

- `redirects`: `/<app>` to `/<app>/` (301).
- `rewrites`: `/<app>/**` to `/<app>/index.html` per app, then `**` to `/index.html` (the portal).
  `/__/` is Firebase's and is never rewritten.
- `headers`: the security headers on every path except `/__/`. `Permissions-Policy` applies to the
  document it arrives with, so each app's path gets the features its own `firebase.json` turns on
  (Car `camera=(self)`, Tasks `geolocation=(self)`) and the rest of the site the portal's; a union
  would hand every app every feature. `no-cache` on each base's `sw.js`, `registerSW.js`, `hh-push-sw.js`, `index.html`, manifests
  and on `/hh-site.json`; a year, immutable, on each base's `assets/`.

Each app's own `firebase.json` stays the place it declares its headers (`pwa-headers-check`); `pack`
copies its `Permissions-Policy` into the build's stamp for the assembler.

## Staging

Same shape, staging builds: a pull request's `staging` job assembles the PR's build with the latest
`site-staging.tar.gz` of every other app and deploys the whole suite to that app's own staging site
(`huishouden-staging-<app>.web.app`, the portal's is `huishouden-staging.web.app`). The signed-in
tests run at `https://<staging site>/<app>/`. Each app keeps its own staging site so two repos' PRs
never overwrite each other mid-test; every staging site is a full mirror (portal at `/`, all apps
under their paths), so cross-app checks (one sign-in, tiles) work on any of them.

## Old addresses

`huishouden-<app>.web.app` becomes a redirect: every path 301s to
`https://huishouden-piekstra.web.app/<app>/<path>`, query kept (deep links in agenda items,
notifications, bookmarks). One file is not redirected: `/sw.js` is a worker that unregisters
itself, clears its caches and reloads its pages, so an installed copy stops answering from its
precache and follows the redirect on its next launch. Firebase checks redirects before static
files, so the redirect's pattern spells out "every path but `/sw.js`" (RE2 has no lookahead).
`apps.json` marks an app `"redirect": true` once its path is live; the portal's runs deploy the
redirect sites (the reconcile run checks them each time and redeploys only when one is wrong).

Installed copies of the old sites open the new path with a browser bar (another origin's scope).
Reinstalling the portal once per device fixes that; the old icons can then be removed.

## Migration

1. Kit: `base`, `otherApps`, `appUrl`, scope-aware push worker and app bar, `./site` and
   `pwa-site`, `pwa.yml` `base` and `reconcile` inputs. Callers without `base` keep today's
   per-site deploys, so moving `v0` changes nothing for them.
2. Portal: `base: '/'`, assembles and deploys the combined site; reconcile schedule. (Its own site
   is the combined one, so nothing changes for a visitor.)
3. Each app: `base: '/<app>/'`, publishes assets, deploys the combined site, smoke at `/<app>/`.
   Its old site is no longer deployed and keeps serving the last build until step 5.
4. Verify every path: sign-in popup, Firestore, Google tokens, push worker.
5. Portal: tiles become paths, `apps.json` marks the old sites `redirect`, the old sites redirect.
6. Registry, uptime checks, authorized domains and docs follow the paths.
