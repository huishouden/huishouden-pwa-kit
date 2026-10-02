/**
 * Looks up a business or place (a pediatrician's office, a vet, a lawn service) to fill in its
 * address, phone and website. Uses OpenStreetMap's free Nominatim search: no key and no billing,
 * which Google's Places API would need. Coverage is good for addresses and patchy for phone and
 * website, so apps also offer `mapsSearchUrl` to check Google Maps.
 *
 * Nominatim's usage policy: at most one search a second, run on an explicit action (a button),
 * never on every keystroke.
 */

export interface Place {
  name: string;
  /**
   * Street address. From a name search it is always filled in; from a `near` search it can be
   * empty, because many shops in OpenStreetMap carry no address tags (`mapsUrl` still finds them).
   */
  address: string;
  phone?: string;
  website?: string;
  lat: number;
  lon: number;
  /** The place on openstreetmap.org. */
  osmUrl: string;
  /** Searches Google Maps for this place. */
  mapsUrl: string;
  /** Straight-line distance from `near`, when the search had one. */
  distanceKm?: number;
}

export interface NearPoint {
  lat: number;
  lon: number;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: NearPoint, b: NearPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Nominatim `viewbox` (left,top,right,bottom) for a square about `radiusKm` around a point. */
function viewbox(p: NearPoint, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01));
  return [p.lon - dLon, p.lat + dLat, p.lon + dLon, p.lat - dLat].map((n) => n.toFixed(5)).join(',');
}

interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  extratags?: Record<string, string>;
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function toPlace(r: NominatimResult): Place {
  const tags = r.extratags ?? {};
  const name = r.name || r.display_name.split(',')[0];
  const address = r.name && r.display_name.startsWith(r.name) ? r.display_name.slice(r.name.length).replace(/^,\s*/, '') : r.display_name;
  const website = tags.website ?? tags['contact:website'] ?? tags.url;
  return {
    name,
    address,
    phone: tags.phone ?? tags['contact:phone'],
    website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
    lat: Number(r.lat),
    lon: Number(r.lon),
    osmUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
    mapsUrl: mapsSearchUrl(`${name} ${address}`),
  };
}

let lastSearch = 0;

export interface SearchPlacesOptions {
  limit?: number;
  /** For tests: stands in for the network. */
  fetch?: typeof fetch;
  /**
   * Places within `radiusKm` of this point, nearest first: "dry cleaner" near home rather than
   * anywhere in the world. Uses OpenStreetMap's Overpass API, which finds places by kind (from
   * `PLACE_KINDS`) as well as by name; falls back to a bounded Nominatim search.
   */
  near?: NearPoint;
  radiusKm?: number;
}

/**
 * Everyday words for kinds of place, as OpenStreetMap tags them. Matched against the search text,
 * so "drop off dry cleaning" or "Drycleaners" finds `shop=dry_cleaning` near you.
 */
export interface PlaceKind {
  readonly words: RegExp;
  /** OpenStreetMap `key=value` tags for this kind of place. */
  readonly tags: readonly string[];
}

export const PLACE_KINDS: readonly PlaceKind[] = Object.freeze([
  { words: /dry\s*clean/i, tags: ['shop=dry_cleaning'] },
  { words: /laundr|laundromat/i, tags: ['shop=laundry', 'shop=dry_cleaning'] },
  { words: /tailor|alteration/i, tags: ['shop=tailor', 'craft=tailor'] },
  { words: /pharmac|drugstore|chemist|prescription/i, tags: ['amenity=pharmacy', 'shop=chemist'] },
  { words: /\bvets?\b|veterinar/i, tags: ['amenity=veterinary'] },
  { words: /post\s*office|mail a|stamps|usps/i, tags: ['amenity=post_office'] },
  { words: /\bbank\b|\batm\b/i, tags: ['amenity=bank', 'amenity=atm'] },
  { words: /hardware|home\s*depot|lowe'?s/i, tags: ['shop=hardware', 'shop=doityourself'] },
  { words: /shoe\s*repair|cobbler/i, tags: ['shop=shoe_repair', 'craft=shoemaker'] },
  { words: /key\s*(cut|copy)|locksmith/i, tags: ['shop=locksmith', 'craft=locksmith'] },
  { words: /car\s*wash/i, tags: ['amenity=car_wash'] },
  { words: /oil\s*change|mechanic|car\s*repair|tires?\b/i, tags: ['shop=car_repair', 'shop=tyres'] },
  { words: /\bgas\b|fuel|petrol/i, tags: ['amenity=fuel'] },
  { words: /library|return books/i, tags: ['amenity=library'] },
  { words: /florist|flowers/i, tags: ['shop=florist'] },
  { words: /pet\s*(store|food|supplies)/i, tags: ['shop=pet'] },
  { words: /dentist|dental/i, tags: ['amenity=dentist', 'healthcare=dentist'] },
  { words: /doctor|clinic|urgent\s*care/i, tags: ['amenity=doctors', 'amenity=clinic'] },
  { words: /hair\s*cut|barber|salon/i, tags: ['shop=hairdresser'] },
  { words: /recycl|dump|transfer station/i, tags: ['amenity=recycling', 'amenity=waste_transfer_station'] },
  { words: /print|copies|fedex|ups store/i, tags: ['shop=copyshop', 'amenity=post_office'] },
].map((k) => Object.freeze({ ...k, tags: Object.freeze(k.tags) })));

/** The OpenStreetMap tags the text asks for, from `PLACE_KINDS`. */
export function placeKinds(text: string): string[] {
  return [...new Set(PLACE_KINDS.filter((k) => k.words.test(text)).flatMap((k) => k.tags))];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');

/** Overpass QL for named or kind matches within `radiusKm` of a point. */
function overpassQuery(text: string, near: NearPoint, radiusKm: number): string {
  const around = `around:${Math.round(radiusKm * 1000)},${near.lat},${near.lon}`;
  const words = text.trim().split(/\s+/).filter((w) => w.length > 1).map(escapeRegex);
  const parts = placeKinds(text).map((t) => {
    const [k, v] = t.split('=');
    return `nwr(${around})["${k}"="${v}"];`;
  });
  // A name search is slow over a wide area, so it runs only when no kind of place matched.
  if (!parts.length && words.length) parts.push(`nwr(${around})["name"~"${words.join('.*')}",i];`);
  return `[out:json][timeout:20];(${parts.join('')});out center tags 40;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function overpassPlace(e: OverpassElement): Place | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const name = t.name || t.brand;
  if (!name || lat === undefined || lon === undefined) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const address = [street, t['addr:city']].filter(Boolean).join(', ');
  const website = t.website ?? t['contact:website'];
  return {
    name,
    address,
    phone: t.phone ?? t['contact:phone'],
    website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
    lat,
    lon,
    osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    mapsUrl: mapsSearchUrl(`${name} ${address}`.trim()),
  };
}

/** Public Overpass servers, tried in order: the main one rate-limits bursts with an HTML page. */
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** A hung server counts as a failure, so the next fallback runs instead of waiting forever. */
const REQUEST_TIMEOUT_MS = 15_000;

async function searchOverpass(text: string, near: NearPoint, radiusKm: number, fetchImpl: typeof fetch): Promise<Place[]> {
  const body = new URLSearchParams({ data: overpassQuery(text, near, radiusKm) }).toString();
  let failure: Error = new Error('Place search failed');
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetchImpl(server, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`[${res.status}] Place search failed`);
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      if (json.remark && !json.elements?.length) throw new Error(`Place search failed: ${json.remark}`);
      return (json.elements ?? []).map(overpassPlace).filter((p): p is Place => p !== null);
    } catch (e) {
      failure = e as Error;
    }
  }
  throw failure;
}

async function searchNominatim(q: string, limit: number, fetchImpl: typeof fetch, near?: NearPoint, radiusKm = 15): Promise<Place[]> {
  const wait = lastSearch + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  const params: Record<string, string> = { q, format: 'jsonv2', extratags: '1', limit: String(limit) };
  if (near) Object.assign(params, { viewbox: viewbox(near, radiusKm), bounded: '1' });
  url.search = new URLSearchParams(params).toString();
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`[${res.status}] Place search failed`);
  return ((await res.json()) as NominatimResult[]).map(toPlace);
}

/**
 * Up to `limit` (default 5) places matching the text, e.g. "Riverside Pediatrics Springfield", or
 * with `near`, "dry cleaner" nearest first.
 */
export async function searchPlaces(query: string, { limit = 5, near, radiusKm = 10, fetch: fetchImpl = fetch }: SearchPlacesOptions = {}): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  if (!near) return searchNominatim(q, limit, fetchImpl);
  // Overpass down or finding nothing: a bounded name search, which still finds named places.
  let places = await searchOverpass(q, near, radiusKm, fetchImpl).catch(() => [] as Place[]);
  if (places.length === 0) places = await searchNominatim(q, Math.max(limit, 10), fetchImpl, near, radiusKm);
  const seen = new Set<string>();
  return places
    .map((p) => ({ ...p, distanceKm: distanceKm(near, p) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .filter((p) => !seen.has(p.osmUrl) && seen.add(p.osmUrl))
    .slice(0, limit);
}

/** `tel:` link for a phone number as people write it. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
