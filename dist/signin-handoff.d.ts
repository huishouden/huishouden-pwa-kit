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
    purpose?: 'assistant' | 'calendar';
}
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
