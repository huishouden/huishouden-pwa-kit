/**
 * The household's home: where it lives (`households/{id}.home`), so every app can search near home,
 * say how far a place is ("2.3 mi from home") and keep the household's clock (`timeZone`). Set in
 * the portal's household panel by admins and members; every member reads it, helpers and kids
 * included (a babysitter needs the address).
 *
 * `watchHousehold` (`./household`) keeps the current household's home here, as it does the currency,
 * so the kit's own location features default to it: `searchPlaces` ranks and measures from home,
 * `./hours` reads opening hours on the home's clock, and `formatFromHome` says the distance. Its
 * address is also handed to `setSensitiveWords`, so it never reaches New Relic.
 *
 * Addresses are found with OpenStreetMap's free Nominatim service under its usage policy: one
 * request a second at most (shared with `./places`), only on an explicit action (a button, never
 * per keystroke), results cached, and the app identified by the page's origin (browsers send it as
 * the `Referer`; they don't let a page set `User-Agent`). No key, no billing.
 *
 * Server-safe apart from `currentPosition`, which needs a browser.
 */
import { kt, getLang } from './i18n.js';
import { setSensitiveWords } from './observability.js';
import { distanceKm, formatDistance, nominatimTurn } from './places.js';
/** Field limits the household rules allow. */
export const HOME_LIMITS = { address: 300, placeId: 100, timeZone: 60 };
const TIME_ZONE = /^[A-Za-z0-9_+-]{1,32}(\/[A-Za-z0-9_+-]{1,32}){0,2}$/;
const finite = (n, max) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
/** A stored `home` read defensively; undefined when it isn't a usable one. */
export function toHome(data) {
    if (!data || typeof data !== 'object')
        return undefined;
    const d = data;
    if (typeof d.address !== 'string' || !d.address.trim() || !finite(d.lat, 90) || !finite(d.lng, 180))
        return undefined;
    return {
        address: d.address.trim().slice(0, HOME_LIMITS.address),
        lat: d.lat,
        lng: d.lng,
        ...(typeof d.placeId === 'string' && d.placeId ? { placeId: d.placeId.slice(0, HOME_LIMITS.placeId) } : {}),
        ...(typeof d.timeZone === 'string' && TIME_ZONE.test(d.timeZone) ? { timeZone: d.timeZone } : {}),
        ...(d.approximate === true ? { approximate: true } : {}),
        setBy: typeof d.setBy === 'string' ? d.setBy : '',
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    };
}
/** The stored document for a picked home, as the rules accept it. */
export function homeDoc(candidate, by, { timeZone = deviceTimeZone(), now = Date.now() } = {}) {
    const address = candidate.address.trim().slice(0, HOME_LIMITS.address);
    if (!address)
        throw new Error('A home needs an address.');
    if (!finite(candidate.lat, 90) || !finite(candidate.lng, 180))
        throw new Error('A home needs a position on the map.');
    return {
        address,
        lat: round(candidate.lat, 6),
        lng: round(candidate.lng, 6),
        ...(candidate.placeId ? { placeId: candidate.placeId.slice(0, HOME_LIMITS.placeId) } : {}),
        ...(TIME_ZONE.test(timeZone) ? { timeZone } : {}),
        ...(candidate.approximate ? { approximate: true } : {}),
        setBy: by.trim().toLowerCase(),
        updatedAt: now,
    };
}
const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;
// ---- The current household's home ----
let current;
const listeners = new Set();
/** Words of an address that must never leave the device: each part between commas, and the street without its number. */
export function homeWords(home) {
    if (!home)
        return [];
    const parts = home.address.split(',').map((p) => p.trim()).filter((p) => /\p{L}|\d{3,}/u.test(p));
    const streets = parts.map((p) => p.replace(/^\d+[a-z]?\s+/i, '')).filter((p) => p.length >= 4);
    return [home.address.trim(), ...parts, ...streets];
}
/**
 * The home every kit feature uses (`watchHousehold` calls it with the household's; `undefined` when
 * it has none). Also keeps its address out of everything sent to New Relic.
 */
export function setHome(home) {
    const next = home ? toHome(home) : undefined;
    if (JSON.stringify(next) === JSON.stringify(current))
        return;
    current = next;
    setSensitiveWords('home', homeWords(next));
    for (const listener of listeners)
        listener();
}
/** The current household's home, if it has set one. */
export function getHome() {
    return current;
}
/** Calls `listener` whenever the home changes; returns the unsubscribe. */
export function onHomeChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
/** The home as a point for `searchPlaces({ near })` and `distanceKm`. */
export function homePoint(home = current) {
    return home ? { lat: home.lat, lon: home.lng } : undefined;
}
/** The device's IANA zone; "UTC" when the runtime can't say. */
export function deviceTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    catch {
        return 'UTC';
    }
}
/**
 * The household's zone: the home's when set, else `fallback` (a device's, or a zone a server was
 * given). Reminders and calendar feeds use it, so "9:00" is 9:00 at home wherever the phone is.
 */
export function householdTimeZone(home = current, fallback = deviceTimeZone()) {
    return home?.timeZone && TIME_ZONE.test(home.timeZone) ? home.timeZone : fallback;
}
/** Straight-line km from home to a point; undefined without a home. */
export function distanceFromHome(point, home = current) {
    if (!home || !point)
        return undefined;
    const lon = 'lon' in point ? point.lon : point.lng;
    if (!finite(point.lat, 90) || !finite(lon, 180))
        return undefined;
    return distanceKm({ lat: home.lat, lon: home.lng }, { lat: point.lat, lon });
}
/** "2.3 mi from home" ("3,7 km van huis"); undefined without a home or a point. */
export function formatFromHome(point, { home = current, locale } = {}) {
    const km = distanceFromHome(point, home);
    return km === undefined ? undefined : kt('home.fromHome', { distance: formatDistance(km, locale) });
}
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 10_000;
const cache = new Map();
const CACHE_MAX = 100;
/** One Nominatim call, rate-limited with `./places` and cached by URL for the session. */
async function nominatim(path, params, { fetch: fetchImpl = fetch, lang = getLang() }) {
    const url = new URL(`${NOMINATIM}/${path}`);
    url.search = new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1', 'accept-language': lang }).toString();
    const key = url.href;
    const hit = cache.get(key);
    if (hit)
        return hit;
    const request = (async () => {
        await nominatimTurn();
        const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok)
            throw new Error(`[${res.status}] Address search failed`);
        return (await res.json());
    })();
    cache.set(key, request);
    // A failure is not remembered, so trying again asks again.
    request.catch(() => cache.delete(key));
    if (cache.size > CACHE_MAX)
        cache.delete(cache.keys().next().value);
    return request;
}
/** For tests: forgets cached answers. */
export function clearGeocodeCache() {
    cache.clear();
}
const placeIdOf = (p) => (p.osm_type && p.osm_id ? `${p.osm_type}/${p.osm_id}` : undefined);
/** "12 Example Lane, Springfield, IL 62701": street, town, region and postcode, without county or country. */
export function shortAddress(p) {
    const a = p.address;
    if (!a)
        return p.display_name;
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality;
    const region = [a.state, a.postcode].filter(Boolean).join(' ');
    const line = [street, town, region].filter(Boolean).join(', ');
    return line || p.display_name;
}
/** The neighbourhood's name, its town and region: "Riverside, Springfield, Illinois". */
export function neighbourhoodName(p) {
    const a = p.address ?? {};
    const area = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.hamlet;
    const town = a.city ?? a.town ?? a.village ?? a.municipality;
    return [area, town, a.state].filter(Boolean).join(', ') || p.display_name.split(',').slice(-4).join(',').trim();
}
const candidateOf = (p) => ({
    address: shortAddress(p).slice(0, HOME_LIMITS.address),
    lat: Number(p.lat),
    lng: Number(p.lon),
    ...(placeIdOf(p) ? { placeId: placeIdOf(p) } : {}),
});
/**
 * Up to five addresses matching the text ("12 Example Lane Springfield"), best first. Run it from a
 * Search button, not as the person types: Nominatim forbids autocomplete.
 */
export async function geocodeAddress(text, options = {}) {
    const q = text.trim();
    if (!q)
        return [];
    const found = await nominatim('search', { q, limit: '5' }, options);
    return found.map(candidateOf).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}
/** The address at a point (a phone's position); null when the map has nothing there. */
export async function reverseGeocode(point, options = {}) {
    const found = await nominatim('reverse', { lat: point.lat.toFixed(6), lon: point.lng.toFixed(6), zoom: '18' }, options);
    if (!found || found.error || !found.lat)
        return null;
    return { ...candidateOf(found), lat: point.lat, lng: point.lng };
}
/**
 * The neighbourhood around a point instead of the house: its name and centre (Nominatim's area at
 * suburb level). Where the map has no such area, the point rounded to about a kilometre.
 */
export async function approximateHome(point, options = {}) {
    const found = await nominatim('reverse', { lat: point.lat.toFixed(6), lon: point.lng.toFixed(6), zoom: '14' }, options).catch(() => null);
    const area = found && !found.error && found.lat && (found.place_rank ?? 30) <= 22;
    const lat = area ? Number(found.lat) : point.lat;
    const lng = area ? Number(found.lon) : point.lng;
    return {
        address: (found && !found.error ? neighbourhoodName(found) : kt('home.nearHere')).slice(0, HOME_LIMITS.address),
        lat: round(lat, area ? 4 : 2),
        lng: round(lng, area ? 4 : 2),
        approximate: true,
    };
}
export class PositionUnavailable extends Error {
    problem;
    constructor(problem) {
        super(kt(`home.position.${problem}`));
        this.problem = problem;
        this.name = 'PositionUnavailable';
    }
}
/** The device's position (asks for location permission the first time). Throws `PositionUnavailable`. */
export function currentPosition({ timeout = 15_000 } = {}) {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo)
        return Promise.reject(new PositionUnavailable('unsupported'));
    return new Promise((resolve, reject) => geo.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), (e) => reject(new PositionUnavailable(e.code === 1 ? 'denied' : 'unavailable')), { enableHighAccuracy: true, timeout, maximumAge: 60_000 }));
}
const TILE = 256;
/**
 * OpenStreetMap tiles covering a `width`×`height` map centred on the point at `zoom`. Free under
 * the OSM tile policy for light use with attribution ("© OpenStreetMap contributors" linked to
 * openstreetmap.org/copyright), which `HomeMap` shows.
 */
export function mapTiles(point, zoom, width, height) {
    const n = 2 ** zoom;
    const x = ((point.lng + 180) / 360) * n;
    const latRad = (Math.max(-85, Math.min(85, point.lat)) * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const originX = x * TILE - width / 2;
    const originY = y * TILE - height / 2;
    const tiles = [];
    for (let ty = Math.floor(originY / TILE); ty * TILE < originY + height; ty++) {
        if (ty < 0 || ty >= n)
            continue;
        for (let tx = Math.floor(originX / TILE); tx * TILE < originX + width; tx++) {
            const wrapped = ((tx % n) + n) % n;
            tiles.push({ url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`, left: Math.round(tx * TILE - originX), top: Math.round(ty * TILE - originY) });
        }
    }
    return tiles;
}
/** The point on openstreetmap.org. */
export function osmMapUrl(point, zoom = 17) {
    return `https://www.openstreetmap.org/?mlat=${point.lat.toFixed(5)}&mlon=${point.lng.toFixed(5)}#map=${zoom}/${point.lat.toFixed(5)}/${point.lng.toFixed(5)}`;
}
