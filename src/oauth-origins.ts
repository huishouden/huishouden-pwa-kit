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
 * The origins a project's OAuth web client needs: the project's default Hosting site, which serves
 * the whole suite, and Firebase's auth handler domain (`authDomain`).
 */
export function signInOrigins(project: string): string[] {
  return [`https://${project}.web.app`, `https://${project}.firebaseapp.com`];
}

export function originProbeUrl(clientId: string, origin: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    scope: 'openid',
    nonce: 'origin-check',
    prompt: 'none',
    redirect_uri: `storagerelay://${origin.replace('://', '/')}?id=auth1`,
    origin,
  }).toString();
  return url.toString();
}

export async function originStatus(clientId: string, origin: string, fetchImpl: typeof fetch = fetch): Promise<OriginStatus> {
  const res = await fetchImpl(originProbeUrl(clientId, new URL(origin).origin), { redirect: 'manual' });
  if (res.status === 200) return 'registered';
  if (res.status >= 300 && res.status < 400 && (res.headers.get('location') ?? '').includes('authError=')) return 'missing';
  return 'unknown';
}

export const ORIGINS_CONSOLE_URL = (project: string) => `https://console.cloud.google.com/auth/clients?project=${project}`;

export function missingOriginMessage(origins: string[], project?: string): string {
  return [
    `Google sign-in will fail with origin_mismatch on: ${origins.join(', ')}`,
    `Add them under Authorized JavaScript origins of the "Web client (auto created by Google Service)"`,
    project ? `at ${ORIGINS_CONSOLE_URL(project)} (Google has no API for this).` : '(Google has no API for this).',
    'List only the suite site and firebaseapp.com: Google allows an unverified app 10 authorized domains.',
  ].join('\n');
}
