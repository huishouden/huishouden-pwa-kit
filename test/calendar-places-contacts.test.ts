import { describe, expect, test } from 'bun:test';
import { searchPhrases, toMatch } from '../src/calendar';
import { cleanContact, toContact } from '../src/contacts';
import { distanceKm, mapsSearchUrl, overpassQuery, placeKinds, searchPlaces, telHref, toPlace, viewbox } from '../src/places';

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
  test('near searches ask Overpass for the kind of place and come back nearest first', async () => {
    const home = { lat: 40, lon: -75 };
    let body = '';
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      body = decodeURIComponent(String(init?.body));
      const at = (id: number, lat: number) => ({ type: 'node', id, lat, lon: -75, tags: { name: `Cleaner ${id}`, 'addr:street': 'Main St' } });
      return new Response(JSON.stringify({ elements: [at(1, 40.05), at(2, 40.01), at(3, 40.1), at(2, 40.01)] }));
    }) as typeof fetch;
    try {
      const found = await searchPlaces('Drycleaners dropoff', { near: home, limit: 2 });
      expect(found.map((p) => p.name)).toEqual(['Cleaner 2', 'Cleaner 1']);
      expect(found[0].distanceKm).toBeCloseTo(1.11, 1);
      expect(body).toContain('"shop"="dry_cleaning"');
      expect(body).toContain('around:10000,40,-75');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  test('kinds come from everyday words; unknown words search names only', () => {
    expect(placeKinds('pick up prescription')).toEqual(['amenity=pharmacy', 'shop=chemist']);
    expect(placeKinds('Corner Grocer')).toEqual([]);
    expect(overpassQuery('Corner Grocer', { lat: 1, lon: 2 }, 1)).toBe('[out:json][timeout:20];(nwr(around:1000,1,2)["name"~"Corner.*Grocer",i];);out center tags 40;');
  });
  test('viewbox spans about the radius each way', () => {
    const [left, top, right, bottom] = viewbox({ lat: 0, lon: 0 }, 11.1).split(',').map(Number);
    expect([left, top, right, bottom]).toEqual([-0.1, 0.1, 0.1, -0.1]);
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0.1, lon: 0 })).toBeCloseTo(11.12, 1);
  });
  test('tel links keep only digits and plus', () => {
    expect(telHref('+1 (555) 010-0100')).toBe('tel:+15550100100');
  });
});

describe('contacts', () => {
  test('empty optional fields are dropped and text trimmed', () => {
    expect(cleanContact({ name: ' Dr. Example ', role: 'Pediatrician', phone: '  ', apps: ['baby'] })).toEqual({ name: 'Dr. Example', role: 'Pediatrician', apps: ['baby'] });
  });
  test('reads documents defensively', () => {
    expect(toContact('c1', { name: 'Example Vet', apps: 'baby' })).toMatchObject({ id: 'c1', name: 'Example Vet', apps: [], createdAt: 0 });
  });
});
