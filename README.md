# pwa-kit

Building blocks for small installable web apps (PWAs) on Firebase Hosting, shared by a family of
apps that each live in their own repo. Every piece exists because an app hit the problem it solves.

| Piece | Path | What it does |
|---|---|---|
| App bar | `@huishouden/pwa-kit/app-bar`, `@huishouden/pwa-kit/react/app-bar` | `<hh-app-bar app glyph portal-url version>`: the Huishouden frame (family logo to the portal, "Huishouden" over the app name, `nav` and `actions` slots, Sign in with Google or the avatar with an account menu: name, email, All apps, Sign out, version). Raises `hh-sign-in` / `hh-sign-out`; the app sets `bar.user`. `AppBar` is the React 19 wrapper (`onSignIn`, `onSignOut`, `user`); `react` is an optional peer |
| Vite preset | `@huishouden/pwa-kit/vite` | `pwaApp({...})`: link-preview tags (description, Open Graph, `og.png` from `pwa-icons`; pass `url`), manifest, auto-updating service worker, and a navigation fallback that leaves Firebase's `/__/` paths alone (otherwise "Sign in with Google" opens the app in the popup); `push: true` adds the notification handlers to the service worker, `ocr: true` keeps the label and screenshot reader working offline, `shareTarget: true` puts the installed app in the Share menu (Android and desktop Chrome; iOS has no share targets) |
| Firebase config | `@huishouden/pwa-kit/firebase` | `firebaseConfigFromEnv(import.meta.env, fallback?)` from `VITE_FIREBASE_*`; auth domain defaults to `<project>.firebaseapp.com`, the only redirect the auto-created OAuth client allows |
| Silent sign-in | `@huishouden/pwa-kit/auth` | `signInSilently(auth, clientId)`: Google One Tap with auto-select into Firebase, so each app signs in without a click once the browser is signed in to Google; reports Google's reason when it can't |
| Household | `@huishouden/pwa-kit/household` | `watchHousehold`, `findHousehold`, `saveMyProfile`, `watchProfiles` (members' own names and photos), `inviteMember`, `removeMember`, `markJoined`, `createHousehold`: one `households/{id}` document (members by lowercase email) shared by every app; each app keeps its data in subcollections, so one invite opens every app |
| Design language | `DESIGN.md`, `bunx pwa-design-check` | The Huishouden look and behaviour every app follows; the check fails CI on off-palette colours, gradients, glass blur, other typefaces and emoji in UI |
| Calendar search | `@huishouden/pwa-kit/calendar` | `findCalendarEvents(auth, query or [theme words], { seriesStart, token })`: read-only Google Calendar search across the person's calendars (asks for calendar access once in a popup; the token is kept on the device until it ends; `token` uses a given one and never asks); with `seriesStart` a repeating match also says when its series began (a yearly birthday's first year); `searchPhrases`; `cachedCalendarToken` (never asks); importing events: `plainText(description, max)`, `isImported`, `notImported` (each new event once, soonest first), `calendarError`; suggestions: `newSuggestions`, `dismissedEvents` / `dismissEvent` (per member, localStorage), `suggestionWhen` ("Tue 3:00 PM"); tests set `window.__mockCalendarEvents` and `window.__mockCalendarToken`. |
| Contacts | `@huishouden/pwa-kit/contacts` | The household's shared contacts (`households/{id}/contacts`): `watchContacts(db, id, cb, { app })`, `addContact`, `updateContact`, `deleteContact`, `removeContactFromApp`, `restoreContact` (Undo); `apps` says which apps show each one. |
| Place lookup | `@huishouden/pwa-kit/places`, `@huishouden/pwa-kit/hours` | `searchPlaces(query, { near })`: free OpenStreetMap search for a business's address, phone, website and opening hours (no key, no billing); with `near`, kinds of place nearest first; `PlaceSearchUnavailable` when the free service is busy; `formatDistance` in miles or km by region; `mapsSearchUrl`, `telHref`. `hours`: `parseOpeningHours`, `isOpenAt`, `closesAt`, `describeDay`. For businesses the map lacks: `parsePlaceText(text)` reads Google Maps' Share text, a listing copied from Google Maps, Apple Maps or Yelp, or OCR text into `name`, `address`, `phone`, `website`, `email`, `mapsUrl`, `hours`, `category`, with every line it couldn't place in `unparsed` and listing chrome (ratings, buttons, distances) in `ignored`; `readPlaceScreenshot(image)` does the same from a listing screenshot (on-device OCR); `readSharedPlace(location)` reads a place shared into the app (`pwaApp({ shareTarget: true })`), `clearSharedPlace()` tidies the address bar after. |
| On-device OCR | `@huishouden/pwa-kit/ocr` | `readImageText(image, { screenshot })`: tesseract.js (English) loaded from jsDelivr at a pinned version on first use, so apps need no dependency; nothing is uploaded or stored. `screenshot: true` drops a phone's status bar, scales small text up and turns dark mode into dark-on-light. `releaseOcr`. Used by `readLabel` and `readPlaceScreenshot`. |
| Sign-in origin check | `@huishouden/pwa-kit/oauth-origins`, bin `pwa-oauth-origins` | `originStatus(clientId, origin)`: whether a site is an Authorized JavaScript origin of the OAuth client (Chrome's sign-in prompt needs it; Google has no API to add one). CI checks every deploy; the bootstrap lists any missing. |
| Invite email | `@huishouden/pwa-kit/invite` | `sendInviteEmail(auth, invite)`: the invitation from the inviter's own Gmail (one-time send permission); `inviteMailto` opens a prefilled draft instead. |
| Medicine labels | `@huishouden/pwa-kit/dose` | `readLabel(photo)`: on-device OCR of a pharmacy or vet label (`./ocr`, loaded only when used; nothing uploaded or stored); `parseDirections(text)`: once/twice daily, every N hours, BID/TID/QID/SID/q12h, morning/bedtime, for N days, until gone, with food, dose and name, with anything not understood in `unparsed` and every assumption in `assumptions`; `toMedCourse`, `doseTimes`, `courseDays`, `doseSlots`, `doseState`, `doseSummary` (due, missed, next). |
| Reminders | `@huishouden/pwa-kit/reminders` | `households/{id}/reminders`, any app's reminders delivered as push notifications by the shared sender ([huishouden/notify](https://github.com/huishouden/notify)): `upsertReminder`, `cancelReminder`, `cancelReminders(ref)`, `replaceReminders(ref, list)`, `remindersForCourse(course)` (one per future dose, idempotent ids), `watchReminders`; `REMINDER_FIELDS` for the rules. |
| Food preferences | `@huishouden/pwa-kit/food` | `households/{id}/settings/food`, who eats at home and what suits them, edited in the portal and read by any app that suggests meals: `watchFood`, `saveFood`, `withMembers` (every member listed, named from their profile), `DIETS` and `DIET_LABELS` (vegan, vegetarian, pescatarian, gluten-free, dairy-free, nut and shellfish allergies, GERD, pregnancy, low sodium, halal, kosher), per-person `avoid` list and note, `pantryAssumed` (kitchen basics, `DEFAULT_PANTRY`); `householdDietRules(food)` words it all as plain constraints from well-known guidance for a prompt or to show beside a suggestion (`{ strictOnly: true }` leaves out preference diets, which `householdDietPreferences` words softly; `DIET_STRICT`, `isStrict` and `GENTLE_DIETS` say which is which), `householdDiets` for filters, `pantryText`; `FOOD_FIELDS` and `FOOD_LIMITS` match the rules, which check the document's shape; `saveFood` clips each person to `FOOD_PERSON_FIELDS`.  Per-person spice tolerance (`spice`: none/mild/medium/hot; `householdMaxHeat`, `householdSpiceLines`). |
| Agenda | `@huishouden/pwa-kit/agenda` | `households/{id}/agenda`, every app's dated things in one place so the portal shows one household calendar and a Today view: `replaceAgenda(db, id, app, ref, items, { by })` when a record is saved, `removeAgenda(db, id, app, ref)` when it is deleted, `syncAgenda(db, id, app, items, { by })` on open (writes only what changed, deletes what is gone); idempotent ids (`agendaId`), published from 30 days back to 180 ahead (`inAgendaWindow`); `watchAgenda(db, id, { from, to, apps }, cb)`; `todayItems(items, now)` (overdue, today, next 48 hours, with the time in words), `agendaDays(items, now)` (by day, labelled), `agendaStatus` (an upcoming item turns overdue on its own), `agendaTime`; `AGENDA_FIELDS` match the rules. |
| Push notifications | `@huishouden/pwa-kit/push`, `pwaApp({ push: true })` | Web Push with VAPID, no Firebase Messaging: `pushSupport()` (with the reason and a sentence when unavailable, e.g. iPhone not added to the Home Screen), `enablePush(db, householdId, user, VITE_VAPID_PUBLIC_KEY, { app })`, `disablePush`, `pushEnabled`; `pwaApp({ push: true })` adds the service-worker handlers (show, tap to open the deep link); `PUSH_SUBSCRIPTION_FIELDS` for the rules. |
| Time and due dates | `@huishouden/pwa-kit/time` | Calendar days (`'YYYY-MM-DD'`, exact day arithmetic) and moments (ms): `addDays`, `addMonths` (clamps 31 January + 1 month to the end of February; `day` keeps the 31st for later months), `daysBetween`, `daysUntil`, `parseYmd`, `toYmd`; words: `formatSpan` ("3 weeks", rounded down or to the nearest month), `inDays`, `daysAgo`, `dueText` ("Due in 3 weeks", "Overdue by 5 days"), `dueHeadline` ("Overdue: gutter cleaning"), `dueState`, `formatDuration` / `formatAgo` ("2h 10m ago"), `agoWords` ("2 hours ago"), `relativeDay`, `dueWords`, `shortDate`, `longDate`; device-locale `formatTime`, `formatDayShort`…; `toLocalInput` / `fromLocalInput`. Pure: everything takes `now` or `today`. |
| Schedules | `@huishouden/pwa-kit/schedule` | `Schedule` (`after-done`: N units after the last time; `fixed`: anchored to the calendar): `firstDue`, `nextDueAfterDone` (doing an overdue job once covers the missed dates), `occurrenceOnOrAfter`, `occurrences`, `describeSchedule` ("Every 3 months on the 22nd"), `isSchedule`; usage-based `usageDue` (every N months or N miles/hours, whichever first, with `dailyPace` turning distance into days) and `afterUsage`; renewals `renewalDue`, `nextRenewal` (the anniversary stays put), `describeMonths`. |
| Money | `@huishouden/pwa-kit/money` | Integer cents for forms: `parseCents("$1,234.5")`, `formatCents(c, { headline })`, `centsToInput`; decimal-string `Money` for imported data: `toDecimal("(30.00)")`, `formatMoney`, `sumMoney`, `moneyToCents`, `centsToMoney`. No floats in sums. |
| Errors | `@huishouden/pwa-kit/feedback` | `readError(e, "Couldn't save")`: Firestore's codes in words (offline, not allowed); `popupCancelled`, `popupBlocked`, `accessDenied`, `googleAccessMessage(e, 'Gmail')` for Google's permission window. |
| Google API tokens | `@huishouden/pwa-kit/google-token` | `configureGoogleTokens({ clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID })` once at startup, then `googleAccessToken(auth, scopes, { persist })` from a tap: a token from Google Identity Services' token client (not Firebase Auth), with Google's consent screen only for scopes not yet allowed; reused for any request it covers until five minutes before it ends (cached per scope set; `persist` keeps it in localStorage so a reopened app needs no window); `cachedGoogleToken` (never asks, for code that runs on open), `forgetGoogleToken`, `googleFetch` (a 401 forgets the token). Failures are `GoogleTokenError`s (`popup_closed`, `popup_failed_to_open`, `access_denied`, `not_configured`); `googleAccessMessage` in `./feedback` words them. Calendar, invite and Gmail use it. |
| Gmail (read-only) | `@huishouden/pwa-kit/gmail` | `requestGmailToken(auth)` (from a tap) / `storedGmailToken(auth)` (no popup), `gmailMailbox(token)`: `search(q, max)`, `get(id)` (text and HTML parts), `headers(id)`; `toMailMessage`, `htmlToText` (table cells on one line, entities, invisible preheader padding), `gmailError`; tests set `window.__gmailTestToken`. For Bills and Spending reading the household's own statement and alert emails. |
| People | `@huishouden/pwa-kit/people` | `personName`, `personInitial`, `personColour` (a member's own colour, readable under white text) from a record's `by` email. |
| Avatar photos | `@huishouden/pwa-kit/photo`, `@huishouden/pwa-kit/react/photo` | For small avatars (a pet, a person, a car), not galleries: `pickPhoto()` opens the file chooser (camera too on phones); `squarePhoto(file, { size: 256, quality, maxChars, position })` crops square (`position` slides it along the long side), turns it upright from EXIF, shrinks it and encodes WebP (JPEG where the browser can't), lowering quality then size until the data URL is under `PHOTO_MAX_CHARS` (60 000), so it fits in a Firestore document on the free plan (no Cloud Storage); `PhotoError` says why in words; `isPhotoDataUrl`. `PhotoPicker` (React): tap the avatar or Choose photo, slide the crop, Use photo; Remove photo. Keep each photo in its own document so lists stay small. |
| UI primitives (React) | `@huishouden/pwa-kit/react/ui` | `Dialog` (bottom sheet on phones, Escape and scrim close), `Chip`, `Field`, `Checkbox`, `StatusPill`, `ErrorNotice` (Try again), `Toast` + `useToast` (Undo), `SectionTabs` (the app's tabs in the app bar's `nav` slot), `PersonBadge`; class strings `primaryButton`, `secondaryButton`, `ghostButton`, `iconButton`, `deleteButton`, `inputClass`, `selectClass`, `cardClass`, `overline`, `linkClass`. Needs Tailwind v4 with `@huishouden/pwa-kit/tailwind.css` and `lucide-react` (optional peers). |
| Clock (React) | `@huishouden/pwa-kit/react/clock` | `<ClockProvider read>` and `useClock()`: a `now` that moves every 15 s and when the screen comes back; `read()` for a write's timestamp; demo mode passes its own clock. |
| Calendar (React) | `@huishouden/pwa-kit/react/calendar` | `useCalendarSearch(auth, app)`, `CalendarFind` ("Find in my calendar" in a dialog), `CalendarImportDialog` (events not yet imported, Add, Add all), `LinkedEvent`, `CalendarHint`, `calendarAvailable`; `useCalendarSuggestions({ auth, words, isImported, app, horizonDays })` (new events in the next 60 days, looked for on open and on return to view at most every 30 minutes, only with a calendar token already on the device: `canScan`) and `CalendarSuggestions` (the one-line "New in your calendar" card with Add, Not this one and "+2 more"). With `plainText`, `isImported`, `notImported`, `calendarError` in `/calendar`. |
| Contacts (React) | `@huishouden/pwa-kit/react/contacts` | `ContactDialog` (OpenStreetMap business search first, then "Fill from a screenshot" and "Paste listing text" for businesses the map lacks, each filling the fields for the person to check and listing what wasn't used; `prefill` starts a new contact from a shared place; role chips, `contactInput` on save) and `ContactCard` (tap to call, email, website, map). With `groupContacts(contacts, roles)`, `contactInput`, `CONTACT_LIMITS`, `displayWebsite` in `/contacts`. |
| Tailwind theme | `@huishouden/pwa-kit/tailwind.css` | One import after `tailwindcss`: the palette as Tailwind colours, Inter, the shared page base (`body`, focus ring, reduced motion, `.safe-bottom`), and the kit's React components added to Tailwind's sources. |
| Theme | `@huishouden/pwa-kit/theme.css` | Shared colours, radius, font, `.hh-button` and `.hh-avatar` (signed-in profile photo) as CSS variables (works with or without Tailwind) |
| Smoke checks | `@huishouden/pwa-kit/e2e` | Playwright helpers: `expectCleanLoad`, `expectInstallable`, `expectGoogleSignInPopup` (no credentials needed), `expectHuishoudenFrame(page, { app, portalUrl })` (the app bar, its portal link and the app name), `captureScreenshot` (deterministic README screenshots, refreshed by CI after each deploy), `stubGoogleTokens(page, { token, fail })` (a stand-in for Google Identity Services so `googleAccessToken` flows run without a Google account), `stubCalendar(page, { events, cachedToken })` (Google Calendar and an already-granted calendar token, signed out), `signInTestUser(page, { email })` (staging only: signs a seeded test user in with a custom token) |
| Staging | `@huishouden/pwa-kit/staging`, bin `pwa-staging seed` | The staging project's invented test users and household (`TEST_USERS`, `TEST_HOUSEHOLD`), the idempotent seed, and keyless custom tokens for them; refuses any project but `huishouden-staging` (STANDARD.md "Staging") |
| Reusable CI/CD | `.github/workflows/pwa.yml` | leak scan, design check, build and unit tests, before/after screenshots commented on every PR, keyless deploy to Firebase Hosting, smoke tests against the live site, README screenshots |
| Releases | `.github/workflows/release.yml` | release-please: version bumps, `CHANGELOG.md` and tagged releases from Conventional Commit PR titles |
| Build stamp | `pwaApp()` | `import.meta.env.VITE_APP_VERSION` and `VITE_BUILD_SHA` in every build, for showing what's running |
| Leak scan | `actions/leak-scan` | gitleaks on the commits a PR or push adds; secrets plus personal mailbox addresses |
| Pre-commit hook | `templates/githooks/pre-commit` | the same scan before a commit exists |
| Icons | `bunx pwa-icons` | renders `public/icon.svg` to the 192, 512, maskable and Apple touch PNGs |
| Bootstrap | `infra/bootstrap.sh [--staging] apps.conf` | creates the Firebase project, a Hosting site and web app per repo, Workload Identity Federation for GitHub, and the repo variables; `--staging` does the same for the staging project with `STAGING_` variables |
| Templates | `templates/` | `ci.yml`, `firebase.json`, `playwright.config.ts` for a new app |

The conventions behind these are in [STANDARD.md](STANDARD.md).

## Install

```sh
bun add -d @huishouden/pwa-kit@github:huishouden/pwa-kit#v0.31.0
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

```ts
// A medicine label to a course and its dose reminders (the OCR engine downloads on first use).
import { parseDirections, readLabel, toMedCourse } from '@huishouden/pwa-kit/dose';
import { remindersForCourse, replaceReminders } from '@huishouden/pwa-kit/reminders';
import { enablePush, pushSupport } from '@huishouden/pwa-kit/push';
const parsed = parseDirections(await readLabel(photo)); // show parsed.unparsed and parsed.assumptions for checking
const course = { id, ...toMedCourse(parsed, { startDate: '2026-03-14' }) };
await replaceReminders(db, householdId, `pet:course:${id}`,
  remindersForCourse(course, { app: 'pet', url: `https://example-pet.web.app/meds/${id}` }), user.email);
// Settings: a "Notify me" button (pwaApp({ push: true }) in vite.config.ts)
const support = pushSupport(); // { supported: false, message } explains iPhone Home Screen etc.
await enablePush(db, householdId, user, import.meta.env.VITE_VAPID_PUBLIC_KEY, { app: 'pet' });
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
/* src/index.css: the palette, Inter, the shared page base, and the kit's React components as sources */
@import 'tailwindcss';
@import '@huishouden/pwa-kit/tailwind.css';
```

Apps without Tailwind import `@huishouden/pwa-kit/theme.css` for the `--hh-*` variables and `.hh-button`.

```tsx
// React UI: the same dialog, toast with Undo and contacts screen in every app
import { Dialog, Toast, useToast, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { ContactCard, ContactDialog } from '@huishouden/pwa-kit/react/contacts';
import { groupContacts } from '@huishouden/pwa-kit/contacts';
import { dueText } from '@huishouden/pwa-kit/time';
const { toast, notify, clear } = useToast();
notify('Deleted Example Vet', () => restore(contact));
<Toast toast={toast} onDone={clear} />
<ContactDialog contact={null} app="pet" roles={ROLES} namePlaceholder="Example Vet Clinic" onSave={save} onClose={close} />
dueText('2031-11-04', today); // "Due in 3 weeks"
```

### Filling a contact when OpenStreetMap doesn't know the business

OpenStreetMap often lacks local businesses (a vet hospital, a groomer). Three free ways in, all
landing in `ContactDialog` for the person to check, with anything not understood listed under it:

1. **Screenshot.** In Google Maps, open the business and take a screenshot; in the dialog, "Fill
   from a screenshot". Read on the device (the OCR engine, a few megabytes, downloads on first use).
2. **Paste.** Copy the listing's text (Google Maps on a computer, Apple Maps, Yelp, or Google
   Maps' Share text) and use "Paste listing text".
3. **Share** (Android and desktop Chrome, installed app): Google Maps → Share → the app. iOS
   doesn't support web share targets, so on iPhone use a screenshot or paste.

```tsx
// vite.config.ts: pwaApp({ ..., shareTarget: true })
import { clearSharedPlace, readSharedPlace } from '@huishouden/pwa-kit/places';
const shared = readSharedPlace(window.location); // null on an ordinary launch
if (shared) clearSharedPlace();
<ContactDialog contact={null} app="pet" roles={ROLES} prefill={shared?.place} onSave={save} onClose={close} />
```

The share target launches `/?share_title=…&share_text=…&share_url=…`: browsers replace the query
of a GET share target's action, so the marker is in the parameter names rather than `?share=1`
(hand-made `?share=1&title=…&text=…&url=…` links are read too).

## Paid options

Everything here is free to run. [docs/paid-options.md](docs/paid-options.md) lists the paid services the apps would adopt if the household decides to pay (Google Places, Firebase Blaze, the Gemini paid tier), what each adds over the free option, and which features would change.
