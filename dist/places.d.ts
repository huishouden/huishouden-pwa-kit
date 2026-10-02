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
    address: string;
    phone?: string;
    website?: string;
    lat: number;
    lon: number;
    /** The place on openstreetmap.org. */
    osmUrl: string;
    /** Searches Google Maps for this place. */
    mapsUrl: string;
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
export declare function mapsSearchUrl(query: string): string;
export declare function toPlace(r: NominatimResult): Place;
/** Up to five places matching the query, e.g. "Riverside Pediatrics Springfield". */
export declare function searchPlaces(query: string, { limit }?: {
    limit?: number;
}): Promise<Place[]>;
/** `tel:` link for a phone number as people write it. */
export declare function telHref(phone: string): string;
export {};
