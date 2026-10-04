# Acting as a person from a server

Some Huishouden services run on a server rather than in the browser. Two examples are
huishouden/connector (the remote MCP server people add to their AI assistant) and a calendar feed.
These services act **as the signed-in person**. The household's Firestore rules decide everything
they read and write, exactly as in the apps. They need no service account, no OAuth client and no
console step.

Every module below is server-safe. It imports no package, no Firebase SDK and no DOM, and
`test/server-safe.test.ts` keeps it that way. They run in Cloudflare Workers, Bun and Node.

| Module | What it does |
|---|---|
| `@huishouden/pwa-kit/signin-handoff` | Gets the person's Firebase refresh token from the portal's `/connect` page, where they sign in as in every app. Provides `connectUrl`, `parseConnectParams`, `HandoffRequest` / `isHandoffRequest`, `storeHandoff` and `takeHandoff`, plus the paths `CONNECT_PATH`, `HANDOFF_PATH` and `CALLBACK_PATH`. |
| `@huishouden/pwa-kit/firebase-auth-rest` | Exchanges a refresh token for an ID token and says who it is: `exchangeRefreshToken(options, refreshToken)`. `verifyIdToken(options, idToken)` checks a token the portal sends (through Firebase Auth's `accounts:lookup`). `IdTokenCache` keeps a token per isolate until 5 minutes before it expires. `FirebaseAuthError.kind` is `revoked`, `unverified` or `unavailable`. |
| `@huishouden/pwa-kit/firestore-rest` | `new FirestoreRest({ projectId, token })` sends every call with the person's ID token. `get(path)` returns null when the document is missing. `query(parent, collection, { where, orderBy, limit })` and `commit(writes)` are atomic. A write is `set`, `merge` (leaf paths, like the SDK's `merge: true`), `create` (must not exist yet, for idempotency keys) or `delete`. `Increment` is the SDK's `increment()`. Whole numbers are written as integers. `FirestoreError.code` is `permission-denied`, `not-found` and so on. |
| `@huishouden/pwa-kit/local-clock` | `new LocalClock(timeZone)` reads days in the person's time zone on a UTC server. `local(t)` moves an absolute time into a frame whose UTC fields show the person's wall clock. The kit's day and dose logic (`./time`, `./dose`, `./agenda-core`, `./todo-core`) then answers exactly as on their phone. `utc()` goes back, `today()`, `parse('2031-01-05T08:00')`, `isoLocal(t)`. |

The data contracts come from the cores: `./todo-core`, `./agenda-core`, `./contact-core`,
`./role-core`, plus `./dose`, `./schedule`, `./time`, `./i18n` and `./money`.
`todoActionOps` and `planTodo` apply a to-do's Done or Cancel the way the portal does.

## Signing in

```ts
import { connectUrl, isHandoffRequest, storeHandoff, takeHandoff, HANDOFF_PATH, CALLBACK_PATH } from '@huishouden/pwa-kit/signin-handoff';
import { exchangeRefreshToken } from '@huishouden/pwa-kit/firebase-auth-rest';

const auth = { projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_API_KEY };

// 1. Send the browser to the portal, with a state bound to this browser (a SameSite=Lax cookie).
return Response.redirect(connectUrl(env.SITE_URL, { service: origin, state, client: 'Calendar feed', purpose: 'calendar' }));

// 2. POST HANDOFF_PATH, from the portal (CORS: the site's origin only).
const body = await request.json();
if (!isHandoffRequest(body)) return new Response(null, { status: 400 });
const who = await exchangeRefreshToken(auth, body.refreshToken); // throws unless valid, verified, this project
const code = await storeHandoff(env.KV, { ...body, uid: who.uid, email: who.email });
return Response.json({ code });

// 3. GET CALLBACK_PATH?state&code, a top-level navigation from the portal: check the cookie's state.
const handoff = await takeHandoff<HandoffRequest & { uid: string; email: string }>(env.KV, code, stateFromCookie);
// Keep handoff.refreshToken encrypted (workers-oauth-provider's props do), keyed by your grant.
```

The portal posts only to services named in its `CONNECT_SERVICES`. A new service is added there,
with its production and staging origins.

## Acting as the person

```ts
import { IdTokenCache, exchangeRefreshToken } from '@huishouden/pwa-kit/firebase-auth-rest';
import { FirestoreRest } from '@huishouden/pwa-kit/firestore-rest';
import { LocalClock } from '@huishouden/pwa-kit/local-clock';

const tokens = new IdTokenCache((refresh) => exchangeRefreshToken(auth, refresh)); // module scope
const db = new FirestoreRest({ projectId: auth.projectId, token: async () => (await tokens.get(refreshToken)).token });
const agenda = await db.query(`households/${id}`, 'agenda', restricted ? { where: [{ field: 'private', op: 'EQUAL', value: false }] } : {});
const clock = new LocalClock(profile.timeZone ?? 'UTC');
```

Helpers and kids must ask for `private == false` on private-capable collections, because the rules
check queries as a whole. Members who aren't a Health person's carers get nothing from
`healthPeople`. A refused call throws `FirestoreError` with `code: 'permission-denied'`.

When a refresh token comes back `revoked` (the person was disabled, or their tokens were revoked),
end the grant so the client signs in again.
