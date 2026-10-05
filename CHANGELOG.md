# Changelog

Versions from 0.91.0 on are set by the PR that changes the kit (STANDARD.md "Versions"); earlier
ones are described in their PR titles and tags.

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
