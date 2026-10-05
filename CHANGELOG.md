# Changelog

Versions from 0.91.0 on are set by the PR that changes the kit (STANDARD.md "Versions"); earlier
ones are described in their PR titles and tags.

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
