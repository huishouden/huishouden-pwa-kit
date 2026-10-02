import { beforeEach, describe, expect, mock, test } from 'bun:test';

// A stand-in for Google's popup: each call hands out a new token for the scopes asked for.
const popups: string[][] = [];
class GoogleAuthProvider {
  scopes: string[] = [];
  params: Record<string, string> = {};
  addScope(s: string) {
    this.scopes.push(s);
  }
  setCustomParameters(p: Record<string, string>) {
    this.params = p;
  }
  static credential = (idToken: string) => ({ idToken });
  static credentialFromResult = (r: { token?: string }) => (r.token ? { accessToken: r.token } : null);
}
let grant = true;
mock.module('firebase/auth', () => ({
  GoogleAuthProvider,
  reauthenticateWithPopup: async (_user: unknown, provider: GoogleAuthProvider) => {
    popups.push(provider.scopes);
    return grant ? { token: `token-${popups.length}` } : {};
  },
  signInWithCredential: async () => ({ user: { uid: 'u1' } }),
}));
const { cachedGoogleToken, forgetGoogleToken, googleAccessToken, googleFetch, GoogleApiError } = await import('../src/google-token');
const { requestGmailToken, storedGmailToken, gmailMailbox, GMAIL_READONLY_SCOPE } = await import('../src/gmail');

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

const auth = (uid = 'u1') => ({ currentUser: { uid, email: `${uid}@example.com` } }) as never;
const A = 'https://www.googleapis.com/auth/a';
const B = 'https://www.googleapis.com/auth/b';

beforeEach(() => {
  forgetGoogleToken();
  popups.length = 0;
  grant = true;
});

describe('googleAccessToken', () => {
  test('asks once per set of scopes and reuses the token for the hour', async () => {
    expect(await googleAccessToken(auth(), [A])).toBe('token-1');
    expect(await googleAccessToken(auth(), [A])).toBe('token-1');
    expect(popups).toEqual([[A]]);
    expect(await googleAccessToken(auth(), [B])).toBe('token-2');
    expect(popups).toEqual([[A], [B]]);
  });

  test('a token for more scopes covers a request for fewer', async () => {
    await googleAccessToken(auth(), [A, B]);
    expect(cachedGoogleToken(auth(), [B])).toBe('token-1');
    expect(cachedGoogleToken(auth(), [A, B])).toBe('token-1');
  });

  test('tokens are per member', async () => {
    await googleAccessToken(auth('u1'), [A]);
    expect(cachedGoogleToken(auth('u2'), [A])).toBeNull();
  });

  test('memory only unless persisted; persisted ones survive a reload', async () => {
    await googleAccessToken(auth(), [A]);
    expect(store.has('hh-google-tokens')).toBe(false);
    await googleAccessToken(auth(), [B], { persist: true });
    const saved = JSON.parse(store.get('hh-google-tokens')!);
    expect(saved.map((e: { scopes: string[] }) => e.scopes)).toEqual([[B]]);
  });

  test('forgetting one token asks again for it only', async () => {
    await googleAccessToken(auth(), [A]);
    await googleAccessToken(auth(), [B], { persist: true });
    forgetGoogleToken('token-2');
    expect(cachedGoogleToken(auth(), [B])).toBeNull();
    expect(cachedGoogleToken(auth(), [A])).toBe('token-1');
    expect(store.has('hh-google-tokens')).toBe(false);
  });

  test('signed out or refused', async () => {
    await expect(googleAccessToken({ currentUser: null } as never, [A])).rejects.toThrow('Sign in first.');
    grant = false;
    await expect(googleAccessToken(auth(), [A], { deniedMessage: 'No calendar.' })).rejects.toThrow('No calendar.');
  });
});

describe('googleFetch', () => {
  test('a 401 forgets the token; errors carry Google’s message and status', async () => {
    const token = await googleAccessToken(auth(), [A]);
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 })) as unknown as typeof fetch;
    try {
      const e = (await googleFetch(token, 'https://example.com/api', { label: 'Calendar' }).catch((x) => x)) as InstanceType<typeof GoogleApiError>;
      expect(e).toBeInstanceOf(GoogleApiError);
      expect(e.message).toBe('[401] Calendar: Invalid Credentials');
      expect(e.status).toBe(401);
      expect(cachedGoogleToken(auth(), [A])).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('Gmail token and mailbox', () => {
  test('the read-only token is persisted for the hour and found again without a popup', async () => {
    expect(storedGmailToken(auth())).toBeNull();
    const token = await requestGmailToken(auth());
    expect(popups).toEqual([[GMAIL_READONLY_SCOPE]]);
    expect(storedGmailToken(auth())).toBe(token);
  });

  test('search and get through the REST API; a 401 asks again next time', async () => {
    const token = await requestGmailToken(auth());
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      urls.push(String(url));
      if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: 'm1' }, { id: 'm2' }] });
      return new Response('{}', { status: 401 });
    }) as unknown as typeof fetch;
    try {
      const box = gmailMailbox(token);
      expect(await box.search('from:(billing@example.com)', 5)).toEqual(['m1', 'm2']);
      expect(urls[0]).toContain('q=from%3A%28billing%40example.com%29');
      expect(urls[0]).toContain('maxResults=5');
      await expect(box.get('m1')).rejects.toThrow('Gmail access has ended');
      expect(storedGmailToken(auth())).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('calendar search with series starts', () => {
  test('a repeating match carries when its series began, fetched once per series', async () => {
    const { findCalendarEvents } = await import('../src/calendar');
    const original = globalThis.fetch;
    const paths: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      paths.push(url.pathname);
      if (url.pathname.endsWith('/users/me/calendarList')) return Response.json({ items: [{ id: 'family@example.com', summary: 'Family' }] });
      if (url.pathname.endsWith('/events/bday-series')) return Response.json({ id: 'bday-series', htmlLink: 'l', start: { date: '2027-03-14' } });
      return Response.json({
        items: [
          { id: 'bday-series_20320314', recurringEventId: 'bday-series', summary: "Biscuit's birthday", htmlLink: 'l1', start: { date: '2032-03-14' } },
          { id: 'one-off', summary: 'Biscuit birthday party', htmlLink: 'l2', start: { dateTime: '2032-03-16T15:00:00Z' } },
        ],
      });
    }) as unknown as typeof fetch;
    try {
      const matches = await findCalendarEvents(auth(), ["biscuit's birthday", 'biscuit birthday'], { seriesStart: true });
      const series = matches.find((m) => m.id === 'bday-series_20320314')!;
      expect(series).toMatchObject({ calendarId: 'family@example.com', recurringEventId: 'bday-series', seriesStart: new Date(2027, 2, 14).getTime() });
      expect(matches.find((m) => m.id === 'one-off')!.seriesStart).toBeUndefined();
      expect(paths.filter((p) => p.endsWith('/events/bday-series'))).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
