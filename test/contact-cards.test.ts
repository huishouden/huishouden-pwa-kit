import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import searchContacts from './fixtures/google-contacts/search-contacts.json';
import otherContacts from './fixtures/google-contacts/other-contacts.json';
import { contactFromCard, contactSummary, fromPickerContact, isVCard, parseVCard, readSharedContact, resetSharedContactForTests, type ParsedContact } from '../src/vcard';
import { GOOGLE_CONTACTS_SCOPES, fromGooglePerson, resetGoogleContactsForTests, searchGoogleContacts } from '../src/google-contacts';
import { SHARE_SW_CONFIG, SHARE_SW_FILE, installShareHandlers, shareServiceWorkerSource } from '../src/share-sw';
import { SHARE_TARGET, SHARE_TARGET_FILES, pwaApp, pwaWorkbox, webManifest } from '../src/vite';

const dir = join(import.meta.dir, 'fixtures', 'vcards');

describe('parseVCard: invented cards as phones and Google export them', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.vcf'))) {
    test(file.replace('.vcf', ''), () => {
      const expected = JSON.parse(readFileSync(join(dir, file.replace('.vcf', '.expected.json')), 'utf8'));
      const cards = parseVCard(readFileSync(join(dir, file), 'utf8'));
      expect(cards.map((card) => ({ card, fill: contactFromCard(card) }))).toEqual(expected);
    });
  }
});

describe('parseVCard', () => {
  test('text that is not a card gives no contacts', () => {
    expect(parseVCard('')).toEqual([]);
    expect(parseVCard('Example Vet\n(555) 010-0100')).toEqual([]);
    expect(isVCard('Example Vet')).toBe(false);
    expect(isVCard('begin:vcard\nend:vcard')).toBe(true);
  });

  test('a byte-order mark, lower-case names and a card without FN', () => {
    const [card] = parseVCard('﻿begin:vcard\nversion:3.0\nn:Example;Casey;;;\ntel:555-010-0110\nend:vcard\n');
    expect(card).toEqual({ name: 'Casey Example', phones: [{ value: '555-010-0110' }], emails: [] });
  });

  test('a card with only an email is named for it', () => {
    expect(parseVCard('BEGIN:VCARD\nVERSION:3.0\nEMAIL:office@example.com\nEND:VCARD')[0].name).toBe('office@example.com');
  });

  test('a quoted parameter value may hold a colon', () => {
    const [card] = parseVCard('BEGIN:VCARD\nVERSION:4.0\nFN:Casey Example\nADR;LABEL="Unit 4: rear entrance":;;9 Example Road;Springfield;;;\nEND:VCARD');
    expect(card.address).toBe('9 Example Road, Springfield');
  });
});

describe('contactFromCard', () => {
  const card: ParsedContact = {
    name: 'Jordan Example',
    phones: [{ value: '(555) 010-0142', label: 'Mobile' }, { value: '(555) 010-0143', label: 'iPhone' }],
    emails: [],
    organization: 'Example Property Management',
    title: 'Landlord',
  };

  test('with a role already chosen, the title and organization go to notes', () => {
    expect(contactFromCard(card, { role: false })).toEqual({
      name: 'Jordan Example',
      phone: '(555) 010-0142',
      notes: 'Landlord, Example Property Management\nOther phones: (555) 010-0143 (iPhone)',
    });
  });

  test('a role longer than the field goes to notes; notes are cut to the limit', () => {
    const long = contactFromCard({ ...card, organization: 'An Example Property Management Company Serving Springfield', note: 'x'.repeat(2000) });
    expect(long.role).toBeUndefined();
    expect(long.notes?.startsWith('Landlord, An Example Property Management Company Serving Springfield\n')).toBe(true);
    expect(long.notes).toHaveLength(1000);
  });

  test('a business card keeps its organization as the name, not the role', () => {
    expect(contactFromCard({ name: 'Example Plumbing Co.', organization: 'Example Plumbing Co.', phones: [], emails: [] })).toEqual({ name: 'Example Plumbing Co.' });
  });

  test('summary line for a "choose one" list', () => {
    expect(contactSummary({ ...card, emails: [{ value: 'jordan@example.com' }] })).toBe('Example Property Management · (555) 010-0142 · jordan@example.com');
  });
});

describe('fromPickerContact', () => {
  test('the picker’s lists become a contact', () => {
    expect(
      fromPickerContact({
        name: ['Jordan Example'],
        tel: ['(555) 010-0142', '(555) 010-0142 ', '(555) 010-0143'],
        email: ['jordan@example.com'],
        address: [{ addressLine: ['12 Example Street', 'Apt 3'], city: 'Springfield', region: 'IL', postalCode: '62704', country: 'US' }],
      }),
    ).toEqual({
      name: 'Jordan Example',
      phones: [{ value: '(555) 010-0142' }, { value: '(555) 010-0143' }],
      emails: [{ value: 'jordan@example.com' }],
      address: '12 Example Street, Apt 3, Springfield, IL 62704, US',
    });
  });

  test('nothing chosen or nothing in it', () => {
    expect(fromPickerContact({})).toBeNull();
    expect(fromPickerContact({ name: [], tel: ['555-010-0110'] })?.name).toBe('555-010-0110');
  });
});

describe('Google Contacts', () => {
  const calls: { path: string; query: string | null; readMask: string | null; auth: string | null }[] = [];
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    calls.length = 0;
    resetGoogleContactsForTests();
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push({ path: u.pathname, query: u.searchParams.get('query'), readMask: u.searchParams.get('readMask'), auth: new Headers(init?.headers).get('Authorization') });
      const empty = !u.searchParams.get('query');
      const body = empty ? {} : u.pathname.endsWith('people:searchContacts') ? searchContacts : otherContacts;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('read-only scopes for saved and other contacts', () => {
    expect(GOOGLE_CONTACTS_SCOPES).toEqual(['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/contacts.other.readonly']);
  });

  test('warms each search up once, then merges saved and other contacts without repeats', async () => {
    const found = await searchGoogleContacts('t1', 'jordan');
    expect(found.map((c) => c.name)).toEqual(['Jordan Example', 'Jordan Sample', 'jordan.repairs@example.com']);
    expect(found[0]).toEqual({
      name: 'Jordan Example',
      phones: [{ value: '(555) 010-0142', label: 'Mobile' }, { value: '(555) 010-0143', label: 'Work' }],
      emails: [{ value: 'jordan@example.com', label: 'Home' }],
      address: '12 Example Street, Apt 3, Springfield, IL 62704, US',
      organization: 'Example Property Management',
      title: 'Landlord',
      website: 'https://rentals.example.com',
      note: 'Call before 8 pm.',
    });
    expect(calls.map((c) => [c.path, c.query])).toEqual([
      ['/v1/people:searchContacts', ''],
      ['/v1/otherContacts:search', ''],
      ['/v1/people:searchContacts', 'jordan'],
      ['/v1/otherContacts:search', 'jordan'],
    ]);
    expect(calls.every((c) => c.auth === 'Bearer t1')).toBe(true);
    expect(calls.find((c) => c.path.startsWith('/v1/otherContacts'))?.readMask).toBe('names,phoneNumbers,emailAddresses');

    calls.length = 0;
    await searchGoogleContacts('t1', 'sam');
    expect(calls.map((c) => c.query)).toEqual(['sam', 'sam']);
  });

  test('an empty search asks nothing', async () => {
    expect(await searchGoogleContacts('t1', '  ')).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('a person with nothing usable is skipped', () => {
    expect(fromGooglePerson({ resourceName: 'people/c1' })).toBeNull();
  });
});

describe('share target for contact cards', () => {
  test('manifest: shareTarget: true stays the GET place target; { contacts: true } takes files by POST', () => {
    const base = { name: 'Demo', description: 'Demo app.', themeColor: '#000000', backgroundColor: '#ffffff' };
    expect(webManifest({ ...base, shareTarget: true }).share_target).toEqual(SHARE_TARGET);
    expect(webManifest({ ...base, shareTarget: { contacts: true } }).share_target).toEqual({
      action: 'share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'share_title',
        text: 'share_text',
        url: 'share_url',
        files: [{ name: 'contact', accept: ['text/vcard', 'text/x-vcard', 'text/directory', '.vcf', '.vcard'] }],
      },
    });
    expect(SHARE_TARGET_FILES.params.files[0].name).toBe(SHARE_SW_CONFIG.fileField);
    expect(pwaWorkbox({ ...base, push: true, shareTarget: { contacts: true } }).importScripts).toEqual(['hh-push-sw.js', SHARE_SW_FILE]);
    expect(pwaWorkbox({ ...base, shareTarget: true }).importScripts).toEqual([]);
  });

  /** A service worker stand-in at `scope`, with Cache Storage in a Map. */
  function fakeWorker(scope: string) {
    const listeners: Record<string, (event: unknown) => void> = {};
    const stored = new Map<string, string>();
    const sw = {
      registration: { scope },
      addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
      caches: {
        open: async (name: string) => ({
          put: async (key: string, res: Response) => stored.set(`${name} ${key}`, await res.text()),
        }),
      },
    };
    const post = async (url: string, form: FormData) => {
      let answer: Promise<Response> | undefined;
      listeners.fetch({ request: new Request(url, { method: 'POST', body: form }), respondWith: (r: Promise<Response>) => (answer = r) });
      return answer ? await answer : undefined;
    };
    return { sw, stored, post };
  }

  const card = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jordan Example\r\nTEL:(555) 010-0142\r\nEND:VCARD';

  test('a shared card is kept for the app, which opens at ?share=contact', async () => {
    const { sw, stored, post } = fakeWorker('https://apps.example.com/pet/');
    installShareHandlers(sw, SHARE_SW_CONFIG);
    const form = new FormData();
    form.append('contact', new File([card], 'Jordan Example.vcf', { type: 'text/x-vcard' }));
    const res = await post('https://apps.example.com/pet/share-target', form);
    expect(res?.status).toBe(303);
    expect(res?.headers.get('Location')).toBe('https://apps.example.com/pet/?share=contact');
    expect([...stored.keys()]).toEqual(['hh-share https://apps.example.com/pet/hh-shared-contact']);
    expect(parseVCard([...stored.values()][0])[0].name).toBe('Jordan Example');
  });

  test('a card shared as text is kept too', async () => {
    const { sw, stored, post } = fakeWorker('https://home.example.com/');
    installShareHandlers(sw, SHARE_SW_CONFIG);
    const form = new FormData();
    form.append('share_text', card);
    const res = await post('https://home.example.com/share-target', form);
    expect(res?.headers.get('Location')).toBe('https://home.example.com/?share=contact');
    expect(stored.size).toBe(1);
  });

  test('a shared place goes on as the GET share target’s address', async () => {
    const { sw, stored, post } = fakeWorker('https://home.example.com/');
    installShareHandlers(sw, SHARE_SW_CONFIG);
    const form = new FormData();
    form.append('share_title', 'Example Vet');
    form.append('share_url', 'https://maps.app.goo.gl/abc');
    const res = await post('https://home.example.com/share-target', form);
    expect(res?.headers.get('Location')).toBe('https://home.example.com/?share_title=Example+Vet&share_url=https%3A%2F%2Fmaps.app.goo.gl%2Fabc');
    expect(stored.size).toBe(0);
  });

  test('other POSTs are left to the network', async () => {
    const { sw, post } = fakeWorker('https://home.example.com/');
    installShareHandlers(sw, SHARE_SW_CONFIG);
    expect(await post('https://home.example.com/api', new FormData())).toBeUndefined();
    expect(await post('https://other.example.com/share-target', new FormData())).toBeUndefined();
  });

  test('the generated file runs on its own', () => {
    const { sw } = fakeWorker('https://home.example.com/');
    const added: string[] = [];
    const recording = { ...sw, addEventListener: (type: string) => added.push(type) };
    new Function('self', shareServiceWorkerSource())(recording);
    expect(added).toEqual(['fetch']);
  });

  test('readSharedContact reads the kept card once and leaves an ordinary launch alone', async () => {
    const stored = new Map<string, string>([['https://home.example.com/hh-shared-contact', card]]);
    const deleted: string[] = [];
    const g = globalThis as unknown as { caches?: unknown };
    const before = g.caches;
    g.caches = {
      open: async () => ({
        match: async (key: string) => (stored.has(key) ? new Response(stored.get(key)) : undefined),
        keys: async () => [...stored.keys()].map((k) => new Request(k)),
        delete: async (key: string) => (deleted.push(key), stored.delete(key)),
      }),
    };
    try {
      resetSharedContactForTests();
      const plain = { search: '', pathname: '/', origin: 'https://home.example.com' };
      expect(await readSharedContact(plain)).toBeNull();
      const shared = { search: '?share=contact', pathname: '/', origin: 'https://home.example.com' };
      const first = await readSharedContact(shared);
      expect(first?.map((c) => c.name)).toEqual(['Jordan Example']);
      expect(deleted).toEqual(['https://home.example.com/hh-shared-contact']);
      expect(await readSharedContact(shared)).toBe(first);
      resetSharedContactForTests();
      expect(await readSharedContact(shared)).toEqual([]);
    } finally {
      g.caches = before;
      resetSharedContactForTests();
    }
  });

  test('a build with shareTarget: { contacts: true } ships hh-share-sw.js and the service worker loads it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hh-share-'));
    try {
      writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><script type="module" src="/main.ts"></script></body></html>');
      writeFileSync(join(root, 'main.ts'), 'console.log(1);');
      mkdirSync(join(root, 'public'));
      const { build } = await import('vite');
      await build({
        root,
        logLevel: 'silent',
        configFile: false,
        build: { outDir: join(root, 'dist') },
        plugins: [pwaApp({ name: 'Demo', description: 'Demo app.', themeColor: '#000000', backgroundColor: '#ffffff', shareTarget: { contacts: true } })],
      });
      expect(existsSync(join(root, 'dist', SHARE_SW_FILE))).toBe(true);
      expect(readFileSync(join(root, 'dist', 'sw.js'), 'utf8')).toContain(`importScripts("${SHARE_SW_FILE}")`);
      const manifest = JSON.parse(readFileSync(join(root, 'dist', 'manifest.webmanifest'), 'utf8'));
      expect(manifest.share_target.method).toBe('POST');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
