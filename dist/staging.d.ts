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
export declare const STAGING_PROJECT = "huishouden-staging";
export interface TestUser {
    uid: string;
    email: string;
    name: string;
}
/** Invented people; `example.com` is reserved, so these addresses can never reach anyone. */
export declare const TEST_USERS: readonly TestUser[];
export declare const TEST_HOUSEHOLD: {
    readonly id: "test-household";
    readonly name: "Test household";
    readonly members: string[];
    readonly createdAt: number;
};
/** The audience Firebase Auth requires on a custom token. */
export declare const CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
export declare function assertStagingProject(projectId: string | undefined, what?: string): void;
export declare function testUser(email: string): TestUser;
export interface AdminRestCall {
    method: 'POST' | 'PATCH';
    url: string;
    body: unknown;
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
/**
 * The seed as two idempotent Admin REST calls: the test users (overwritten each run, emails
 * verified) and the household document (replaced whole each run). App data under the household is
 * left alone, so tests write values unique to their run rather than counting on an empty household.
 */
export declare function seedRequests(): AdminRestCall[];
export interface StagingCredentials {
    /** OAuth access token of the staging deploy service account (CI: the auth step's output). */
    accessToken: string;
    fetchImpl?: typeof fetch;
}
/** Creates or resets the test users and their household. Safe to run on every CI run. */
export declare function seedTestHousehold({ accessToken, fetchImpl }: StagingCredentials): Promise<void>;
/** A Firebase custom token for a test user, signed by the staging service account without a key. */
export declare function mintCustomToken({ email, serviceAccount, accessToken, fetchImpl, now, }: StagingCredentials & {
    email: string;
    serviceAccount: string;
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
export declare function stagingWebConfig(env: Record<string, string | undefined>, site: {
    apiKey?: string;
    projectId?: string;
    authDomain?: string;
} | null): StagingWebConfig;
/** CI hands these to the staging e2e step (see .github/workflows/pwa.yml). */
export declare function stagingCredentialsFromEnv(env?: Record<string, string | undefined>): {
    accessToken: string;
    serviceAccount: string;
};
