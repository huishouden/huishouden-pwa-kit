import { describe, expect, test } from 'bun:test';
import { searchPhrases, toMatch } from '../src/calendar';
import { cleanContact, toContact } from '../src/contacts';
import { mapsSearchUrl, telHref, toPlace } from '../src/places';

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
