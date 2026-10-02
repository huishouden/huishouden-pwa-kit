/**
 * Looks up a business or place (a pediatrician's office, a vet, a lawn service) to fill in its
 * address, phone and website. Uses OpenStreetMap's free Nominatim search: no key and no billing,
 * which Google's Places API would need. Coverage is good for addresses and patchy for phone and
 * website, so apps also offer `mapsSearchUrl` to check Google Maps.
 *
 * Nominatim's usage policy: at most one search a second, run on an explicit action (a button),
 * never on every keystroke.
 */
/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Nominatim `viewbox` (left,top,right,bottom) for a square about `radiusKm` around a point. */
export function viewbox(p, radiusKm) {
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
        lat: Number(r.lat),
        lon: Number(r.lon),
        osmUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
        mapsUrl: mapsSearchUrl(`${name} ${address}`),
    };
}
let lastSearch = 0;
/**
 * Everyday words for kinds of place, as OpenStreetMap tags them. Matched against the search text,
 * so "drop off dry cleaning" or "Drycleaners" finds `shop=dry_cleaning` near you.
 */
export const PLACE_KINDS = [
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
];
/** The OpenStreetMap tags the text asks for, from `PLACE_KINDS`. */
export function placeKinds(text) {
    return [...new Set(PLACE_KINDS.filter((k) => k.words.test(text)).flatMap((k) => k.tags))];
}
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
/** Overpass QL for named or kind matches within `radiusKm` of a point. */
export function overpassQuery(text, near, radiusKm) {
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
export function overpassPlace(e) {
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
        lat,
        lon,
        osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        mapsUrl: mapsSearchUrl(`${name} ${address}`.trim()),
    };
}
/** Public Overpass servers, tried in order: the main one rate-limits bursts with an HTML page. */
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
async function searchOverpass(text, near, radiusKm) {
    const body = new URLSearchParams({ data: overpassQuery(text, near, radiusKm) }).toString();
    let failure = new Error('Place search failed');
    for (const server of OVERPASS_SERVERS) {
        try {
            const res = await fetch(server, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
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
async function searchNominatim(q, limit, near, radiusKm = 15) {
    const wait = lastSearch + 1000 - Date.now();
    if (wait > 0)
        await new Promise((r) => setTimeout(r, wait));
    lastSearch = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    const params = { q, format: 'jsonv2', extratags: '1', limit: String(limit) };
    if (near)
        Object.assign(params, { viewbox: viewbox(near, radiusKm), bounded: '1' });
    url.search = new URLSearchParams(params).toString();
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok)
        throw new Error(`[${res.status}] Place search failed`);
    return (await res.json()).map(toPlace);
}
/**
 * Up to `limit` (default 5) places matching the text, e.g. "Riverside Pediatrics Springfield", or
 * with `near`, "dry cleaner" nearest first.
 */
export async function searchPlaces(query, { limit = 5, near, radiusKm = 10 } = {}) {
    const q = query.trim();
    if (!q)
        return [];
    if (!near)
        return searchNominatim(q, limit);
    let places = await searchOverpass(q, near, radiusKm).catch(() => []);
    if (places.length === 0)
        places = await searchNominatim(q, Math.max(limit, 10), near, radiusKm);
    const seen = new Set();
    return places
        .map((p) => ({ ...p, distanceKm: distanceKm(near, p) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .filter((p) => !seen.has(p.osmUrl) && seen.add(p.osmUrl))
        .slice(0, limit);
}
/** `tel:` link for a phone number as people write it. */
export function telHref(phone) {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
