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
    /** Straight-line distance from `near`, when the search had one. */
    distanceKm?: number;
}
export interface NearPoint {
    lat: number;
    lon: number;
}
/** Great-circle distance in kilometres. */
export declare function distanceKm(a: NearPoint, b: NearPoint): number;
/** Nominatim `viewbox` (left,top,right,bottom) for a square about `radiusKm` around a point. */
export declare function viewbox(p: NearPoint, radiusKm: number): string;
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
export interface SearchPlacesOptions {
    limit?: number;
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
export declare const PLACE_KINDS: {
    words: RegExp;
    tags: string[];
}[];
/** The OpenStreetMap tags the text asks for, from `PLACE_KINDS`. */
export declare function placeKinds(text: string): string[];
/** Overpass QL for named or kind matches within `radiusKm` of a point. */
export declare function overpassQuery(text: string, near: NearPoint, radiusKm: number): string;
interface OverpassElement {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: {
        lat: number;
        lon: number;
    };
    tags?: Record<string, string>;
}
export declare function overpassPlace(e: OverpassElement): Place | null;
/**
 * Up to `limit` (default 5) places matching the text, e.g. "Riverside Pediatrics Springfield", or
 * with `near`, "dry cleaner" nearest first.
 */
export declare function searchPlaces(query: string, { limit, near, radiusKm }?: SearchPlacesOptions): Promise<Place[]>;
/** `tel:` link for a phone number as people write it. */
export declare function telHref(phone: string): string;
export {};
