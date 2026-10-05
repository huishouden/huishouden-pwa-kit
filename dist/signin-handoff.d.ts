/**
 * Signing a person in to a Huishouden service that acts as them from a server (huishouden/connector,
 * a calendar feed): the person signs in on the suite's own site, as in every app, and the portal
 * hands the service their Firebase refresh token, which the service keeps encrypted and turns into
 * ID tokens (`./firebase-auth-rest`) for Firestore (`./firestore-rest`). The household's rules then
 * decide everything the service does. No OAuth client, redirect URI or service account to set up.
 *
 * The flow:
 *
 * 1. The service sends the browser to the portal's `/connect` page: `connectUrl(site, { service,
 *    state, client })`. `state` is the service's own, bound to that browser (a cookie).
 * 2. The portal signs the person in if needed and asks them to confirm. It then POSTs a
 *    `HandoffRequest` (state, refresh token, language, time zone) to `${service}/connect/hand-off`
 *    and gets `{ code }`. It only does this for the services it lists (`CONNECT_SERVICES` in the
 *    portal), never for an origin from the URL alone.
 * 3. The service checks the refresh token with Firebase Auth and keeps the hand-off for two minutes
 *    under the code (`storeHandoff`), encrypted with a key only the code derives.
 * 4. The portal sends the browser to `${service}/connect/callback?state=…&code=…` (a top-level GET,
 *    so the service's SameSite=Lax cookie comes along). The service takes the hand-off back once
 *    (`takeHandoff`), checks it was made for that `state`, and finishes its own sign-in.
 *
 * A stolen code is useless without the browser's cookie, and the refresh token never travels in a
 * URL.
 *
 * The `hh` command line signs in the same way with no cookie to bind to, so it binds to a proof key
 * instead (PKCE, RFC 7636, as native OAuth apps do):
 *
 * 1. `hh login` listens on 127.0.0.1 (or [::1]) on a random port, makes a random `state` and a
 *    random verifier, and opens `cliConnectUrl(site, { redirect, state, codeChallenge })`:
 *    `/connect?service=hh&redirect=http://127.0.0.1:<port>/callback&state=…&code_challenge=…`.
 * 2. The portal accepts only that exact loopback shape (`isLoopbackRedirect`: an IP literal, a port
 *    from 1024 to 65535, the path `/callback`, nothing else; never `localhost`, which a hosts file or
 *    DNS can point anywhere), signs the person in, says "Sign in to the hh command-line tool on this
 *    computer", and on Allow posts a `CliHandoffRequest` to the connector's `CLI_HANDOFF_PATH`. The
 *    connector checks the refresh token and keeps it for two minutes under a one-time code, sealed
 *    with a key only the code derives and bound to the state, the challenge and the redirect.
 * 3. The browser goes to `${redirect}?state=…&code=…` (no token in it). `hh` checks the state and
 *    posts the code with the verifier to `CLI_TOKEN_PATH`, which hands the refresh token over once
 *    (`takeCliHandoff`): a replayed, expired or mismatched code gets nothing, and the first attempt
 *    uses it up either way.
 */
/** The portal page that hands a signed-in person over to a service. */
export declare const CONNECT_PATH = "/connect";
export declare const HANDOFF_PATH = "/connect/hand-off";
export declare const CALLBACK_PATH = "/connect/callback";
export interface ConnectParams {
    /** The service's origin: "https://huishouden-connector.example.workers.dev". */
    service: string;
    /** The service's state for this sign-in, opaque to the portal. */
    state: string;
    /** Who will act for the person, shown on the confirmation: "Claude", "Calendar feed". */
    client: string;
    /** Where the service sends what it gets, shown on the confirmation: "claude.ai". */
    redirectHost?: string;
    /** What the service is, for the page's wording. */
    purpose?: 'assistant' | 'calendar' | 'cli';
    /** The command line's loopback address (`service` is `hh`): where the browser goes with the code. */
    redirect?: string;
    /** The command line's PKCE challenge (S256), which its token request must answer. */
    codeChallenge?: string;
}
/** `service` on `/connect` for the `hh` command line. */
export declare const CLI_SERVICE = "hh";
/** On the connector: the portal posts a `CliHandoffRequest` here and gets `{ code }`. */
export declare const CLI_HANDOFF_PATH = "/cli/hand-off";
/** On the connector: `hh` posts `{ code, state, code_verifier, redirect_uri }` here for the sign-in. */
export declare const CLI_TOKEN_PATH = "/cli/token";
/** How long a command-line hand-off waits for `hh` to collect it. */
export declare const CLI_HANDOFF_TTL_SECONDS = 120;
/**
 * Whether `redirect` is exactly `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`
 * with a port from 1024 to 65535: the only places the portal sends a command-line sign-in. No
 * `localhost` (a name anything can resolve), no other host, path, query, fragment or user part.
 */
export declare function isLoopbackRedirect(redirect: string): boolean;
/** A PKCE verifier as RFC 7636 allows: 43 to 128 unreserved characters. */
export declare const isPkceVerifier: (v: unknown) => v is string;
/** A PKCE S256 challenge: the base64url SHA-256 of a verifier, 43 characters. */
export declare const isPkceChallenge: (v: unknown) => v is string;
/** The S256 challenge for `verifier`. */
export declare function pkceChallenge(verifier: string): Promise<string>;
/** The portal's `/connect` URL for a command-line sign-in. */
export declare function cliConnectUrl(site: string, params: {
    redirect: string;
    state: string;
    codeChallenge: string;
}): string;
/** The portal's `/connect` URL for a sign-in. */
export declare function connectUrl(site: string, params: ConnectParams): string;
/** The parameters on the portal's `/connect` page, or null when they don't make a sign-in. */
export declare function parseConnectParams(search: string): ConnectParams | null;
/** What the portal posts to the service's hand-off endpoint. */
export interface HandoffRequest {
    state: string;
    refreshToken: string;
    /** The person's language and time zone on this device, for the service's answers. */
    lang?: 'en' | 'es' | 'nl';
    timeZone?: string;
}
export declare function isHandoffRequest(v: unknown): v is HandoffRequest;
/** What the portal posts to the connector's `CLI_HANDOFF_PATH` for `hh login`. */
export interface CliHandoffRequest extends HandoffRequest {
    codeChallenge: string;
    redirect: string;
}
export declare function isCliHandoffRequest(v: unknown): v is CliHandoffRequest;
/** The few KV calls the hand-off needs (a Workers KV namespace has them). */
export interface HandoffStore {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: {
        expirationTtl?: number;
    }): Promise<void>;
    delete(key: string): Promise<void>;
}
/**
 * Keeps `value` for `ttlSeconds` (at least 60, KV's minimum) under a new random code, encrypted
 * with a key derived from the code: KV holds neither the code nor anything readable. Returns the code.
 */
export declare function storeHandoff<T extends {
    state: string;
}>(store: HandoffStore, value: T, ttlSeconds?: number): Promise<string>;
/** The hand-off stored under `code`, once (it is deleted), and only for the `state` it was made for. */
export declare function takeHandoff<T extends {
    state: string;
}>(store: HandoffStore, code: string, state: string): Promise<T | null>;
/** A command-line hand-off as the connector keeps it: who signed in, and what the code is bound to. */
export interface CliHandoff extends CliHandoffRequest {
    uid: string;
    email: string;
    /** Milliseconds since the epoch; KV's own expiry is coarser (60 s minimum, eventually consistent). */
    expiresAt: number;
}
/** Keeps a checked command-line hand-off for `CLI_HANDOFF_TTL_SECONDS` under a new one-time code. */
export declare function storeCliHandoff(store: HandoffStore, request: CliHandoffRequest, who: {
    uid: string;
    email: string;
}, now?: number): Promise<string>;
/** What `hh` posts to `CLI_TOKEN_PATH`. */
export interface CliTokenRequest {
    code: string;
    state: string;
    code_verifier: string;
    redirect_uri: string;
}
export type CliTokenRefusal = 'invalid_request' | 'unknown_code' | 'state_mismatch' | 'redirect_mismatch' | 'expired' | 'challenge_mismatch';
/**
 * The command-line hand-off for `request`, once: the code is used up by the first attempt whether it
 * succeeds or not, so a code seen in a browser's history, replayed, or tried with a guessed
 * verifier gets nothing. `reason` is for the connector's own logs and tests; `hh` is told only
 * `invalid_grant`.
 */
export declare function takeCliHandoff(store: HandoffStore, request: unknown, now?: number): Promise<{
    ok: true;
    handoff: CliHandoff;
} | {
    ok: false;
    reason: CliTokenRefusal;
}>;
