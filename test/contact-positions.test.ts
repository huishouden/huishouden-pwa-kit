import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSITION_RETRY_MS, backfillPositions, needsPosition, type PositionUpdate } from '../src/contact-core';
import { clearGeocodeCache, geocodeAddress } from '../src/home';
import { resetPlaceSearch } from '../src/places';

// Contacts saved before positions existed get one in the background (`backfillPositions`), with
// Nominatim stubbed: one lookup a second at most, through the kit's shared queue and cache.
const search = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/nominatim/search.json'), 'utf8'));
const NOW = Date.UTC(2026, 9, 5, 12);
const DAY = 86_400_000;

function nominatim(answer: (q: string) => unknown = () => search) {
  const asked: { q: string; at: number }[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const q = url.searchParams.get('q') ?? '';
    asked.push({ q, at: Date.now() });
    const body = answer(q);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;
  const geocode = async (address: string) => (await geocodeAddress(address, { fetch, lang: 'en' }))[0] ?? null;
  return { asked, geocode };
}

const contact = (id: string, extra: Record<string, unknown> = {}) => ({ id, data: { name: `Contact ${id}`, address: `${id} Example Lane, Springfield`, apps: ['car'], ...extra } });

function recorder() {
  const writes: { id: string; update: PositionUpdate }[] = [];
  return { writes, write: async (id: string, update: PositionUpdate) => void writes.push({ id, update }) };
}

beforeEach(() => {
  clearGeocodeCache();
  resetPlaceSearch();
});

describe('needsPosition', () => {
  test('an address without a position, not tried in the last 30 days', () => {
    expect(needsPosition(contact('a').data, NOW)).toBe(true);
    expect(needsPosition(contact('a', { lat: 39.78, lng: -89.65 }).data, NOW)).toBe(false);
    expect(needsPosition(contact('a', { address: '  ' }).data, NOW)).toBe(false);
    expect(needsPosition({ name: 'No address' }, NOW)).toBe(false);
    expect(needsPosition(contact('a', { geoTried: NOW - 29 * DAY }).data, NOW)).toBe(false);
    expect(needsPosition(contact('a', { geoTried: NOW - POSITION_RETRY_MS }).data, NOW)).toBe(true);
    expect(needsPosition(contact('a', { geoTried: NOW + DAY }).data, NOW)).toBe(false);
    // Half a position isn't one.
    expect(needsPosition(contact('a', { lat: 39.78 }).data, NOW)).toBe(true);
    expect(needsPosition(undefined, NOW)).toBe(false);
  });
});

describe('backfillPositions', () => {
  test('writes positions and no-match marks, up to the limit, one request a second at most', async () => {
    const { asked, geocode } = nominatim((q) => (q.startsWith('b ') ? [] : search));
    const { writes, write } = recorder();
    const docs = [
      contact('a'),
      contact('placed', { lat: 1, lng: 2 }),
      contact('recent', { geoTried: NOW - DAY }),
      contact('b'),
      contact('stale', { geoTried: NOW - 31 * DAY }),
      contact('d'),
    ];
    const started = Date.now();
    const result = await backfillPositions(docs, { geocode, write, limit: 3, now: () => NOW });
    expect(asked.map((a) => a.q)).toEqual(['a Example Lane, Springfield', 'b Example Lane, Springfield', 'stale Example Lane, Springfield']);
    // Turns are booked a second apart from the first; measured against that, not against when a
    // busy event loop happened to record the previous one (CI saw 973 ms between two records).
    for (let i = 1; i < asked.length; i++) expect(asked[i].at - started).toBeGreaterThanOrEqual(i * 1000 - 5);
    expect(writes).toEqual([
      { id: 'a', update: { lat: 39.7817, lng: -89.6501 } },
      { id: 'b', update: { geoTried: NOW } },
      { id: 'stale', update: { lat: 39.7817, lng: -89.6501 } },
    ]);
    expect(result).toEqual({ located: ['a', 'stale'], missed: ['b'] });
  });

  test('the same address twice asks the map once', async () => {
    const { asked, geocode } = nominatim();
    const { writes, write } = recorder();
    await backfillPositions([contact('a'), contact('a2', { address: 'a Example Lane, Springfield' })], { geocode, write, now: () => NOW });
    expect(asked).toHaveLength(1);
    expect(writes.map((w) => w.id)).toEqual(['a', 'a2']);
  });

  test('a busy or unreachable map stops the run without marking anything', async () => {
    const { asked, geocode } = nominatim(() => new Response('slow down', { status: 429 }));
    const { writes, write } = recorder();
    const result = await backfillPositions([contact('a'), contact('b')], { geocode, write, now: () => NOW });
    expect(asked).toHaveLength(1);
    expect(writes).toEqual([]);
    expect(result).toEqual({ located: [], missed: [] });
  });

  test('a refused write stops the run', async () => {
    const { asked, geocode } = nominatim();
    const write = async () => {
      throw new Error('Missing or insufficient permissions.');
    };
    await backfillPositions([contact('a'), contact('b')], { geocode, write, now: () => NOW });
    expect(asked).toHaveLength(1);
  });

  test('leaves a contact edited, placed or deleted meanwhile', async () => {
    const { asked, geocode } = nominatim();
    const { writes, write } = recorder();
    const latest: Record<string, Record<string, unknown> | undefined> = {
      a: { ...contact('a').data, address: '99 Other Road' },
      b: { ...contact('b').data, lat: 1, lng: 2 },
      c: undefined,
      d: contact('d').data,
    };
    await backfillPositions(['a', 'b', 'c', 'd'].map((id) => contact(id)), { geocode, write, current: (id) => latest[id], now: () => NOW });
    expect(asked.map((a) => a.q)).toEqual(['d Example Lane, Springfield']);
    expect(writes.map((w) => w.id)).toEqual(['d']);
  });

  test('an edit during the lookup wins over its answer', async () => {
    const latest: Record<string, Record<string, unknown>> = { a: contact('a').data };
    const { geocode } = nominatim();
    const { writes, write } = recorder();
    const slow = async (address: string) => {
      const found = await geocode(address);
      latest.a = { ...latest.a, address: '99 Other Road' };
      return found;
    };
    await backfillPositions([contact('a')], { geocode: slow, write, current: (id) => latest[id], now: () => NOW });
    expect(writes).toEqual([]);
  });

  test('waits for the page to show, and stops when told to', async () => {
    const { asked, geocode } = nominatim();
    const { writes, write } = recorder();
    let show!: (v: boolean) => void;
    const shown = new Promise<boolean>((r) => (show = r));
    const run = backfillPositions([contact('a')], { geocode, write, whenVisible: () => shown, now: () => NOW });
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).toHaveLength(0);
    show(true);
    await run;
    expect(writes).toHaveLength(1);

    const stop = new AbortController();
    const hidden = backfillPositions([contact('b')], { geocode, write, whenVisible: () => new Promise((r) => stop.signal.addEventListener('abort', () => r(false))), signal: stop.signal, now: () => NOW });
    stop.abort();
    expect(await hidden).toEqual({ located: [], missed: [] });
    expect(asked).toHaveLength(1);
  });
});
