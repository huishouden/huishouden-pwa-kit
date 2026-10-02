# Proposal: shared building blocks for the next Huishouden apps

Status: draft for review. Nothing here is built yet.

The kit today covers the outside of an app: build, install, sign-in plumbing, the household
document, the look, CI. The inside of each app (frame, session wiring, subscriptions, undo, time
wording, demo data) is written again in every repo. Four app ideas are next: Bills, Home, Today
and Pet. Each needs most of the same inside pieces, and two of them need data that only exists on
a local machine. This proposal lists those pieces, gives each an API and a home in the kit, and
orders the work.

Examples use invented values throughout. Providers are named by kind ("electric utility",
"mortgage servicer", "HOA"), never by company.

## Contents

1. [What exists today](#1-what-exists-today)
2. [The app ideas](#2-the-app-ideas)
3. [Patterns shared by two or more apps](#3-patterns-shared-by-two-or-more-apps)
4. [Building blocks](#4-building-blocks)
5. [Household sync](#5-household-sync)
6. [The Today summary contract](#6-the-today-summary-contract)
7. [Roadmap](#7-roadmap)
8. [Enforcement](#8-enforcement)
9. [Open questions](#9-open-questions)

---

## 1. What exists today

| App | Stack | Kit modules imported | Written by hand that another app also wrote |
|---|---|---|---|
| Portal (`huishouden`) | vanilla TS | `firebase`, `auth`, `household`, `theme.css` | account chip and menu, sign-in/out, app registry (`src/apps.ts`) |
| Spending (`huishouden-spending`) | React 19 | `firebase`, `auth`, `theme.css` | frame header, Firestore init with offline cache, household lookup, money formatting (two copies in one app), sample-data mode, install prompt, ambient clock |
| Tasks (`huishouden-tasks`, `web/`) | React 19 | none | Firebase init, auth hook, household hook and membership writes, resilient snapshots, undo toast, error wording, dialog/chip/button classes, wake lock, install prompt, theme, clock, due-date wording, rules file |
| Baby (`huishouden-baby`, in progress) | React 19 | `firebase`, `auth`, `household`, `theme.css` | frame header with account menu, Firestore init, session wiring, toast with undo, error wording, dialog/chip/field classes, clock, day maths, demo store, checklists, appointments, event log |

Specific findings that shape the proposal:

| # | Finding | Where |
|---|---|---|
| F1 | Four hand-built frames. Only Baby has the house mark, the portal link and the avatar. None has the app switcher. Tasks' header shows a pre-suite app name and no portal link. The portal URL is hard-coded in two apps. | portal `index.html` + `src/account-chip.ts`; Spending `src/components/InteractiveDashboard.tsx` (header block, ~470 lines with its menu); Tasks `web/src/App.tsx` (header); Baby `src/components/Header.tsx` |
| F2 | `DESIGN.md` promises `<hh-app-bar>` and `expectHuishoudenFrame`. Neither exists in the kit. | `DESIGN.md` "Frame" and "Enforcement" |
| F3 | Three household lookups that can disagree. The kit picks the oldest household. Spending takes `limit(1)` with no ordering, so a person in two households can land in a different one in Spending. Tasks ignores households that exist only as an unacknowledged local write; the kit does not, so a just-created household reads as ready before the server accepts it and the first subscriptions are refused. | kit `src/household.ts`; Spending `src/services/firestoreTransactions.ts` `findHouseholdId`; Tasks `web/src/data/store.ts` `useHousehold` |
| F4 | Tasks re-implements `createHousehold`, `addMember`, `markJoined`, `removeMember` with different signatures from the kit. | Tasks `web/src/data/store.ts` |
| F5 | Firestore listeners die on their first error. Tasks wraps them in `resilientSnapshot` with backoff. Baby and Spending do not. | Tasks `web/src/data/store.ts`; Baby `src/data/useLiveStore.ts`; Spending `src/services/firestoreTransactions.ts` |
| F6 | Two undo toasts and two error-wording helpers with the same intent and different copy. | Tasks `web/src/components/UndoToast.tsx`, `web/src/lib/errors.ts`, `web/src/components/ErrorNotice.tsx`; Baby `src/components/ui.tsx` `Toast`, `src/data/useLiveStore.ts` `readError` |
| F7 | Three clocks: 1 s, 15 s, and 15 s plus a refresh on `visibilitychange`. | Spending `src/components/AmbientDashboard.tsx`; Tasks `web/src/views/HubView.tsx`; Baby `src/clock.tsx` |
| F8 | Two sets of day maths and due-date wording. | Tasks `web/src/data/model.ts` (`formatDue`, `isOverdue`, `upcomingItems`); Baby `src/lib/time.ts` (`startOfDay`, `relativeDay`, `countdown`, `formatAgo`) |
| F9 | The rules file for the whole project lives in Tasks. Other apps send their blocks there as prose (`docs/firestore-rules-spending.md`). Baby's blocks are already in it. Only Tasks has rules tests. | Tasks `firestore.rules`, `web/test/rules/firestore.rules.test.ts` |
| F10 | A server-side writer already exists: Spending's Apps Script mirror (stable ids from a hash, fingerprint diff so steady state costs no writes, delete-missing, 500-write batches). It writes with its owner's IAM access, so it bypasses rules. | Spending `apps-script/Firestore.gs` |
| F11 | The Firebase project is on the free plan. There are no Cloud Functions, so anything derived (summaries, reminders) has to be written by a browser, the Apps Script, or a local machine. | portal `STANDARDS.md` |
| F12 | The local account CLIs already share a contract: `--json` on every command, `"schema": "<name>/v1"` tags, money as `{"amount": "12.34", "currency": "USD"}`, exit codes 3 (sign in again) and 5 (provider problem, retry later). Utility-style CLIs emit `utility-summary/v1` (balance, due date, optional autopay). A local dashboard (`utiman`) already runs those summaries from launchd. | CLI family spec (`cli-common` `DESIGN.md` §1.4, §1.5, §1.8) |

---

## 2. The app ideas

### Privacy levels

Every entity below carries one of three levels. They decide what the shared wall screen may show.

| Level | Meaning | Examples |
|---|---|---|
| `wall` | Fine on the shared wall screen, readable by a guest | task names, baby feeds and sleeps, bill names, due dates and autopay flags, pet medication due |
| `wall-masked` | Shown on the wall with the value hidden until someone taps it or turns off privacy mode | bill amounts, spending totals and pace |
| `member` | Personal devices only | vendor phone numbers, policy and account references (stored only as the last 4 at most), private calendar entries, individual card transactions |

The wall tablet signs in as a household member, so Firestore rules cannot tell it from a phone.
Until that changes (see [open question Q3](#9-open-questions)), `wall-masked` and `member` are
display rules enforced by the kit's components, not access control. Data that must never reach
the wall (anything beyond the last 4 of an account number, for example) is not synced at all.

### Bills

The next 30 days of bills, with the ones that will not pay themselves called out.

| | |
|---|---|
| Entities | **Bill** (one per provider: kind, label, due date, amount due, autopay state, status, pay link); **BillHistory** (past due dates and amounts, for a trend line); **ManualBill** (providers with no CLI: insurance premiums, tolls) with a recurrence; **SyncStatus** (per provider: last success, outcome) |
| Screens | *Upcoming*: list sorted by due date, grouped "Overdue / This week / Later this month"; a row is attention-coloured (terracotta) when it is due within 7 days and autopay is off or unknown. *Provider detail*: amount trend, last payments, autopay state, "Open the provider's pay page" hand-off, sync health. *Add a bill*: manual recurring bill. |
| Data sources | Local CLIs on an always-on Mac, through [household sync](#5-household-sync): utility CLIs (`utility-summary/v1`), the mortgage servicer CLI (separate summary and autopay commands, not yet on the profile), two HOA CLIs (one on the profile, one with its own summary). Insurance and tolls: members enter them. |
| Cadence | Sync every 6 hours (scrapers should be polite; due dates move monthly). The browser streams with `onSnapshot`. |
| Privacy | Name, due date, autopay: `wall`. Amount: `wall-masked`. Account references: never synced. |
| Today card | "3 bills in the next 7 days; 1 without autopay", the soonest three rows. |

### Home

Maintenance, service history and warranties for the house.

| | |
|---|---|
| Entities | **Asset** (HVAC unit, water heater, appliance: name, location in the house, install date, warranty end); **MaintenanceTask** (title, recurrence, last done, next due, linked asset, vendor); **ServiceVisit** (date, vendor, what was done, cost, linked task or asset: an event log); **Vendor** (name, phone, notes); **Renewal** (insurance, HOA notices: a dated item with a recurrence); later **Scene** (smart-home routine alias) |
| Screens | *Due soon*: maintenance and renewals in the next 30 days, overdue first, one-tap "Done" (with undo) that rolls the recurrence forward. *History*: service visits newest first, filter by asset. *Assets*: warranties, with the ones ending within 90 days highlighted. *Vendors*. Later *Scenes*: a few large buttons. |
| Data sources | Members. HOA notices could come from the HOA CLIs' `documents list` (title and date only) through sync. Smart-home scenes would need a command path back to the Mac (deferred, [§7](#7-roadmap)). |
| Cadence | Realtime. |
| Privacy | Tasks, due dates, assets, history: `wall`. Costs: `wall-masked`. Vendor contacts: `member`. |
| Today card | "Change HVAC filter, due Saturday", "Pest control visit Tuesday". |

### Today

The wall tablet's ambient view, inside the portal.

| | |
|---|---|
| Entities | none of its own. It reads **TodaySummary** documents (one per app, [§6](#6-the-today-summary-contract)), **CalendarEvent** documents (synced), and the weather. |
| Screens | One screen: date and time, weather now and the next hours, today's and tomorrow's calendar, then one card per app summary (Tasks, Bills, Baby, Spending, Home, Pet), each linking into its app. Dark ambient mode per `DESIGN.md`, screen kept awake, a privacy toggle for `wall-masked` values. |
| Data sources | Summaries: written by each app and by sync. Calendar: synced from the Mac, so the wall tablet never holds a Google API token (hourly expiry and the "unverified app" screen are why Spending moved off browser tokens). Weather: a public forecast API with no key, fetched by the browser from a location kept on the device (rounded to about 1 km). |
| Cadence | Summaries and calendar: realtime from Firestore; calendar synced every 15 minutes. Weather: every 30 minutes. Clock: every 15 seconds. |
| Privacy | Renders each item at its own level; `member` items never render on the wall. Calendars marked private in sync config show as "Busy". |

### Pet

| | |
|---|---|
| Entities | **PetProfile** (name, species, birth date); **MedicationSchedule** (prevention or medication, recurrence, next due); **Dose** (event log: given at, by, which medication); **WeightEntry** (event log with a quantity and a unit); **VetVisit** (appointment: date, clinic label, reason, notes); **Vaccination** (name, given, next due) |
| Screens | *Overview*: next dose due, next vet visit, weight trend. *Log*: "Gave medication", "Weighed" with large buttons and undo. *Schedule*: medications and vaccinations with due dates. *Visits*. |
| Data sources | Members. |
| Cadence | Realtime. |
| Privacy | All `wall`, clinic contact details `member`. |
| Today card | "Heartworm prevention due tomorrow", "Vet visit Thursday 10:00". |

### Existing apps, for the pattern count

| App | Entities that recur elsewhere |
|---|---|
| Baby | profile, **event log** (feed, sleep, diaper, pump; with undo), **checklists** (grouped, ordered, seeded once), **appointments**, countdowns |
| Tasks | lists and items with **due dates** and **checklist** subtasks, ordering by position, undo for delete and clear, kitchen hub ambient view |
| Spending | mirrored data written by a server, **money**, ambient dock mode, **privacy mode** (amounts hidden), sample data |

---

## 3. Patterns shared by two or more apps

`●` already written, `○` needed by a proposed app.

| Pattern | Portal | Spending | Tasks | Baby | Bills | Home | Today | Pet | Building block |
|---|---|---|---|---|---|---|---|---|---|
| App frame and account menu | ● | ● | ● | ● | ○ | ○ | ○ | ○ | [B1](#b1-app-frame-hh-app-bar-and-app-registry) |
| Auth plus household session | ● | ● | ● | ● | ○ | ○ | ○ | ○ | [B2](#b2-session) |
| Firestore init with offline cache | ● | ● | ● | ● | ○ | ○ | ○ | ○ | [B2](#b2-session) |
| Resilient subscriptions | | ● | ● | ● | ○ | ○ | ○ | ○ | [B3](#b3-firestore-subscriptions-and-typed-collections) |
| Error wording, toast, undo | | | ● | ● | ○ | ○ | | ○ | [B4](#b4-feedback-errors-toasts-undo) |
| Clock, day maths, due wording | | ● | ● | ● | ○ | ○ | ○ | ○ | [B5](#b5-time-and-due-dates) |
| Recurring schedules | | | | | ○ | ○ | | ○ | [B6](#b6-recurring-schedules) |
| Checklists | | | ● | ● | | ○ | | | [B7](#b7-checklists) |
| Appointments | | | ● | ● | | ○ | ○ | ○ | [B8](#b8-appointments) |
| Event log with undo | | | | ● | ○ | ○ | | ○ | [B9](#b9-event-log) |
| Money and privacy mode | | ● | | | ○ | ○ | ○ | | [B10](#b10-money-and-privacy-mode) |
| Demo / sample data | | ● | | ● | ○ | ○ | ○ | ○ | [B11](#b11-demo-mode) |
| Wake lock, install, online, theme, ambient | | ● | ● | ● | | | ○ | | [B12](#b12-device) |
| Dialog, chip, field, card | ● | ● | ● | ● | ○ | ○ | ○ | ○ | [B13](#b13-ui-primitives) |
| People (names, initials, colours) | ● | | ● | ● | ○ | ○ | | ○ | [B14](#b14-people) |
| Rules per collection, rules tests | | ● | ● | ● | ○ | ○ | ○ | ○ | [B15](#b15-rules-fragments-and-rules-tests) |
| Server-written mirror | | ● | | | ○ | ○ | ○ | | [§5 household sync](#5-household-sync) |
| "Next due" summary for another screen | | | ● (hub) | ● (overview) | ○ | ○ | ○ | ○ | [§6 Today summary](#6-the-today-summary-contract) |

---

## 4. Building blocks

### Framework story

- **Cores are framework-free TypeScript** with `firebase` as the only runtime dependency: pure
  functions and `watch*(…, onChange) → Unsubscribe` subscriptions. The vanilla portal uses these
  directly.
- **`@piekstra/huishouden-pwa-kit/react`** holds thin hooks over the cores (`useSession`,
  `useCollection`, `useNow`) and the React components. `react` becomes an optional peer
  dependency, like `@playwright/test` is today.
- **Custom elements** for UI that the portal and the React apps both show: `<hh-app-bar>`,
  `<hh-toast>`, `<hh-amount>`, `<hh-today-card>`. Every app is on React 19, which passes
  properties and listens to custom events on custom elements natively, so no wrappers are needed
  beyond types. Registered from `@piekstra/huishouden-pwa-kit/elements`. Chrome lives in shadow
  DOM, styled by `--hh-*` variables (which cross the shadow boundary); app content goes in slots,
  so it stays in light DOM and Tailwind keeps working on it.
- **CSS component classes** in `theme.css` (`.hh-card`, `.hh-chip`, `.hh-input`,
  `.hh-button--ghost`, `.hh-dialog`) so vanilla and React share one definition of each shape.
- New subpaths follow the existing pattern: `src/<name>.ts` → `dist/`, one `exports` entry each.

### Summary of blocks

| Id | Block | Subpath | Replaces (copies) | When |
|---|---|---|---|---|
| B1 | App frame and app registry | `./elements` (`<hh-app-bar>`), `./apps` | 4 | now |
| B2 | Session: Firebase init, sign-in, household | `./firebase`, `./session`, `./household`, `./react` | 4 | now |
| B3 | Firestore subscriptions and typed collections | `./firestore`, `./react` | 3 | now |
| B4 | Feedback: errors, toasts, undo | `./feedback`, `./elements`, `./react` | 2 | now |
| B5 | Time and due dates | `./time`, `./react` | 3 | now |
| B6 | Recurring schedules | `./schedule` | 0 (3 consumers coming) | with Bills or Home |
| B7 | Checklists | `./checklist` | 2 | with Home |
| B8 | Appointments | `./appointments` | 2 | with Pet or Home |
| B9 | Event log | `./log` | 1 (3 consumers coming) | with Pet |
| B10 | Money and privacy mode | `./money`, `./elements` | 2 in Spending | now (small) |
| B11 | Demo mode | `./demo` | 2 | with the next app |
| B12 | Device: wake lock, install, online, theme, ambient | `./device`, `./react` | 2–3 each | now |
| B13 | UI primitives | `theme.css`, `./react/ui` | 2–4 | now |
| B14 | People | `./people` | 2 | with the next app |
| B15 | Rules fragments and rules tests | `rules/`, `./rules-test`, `bunx pwa-rules` | 1 file + prose | now |
| B16 | Household sync contract | `./sync` + `hh-sync` runner | 1 (Apps Script) | with Bills |
| B17 | Today summary contract | `./summary`, `./elements` | 0 | with Today |

---

### B1. App frame (`<hh-app-bar>`) and app registry

One element gives every app the frame `DESIGN.md` describes: house mark linking to the portal,
the app's name, the app switcher, a slot for the app's own navigation, and the avatar with its
account menu.

```ts
// @piekstra/huishouden-pwa-kit/apps
export interface HouseholdApp {
  id: string;                 // 'spending', 'bills', ...; also the Today summary doc id
  name: string;               // 'Spending'
  description: string;
  url: string;
  glyph: Glyph;               // from ./logo
  live: boolean;
}
/** Fetches the registry the portal publishes at /apps.json; cached by the service worker. */
export function loadApps(portalUrl: string): Promise<HouseholdApp[]>;
export function portalUrlFromEnv(env: Record<string, unknown>): string; // VITE_HH_PORTAL_URL
```

```html
<!-- @piekstra/huishouden-pwa-kit/elements -->
<hh-app-bar app="baby" portal="https://example-portal.web.app">
  <nav slot="sections">…the app's tabs, Tailwind as usual…</nav>
  <button slot="actions">…optional app actions…</button>
</hh-app-bar>
```

```ts
interface HhAppBar extends HTMLElement {
  app: string;
  portal: string;
  user: { email: string | null; displayName: string | null; photoURL: string | null } | null;
  version: string;            // shown in the account menu; defaults to VITE_APP_VERSION (VITE_BUILD_SHA)
  // events: 'hh-sign-in', 'hh-sign-out' (the app owns the Firebase calls), 'hh-switch-app'
}
```

- The registry moves out of the portal's `src/apps.ts` into a static `public/apps.json` the
  portal deploys. Every app reads it, so adding an app touches one file, and the kit (public)
  never holds the household's URLs. `bootstrap.sh` sets `VITE_HH_PORTAL_URL` with the other
  variables.
- Account menu behaviour comes from the portal's `account-chip.ts` and Baby's `AccountMenu`:
  `referrerPolicy="no-referrer"` on the photo, initial as fallback, Escape and outside-click close.
- `expectHuishoudenFrame(page)` lands in `./e2e` with it: cream page, Inter, an `hh-app-bar`
  whose house link points at the portal.

**Replaces:** portal `index.html` header and `src/account-chip.ts`; Spending
`src/components/InteractiveDashboard.tsx` header (the month switcher, refresh and menu move into
slots); Tasks `web/src/App.tsx` header (modes into `sections`); Baby `src/components/Header.tsx`.

**Migration:** Baby (closest to the target) → portal → Spending → Tasks.

---

### B2. Session

The sequence every app writes: init Firebase with an offline cache, try silent sign-in, follow the
auth state, find the household, record the first visit, and branch on the result.

```ts
// @piekstra/huishouden-pwa-kit/firebase (additions)
export interface HouseholdFirebase { app: FirebaseApp; auth: Auth; db: Firestore }
export interface InitOptions {
  /** Persistent multi-tab cache. Default true: apps open with last data and accept writes offline. */
  offline?: boolean;
  /** Emulator wiring for local tests, including window.__testSignIn(email, name). */
  emulators?: { auth: string; firestore: { host: string; port: number } };
}
export function initFirebase(config: FirebaseWebConfig, options?: InitOptions): HouseholdFirebase; // idempotent

// @piekstra/huishouden-pwa-kit/session
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; silentReason?: string }
  | { status: 'no-household'; user: User; email: string }
  | { status: 'error'; user: User | null; error: FriendlyError }
  | { status: 'ready'; user: User; email: string; household: Household };

export function watchSession(
  fb: HouseholdFirebase,
  options: { googleClientId?: string },
  onChange: (state: SessionState) => void,
): Unsubscribe;
/** Popup; falls back to redirect where popups are blocked; resolves quietly if the person closes it. */
export function signInWithGoogle(auth: Auth): Promise<void>;
/** Disables One Tap auto-select, then signs out. */
export function signOutEverywhere(auth: Auth): Promise<void>;

// @piekstra/huishouden-pwa-kit/react
export function useSession(fb: HouseholdFirebase, options?: { googleClientId?: string }): SessionState;
```

Changes to `./household`:

- `watchHousehold` reports only households the server has acknowledged (Tasks' rule, F3), and
  keeps oldest-wins.
- `createHousehold(db, email, name, seed?: (batch, householdId) => void)`: one batch, so an app
  can create its starter docs with the household (Tasks' default lists).
- `findHousehold(db, email): Promise<Household | null>` for one-shot callers, with the same
  ordering, replacing Spending's `limit(1)` lookup.

**Replaces:** Spending `src/services/auth.ts` (Firebase part), `src/services/firestoreTransactions.ts`
`getDb`/`findHouseholdId`, `src/App.tsx` household effects; Tasks `web/src/lib/firebase.ts`
(keeps its `/__/firebase/init.json` loading as a config source passed to `initFirebase`),
`web/src/data/store.ts` `useAuth`, `signIn`, `signOut`, `useHousehold`, `createHousehold`,
`addMember`, `markJoined`, `removeMember`; Baby `src/data/firebase.ts`, the session half of
`src/App.tsx`; portal `src/firebase.ts`, the auth/household half of `src/household-panel.ts`.

**Migration:** kit fix for F3 first (a patch release) → Baby → portal → Spending → Tasks.

---

### B3. Firestore subscriptions and typed collections

```ts
// @piekstra/huishouden-pwa-kit/firestore
export type Live<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; fromCache: boolean; pendingWrites: boolean; error: FriendlyError | null };

/** onSnapshot that resubscribes with backoff (1 s doubling to 30 s) instead of going silent. */
export function resilientSnapshot<S extends QuerySnapshot | DocumentSnapshot>(
  ref: Query | DocumentReference,
  onData: (snap: S) => void,
  onError: (error: FriendlyError | null) => void,
): Unsubscribe;

export interface CollectionDef<T> {
  name: string;                         // 'babyEvents'
  keys: readonly (keyof T & string)[];  // the only fields a writer may set; also feeds the rules (B15)
  limits?: Partial<Record<keyof T & string, number>>; // string length caps, mirrored in rules
  privacy?: Privacy;
}
export function defineCollection<T>(def: CollectionDef<T>): CollectionDef<T>;
export function householdCollection<T>(db: Firestore, householdId: string, def: CollectionDef<T>): CollectionReference<T>;

export function watchCollection<T>(q: Query<T>, onChange: (live: Live<(T & { id: string })[]>) => void): Unsubscribe;
export function watchDocument<T>(ref: DocumentReference<T>, onChange: (live: Live<(T & { id: string }) | null>) => void): Unsubscribe;

/** Drops undefined (Firestore rejects it), rounds ms timestamps, trims strings to the def's limits. */
export function clean<T>(def: CollectionDef<T>, data: Partial<T>): Partial<T>;

/** Writes starter docs once per household. Stable ids make two devices seeding at once harmless. */
export function seedOnce(db: Firestore, householdId: string, key: string, docs: { path: string; data: DocumentData }[]): Promise<void>;

// @piekstra/huishouden-pwa-kit/react
export function useCollection<T>(q: Query<T> | null): Live<(T & { id: string })[]>;
export function useDocument<T>(ref: DocumentReference<T> | null): Live<(T & { id: string }) | null>;
```

Writes stay in each app's repository class (Tasks' `HouseholdRepo`, Baby's `actions`): the
fire-and-forget style ("Firestore applies it locally, report failures through a callback") is a
convention documented in `STANDARD.md`, not a framework.

**Replaces:** Tasks `resilientSnapshot` and the five `use*` hooks in `web/src/data/store.ts`;
Baby `src/data/useLiveStore.ts` listeners, `src/lib/model.ts` `cleanEvent`, the seeding block;
Spending `subscribeTransactions`.

**Migration:** Baby → Spending → Tasks.

---

### B4. Feedback: errors, toasts, undo

```ts
// @piekstra/huishouden-pwa-kit/feedback
export interface FriendlyError {
  kind: 'offline' | 'permission' | 'not-found' | 'timeout' | 'quota' | 'unknown';
  message: string;      // "Couldn't save: offline. It will retry when the connection is back."
  detail?: string;      // technical text behind "Details"
  retryable: boolean;
}
export function friendlyError(e: unknown, action: string, online?: boolean): FriendlyError;
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T>;

export interface Toast { id: number; message: string; tone: 'info' | 'error'; undo?: () => void }
export interface ToastQueue {
  show(t: Omit<Toast, 'id'>): number;
  dismiss(id: number): void;
  subscribe(fn: (current: Toast | null) => void): Unsubscribe;
}
export function createToastQueue(options?: { infoMs?: number; errorMs?: number }): ToastQueue; // 6000 / 9000

/** Deletes now, returns a toast whose undo writes the same docs back under the same ids. */
export function removeWithUndo(db: Firestore, docs: { ref: DocumentReference; data: DocumentData }[], message: string): Omit<Toast, 'id'>;

// elements: <hh-toast> bound to a queue; react: useToasts(queue), <ErrorNotice error onRetry />
```

Undo restores by id, as both apps already do (`restoreItems`, `restoreEvent`), so a restore is
idempotent and other devices see the original document return.

**Replaces:** Tasks `web/src/components/UndoToast.tsx`, `ErrorNotice.tsx`, `web/src/lib/errors.ts`,
`clearCompleted`/`restoreItems`; Baby `Toast` in `src/components/ui.tsx`, `src/useToast.ts`,
`readError`, the `restore*` actions.

**Migration:** Baby → Tasks.

---

### B5. Time and due dates

All pure, all take `now`, so tests pin them and the demo clock works.

```ts
// @piekstra/huishouden-pwa-kit/time
export const MINUTE: number, HOUR: number, DAY: number;
export type Ymd = string;                          // 'YYYY-MM-DD', local calendar day
export function startOfDay(t: number): number;
export function addDays(t: number, n: number): number;
export function toYmd(t: number): Ymd;
export function parseYmd(s: Ymd | undefined): number | null;
export function calendarDaysBetween(from: number, to: number): number;

export function formatDuration(ms: number): string;          // "2h 10m"
export function formatAgo(at: number, now: number): string;  // "just now", "35m ago"
export function relativeDay(t: number, now: number): string; // "Today", "Tomorrow", "Thu 12 Jun"

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later';
export function dueState(due: number | Ymd, now: number, soonDays?: number): DueState; // soonDays 7
/** "Due today", "Due tomorrow · 3:00 PM", "Due in 4 days", "2 days overdue". */
export function formatDue(due: number | Ymd, now: number, options?: { allDay?: boolean }): string;
/** Items due within `days`, overdue included, soonest first. */
export function upcoming<T>(items: T[], dueOf: (t: T) => number | Ymd | null | undefined, now: number, days?: number): T[];

export interface Clock { now(): number; subscribe(fn: (now: number) => void): Unsubscribe }
/** Ticks every `tickMs` (15 s) and on visibilitychange; `read` lets demo mode run on a fixed day. */
export function createClock(options?: { tickMs?: number; read?: () => number }): Clock;

// react: <ClockProvider clock>, useNow(): number
```

`DueState` maps to colour once, in the kit: `overdue` and `today` use terracotta, the rest stay
neutral. Every app's "due" badge then matches.

**Replaces:** Baby `src/lib/time.ts`, `src/lib/format.ts`, `src/clock.tsx`; Tasks
`formatDue`/`isOverdue`/`upcomingItems` in `web/src/data/model.ts`, `useClock` in
`web/src/views/HubView.tsx`; Spending's ambient clock.

**Migration:** Baby (its tests and fixtures move with it) → Tasks → Spending.

---

### B6. Recurring schedules

Bills (manual premiums, tolls), Home (filters, pest control, renewals) and Pet (prevention,
vaccinations) all repeat. Two kinds matter:

- **fixed**: calendar-anchored. "HOA dues on the 1st", "insurance renews every 12 March".
- **after-done**: floating. "HVAC filter 90 days after the last change", "flea treatment monthly
  from the last dose".

```ts
// @piekstra/huishouden-pwa-kit/schedule
export type Unit = 'day' | 'week' | 'month' | 'year';
export type Recurrence =
  | { kind: 'fixed'; every: number; unit: Unit; anchor: Ymd }
  | { kind: 'after-done'; every: number; unit: Unit };

export interface Scheduled {
  recurrence?: Recurrence | null;
  /** One-off due date, or the current occurrence of a recurrence. */
  due?: Ymd | null;
  lastDoneAt?: number | null;
  snoozedUntil?: Ymd | null;
  /** How early it starts showing as "soon" (default 7). */
  leadDays?: number;
}

export function nextDue(s: Scheduled, now: number): Ymd | null;
export function occurrences(r: Recurrence & { kind: 'fixed' }, from: Ymd, to: Ymd): Ymd[];
/** Fields to write when someone marks it done: lastDoneAt and the next due. Undo writes the old ones back. */
export function markDone(s: Scheduled, at: number): Pick<Scheduled, 'lastDoneAt' | 'due'>;
export function describeRecurrence(r: Recurrence): string; // "Every 3 months", "Yearly on 12 Mar"
```

Rules: month arithmetic clamps to the month's last day (31 January plus one month is 28 or 29
February, and the anchor keeps the 31st for later months). Times are local calendar days; nothing
here deals in hours.

Reminders: no push in the first version. Due items surface through Today and through each app's
summary ([§6](#6-the-today-summary-contract)); the Mac can raise a local notification from sync
data if wanted.

**Replaces:** nothing yet. **Migration:** built with whichever of Bills (manual bills) or Home
ships first; Pet adopts it.

---

### B7. Checklists

Baby's checklists (grouped by list name, ordered, seeded once from templates) and Tasks' subtasks
(steps under an item) are the same idea at two sizes. Home needs Baby's shape (a "Before winter"
list).

```ts
// @piekstra/huishouden-pwa-kit/checklist
export interface ChecklistItemData { list: string; text: string; done: boolean; order: number; createdAt: number; by: string }
export const checklistKeys: readonly (keyof ChecklistItemData)[];
export interface ChecklistGroup<T extends ChecklistItemData> { list: string; items: T[]; done: number; total: number }
export function groupChecklist<T extends ChecklistItemData>(items: T[]): ChecklistGroup<T>[];
export function nextOrder(items: ChecklistItemData[], list: string): number;
/** Order writes for moving one item up or down within its group. */
export function moveItem<T extends ChecklistItemData & { id: string }>(group: T[], id: string, dir: -1 | 1): { id: string; order: number }[];
/** Fractional position between neighbours, or null when a renumber is needed (from Tasks). */
export function positionBetween(before?: number, after?: number): number | null;
/** Stable-id docs from templates, for seedOnce. */
export function templateDocs(templates: { list: string; items: string[] }[], now: number, by: string): { id: string; data: ChecklistItemData }[];
```

**Replaces:** Baby `src/lib/checklist.ts` (with its tests); Tasks `positionBetween`, `moveInOrder`
in `web/src/data/model.ts`. **Migration:** extracted from Baby when Home starts; Tasks adopts the
ordering helpers.

---

### B8. Appointments

```ts
// @piekstra/huishouden-pwa-kit/appointments
export interface AppointmentData {
  title: string; at: number; allDay?: boolean; durationMin?: number;
  location?: string; notes?: string; createdAt: number; by: string;
}
export const appointmentKeys: readonly (keyof AppointmentData)[];
export function upcomingAppointments<T extends AppointmentData>(items: T[], now: number, days?: number): T[];
/** "Add to Google Calendar" link; no API scope needed. */
export function calendarLink(a: Pick<AppointmentData, 'title' | 'at' | 'allDay' | 'durationMin' | 'location' | 'notes'>): string;
```

Each app keeps its own collection (`babyAppointments`, `petVisits`, `homeServiceVisits`) so rules
and deletes stay per app; the shape and the helpers are shared.

**Replaces:** Baby `AppointmentData` in `src/lib/model.ts`, `appointmentDoc` in `src/data/build.ts`;
Tasks `googleCalendarLink` in `web/src/data/model.ts`. **Migration:** with Pet or Home, whichever
is first.

---

### B9. Event log

Baby logs feeds and sleeps; Pet logs doses and weights; Home logs service visits; Bills keeps
payment history. One base shape, app-specific fields on top.

```ts
// @piekstra/huishouden-pwa-kit/log
export interface LogEventBase<K extends string = string> {
  kind: K;
  at: number;
  endAt?: number | null;     // running when null (a sleep in progress)
  note?: string;
  by: string;
  createdAt: number;
  updatedAt?: number;
}
export interface Quantity { value: number; unit: 'kg' | 'lb' | 'ml' | 'oz' | 'count' }

export function latest<E extends LogEventBase>(events: E[], kind: E['kind'], now: number): E | null;
export function running<E extends LogEventBase>(events: E[], kind: E['kind']): E | null;
export function groupByDay<E extends LogEventBase>(events: E[]): Map<Ymd, E[]>;
export function totalDuration<E extends LogEventBase>(events: E[], kind: E['kind'], from: number, to: number): number;
/** Query for the last `days` of a log collection (the log screen never reads all history). */
export function recentQuery(db: Firestore, householdId: string, collection: string, days: number, now: number): Query;
```

Editing keeps `by` and `createdAt` from the original logger (Baby's rule). Deletes go through
`removeWithUndo` (B4).

**Replaces:** Baby `latest`, `sleepState` scaffolding in `src/lib/summary.ts`, the history query in
`src/data/useLiveStore.ts`. **Migration:** extracted when Pet starts.

---

### B10. Money and privacy mode

```ts
// @piekstra/huishouden-pwa-kit/money
/** Same shape as the CLI family's JSON: a decimal string, never a float. */
export interface Money { amount: string; currency: string }
export function toMoney(v: number | string | Money, currency?: string): Money; // default 'USD'
export function toCents(m: Money): number;
export function sumMoney(values: Money[]): Money;
/** "$1,234.50"; headline: "$1,235" (DESIGN.md: whole units only for the one big number). */
export function formatMoney(v: number | Money, options?: { headline?: boolean; locale?: string }): string;

// privacy mode: per device, shared by every app on that device's origin
export type PrivacyMode = 'show' | 'mask';
export function watchPrivacyMode(onChange: (m: PrivacyMode) => void): Unsubscribe; // localStorage + storage event
export function setPrivacyMode(m: PrivacyMode): void;

// elements: <hh-amount value="1234.50" currency="USD" headline> renders "••••" in mask mode
// react:    usePrivacyMode(), <Amount value headline />
```

Masking replaces the text with dots and an accessible label "Amount hidden", as Spending's
privacy setting already does. A blurred figure would still be partly readable from across the room.

**Replaces:** Spending `formatCurrency`/`formatShortCurrency` in both
`src/components/InteractiveDashboard.tsx` and `src/components/AmbientDashboard.tsx`, and its
`showPrivacyBlur` setting. **Migration:** with Bills; Spending adopts in the same window.

---

### B11. Demo mode

Signed-out visitors (and screenshots) see a working app with invented data. Baby does this well:
an in-memory store with the same interface as the live one, a clock starting on a fixed day in
2031, members `sam@example.com` and `alex@example.com`. Spending falls back to bundled sample
transactions with a banner.

```ts
// @piekstra/huishouden-pwa-kit/demo
export const DEMO_EPOCH: number;                       // a fixed local time in 2031
export const DEMO_MEMBERS: readonly string[];          // ['sam@example.com', 'alex@example.com']
/** Moving "now" that starts at `start` and advances with real time. */
export function demoClock(start?: number): () => number;
/** In-memory collection with upsert/remove/restore and change events, to back a demo store. */
export function memoryCollection<T extends { id: string }>(initial: T[]): {
  all(): T[]; upsert(item: T): void; remove(id: string): void; subscribe(fn: (items: T[]) => void): Unsubscribe;
};
// elements: <hh-demo-banner> "Sample data. Sign in to see your household."
```

The pattern stays an app concern (each app defines its `Store` interface with live and demo
implementations); the kit supplies the clock, members, memory collection and banner, and
`captureScreenshot({ fixedTime: DEMO_EPOCH })` already exists for deterministic screenshots.

**Replaces:** Baby `src/lib/demo.ts` constants, the in-memory plumbing in `src/data/useDemoStore.ts`;
Spending's sample banner. **Migration:** with the next app.

---

### B12. Device

```ts
// @piekstra/huishouden-pwa-kit/device
/** Keeps the screen on; re-acquires when the page becomes visible again. */
export function holdWakeLock(): () => void;
export function watchInstallPrompt(onChange: (s: { canInstall: boolean; installed: boolean; install(): Promise<void> }) => void): Unsubscribe;
export function watchOnline(onChange: (online: boolean) => void): Unsubscribe;
export type ThemeMode = 'light' | 'dark' | 'auto';
/** Toggles `.dark`, updates the theme-color meta to forest-900 / forest-700. */
export function applyTheme(mode: ThemeMode): Unsubscribe;
/** Ambient mode per DESIGN.md: dark, wake lock, optional fullscreen. Returns exit. */
export function enterAmbient(options?: { fullscreen?: boolean }): () => void;
/** Per-device preference (each tablet or phone keeps its own), namespaced `hh.<app>.<key>`. */
export function devicePref<T>(app: string, key: string, initial: T): { get(): T; set(v: T): void };

// react: useWakeLock(enabled), useInstallPrompt(), useOnline(), useTheme(mode), useDevicePref(app, key, initial)
```

**Replaces:** Tasks `web/src/lib/prefs.ts` (all five); Spending `src/usePWAInstall.ts`, its
fullscreen toggle and ambient theme; Baby's equivalents as they appear.
**Migration:** Tasks' versions are the reference; Spending adopts first (it has the most copies).

---

### B13. UI primitives

Tasks' `ui.tsx` and Baby's `ui.tsx` define the same dialog, chip, input and button class strings;
`DESIGN.md` already says they mirror Tasks.

- `theme.css` gains `.hh-card`, `.hh-chip` (`[aria-pressed=true]` selected), `.hh-input`,
  `.hh-button--ghost`, `.hh-button--icon`, `.hh-overline`, `.hh-dialog` / `.hh-sheet`, written with
  `--hh-*` variables and dark variants, so the portal uses them without Tailwind.
- `@piekstra/huishouden-pwa-kit/react/ui`:

```tsx
export function Dialog(props: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean }): JSX.Element;
export function Chip(props: { active?: boolean; onClick(): void; children: ReactNode; label?: string }): JSX.Element;
export function Field(props: { label: string; hint?: string; children: ReactNode }): JSX.Element;
export function Card(props: { title?: string; children: ReactNode }): JSX.Element;
export function ErrorNotice(props: { error: FriendlyError; onRetry?(): void; retrying?: boolean }): JSX.Element;
export function EmptyState(props: { message: string; action?: ReactNode }): JSX.Element;
```

**Replaces:** Tasks `web/src/components/ui.tsx` (`Dialog`, `Chip`, `inputClass`, `primaryButton`,
`ghostButton`); Baby `src/components/ui.tsx` (same plus `Field`, `cardClass`, `overline`); Spending
`src/components/GoogleSignInButton.tsx`; portal `.hh-button--quiet` and panel styles.
**Migration:** Baby → Tasks → Spending (its modals are larger and move last).

---

### B14. People

```ts
// @piekstra/huishouden-pwa-kit/people
/** "You", the first name from the profile, or the address's first word. */
export function personName(email: string, me?: { email?: string | null; displayName?: string | null } | null): string;
export function personInitial(email: string, me?: { email?: string | null; displayName?: string | null } | null): string;
/** Palette colours that keep white initials above 4.5:1; a member keeps one colour in every app. */
export function personColour(email: string, members: string[]): string;
// react: <PersonBadge email me members size />
```

**Replaces:** Baby `src/lib/people.ts`, `PersonBadge`; Tasks `firstName`. **Migration:** with the
next app.

---

### B15. Rules fragments and rules tests

One project, one rules file (F9). Today the file sits in Tasks and other apps send prose.

Proposal:

- The rules file moves to the **portal repo**, which already owns project-wide setup
  (`infra/apps.conf`, bootstrap). Tasks stops deploying rules.
- The kit ships `rules/household.rules` with the shared functions (`signedIn`, `myEmail`,
  `isMember`, `isMemberAfter`, `isSyncWriter`, below) and the household document rules.
- Each app keeps a fragment `rules/<app>.rules` in its own repo, next to the types it protects, and
  opens a PR copying it into the portal's `rules/` when it changes.
- `bunx pwa-rules build rules/ > firestore.rules` assembles them inside the household match.
- `bunx pwa-rules check` compares each fragment's `keys().hasOnly([...])` lists with the
  `defineCollection` definitions (B3), so a field added in TypeScript but not in rules fails CI
  instead of failing in production with `permission-denied`.

```ts
// @piekstra/huishouden-pwa-kit/rules-test   (wraps @firebase/rules-unit-testing)
export function rulesEnv(rulesPath: string): Promise<RulesTestEnvironment>;
export function asMember(env: RulesTestEnvironment, email: string): Firestore;
export function asStranger(env: RulesTestEnvironment): Firestore;
export function asSyncWriter(env: RulesTestEnvironment, householdId: string): Firestore;
/** Members read and write per the def; strangers get nothing; unknown keys are refused. */
export function expectCollectionRules(env: RulesTestEnvironment, def: CollectionDef<unknown>, sample: object): Promise<void>;
```

Example fragment (invented collection):

```
// rules/pet.rules: inside match /households/{householdId}
match /petDoses/{id} {
  allow read, delete: if isMember();
  allow create, update: if isMember()
    && request.resource.data.keys().hasOnly(['kind', 'at', 'medication', 'note', 'by', 'createdAt', 'updatedAt'])
    && request.resource.data.at is int;
}
```

**Replaces:** Tasks `firestore.rules`, `web/test/rules/firestore.rules.test.ts` (its tests move to
the portal and use the helpers); Spending `docs/firestore-rules-spending.md`.
**Migration:** move the file first with no changes, then split into fragments.

---

## 5. Household sync

A job on an always-on Mac that runs the local account CLIs on a schedule and writes normalized
documents into `households/{householdId}/…`. It generalizes what Spending's Apps Script does for
the Sheet (F10), for sources that only exist on that Mac.

### Shape

```
launchd (every N minutes)
  └─ hh-sync run
       ├─ for each due collector in ~/.config/hh-sync/config.toml
       │    spawn argv (no shell) ─▶ CLI reads its own Keychain item ─▶ JSON on stdout
       │    adapter: provider JSON ─▶ normalized docs (allowlisted fields only)
       ├─ plan: compare fingerprints with ~/.local/state/hh-sync/<collector>.json
       ├─ commit changed docs (≤ 500 per batch) as the sync identity
       └─ write syncStatus/<collector> (on outcome change, or hourly heartbeat)
```

Where it lives: the schema types, adapters and planner are pure TypeScript in the kit
(`@piekstra/huishouden-pwa-kit/sync`), because the apps read the same types. The runner is a
`bunx hh-sync` bin in the kit. All household-specific choices (household id, project id, which
CLIs, labels, schedules) live in the local config file and never in a repo.

Why not inside `utiman`: it already runs utility summaries from launchd and parses
`utility-summary/v1`, but its security posture is "nothing leaves this machine". Publishing to
the cloud changes that promise, and sync also covers non-utility sources (mortgage, HOA,
calendar). `hh-sync` can still reuse `utiman`'s provider manifests as a source of argv later.

### Collector contract

A collector is any command that prints JSON on stdout and follows the CLI family's exit codes.
Two forms:

1. **A family CLI with a known schema**, read through a built-in adapter keyed on the `schema`
   tag: `utility-summary/v1` → `bill/v1`; `statement-list/v1` → `billHistory`;
   `document-list/v1` → `notice/v1` (title and date only).
2. **A script that emits `sync-batch/v1` directly**, for sources with no profile (the mortgage
   servicer's separate summary and autopay commands, a calendar export). It can be a few lines
   of `jq` over existing CLI output.

```ts
// @piekstra/huishouden-pwa-kit/sync
export interface SyncBatch<T = unknown> {
  schema: 'sync-batch/v1';
  collection: SyncCollection;          // allowlist: 'bills' | 'billHistory' | 'calendarEvents' | 'notices' | 'summaries'
  /** true: these docs are the whole set for this collector, so missing ids are deleted. */
  complete: boolean;
  docs: { id: string; data: T }[];
}
```

Config (invented values):

```toml
household = "<household id>"
project   = "<firebase project id>"
identity  = "custom-token"            # see Security

[[collector]]
id       = "electric"                 # local alias, becomes the doc id; never an account number
kind     = "electric"
label    = "Electric"
run      = ["/usr/local/bin/<electric-cli>", "summary", "--json"]
adapter  = "utility-summary/v1"
every    = "6h"
pay_url  = "https://example.com/pay"  # optional public hand-off page

[[collector]]
id       = "mortgage"
kind     = "mortgage"
label    = "Mortgage"
run      = ["/Users/<you>/.config/hh-sync/collectors/mortgage.sh"]
adapter  = "sync-batch/v1"
every    = "12h"

[[collector]]
id       = "family-calendar"
run      = ["/Users/<you>/.config/hh-sync/collectors/calendar.sh", "--days", "7"]
adapter  = "sync-batch/v1"
every    = "15m"
privacy  = "wall"                     # 'busy-only' replaces titles with "Busy"
```

Runner commands, following the family surface (`--json`, exit codes 0–6):

| Command | Does |
|---|---|
| `hh-sync run [--collector ID] [--dry-run]` | Runs due collectors (or one), writes changes. `--dry-run` prints the plan. |
| `hh-sync plan [--collector ID]` | Runs collectors and shows creates, updates, deletes; writes nothing. |
| `hh-sync status` | Last outcome per collector, from local state; no network. |
| `hh-sync doctor` | Checks config, binaries, identity; never runs a collector, so it raises no Keychain prompt. |
| `hh-sync install --every 15m` / `uninstall` | Writes or removes the LaunchAgent. |

### Normalization: `bill/v1`

```ts
export type BillKind = 'electric' | 'water' | 'sewer' | 'gas' | 'internet' | 'phone' | 'mortgage' | 'hoa' | 'insurance' | 'toll' | 'other';

/** households/{hid}/bills/{providerId}: the current bill for one provider. */
export interface BillDoc {
  schema: 'bill/v1';
  source: 'sync' | 'manual';
  kind: BillKind;
  label: string;                          // "Electric", from config, not from the provider
  due: Ymd | null;
  amountDue: Money | null;                // null when unknown; '0.00' when paid up
  status: 'due' | 'paid' | 'credit' | 'unknown';
  autopay: { enrolled: boolean; nextDraft?: Ymd } | null;  // null = the CLI doesn't say
  payUrl?: string;
  recurrence?: Recurrence;                // manual bills only (B6)
  observedAt: number;                     // when sync last saw this value
  updatedAt: number;                      // when the value last changed
}

/** households/{hid}/billHistory/{providerId}_{due} */
export interface BillHistoryDoc { schema: 'bill-history/v1'; providerId: string; due: Ymd; amount: Money; paid?: boolean }

/** households/{hid}/syncStatus/{collectorId} */
export interface SyncStatusDoc {
  schema: 'sync-status/v1';
  outcome: 'ok' | 'sign-in-needed' | 'provider-problem' | 'failed';
  lastRunAt: number;
  lastSuccessAt: number | null;
  message: string;                        // fixed wording chosen by outcome, never the CLI's stderr
}

export function fromUtilitySummary(json: unknown, collector: CollectorConfig, now: number): BillDoc;
```

The adapter copies only the fields above. Provider extras (account numbers, service addresses,
names on the account, funding-account details) are dropped in code, and a unit test feeds each
adapter a fixture full of such fields and asserts none survive.

"Due without autopay" is computed in the app, not stored: `status === 'due' && autopay?.enrolled
!== true && dueState(due) in ['overdue', 'today', 'tomorrow', 'soon']`. Unknown autopay counts
as not enrolled, so a missing fact errs toward attention.

### Idempotent upserts

- **Stable ids.** The doc id is the collector's alias (`bills/electric`), or alias plus a natural
  key (`billHistory/electric_2031-05-14`, a calendar event's id hashed). Re-running writes the
  same doc.
- **Fingerprints.** The planner hashes each doc's data without `observedAt`/`updatedAt`, compares
  with the local state file, and writes only changed docs. A steady state costs zero document
  writes. `observedAt` is refreshed at most once a day so the app can show "checked today".
- **Deletes only on success.** Missing ids are deleted only when the batch says `complete: true`
  and the collector exited 0. A failing CLI never empties the wall screen.
- **Batches.** At most 500 writes per commit; the state file is updated only after the commit
  succeeds, so a crash mid-run is retried as a full plan next time.
- **Budget.** Ten collectors at their cadences produce well under 1,000 writes a day in the worst
  case, a small fraction of the free plan's daily write allowance.

### Failure reporting

| CLI exit | Outcome | Retry | Shown in the app |
|---|---|---|---|
| 0 | `ok` | next schedule | "Checked 2 hours ago" |
| 3 | `sign-in-needed` | **not retried** until a person signs the CLI in again on the Mac | "Sign in again on the home Mac" (attention) |
| 5 | `provider-problem` | next schedule, with backoff up to 24 h | "The provider's site isn't answering; will try again" |
| other, or timeout (120 s) | `failed` | next schedule, with backoff | "Couldn't check: see the sync log on the home Mac" |

- Data docs keep their last good values; `observedAt` ages, and the app marks a bill "not
  checked since <date>" after 2 days.
- Retries never loop within a run. A CLI that needs a Keychain approval or a login raises a
  dialog each time it runs; retrying in a loop would stack dialogs on the Mac. One attempt per
  schedule, and none at all after exit 3.
- Local log: `~/Library/Logs/hh-sync/hh-sync.log`, rotated, with stderr reduced to the exit code
  and the error slug from `{"error": {"code": …}}`.

### Security

- **Provider credentials never leave the Mac.** They stay in each CLI's own Keychain item. The
  runner never reads them; it spawns binaries by absolute path with no shell and an empty
  environment apart from `PATH` and `HOME`.
- **Read-only collectors.** The runner refuses an argv containing a mutating verb from the family
  spec (`create`, `pay`, `delete`, `run`, `activate`, `--force`). Paying stays a hand-off to the
  provider's page.
- **A dedicated identity, not a person's.** Two options:

| | A. Rules-scoped sync user (recommended) | B. Service account through IAM |
|---|---|---|
| How | A `household-sync` service account with no keys. The Mac user's `gcloud` credentials may impersonate it (`roles/iam.serviceAccountTokenCreator` on that account only). The runner uses impersonation to sign a Firebase custom token for uid `hh-sync` with claims `{ hhSync: true, household: "<id>" }`, exchanges it for an ID token, and calls the Firestore REST API with it. | Same service account with `roles/datastore.user`; Firestore REST with its OAuth token. |
| Rules apply | Yes. `isSyncWriter()` lets it write only the synced collections of its own household, with field checks. | No. IAM access bypasses rules, so a bug can write anywhere in the database (today's Apps Script works this way). |
| Keys on disk | None | None |
| Setup | `bootstrap.sh` creates the account and the impersonation grant | Same, plus the role |

```
function isSyncWriter() {
  return request.auth != null
    && request.auth.token.hhSync == true
    && request.auth.token.household == householdId;
}
match /bills/{id} {
  allow read: if isMember();
  allow write: if (isSyncWriter() && request.resource.data.source == 'sync')
    || (isMember() && request.resource.data.source == 'manual'
        && (resource == null || resource.data.source == 'manual'));
}
match /syncStatus/{id}       { allow read: if isMember(); allow write: if isSyncWriter(); }
match /calendarEvents/{id}   { allow read: if isMember(); allow write: if isSyncWriter(); }
```

- If a service-account key ever becomes unavoidable, it lives in the Keychain, not in a file.
- Spending's Apps Script can move to the same identity later, closing its rules bypass.

---

## 6. The Today summary contract

The portal shows every app's "what matters now" without importing any app's code or reading its
collections. Each app publishes one small document; the portal renders all of them.

```ts
// @piekstra/huishouden-pwa-kit/summary
export type Tone = 'normal' | 'attention' | 'done';
export type Privacy = 'wall' | 'wall-masked' | 'member';

/** households/{hid}/summaries/{appId} */
export interface TodaySummary {
  schema: 'today-summary/v1';
  app: string;                    // registry id (B1)
  updatedAt: number;
  /** After this, the portal shows the card as "Not updated since …" instead of stale facts. */
  staleAfter: number;
  headline?: { text: string; tone: Tone };   // "3 bills in the next 7 days"
  items: TodayItem[];                         // at most 5, in display order
  href?: string;                              // deep link into the app
}

export interface TodayItem {
  id: string;
  title: string;                  // "Electric", "Last feed", "Change HVAC filter"
  /** Time facts are stored as instants and worded by the portal at render time,
   *  so "2h ago" keeps moving without the app rewriting the doc. */
  at?: number;
  due?: Ymd;
  timeStyle?: 'ago' | 'until' | 'due' | 'clock';
  detail?: string;                // "autopay off", "left, 15m"
  amount?: Money;                 // rendered through <hh-amount>, so privacy mode applies
  tone: Tone;
  privacy: Privacy;               // 'member' items are dropped on the wall
}

export function validateSummary(s: unknown): s is TodaySummary;
/** Debounced (default 5 s) write; skips the write when nothing but updatedAt would change. */
export function createSummaryPublisher(db: Firestore, householdId: string, app: string): {
  publish(s: Omit<TodaySummary, 'schema' | 'app' | 'updatedAt'>): void;
  flush(): Promise<void>;
};
export function watchSummaries(db: Firestore, householdId: string, onChange: (s: TodaySummary[]) => void): Unsubscribe;

// elements: <hh-today-card .summary .now> renders one summary; the portal lays them out
```

Who writes each summary (no Cloud Functions on the free plan, F11):

| App | Writer | When |
|---|---|---|
| Bills | `hh-sync` | after each bills run |
| Spending | its Apps Script mirror | after each mirror run (month total, pace against budget) |
| Baby | the Baby app | after each log write and on open |
| Tasks | the Tasks app | after item changes, debounced |
| Home, Pet | the app | after writes and on open |
| Calendar (Today itself) | `hh-sync` writes `calendarEvents`, not a summary | every 15 minutes |

Rules: members may write `summaries/{app}` only for apps whose summaries come from browsers, and
the doc must validate (schema tag, at most 5 items, string length caps); `isSyncWriter()` may
write the synced ones.

Consequences to accept:

- A summary written by a browser is only as fresh as the last time someone used that app. Items
  carry instants rather than wording, and `staleAfter` makes the age visible (Baby: 12 hours;
  Tasks: 24 hours).
- A summary duplicates a little data. It holds titles and times already in the app's own
  collections, at the same privacy levels, under the same membership rule.

---

## 7. Roadmap

### Extract now (already written twice or more)

| Order | Block | Copies | First adopter | Size |
|---|---|---|---|---|
| 1 | F3 fix in `./household` (acknowledged-only, `findHousehold`, seeded `createHousehold`) | 3 | Spending (drops its `limit(1)` lookup) | small, patch release |
| 2 | B2 session and `initFirebase` | 4 | Baby | medium |
| 3 | B1 `<hh-app-bar>`, `apps.json`, `expectHuishoudenFrame` | 4 | Baby, then portal | medium |
| 4 | B3 resilient subscriptions, `defineCollection` | 3 | Baby | medium |
| 5 | B4 feedback, B5 time, B12 device, B13 UI primitives | 2–3 each | Baby, then Tasks | medium together |
| 6 | B15 rules move to the portal, fragments, rules-test | 1 file + prose | portal | medium |
| 7 | B10 money and privacy mode | 2 (in Spending) | Spending | small |

Baby is the first adopter for most blocks because it is being built now and already follows the
kit closely; moving it before it ships costs less than migrating it later.

### Build with the next app

| Next app | Blocks built with it |
|---|---|
| Bills (recommended first: its data source is the longest lead) | §5 household sync, `bill/v1`, `syncStatus`, `isSyncWriter`, B6 schedule (manual recurring bills), B11 demo, B14 people, B17 summary publisher |
| Today (in the portal) | §6 `<hh-today-card>`, `watchSummaries`, calendar collector, weather; Baby and Tasks start publishing summaries |
| Home | B7 checklists (extracted from Baby), B8 appointments, service log on B9 |
| Pet | B9 event log (extracted from Baby), B8 if Home has not built it |

### Defer

| Item | Why | Revisit when |
|---|---|---|
| Smart-home scenes from Home | Needs a command path back to the Mac (a member writes `commands/{id}`, the Mac runs an allowlisted alias, writes the result). That is the first time the browser can cause an action on the Mac; it needs its own threat model. | Home has shipped and scenes are still wanted |
| Enforced wall privacy (Q3) | Needs a second Google account for the wall tablet and a household field naming it | a `member` collection exists that would be harmful on the wall |
| Push reminders | Web push needs a sender; the free plan has no Functions. The Mac could send through FCM later. | after Today shows due items for a few weeks |
| Attachments (warranty PDFs, vet records) | File storage likely needs a paid plan; links to an existing document store work meanwhile | Home's warranty screen is in use |
| Migrating Tasks wholesale | Large, working app; it adopts blocks one at a time in the order above | n/a |
| `hh-sync` reading `utiman` manifests | One config format is enough to start | more than ~8 collectors |

---

## 8. Enforcement

Reuse only lasts if copying is harder than importing. Proposed checks, cheapest first:

### `pwa-reuse-check` in the shared CI

A second scanner next to `pwa-design-check`, run by `pwa.yml` in the build job, with the same
`file:line rule` output and the same comment and fixture exclusions. Each rule names the kit
replacement.

| Pattern in app code | Message |
|---|---|
| `initializeFirestore(` | Use `initFirebase()` from `./firebase` |
| `where('members', 'array-contains'` | Use `watchHousehold` / `findHousehold` from `./household` |
| `onAuthStateChanged(` outside one session file | Use `watchSession` / `useSession` |
| `signInWithPopup(` | Use `signInWithGoogle` |
| an `<a>` or `href` to the portal URL in a `<header>` | Use `<hh-app-bar>` |
| `navigator.wakeLock` | Use `holdWakeLock` / `useWakeLock` |
| `beforeinstallprompt` | Use `watchInstallPrompt` |
| `toLocaleString(…minimumFractionDigits: 2` with a currency symbol | Use `formatMoney` |
| `setInterval(` with a `Date.now()` / `new Date()` state setter | Use `createClock` / `useNow` |
| raw `onSnapshot(` | Use `watchCollection` / `resilientSnapshot` |
| `const DAY = 86_400_000`-style constants, `startOfDay` definitions | Use `./time` |

An app can opt out of a rule per line with `// reuse-check:allow <rule> <reason>`; the reason is
required, matching the leak-scan allowlist convention.

### Version floor

`pwa.yml` reads the installed kit version and warns on PRs when it is more than two minor
versions behind the `v0` tag, failing at four. Apps that fall behind are where copies start.

### Rules and contracts in CI

- Portal CI runs `pwa-rules check` (B15): every collection an app defines has a fragment and a
  rules test.
- Apps that publish a summary unit-test their summary builder with `validateSummary` and a
  fixture.
- `hh-sync` adapters have a "no extras survive" test per adapter (§5).
- Smoke tests gain `expectHuishoudenFrame` (B1).

### Reviewer rubric

A `huishouden/kit-reuse` rubric for `cr review`, alongside `huishouden/design-language`:

1. Does this PR add a function, hook or component that already exists in another Huishouden repo
   or the kit? Name the file.
2. Is this the second copy of something? Then the PR extracts it to the kit instead (or links the
   kit PR that does).
3. Does a new collection come with a `defineCollection`, a rules fragment and a rules test?
4. Does a new app publish a Today summary, and does each item carry a privacy level?
5. Does anything shown on the wall come from a `member`-level field?

### Standard

`STANDARD.md` gains a "Reuse" section stating the rule of two (the second copy is extracted, not
pasted) and listing the subpaths, and the PR template gains one checkbox: "Checked the kit for an
existing block."

---

## 9. Open questions

| # | Question | Default if nobody decides |
|---|---|---|
| Q1 | Rules file in the portal repo, or a dedicated rules repo? | Portal repo |
| Q2 | Sync identity A (rules-scoped custom token) or B (service account through IAM)? | A |
| Q3 | Enforce wall privacy with a dedicated wall account (`displays: string[]` on the household doc, `member` collections deny reads to it), or keep it display-only? | Display-only until a `member` collection exists |
| Q4 | Does Today live in the portal (vanilla, custom elements) or become its own React app? | Portal, which is why the custom elements matter |
| Q5 | Should Spending's Apps Script move to the sync identity and to `hh-sync`'s planner, leaving one server writer pattern? | Yes, after Bills ships |
| Q6 | Does `bill/v1` belong in the CLI family as a domain shape (a profile any bill CLI emits), so adapters disappear? | Not yet: the family's own bar for a new profile asks for a consumer first, and `hh-sync` would be that consumer; propose it once the adapters exist |
