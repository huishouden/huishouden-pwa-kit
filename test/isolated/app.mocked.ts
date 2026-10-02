// Mocks Firebase and kit modules for the whole process, so it runs on its own (package.json "test").
import { describe, expect, mock, test } from 'bun:test';

const calls: string[] = [];
const fakeApp = { name: '[DEFAULT]' };
mock.module('firebase/app', () => ({
  getApps: () => [],
  initializeApp: (config: { projectId: string }) => {
    calls.push(`initializeApp ${config.projectId}`);
    return fakeApp;
  },
}));
class GoogleAuthProvider {
  params: Record<string, string> = {};
  setCustomParameters(p: Record<string, string>) {
    this.params = p;
  }
}
mock.module('firebase/auth', () => ({
  GoogleAuthProvider,
  getAuth: () => ({ currentUser: null }),
  signInWithPopup: (_auth: unknown, provider: GoogleAuthProvider) => {
    calls.push(`popup ${provider.params.prompt}`);
    return Promise.resolve();
  },
  signOut: () => {
    calls.push('signOut');
    return Promise.resolve();
  },
}));
mock.module('../../src/firestore.js', () => ({
  initFirestore: () => {
    calls.push('initFirestore');
    return { type: 'firestore' };
  },
}));
mock.module('../../src/auth.js', () => ({ forgetSilentSignIn: () => (calls.push('forgetSilentSignIn'), Promise.resolve()) }));
mock.module('../../src/google-token.js', () => ({
  configureGoogleTokens: (c: { clientId?: string; preload?: boolean }) => calls.push(`configureGoogleTokens ${c.clientId} ${c.preload}`),
  forgetGoogleToken: () => calls.push('forgetGoogleToken'),
}));
mock.module('../../src/observability.js', () => ({ startObservability: (o: { app: string }) => calls.push(`observability ${o.app}`) }));

const { initApp } = await import('../../src/app');

describe('initApp', () => {
  const env = { VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'demo-p', VITE_FIREBASE_APP_ID: '1:2:web:3', VITE_GOOGLE_CLIENT_ID: 'client' };

  test('starts the app, observability and Google tokens; Firestore on first use', () => {
    const handles = initApp({ app: 'car', env, preloadGoogle: false });
    expect(calls).toEqual(['initializeApp demo-p', 'observability car', 'configureGoogleTokens client false']);
    expect(handles.googleClientId).toBe('client');
    expect(handles.db).toBe(handles.db);
    expect(calls.filter((c) => c === 'initFirestore')).toHaveLength(1);
  });

  test('sign-in offers the account chooser; sign-out forgets silent sign-in and tokens first', async () => {
    const handles = initApp({ app: 'pet', env: { ...env, VITE_GOOGLE_CLIENT_ID: '' } });
    expect(handles.googleClientId).toBeUndefined();
    calls.length = 0;
    await handles.signInWithGoogle();
    await handles.signOutEverywhere();
    expect(calls).toEqual(['popup select_account', 'forgetSilentSignIn', 'forgetGoogleToken', 'signOut']);
  });
});
