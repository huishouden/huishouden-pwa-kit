/**
 * The household's home in React (`../home`): `useHome()` for any app, `HomeMap` for a small map of
 * it, and `HomeEditor`, the portal's "Home" section (search an address, or use this device's
 * location, optionally only the neighbourhood).
 */
import { useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Crosshair, ExternalLink, MapPin, Search } from 'lucide-react';
import {
  approximateHome,
  currentPosition,
  geocodeAddress,
  getHome,
  mapTiles,
  onHomeChange,
  osmMapUrl,
  PositionUnavailable,
  reverseGeocode,
  type GeocodeOptions,
  type HomeCandidate,
  type HouseholdHome,
} from '../home';
import { useKitT } from './i18n';
import { Checkbox, ghostButton, inputClass, linkClass, primaryButton, secondaryButton } from './ui';

const subscribe = (notify: () => void) => onHomeChange(notify);
const none = () => undefined;

/** The current household's home (set by `watchHousehold`); re-renders when it changes. */
export function useHome(): HouseholdHome | undefined {
  return useSyncExternalStore(subscribe, getHome, none);
}

const MAP_WIDTH = 640;
const MAP_HEIGHT = 176;

/**
 * A small, still map of a point from OpenStreetMap's tiles (free, with the attribution their policy
 * asks for), a pin on the house or a circle on an approximate one, and a link to the full map.
 */
export function HomeMap({ point, label, approximate }: { point: { lat: number; lng: number }; label: string; approximate?: boolean }) {
  const kt = useKitT();
  const zoom = approximate ? 14 : 16;
  const tiles = mapTiles(point, zoom, MAP_WIDTH, MAP_HEIGHT);
  return (
    <figure className="relative h-44 w-full overflow-hidden rounded-xl border border-line bg-stone-100 dark:bg-forest-800" role="img" aria-label={kt('home.map', { address: label })}>
      <div className="absolute top-0 left-1/2" style={{ width: MAP_WIDTH, height: MAP_HEIGHT, transform: 'translateX(-50%)' }} aria-hidden="true">
        {tiles.map((t) => (
          <img key={t.url} src={t.url} alt="" width={256} height={256} loading="lazy" decoding="async" draggable={false} className="absolute max-w-none select-none" style={{ left: t.left, top: t.top }} />
        ))}
        {approximate ? (
          <span className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest-600 bg-forest-500/20" style={{ left: MAP_WIDTH / 2, top: MAP_HEIGHT / 2 }} />
        ) : (
          <MapPin size={36} strokeWidth={2.25} className="absolute -translate-x-1/2 -translate-y-full fill-forest-600 text-white drop-shadow" style={{ left: MAP_WIDTH / 2, top: MAP_HEIGHT / 2 }} />
        )}
      </div>
      <figcaption className="absolute right-0 bottom-0 rounded-tl-lg bg-white/85 px-1.5 py-0.5 text-xs text-stone-700">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          {kt('home.attribution')}
        </a>
      </figcaption>
    </figure>
  );
}

type Find =
  | { status: 'idle' }
  | { status: 'busy'; doing: 'search' | 'locate' }
  | { status: 'found'; query: string; results: HomeCandidate[] }
  | { status: 'error'; message: string };

export interface HomeEditorProps {
  home?: HouseholdHome;
  /** Admins and members; helpers and kids see the address only. */
  canChange: boolean;
  onSave: (home: HomeCandidate) => Promise<void>;
  onRemove: () => Promise<void>;
  /** A member's name for "Set by"; the email when not given. */
  nameOf?: (email: string) => string;
  /** For tests: stands in for the network. */
  geocode?: GeocodeOptions;
}

/**
 * The household's home: shown with a map, and for admins and members found by address search or
 * from this device's location, saved whole or, with "Approximate only", as its neighbourhood.
 */
export function HomeEditor({ home, canChange, onSave, onRemove, nameOf = (e) => e, geocode }: HomeEditorProps) {
  const kt = useKitT();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [find, setFind] = useState<Find>({ status: 'idle' });
  const [picked, setPicked] = useState<HomeCandidate | null>(null);
  const [approximate, setApproximate] = useState(home?.approximate === true);
  const [saving, setSaving] = useState(false);
  const open = editing || (!home && canChange);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setFind({ status: 'busy', doing: 'search' });
    setPicked(null);
    try {
      const results = await geocodeAddress(q, geocode);
      setFind({ status: 'found', query: q, results });
      if (results.length === 1) setPicked(results[0]);
    } catch {
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
    } catch (e) {
      setFind({ status: 'error', message: e instanceof PositionUnavailable ? e.message : kt('home.unavailable') });
    }
  };

  const save = async () => {
    if (!picked || saving) return;
    setSaving(true);
    try {
      await onSave(approximate ? await approximateHome(picked, geocode) : picked);
      setEditing(false);
      setPicked(null);
      setQuery('');
      setFind({ status: 'idle' });
    } finally {
      setSaving(false);
    }
  };

  const busy = find.status === 'busy';

  return (
    <div className="mt-5 border-t border-line pt-4" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="mb-1 text-lg font-semibold">
        {kt('home.title')}
      </h3>
      <p className="mb-3 text-sm text-muted">{kt('home.hint')}</p>

      {home && !open && (
        <div className="space-y-2">
          <HomeMap point={home} label={home.address} approximate={home.approximate} />
          <p className="flex items-start gap-1.5 text-base">
            <MapPin size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
            <span className="[overflow-wrap:anywhere]" data-testid="home-address">
              {home.address}
            </span>
          </p>
          {home.approximate && <p className="text-sm text-muted">{kt('home.approximateNote')}</p>}
          <p className="text-sm text-muted">
            {[home.timeZone && kt('home.timeZone', { zone: home.timeZone }), home.setBy && kt('home.setBy', { name: nameOf(home.setBy) })].filter(Boolean).join(' · ')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canChange && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setApproximate(home.approximate === true);
                  setEditing(true);
                }}
              >
                {kt('home.change')}
              </button>
            )}
            <a className={linkClass} href={osmMapUrl(home, home.approximate ? 14 : 17)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} aria-hidden="true" /> {kt('home.openMap')}
            </a>
            {canChange && (
              <button
                type="button"
                className={`${ghostButton} text-error`}
                onClick={() => {
                  if (confirm(kt('home.removeConfirm'))) void onRemove();
                }}
              >
                {kt('common.remove')}
              </button>
            )}
          </div>
        </div>
      )}

      {!home && !canChange && <p className="text-muted">{kt('home.none')}</p>}
      {!canChange && <p className="mt-2 text-sm text-muted">{kt('home.onlyStaff')}</p>}

      {open && (
        <div className="space-y-3">
          <form className="flex flex-wrap gap-2" onSubmit={search} role="search">
            <label htmlFor={`${id}-q`} className="sr-only">
              {kt('home.address')}
            </label>
            <input
              id={`${id}-q`}
              className={`${inputClass} min-w-[220px] flex-1`}
              placeholder={kt('home.searchPlaceholder')}
              value={query}
              maxLength={300}
              autoComplete="street-address"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className={primaryButton} disabled={busy || !query.trim()}>
              <Search size={18} aria-hidden="true" /> {find.status === 'busy' && find.doing === 'search' ? kt('home.searching') : kt('common.search')}
            </button>
          </form>
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => void locate()}>
            <Crosshair size={18} aria-hidden="true" /> {find.status === 'busy' && find.doing === 'locate' ? kt('home.locating') : kt('home.useLocation')}
          </button>

          <div aria-live="polite">
            {find.status === 'error' && (
              <p role="alert" className="text-error">
                {find.message}
              </p>
            )}
            {find.status === 'found' && find.results.length === 0 && <p role="status">{kt('home.noResults', { query: find.query })}</p>}
            {find.status === 'found' && find.results.length > 1 && (
              <ul className="grid gap-1.5" aria-label={kt('home.results')}>
                {find.results.map((r) => (
                  <li key={`${r.placeId ?? ''}|${r.lat}|${r.lng}`}>
                    <button
                      type="button"
                      aria-pressed={picked === r}
                      onClick={() => setPicked(r)}
                      className={`w-full rounded-xl border px-3 py-2 text-left [overflow-wrap:anywhere] hover:border-forest-500 hover:bg-tint ${picked === r ? 'border-forest-600 bg-tint' : 'border-line'}`}
                    >
                      {r.address}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {picked && (
            <div className="space-y-2">
              <HomeMap point={picked} label={picked.address} approximate={approximate} />
              <p className="flex items-start gap-1.5" data-testid="home-picked">
                <MapPin size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                <span className="[overflow-wrap:anywhere]">{picked.address}</span>
              </p>
            </div>
          )}

          <div>
            <Checkbox checked={approximate} onChange={setApproximate}>
              {kt('home.approximate')}
            </Checkbox>
            <p className="mt-1 text-sm text-muted">{kt('home.approximateHint')}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} disabled={!picked || saving} onClick={() => void save()}>
              {saving ? kt('home.saving') : kt('home.save')}
            </button>
            {home && (
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  setEditing(false);
                  setPicked(null);
                  setFind({ status: 'idle' });
                }}
              >
                {kt('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
