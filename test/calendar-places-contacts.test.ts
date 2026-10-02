import { describe, expect, test } from 'bun:test';
import { searchPhrases, toMatch } from '../src/calendar';
import { cleanContact, toContact } from '../src/contacts';
import { PLACE_KINDS, PlaceSearchUnavailable, distanceKm, formatDistance, usesMiles, mapsSearchUrl, placeKinds, searchPlaces, telHref, toPlace } from '../src/places';

describe('calendar', () => {
  test('search phrases drop chore words, most specific first', () => {
    expect(searchPhrases('Get car seat checked at fire station')).toEqual(['car seat fire station', 'car seat', 'seat fire', 'fire station']);
    expect(searchPhrases('Book the appointment')).toEqual([]);
  });
  test('all-day events start at local midnight; cancelled ones are dropped', () => {
    const m = toMatch({ id: 'e', summary: 'Checkup', htmlLink: 'l', start: { date: '2031-03-04' }, end: { date: '2031-03-05' } }, 'Family')!;
    expect(m.allDay).toBe(true);
    expect(m.start).toBe(new Date(2031, 2, 4).getTime());
    expect(m.end).toBe(new Date(2031, 2, 5).getTime());
    expect(toMatch({ id: 'x', htmlLink: 'l', status: 'cancelled', start: { date: '2031-03-04' } }, 'F')).toBeNull();
  });
  test('timed events keep their location and description', () => {
    const m = toMatch({ id: 'e', summary: 'Visit', location: '1 Example Way', description: 'Bring the card', htmlLink: 'l', start: { dateTime: '2031-03-04T09:30:00Z' } }, 'F')!;
    expect(m).toMatchObject({ allDay: false, start: Date.parse('2031-03-04T09:30:00Z'), location: '1 Example Way', description: 'Bring the card' });
  });
});

describe('places', () => {
  test('splits the name from the address and fills in phone and website', () => {
    const p = toPlace({
      osm_type: 'node', osm_id: 42, lat: '1.5', lon: '2.5', name: 'Example Pediatrics',
      display_name: 'Example Pediatrics, 1 Example Way, Springfield',
      extratags: { 'contact:phone': '+1 555 0100', website: 'example.com' },
    });
    expect(p).toMatchObject({ name: 'Example Pediatrics', address: '1 Example Way, Springfield', phone: '+1 555 0100', website: 'https://example.com', lat: 1.5 });
    expect(p.osmUrl).toBe('https://www.openstreetmap.org/node/42');
    expect(p.mapsUrl).toBe(mapsSearchUrl('Example Pediatrics 1 Example Way, Springfield'));
  });
  const home = { lat: 40, lon: -75 };
  const element = (id: number, lat: number, tags: Record<string, string> = { 'addr:street': 'Main St' }) => ({ type: 'node', id, lat, lon: -75, tags: { name: `Cleaner ${id}`, ...tags } });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  test('near searches ask Overpass for the kind of place and come back nearest first', async () => {
    const bodies: string[] = [];
    const fake = (async (_u: string | URL, init?: RequestInit) => {
      bodies.push(decodeURIComponent(String(init?.body)));
      return json({ elements: [element(1, 40.05), element(2, 40.01), element(3, 40.1), element(2, 40.01)] });
    }) as typeof fetch;
    const found = await searchPlaces('Drycleaners dropoff', { near: home, limit: 2, fetch: fake });
    expect(found.map((p) => p.name)).toEqual(['Cleaner 2', 'Cleaner 1']);
    expect(found[0].distanceKm).toBeCloseTo(1.11, 1);
    expect(bodies[0]).toContain('"shop"="dry_cleaning"');
    expect(bodies[0]).toContain('around:10000,40,-75');
  });

  test('a refusing Overpass server is skipped for the next one', async () => {
    const asked: string[] = [];
    const fake = (async (u: string | URL) => {
      asked.push(String(u));
      return asked.length === 1 ? new Response('<html>rate limited</html>', { status: 429 }) : json({ elements: [element(7, 40.02)] });
    }) as typeof fetch;
    const found = await searchPlaces('pharmacy', { near: home, fetch: fake });
    expect(found.map((p) => p.name)).toEqual(['Cleaner 7']);
    expect(asked).toHaveLength(2);
    expect(asked[1]).not.toBe(asked[0]);
  });

  test('with Overpass down, a bounded Nominatim search answers', async () => {
    const asked: string[] = [];
    const fake = (async (u: string | URL) => {
      asked.push(String(u));
      if (String(u).includes('nominatim')) return json([{ osm_type: 'node', osm_id: 9, lat: '40.01', lon: '-75', name: 'Example Cleaners', display_name: 'Example Cleaners, 1 Main St' }]);
      return new Response('down', { status: 503 });
    }) as typeof fetch;
    const found = await searchPlaces('Example Cleaners', { near: home, fetch: fake });
    expect(found.map((p) => p.name)).toEqual(['Example Cleaners']);
    const nominatim = new URL(asked.find((u) => u.includes('nominatim'))!);
    expect(nominatim.searchParams.get('bounded')).toBe('1');
    expect(nominatim.searchParams.get('viewbox')).toBeTruthy();
  });

  test('every server down is reported, not passed off as nothing nearby', async () => {
    const fake = (async () => new Response('busy', { status: 504 })) as unknown as typeof fetch;
    await expect(searchPlaces('dry cleaner', { near: home, fetch: fake })).rejects.toBeInstanceOf(PlaceSearchUnavailable);
  });

  test('a name search reports a busy or garbled service as unavailable', async () => {
    const down = (async () => new Response('busy', { status: 429 })) as unknown as typeof fetch;
    await expect(searchPlaces('Example Cleaners', { fetch: down })).rejects.toBeInstanceOf(PlaceSearchUnavailable);
    const html = (async () => new Response('<html>please wait</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(searchPlaces('Example Cleaners', { fetch: html })).rejects.toBeInstanceOf(PlaceSearchUnavailable);
  });

  test('with both services down, the cause holds both failures once', async () => {
    const fake = (async () => new Response('busy', { status: 504 })) as unknown as typeof fetch;
    const err = await searchPlaces('dry cleaner', { near: home, fetch: fake }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceSearchUnavailable);
    const cause = (err as PlaceSearchUnavailable).cause as AggregateError;
    expect(cause).toBeInstanceOf(AggregateError);
    expect(cause.errors).toHaveLength(2);
    expect(cause.errors.some((e) => e instanceof PlaceSearchUnavailable)).toBe(false);
  });

  test('opening hours come along when the map has them', async () => {
    const fake = (async (_u: string | URL) => json({ elements: [element(5, 40.01, { opening_hours: 'Mo-Fr 07:00-18:00' })] })) as typeof fetch;
    const [p] = await searchPlaces('dry cleaner', { near: home, fetch: fake });
    expect(p.openingHours).toBe('Mo-Fr 07:00-18:00');
  });

  test('a shop without address tags has an empty address and a name-only Maps search', async () => {
    const fake = (async (_u: string | URL) => json({ elements: [element(4, 40.01, {})] })) as typeof fetch;
    const [p] = await searchPlaces('dry cleaner', { near: home, fetch: fake });
    expect(p.address).toBe('');
    expect(p.mapsUrl).toBe(mapsSearchUrl('Cleaner 4'));
  });

  test('kinds come from everyday words, and the list cannot be changed by an app', () => {
    expect(placeKinds('pick up prescription')).toEqual(['amenity=pharmacy', 'shop=chemist']);
    expect(placeKinds('Corner Grocer')).toEqual([]);
    expect(Object.isFrozen(PLACE_KINDS)).toBe(true);
    expect(Object.isFrozen(PLACE_KINDS[0].tags)).toBe(true);
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0.1, lon: 0 })).toBeCloseTo(11.12, 1);
  });

  test('distances follow the device region', () => {
    expect(usesMiles('en-US')).toBe(true);
    expect(usesMiles('en')).toBe(true);
    expect(usesMiles('en-GB')).toBe(true);
    expect(usesMiles('en-CA')).toBe(false);
    expect(usesMiles('nl-NL')).toBe(false);
    expect(usesMiles('not a locale')).toBe(false);
    expect(formatDistance(0.8, 'en-US')).toBe('0.5 mi');
    expect(formatDistance(0.65, 'nl-NL')).toBe('650 m');
    expect(formatDistance(3.14, 'de-DE')).toBe('3.1 km');
  });
  test('tel links keep only digits and plus', () => {
    expect(telHref('+1 (555) 010-0100')).toBe('tel:+15550100100');
  });
});

describe('contacts', () => {
  test('empty optional fields are dropped and text trimmed', () => {
    expect(cleanContact({ name: ' Dr. Example ', role: 'Pediatrician', phone: '  ', apps: ['baby'] })).toEqual({ name: 'Dr. Example', role: 'Pediatrician', apps: ['baby'], private: false });
  });
  test('always writes the private flag, which helpers and kids need to see a contact', () => {
    expect(cleanContact({ name: 'Example Vet', apps: ['pet'], private: true }).private).toBe(true);
    expect(toContact('c1', { name: 'Example Vet', apps: [] }).private).toBeUndefined();
    expect(toContact('c1', { name: 'Example Vet', apps: [], private: false }).private).toBe(false);
  });
  test('reads documents defensively', () => {
    expect(toContact('c1', { name: 'Example Vet', apps: 'baby' })).toMatchObject({ id: 'c1', name: 'Example Vet', apps: [], createdAt: 0 });
  });
});
