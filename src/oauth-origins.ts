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
export function signInOrigins(project: string, site: string = project): string[] {
  return [`https://${site}.web.app`, `https://${project}.firebaseapp.com`];
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

/**
 * The redirect URI Firebase's popup and redirect sign-in send Google back to: the auth handler on
 * the project's `authDomain` (`<project>.firebaseapp.com`, what bootstrap sets every app to). It must
 * be among the OAuth web client's Authorized redirect URIs.
 */
export function signInRedirectUris(project: string): string[] {
  return [`https://${project}.firebaseapp.com/__/auth/handler`];
}

/**
 * Whether `redirectUri` is an Authorized redirect URI of the client: Google sends an unregistered
 * one to its error page with `redirect_uri_mismatch` (base64 in `authError`) and a registered one on
 * to sign in. Nothing is shown to anyone; the request carries no cookies.
 */
export async function redirectStatus(clientId: string, redirectUri: string, fetchImpl: typeof fetch = fetch): Promise<OriginStatus> {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'openid', redirect_uri: redirectUri }).toString();
  const res = await fetchImpl(url.toString(), { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  if (res.status >= 300 && res.status < 400) {
    const authError = new URL(location, 'https://accounts.google.com').searchParams.get('authError');
    if (!authError) return 'registered';
    let decoded = '';
    try {
      decoded = atob(authError.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return 'unknown';
    }
    return decoded.includes('redirect_uri_mismatch') ? 'missing' : 'unknown';
  }
  if (res.status === 400 && (await res.text()).includes('redirect_uri_mismatch')) return 'missing';
  return res.status === 200 ? 'registered' : 'unknown';
}

/**
 * Firebase Auth's authorized domains a project should have (docs/one-site.md "Sign-in origins"):
 * the suite's site and the auth handler's domain; staging adds each app's own staging site (its
 * pull requests sign in there) and `localhost` (local runs against staging).
 */
export function expectedAuthorizedDomains(project: string, suiteSite: string, staging?: { appSites: readonly string[] }): string[] {
  const out = [`${suiteSite}.web.app`, `${project}.firebaseapp.com`];
  if (staging) out.push(...staging.appSites.map((s) => `${s}.web.app`), 'localhost');
  return [...new Set(out)].sort();
}

/** What is missing from and extra on a project's authorized domains, against the expected set. */
export function compareAuthorizedDomains(actual: readonly string[], expected: readonly string[]): { missing: string[]; extra: string[] } {
  const have = new Set(actual);
  const want = new Set(expected);
  return { missing: expected.filter((d) => !have.has(d)), extra: actual.filter((d) => !want.has(d)) };
}
