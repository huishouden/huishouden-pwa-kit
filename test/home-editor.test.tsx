import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import type { Root } from 'react-dom/client';

// React DOM decides at import whether it runs in a browser, so the DOM comes first.
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://portal.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { HomeEditor } = await import('../src/react/home');
const { clearGeocodeCache } = await import('../src/home');
type HouseholdHome = import('../src/home').HouseholdHome;

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/nominatim', `${name}.json`), 'utf8'));

// Nominatim stands still: searches, reverse lookups, and a neighbourhood at zoom 14.
const asked: URL[] = [];
const fakeFetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  asked.push(url);
  const body = url.pathname === '/search' ? fixture('search') : url.searchParams.get('zoom') === '14' ? fixture('area') : fixture('reverse');
  return new Response(JSON.stringify(body));
}) as typeof fetch;

const HOME: HouseholdHome = { address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.7817, lng: -89.6501, timeZone: 'America/Chicago', setBy: 'alex@example.com', updatedAt: 1 };

let root: Root | null = null;
function render(node: React.ReactNode) {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app')!);
  act(() => root!.render(node));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  asked.length = 0;
  clearGeocodeCache();
});

const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const click = (el: HTMLElement | undefined) => act(() => el!.click());
// Nominatim calls wait their turn (one a second, shared with every other test in the process).
async function until(ready: () => unknown, ms = 4000) {
  for (const end = Date.now() + ms; !ready() && Date.now() < end; ) await act(async () => await new Promise((r) => setTimeout(r, 50)));
}
function typeInto(el: HTMLInputElement, value: string) {
  act(() => {
    el.value = value;
    (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue('');
    el.focus();
    for (const type of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}
const search = async (text: string) => {
  typeInto(document.querySelector('input[autocomplete="street-address"]') as HTMLInputElement, text);
  act(() => void document.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await until(() => document.querySelector('[aria-label="Addresses found"]'));
};

describe('HomeEditor', () => {
  test('search, pick one of several, see it on the map, save', async () => {
    const onSave = mock(async () => {});
    render(<HomeEditor canChange onSave={onSave} onRemove={async () => {}} geocode={{ fetch: fakeFetch, lang: 'en' }} />);
    expect(button('Save as home')!.disabled).toBe(true);
    await search('12 Example Lane');
    expect(asked[0].pathname).toBe('/search');
    const choices = document.querySelectorAll('[aria-label="Addresses found"] button');
    expect(choices).toHaveLength(2);
    click(choices[0] as HTMLElement);
    expect(document.querySelector('[data-testid="home-picked"]')!.textContent).toContain('12 Example Lane, Springfield, Illinois 62701');
    expect(document.querySelector('figure[role="img"]')!.getAttribute('aria-label')).toBe('Map of 12 Example Lane, Springfield, Illinois 62701');
    expect(document.querySelector('figure img')!.getAttribute('src')).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\//);
    expect(document.querySelector('figcaption a')!.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    await act(async () => button('Save as home')!.click());
    expect(onSave).toHaveBeenCalledWith({ address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.7817, lng: -89.6501, placeId: 'way/424242' });
  });

  test('Approximate only saves the neighbourhood and its centre', async () => {
    const onSave = mock(async () => {});
    render(<HomeEditor canChange onSave={onSave} onRemove={async () => {}} geocode={{ fetch: fakeFetch, lang: 'en' }} />);
    await search('12 Example Lane');
    click(document.querySelectorAll('[aria-label="Addresses found"] button')[0] as HTMLElement);
    click(document.querySelector('input[type="checkbox"]')!.closest('label') as HTMLElement);
    act(() => button('Save as home')!.click());
    await until(() => onSave.mock.calls.length);
    expect(onSave).toHaveBeenCalledWith({ address: 'Riverside, Springfield, Illinois', lat: 39.7795, lng: -89.644, approximate: true });
  });

  test("this device's location becomes the address there", async () => {
    const onSave = mock(async () => {});
    const geo = { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 39.781705, longitude: -89.650115, accuracy: 15 } } as GeolocationPosition) };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    render(<HomeEditor canChange onSave={onSave} onRemove={async () => {}} geocode={{ fetch: fakeFetch, lang: 'en' }} />);
    click(button('Use my current location'));
    await until(() => document.querySelector('[data-testid="home-picked"]'));
    expect(document.querySelector('[data-testid="home-picked"]')!.textContent).toContain('12 Example Lane');
    await act(async () => button('Save as home')!.click());
    expect(onSave).toHaveBeenCalledWith({ address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.781705, lng: -89.650115, placeId: 'way/424242' });
  });

  test('location turned off says so and offers the search', async () => {
    const geo = { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    render(<HomeEditor canChange onSave={async () => {}} onRemove={async () => {}} geocode={{ fetch: fakeFetch, lang: 'en' }} />);
    click(button('Use my current location'));
    await act(async () => await new Promise((r) => setTimeout(r, 10)));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Location is off for this site');
  });

  test('a helper sees the address and map, and cannot change it', () => {
    render(<HomeEditor home={HOME} canChange={false} onSave={async () => {}} onRemove={async () => {}} nameOf={() => 'Alex'} />);
    expect(document.querySelector('[data-testid="home-address"]')!.textContent).toBe(HOME.address);
    expect(document.body.textContent).toContain('Time zone: America/Chicago · Set by Alex');
    expect(document.body.textContent).toContain('Admins and members can change it.');
    expect(button('Change')).toBeUndefined();
    expect(button('Remove')).toBeUndefined();
  });

  test('a member changes it; Cancel keeps the saved one', () => {
    render(<HomeEditor home={HOME} canChange onSave={async () => {}} onRemove={async () => {}} />);
    click(button('Change'));
    expect(document.querySelector('form[role="search"]')).not.toBeNull();
    click(button('Cancel'));
    expect(document.querySelector('[data-testid="home-address"]')!.textContent).toBe(HOME.address);
  });
});
