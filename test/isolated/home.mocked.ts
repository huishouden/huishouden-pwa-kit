// Sets the current home, which re-renders every mounted `useHome` (ContactCard): run on its own (package.json "test"), so no other file's leftover React roots are in the process.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  approximateHome,
  clearGeocodeCache,
  distanceFromHome,
  formatFromHome,
  geocodeAddress,
  getHome,
  homeDoc,
  homePoint,
  homeWords,
  householdTimeZone,
  mapTiles,
  onHomeChange,
  osmMapUrl,
  reverseGeocode,
  setHome,
  toHome,
  type HouseholdHome,
} from '../../src/home';
import { resetPlaceSearch, searchPlaces } from '../../src/places';
import { hasSensitiveWords, redact } from '../../src/observability';
import { closesAt, describeDay, isOpenAt, parseOpeningHours } from '../../src/hours';
import { toHousehold } from '../../src/household';
import { coordinates, contactInput, toContact } from '../../src/contact-core';
import { setLangForTests } from '../../src/i18n';

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/nominatim', `${name}.json`), 'utf8'));

const HOME: HouseholdHome = {
  address: '12 Example Lane, Springfield, Illinois 62701',
  lat: 39.7817,
  lng: -89.6501,
  placeId: 'way/424242',
  timeZone: 'America/Chicago',
  setBy: 'alex@example.com',
  updatedAt: 1,
};

function fakeFetch(answer: (url: URL) => unknown) {
  const asked: URL[] = [];
  const at: number[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    asked.push(url);
    at.push(Date.now());
    return new Response(JSON.stringify(answer(url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fn, asked, at };
}

beforeEach(async () => {
  await setLangForTests('en', ['en-US']);
  setHome(undefined);
  clearGeocodeCache();
  resetPlaceSearch();
});

afterEach(() => setHome(undefined));

describe('the stored home', () => {
  test('reads a stored home and refuses a broken one', () => {
    expect(toHome(HOME)).toEqual(HOME);
    expect(toHome({ ...HOME, lat: 91 })).toBeUndefined();
    expect(toHome({ ...HOME, address: ' ' })).toBeUndefined();
    expect(toHome({ ...HOME, timeZone: 'Not a zone; drop' })).toEqual({ ...HOME, timeZone: undefined } as never);
    expect(toHome(null)).toBeUndefined();
  });

  test('a household carries its home', () => {
    expect(toHousehold('h1', { name: 'Ours', members: ['alex@example.com'], home: HOME, createdAt: 1 }).home).toEqual(HOME);
    expect(toHousehold('h1', { name: 'Ours', members: ['alex@example.com'], home: { lat: 1 }, createdAt: 1 }).home).toBeUndefined();
  });

  test('homeDoc writes what the rules accept: trimmed, the zone, who and when', () => {
    const d = homeDoc({ address: ' 12 Example Lane ', lat: 39.78171234567, lng: -89.6501, placeId: 'way/1' }, ' Alex@Example.com ', { timeZone: 'America/Chicago', now: 5 });
    expect(d).toEqual({ address: '12 Example Lane', lat: 39.781712, lng: -89.6501, placeId: 'way/1', timeZone: 'America/Chicago', setBy: 'alex@example.com', updatedAt: 5 });
    expect(homeDoc({ address: 'Riverside', lat: 1, lng: 2, approximate: true }, 'a@b.co', { now: 1, timeZone: 'UTC' }).approximate).toBe(true);
    expect(() => homeDoc({ address: '', lat: 1, lng: 2 }, 'a@b.co')).toThrow();
    expect(() => homeDoc({ address: 'x', lat: Number.NaN, lng: 2 }, 'a@b.co')).toThrow();
  });
});

describe('the current home', () => {
  test('setHome tells listeners once per change', () => {
    let calls = 0;
    const stop = onHomeChange(() => calls++);
    setHome(HOME);
    setHome({ ...HOME });
    expect(calls).toBe(1);
    expect(getHome()).toEqual(HOME);
    expect(homePoint()).toEqual({ lat: HOME.lat, lon: HOME.lng });
    setHome(undefined);
    expect(calls).toBe(2);
    stop();
  });

  test('its address never reaches New Relic', () => {
    expect(homeWords(HOME)).toContain('Example Lane');
    setHome(HOME);
    expect(hasSensitiveWords('Failed near 12 Example Lane')).toBe(true);
    expect(redact('Could not save 12 Example Lane, Springfield')).not.toContain('Example Lane');
    expect(redact('Could not save 12 Example Lane, Springfield')).not.toContain('Springfield');
    setHome(undefined);
    expect(hasSensitiveWords('Example Lane')).toBe(false);
  });

  test("the household's zone is the home's, else the fallback", () => {
    expect(householdTimeZone(HOME, 'Europe/Amsterdam')).toBe('America/Chicago');
    expect(householdTimeZone(undefined, 'Europe/Amsterdam')).toBe('Europe/Amsterdam');
    expect(householdTimeZone({ timeZone: undefined }, 'UTC')).toBe('UTC');
  });

  test('distance from home in the reader\'s units', async () => {
    setHome(HOME);
    // About 2.3 miles east.
    const shop = { lat: 39.7817, lng: -89.6066 };
    expect(distanceFromHome(shop)!).toBeCloseTo(3.72, 1);
    expect(formatFromHome(shop)).toBe('2.3 mi from home');
    await setLangForTests('nl', ['nl-NL']);
    expect(formatFromHome({ lat: shop.lat, lon: shop.lng })).toBe('3,7 km van huis');
    setHome(undefined);
    expect(formatFromHome(shop)).toBeUndefined();
  });
});

describe('finding an address', () => {
  test('a search gives short addresses with their place, in the active language', async () => {
    const net = fakeFetch(() => fixture('search'));
    const found = await geocodeAddress('12 Example Lane Springfield', { fetch: net.fn });
    expect(found[0]).toEqual({ address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.7817, lng: -89.6501, placeId: 'way/424242' });
    expect(found).toHaveLength(2);
    const url = net.asked[0];
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('addressdetails')).toBe('1');
    expect(url.searchParams.get('accept-language')).toBe('en');
  });

  test('the same search twice asks once; requests are a second apart', async () => {
    const net = fakeFetch((u) => (u.pathname === '/search' ? fixture('search') : fixture('reverse')));
    await geocodeAddress('12 Example Lane', { fetch: net.fn });
    await geocodeAddress('12 Example Lane', { fetch: net.fn });
    expect(net.asked).toHaveLength(1);
    await reverseGeocode({ lat: 39.78, lng: -89.65 }, { fetch: net.fn });
    expect(net.asked).toHaveLength(2);
    expect(net.at[1] - net.at[0]).toBeGreaterThanOrEqual(990);
  });

  test('a failed search is not remembered', async () => {
    let fail = true;
    const fn = (async () => (fail ? new Response('busy', { status: 503 }) : new Response(JSON.stringify(fixture('search'))))) as unknown as typeof fetch;
    await expect(geocodeAddress('Example Lane', { fetch: fn })).rejects.toThrow('503');
    fail = false;
    expect(await geocodeAddress('Example Lane', { fetch: fn })).toHaveLength(2);
  });

  test('a position becomes its address, keeping the exact point', async () => {
    const net = fakeFetch(() => fixture('reverse'));
    const found = await reverseGeocode({ lat: 39.781705, lng: -89.650115 }, { fetch: net.fn });
    expect(found).toEqual({ address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.781705, lng: -89.650115, placeId: 'way/424242' });
    const none = await reverseGeocode({ lat: 0, lng: 0 }, { fetch: fakeFetch(() => ({ error: 'Unable to geocode' })).fn });
    expect(none).toBeNull();
  });

  test('approximate: the neighbourhood and its centre, never the house', async () => {
    const net = fakeFetch(() => fixture('area'));
    const near = await approximateHome({ lat: 39.7817, lng: -89.6501 }, { fetch: net.fn });
    expect(near).toEqual({ address: 'Riverside, Springfield, Illinois', lat: 39.7795, lng: -89.644, approximate: true });
    expect(net.asked[0].searchParams.get('zoom')).toBe('14');
    // No area on the map there: the point rounded to about a kilometre.
    const rough = await approximateHome({ lat: 39.781712, lng: -89.650177 }, { fetch: fakeFetch(() => fixture('reverse')).fn });
    expect([rough.lat, rough.lng]).toEqual([39.78, -89.65]);
    expect(rough.address).toBe('Riverside, Springfield, Illinois');
  });
});

describe('places near home', () => {
  test('a name search prefers places around home and says how far', async () => {
    setHome(HOME);
    const net = fakeFetch(() => [{ osm_type: 'node', osm_id: 9, lat: '39.7817', lon: '-89.6066', name: 'Example Pharmacy', display_name: 'Example Pharmacy, 1 Main St' }]);
    const [p] = await searchPlaces('Example Pharmacy', { fetch: net.fn });
    expect(p.distanceKm!).toBeCloseTo(3.72, 1);
    expect(net.asked[0].searchParams.get('viewbox')).toBeTruthy();
    expect(net.asked[0].searchParams.get('bounded')).toBe('0');
  });

  test('without a home, or with from: null, the whole map evenly', async () => {
    const net = fakeFetch(() => []);
    await searchPlaces('Example Pharmacy', { fetch: net.fn });
    expect(net.asked[0].searchParams.get('viewbox')).toBeNull();
    setHome(HOME);
    await searchPlaces('Other Pharmacy', { fetch: net.fn, from: null });
    expect(net.asked[1].searchParams.get('viewbox')).toBeNull();
  });
});

describe('opening hours on home time', () => {
  const shop = parseOpeningHours('Mo-Fr 09:00-17:00')!;
  // Monday 6 January 2031, 15:30 UTC: 09:30 in Chicago, 16:30 in Amsterdam.
  const t = new Date(Date.UTC(2031, 0, 6, 15, 30));

  test('read on the zone given, or the home', () => {
    expect(isOpenAt(shop, t, 'America/Chicago')).toBe(true);
    expect(isOpenAt(shop, new Date(Date.UTC(2031, 0, 6, 23, 30)), 'America/Chicago')).toBe(false);
    expect(isOpenAt(shop, new Date(Date.UTC(2031, 0, 6, 23, 30)), 'Asia/Tokyo')).toBe(false);
    expect(closesAt(shop, t, 'America/Chicago')!.getTime()).toBe(Date.UTC(2031, 0, 6, 23, 0));
    setHome({ ...HOME, timeZone: 'Asia/Tokyo' });
    // 00:30 Tuesday in Tokyo: closed.
    expect(isOpenAt(shop, t)).toBe(false);
    expect(describeDay(shop, new Date(Date.UTC(2031, 0, 4, 20)), 'en-US')).toBe('Closed');
  });
});

describe('contacts on the map', () => {
  test('a contact keeps its position with its address', () => {
    expect(coordinates({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(coordinates({ lat: 1 })).toBeUndefined();
    expect(toContact('c', { name: 'Vet', apps: [], lat: 39.7, lng: -89.6 })).toMatchObject({ lat: 39.7, lng: -89.6 });
    expect(contactInput({ name: 'Vet', address: '1 Main St', lat: 39.7, lng: -89.6 }, [], 'pet')).toMatchObject({ lat: 39.7, lng: -89.6 });
    expect(contactInput({ name: 'Vet', address: ' ', lat: 39.7, lng: -89.6 }, [], 'pet').lat).toBeUndefined();
  });
});

describe('a small map', () => {
  test('tiles cover the map with the point in the middle', () => {
    const tiles = mapTiles({ lat: 39.7817, lng: -89.6501 }, 16, 640, 176);
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    for (const t of tiles) {
      expect(t.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
      expect(t.left).toBeLessThan(640);
      expect(t.left + 256).toBeGreaterThan(0);
    }
    expect(osmMapUrl({ lat: 1, lng: 2 })).toContain('mlat=1.00000');
  });
});
