import { type NearPoint } from './places.js';
export interface HouseholdHome {
    /** One line, as entered or as the map service wrote it ("12 Example Lane, Springfield"); for an approximate home, the neighbourhood. */
    address: string;
    lat: number;
    lng: number;
    /** The OpenStreetMap object it came from ("way/123456"), when it came from a search. */
    placeId?: string;
    /** IANA zone the household lives in ("America/Chicago"): the browser's at save. */
    timeZone?: string;
    /** Only the neighbourhood: `address` names it and `lat`/`lng` are its centre, not the house. */
    approximate?: boolean;
    /** Lowercase email of whoever set it. */
    setBy: string;
    updatedAt: number;
}
/** Field limits the household rules allow. */
export declare const HOME_LIMITS: {
    readonly address: 300;
    readonly placeId: 100;
    readonly timeZone: 60;
};
/** A stored `home` read defensively; undefined when it isn't a usable one. */
export declare function toHome(data: unknown): HouseholdHome | undefined;
/** What a person picks: a found address, or their position. */
export interface HomeCandidate {
    address: string;
    lat: number;
    lng: number;
    placeId?: string;
    approximate?: boolean;
}
/** The stored document for a picked home, as the rules accept it. */
export declare function homeDoc(candidate: HomeCandidate, by: string, { timeZone, now }?: {
    timeZone?: string;
    now?: number;
}): HouseholdHome;
/** Words of an address that must never leave the device: each part between commas, and the street without its number. */
export declare function homeWords(home: Pick<HouseholdHome, 'address'> | undefined): string[];
/**
 * The home every kit feature uses (`watchHousehold` calls it with the household's; `undefined` when
 * it has none). Also keeps its address out of everything sent to New Relic.
 */
export declare function setHome(home: HouseholdHome | undefined): void;
/** The current household's home, if it has set one. */
export declare function getHome(): HouseholdHome | undefined;
/** Calls `listener` whenever the home changes; returns the unsubscribe. */
export declare function onHomeChange(listener: () => void): () => void;
/** The home as a point for `searchPlaces({ near })` and `distanceKm`. */
export declare function homePoint(home?: HouseholdHome | undefined): NearPoint | undefined;
/** The device's IANA zone; "UTC" when the runtime can't say. */
export declare function deviceTimeZone(): string;
/**
 * The household's zone: the home's when set, else `fallback` (a device's, or a zone a server was
 * given). Reminders and calendar feeds use it, so "9:00" is 9:00 at home wherever the phone is.
 */
export declare function householdTimeZone(home?: Pick<HouseholdHome, 'timeZone'> | undefined, fallback?: string): string;
/** Straight-line km from home to a point; undefined without a home. */
export declare function distanceFromHome(point: NearPoint | {
    lat: number;
    lng: number;
} | undefined, home?: HouseholdHome | undefined): number | undefined;
/** "2.3 mi from home" ("3,7 km van huis"); undefined without a home or a point. */
export declare function formatFromHome(point: NearPoint | {
    lat: number;
    lng: number;
} | undefined, { home, locale }?: {
    home?: HouseholdHome;
    locale?: string;
}): string | undefined;
interface NominatimAddress {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    hamlet?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
}
export interface NominatimPlace {
    osm_type?: string;
    osm_id?: number;
    lat: string;
    lon: string;
    display_name: string;
    place_rank?: number;
    address?: NominatimAddress;
}
export interface GeocodeOptions {
    /** For tests: stands in for the network. */
    fetch?: typeof fetch;
    /** Names in this language where the map has them; the active one by default. */
    lang?: string;
}
/** For tests: forgets cached answers. */
export declare function clearGeocodeCache(): void;
/** "12 Example Lane, Springfield, IL 62701": street, town, region and postcode, without county or country. */
export declare function shortAddress(p: NominatimPlace): string;
/** The neighbourhood's name, its town and region: "Riverside, Springfield, Illinois". */
export declare function neighbourhoodName(p: NominatimPlace): string;
/**
 * Up to five addresses matching the text ("12 Example Lane Springfield"), best first. Run it from a
 * Search button, not as the person types: Nominatim forbids autocomplete.
 */
export declare function geocodeAddress(text: string, options?: GeocodeOptions): Promise<HomeCandidate[]>;
/** The address at a point (a phone's position); null when the map has nothing there. */
export declare function reverseGeocode(point: {
    lat: number;
    lng: number;
}, options?: GeocodeOptions): Promise<HomeCandidate | null>;
/**
 * The neighbourhood around a point instead of the house: its name and centre (Nominatim's area at
 * suburb level). Where the map has no such area, the point rounded to about a kilometre.
 */
export declare function approximateHome(point: {
    lat: number;
    lng: number;
}, options?: GeocodeOptions): Promise<HomeCandidate>;
/** Why the browser gave no position. */
export type PositionProblem = 'unsupported' | 'denied' | 'unavailable';
export declare class PositionUnavailable extends Error {
    readonly problem: PositionProblem;
    constructor(problem: PositionProblem);
}
/** The device's position (asks for location permission the first time). Throws `PositionUnavailable`. */
export declare function currentPosition({ timeout }?: {
    timeout?: number;
}): Promise<{
    lat: number;
    lng: number;
    accuracy?: number;
}>;
export interface MapTile {
    url: string;
    /** Pixels from the map's top-left, for a map `width`×`height` centred on the point. */
    left: number;
    top: number;
}
/**
 * OpenStreetMap tiles covering a `width`×`height` map centred on the point at `zoom`. Free under
 * the OSM tile policy for light use with attribution ("© OpenStreetMap contributors" linked to
 * openstreetmap.org/copyright), which `HomeMap` shows.
 */
export declare function mapTiles(point: {
    lat: number;
    lng: number;
}, zoom: number, width: number, height: number): MapTile[];
/** The point on openstreetmap.org. */
export declare function osmMapUrl(point: {
    lat: number;
    lng: number;
}, zoom?: number): string;
export {};
