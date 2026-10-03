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

- **One repo per app**. Its own CI, tests, staging runs and releases.
- **One Firebase project per family of apps** that share users and data, and **one site**: the
  portal at `/` of `<family>.web.app`, each app under its own path (`/pet/`), so the installed
  portal opens every app in one window and one sign-in covers all of them (see One site). Each app
  still has its own Firebase web app registration and its own Hosting site, which serves the
  redirect from its old address and, on staging, the app's pull requests.
  Unrelated or shareable projects get their own Firebase project.
- **Stack**: Vite + TypeScript, `vite-plugin-pwa` (Workbox), bun. React where the app has state;
  plain TS is fine for static pages like the portal.
- **Wire it up with `infra/bootstrap.sh <apps.conf>`**: add the repo to `APPS` and re-run. It creates
  the site and web app and sets the repo variables. Never hand-create deploy keys.

## PWA

- Manifest: `display: standalone`; `id`, `start_url` and `scope` the app's path (`/pet/`; the
  portal's `/`), icons at 192 and 512 plus a 512 maskable icon under it. Generate PNGs from one SVG
  (`bunx pwa-icons`).
- Use `pwaApp({ base: '/pet/' })` from `@huishouden/pwa-kit/vite`; `base` sets all of the above and
  Vite's `base`. It sets `registerType: 'autoUpdate'` (installed copies update on the next launch)
  and **`navigateFallbackDenylist`** with `/^\/__\//`. Firebase serves its sign-in popup at
  `/__/auth/handler`; without this the service worker answers it with the cached app and
  "Sign in with Google" opens the app instead of Google. The portal also passes `otherApps` (the
  paths in `apps.json`), so its worker never answers a navigation into an app with the portal.
- Hosting headers: each path's `sw.js`, `registerSW.js`, `index.html` and the manifest `no-cache`;
  `assets/` immutable for a year (the combined `firebase.json`, generated; see One site).
- Tablet first: test at 1280×800 landscape; tap targets at least 44 px.

## One site

All apps share one origin ([docs/one-site.md](docs/one-site.md) has the design and the reasons).

- **Paths**: `/` is the portal, `/<repo>/` each app. `apps.json` in the portal repo lists every app
  with its `path`; the portal's tiles, the site's routing and its headers come from it.
- **Links**: between apps, same-origin paths (`/`, `/pet/`, the portal's `/privacy`), never an
  absolute address, so staging links stay on staging. Anything stored or sent (agenda `url`,
  reminder `url`, invitations) uses `appUrl(import.meta.env.BASE_URL, …)` from `./site`: the
  page's origin plus the app's path. Inside an app, build paths from `import.meta.env.BASE_URL`;
  `location.pathname` includes the app's path.
- **Tests**: `BASE_URL` is the app's path (`https://<site>/pet/`), so specs navigate with relative
  paths (`./`, `?tab=care`); a leading `/` lands on the portal.
- **Storage**: every app shares `localStorage`, IndexedDB and Cache Storage. Prefix a new
  `localStorage` key with the app's short name (`pet-…`) unless sharing it is the point, and say
  so where it is defined. Shared on purpose: the Firebase Auth session (one sign-in), Firestore's
  cache (multi-tab, any app), the write outbox (`hh-outbox:`, replayed by whichever app opens
  next), Google API tokens (`hh-google-tokens`).
- **Deploys**: no repo deploys alone. `pwa.yml` with `base` publishes each build of `main` as the
  repo's `hosting` release asset and deploys the whole site from every app's latest asset; the
  portal reconciles every 30 minutes. A failed build never replaces an app's last good one.
- **Old addresses**: `<family>-<app>.web.app` 301s every path to the app's path, query kept, and
  serves a `/sw.js` that retires the old installed copy (`"redirect": true` in `apps.json`).

## Security headers

Every site sends these on its own pages (`templates/firebase.json`, values in
`@huishouden/pwa-kit/security-headers`):

| Header | Value | Stops |
|---|---|---|
| `X-Frame-Options` | `DENY` | another site framing the app (clickjacking) |
| `Content-Security-Policy` | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` | the same for current browsers; plugins; a `<base>` tag redirecting relative URLs |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | paths (record ids) leaking to other sites |
| `X-Content-Type-Options` | `nosniff` | a served file being run as another type |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | device features the app doesn't use |

- **Only on app paths.** The rule is `"regex": "^/(?:[^_].*|_[^_].*|_)?$"`, every path except
  Firebase's `/__/`: Google sign-in opens `/__/auth/handler` in a popup and frames `/__/auth/iframe`
  on the auth domain (the portal's site), so frame-denying those breaks sign-in. Never use
  `"source": "**"` for these headers.
- **Per app, the features it uses:** `camera=(self)` for an app that takes photos in the page
  (Pet's medicine labels, the contact screenshot reader), `geolocation=(self)` for one that asks
  where you are (Groceries' nearby stores, Tasks' nearby places). Microphone stays off everywhere.
- **Checked twice:** CI's `pwa-headers-check` (kit 0.43.0 and later) fails a `firebase.json`
  whose app paths lack a header or whose `/__/` paths would be frame-denied, and each app's smoke
  test calls `expectSecurityHeaders(request, '/', { camera, geolocation })` from `/e2e` against the
  live and staging sites, which also checks the site's `/__/auth/handler` is not frame-denied.
- **Sign-in on staging first:** a change to these headers goes through a staging deploy with
  `expectGoogleSignInPopup` (the real popup reaching accounts.google.com), since signed-in staging
  tests use custom tokens and never open the popup.

## Sign-in and data

- Firebase Auth with Google. `authDomain` is the project's `<project>.firebaseapp.com`:
  it is the only redirect URI the auto-created OAuth client allows. An app's own domain gives
  `Error 400: redirect_uri_mismatch` until its `/__/auth/handler` is added to that client.
- The OAuth consent screen is In production, External. Asking for sensitive scopes (Sheets,
  Drive) shows "unverified app" once per user and counts toward a lifetime cap of 100 users.
  Prefer designs that need no Google API scopes in the browser.
- Shared data lives in Firestore in the family's project. A project has exactly one rules file,
  so exactly one repo deploys it: a dedicated rules repo (for Huishouden, `huishouden/rules`),
  never an app's repo, so one app's failing build can't hold back everyone's rules. Apps send their
  rules blocks there, with emulator tests next to the others.
- Apps open Firestore with `initFirestore(app, { auth })` and write with `setDoc`, `updateDoc`,
  `deleteDoc`, `addDoc`, `writeBatch` and the field sentinels from `@huishouden/pwa-kit/firestore`,
  not `firebase/firestore`. A write reaches Firestore's offline cache a few milliseconds after the
  call returns; these also note it in localStorage at once, so an entry tapped in just before the
  app is closed or reloaded is written when it next opens instead of being lost. Writes stay
  fire-and-forget: the screen updates from the local cache, and errors go to a toast. CI's
  `pwa-write-check` fails app code that imports or re-exports a write function from `firebase/firestore`
  (or imports it whole, `* as`).
- People, accounts, card numbers and other personal facts are data, not code: keep them in the
  app's data store (a sheet tab, Firestore), never in the repo, including test fixtures (use
  made-up values). A leak scan can't recognise most of these, so this rule is the protection.
- Sample data should feel real: well-known national chains and services (a big grocery chain, a
  streaming service) make screenshots recognisable and are not sensitive. What stays invented is
  whatever could point at a real household: people's names, emails, addresses, account and card
  numbers, local or regional businesses, store numbers, and real amounts or dates copied from
  real records.

## Roles

Every member of a household has a role, set by an admin in the portal's household panel and
enforced by the rules, not just hidden in the apps (`@huishouden/pwa-kit/roles`, `huishouden/rules`
README "Roles"):

| | Admin | Member | Helper | Kid |
|---|---|---|---|---|
| Invite and remove people, set roles (never their own) | yes | | | |
| Settings: household name, food preferences, portal layout, an app's settings, lists, the meal plan, medicine courses | yes | yes | | |
| Read the everyday things, add their own, tick off anyone's | yes | yes | yes | yes |
| Change or delete what someone else added | yes | yes | | |
| Give medicine | yes | yes | if the course allows them | |
| Spending and Bills | yes | yes | | |
| Records marked private | yes | yes | | |

The creator is an admin; a new invitee is a member unless the admin picks another role. A helper
is a babysitter, a pet sitter or the shared wall tablet's account; a kid is a helper who never
gives medicine.

- **Hide, then explain.** Take `useRole(household, me)` once in the app's shell. Leave out the
  controls a role can't use (delete on someone else's item, settings, the private toggle) and, where
  a person would look for one, say why in one line with `RoleNote` (`refusal(action)`: "Only admins
  and members can change settings."). A refused write still shows that sentence, not a raw error.
- **Sign what you add.** Every record a helper or kid may add carries `by` (the adder's email) and
  keeps it on edits: that is what lets them change their own and nothing else. Ticking something
  off writes only the fields that tick it (`completed`, `done`, `lastDone`, `due`), never `by`.
- **Private records.** Contacts, appointments, agenda items and reminders take `private: true`
  ("Only admins and members", `PrivateCheckbox`). Write the flag on every save, `false` included:
  a record without it is private to helpers and kids. Their reads of those collections pass
  `restricted: isRestricted(role)` (`watchContacts`, `watchAgenda`, `syncAgenda`, `syncReminders`,
  ...) or add `where('private', '==', false)`, since the rules refuse a list that could include a
  private one. On an admin's or member's device, run `markUnflaggedOpen` on the app's appointments
  so older ones become visible to helpers. An appointment's agenda items and reminders take its flag.
- **Money.** Spending and Bills open to a one-line refusal for helpers and kids, and the portal
  hides their tiles. Their agenda items and reminders are always private (`MONEY_APPS`).
- **Medicine.** A course says who can give it (`givers`: all helpers, the default, or only
  `approvedHelpers`; `GiversField`). Check `mayGive(course, role, me)` before offering "Given".
- **Tests.** The rules repo tests every role against every collection. Each app's signed-in suite
  runs one flow as `test-helper@example.com` (a helper in the staging household): a refused action
  shows its sentence and a permitted one works.

## Shared code

- **Copy once, then extract.** When a second app needs code another app already has, it moves into
  the kit instead of being copied: time and due wording (`/time`), schedules (`/schedule`), money
  (`/money`), Google tokens (`/google-token`, `/gmail`), calendar import (`/calendar`,
  `/react/calendar`), contacts (`/contacts`, `/react/contacts`) and the React UI primitives
  (`/react/ui`, `/react/clock`) already have. Copies drift: before extraction four apps worded the
  same 60 days three ways.
- **Data actions are written once.** An app's actions build `Op` lists (`./store`) and run through
  one backend: `commitOps` to Firestore for a household, `useSampleStore` in memory for the
  signed-out sample, so the sample behaves exactly like the real app and a change can't be made in
  one and forgotten in the other. Each action that changes or removes something returns the `Undo`
  from `changes`, which the app's toast offers. Start-up is `initApp` (`./app`), logs read through
  `./log`, small charts are `QuantityChart` (`./react/chart`).
- **CI lists copies.** `pwa-reuse-check` (warnings in `pwa.yml`) names any app declaration that is a
  near copy of a kit export; import the kit's, or keep it with `// reuse-check:allow <reason>`.
- **The kit holds mechanism, the app holds policy.** Generic arithmetic, wording and components go
  in the kit; an app's own roles, search words, limits and labels are passed in as arguments.
- **Suggestions from Google services** (new calendar events, new Google Tasks) use `useSuggestions`
  (`./react/suggestions`): they look only with a token the device already has, never open Google's
  window, and say plainly that they stop an hour after the member last connected on that device.
- **Google API scopes go through `googleAccessToken`**, so a token is asked for once and reused for
  its hour across features, and a revoked one is forgotten on the 401. Tokens come from Google
  Identity Services' token client with the app's OAuth web client (`configureGoogleTokens` with
  `VITE_GOOGLE_CLIENT_ID` at startup), never from Firebase Auth: Firebase signs people in, and a
  popup re-sign-in for scopes fails whenever its sign-in backend does. Call it from a tap; code that
  runs when the app opens uses `cachedGoogleToken` and shows a button when there is none, so an
  app never opens Google's window by itself.

## Notifications

Reminders reach people as push notifications through one shared sender,
[huishouden/notify](https://github.com/huishouden/notify): a Cloudflare Worker (free plan) that runs
every five minutes for every household in the project, the same way. No app sends anything itself
and no household sets anything up.

- **Reminders are data.** An app writes them to `households/{id}/reminders` with
  `@huishouden/pwa-kit/reminders` (`upsertReminder`, or `replaceReminders(ref, remindersForCourse(...))`
  for a medicine course, or `syncReminders(app, list)` with everything an app works out from its
  data) and deletes them when they no longer apply. Each has an https deep link
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

## Calendar suggestions

An assistant that writes to Google Calendar ("add a vet appointment for Biscuit Tuesday at 3") is a
way to add things to an app. Every app with Import from calendar also offers what is new there on
its own, with `useCalendarSuggestions` and `CalendarSuggestions` from `/react/calendar`:

- **Same words, same import**: pass the app's Import from calendar word list and its `isImported`
  check, and call the same handler Add uses in the import dialog. An event is offered until it is
  added or the member says Not this one (kept per member on the device).
- **Never asks**: it looks only with a calendar token already on the device (`cachedCalendarToken`),
  on open and on return to view at most every 30 minutes, from now to 60 days ahead. Tokens last
  an hour from the member's last calendar search or import; without one there is no card and no
  prompt. The calendar token is kept in localStorage for that hour (read-only scopes), so any script
  on the app's origin and anyone using the device before it ends can read the calendar; sign-out
  clears it. Keep the origin free of third-party scripts.
- **Placement**: mount the hook once in the app's shell; show the card at the top of the main
  screen, under the frame, only when there is something new. One line, calm; never a dialog.
- **Tests**: `stubCalendar(page, { events })` from `/e2e` (sample app, signed out) with the clock
  set to the sample's day.

## Agenda

The portal shows one household calendar and a Today view built from every app's dates, without
reading any app's own collections. Each app publishes its dated things to `households/{id}/agenda`
with `@huishouden/pwa-kit/agenda`; the portal only reads.

- **What to publish**: anything with a date someone in the household would want on a calendar or
  in Today: appointments, jobs and services coming due, renewals and expiries, unpaid bills,
  birthdays, medicine courses, feeds not given yet. One item per date, `kind` from the fixed list,
  an https deep link to the record, and `status` (`upcoming`, `overdue`, `done`) for things someone
  has to do. Leave out logs of what already happened (a feed given, a payment made): those stay in
  the app. Feeds and doses (`feeding`, `medicine`) are one item per occasion; one not done by the
  end of its day drops out of Today as missed rather than staying overdue.
- **When**: on save, `replaceAgenda(ref, items)` for the record (or `removeAgenda` when it is
  deleted); on open, `syncAgenda(app, items)` with everything the app works out, which repairs what
  another device or an older version left behind. Both write only what changed.
- **Window**: from 30 days ago to 180 days ahead, plus overdue items whatever their age. Repeating
  things publish their next date, not every future one. Keep `title` and `detail` short (120 and
  200 characters) and in the app's own words ("Change HVAC filter", "$84.20, autopay off").
- **Privacy**: admins and members read every item; helpers and kids (and the shared wall screen,
  if its account is a helper) read only items with `private: false`. An item from a private record
  is published `private: true`; Spending's and Bills' always are. Keep a private detail in the app.
- **Rules**: the `agenda` block in the project's rules file; fields match `AGENDA_FIELDS`, and
  `by` must be the signed-in member.

## To-dos

The portal's To-do tab lists every app's open, actionable things in one place, sorted by when each
was added, so the household can clear out old ones in any app without opening it. Each app
publishes its open items to `households/{id}/todos` with `@huishouden/pwa-kit/todos`; the portal
reads them and runs the actions the app wrote down.

- **What to publish**: things someone has to do or decide, one item per record: open to-dos and
  chores, jobs due or overdue, checklist items, reminders due, unpaid bills. Not appointments that
  simply happen, and not logs. A list that is all small things (groceries) publishes one summary line
  (`status: 'info'`, no actions) linking to the app. `createdAt` is when the record was added (what
  "Older than 30 days" filters on), `due` its due day if it has one, `owner` who added it.
- **Actions**: `done` and `cancel`, each a short label ("Done", "Mark paid", "Skip", "Pause"), the
  ops that do it in the app's own collections (`TODO_COLLECTIONS`; merge ops on the fields that
  change), and who may (`roles`, plus `owner: true` for helpers' and kids' own records, `emails` for
  named members): the same the app's rules allow, so the portal hides what a role can't do. Cancel
  is the app's own notion and stays visible in its history (a cancelled to-do, a paused job, a
  skipped checklist item, a dismissed reminder). Use placeholders for anything about the moment it
  runs (`'$today'`, `'$today+3m'`, `'$now'`, `'$me'`, and `{ $nextDue: { schedule, due } }` for a
  repeating job's next due date, `./schedule` `nextDueAfterDone` as of the tap), never a date worked
  out when publishing.
- **When**: `syncTodos(app, items)` on open and a few seconds after the data changes, alongside
  `syncAgenda`. A record done or cancelled anywhere drops out on the next sync; the portal removes
  the item itself when it runs an action, and Undo writes the records and the item back.
- **Privacy**: as the agenda: helpers and kids read only `private: false` items, Spending's and
  Bills' are always private.
- **Rules**: the `todos` block; fields match `TODO_FIELDS` and `TODO_ACTION_FIELDS`, `by` is the
  signed-in member. The rules can't check ops (no loops), so the portal refuses an action writing
  outside the app's collections (`todoOpsAllowed`), and every op is checked by the target
  collection's own rules as the member who taps it.

## For named people only

Some records are about one person's care, and nobody else in the household reads them: a medicine
is for that person, their carers and the household's admins. Their dated things and open actions
still belong on the portal's Today, Calendar and To-do, and their reminders still go out, but only to
those people. They go to the personal collections instead of the shared ones (`./audience`):

| Shared | For named people | Publish with |
|---|---|---|
| `agenda` | `personalAgenda` | `syncPersonalAgenda(db, id, app, items, { by })` |
| `todos` | `personalTodos` | `syncPersonalTodos(db, id, app, items, { by })` |
| `reminders` | `personalReminders` | `syncPersonalReminders(db, id, app, reminders, by)` |

- **Audience**: each item names `audience`, the lowercase emails of the members who may read it
  (`cleanAudience`). The rules let only those members read, write or delete it, and the writer must
  be one of them. Kids are never in it. A reminder's `recipients` are some of its audience.
- **Each device keeps its own share current**: a sync reads and writes only the items naming the
  signed-in member, so every allowed member's device repairs the same items and nobody else's
  touches them.
- **Readers**: the portal follows a member's personal items next to the shared ones
  (`watchAgenda(..., { me })`, `watchTodos(..., { me })`); the sender reads `personalReminders` too.
- **What they say**: a person's name and the kind of thing ("Medicine for Nan"), never what the
  record holds (a medicine's name): the portal may be on a wall tablet. Notifications go to the
  recipients' own devices and may name it.
- **Never to analytics**: the app passes the names it holds to `setSensitiveWords` (`./observability`),
  which takes them out of everything sent to New Relic.
- **Rules**: the `personalAgenda`, `personalTodos` and `personalReminders` blocks; fields match
  `PERSONAL_AGENDA_FIELDS`, `PERSONAL_TODO_FIELDS` and `PERSONAL_REMINDER_FIELDS`.

## Food preferences

Meal suggestions in any app (Groceries' meal ideas, and whatever comes next) plan for the same people.
The portal's household panel edits one document, `households/{id}/settings/food`, with
`@huishouden/pwa-kit/food`; other apps only read it with `watchFood`.

- **People, not accounts**: every member is listed (`withMembers`), and people without an account
  (children, a regular guest) can be added. Each has diets from the fixed `DIETS` list, an `avoid`
  list of ingredients and a short note.
- **Constraints in words**: use `householdDietRules(food)` (and `pantryText`) in a prompt or next to
  a suggestion instead of wording diets per app, so GERD or pregnancy guidance reads the same
  everywhere. Allergies are strict; dislikes in `avoid` are preferences. Diets are rules or
  preferences per `DIET_STRICT` (`isStrict`, `GENTLE_DIETS`): GERD and low-sodium are preferences, so
  rank and label meals for them rather than filter; use `householdDietRules(food, { strictOnly: true })`
  for the rules and `householdDietPreferences(food)` for the rest.
- **Rules**: the `settings/food` case of the `settings` block checks the document's shape
  (`FOOD_FIELDS`, list sizes, the pantry, `by` the signed-in member). A request may evaluate only
  1000 expressions, too few to check every person's fields, so always write with `saveFood` (which
  clips each person to `FOOD_PERSON_FIELDS` and `FOOD_LIMITS`) and read with `watchFood`.

## Observability

The maintainers hear about a failure from the reports, not from a household. Every app sends
errors, speed and anonymous usage counts to one New Relic account on its free tier
(`@huishouden/pwa-kit/observability`; setup, alerts and dashboard in
[docs/observability.md](docs/observability.md)).

- **Start it first.** `startObservability({ app: 'baby', env: import.meta.env })` in `firebase.ts`
  (or `main.tsx`) before rendering. It reads `VITE_NEWRELIC_ACCOUNT_ID`, `VITE_NEWRELIC_APP_ID` and
  `VITE_NEWRELIC_BROWSER_KEY` (repo variables, public by design: the browser key can only send).
  Local builds, previews, staging and automated browsers send nothing.
- **Errors and performance are always on.** Uncaught errors and Core Web Vitals are automatic;
  `readError` and `googleFetch` report the failures they word or throw (not offline or an expired
  token); anything else handled goes through `reportError(e, { where: 'save feed' })`.
- **Usage is counted per visit, anonymously.** `track('log feed', { kind: 'bottle' })` for a feature
  used and `trackView(tab)` for a screen; action names and small enums only. The agent runs with
  session tracking off: no cookie and no localStorage id, so nothing links one visit to the next and
  no consent banner is needed. Households are counted by a hash of the id (`saveMyProfile` sets it).
  When the browser sends Global Privacy Control (or Do Not Track), usage counts and the household
  hash are skipped silently; errors and performance still go. There is no opt-out screen.
- **No personal data leaves the device.** No names, emails, household ids, entries, free text or
  query strings: messages, stacks and URLs pass through `redact` and the agent's obfuscation rules.
  An app holding names that could end up in an error (Health's medicines and people) registers them
  with `setSensitiveWords(app, words)`, and every report has them replaced with `[redacted]`.
  Geography is the country and region New Relic derives from the request; the city it also derives
  is dropped at ingest. No session replay, traces, AJAX URLs or click tracking.
- **Say so.** The portal's `/privacy` page (linked from every app's account menu as "Privacy" and
  from the portal's footer) says in plain words what is collected, what isn't and who provides it;
  each app's README has a Privacy section pointing to it.
- **Free.** 100 GB a month of ingest (the apps use megabytes), one full user, unlimited ping
  monitors, alerts and dashboards. A feature that would need more is a decision for the user.

## CI/CD

Every app's `.github/workflows/ci.yml` calls `pwa-kit/.github/workflows/pwa.yml@v0`
(`templates/ci.yml`), which runs these jobs on `ubuntu-latest`:

| Job | Runs on | Does |
|---|---|---|
| `leak-scan` | every PR and push | gitleaks on the added commits (`actions/leak-scan`) |
| `build` | every PR and push | `bun install --frozen-lockfile`, lint (`tsc --noEmit`), `pwa-design-check`, `pwa-write-check`, `pwa-headers-check`, unit tests, build |
| `publish` | push to `main`, with `base` | The build (and a staging build) as `site.tar.gz` / `site-staging.tar.gz` on the repo's `hosting` pre-release |
| `deploy` | push to `main`; the portal's schedule with `reconcile` | Keyless via Workload Identity Federation; with `base`, `pwa-site assemble` (every app's latest asset under its path, the combined `firebase.json`) and `firebase deploy`, rechecked for builds published meanwhile; without, `firebase deploy --only hosting:<target>` |
| `smoke` | after `deploy` | Playwright against the live app path |
| `staging` | same-repo PRs that change more than docs; manual runs with `staging-ref` | Build against the staging project, deploy to the app's staging site, seed, `e2e` and `e2e:signed-in` there (see Staging) |

- Repo variables (not secrets; the Firebase web config is public by design): `GCP_WIF_PROVIDER`,
  `GCP_DEPLOY_SA`, `VITE_FIREBASE_*` (the bootstrap sets them) and `VITE_NEWRELIC_*`
  (`infra/newrelic.ts`, see Observability).
- Deploy waits on `leak-scan` and `build`. `concurrency: cancel-in-progress` on every workflow.
- `pull_request` ignores `CHANGELOG.md` and `package.json`-only changes (`templates/ci.yml`): release
  PRs are opened by github-actions[bot], and GitHub holds a bot-opened PR's run for approval and
  fails it with no jobs when nobody approves. The release commit still runs everything on main.
- Real secrets (test account passwords, API tokens) go in GitHub Actions secrets and are read
  only in the jobs that need them. Never in argv, logs, or the repo.

## Staging

Risky changes are tried live, signed in, before they reach a household. Staging is a second
Firebase project, `huishouden-staging` (Spark, free), with its own Firestore, rules and Auth, so
nothing deployed or tested there can read or write real household data.

- **Sites**: each app has `huishouden-staging-<app>.web.app`; the portal is
  `huishouden-staging.web.app`. A PR deploys the whole suite there, as production is laid out: its
  own build under its path, every other app's latest staging build (`site-staging.tar.gz`) under
  theirs, so `https://huishouden-staging-pet.web.app/pet/` is the PR and `/` its portal. One site
  per app, so two repos' PRs never overwrite each other; a PR deploy replaces the app's previous
  one, and the PR comment says which commit is there.
- **When it deploys**: every pull request from a branch of the same repo (never a fork's) that
  changes more than `docs/`, `*.md` or `LICENSE`. The PR gets a comment with the URL and the result,
  and the `staging` environment links the deployment. A manual run of the app's `ci` workflow with
  `staging-ref` (a branch, tag or SHA) deploys that ref to staging instead of production. Main still
  deploys to production only.
- **What runs there**: the build with the `STAGING_VITE_FIREBASE_*` variables, the deploy, the seed
  (`pwa-staging seed`), then `e2e` and `e2e:signed-in` against the app's path on the staging site. A failure fails the
  PR's checks.
- **Test users**: `test-a@example.com` (admin), `test-b@example.com` (member) and
  `test-helper@example.com` (helper) (uids `test-a`, `test-b`, `test-helper`, emails verified), all
  in `households/test-household`. The seed rewrites the users and the
  household document on every run and leaves app data alone, so a test writes values unique to its
  run (a timestamp in a note, a budget from the run number) and looks for exactly those.
- **Signing in**: `signInTestUser(page, { email })` from `@huishouden/pwa-kit/e2e` mints a custom
  token with the staging deploy account (IAM `signJwt`, keyless), runs `signInWithCustomToken` on the
  site's own origin and opens the app signed in. It throws if the build's or the site's Firebase
  config names any project but `huishouden-staging` (or neither names one), and only the staging
  account can sign the token, so it cannot sign anyone in to production. Guard specs with `test.skip(!process.env.HH_STAGING_SA, ...)`.
- **Credentials**: Workload Identity Federation to the staging project only (`STAGING_GCP_*`); its
  provider accepts any branch of the owner's repos, but only jobs of the kit's `pwa.yml` at a
  release tag or of the rules repo's workflows. Its deploy account may deploy Hosting and rules,
  write Firestore, manage Auth users and sign its own tokens. Production's provider still accepts
  `main` only. There is no service-account key anywhere.
- **Rules**: `huishouden/rules` runs the emulator tests, then deploys to staging on every same-repo
  PR and on `main`, and to production on `main`. Staging carries whichever rules were deployed last.
- **By hand**: sign in with Google on a staging site to click through anything; a person starts
  with no household there and creates one on the staging portal. Flows that need Google's consent
  for an API (Gmail, Calendar, Contacts) stay manual: test users have no Google account, and the
  automated suites stub those APIs (`stubGoogleTokens`, `page.route`).
- **Not on staging**: push notifications (the sender reads production only) and Apps Script.
- **Setup**: `infra/bootstrap.sh --staging <apps.conf>` (with `STAGING_PROJECT` in the conf)
  creates the sites, web apps, Firestore, authorized domains, WIF and the `STAGING_*` variables.
  Until those variables exist the staging jobs skip, so apps can adopt this kit before staging does.

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
  4. Security headers on the app's pages and none that frame-deny `/__/auth/handler`
     (`expectSecurityHeaders`).
  5. Signed out, the "Sample data" banner is one line on a 390px phone (`expectCompactSampleBanner`).
  6. An app with section tabs shows them as the bottom bar on a 390px phone and in the app bar on a
     tablet (`expectBottomNav`).
- **Signed-in tests** (`bun run e2e:signed-in`, `e2e/signed-in.spec.ts`) run only on staging, as
  invented test users signed in with Firebase custom tokens (`signInTestUser`), never a Google
  account: Google blocks scripted sign-in to real accounts, and staging keeps tests away from real
  households. Cover the app's key flows end to end against real Firestore and the real rules.

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
