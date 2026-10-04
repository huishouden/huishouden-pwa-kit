import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import searchContacts from './fixtures/google-contacts/search-contacts.json';
import otherContacts from './fixtures/google-contacts/other-contacts.json';

// React DOM decides at import whether it runs in a browser, so the DOM comes first.
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://home.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { ContactDialog } = await import('../src/react/contacts');
const { parseVCard } = await import('../src/vcard');
const { resetGoogleContactsForTests } = await import('../src/google-contacts');

const vcf = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', 'vcards', name), 'utf8');

let root: Root | null = null;
function render(node: React.ReactNode) {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app')!);
  act(() => root!.render(node));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});
const click = (el: Element | null) => act(() => (el as HTMLElement).click());
const byText = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null;
const field = (label: string) => Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))?.querySelector('input, textarea') as HTMLInputElement | null;
const notes = () => field('Notes')!.value;
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    el.value = value;
    (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue('');
    el.focus();
    for (const type of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(type, { bubbles: true }));
  });

async function chooseFile(text: string, name = 'contact.vcf') {
  const input = document.querySelector('input[type=file][accept*=vcf]') as HTMLInputElement;
  expect(input.getAttribute('accept')).toBe('.vcf,.vcard,text/vcard,text/x-vcard');
  Object.defineProperty(input, 'files', { value: [new File([text], name, { type: 'text/vcard' })], configurable: true });
  await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
  // File.text() resolves after the change handler's first await.
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

describe('ContactDialog: from the person’s own contacts', () => {
  test('a contact card fills the new contact; its organization and title make the role', async () => {
    const onSave = mock((_: unknown) => {});
    render(<ContactDialog contact={null} app="home" roles={['Landlord', 'Plumber']} onSave={onSave} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Already in your contacts?');
    await chooseFile(vcf('iphone-landlord.vcf'));
    expect(field('Name')!.value).toBe('Jordan Example');
    expect(field('Phone')!.value).toBe('(555) 010-0142');
    expect(field('Email')!.value).toBe('jordan@example.com');
    expect(field('Address')!.value).toBe('12 Example Street, Apt 3, Springfield, IL 62704, United States');
    expect(notes()).toContain('Other phones: (555) 010-0143 (work)');
    expect(document.body.textContent).toContain('Filled in the name, role, phone, email, website, address, and notes from the contact card. Check them before saving.');
    click(byText('Save'));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Jordan Example', role: 'Landlord, Example Property Management', website: 'https://rentals.example.com', apps: ['home'] });
  });

  test('with a role already chosen, the card keeps it and puts its own in notes', async () => {
    render(<ContactDialog contact={null} app="home" roles={['Landlord']} role="Landlord" onSave={() => {}} onClose={() => {}} />);
    await chooseFile(vcf('iphone-landlord.vcf'));
    expect(byText('Landlord')!.getAttribute('aria-pressed')).toBe('true');
    expect(notes().split('\n')[0]).toBe('Landlord, Example Property Management');
  });

  test('a file with several people asks which; one without any says so', async () => {
    render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
    await chooseFile(vcf('google-export.vcf'));
    expect(document.body.textContent).toContain('The contact card has 2 people. Choose one.');
    const list = document.querySelector('ul[aria-label="Contacts to choose from"]')!;
    expect(Array.from(list.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Riley SampleExample Realty · 555-010-0161 · riley.sample@example.com', 'Avery Placeholder555-010-0162 · avery@example.com']);
    click(list.querySelectorAll('button')[1]);
    expect(field('Name')!.value).toBe('Avery Placeholder');
    expect(document.querySelector('ul[aria-label="Contacts to choose from"]')).toBeNull();

    await chooseFile('Just some notes', 'notes.txt');
    expect(document.body.textContent).toContain('Couldn’t find a contact in that file. Choose a contact card (.vcf).');
    expect(field('Name')!.value).toBe('Avery Placeholder');
  });

  test('choosing a second person replaces the notes the first filled, not what was typed', async () => {
    render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
    await chooseFile(vcf('android-21.vcf'));
    expect(notes()).toBe('Other phones: 555-010-0172 (home)\nJardinero. Viene los martes — llamar antes.');
    await chooseFile(vcf('v4.vcf'));
    click(document.querySelectorAll('ul[aria-label="Contacts to choose from"] button')[0]);
    expect(notes()).toBe('Other phones: +1-555-010-0191 (home)');
  });

  test('"Pick from my contacts" only where the phone has a contact picker', async () => {
    render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
    expect(byText('Pick from my contacts')).toBeNull();

    const select = mock(async (props: string[]) => {
      expect(props).toEqual(['name', 'tel', 'email']);
      return [{ name: ['Jordan Example'], tel: ['(555) 010-0142'], email: ['jordan@example.com'] }];
    });
    const nav = navigator as unknown as { contacts?: unknown };
    const win = window as unknown as { ContactsManager?: unknown };
    nav.contacts = { select, getProperties: async () => ['name', 'tel', 'email'] };
    win.ContactsManager = function ContactsManager() {};
    try {
      render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
      await act(async () => click(byText('Pick from my contacts')));
      await act(async () => await new Promise((r) => setTimeout(r, 0)));
      expect(select).toHaveBeenCalledTimes(1);
      expect(field('Name')!.value).toBe('Jordan Example');
      expect(document.body.textContent).toContain('from your contacts');
    } finally {
      delete nav.contacts;
      delete win.ContactsManager;
    }
  });

  test('cards shared into the app: one fills the dialog, several are listed', () => {
    const one = parseVCard(vcf('iphone-company.vcf'));
    render(<ContactDialog contact={null} app="home" roles={[]} sharedContacts={one} onSave={() => {}} onClose={() => {}} />);
    expect(field('Name')!.value).toBe('Example Plumbing Co.');
    expect(document.body.textContent).toContain('from the shared contact');

    render(<ContactDialog contact={null} app="home" roles={[]} sharedContacts={parseVCard(vcf('v4.vcf'))} onSave={() => {}} onClose={() => {}} />);
    expect(field('Name')!.value).toBe('');
    expect(document.body.textContent).toContain('The shared contact has 2 people. Choose one.');

    render(<ContactDialog contact={null} app="home" roles={[]} sharedContacts={[]} onSave={() => {}} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Couldn’t find a contact in what was shared.');
  });
});

describe('ContactDialog: Google Contacts', () => {
  const realFetch = globalThis.fetch;
  const queries: string[] = [];
  let status = 200;
  beforeEach(() => {
    queries.length = 0;
    status = 200;
    resetGoogleContactsForTests();
    globalThis.fetch = (async (url: string | URL) => {
      const u = new URL(String(url));
      const q = u.searchParams.get('query') ?? '';
      queries.push(`${u.pathname.split('/').pop()} ${q}`);
      if (status !== 200) return new Response(JSON.stringify({ error: { message: 'People API has not been used in project 0 before or it is disabled.' } }), { status });
      const body = !q ? {} : u.pathname.endsWith('people:searchContacts') ? searchContacts : otherContacts;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete window.__mockGoogleContactsToken;
  });

  test('offered only to a signed-in member', () => {
    render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
    expect(byText('Find in my Google Contacts')).toBeNull();
    render(<ContactDialog contact={null} app="home" roles={[]} auth={{ currentUser: null } as never} onSave={() => {}} onClose={() => {}} />);
    expect(byText('Find in my Google Contacts')).toBeNull();
    render(<ContactDialog contact={null} app="home" roles={[]} auth={{ currentUser: { uid: 'u1' } } as never} onSave={() => {}} onClose={() => {}} />);
    expect(byText('Find in my Google Contacts')).not.toBeNull();
  });

  test('searches saved and other contacts, lists them, and fills the chosen one', async () => {
    window.__mockGoogleContactsToken = 'contacts-token';
    render(<ContactDialog contact={null} app="home" roles={['Landlord']} auth={{ currentUser: null } as never} onSave={() => {}} onClose={() => {}} />);
    click(byText('Find in my Google Contacts'));
    expect(document.body.textContent).toContain('If Google says it hasn’t verified this app, choose Advanced, then continue');
    typeInto(document.getElementById('google-contacts-query') as HTMLInputElement, 'jordan');
    await act(async () => void document.getElementById('google-contacts-query')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => await new Promise((r) => setTimeout(r, 0)));
    expect(queries).toEqual(['people:searchContacts ', 'otherContacts:search ', 'people:searchContacts jordan', 'otherContacts:search jordan']);
    const buttons = document.querySelectorAll('ul[aria-label="Contacts to choose from"] button');
    expect(Array.from(buttons).map((b) => b.querySelector('span')!.textContent)).toEqual(['Jordan Example', 'Jordan Sample', 'jordan.repairs@example.com']);
    click(buttons[0]);
    expect(field('Phone')!.value).toBe('(555) 010-0142');
    expect(field('Address')!.value).toBe('12 Example Street, Apt 3, Springfield, IL 62704, US');
    expect(document.body.textContent).toContain('from Google Contacts');
  });

  test('a refused search says so and can be tried again', async () => {
    window.__mockGoogleContactsToken = 'contacts-token';
    status = 403;
    render(<ContactDialog contact={null} app="home" roles={[]} auth={{ currentUser: null } as never} onSave={() => {}} onClose={() => {}} />);
    click(byText('Find in my Google Contacts'));
    typeInto(document.getElementById('google-contacts-query') as HTMLInputElement, 'jordan');
    await act(async () => void document.getElementById('google-contacts-query')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => await new Promise((r) => setTimeout(r, 0)));
    expect(document.querySelector('[role=alert]')!.textContent).toContain('Couldn’t search Google Contacts. Try again.');
    status = 200;
    await act(async () => click(byText('Try again')));
    await act(async () => await new Promise((r) => setTimeout(r, 0)));
    expect(document.querySelectorAll('ul[aria-label="Contacts to choose from"] button')).toHaveLength(3);
  });
});

const { setLangForTests } = await import('../src/i18n');
const { groupContacts } = await import('../src/contacts');
const { contactFromCard } = await import('../src/vcard');

describe('ContactDialog and contact text in Spanish and Dutch', () => {
  afterEach(async () => {
    await act(async () => setLangForTests('en'));
  });

  test('the dialog, its fill note and the card labels follow the language', async () => {
    await act(async () => setLangForTests('es', ['es-MX']));
    render(<ContactDialog contact={null} app="home" roles={['Landlord']} onSave={() => {}} onClose={() => {}} />);
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('Nuevo contacto');
    expect(document.body.textContent).toContain('¿Ya está en tus contactos?');
    expect(byText('Guardar')).not.toBeNull();
    await chooseFile(vcf('iphone-landlord.vcf'));
    expect(document.body.textContent).toContain(
      'Datos completados con la tarjeta de contacto: nombre, función, teléfono, correo, sitio web, dirección y notas. Revísalos antes de guardar.',
    );
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain('Otros teléfonos: (555) 010-0143 (trabajo)');
  });

  test('Dutch: several people to choose from, and contacts without a role under Overig', async () => {
    await act(async () => setLangForTests('nl', ['nl-NL']));
    render(<ContactDialog contact={null} app="home" roles={[]} onSave={() => {}} onClose={() => {}} />);
    await chooseFile(vcf('google-export.vcf'));
    expect(document.body.textContent).toContain('De contactkaart bevat 2 personen. Kies er een.');
    const contacts = [{ id: 'a', name: 'Ada', apps: [], createdAt: 0, by: '' }];
    expect(groupContacts(contacts, []).map((g) => g.role)).toEqual(['Overig']);
    const card = { name: 'Sam', phones: [{ value: '1' }, { value: '2', label: 'Mobile' }], emails: [] };
    expect(contactFromCard(card).notes).toBe('Andere telefoonnummers: 2 (mobile)');
  });
});
