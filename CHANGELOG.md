# Changelog

Versions from 0.91.0 on are set by the PR that changes the kit (STANDARD.md "Versions"); earlier
ones are described in their PR titles and tags.

## 0.101.0 (2026-10-05)

### Features

* **visit:** a private doctor is never named in what a helper carer reads. `visitAgendaItem` and `visitReminders` take the contact as stored (with `private`) and the `household`, and name a contact marked private only when everyone in the audience may read private records (`publishedContact`, `./audience` `audienceSeesPrivate`, `can(role, 'see-private')`).

## 0.100.2 (2026-10-05)

### Bug Fixes

* Callers pass the asset CDN's two secrets by name (`secrets: { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID }`), not `secrets: inherit`, which handed `pwa.yml` every repository secret: `templates/ci.yml`, README, STANDARD.md, docs/one-site.md and `pwa.yml`'s messages.

## 0.100.1 (2026-10-05)

### Tests

* `backfillPositions`: the one-request-a-second check measures from the booked turns, so a busy CI runner no longer fails it (973 ms between two records on main twice).

## 0.100.0 (2026-10-05)

### Features

* Asset CDN (docs/one-site.md "Asset CDN"): the suite's hashed files (`<base>assets/*`) are served from Cloudflare Workers static assets (`huishouden-assets`, staging `huishouden-assets-staging`, on `huishouden-app.workers.dev`), free and without a request limit, instead of Firebase Hosting's 10 GB a month. HTML, `sw.js`, the manifest and icons stay on Firebase, so addresses and installs don't change.
* `pwaApp`: with `assetOrigin` or `HH_ASSET_ORIGIN` (set by `pwa.yml`), index.html names the assets at the CDN (`renderBuiltUrl`) with `preconnect` and `dns-prefetch` hints, chunks reach each other by relative URL, the service worker precaches the assets from the CDN with CORS, and an inline script replaces the page once with `index.site.html` (the same page with the site's own assets, written by the assembler) when a CDN script or stylesheet fails to load or parse. `og.png` is no longer precached.
* `pwa-site`: `asset-origin`, `cdn` (the CDN's upload: the assembled site's assets, every earlier file seen within 30 days from `hh-assets.json`, `_headers`, `wrangler.toml`), `cdn-check` (reads the CDN's `hh-assets.json` back after an upload; the deploy uploads again, up to three times, when another repo's upload replaced it, and checks again after the pages are live), and `--assets-origin <url|none>` on `assemble` and `stale` (none removes the CDN from every page: the rollback).
* `pwa.yml`: deploys the assets to the CDN before the pages to Firebase; staging builds in a job with no credentials and uploads in one that runs nothing from the ref; the smoke checks the CDN asset's CORS, caching and compression and the site's copy. Callers pass `secrets: inherit`; `HH_ASSET_CDN=off` turns it off. Wrangler is pinned once (`WRANGLER_VERSION`, 4.147.0) and only its command gets the token.
* The production CDN's CORS origin is `SUITE_ORIGIN`; `SUITE_SITE`, `SUITE_HOST` and `SUITE_ORIGIN` move to `src/suite.ts` (still exported from `./site`).
* `pwa-headers-check` fails a Content-Security-Policy whose fetch directives would block the CDN (the kit's has none).

## 0.99.0 (2026-10-05)

### Features

* `@huishouden/pwa-kit/react/image-picker`: `ImagePicker`, the one way an app gets photos: Take a photo (camera, touch devices) and Choose a photo (no `capture`: photo library or files), paste (Ctrl/Cmd+V and a Paste button), drag and drop, and several at once. Scan the label (`LabelScan`) used `capture="environment"` and so opened only the camera; it now uses `ImagePicker`, reads each photo (the front and the back of a box) and parses them as one (`combineLabelTexts`), and takes `images` to read photos handed in.
* `pwaApp({ shareTarget: { images: true } })` and `@huishouden/pwa-kit/shared-images` (`readSharedImages`, `clearSharedImages`, `?share=image`): Gallery, Share, the app (Android). The share target ignores posts from other sites and keeps at most 10 files of 10 MB.

### Bug Fixes

* `doseTimes` makes at most 24 times a day from an interval, so a mis-read one ("every .0000001 hours") cannot freeze the page.
* Scan the label's result titles are headings and its disclosure is a 44px target; `dose.scanAgain` is gone (`dose.readingMany` added).

## [0.98.2](https://github.com/huishouden/pwa-kit/compare/v0.98.0...v0.98.2) (2026-10-05)

### Features

* **reminder-source:** sourceAllowed takes personal; a Health source never counts on a shared reminder ([445debe](https://github.com/huishouden/pwa-kit/commit/445debe3cb4ef60afa189eae9dff1a5a7305d71f))

### Bug Fixes

* **headers-check:** a repo that serves no pages has nothing to check ([4b8f67e](https://github.com/huishouden/pwa-kit/commit/4b8f67e158c622d0adab96a7954fa4a30891919c))

## 0.98.0 (2026-10-05)

### Bug Fixes

* `firestore`: the write outbox keeps a note until the server has taken or refused the write, not just until it is in Firestore's local cache. When IndexedDB can't be opened (storage full, a private window) Firestore falls back to a memory cache, and a write logged offline or just before a reload was forgotten while it lived only in the page. A replay keeps only the still-needed writes, under the page that replayed them; an update to a document the device has never read asks the server and waits while it is out of reach (tried again when the network comes back) instead of being dropped; a shut-down Firestore no longer drops notes.
* `firestore`: a replay skips an update or merge whose fields the cached document already shows, and leaves an `increment` to Firestore's own queue when that queue still holds a write to the document (the persistent cache kept it across the reload), so it counts once; with a memory cache an `increment` can still count twice when the page closes between the server taking it and its answer arriving (no app uses `increment`). An update whose read the rules refuse (`permission-denied`) is left out rather than holding its note; any other failure waits. `initFirestore` takes `online` (when to retry waiting notes; the window's `online` event by default).

### Features

* `firestore`: `forgetOutbox(db, { timeoutMs, signOut })` gives the signed-in person's unsent writes up to 3 s, removes their outbox notes, then runs `signOut`, noting nothing for them in between (still signed in afterwards, their writes are noted again); `signOutEverywhere` calls it. Firestore's own cache is not cleared.

## 0.97.0 (2026-10-05)

### Features

* `./visit` (server-safe): Health's visits, `healthPeople/{person}/visits` with their notes apart in `visitNotes` (admins and member carers only). Documents (`visitDoc`, `toVisit`, `visitNoteDoc`; `visitMark`, a signed mark to merge, and `visitUnmarked`, the document without it to replace), state and follow-ups (`visitState`, `followUpOpen`), words in en/es/nl, and what a visit publishes for named people only: `visitAgendaItem` ("Appointment for Ana", the rest only in `calendarDetail`), `visitReminders` (each lead time, default the day before and 2 hours before, to `visitRecipients`), `./audience` `personAudience` (who reads all of it, medicines too), `followUpTodo` ("Book a follow-up for Ana", Booked and Not needed). Calendar import: `visitCalendarWords`, `guessVisitKind`; `./people` `namedIn` finds whose it is and never assumes.
* `./household-tools`: `add_appointment` with `app: "health"` writes a Health visit (kind, doctor, video link, prep, medicine list, lead times, follow-up; notes only from keepers) and publishes it as Health does; new `health_appointments` lists a person's visits, notes only for keepers.
* `./reminder-core`: the reminder documents without Firebase (`reminderId`, `reminderDoc`, `personalReminderDoc`, `localizeReminders`), re-exported by `./reminders`.
* `TODO_COLLECTIONS.health` takes `healthPeople/*/visits`, so the follow-up to-do's buttons work.
* Calendar export: a Health appointment without Health details reads "Appointment for Ana" (was "Health: Ana"). Dutch to-dos in calendars read "Taak: …".

## [0.96.0](https://github.com/huishouden/pwa-kit/compare/v0.95.1...v0.96.0) (2026-10-05)

### Features

* **reminders:** source, what a reminder is about, for the sender to check ([9b8a0b7](https://github.com/huishouden/pwa-kit/commit/9b8a0b70d07300658a91123197f59bfe35ebbf45))

### Bug Fixes

* **reminder-source:** a Health source stays on personal reminders only; README names the sender's exception ([ba8bf55](https://github.com/huishouden/pwa-kit/commit/ba8bf55ab0b41117d01d083e29d29bbe3fcffe50))
* **reminder-source:** frozen table, pure cleanSource, the service-account exception in STANDARD.md ([1f5f8fa](https://github.com/huishouden/pwa-kit/commit/1f5f8fa8f5d3349f5d21661d62c8e9511594c1a2))

## 0.95.1 (2026-10-05)

### Bug Fixes

* `health_log_dose`: giving a dose someone else already gave asks first with the double-dose guard, which names who gave it; every other write over their mark (a skip, a confirmed give, a give over their skip) is refused.

## 0.95.0 (2026-10-05)

### Features

* `@huishouden/pwa-kit/household-tools`: every tool the AI connector offers (today, calendar, to-dos, groceries, tasks, bills, pet, home, appointments, contacts, Health, the household's home), moved from huishouden/connector so `hh data` runs the same implementation. `runTool`, `checkArgs`, `TOOLS`, `toolNamed`, `Session` (`via: 'assistant'` only when the session says so). Needs `zod` (optional peer) and a UTC process (`runTool` refuses to run otherwise).
* `signin-handoff`: the `hh` command line signs in through `/connect` with a loopback address and a PKCE proof key: `cliConnectUrl`, `isLoopbackRedirect` (exactly `http://127.0.0.1:<1024-65535>/callback` or `http://[::1]:<port>/callback`), `pkceChallenge`, `storeCliHandoff` and `takeCliHandoff` (one use, two minutes, bound to state, redirect and challenge), `CLI_HANDOFF_PATH`, `CLI_TOKEN_PATH`.
* `oauth-origins`: `redirectStatus` and `signInRedirectUris` check the auth handler is an Authorized redirect URI; `expectedAuthorizedDomains` and `compareAuthorizedDomains` for Firebase Auth's authorized domains.

### Bug Fixes

* `health_log_dose` refuses a dose time someone else marked before writing (the rules keep its `by`) and asks before turning a given dose into a skipped one.
* The tools' session normalizes the email once (queries, the default household, roles) and treats an unreadable role as a helper's.

## 0.94.0 (2026-10-05)

### Features

* `pwaApp` splits React and Firebase (`vendor-*.js`) from the app's code (`stableChunks`, Vite 8), so an app-only deploy changes one chunk of about 60 KB compressed instead of the 270 to 320 KB bundle, and installed copies download only that on update (Hosting bandwidth, docs/one-site.md).
* `pwa.yml`: the `staging-sweep` job is gone (no process schedules); `hh ops staging-cleanup` removes staging leftovers. The input stays, unused, so callers that pass it don't fail.

## 0.93.0 (2026-10-05)

### Features

* Emulator ports are configurable, so emulator runs side by side on one machine don't collide: `VITE_EMULATOR_AUTH_PORT` and `VITE_EMULATOR_FIRESTORE_PORT` for the build (`initApp`), `HH_EMULATOR_AUTH_PORT` and `HH_EMULATOR_FIRESTORE_PORT` for the tests (`useTestHousehold`, `signInTestUser`); defaults 9099 and 8080. `hh dev verify` from huishouden/cli 1.1.0 sets all four to free ports on kits that have them.
* `pwa.yml`'s version guard says exactly what to run when main has code without a version bump.

## 0.92.0 (2026-10-05)

### Features

* Logo glyph `receipt` (a receipt with a torn edge and two lines), so Bills no longer shares the `card` glyph with Spending.

## 0.91.0 (2026-10-05)

### Features

* `pwa.yml`: the build fails (no deploy) when code changed since the current version's tag or the version has no CHANGELOG.md section; the deploy tags the version and publishes its section as the GitHub release. `release.yml` (release-please) is retired.
* `pwa-bandwidth-check`: fails a workflow step that runs a browser against production or without BASE_URL; `pwa.yml` runs it.
* New Relic pings every 30 minutes instead of 15.

### Documentation

* STANDARD.md "Pull requests" (draft, `hh dev review`, `verify`/`evidence`, `release`, `ready`, merge), "Versions", "Update the kit when you touch a repo"; no process schedules; templates without PR triggers or Renovate.
