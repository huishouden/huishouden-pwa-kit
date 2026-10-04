export declare const STAGING_PROJECT = "huishouden-staging";
/** The emulators' project in the kit's app-tests job: `demo-` projects never reach Google. */
export declare const EMULATOR_PROJECT = "demo-huishouden";
export type TestRole = 'admin' | 'member' | 'helper' | 'kid';
export declare const TEST_ROLES: readonly TestRole[];
export interface TestUser {
    uid: string;
    /** `<household id>-<role>@example.com`: `example.com` is reserved, so it can never reach anyone. */
    email: string;
    name: string;
    role: TestRole;
}
export interface TestHousehold {
    /** `e2e-<repo>-<run id>-<attempt>-<scope>` in CI. */
    id: string;
    name: string;
    users: Record<TestRole, TestUser>;
}
export type E2eTarget = 'staging' | 'emulator';
type Env = Record<string, string | undefined>;
/** `emulator` in the kit's app-tests job (`HH_E2E_TARGET=emulator`), otherwise `staging`. */
export declare function e2eTarget(env?: Env): E2eTarget;
/** The project the target's users and households live in. */
export declare function e2eProject(env?: Env): string;
export declare function assertStagingProject(projectId: string | undefined, what?: string): void;
/**
 * This run's id: `HH_STAGING_RUN` (the kit's jobs set `e2e-<repo>-<run id>-<attempt>`), else
 * `e2e-emulator` on the emulators and `e2e-local` on staging from a laptop.
 */
export declare function testRunId(env?: Env): string;
/** The kit's jobs' run id: `e2e-<repo>-<run id>-<attempt>`. */
export declare function ciRunId(repository: string, runId: string | number, attempt: string | number): string;
/**
 * The run's household for `scope` (a spec file's name; default the run's own), with its four
 * invented people. Pure: the same run and scope name the same household and users in every worker.
 */
export declare function testHousehold(scope?: string, env?: Env): TestHousehold;
/** Which of the household's users `email` is; throws for anyone else. */
export declare function testUserByEmail(household: TestHousehold, email: string): TestUser;
/** The audience Firebase Auth requires on a custom token. */
export declare const CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
export interface AdminRestCall {
    method: 'GET' | 'POST' | 'PATCH';
    url: string;
    body?: unknown;
}
/** Firebase custom-token claims for `uid`, issued by `serviceAccount`, valid for an hour. */
export declare function customTokenClaims(uid: string, serviceAccount: string, nowMs: number): {
    iss: string;
    sub: string;
    aud: string;
    iat: number;
    exp: number;
    uid: string;
};
export declare function signJwtRequest(uid: string, serviceAccount: string, nowMs: number): AdminRestCall;
/** An unsigned custom token, which only the Auth emulator accepts. */
export declare function emulatorCustomToken(uid: string, nowMs: number): string;
/** When Firestore's free daily quota next resets: midnight Pacific, as `HH:00 UTC`. */
export declare function quotaResetUtc(now?: number): string;
/** Firestore said the project's daily quota is used up (Spark: 50k reads, 20k writes, 20k deletes). */
export declare class StagingQuotaError extends Error {
    constructor(what: string, now?: number);
}
/** A 429 or RESOURCE_EXHAUSTED from a Google API. */
export declare function isQuotaExceeded(status: number, body: string): boolean;
export interface AdminCredentials {
    /** Staging: the deploy service account's OAuth access token (default `HH_STAGING_ACCESS_TOKEN`). */
    accessToken?: string;
    /** Where HH_* settings are read from (default `process.env`). */
    env?: Env;
    fetchImpl?: typeof fetch;
}
/** The seed as two Admin REST calls: the users (overwritten, emails verified), then one commit. */
export declare function seedRequests(household: TestHousehold, docs?: Record<string, Record<string, unknown>>, credentials?: AdminCredentials, now?: number): AdminRestCall[];
export interface SeedOptions extends AdminCredentials {
    /** The household to seed (default the run's own, `testHousehold()`). */
    household?: TestHousehold;
    /** App data written with it, by path under the household (`{ 'agenda/e1': {...} }`), in the same commit. */
    docs?: Record<string, Record<string, unknown>>;
}
/**
 * Creates or resets the household's four users and its document, plus `docs`: two calls, one
 * write per document. Idempotent, so every spec (and a retry) that needs the household may call it.
 */
export declare function seedTestHousehold(options?: SeedOptions): Promise<TestHousehold>;
/** Writes `docs` (paths under the household) in one batched commit. */
export declare function writeTestDocs(household: TestHousehold, docs: Record<string, Record<string, unknown>>, credentials?: AdminCredentials): Promise<void>;
/**
 * One document under the household, read with admin access: one read, or null when it doesn't
 * exist. Check a write with this rather than by listing a collection, which reads every document.
 */
export declare function getTestDoc(household: TestHousehold, path: string, credentials?: AdminCredentials): Promise<Record<string, unknown> | null>;
/** Deletes a household and everything under it, 500 deletes per commit. Returns how many documents. */
export declare function deleteHousehold(id: string, credentials?: AdminCredentials): Promise<number>;
export interface CleanupReport {
    households: string[];
    documents: number;
    users: number;
}
/**
 * Removes everything this run made: its users, every household any of them belongs to (the seeded
 * ones and any a test created) and households named for the run. The kit's staging job runs it
 * after the tests (`pwa-staging cleanup`).
 */
export declare function cleanupTestRun(credentials?: AdminCredentials): Promise<CleanupReport>;
/** The shared fixture of kits before 0.72, which every run reseeded; the sweep removes it. */
export declare const LEGACY_TEST_UIDS: readonly string[];
export declare const LEGACY_TEST_HOUSEHOLD = "test-household";
/**
 * Removes what runs left behind (cancelled, or killed before their cleanup): `e2e-` users and
 * `e2e-` households older than `olderThanMs` (default a day) with every household those users
 * belong to, and the shared fixture of older kits. The portal's nightly run (`pwa-staging sweep`).
 */
export declare function sweepStaging({ olderThanMs, now, ...credentials }?: AdminCredentials & {
    olderThanMs?: number;
    now?: number;
}): Promise<CleanupReport>;
/**
 * One read of a document that doesn't exist. Throws `StagingQuotaError` when today's quota is used
 * up, so the job stops with that rather than with a page of timeouts.
 */
export declare function checkStagingQuota(credentials?: AdminCredentials): Promise<void>;
/** A Firebase custom token for a test user: signed by the staging service account, unsigned on the emulators. */
export declare function mintCustomToken({ uid, serviceAccount, accessToken, env, fetchImpl, now, }: AdminCredentials & {
    uid: string;
    serviceAccount?: string;
    now?: number;
}): Promise<string>;
export interface StagingWebConfig {
    apiKey: string;
    projectId: string;
    authDomain?: string;
}
/**
 * The Firebase web config a test signs in with, and the guard that it is staging's. The build's
 * VITE_FIREBASE_* (what the app was built with) win over the site's /__/firebase/init.json (what its
 * Hosting project serves); either one naming another project refuses, as does a missing API key.
 */
export declare function stagingWebConfig(env: Env, site: {
    apiKey?: string;
    projectId?: string;
    authDomain?: string;
} | null): StagingWebConfig;
/** The web config of an app built for the emulators (the kit's app-tests job builds with these). */
export declare function emulatorWebConfig(env?: Env): StagingWebConfig;
/** The staging job's credentials (see .github/workflows/pwa.yml). */
export declare function stagingCredentialsFromEnv(env?: Env): {
    accessToken: string;
    serviceAccount: string;
};
/**
 * Whether signed-in tests can run here: on the emulators, or with the staging job's credentials.
 * Specs skip without: `test.skip(!signedInTestsAvailable(), 'signed-in tests run in CI')`.
 */
export declare function signedInTestsAvailable(env?: Env): boolean;
export {};
