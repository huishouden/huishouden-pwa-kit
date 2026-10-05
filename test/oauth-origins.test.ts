import { describe, expect, test } from 'bun:test';
import { compareAuthorizedDomains, expectedAuthorizedDomains, missingOriginMessage, originProbeUrl, originStatus, redirectStatus, signInOrigins, signInRedirectUris } from '../src/oauth-origins';

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
    expect(signInOrigins('demo', 'demo-suite')).toEqual(['https://demo-suite.web.app', 'https://demo.firebaseapp.com']);
  });
});

describe('redirect URIs and authorized domains', () => {
  const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_');
  test('the auth handler is the redirect URI', () => {
    expect(signInRedirectUris('demo')).toEqual(['https://demo.firebaseapp.com/__/auth/handler']);
  });
  test('on to sign-in is registered; an error naming redirect_uri_mismatch is missing; other errors unknown', async () => {
    expect(await redirectStatus('cid', 'https://demo.firebaseapp.com/__/auth/handler', respond(302, 'https://accounts.google.com/v3/signin/identifier?client_id=cid'))).toBe('registered');
    expect(await redirectStatus('cid', 'https://evil.example/cb', respond(302, `https://accounts.google.com/signin/oauth/error?authError=${b64('\u0015redirect_uri_mismatch\u0012...')}`))).toBe('missing');
    expect(await redirectStatus('cid', 'https://a.example/cb', respond(302, `https://accounts.google.com/signin/oauth/error?authError=${b64('invalid_client')}`))).toBe('unknown');
    expect(await redirectStatus('cid', 'https://a.example/cb', respond(500))).toBe('unknown');
  });
  test('production wants the suite site and the handler; staging adds app sites and localhost', () => {
    expect(expectedAuthorizedDomains('demo', 'demo')).toEqual(['demo.firebaseapp.com', 'demo.web.app']);
    expect(expectedAuthorizedDomains('demo-staging', 'demo-staging', { appSites: ['demo-staging-pet', 'demo-staging'] })).toEqual(['demo-staging-pet.web.app', 'demo-staging.firebaseapp.com', 'demo-staging.web.app', 'localhost']);
    expect(compareAuthorizedDomains(['demo.web.app', 'old.web.app'], ['demo.firebaseapp.com', 'demo.web.app'])).toEqual({ missing: ['demo.firebaseapp.com'], extra: ['old.web.app'] });
  });
});
