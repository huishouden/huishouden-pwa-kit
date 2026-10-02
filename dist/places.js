/**
 * Looks up a business or place (a pediatrician's office, a vet, a lawn service) to fill in its
 * address, phone and website. Uses OpenStreetMap's free Nominatim search: no key and no billing,
 * which Google's Places API would need. Coverage is good for addresses and patchy for phone and
 * website, so apps also offer `mapsSearchUrl` to check Google Maps.
 *
 * Nominatim's usage policy: at most one search a second, run on an explicit action (a button),
 * never on every keystroke.
 */
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
/** Up to five places matching the query, e.g. "Riverside Pediatrics Springfield". */
export async function searchPlaces(query, { limit = 5 } = {}) {
    const q = query.trim();
    if (!q)
        return [];
    const wait = lastSearch + 1000 - Date.now();
    if (wait > 0)
        await new Promise((r) => setTimeout(r, wait));
    lastSearch = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q, format: 'jsonv2', extratags: '1', limit: String(limit) }).toString();
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok)
        throw new Error(`[${res.status}] Place search failed`);
    return (await res.json()).map(toPlace);
}
/** `tel:` link for a phone number as people write it. */
export function telHref(phone) {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
