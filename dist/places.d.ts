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
    /** Business hours as OpenStreetMap writes them ("Mo-Fr 07:00-18:00"); see `@huishouden/pwa-kit/hours`. Often missing. */
    openingHours?: string;
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
export declare const PLACE_KINDS: readonly PlaceKind[];
/** The OpenStreetMap tags the text asks for, from `PLACE_KINDS`. */
export declare function placeKinds(text: string): string[];
/**
 * Thrown by a `near` search when every Overpass server failed and the fallback found nothing, so
 * apps can say "the map service is busy" instead of "nothing nearby".
 */
export declare class PlaceSearchUnavailable extends Error {
    constructor(cause: unknown);
}
/**
 * Up to `limit` (default 5) places matching the text, e.g. "Riverside Pediatrics Springfield", or
 * with `near`, "dry cleaner" nearest first.
 */
export declare function searchPlaces(query: string, { limit, near, radiusKm, fetch: fetchImpl }?: SearchPlacesOptions): Promise<Place[]>;
export declare function usesMiles(locale?: string): boolean;
/** "0.5 mi", "12 mi" where miles are used; "650 m", "3.1 km" elsewhere. */
export declare function formatDistance(km: number, locale?: string): string;
/** `tel:` link for a phone number as people write it. */
export declare function telHref(phone: string): string;
export {};
