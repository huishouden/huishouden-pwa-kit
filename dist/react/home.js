import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The household's home in React (`../home`): `useHome()` for any app, `HomeMap` for a small map of
 * it, and `HomeEditor`, the portal's "Home" section (search an address, or use this device's
 * location, optionally only the neighbourhood).
 */
import { useId, useState, useSyncExternalStore } from 'react';
import { Crosshair, ExternalLink, MapPin, Search } from 'lucide-react';
import { approximateHome, currentPosition, geocodeAddress, getHome, mapTiles, onHomeChange, osmMapUrl, PositionUnavailable, reverseGeocode, } from '../home';
import { useKitT } from './i18n';
import { Checkbox, ghostButton, inputClass, linkClass, primaryButton, secondaryButton } from './ui';
const subscribe = (notify) => onHomeChange(notify);
const none = () => undefined;
/** The current household's home (set by `watchHousehold`); re-renders when it changes. */
export function useHome() {
    return useSyncExternalStore(subscribe, getHome, none);
}
const MAP_WIDTH = 640;
const MAP_HEIGHT = 176;
/**
 * A small, still map of a point from OpenStreetMap's tiles (free, with the attribution their policy
 * asks for), a pin on the house or a circle on an approximate one, and a link to the full map.
 */
export function HomeMap({ point, label, approximate }) {
    const kt = useKitT();
    const zoom = approximate ? 14 : 16;
    const tiles = mapTiles(point, zoom, MAP_WIDTH, MAP_HEIGHT);
    return (_jsxs("figure", { className: "relative h-44 w-full overflow-hidden rounded-xl border border-line bg-stone-100 dark:bg-forest-800", role: "img", "aria-label": kt('home.map', { address: label }), children: [_jsxs("div", { className: "absolute top-0 left-1/2", style: { width: MAP_WIDTH, height: MAP_HEIGHT, transform: 'translateX(-50%)' }, "aria-hidden": "true", children: [tiles.map((t) => (_jsx("img", { src: t.url, alt: "", width: 256, height: 256, loading: "lazy", decoding: "async", draggable: false, className: "absolute max-w-none select-none", style: { left: t.left, top: t.top } }, t.url))), approximate ? (_jsx("span", { className: "absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest-600 bg-forest-500/20", style: { left: MAP_WIDTH / 2, top: MAP_HEIGHT / 2 } })) : (_jsx(MapPin, { size: 36, strokeWidth: 2.25, className: "absolute -translate-x-1/2 -translate-y-full fill-forest-600 text-white drop-shadow", style: { left: MAP_WIDTH / 2, top: MAP_HEIGHT / 2 } }))] }), _jsx("figcaption", { className: "absolute right-0 bottom-0 rounded-tl-lg bg-white/85 px-1.5 py-0.5 text-xs text-stone-700", children: _jsx("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener noreferrer", className: "underline", children: kt('home.attribution') }) })] }));
}
/**
 * The household's home: shown with a map, and for admins and members found by address search or
 * from this device's location, saved whole or, with "Approximate only", as its neighbourhood.
 */
export function HomeEditor({ home, canChange, onSave, onRemove, nameOf = (e) => e, geocode }) {
    const kt = useKitT();
    const id = useId();
    const [editing, setEditing] = useState(false);
    const [query, setQuery] = useState('');
    const [find, setFind] = useState({ status: 'idle' });
    const [picked, setPicked] = useState(null);
    const [approximate, setApproximate] = useState(home?.approximate === true);
    const [saving, setSaving] = useState(false);
    const open = editing || (!home && canChange);
    const search = async (e) => {
        e.preventDefault();
        const q = query.trim();
        if (!q)
            return;
        setFind({ status: 'busy', doing: 'search' });
        setPicked(null);
        try {
            const results = await geocodeAddress(q, geocode);
            setFind({ status: 'found', query: q, results });
            if (results.length === 1)
                setPicked(results[0]);
        }
        catch {
            setFind({ status: 'error', message: kt('home.unavailable') });
        }
    };
    const locate = async () => {
        setFind({ status: 'busy', doing: 'locate' });
        setPicked(null);
        try {
            const at = await currentPosition();
            const found = await reverseGeocode(at, geocode).catch(() => null);
            setPicked(found ?? { address: kt('home.nearHere'), lat: at.lat, lng: at.lng });
            setFind({ status: 'idle' });
        }
        catch (e) {
            setFind({ status: 'error', message: e instanceof PositionUnavailable ? e.message : kt('home.unavailable') });
        }
    };
    const save = async () => {
        if (!picked || saving)
            return;
        setSaving(true);
        try {
            await onSave(approximate ? await approximateHome(picked, geocode) : picked);
            setEditing(false);
            setPicked(null);
            setQuery('');
            setFind({ status: 'idle' });
        }
        finally {
            setSaving(false);
        }
    };
    const busy = find.status === 'busy';
    return (_jsxs("div", { className: "mt-5 border-t border-line pt-4", "aria-labelledby": `${id}-title`, children: [_jsx("h3", { id: `${id}-title`, className: "mb-1 text-lg font-semibold", children: kt('home.title') }), _jsx("p", { className: "mb-3 text-sm text-muted", children: kt('home.hint') }), home && !open && (_jsxs("div", { className: "space-y-2", children: [_jsx(HomeMap, { point: home, label: home.address, approximate: home.approximate }), _jsxs("p", { className: "flex items-start gap-1.5 text-base", children: [_jsx(MapPin, { size: 18, className: "mt-1 shrink-0 text-muted", "aria-hidden": "true" }), _jsx("span", { className: "[overflow-wrap:anywhere]", "data-testid": "home-address", children: home.address })] }), home.approximate && _jsx("p", { className: "text-sm text-muted", children: kt('home.approximateNote') }), _jsx("p", { className: "text-sm text-muted", children: [home.timeZone && kt('home.timeZone', { zone: home.timeZone }), home.setBy && kt('home.setBy', { name: nameOf(home.setBy) })].filter(Boolean).join(' · ') }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [canChange && (_jsx("button", { type: "button", className: secondaryButton, onClick: () => {
                                    setApproximate(home.approximate === true);
                                    setEditing(true);
                                }, children: kt('home.change') })), _jsxs("a", { className: linkClass, href: osmMapUrl(home, home.approximate ? 14 : 17), target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 18, "aria-hidden": "true" }), " ", kt('home.openMap')] }), canChange && (_jsx("button", { type: "button", className: `${ghostButton} text-error`, onClick: () => {
                                    if (confirm(kt('home.removeConfirm')))
                                        void onRemove();
                                }, children: kt('common.remove') }))] })] })), !home && !canChange && _jsx("p", { className: "text-muted", children: kt('home.none') }), !canChange && _jsx("p", { className: "mt-2 text-sm text-muted", children: kt('home.onlyStaff') }), open && (_jsxs("div", { className: "space-y-3", children: [_jsxs("form", { className: "flex flex-wrap gap-2", onSubmit: search, role: "search", children: [_jsx("label", { htmlFor: `${id}-q`, className: "sr-only", children: kt('home.address') }), _jsx("input", { id: `${id}-q`, className: `${inputClass} min-w-[220px] flex-1`, placeholder: kt('home.searchPlaceholder'), value: query, maxLength: 300, autoComplete: "street-address", onChange: (e) => setQuery(e.target.value) }), _jsxs("button", { type: "submit", className: primaryButton, disabled: busy || !query.trim(), children: [_jsx(Search, { size: 18, "aria-hidden": "true" }), " ", find.status === 'busy' && find.doing === 'search' ? kt('home.searching') : kt('common.search')] })] }), _jsxs("button", { type: "button", className: secondaryButton, disabled: busy, onClick: () => void locate(), children: [_jsx(Crosshair, { size: 18, "aria-hidden": "true" }), " ", find.status === 'busy' && find.doing === 'locate' ? kt('home.locating') : kt('home.useLocation')] }), _jsxs("div", { "aria-live": "polite", children: [find.status === 'error' && (_jsx("p", { role: "alert", className: "text-error", children: find.message })), find.status === 'found' && find.results.length === 0 && _jsx("p", { role: "status", children: kt('home.noResults', { query: find.query }) }), find.status === 'found' && find.results.length > 1 && (_jsx("ul", { className: "grid gap-1.5", "aria-label": kt('home.results'), children: find.results.map((r) => (_jsx("li", { children: _jsx("button", { type: "button", "aria-pressed": picked === r, onClick: () => setPicked(r), className: `w-full rounded-xl border px-3 py-2 text-left [overflow-wrap:anywhere] hover:border-forest-500 hover:bg-tint ${picked === r ? 'border-forest-600 bg-tint' : 'border-line'}`, children: r.address }) }, `${r.placeId ?? ''}|${r.lat}|${r.lng}`))) }))] }), picked && (_jsxs("div", { className: "space-y-2", children: [_jsx(HomeMap, { point: picked, label: picked.address, approximate: approximate }), _jsxs("p", { className: "flex items-start gap-1.5", "data-testid": "home-picked", children: [_jsx(MapPin, { size: 18, className: "mt-1 shrink-0 text-muted", "aria-hidden": "true" }), _jsx("span", { className: "[overflow-wrap:anywhere]", children: picked.address })] })] })), _jsxs("div", { children: [_jsx(Checkbox, { checked: approximate, onChange: setApproximate, children: kt('home.approximate') }), _jsx("p", { className: "mt-1 text-sm text-muted", children: kt('home.approximateHint') })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: primaryButton, disabled: !picked || saving, onClick: () => void save(), children: saving ? kt('home.saving') : kt('home.save') }), home && (_jsx("button", { type: "button", className: ghostButton, onClick: () => {
                                    setEditing(false);
                                    setPicked(null);
                                    setFind({ status: 'idle' });
                                }, children: kt('common.cancel') }))] })] }))] }));
}
