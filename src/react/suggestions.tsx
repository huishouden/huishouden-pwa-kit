/**
 * New things found in one of the member's Google services that belong in the app (calendar events,
 * Google Tasks), offered as suggestions: looked for on open, when the signed-in member changes and
 * when the app comes back into view (at most every `rescanMs`), only with a token this device
 * already has (it never opens Google's window), minus what the app already has and what this member
 * said "Not this one" to. `useCalendarSuggestions` and Google Tasks suggestions are built on it.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { ghostButton, secondaryButton } from './ui';
import type { Auth } from 'firebase/auth';
import { SUGGESTION_RESCAN_MS, dismissId, dismissedIds } from '../suggestions';

export { SUGGESTION_RESCAN_MS, dismissId, dismissedIds };

const GUEST = 'guest';

export interface SuggestionsOptions<T> {
  auth: Auth;
  /** Where dismissals are kept, per app and service: "pet-calendar", "tasks-google-tasks". */
  source: string;
  /** The token this device already has for the service, or null (never asks). */
  cachedToken: () => string | null;
  /** Fetches the candidates with that token. A failure is silent; the next look tries again. */
  look: (token: string) => Promise<T[]>;
  idOf: (item: T) => string;
  /** Already in the app. */
  isImported: (item: T) => boolean;
  /** Order of the suggestions (default: as `look` returned them). */
  order?: (a: T, b: T) => number;
  rescanMs?: number;
}

export interface SuggestionsState<T> {
  /** This device has a token, so a look can run without asking. False: no suggestions. */
  canScan: boolean;
  /** Not in the app, not dismissed by this member, each once. */
  suggestions: T[];
  /** "Not this one": never suggest it to this member again, on this device. */
  dismiss: (item: T) => void;
  /** Look again now. */
  scan: () => Promise<void>;
}

/**
 * Mount it once in the app's shell, not in a screen that comes and goes, so switching screens does
 * not look again. `look`, `idOf`, `isImported` and `order` may change on every render.
 */
export function useSuggestions<T>({ auth, source, cachedToken, look, idOf, isImported, order, rescanMs = SUGGESTION_RESCAN_MS }: SuggestionsOptions<T>): SuggestionsState<T> {
  const [member, setMember] = useState(() => auth.currentUser?.uid ?? GUEST);
  const [canScan, setCanScan] = useState(false);
  const [found, setFound] = useState<T[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => dismissedIds(source, member));
  const lastScan = useRef(0);
  const seq = useRef(0);
  const latest = useRef({ cachedToken, look });
  latest.current = { cachedToken, look };

  const scan = useCallback(async () => {
    const token = latest.current.cachedToken();
    setCanScan(!!token);
    const mine = ++seq.current;
    if (!token) {
      setFound([]);
      return;
    }
    lastScan.current = Date.now();
    try {
      const items = await latest.current.look(token);
      if (mine === seq.current) setFound(items);
    } catch {
      // A revoked or expired token is forgotten where it failed; the next look starts over.
      if (mine === seq.current) setCanScan(!!latest.current.cachedToken());
    }
  }, []);

  // On open, then again whenever the signed-in member changes (a restored session arrives after mount).
  const looked = useRef<string | null>(null);
  useEffect(() => {
    const lookFor = (who: string) => {
      if (looked.current === who) return;
      looked.current = who;
      setMember(who);
      setDismissed(dismissedIds(source, who));
      setFound([]);
      void scan();
    };
    lookFor(auth.currentUser?.uid ?? GUEST);
    return auth.onAuthStateChanged((user) => lookFor(user?.uid ?? GUEST));
  }, [auth, source, scan]);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastScan.current >= rescanMs) void scan();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [scan, rescanMs]);

  const dismiss = useCallback((item: T) => setDismissed(dismissId(source, member, idOf(item))), [source, member, idOf]);
  const skip = new Set(dismissed);
  const seen = new Set<string>();
  const fresh = canScan
    ? found.filter((item) => {
        const id = idOf(item);
        if (seen.has(id) || skip.has(id) || isImported(item)) return false;
        seen.add(id);
        return true;
      })
    : [];
  return { canScan, suggestions: order ? [...fresh].sort(order) : fresh, dismiss, scan };
}

/** How long an added event stays hidden waiting for its record; a failed save brings it back. */
export const ADDED_HIDE_MS = 10_000;

/**
 * The calm one-line card for new things from a Google service: "<lead>: <title> · <detail>" with
 * Add and Not this one, and "+2 more" opening the rest as a list. Renders nothing without
 * suggestions. `onAdd` is the app's own import; the item leaves the card at once and stays gone
 * when its record arrives (if none arrives within ten seconds, the save failed and it comes back).
 * After either button, focus stays on the card.
 */
export function SuggestionsCard<T>({ suggestions, idOf, titleOf, detailOf, lead, label, moreLabel, icon, onAdd, onDismiss, addAs }: {
  suggestions: T[];
  idOf: (item: T) => string;
  titleOf: (item: T) => string;
  /** After the title: when it is, which list it came from; nothing for no detail. */
  detailOf: (item: T) => string | null;
  /** "New in your calendar". */
  lead: string;
  /** The card's accessible name, e.g. "New in your calendar". */
  label: string;
  /** The list of the rest, e.g. "More new calendar events". */
  moreLabel: string;
  icon: ReactNode;
  onAdd: (item: T) => void;
  onDismiss: (item: T) => void;
  /** An item whose add button does something else ("Use as prep"): its words and accessible name. Add otherwise. */
  addAs?: (item: T) => { label: string; ariaLabel: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<ReadonlyMap<string, number>>(() => new Map());
  const card = useRef<HTMLElement>(null);
  const listId = useId();

  // Forget added ids once their event is gone from the suggestions (imported, or another member's
  // list), or once the wait for the record is over.
  const ids = suggestions.map(idOf).join('\n');
  useEffect(() => {
    if (added.size === 0) return;
    const present = new Set(ids.split('\n'));
    const live = [...added].filter(([id, at]) => present.has(id) && Date.now() - at < ADDED_HIDE_MS);
    if (live.length !== added.size) {
      setAdded(new Map(live));
      return;
    }
    const next = Math.min(...live.map(([, at]) => at + ADDED_HIDE_MS)) - Date.now();
    const timer = setTimeout(() => setAdded((a) => new Map([...a].filter(([, at]) => Date.now() - at < ADDED_HIDE_MS))), Math.max(next, 0));
    return () => clearTimeout(timer);
  }, [ids, added]);

  const shown = suggestions.filter((m) => !added.has(idOf(m)));
  if (shown.length === 0) return null;
  const [first, ...rest] = shown;
  const keepFocus = () => setTimeout(() => card.current?.focus());
  const add = (m: T) => {
    setAdded((a) => new Map(a).set(idOf(m), Date.now()));
    onAdd(m);
    keepFocus();
  };
  const dismiss = (m: T) => {
    onDismiss(m);
    keepFocus();
  };
  const actions = (m: T, as = addAs?.(m)) => (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={ghostButton} onClick={() => dismiss(m)} aria-label={`Not this one: ${titleOf(m)}`}>
        Not this one
      </button>
      <button type="button" className={secondaryButton} onClick={() => add(m)} aria-label={as?.ariaLabel ?? `Add ${titleOf(m)}`}>
        {as ? as.label : <><Plus size={18} /> Add</>}
      </button>
    </div>
  );
  return (
    <section ref={card} tabIndex={-1} className="rounded-2xl border border-line bg-surface px-4 py-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-forest-200" aria-label={label}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {icon}
        <p role="status" className="min-w-0 flex-1 text-base text-ink-soft [overflow-wrap:anywhere]">
          {lead}: <span className="font-medium text-ink">{titleOf(first)}</span>
          {detailOf(first) && <span className="text-muted"> · {detailOf(first)}</span>}
        </p>
        {rest.length > 0 && (
          <button type="button" className={ghostButton} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={listId}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />} +{rest.length} more
          </button>
        )}
        {actions(first)}
      </div>
      {open && rest.length > 0 && (
        <ul id={listId} className="mt-1 divide-y divide-line border-t border-line" aria-label={moreLabel}>
          {rest.map((m) => (
            <li key={idOf(m)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-8">
              <p className="min-w-0 flex-1 text-base [overflow-wrap:anywhere]">
                <span className="font-medium text-ink">{titleOf(m)}</span>
                {detailOf(m) && <span className="text-muted"> · {detailOf(m)}</span>}
              </p>
              {actions(m)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
