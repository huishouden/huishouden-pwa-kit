import { describe, expect, test } from 'bun:test';
import { missingOriginMessage, originProbeUrl, originStatus, signInOrigins } from '../src/oauth-origins';

const respond = (status: number, location?: string) =>
  (async () => new Response(null, { status, headers: location ? { location } : {} })) as unknown as typeof fetch;

describe('oauth origin check', () => {
  test('probes as the origin, without prompting', () => {
    const url = new URL(originProbeUrl('cid', 'https://app.example.web.app'));
    expect(url.searchParams.get('prompt')).toBe('none');
    expect(url.searchParams.get('origin')).toBe('https://app.example.web.app');
    expect(url.searchParams.get('redirect_uri')).toBe('storagerelay://https/app.example.web.app?id=auth1');
  });
  test('200 is registered, a redirect to an auth error is missing, anything else unknown', async () => {
    expect(await originStatus('cid', 'https://a.example', respond(200))).toBe('registered');
    expect(await originStatus('cid', 'https://a.example/path', respond(302, 'https://accounts.google.com/signin/oauth/error?authError=abc'))).toBe('missing');
    expect(await originStatus('cid', 'https://a.example', respond(500))).toBe('unknown');
  });
  test('the message names the origins and the console page', () => {
    expect(missingOriginMessage(['https://a.example'], 'demo')).toContain('https://console.cloud.google.com/auth/clients?project=demo');
  });
  test('a project needs only its suite site and its auth handler domain', () => {
    expect(signInOrigins('demo-staging')).toEqual(['https://demo-staging.web.app', 'https://demo-staging.firebaseapp.com']);
  });
});
