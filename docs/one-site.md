# One site for the whole suite

Every Huishouden app is served from one Firebase Hosting site, under its own path:

| Path | App | Repo |
|---|---|---|
| `/` | Portal | `portal` |
| `/<app>/` (`/spending/`, `/baby/`, `/pet/`, `/home/`, `/car/`, `/bills/`, `/tasks/`, `/groceries/`, `/health/`) | that app | `<app>` |

Production is `https://huishouden-piekstra.web.app/` (`SUITE_SITE` in `./site`), staging mirrors it on
the staging sites.
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
   combined `firebase.json` and `/hh-site.json` (which asset of each app is in this deploy), and
   `/hh-observability.json` (each included app's New Relic browser settings, from the portal's
   `observability` release asset; production only, docs/observability.md) and deploys. Then `pwa-site stale` asks GitHub for the assets again; if any app published since the
   download, it assembles and deploys again (up to three rounds). Apps without an asset yet are
   left out (their path falls to the portal).
4. `smoke` runs the app's `e2e` against `https://<site>/<app>/`.

Races: two repos deploying at once each include the other's newest asset or notice it afterwards
(step 3's recheck), and the last deploy wins with both. The portal's scheduled run (every 30
minutes, `reconcile: true`) compares the live `/hh-site.json` with the latest assets (the apps'
and the observability settings) and deploys only when they differ, so a lost update lives at most
half an hour.

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
  (Car `camera=(self)`, Tasks and Groceries `geolocation=(self)`) and the rest of the site the portal's; a union
  would hand every app every feature. `no-cache` on each base's `sw.js`, `registerSW.js`, `hh-push-sw.js`, `index.html`, manifests
  and on `/hh-site.json` and `/hh-observability.json`; a year, immutable, on each base's `assets/`.

Each app's own `firebase.json` stays the place it declares its headers (`pwa-headers-check`); `pack`
copies its `Permissions-Policy` into the build's stamp for the assembler.

## Staging

Same shape, staging builds: a pull request's `staging` job assembles the PR's build with the latest
`site-staging.tar.gz` of every other app and deploys the whole suite to that app's own staging site
(`huishouden-staging-<app>.web.app`, the portal's is `huishouden-staging.web.app`). The signed-in
tests run at `https://<staging site>/<app>/`. Each app keeps its own staging site so two repos' PRs
never overwrite each other mid-test; every staging site is a full mirror (portal at `/`, all apps
under their paths), so cross-app checks (one sign-in, tiles) work on any of them. Only
`huishouden-staging.web.app` is an origin of the staging OAuth client ("Sign-in origins"), so
Google's prompt and Google API tokens work there and not on the per-app staging sites.

## Sign-in origins

Two lists decide where Google sign-in works, and they are kept to what the one site needs.

| List | Where | Production (`huishouden-piekstra`) | Staging (`huishouden-staging`) |
|---|---|---|---|
| Authorized JavaScript origins of the OAuth web client | Google Cloud console only (no API) | `https://huishouden-piekstra.web.app`, `https://huishouden-piekstra.firebaseapp.com` | `https://huishouden-staging.web.app`, `https://huishouden-staging.firebaseapp.com` |
| Firebase Auth authorized domains | Identity Toolkit API (the bootstrap) | `huishouden-piekstra.web.app`, `huishouden-piekstra.firebaseapp.com` | those two for staging, every `huishouden-staging-<app>.web.app`, `localhost` |

The OAuth client's origins are what Chrome's sign-in prompt (One Tap, `signInSilently`) and Google
API tokens (`google-token`) check. Google allows an OAuth app that has not been through verification
at most 10 authorized domains, and every `*.web.app` site counts as its own domain (they are on the
public suffix list), so one origin per app does not fit: production would need 10 sites plus
firebaseapp.com, staging 11. It does not need to: every app runs on the suite's site, the old
per-app sites only redirect, and the per-app staging sites exist for pull requests' tests, which
sign in with custom tokens and never show Google's prompt. Trying an app by hand on staging, with
Google, is done on the staging portal's site, `https://huishouden-staging.web.app/<app>/`; on a
per-app staging site the popup sign-in still works (Firebase Auth's list has it), One Tap and
Google API tokens do not.

The suite's site is `SUITE_SITE` from `./site` (today the project's default Hosting site), so
`signInOrigins(project, SUITE_SITE)` from `./oauth-origins` derives both entries. The production `smoke` job, the
staging job (allowed to fail: nothing automated needs it) and the bootstrap check exactly those and
say what to add; an origin a check reports missing is added in the console under Google Auth
Platform > Clients > "Web client (auto created by Google Service)".

Firebase Auth's authorized domains have no such limit, but the bootstrap still adds only what is
used: production gets nothing per app (a new app adds nothing), staging gets each app's staging site
(its pull requests sign in there) and `localhost` (local runs against staging). Anything else on the
list is printed as not needed; `bootstrap.sh --prune-domains` removes it.

## The suite's address

`SUITE_SITE` in `src/site.ts` is the one place the production address is set. Derived from it:

- the deploy target (`sharedSite`, `pwa-site assemble`, `pwa-site site`) and the reconcile run's
  live-site check;
- each app's link preview (`og:url`, `og:image`; `pwaApp({ base })` without `url`);
- the smoke tests' and PR screenshots' live URL (`pwa.yml` without `site-url`);
- absolute links built where there is no page (`SUITE_ORIGIN`, `suiteUrl(base, path)`: Playwright
  defaults, fallbacks in agenda and reminder code, tests);
- the sign-in checks (`pwa-oauth-origins`, `smoke`) and the bootstrap's authorized domains.

The Workers (`notify`'s `LINK_HOSTS`, `calendar` and `connector`'s `SITE_URL`/`ALLOWED_ORIGINS`) and
`VITE_FIREBASE_AUTH_DOMAIN` are deploy configuration, set outside the apps' code.

### Moving the suite

To serve the suite from another site of the same project (Hosting serves `/__/auth/*` on every
site, so sign-in moves with it):

1. Create the site; add `https://<new>.web.app` to the OAuth web client's Authorized JavaScript
   origins and `https://<new>.web.app/__/auth/handler` to its redirect URIs (console only), and
   `<new>.web.app` to Firebase Auth's authorized domains.
2. Change `SUITE_SITE`, release the kit, bump every app; each deploy then goes to the new site and
   the old one keeps its last build.
3. Point the Workers' site settings at it, and `VITE_FIREBASE_AUTH_DOMAIN` if sign-in should show
   the new host; rebuild.
4. Mark the portal's entry in `apps.json` `"redirect": true`: the portal's runs then redirect the
   former address to the new root, path and query kept, serving a retiring `sw.js` at `/` and at
   every app's path (`retiringWorkers`) so installed copies leave their caches.

The manifest `id` is relative to the origin, so browsers treat the new address as a new app:
reinstall, and re-enable notifications (push subscriptions are per origin).

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
6. Registry, uptime checks, sign-in origins and authorized domains ("Sign-in origins") and docs
   follow the paths.
