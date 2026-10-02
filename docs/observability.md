# Observability

How the Huishouden apps report errors, speed and usage, what is alerted, and how it is set up.
The rules for apps are in [STANDARD.md](../STANDARD.md#observability).

## Why New Relic

| Need | New Relic (free tier) | Firebase Performance + Google Analytics | Cloudflare Workers Observability |
|---|---|---|---|
| Browser JS errors | Yes, with stack traces, per app and version | No (Crashlytics has no web SDK) | Worker only |
| Core Web Vitals | Yes (LCP, INP, CLS per page view) | Yes (Performance Monitoring) | No |
| Usage, coarse geography, no device id | Yes (PageView, PageAction; session tracking can be turned off) | Yes, but Analytics is ad-tech: cookies, Google signals, a consent banner in many countries | No |
| Alerts by email | Yes, on any query | Performance alerts only; no error alerts | Paid plans |
| Uptime checks | Unlimited ping monitors | No | No |
| Worker heartbeat | Event API + loss-of-signal alert | No | Logs only, no alert on free |
| Cost | $0: 100 GB/month ingest, 1 full user | $0 | $0 (logs) |

One tool covers errors, vitals, usage, uptime, the notify Worker and alerts, with SQL-like queries
(NRQL) over all of it. Firebase would still need a second tool for errors and alerts, and Google
Analytics sends far more than these apps need.

## What is collected

| Data | Event | When | Why |
|---|---|---|---|
| Uncaught JS errors and handled failures (`reportError`) with Firestore or HTTP code | `JavaScriptError` | Always | Hear about breakage first; error-spike alert |
| Page loads with LCP, INP, CLS and load time | `PageView`, `PageViewTiming` | Always | Speed on the tablet and phones; page views per app |
| Feature use and screens (`track`, `trackView`) | `PageAction` (`actionName`, `view`) | Not under GPC or DNT | Which features matter |
| Hashed household (`householdTag`) | attribute `household` | Not under GPC or DNT | Count active households without knowing which |
| App, version, build SHA | attributes `app`, `application.version`, `buildSha` | Always | Errors per release |
| Device type, browser, country and region | derived by New Relic from the request | Always | Devices to test on; where the apps are used |

Nothing is stored on the device: the agent runs with session tracking off
(`privacy.cookies_enabled: false`), so there is no cookie and no localStorage id, every count is per
visit, and nothing links one visit to the next. That is why no consent banner is needed. When the
browser sends Global Privacy Control (or Do Not Track), the agent loads without the usage feature,
and `track`, `trackView`'s count and the household hash are skipped silently; errors and performance
still go. There is no opt-out screen.

Not collected: names, emails, household ids, entries or anything typed, query strings and
fragments, city (dropped at ingest by a drop rule), IP addresses (New Relic does not store them for
Browser), session ids, replays, traces, AJAX URLs, clicks. `redact` and the agent's `obfuscate`
rules strip emails, `households/…` and `profiles/…` path ids, query strings and long numbers from
every message, stack trace and URL before it is sent.

Nothing at all is sent when the browser is automated (Playwright, CI), the page is not on
`*.web.app` / `*.firebaseapp.com` over https, or the build has no `VITE_NEWRELIC_*` variables
(staging builds get none).

The portal's `/privacy` page says this for people using the apps; every app's account menu links it.

## In an app

```ts
// src/data/firebase.ts (or main.tsx), before rendering
import { startObservability } from '@huishouden/pwa-kit/observability';
startObservability({ app: 'baby', env: import.meta.env });
```

```ts
import { reportError, track, trackView } from '@huishouden/pwa-kit/observability';
track('log feed', { kind: 'bottle' });          // a feature used: an action name and small enums
trackView(tab);                                 // a screen or tab shown
catch (e) { reportError(e, { where: 'import statement' }); }  // handled failures readError doesn't see
```

`saveMyProfile` tags the visit with the household's hash, so apps that record profiles need nothing
else for the household count.

## Alerts

Policy **Huishouden**, emailed through the workflow **Huishouden alerts** (destination
**Huishouden alerts email**). All are NRQL conditions (free).

| Condition | Fires when |
|---|---|
| App errors spike | More than 10 errors in one app within 30 minutes (one incident per app) |
| Site down | A site's uptime check failed twice within 30 minutes (ping every 15 min from 2 locations) |
| Notify sender silent | No `NotifyRun` heartbeat from the notify Worker for 20 minutes (it runs every 5) |
| Notify run crashed | A notify run threw (`NotifyRun.error`) |
| Push deliveries failing | More than 5 Web Push deliveries failed in an hour |

CI failures on `main` are emailed by GitHub to whoever pushed; `huishouden/.github` also opens a
weekly digest issue listing failed `main` runs across the org (only when there were any).

## Dashboard

**Huishouden** (pages Overview, Errors, Core Web Vitals, Usage): errors and page views by app,
hashed active households, error rate, countries and regions, devices, uptime, notify runs, top
errors by version and code, LCP/INP/CLS p75 per app, feature use and tabs. Counts are per page
view or visit; there are no sessions to count, by design.

## Setup (once, by a maintainer)

1. A New Relic account (free, no card): https://newrelic.com/signup. US data region.
2. A user key: one.newrelic.com > your name > API keys > Create a key > type User. Keep it out of
   the repo and shell history.
3. From this repo, with `gh` signed in as an admin of the app repos:

   ```sh
   NEW_RELIC_API_KEY=… NEW_RELIC_ACCOUNT_ID=… ALERT_EMAIL=you@example.com \
     bun infra/newrelic.ts ../portal/apps.json
   ```

   It creates or updates, by name: a Browser app per repo (`Huishouden Baby`, …), the
   `VITE_NEWRELIC_*` repo variables, a ping monitor per site, the drop rules, the alert policy,
   conditions, email destination, channel and workflow, and the dashboard. Re-run it after adding
   an app. `DRY_RUN=1` prints what it would do.
4. If New Relic sends a verification email to the alert address, confirm it.
5. Notify heartbeat: put an ingest key in the Worker (huishouden/notify README, "Monitoring").
6. Push to each app's `main` (or wait for the next merge) so the build picks up the variables.

## Free-tier headroom

| Item | Free allowance | Expected use |
|---|---|---|
| Data ingest | 100 GB/month | Under 0.1 GB: about 2 KB per page view, 288 notify events a day |
| Full platform users | 1 | 1 |
| Ping monitors | Unlimited | 8 apps × 2 locations × 4/hour ≈ 46,000 checks/month, not billed |
| Other synthetic checks | 500/month | 0 |
| Alerts, dashboards, drop rules | Included | 5 conditions, 1 dashboard |

Browser events are kept for New Relic's default retention (8 days for raw events at the time of
writing), so the dashboard's month-long charts fill in over time and older detail ages out.

## Checking it works

```sh
newrelic nrql query --accountId <id> --query "SELECT count(*) FROM PageView, JavaScriptError, PageAction WHERE appName LIKE 'Huishouden %' FACET eventType(), appName SINCE 1 hour ago"
newrelic nrql query --accountId <id> --query "SELECT latest(timestamp), sum(pushed) FROM NotifyRun SINCE 30 minutes ago"
```
