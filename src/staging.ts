/**
 * Staging: a separate Firebase project (`huishouden-staging`) where same-repo pull requests are
 * deployed and tested signed in, so no test ever touches a real household. Everything here refuses
 * to run against any other project.
 *
 * Signed-in tests don't use Google: CI mints Firebase custom tokens for invented test users with
 * the staging deploy service account (IAM `signJwt`, keyless through Workload Identity Federation),
 * and the page signs in with `signInWithCustomToken`. The seed gives those users verified emails
 * (the rules require `email_verified`) and one household they both belong to.
 *
 * Runs in Node or bun (CI, Playwright), never in an app bundle.
 */

export const STAGING_PROJECT = 'huishouden-staging';

export interface TestUser {
  uid: string;
  email: string;
  name: string;
}

/** Invented people; `example.com` is reserved, so these addresses can never reach anyone. */
export const TEST_USERS: readonly TestUser[] = [
  { uid: 'test-a', email: 'test-a@example.com', name: 'Test A' },
  { uid: 'test-b', email: 'test-b@example.com', name: 'Test B' },
];

export const TEST_HOUSEHOLD = {
  id: 'test-household',
  name: 'Test household',
  members: TEST_USERS.map((u) => u.email),
  // Fixed and old, so `pickHousehold` always chooses it over anything a test creates.
  createdAt: Date.UTC(2026, 0, 1),
} as const;

/** The audience Firebase Auth requires on a custom token. */
export const CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

export function assertStagingProject(projectId: string | undefined, what = 'Firebase project'): void {
  if (projectId !== STAGING_PROJECT) {
    throw new Error(`${what} is ${projectId ? `"${projectId}"` : 'unknown'}; test sign-in and seeding only run against ${STAGING_PROJECT}`);
  }
}

export function testUser(email: string): TestUser {
  const user = TEST_USERS.find((u) => u.email === email.trim().toLowerCase());
  if (!user) throw new Error(`${email} is not a test user; use one of ${TEST_USERS.map((u) => u.email).join(', ')}`);
  return user;
}

export interface Request {
  method: 'POST' | 'PATCH';
  url: string;
  body: unknown;
}

/** Firebase custom-token claims for `uid`, issued by `serviceAccount`, valid for an hour. */
export function customTokenClaims(uid: string, serviceAccount: string, nowMs: number) {
  const iat = Math.floor(nowMs / 1000);
  return { iss: serviceAccount, sub: serviceAccount, aud: CUSTOM_TOKEN_AUDIENCE, iat, exp: iat + 3600, uid };
}

export function signJwtRequest(uid: string, serviceAccount: string, nowMs: number): Request {
  if (!serviceAccount.endsWith(`@${STAGING_PROJECT}.iam.gserviceaccount.com`)) {
    throw new Error(`Custom tokens are only minted by a ${STAGING_PROJECT} service account, not ${serviceAccount}`);
  }
  return {
    method: 'POST',
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`,
    body: { payload: JSON.stringify(customTokenClaims(uid, serviceAccount, nowMs)) },
  };
}

type FirestoreValue = { stringValue: string } | { integerValue: string } | { arrayValue: { values: FirestoreValue[] } };
const str = (s: string): FirestoreValue => ({ stringValue: s });

/**
 * The seed as two idempotent Admin REST calls: the test users (overwritten each run, emails
 * verified) and the household document (replaced whole each run). App data under the household is
 * left alone, so tests write values unique to their run rather than counting on an empty household.
 */
export function seedRequests(projectId: string = STAGING_PROJECT): Request[] {
  assertStagingProject(projectId);
  const members = { arrayValue: { values: TEST_HOUSEHOLD.members.map(str) } };
  return [
    {
      method: 'POST',
      url: `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchCreate`,
      body: {
        users: TEST_USERS.map((u) => ({ localId: u.uid, email: u.email, emailVerified: true, displayName: u.name })),
        allowOverwrite: true,
      },
    },
    {
      method: 'PATCH',
      url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/households/${TEST_HOUSEHOLD.id}`,
      body: {
        fields: {
          name: str(TEST_HOUSEHOLD.name),
          members,
          joined: members,
          createdAt: { integerValue: String(TEST_HOUSEHOLD.createdAt) },
        },
      },
    },
  ];
}

async function call(req: Request, accessToken: string, fetchImpl: typeof fetch, projectId = STAGING_PROJECT): Promise<Record<string, unknown>> {
  const res = await fetchImpl(req.url, {
    method: req.method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'x-goog-user-project': projectId },
    body: JSON.stringify(req.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${req.method} ${new URL(req.url).pathname}: ${res.status} ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export interface StagingCredentials {
  /** OAuth access token of the staging deploy service account (CI: the auth step's output). */
  accessToken: string;
  fetchImpl?: typeof fetch;
}

/** Creates or resets the test users and their household. Safe to run on every CI run. */
export async function seedTestHousehold({ accessToken, projectId = STAGING_PROJECT, fetchImpl = fetch }: StagingCredentials & { projectId?: string }) {
  const [users, household] = seedRequests(projectId);
  const created = await call(users!, accessToken, fetchImpl, projectId);
  if (Array.isArray(created.error) && created.error.length) throw new Error(`test users: ${JSON.stringify(created.error)}`);
  await call(household!, accessToken, fetchImpl, projectId);
}

/** A Firebase custom token for a test user, signed by the staging service account without a key. */
export async function mintCustomToken({
  email,
  serviceAccount,
  accessToken,
  fetchImpl = fetch,
  now = Date.now(),
}: StagingCredentials & { email: string; serviceAccount: string; now?: number }): Promise<string> {
  const req = signJwtRequest(testUser(email).uid, serviceAccount, now);
  const { signedJwt } = await call(req, accessToken, fetchImpl);
  if (typeof signedJwt !== 'string') throw new Error('signJwt returned no token');
  return signedJwt;
}

const processEnv = () =>
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** CI hands these to the staging e2e step (see .github/workflows/pwa.yml). */
export function stagingCredentialsFromEnv(env: Record<string, string | undefined> = processEnv()) {
  const accessToken = env.HH_STAGING_ACCESS_TOKEN;
  const serviceAccount = env.HH_STAGING_SA;
  if (!accessToken || !serviceAccount) {
    throw new Error('Test sign-in runs in the staging CI job only: HH_STAGING_ACCESS_TOKEN and HH_STAGING_SA are not set');
  }
  return { accessToken, serviceAccount };
}
