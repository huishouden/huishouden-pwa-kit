import { describe, expect, test } from 'bun:test';
import seedFixture from './fixtures/staging/seed-requests.json';
import claimsFixture from './fixtures/staging/sign-jwt-claims.json';
import partialError from './fixtures/staging/batch-create-partial-error.json';
import { mintCustomToken, seedRequests, seedTestHousehold, signJwtRequest, stagingCredentialsFromEnv, testUser } from '../src/staging';

const SA = 'github-deploy@huishouden-staging.iam.gserviceaccount.com';
const NOW = 1_790_000_000_000;

type Call = { url: string; method?: string; headers: Record<string, string>; body: unknown };
function recorder(reply: (url: string) => Response = () => Response.json({})) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return reply(url);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('staging seed', () => {
  test('creates the verified test users and replaces the household whole', () => {
    expect(JSON.parse(JSON.stringify(seedRequests()))).toEqual(seedFixture);
  });

  test('refuses any project but huishouden-staging', () => {
    expect(() => seedRequests('huishouden-piekstra')).toThrow(/only run against huishouden-staging/);
  });

  test('sends both calls with the access token, billed to the staging project', async () => {
    const { calls, fetchImpl } = recorder();
    await seedTestHousehold({ accessToken: 'at', fetchImpl });
    expect(calls.map((c) => [c.method, c.url])).toEqual(seedFixture.map((r) => [r.method, r.url]));
    expect(calls[0]!.headers.authorization).toBe('Bearer at');
    expect(calls[0]!.headers['x-goog-user-project']).toBe('huishouden-staging');
  });

  test('fails when a test user could not be written', async () => {
    const { fetchImpl } = recorder((url) => Response.json(url.includes('batchCreate') ? partialError : {}));
    await expect(seedTestHousehold({ accessToken: 'at', fetchImpl })).rejects.toThrow(/INVALID_EMAIL/);
  });

  test('says which call failed and how', async () => {
    const { fetchImpl } = recorder(() => new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 }));
    await expect(seedTestHousehold({ accessToken: 'at', fetchImpl })).rejects.toThrow(/accounts:batchCreate: 403 .*PERMISSION_DENIED/);
  });
});

describe('custom tokens', () => {
  test('signs Firebase custom-token claims for the test user with the staging service account', () => {
    const req = signJwtRequest('test-a', SA, NOW);
    expect(req.url).toBe(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SA)}:signJwt`);
    expect(JSON.parse((req.body as { payload: string }).payload)).toEqual(claimsFixture);
  });

  test('never signs with a service account outside the staging project', () => {
    expect(() => signJwtRequest('test-a', 'github-deploy@huishouden-piekstra.iam.gserviceaccount.com', NOW)).toThrow(/huishouden-staging service account/);
  });

  test('only for the seeded test users', async () => {
    expect(testUser(' Test-B@example.com ').uid).toBe('test-b');
    expect(() => testUser('someone@example.org')).toThrow(/not a test user/);
  });

  test('returns the signed JWT', async () => {
    const { calls, fetchImpl } = recorder(() => Response.json({ keyId: 'k', signedJwt: 'a.b.c' }));
    expect(await mintCustomToken({ email: 'test-a@example.com', serviceAccount: SA, accessToken: 'at', fetchImpl, now: NOW })).toBe('a.b.c');
    expect(calls[0]!.headers.authorization).toBe('Bearer at');
  });

  test('credentials come from the staging CI job only', () => {
    expect(() => stagingCredentialsFromEnv({})).toThrow(/staging CI job/);
    expect(stagingCredentialsFromEnv({ HH_STAGING_ACCESS_TOKEN: 'at', HH_STAGING_SA: SA })).toEqual({ accessToken: 'at', serviceAccount: SA });
  });
});
