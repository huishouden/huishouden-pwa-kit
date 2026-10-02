/**
 * Checks that a site is an Authorized JavaScript origin of the Google OAuth web client, which
 * Chrome's sign-in prompt (One Tap, `signInSilently`) needs. Google has no API to edit a client's
 * origins, so the bootstrap and smoke tests check instead and say exactly what to add.
 *
 * Asks Google's sign-in endpoint for a token without prompting (`prompt=none`) as that origin:
 * a registered origin gets the sign-in page (200), an unregistered one is redirected to an error.
 */
export function originProbeUrl(clientId, origin) {
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
export async function originStatus(clientId, origin, fetchImpl = fetch) {
    const res = await fetchImpl(originProbeUrl(clientId, new URL(origin).origin), { redirect: 'manual' });
    if (res.status === 200)
        return 'registered';
    if (res.status >= 300 && res.status < 400 && (res.headers.get('location') ?? '').includes('authError='))
        return 'missing';
    return 'unknown';
}
export const ORIGINS_CONSOLE_URL = (project) => `https://console.cloud.google.com/auth/clients?project=${project}`;
export function missingOriginMessage(origins, project) {
    return [
        `Google sign-in will fail with origin_mismatch on: ${origins.join(', ')}`,
        `Add them under Authorized JavaScript origins of the "Web client (auto created by Google Service)"`,
        project ? `at ${ORIGINS_CONSOLE_URL(project)} (Google has no API for this).` : '(Google has no API for this).',
    ].join('\n');
}
