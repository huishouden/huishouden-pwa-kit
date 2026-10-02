# pwa-kit

Building blocks for small installable web apps (PWAs) on Firebase Hosting, shared by a family of
apps that each live in their own repo. Every piece exists because an app hit the problem it solves.

| Piece | Path | What it does |
|---|---|---|
| Vite preset | `@piekstra/pwa-kit/vite` | `pwaApp({...})`: manifest, auto-updating service worker, and a navigation fallback that leaves Firebase's `/__/` paths alone (otherwise "Sign in with Google" opens the app in the popup) |
| Firebase config | `@piekstra/pwa-kit/firebase` | `firebaseConfigFromEnv(import.meta.env, fallback?)` from `VITE_FIREBASE_*`; auth domain defaults to `<project>.firebaseapp.com`, the only redirect the auto-created OAuth client allows |
| Silent sign-in | `@piekstra/pwa-kit/auth` | `signInSilently(auth, clientId)`: Google One Tap with auto-select into Firebase, so each app signs in without a click once the browser is signed in to Google; reports Google's reason when it can't |
| Household | `@piekstra/pwa-kit/household` | `watchHousehold`, `inviteMember`, `removeMember`, `markJoined`, `createHousehold`: one `households/{id}` document (members by lowercase email) shared by every app; each app keeps its data in subcollections, so one invite opens every app |
| Theme | `@piekstra/pwa-kit/theme.css` | Shared colours, radius, font and `.hh-button` as CSS variables (works with or without Tailwind) |
| Smoke checks | `@piekstra/pwa-kit/e2e` | Playwright helpers: `expectCleanLoad`, `expectInstallable`, `expectGoogleSignInPopup` (no credentials needed), `captureScreenshot` (deterministic README screenshots, refreshed by CI after each deploy) |
| Reusable CI/CD | `.github/workflows/pwa.yml` | leak scan, build and unit tests, keyless deploy to Firebase Hosting, smoke tests against the live site |
| Leak scan | `actions/leak-scan` | gitleaks on the commits a PR or push adds; secrets plus personal mailbox addresses |
| Pre-commit hook | `templates/githooks/pre-commit` | the same scan before a commit exists |
| Icons | `bunx pwa-icons` | renders `public/icon.svg` to the 192, 512, maskable and Apple touch PNGs |
| Bootstrap | `infra/bootstrap.sh apps.conf` | creates the Firebase project, a Hosting site and web app per repo, Workload Identity Federation for GitHub, and the repo variables |
| Templates | `templates/` | `ci.yml`, `firebase.json`, `playwright.config.ts` for a new app |

The conventions behind these are in [STANDARD.md](STANDARD.md).

## Install

```sh
bun add -d @piekstra/pwa-kit@github:piekstra/pwa-kit#v0.4.0
```

Spell out the package name: `bun add github:piekstra/pwa-kit#…` alone fails with `DependencyLoop`.
The package is installed from git, so `dist/` is committed; CI fails if it is stale.

## Use

```ts
// vite.config.ts
import { pwaApp } from '@piekstra/pwa-kit/vite';
export default defineConfig({
  plugins: [pwaApp({ name: 'Groceries', description: '…', themeColor: '#1f3a2e', backgroundColor: '#f6f1e7' })],
});
```

```ts
// e2e/smoke.spec.ts
import { test } from '@playwright/test';
import { expectCleanLoad, expectInstallable } from '@piekstra/pwa-kit/e2e';
test('loads', ({ page }) => expectCleanLoad(page));
test('installable', ({ page, request }) => expectInstallable(page, request));
```

```yaml
# .github/workflows/ci.yml: see templates/ci.yml
jobs:
  pwa:
    uses: piekstra/pwa-kit/.github/workflows/pwa.yml@v0
    permissions: { contents: read, id-token: write }
    with: { hosting-target: groceries, site-url: https://example-groceries.web.app }
```

## Versioning

Tags `v0.x.y` are immutable; `v0` moves to the latest `v0.x.y`. Workflows reference `@v0`,
package installs pin `#v0.x.y`.

## Household rules

Apps put their data under `households/{householdId}/<collection>`. The project's single rules file
needs the household document rules (members read; members edit `name`/`members`; each member
appends only their own email to `joined`; creating starts with only the creator) plus, per app:

```
match /households/{householdId}/<collection>/{doc} {
  allow read: if isMember();          // and write rules as the app needs
}
```

## Theme with Tailwind v4

```css
@import 'tailwindcss';
@import '@piekstra/pwa-kit/theme.css';
@theme {
  --color-forest-700: var(--hh-forest-700);
  --color-cream: var(--hh-cream);
  --font-sans: var(--hh-font);
}
```
