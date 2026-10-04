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
