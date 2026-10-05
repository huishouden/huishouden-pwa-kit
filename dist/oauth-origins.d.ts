/**
 * Checks that a site is an Authorized JavaScript origin of the Google OAuth web client, which
 * Chrome's sign-in prompt (One Tap, `signInSilently`) and Google API tokens need. Google has no API
 * to edit a client's origins, so the bootstrap and CI check instead and say exactly what to add.
 *
 * Only the suite's one site needs to be there (docs/one-site.md "Sign-in origins"): an unverified
 * OAuth app may list at most 10 authorized domains, and every `*.web.app` site counts as one.
 *
 * Asks Google's sign-in endpoint for a token without prompting (`prompt=none`) as that origin:
 * a registered origin gets the sign-in page (200), an unregistered one is redirected to an error.
 */
export type OriginStatus = 'registered' | 'missing' | 'unknown';
/**
 * The origins a project's OAuth web client needs: the Hosting site that serves the whole suite
 * (production: `SUITE_SITE` from `./site`; staging: the project's default site, the default here)
 * and Firebase's auth handler domain (`authDomain`).
 */
export declare function signInOrigins(project: string, site?: string): string[];
export declare function originProbeUrl(clientId: string, origin: string): string;
export declare function originStatus(clientId: string, origin: string, fetchImpl?: typeof fetch): Promise<OriginStatus>;
export declare const ORIGINS_CONSOLE_URL: (project: string) => string;
export declare function missingOriginMessage(origins: string[], project?: string): string;
/**
 * The redirect URI Firebase's popup and redirect sign-in send Google back to: the auth handler on
 * the project's `authDomain` (`<project>.firebaseapp.com`, what bootstrap sets every app to). It must
 * be among the OAuth web client's Authorized redirect URIs.
 */
export declare function signInRedirectUris(project: string): string[];
/**
 * Whether `redirectUri` is an Authorized redirect URI of the client: Google sends an unregistered
 * one to its error page with `redirect_uri_mismatch` (base64 in `authError`) and a registered one on
 * to sign in. Nothing is shown to anyone; the request carries no cookies.
 */
export declare function redirectStatus(clientId: string, redirectUri: string, fetchImpl?: typeof fetch): Promise<OriginStatus>;
/**
 * Firebase Auth's authorized domains a project should have (docs/one-site.md "Sign-in origins"):
 * the suite's site and the auth handler's domain; staging adds each app's own staging site (its
 * pull requests sign in there) and `localhost` (local runs against staging).
 */
export declare function expectedAuthorizedDomains(project: string, suiteSite: string, staging?: {
    appSites: readonly string[];
}): string[];
/** What is missing from and extra on a project's authorized domains, against the expected set. */
export declare function compareAuthorizedDomains(actual: readonly string[], expected: readonly string[]): {
    missing: string[];
    extra: string[];
};
