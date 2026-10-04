import { describe, expect, test } from 'bun:test';
import { decodeFields, encode, encodeFields, FieldDelete, FirestoreRest, Increment, mergePaths, FirestoreError } from '../src/firestore-rest';
import { exchangeRefreshToken, FirebaseAuthError, IdTokenCache, verifyIdToken } from '../src/firebase-auth-rest';
import { LocalClock, isTimeZone, offsetAt } from '../src/local-clock';
import { connectUrl, isHandoffRequest, parseConnectParams, storeHandoff, takeHandoff, type HandoffStore } from '../src/signin-handoff';

// Invented project, people and tokens throughout.
const PROJECT = 'demo-example';
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const idToken = (claims: object) => `${b64({ alg: 'none' })}.${b64(claims)}.`;
const SAM = { aud: PROJECT, user_id: 'u1', sub: 'u1', email: 'Sam@Example.com', email_verified: true };

type Call = { url: string; init?: RequestInit };
const fake = (respond: (call: Call) => [number, unknown]) => {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = respond({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch };
};

describe('firestore-rest', () => {
  test('whole numbers are integers, as the rules check `is int`; maps and lists nest', () => {
    expect(encode(5)).toEqual({ integerValue: '5' });
    expect(encode(1.5)).toEqual({ doubleValue: 1.5 });
    expect(encode({ a: [true, null, 'x'] })).toEqual({ mapValue: { fields: { a: { arrayValue: { values: [{ booleanValue: true }, { nullValue: null }, { stringValue: 'x' }] } } } } });
    expect(decodeFields({ n: { integerValue: '7' }, s: { stringValue: 'y' }, m: { mapValue: { fields: { d: { doubleValue: 0.5 } } } } })).toEqual({ n: 7, s: 'y', m: { d: 0.5 } });
  });

  test('a merge writes leaf paths, quoting names that are not simple', () => {
    expect(mergePaths({ due: '2031-01-05', exceptions: { '2031-01-06': { skipped: true } }, n: new Increment(1) })).toEqual(['due', 'exceptions.`2031-01-06`.skipped']);
  });

  test('commit sends sets, merges with masks and transforms, creates with a precondition, deletes', async () => {
    const { calls, fetch } = fake(() => [200, {}]);
    const db = new FirestoreRest({ projectId: PROJECT, token: async () => 'tok', fetch });
    await db.commit([
      { path: 'households/h1/items/i1', create: { name: 'Milk' } },
      { path: 'households/h1/staples/milk', merge: { timesAdded: new Increment(1), displayName: 'Milk' } },
      { path: 'households/h1/items/i2', delete: true },
    ]);
    expect(calls[0].url).toBe(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`);
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const writes = JSON.parse(String(calls[0].init!.body)).writes;
    expect(writes[0].currentDocument).toEqual({ exists: false });
    expect(writes[1].updateMask).toEqual({ fieldPaths: ['displayName'] });
    expect(writes[1].updateTransforms).toEqual([{ fieldPath: 'timesAdded', increment: { integerValue: '1' } }]);
    expect(writes[2]).toEqual({ delete: `projects/${PROJECT}/databases/(default)/documents/households/h1/items/i2` });
  });

  test('a missing document is null; a refused read says permission-denied', async () => {
    const missing = new FirestoreRest({ projectId: PROJECT, token: async () => 't', fetch: fake(() => [404, { error: { status: 'NOT_FOUND' } }]).fetch });
    expect(await missing.get('households/h1')).toBeNull();
    const refused = new FirestoreRest({ projectId: PROJECT, token: async () => 't', fetch: fake(() => [403, { error: { status: 'PERMISSION_DENIED' } }]).fetch });
    const error = await refused.get('households/h1').catch((e) => e);
    expect(error).toBeInstanceOf(FirestoreError);
    expect(error.code).toBe('permission-denied');
  });

  test('query builds one structured query under the parent and decodes the rows', async () => {
    const { calls, fetch } = fake(() => [200, [{ document: { name: `projects/${PROJECT}/databases/(default)/documents/households/h1/todos/a`, fields: { title: { stringValue: 'Bins' } } } }, { readTime: 'x' }]]);
    const db = new FirestoreRest({ projectId: PROJECT, token: async () => 't', fetch });
    const docs = await db.query('households/h1', 'todos', { where: [{ field: 'private', op: 'EQUAL', value: false }] });
    expect(docs).toEqual([{ id: 'a', path: 'households/h1/todos/a', data: { title: 'Bins' }, updateTime: undefined }]);
    expect(JSON.parse(String(calls[0].init!.body)).structuredQuery.where).toEqual({ fieldFilter: { field: { fieldPath: 'private' }, op: 'EQUAL', value: { booleanValue: false } } });
  });
});

describe('firestore-rest: aggregation and field deletes', () => {
  test('a FieldDelete in a merge is in the mask and not in the values', () => {
    const data = { exceptions: { '2031-01-06': { moved: { date: '2031-01-07', time: new FieldDelete() } } } };
    expect(mergePaths(data)).toEqual(['exceptions.`2031-01-06`.moved.date', 'exceptions.`2031-01-06`.moved.time']);
    expect(encodeFields(data)).toEqual({ exceptions: { mapValue: { fields: { '2031-01-06': { mapValue: { fields: { moved: { mapValue: { fields: { date: { stringValue: '2031-01-07' } } } } } } } } } } });
  });

  test('aggregate asks for a count and sums in one request', async () => {
    const { calls, fetch } = fake(() => [200, [{ result: { aggregateFields: { n: { integerValue: '3' }, s0: { integerValue: '5847000000000' } } }, readTime: 'x' }]]);
    const db = new FirestoreRest({ projectId: PROJECT, token: async () => 't', fetch });
    const out = await db.aggregate('households/h1', 'agenda', { where: [{ field: 'private', op: 'EQUAL', value: false }] }, ['updatedAt']);
    expect(out).toEqual({ count: 3, sums: { updatedAt: 5847000000000 } });
    expect(calls[0].url).toEndWith('/documents/households/h1:runAggregationQuery');
    const body = JSON.parse(String(calls[0].init!.body)).structuredAggregationQuery;
    expect(body.aggregations).toEqual([{ alias: 'n', count: {} }, { alias: 's0', sum: { field: { fieldPath: 'updatedAt' } } }]);
    expect(body.structuredQuery.from).toEqual([{ collectionId: 'agenda' }]);
  });
});

describe('firebase-auth-rest', () => {
  const options = (fetch: ReturnType<typeof fake>['fetch']) => ({ projectId: PROJECT, apiKey: 'key', fetch });

  test('a refresh token buys an ID token and says who it is', async () => {
    const { calls, fetch } = fake(() => [200, { id_token: idToken(SAM), expires_in: '3600' }]);
    const got = await exchangeRefreshToken(options(fetch), 'refresh-token-1');
    expect(got).toMatchObject({ uid: 'u1', email: 'sam@example.com' });
    expect(calls[0].url).toBe('https://securetoken.googleapis.com/v1/token?key=key');
  });

  test('revoked, unverified and other-project tokens are refused', async () => {
    const revoked = await exchangeRefreshToken(options(fake(() => [400, { error: { message: 'TOKEN_EXPIRED' } }]).fetch), 'r').catch((e) => e);
    expect(revoked).toBeInstanceOf(FirebaseAuthError);
    expect(revoked.kind).toBe('revoked');
    const down = await exchangeRefreshToken(options(fake(() => [503, {}]).fetch), 'r').catch((e) => e);
    expect(down.kind).toBe('unavailable');
    const unverified = await exchangeRefreshToken(options(fake(() => [200, { id_token: idToken({ ...SAM, email_verified: false }) }]).fetch), 'r').catch((e) => e);
    expect(unverified.kind).toBe('unverified');
    const other = await exchangeRefreshToken(options(fake(() => [200, { id_token: idToken({ ...SAM, aud: 'another' }) }]).fetch), 'r').catch((e) => e);
    expect(other.kind).toBe('revoked');
  });

  test('verifyIdToken asks Firebase Auth and checks the subject', async () => {
    expect(await verifyIdToken(options(fake(() => [200, { users: [{ localId: 'u1' }] }]).fetch), idToken(SAM))).toEqual({ uid: 'u1', email: 'sam@example.com' });
    expect((await verifyIdToken(options(fake(() => [200, { users: [{ localId: 'u2' }] }]).fetch), idToken(SAM)).catch((e) => e)).kind).toBe('revoked');
  });

  test('the cache asks once per token until near expiry', async () => {
    let asked = 0;
    const cache = new IdTokenCache(async () => ({ uid: 'u1', email: 'sam@example.com', token: `t${++asked}`, expiresAt: 1_000_000 + 3600_000 }));
    expect((await cache.get('r', 1_000_000)).token).toBe('t1');
    expect((await cache.get('r', 1_000_000 + 3000_000)).token).toBe('t1');
    expect((await cache.get('r', 1_000_000 + 3400_000)).token).toBe('t2');
  });
});

describe('local-clock', () => {
  const t = Date.UTC(2031, 0, 6, 3, 30); // 22:30 the evening before in New York
  test('the local frame reads the zone\'s wall clock, and back', () => {
    const clock = new LocalClock('America/New_York', () => t);
    expect(offsetAt('America/New_York', t)).toBe(-5 * 3600_000);
    expect(clock.today()).toBe('2031-01-05');
    expect(clock.utc(clock.local(t))).toBe(t);
    expect(clock.parse('2031-01-05T08:00')).toEqual({ at: Date.UTC(2031, 0, 5, 13), allDay: false });
    expect(clock.parse('2031-07-05')).toEqual({ at: Date.UTC(2031, 6, 5, 4), allDay: true });
    expect(clock.parse('2031-02-30')).toBeNull();
    expect(clock.isoLocal(t)).toBe('2031-01-05T22:30');
  });
  test('time zone names', () => {
    expect(isTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('signin-handoff', () => {
  const memory = (): HandoffStore & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return { map, get: async (k) => map.get(k) ?? null, put: async (k, v) => void map.set(k, v), delete: async (k) => void map.delete(k) };
  };
  const STATE = 'state-abcdefghijklmnop';

  test('a hand-off is taken back once, only for its state, and KV holds nothing readable', async () => {
    const store = memory();
    const code = await storeHandoff(store, { state: STATE, refreshToken: 'secret-refresh-token' });
    expect([...store.map.values()].join()).not.toContain('secret');
    expect([...store.map.keys()].join()).not.toContain(code);
    expect(await takeHandoff(store, code, 'state-other-0123456789')).toBeNull();
    const again = await storeHandoff(store, { state: STATE, refreshToken: 'secret-refresh-token' });
    expect(await takeHandoff<{ state: string; refreshToken: string }>(store, again, STATE)).toEqual({ state: STATE, refreshToken: 'secret-refresh-token' });
    expect(await takeHandoff(store, again, STATE)).toBeNull();
  });

  test('connect URLs round-trip; anything else is not a sign-in', () => {
    const url = new URL(connectUrl('https://example.web.app/', { service: 'https://svc.example.dev', state: STATE, client: 'Claude', redirectHost: 'claude.ai', purpose: 'assistant' }));
    expect(url.pathname).toBe('/connect');
    expect(parseConnectParams(url.search)).toEqual({ service: 'https://svc.example.dev', state: STATE, client: 'Claude', redirectHost: 'claude.ai', purpose: 'assistant' });
    expect(parseConnectParams('?service=javascript:alert(1)&state=' + STATE + '&client=x')).toBeNull();
    expect(parseConnectParams('?service=http://evil.example&state=' + STATE + '&client=x')).toBeNull();
    expect(parseConnectParams('?service=https://svc.example.dev&state=short&client=x')).toBeNull();
    expect(isHandoffRequest({ state: STATE, refreshToken: 'r'.repeat(40), lang: 'nl' })).toBe(true);
    expect(isHandoffRequest({ state: STATE, refreshToken: 'r'.repeat(40), lang: 'fr' })).toBe(false);
  });
});
