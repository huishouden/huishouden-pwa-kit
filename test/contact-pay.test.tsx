import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import type { Root } from 'react-dom/client';

// React DOM decides at import whether it runs in a browser, so the DOM comes first.
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://bills.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { ContactCard, ContactDialog } = await import('../src/react/contacts');
const { CONTACT_FIELDS, cleanContact, cleanContactPay, contactInput, contactPayDoc, sampleContacts, tidyContactPay, toContact, withContactPay } = await import('../src/contacts');
type Contact = import('../src/contacts').Contact;

const landlord: Contact = {
  id: 'c1',
  name: 'Example Rentals',
  role: 'Landlord',
  phone: '(555) 010-2231',
  pay: { zelle: 'landlord@example.com', portal: 'https://pay.example.com/rent' },
  apps: ['bills'],
  private: false,
  createdAt: 1,
  by: 'alex@example.com',
};

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
const field = (label: string) => Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))?.querySelector('input') as HTMLInputElement | null;
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    el.value = value;
    (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue('');
    el.focus();
    for (const type of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
const save = () => act(() => (Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save') as HTMLElement).click());

describe('contact pay details: the data', () => {
  test('known ways only, trimmed to their limits, a portal only as an https link; nothing left is none', () => {
    expect(cleanContactPay({ zelle: ' (555) 010-2231 ', venmo: '', paypal: 'x', bank: 'b'.repeat(250), portal: 'javascript:alert(1)' })).toEqual({ zelle: '(555) 010-2231', bank: 'b'.repeat(200) });
    expect(cleanContactPay({ check: '  ' })).toBeUndefined();
    expect(cleanContactPay('zelle')).toBeUndefined();
  });

  test("never on the contact's own document, which helpers and kids read; never read from it", () => {
    expect(cleanContact({ name: 'Example Rentals', apps: ['bills'], pay: { venmo: '@example-rentals' } })).toEqual({ name: 'Example Rentals', apps: ['bills'], private: false });
    expect(toContact('c1', { name: 'Example Rentals', apps: [], pay: { zelle: 'a@example.com' } }).pay).toBeUndefined();
    expect(CONTACT_FIELDS as readonly string[]).not.toContain('pay');
  });

  test('their own document: cleaned, stamped, none left is none (delete it)', () => {
    expect(contactPayDoc({ venmo: '@example-rentals', zelle: '' }, 'alex@example.com', 7)).toEqual({ venmo: '@example-rentals', updatedAt: 7, by: 'alex@example.com' });
    expect(contactPayDoc({ zelle: ' ' }, 'alex@example.com', 7)).toBeNull();
  });

  test('attached to the contacts they belong to; a stale one is dropped', () => {
    const plain = { ...landlord, pay: undefined, id: 'c2' };
    const out = withContactPay<Contact>([{ ...landlord, pay: { bank: 'old' } }, plain], new Map([['c1', { zelle: 'x@example.com' }]]));
    expect(out[0].pay).toEqual({ zelle: 'x@example.com' });
    expect('pay' in out[1]).toBe(false);
    expect(withContactPay([landlord], new Map())[0].pay).toBeUndefined();
  });

  test('tidied on load: pay still on a contact moves (what is already moved wins), old orphans go, recent ones stay for Undo', () => {
    const day = 24 * 3600_000;
    const now = 10 * day;
    const tidy = tidyContactPay(
      [
        { id: 'c1', data: { name: 'Example Rentals', pay: { zelle: 'old@example.com', venmo: '@rentals' } } },
        { id: 'c2', data: { name: 'Example Plumbing' } },
        { id: 'c3', data: { name: 'Empty', pay: {} } },
      ],
      [
        { id: 'c1', data: { zelle: 'new@example.com', updatedAt: now - 1 } },
        { id: 'gone', data: { zelle: 'g@example.com', updatedAt: now - 2 * day } },
        { id: 'just-deleted', data: { zelle: 'j@example.com', updatedAt: now - 60_000 } },
      ],
      now,
    );
    expect(tidy.moves).toEqual([
      { id: 'c1', pay: { zelle: 'new@example.com', venmo: '@rentals' } },
      { id: 'c3', pay: {} },
    ]);
    expect(tidy.orphans).toEqual(['gone']);
  });

  test("a dialog's save carries pay only when it showed it; cleared pay stays as {} so the update removes it", () => {
    expect('pay' in contactInput({ name: 'X' }, [], 'bills')).toBe(false);
    expect(contactInput({ name: 'X', pay: { zelle: ' ' } }, [], 'bills').pay).toEqual({});
  });

  test('the sample keeps pay details a save leaves out', () => {
    let list: Contact[] = [landlord];
    const writes = sampleContacts(() => list, (l) => (list = l), { by: 'alex@example.com', now: () => 5, newId: () => 'n1' });
    writes.save('c1', { name: 'Example Rentals LLC', apps: ['home'] });
    expect(list[0].pay).toEqual(landlord.pay);
    writes.save('c1', { name: 'Example Rentals LLC', apps: ['home'], pay: {} });
    expect(list[0].pay).toBeUndefined();
  });
});

describe('contact pay details: the dialog and card', () => {
  test('Bills shows "How to pay them" open; edits are saved, a portal typed without https gets it', () => {
    const onSave = mock((_: unknown) => {});
    render(<ContactDialog contact={landlord} app="bills" roles={['Landlord']} payDetails onSave={onSave} onClose={() => {}} />);
    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(field('Zelle (phone or email)')!.value).toBe('landlord@example.com');
    typeInto(field('Venmo')!, '@example-rentals');
    typeInto(field('Online portal')!, 'pay.example.com/rent2');
    save();
    expect(onSave.mock.calls[0][0]).toMatchObject({ pay: { zelle: 'landlord@example.com', venmo: '@example-rentals', portal: 'https://pay.example.com/rent2' } });
  });

  test('elsewhere it shows only on a contact that has pay details, and never to those who may not write them', () => {
    const onSave = mock((_: unknown) => {});
    render(<ContactDialog contact={{ ...landlord, pay: undefined }} app="home" roles={['Landlord']} onSave={onSave} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('How to pay them');
    save();
    expect('pay' in (onSave.mock.calls[0][0] as object)).toBe(false);
    act(() => root?.unmount());
    render(<ContactDialog contact={landlord} app="home" roles={['Landlord']} onSave={() => {}} onClose={() => {}} />);
    expect(document.body.textContent).toContain('How to pay them');
    act(() => root?.unmount());
    render(<ContactDialog contact={landlord} app="home" roles={['Landlord']} canMarkPrivate={false} payDetails onSave={onSave} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('How to pay them');
  });

  test('the card lists them, the portal as a link', () => {
    render(<ContactCard contact={landlord} role="Landlord" />);
    expect(document.body.textContent).toContain('Zelle: landlord@example.com');
    const link = Array.from(document.querySelectorAll('a')).find((a) => a.textContent?.includes('Pay online at pay.example.com/rent'));
    expect(link?.getAttribute('href')).toBe('https://pay.example.com/rent');
  });
});
