# PWA standard

Every app built on pwa-kit follows this.
Each rule is here because skipping it broke something; the reason is given so the rule can be
judged rather than copied.

## Who it's for

**Built for any household, free.** Anyone can open an app, sign in with Google, create a household
and use everything without us setting anything up for them. The maintainers' own household is one
user of it (dogfooding), never a special case. So:

- **Self-serve only.** Every feature works from the app for a new household: no per-household
  Sheets, scripts, config files, IDs or console steps done by a maintainer.
- **No single-machine or single-account dependencies.** Nothing may need a particular laptop to be
  on, a maintainer's GitHub account or secrets, or their personal CLIs. Connectivity to outside
  services runs as the household's own Google account (in the browser, with permissions the member
  grants), or in shared infrastructure that serves every household the same way.
- **Free for households and for us.** Free tiers only (Firebase Spark, GitHub public repos, free
  APIs). A feature that needs a paid plan or a billing account is a decision for the user, raised
  with its cost, not a default.
- **Their data, their account.** Household data lives in the household's Firestore documents;
  external data is fetched with the member's own consent and never through maintainers' credentials.
- **Know the limits we accept by staying free**: no scheduled server code on Spark (sync runs when
  someone opens an app, and the shared tablet keeps one open; the one exception is the shared
  notification sender on Cloudflare's free plan, see Notifications); Google's restricted scopes (reading
  email) work unverified for up to 100 users with a warning screen.

## Shape

- **One repo per app**. Its own CI, its own deploys.
- **One Firebase project per family of apps** that share users and data. Each app gets its own
  Hosting site (`<family>-<app>.web.app`) and its own Firebase web app registration.
  Unrelated or shareable projects get their own Firebase project.
- **Stack**: Vite + TypeScript, `vite-plugin-pwa` (Workbox), bun. React where the app has state;
  plain TS is fine for static pages like the portal.
- **Wire it up with `infra/bootstrap.sh <apps.conf>`**: add the repo to `APPS` and re-run. It creates
  the site and web app and sets the repo variables. Never hand-create deploy keys.

## PWA

- Manifest: `display: standalone`, `start_url` and `scope` `/`, icons at 192 and 512 plus a
  512 maskable icon. Generate PNGs from one SVG (`bunx pwa-icons`).
- Use `pwaApp()` from `@huishouden/pwa-kit/vite`. It sets `registerType: 'autoUpdate'` (installed
  copies update on the next launch) and **`navigateFallbackDenylist: [/^\/__\//]`**. Firebase serves its sign-in popup at
  `/__/auth/handler`; without this the service worker answers it with the cached app and
  "Sign in with Google" opens the app instead of Google.
- Hosting headers: `sw.js`, `registerSW.js`, `index.html` and the manifest `no-cache`;
  `/assets/**` immutable for a year (`templates/firebase.json`).
- Tablet first: test at 1280×800 landscape; tap targets at least 44 px.

## Sign-in and data

- Firebase Auth with Google. `authDomain` is the project's `<project>.firebaseapp.com`:
  it is the only redirect URI the auto-created OAuth client allows. An app's own domain gives
  `Error 400: redirect_uri_mismatch` until its `/__/auth/handler` is added to that client.
- The OAuth consent screen is In production, External. Asking for sensitive scopes (Sheets,
  Drive) shows "unverified app" once per user and counts toward a lifetime cap of 100 users.
  Prefer designs that need no Google API scopes in the browser.
- Shared data lives in Firestore in the family's project. A project has exactly one rules file,
  so exactly one repo deploys it; other apps send their rules blocks to that repo.
- People, accounts, card numbers and other personal facts are data, not code: keep them in the
  app's data store (a sheet tab, Firestore), never in the repo, including test fixtures (use
  made-up values). A leak scan can't recognise most of these, so this rule is the protection.

## Shared code

- **Copy once, then extract.** When a second app needs code another app already has, it moves into
  the kit instead of being copied: time and due wording (`/time`), schedules (`/schedule`), money
  (`/money`), Google tokens (`/google-token`, `/gmail`), calendar import (`/calendar`,
  `/react/calendar`), contacts (`/contacts`, `/react/contacts`) and the React UI primitives
  (`/react/ui`, `/react/clock`) already have. Copies drift: before extraction four apps worded the
  same 60 days three ways.
- **The kit holds mechanism, the app holds policy.** Generic arithmetic, wording and components go
  in the kit; an app's own roles, search words, limits and labels are passed in as arguments.
- **Google API scopes go through `googleAccessToken`**, so a token is asked for once and reused for
  its hour across features, and a revoked one is forgotten on the 401.

## Notifications

Reminders reach people as push notifications through one shared sender,
[huishouden/notify](https://github.com/huishouden/notify): a Cloudflare Worker (free plan) that runs
every five minutes for every household in the project, the same way. No app sends anything itself
and no household sets anything up.

- **Reminders are data.** An app writes them to `households/{id}/reminders` with
  `@huishouden/pwa-kit/reminders` (`upsertReminder`, or `replaceReminders(ref, remindersForCourse(...))`
  for a medicine course) and deletes them when they no longer apply. Each has an https deep link
  back into the app. Ids are idempotent, so saving the same thing twice never doubles a reminder.
- **Each person opts in per device.** A "Notify me" control calls `enablePush` from a tap; it stores
  the device's subscription in `households/{id}/pushSubscriptions`, which only that person and the
  sender can read. Build with `pwaApp({ push: true })` and the `VITE_VAPID_PUBLIC_KEY` repo variable
  (the bootstrap sets it when `apps.conf` has `VAPID_PUBLIC_KEY`).
- **Say why when it can't.** `pushSupport()` gives the reason and a sentence to show. iPhone and iPad
  get notifications only from an app added to the Home Screen, on iOS/iPadOS 16.4 or later; in a
  Safari tab the app explains how to add it rather than showing a button that does nothing.
- **Timing**: up to five minutes late; reminders more than 12 hours overdue (the sender was down)
  are dropped rather than sent. Anything that must not be missed also shows in the app itself.
- **Rules**: the `reminders` and `pushSubscriptions` blocks live in the project's rules file (fields
  match `REMINDER_FIELDS` and `PUSH_SUBSCRIPTION_FIELDS`), with the collection-group index on
  `reminders` (`sent`, `at`) the sender's query needs.

## CI/CD

Every app's `.github/workflows/ci.yml` calls `pwa-kit/.github/workflows/pwa.yml@v0`
(`templates/ci.yml`), which runs these jobs on `ubuntu-latest`:

| Job | Runs on | Does |
|---|---|---|
| `leak-scan` | every PR and push | gitleaks on the added commits (`actions/leak-scan`) |
| `build` | every PR and push | `bun install --frozen-lockfile`, lint (`tsc --noEmit`), unit tests, build |
| `deploy` | push to `main` | Keyless via Workload Identity Federation; `firebase deploy --only hosting:<target>` |
| `smoke` | after `deploy` | Playwright against the live site |

- Repo variables (not secrets; the Firebase web config is public by design): `GCP_WIF_PROVIDER`,
  `GCP_DEPLOY_SA`, `VITE_FIREBASE_*`. The bootstrap sets them.
- Deploy waits on `leak-scan` and `build`. `concurrency: cancel-in-progress` on every workflow.
- `pull_request` ignores `CHANGELOG.md` and `package.json`-only changes (`templates/ci.yml`): release
  PRs are opened by github-actions[bot], and GitHub holds a bot-opened PR's run for approval and
  fails it with no jobs when nobody approves. The release commit still runs everything on main.
- Real secrets (test account passwords, API tokens) go in GitHub Actions secrets and are read
  only in the jobs that need them. Never in argv, logs, or the repo.

## Tests

- **Unit tests** (`bun test`) for parsing and money logic, with inputs and expected outputs in
  fixture files (`__fixtures__/`, `fixtures/`), scrubbed of real names, emails and card digits.
- **Smoke tests** (`bun run e2e`, Playwright, headless Chromium) against the deployed site.
  Minimum set, from `@huishouden/pwa-kit/e2e`:
  1. Loads with no runtime errors.
  2. Installable: manifest has a 512 icon, every icon URL loads, a service worker controls the
     page after one reload.
  3. Sign-in popup lands on accounts.google.com with a `/__/auth/handler` redirect and no
     `redirect_uri_mismatch`, run on the second load (under the service worker).
- Signed-in flows use a dedicated test account in GitHub secrets, not a household member's
  Google account: Google blocks scripted sign-in to real accounts.

## Leaks

- The scan uses `actions/leak-scan/gitleaks.toml` (gitleaks defaults plus a personal-mailbox
  pattern) unless the repo has its own `.gitleaks.toml`. Rules describe patterns, never the
  values to look for: a list of the real addresses or numbers you want kept out is itself a leak.
- Allowlist by path or rule only, with the reason in the entry. Prefer removing the file.
- Enable the pre-commit hook (`templates/githooks/pre-commit`, `git config core.hooksPath .githooks`)
  so a leak is stopped before it is a commit. It fails closed: without gitleaks or a rules file
  the commit stops. `LEAK_SCAN_SKIP=1` skips it on purpose, and CI still scans the push. In a
  public repo a pushed branch is already public, so CI only catches what the hook missed.
- Public repos: GitHub secret scanning and push protection on.
- The scan covers the commits each PR or push adds. History before the scan existed is audited
  once, at publication, with a fresh-history publish if needed.

## Apps Script

- Script source lives in the app repo (`apps-script/`), deployed with `clasp`
  (a `script:push` script that runs its tests first). Never edit only in the browser editor.
