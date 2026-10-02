/**
 * Checks that a site is an Authorized JavaScript origin of the Google OAuth web client, which
 * Chrome's sign-in prompt (One Tap, `signInSilently`) needs. Google has no API to edit a client's
 * origins, so the bootstrap and smoke tests check instead and say exactly what to add.
 *
 * Asks Google's sign-in endpoint for a token without prompting (`prompt=none`) as that origin:
 * a registered origin gets the sign-in page (200), an unregistered one is redirected to an error.
 */
export type OriginStatus = 'registered' | 'missing' | 'unknown';
export declare function originProbeUrl(clientId: string, origin: string): string;
export declare function originStatus(clientId: string, origin: string, fetchImpl?: typeof fetch): Promise<OriginStatus>;
export declare const ORIGINS_CONSOLE_URL: (project: string) => string;
export declare function missingOriginMessage(origins: string[], project?: string): string;
