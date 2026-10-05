import { describe, expect, test } from 'bun:test';
import {
  CLI_HANDOFF_TTL_SECONDS,
  cliConnectUrl,
  isCliHandoffRequest,
  isLoopbackRedirect,
  parseConnectParams,
  pkceChallenge,
  storeCliHandoff,
  takeCliHandoff,
  type HandoffStore,
} from '../src/signin-handoff';

const memory = (): HandoffStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, put: async (k, v) => void map.set(k, v), delete: async (k) => void map.delete(k) };
};

const STATE = 'state-abcdefghijklmnop';
const VERIFIER = 'v'.repeat(20) + '-verifier-' + 'x'.repeat(20);
const REDIRECT = 'http://127.0.0.1:49152/callback';
const NOW = Date.UTC(2031, 0, 6, 15);
const WHO = { uid: 'uid-1', email: 'sam@example.com' };

async function handoff(store: HandoffStore, over: { redirect?: string } = {}) {
  const codeChallenge = await pkceChallenge(VERIFIER);
  const code = await storeCliHandoff(store, { state: STATE, refreshToken: 'secret-refresh-token-0123456789', codeChallenge, redirect: over.redirect ?? REDIRECT }, WHO, NOW);
  return { code, codeChallenge };
}

const token = (code: string, over: Record<string, unknown> = {}) => ({ code, state: STATE, code_verifier: VERIFIER, redirect_uri: REDIRECT, ...over });

describe('loopback redirects', () => {
  test('only http://127.0.0.1:<port>/callback and http://[::1]:<port>/callback, ports 1024-65535', () => {
    for (const ok of ['http://127.0.0.1:1024/callback', 'http://127.0.0.1:65535/callback', 'http://[::1]:8080/callback', REDIRECT]) expect(isLoopbackRedirect(ok)).toBe(true);
    for (const bad of [
      'http://localhost:8080/callback',
      'http://LOCALHOST:8080/callback',
      'http://127.0.0.1.nip.io:8080/callback',
      'http://127.0.0.2:8080/callback',
      'http://127.1:8080/callback',
      'http://0x7f000001:8080/callback',
      'http://[::ffff:127.0.0.1]:8080/callback',
      'https://127.0.0.1:8080/callback',
      'http://127.0.0.1/callback',
      'http://127.0.0.1:80/callback',
      'http://127.0.0.1:1023/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:099999/callback',
      'http://127.0.0.1:08080/callback',
      'http://127.0.0.1:8080/callback/',
      'http://127.0.0.1:8080/callback?x=1',
      'http://127.0.0.1:8080/callback#x',
      'http://127.0.0.1:8080/other',
      'http://user@127.0.0.1:8080/callback',
      'http://evil.example@127.0.0.1:8080/callback',
      'http://127.0.0.1:8080@evil.example/callback',
      'http://evil.example/callback',
      'https://evil.example:8080/callback',
      ' http://127.0.0.1:8080/callback',
      'http://127.0.0.1:8080/callback ',
      'javascript:alert(1)//http://127.0.0.1:8080/callback',
    ])
      expect([bad, isLoopbackRedirect(bad)]).toEqual([bad, false]);
  });

  test('the connect URL round-trips; any other redirect, challenge or method is not a sign-in', async () => {
    const codeChallenge = await pkceChallenge(VERIFIER);
    const url = new URL(cliConnectUrl('https://example.web.app/', { redirect: REDIRECT, state: STATE, codeChallenge }));
    expect(url.pathname).toBe('/connect');
    expect(parseConnectParams(url.search)).toEqual({ service: 'hh', state: STATE, client: 'hh', redirect: REDIRECT, codeChallenge, purpose: 'cli' });
    const q = (over: Record<string, string>) => `?${new URLSearchParams({ service: 'hh', redirect: REDIRECT, state: STATE, code_challenge: codeChallenge, ...over })}`;
    expect(parseConnectParams(q({ redirect: 'http://localhost:49152/callback' }))).toBeNull();
    expect(parseConnectParams(q({ redirect: 'https://evil.example/callback' }))).toBeNull();
    expect(parseConnectParams(q({ code_challenge: 'short' }))).toBeNull();
    expect(parseConnectParams(q({ code_challenge_method: 'plain' }))).toBeNull();
    expect(parseConnectParams(q({ state: 'short' }))).toBeNull();
    expect(isCliHandoffRequest({ state: STATE, refreshToken: 'r'.repeat(40), codeChallenge, redirect: REDIRECT })).toBe(true);
    expect(isCliHandoffRequest({ state: STATE, refreshToken: 'r'.repeat(40), codeChallenge, redirect: 'http://localhost:49152/callback' })).toBe(false);
    expect(isCliHandoffRequest({ state: STATE, refreshToken: 'r'.repeat(40), redirect: REDIRECT })).toBe(false);
  });

  test('S256 is the base64url SHA-256 of the verifier, unpadded', async () => {
    const { createHash } = await import('node:crypto');
    expect(await pkceChallenge(VERIFIER)).toBe(createHash('sha256').update(VERIFIER).digest('base64url'));
    expect(await pkceChallenge(VERIFIER)).toHaveLength(43);
  });
});

describe('the one-time code', () => {
  test('gives the sign-in once to the right state, redirect and verifier; KV holds nothing readable', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect([...store.map.values()].join()).not.toContain('secret');
    expect([...store.map.keys()].join()).not.toContain(code);
    const r = await takeCliHandoff(store, token(code), NOW + 1000);
    expect(r.ok && r.handoff).toMatchObject({ refreshToken: 'secret-refresh-token-0123456789', uid: 'uid-1', email: 'sam@example.com' });
  });

  test('a replayed code gets nothing', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect((await takeCliHandoff(store, token(code), NOW)).ok).toBe(true);
    expect(await takeCliHandoff(store, token(code), NOW)).toEqual({ ok: false, reason: 'unknown_code' });
  });

  test('a state mismatch gets nothing and uses the code up', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect(await takeCliHandoff(store, token(code, { state: 'state-other-0123456789' }), NOW)).toEqual({ ok: false, reason: 'state_mismatch' });
    expect(await takeCliHandoff(store, token(code), NOW)).toEqual({ ok: false, reason: 'unknown_code' });
  });

  test('a challenge mismatch (the wrong verifier) gets nothing and uses the code up', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect(await takeCliHandoff(store, token(code, { code_verifier: 'w'.repeat(43) }), NOW)).toEqual({ ok: false, reason: 'challenge_mismatch' });
    expect(await takeCliHandoff(store, token(code), NOW)).toEqual({ ok: false, reason: 'unknown_code' });
  });

  test('an expired code gets nothing, even if KV still has it', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect(await takeCliHandoff(store, token(code), NOW + CLI_HANDOFF_TTL_SECONDS * 1000)).toEqual({ ok: false, reason: 'expired' });
  });

  test('a different redirect gets nothing', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect(await takeCliHandoff(store, token(code, { redirect_uri: 'http://127.0.0.1:49153/callback' }), NOW)).toEqual({ ok: false, reason: 'redirect_mismatch' });
  });

  test('malformed requests and unknown codes get nothing', async () => {
    const store = memory();
    const { code } = await handoff(store);
    expect(await takeCliHandoff(store, null, NOW)).toEqual({ ok: false, reason: 'invalid_request' });
    expect(await takeCliHandoff(store, token(code, { code_verifier: 'short' }), NOW)).toEqual({ ok: false, reason: 'invalid_request' });
    expect(await takeCliHandoff(store, token('A'.repeat(43)), NOW)).toEqual({ ok: false, reason: 'unknown_code' });
    // The malformed tries didn't use the code up.
    expect((await takeCliHandoff(store, token(code), NOW)).ok).toBe(true);
  });

  test('a connector hand-off (no challenge) is never a command-line sign-in', async () => {
    const { storeHandoff } = await import('../src/signin-handoff');
    const store = memory();
    const code = await storeHandoff(store, { state: STATE, refreshToken: 'secret-refresh-token' });
    expect(await takeCliHandoff(store, token(code), NOW)).toEqual({ ok: false, reason: 'unknown_code' });
  });
});
