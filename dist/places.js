/**
 * Looks up a business or place (a pediatrician's office, a vet, a lawn service) to fill in its
 * address, phone and website. Uses OpenStreetMap's free Nominatim search: no key and no billing,
 * which Google's Places API would need. Coverage is good for addresses and patchy for phone and
 * website, so apps also offer `mapsSearchUrl` to check Google Maps.
 *
 * Nominatim's usage policy: at most one search a second, run on an explicit action (a button),
 * never on every keystroke.
 */
import { formatNumber, getLocale, kt } from './i18n.js';
import { homePoint } from './home.js';
/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Nominatim `viewbox` (left,top,right,bottom) for a square about `radiusKm` around a point. */
function viewbox(p, radiusKm) {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01));
    return [p.lon - dLon, p.lat + dLat, p.lon + dLon, p.lat - dLat].map((n) => n.toFixed(5)).join(',');
}
export function mapsSearchUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function toPlace(r) {
    const tags = r.extratags ?? {};
    const name = r.name || r.display_name.split(',')[0];
    const address = r.name && r.display_name.startsWith(r.name) ? r.display_name.slice(r.name.length).replace(/^,\s*/, '') : r.display_name;
    const website = tags.website ?? tags['contact:website'] ?? tags.url;
    return {
        name,
        address,
        phone: tags.phone ?? tags['contact:phone'],
        website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
        openingHours: tags.opening_hours,
        lat: Number(r.lat),
        lon: Number(r.lon),
        osmUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
        mapsUrl: mapsSearchUrl(`${name} ${address}`),
    };
}
// When the next request may go: one a second, booked as callers arrive.
let nextSlot = 0;
/**
 * Waits for this page's next turn at Nominatim: at most one request a second, shared by every
 * Nominatim caller in the kit (`./home` too), even when several start at once.
 */
export function nominatimTurn() {
    const now = Date.now();
    // A clock that jumped back (or a test's) must not stall searches for its difference.
    if (nextSlot > now + 60_000)
        nextSlot = now;
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + 1000;
    return slot > now ? new Promise((r) => setTimeout(r, slot - now)) : Promise.resolve();
}
// Answers kept for the session, as Nominatim's policy asks: the same search twice asks once.
const answers = new Map();
export const PLACE_KINDS = Object.freeze([
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
export function placeKinds(text) {
    return [...new Set(PLACE_KINDS.filter((k) => k.words.test(text)).flatMap((k) => k.tags))];
}
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
/** Overpass QL for named or kind matches within `radiusKm` of a point. */
function overpassQuery(text, near, radiusKm) {
    const around = `around:${Math.round(radiusKm * 1000)},${near.lat},${near.lon}`;
    const words = text.trim().split(/\s+/).filter((w) => w.length > 1).map(escapeRegex);
    const parts = placeKinds(text).map((t) => {
        const [k, v] = t.split('=');
        return `nwr(${around})["${k}"="${v}"];`;
    });
    // A name search is slow over a wide area, so it runs only when no kind of place matched.
    if (!parts.length && words.length)
        parts.push(`nwr(${around})["name"~"${words.join('.*')}",i];`);
    return `[out:json][timeout:20];(${parts.join('')});out center tags 40;`;
}
function overpassPlace(e) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = t.name || t.brand;
    if (!name || lat === undefined || lon === undefined)
        return null;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const address = [street, t['addr:city']].filter(Boolean).join(', ');
    const website = t.website ?? t['contact:website'];
    return {
        name,
        address,
        phone: t.phone ?? t['contact:phone'],
        website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
        openingHours: t.opening_hours,
        lat,
        lon,
        osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        mapsUrl: mapsSearchUrl(`${name} ${address}`.trim()),
    };
}
/** Public Overpass servers, tried in order: the main one rate-limits bursts with an HTML page. */
const OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
/** A hung server counts as a failure, so the next fallback runs instead of waiting forever. */
const REQUEST_TIMEOUT_MS = 10_000;
async function searchOverpass(text, near, radiusKm, fetchImpl) {
    const body = new URLSearchParams({ data: overpassQuery(text, near, radiusKm) }).toString();
    let failure = new Error('Place search failed');
    for (const server of OVERPASS_SERVERS) {
        try {
            const res = await fetchImpl(server, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
            if (!res.ok)
                throw new Error(`[${res.status}] Place search failed`);
            const json = (await res.json());
            if (json.remark && !json.elements?.length)
                throw new Error(`Place search failed: ${json.remark}`);
            return (json.elements ?? []).map(overpassPlace).filter((p) => p !== null);
        }
        catch (e) {
            failure = e;
        }
    }
    throw failure;
}
async function searchNominatim(q, limit, fetchImpl, near, radiusKm = 15, bounded = true) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    const params = { q, format: 'jsonv2', extratags: '1', limit: String(limit) };
    if (near)
        Object.assign(params, { viewbox: viewbox(near, radiusKm), bounded: bounded ? '1' : '0' });
    url.search = new URLSearchParams(params).toString();
    const known = answers.get(url.href);
    if (known)
        return known;
    await nominatimTurn();
    try {
        const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok)
            throw new Error(`[${res.status}] Place search failed`);
        // A rate-limit or captive-portal page can arrive as 200 with HTML: treat it as busy too.
        const places = (await res.json()).map(toPlace);
        answers.set(url.href, places);
        if (answers.size > 100)
            answers.delete(answers.keys().next().value);
        return places;
    }
    catch (e) {
        throw new PlaceSearchUnavailable(e);
    }
}
/** For tests: forgets cached answers and the last request's time. */
export function resetPlaceSearch() {
    answers.clear();
    nextSlot = 0;
}
/**
 * The free map service is busy or unreachable (rate limits, timeouts, server errors), so apps can
 * say so instead of "nothing nearby". A `near` search throws it when every Overpass server failed
 * and the Nominatim fallback failed or found nothing; a name search when Nominatim fails.
 */
export class PlaceSearchUnavailable extends Error {
    /** `cause` is the underlying error, or an `AggregateError` of both when Overpass and Nominatim failed. */
    constructor(cause) {
        super(kt('places.unavailable'), { cause });
        this.name = 'PlaceSearchUnavailable';
    }
}
/**
 * Up to `limit` (default 5) places matching the text, e.g. "Riverside Pediatrics Springfield", or
 * with `near`, "dry cleaner" nearest first. A name search prefers places around `from` (the
 * household's home by default) and says how far each is.
 */
export async function searchPlaces(query, { limit = 5, near, radiusKm = 10, from = homePoint(), fetch: fetchImpl = fetch } = {}) {
    const q = query.trim();
    if (!q)
        return [];
    if (!near) {
        const found = await searchNominatim(q, limit, fetchImpl, from ?? undefined, 50, false);
        return from ? found.map((p) => ({ ...p, distanceKm: distanceKm(from, p) })) : found;
    }
    // Overpass down or finding nothing: a bounded name search, which still finds named places.
    let overpassError = null;
    let places = await searchOverpass(q, near, radiusKm, fetchImpl).catch((e) => {
        overpassError = e;
        return [];
    });
    let nominatimError = null;
    if (places.length === 0) {
        places = await searchNominatim(q, Math.max(limit, 10), fetchImpl, near, radiusKm).catch((e) => {
            nominatimError = e;
            return [];
        });
    }
    // Both down: busy. Overpass down but Nominatim answered empty: also busy, since only Overpass
    // finds places by kind. Overpass answered empty: nothing there.
    if (places.length === 0 && overpassError) {
        const nominatimCause = nominatimError instanceof PlaceSearchUnavailable ? nominatimError.cause : nominatimError;
        throw new PlaceSearchUnavailable(nominatimError ? new AggregateError([overpassError, nominatimCause], 'Overpass and Nominatim both failed') : overpassError);
    }
    const seen = new Set();
    return places
        .map((p) => ({ ...p, distanceKm: distanceKm(near, p) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .filter((p) => !seen.has(p.osmUrl) && seen.add(p.osmUrl))
        .slice(0, limit);
}
/** Regions whose people think in miles and feet for distances (road signs, maps). */
const MILES_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);
/** The device's region from its language ("en-US" → "US"; "en" → its likely region). */
function region(locale) {
    try {
        return new Intl.Locale(locale).maximize().region;
    }
    catch {
        return undefined;
    }
}
export function usesMiles(locale = getLocale()) {
    return MILES_REGIONS.has(region(locale) ?? '');
}
/** "0.5 mi", "12 mi" where miles are used; "650 m", "3.1 km" ("3,1 km") elsewhere. */
export function formatDistance(km, locale = getLocale()) {
    const unit = (n, u, digits) => formatNumber(n, locale, { style: 'unit', unit: u, unitDisplay: 'short', minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/[\u202f\u00a0]/g, ' ');
    if (usesMiles(locale)) {
        const mi = km / 1.609344;
        return mi < 10 ? unit(mi, 'mile', 1) : unit(Math.round(mi), 'mile', 0);
    }
    if (km < 1)
        return unit(Math.round(km * 100) * 10, 'meter', 0);
    return km < 10 ? unit(km, 'kilometer', 1) : unit(Math.round(km), 'kilometer', 0);
}
/** `tel:` link for a phone number as people write it. */
export function telHref(phone) {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
// Places OpenStreetMap doesn't know: from Share text, a copied listing or a screenshot (see place-text.ts).
export { SHARE_PARAMS, clearSharedPlace, parsePlaceText, readPlaceScreenshot, readSharedPlace } from './place-text';
