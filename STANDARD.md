# PWA standard

Every app built on pwa-kit follows this.
Each rule is here because skipping it broke something; the reason is given so the rule can be
judged rather than copied.

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
