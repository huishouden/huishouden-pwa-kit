# pwa-kit

Building blocks for small installable web apps (PWAs) on Firebase Hosting, shared by a family of
apps that each live in their own repo. Every piece exists because an app hit the problem it solves.

| Piece | Path | What it does |
|---|---|---|
| App bar | `@huishouden/pwa-kit/app-bar`, `@huishouden/pwa-kit/react/app-bar` | `<hh-app-bar app glyph portal-url version>`: the Huishouden frame (family logo to the portal, "Huishouden" over the app name, `nav` and `actions` slots, Sign in with Google or the avatar with an account menu: name, email, All apps, Sign out, version). Raises `hh-sign-in` / `hh-sign-out`; the app sets `bar.user`. `AppBar` is the React 19 wrapper (`onSignIn`, `onSignOut`, `user`); `react` is an optional peer |
| Vite preset | `@huishouden/pwa-kit/vite` | `pwaApp({...})`: link-preview tags (description, Open Graph, `og.png` from `pwa-icons`; pass `url`), manifest, auto-updating service worker, and a navigation fallback that leaves Firebase's `/__/` paths alone (otherwise "Sign in with Google" opens the app in the popup) |
| Firebase config | `@huishouden/pwa-kit/firebase` | `firebaseConfigFromEnv(import.meta.env, fallback?)` from `VITE_FIREBASE_*`; auth domain defaults to `<project>.firebaseapp.com`, the only redirect the auto-created OAuth client allows |
| Silent sign-in | `@huishouden/pwa-kit/auth` | `signInSilently(auth, clientId)`: Google One Tap with auto-select into Firebase, so each app signs in without a click once the browser is signed in to Google; reports Google's reason when it can't |
| Household | `@huishouden/pwa-kit/household` | `watchHousehold`, `findHousehold`, `saveMyProfile`, `watchProfiles` (members' own names and photos), `inviteMember`, `removeMember`, `markJoined`, `createHousehold`: one `households/{id}` document (members by lowercase email) shared by every app; each app keeps its data in subcollections, so one invite opens every app |
| Design language | `DESIGN.md`, `bunx pwa-design-check` | The Huishouden look and behaviour every app follows; the check fails CI on off-palette colours, gradients, glass blur, other typefaces and emoji in UI |
| Calendar search | `@huishouden/pwa-kit/calendar` | `findCalendarEvents(auth, query or [theme words])`: read-only Google Calendar search across the person's calendars (asks for calendar access once in a popup); `searchPhrases`; tests set `window.__mockCalendarEvents`. |
| Contacts | `@huishouden/pwa-kit/contacts` | The household's shared contacts (`households/{id}/contacts`): `watchContacts(db, id, cb, { app })`, `addContact`, `updateContact`, `deleteContact`, `removeContactFromApp`, `restoreContact` (Undo); `apps` says which apps show each one. |
| Place lookup | `@huishouden/pwa-kit/places` | `searchPlaces(query)`: free OpenStreetMap search for a business's address, phone and website (no key, no billing); `mapsSearchUrl`, `telHref`. |
| Sign-in origin check | `@huishouden/pwa-kit/oauth-origins`, bin `pwa-oauth-origins` | `originStatus(clientId, origin)`: whether a site is an Authorized JavaScript origin of the OAuth client (Chrome's sign-in prompt needs it; Google has no API to add one). CI checks every deploy; the bootstrap lists any missing. |
| Invite email | `@huishouden/pwa-kit/invite` | `sendInviteEmail(auth, invite)`: the invitation from the inviter's own Gmail (one-time send permission); `inviteMailto` opens a prefilled draft instead. |
| Theme | `@huishouden/pwa-kit/theme.css` | Shared colours, radius, font, `.hh-button` and `.hh-avatar` (signed-in profile photo) as CSS variables (works with or without Tailwind) |
| Smoke checks | `@huishouden/pwa-kit/e2e` | Playwright helpers: `expectCleanLoad`, `expectInstallable`, `expectGoogleSignInPopup` (no credentials needed), `expectHuishoudenFrame(page, { app, portalUrl })` (the app bar, its portal link and the app name), `captureScreenshot` (deterministic README screenshots, refreshed by CI after each deploy) |
| Reusable CI/CD | `.github/workflows/pwa.yml` | leak scan, design check, build and unit tests, before/after screenshots commented on every PR, keyless deploy to Firebase Hosting, smoke tests against the live site, README screenshots |
| Releases | `.github/workflows/release.yml` | release-please: version bumps, `CHANGELOG.md` and tagged releases from Conventional Commit PR titles |
| Build stamp | `pwaApp()` | `import.meta.env.VITE_APP_VERSION` and `VITE_BUILD_SHA` in every build, for showing what's running |
| Leak scan | `actions/leak-scan` | gitleaks on the commits a PR or push adds; secrets plus personal mailbox addresses |
| Pre-commit hook | `templates/githooks/pre-commit` | the same scan before a commit exists |
| Icons | `bunx pwa-icons` | renders `public/icon.svg` to the 192, 512, maskable and Apple touch PNGs |
| Bootstrap | `infra/bootstrap.sh apps.conf` | creates the Firebase project, a Hosting site and web app per repo, Workload Identity Federation for GitHub, and the repo variables |
| Templates | `templates/` | `ci.yml`, `firebase.json`, `playwright.config.ts` for a new app |

The conventions behind these are in [STANDARD.md](STANDARD.md).

## Install

```sh
bun add -d @huishouden/pwa-kit@github:huishouden/pwa-kit#v0.17.0
```

Spell out the package name: `bun add github:huishouden/pwa-kit#…` alone fails with `DependencyLoop`.
The package is installed from git, so `dist/` is committed; CI fails if it is stale.

## Use

```ts
// vite.config.ts
import { pwaApp } from '@huishouden/pwa-kit/vite';
export default defineConfig({
  plugins: [pwaApp({ name: 'Groceries', description: '…', themeColor: '#1f3a2e', backgroundColor: '#f6f1e7' })],
});
```

```ts
// e2e/smoke.spec.ts
import { test } from '@playwright/test';
import { expectCleanLoad, expectInstallable } from '@huishouden/pwa-kit/e2e';
test('loads', ({ page }) => expectCleanLoad(page));
test('installable', ({ page, request }) => expectInstallable(page, request));
```

```ts
// Vanilla: the bar renders itself; the app owns sign-in.
import '@huishouden/pwa-kit/app-bar';
const bar = document.querySelector('hh-app-bar')!; // <hh-app-bar app="Groceries" glyph="cart" portal-url="https://example-portal.web.app">
onAuthStateChanged(auth, (user) => (bar.user = user));
bar.addEventListener('hh-sign-in', () => signInWithPopup(auth, new GoogleAuthProvider()));
bar.addEventListener('hh-sign-out', () => signOut(auth));
```

```tsx
// React 19
import { AppBar } from '@huishouden/pwa-kit/react/app-bar';
<AppBar app="Groceries" glyph="cart" portalUrl={PORTAL_URL} version={`${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`}
        user={user} onSignIn={signIn} onSignOut={signOut}>
  <nav slot="nav">…tabs…</nav>
  <button slot="actions">…</button>
</AppBar>
```

```yaml
# .github/workflows/ci.yml: see templates/ci.yml
jobs:
  pwa:
    uses: huishouden/pwa-kit/.github/workflows/pwa.yml@v0
    permissions: { contents: write, id-token: write }
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
@import '@huishouden/pwa-kit/theme.css';
@theme {
  --color-forest-700: var(--hh-forest-700);
  --color-cream: var(--hh-cream);
  --font-sans: var(--hh-font);
}
```
