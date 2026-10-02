/**
 * Calendar search in React: the one-search-at-a-time hook, "Find in my calendar" inside a dialog,
 * the import dialog that lists events not yet in the app, the linked-event row and the one-line
 * hint before Google's first permission window. Built on `findCalendarEvents` in `../calendar`.
 *
 * `app` is the app's short name ("Baby"): it words the hint and keys whether this browser has
 * already been asked (`<app>-calendar-allowed` in localStorage).
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Auth } from 'firebase/auth';
import { CalendarSearch, ExternalLink, MapPin, Plus, X } from 'lucide-react';
import { calendarError, findCalendarEvents, notImported, type CalendarMatch, type FindEventsOptions, type ImportedRecord } from '../calendar';
import { formatDayShort, formatTime } from '../time';
import { Dialog, ErrorNotice, ghostButton, iconButton, linkClass, primaryButton, secondaryButton } from './ui';

const askedKey = (app: string) => `${app.toLowerCase()}-calendar-allowed`;

/**
 * Whether calendar search can run: signed in, or a browser test standing in for Google with
 * `window.__mockCalendarEvents` (signed-out sample mode has no account to read).
 */
export function calendarAvailable(user: unknown): boolean {
  return !!user || (typeof window !== 'undefined' && '__mockCalendarEvents' in window);
}

/** Google has already asked this browser for calendar access once. */
export const calendarAsked = (app: string) => localStorage.getItem(askedKey(app)) === '1';

export type CalendarSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; matches: CalendarMatch[] }
  | { status: 'error'; message: string };

/**
 * One calendar search at a time; a newer search wins. Call `run` straight from a click: the first
 * search opens Google's permission window, which browsers only allow in answer to a tap.
 */
export function useCalendarSearch(auth: Auth, app: string) {
  const [state, setState] = useState<CalendarSearchState>({ status: 'idle' });
  const seq = useRef(0);
  const run = useCallback(
    async (queries: string | string[], options?: FindEventsOptions) => {
      const mine = ++seq.current;
      setState({ status: 'searching' });
      try {
        const matches = await findCalendarEvents(auth, queries, options);
        localStorage.setItem(askedKey(app), '1');
        if (mine === seq.current) setState({ status: 'done', matches });
      } catch (e) {
        if (mine === seq.current) setState({ status: 'error', message: calendarError(e) });
      }
    },
    [auth, app],
  );
  const reset = useCallback(() => {
    seq.current++;
    setState({ status: 'idle' });
  }, []);
  return { state, run, reset };
}

/** "Sun, Oct 19, 9:00 AM · Family", in the device's locale. */
export function matchWhen(m: CalendarMatch): string {
  return `${formatDayShort(m.start)}${m.allDay ? ', all day' : `, ${formatTime(m.start)}`} · ${m.calendarName}`;
}

/** One line before Google's first permission window, or why the search is off. */
export function CalendarHint({ app, available }: { app: string; available: boolean }) {
  if (!available) return <p className="text-base text-stone-600">Sign in to search your calendar.</p>;
  if (!calendarAsked(app)) return <p className="text-base text-stone-600">Google will ask once to let {app} read your calendar. {app} never changes it.</p>;
  return null;
}

/**
 * "Find in my calendar" inside a dialog: searches for `query` (what the person typed as the title)
 * and hands the picked event back. The first search opens Google's permission window, so it runs on the tap.
 */
export function CalendarFind({ auth, app, query, available, onPick }: { auth: Auth; app: string; query: string; available: boolean; onPick: (m: CalendarMatch) => void }) {
  const search = useCalendarSearch(auth, app);
  const q = query.trim();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`${ghostButton} bg-forest-50 text-forest-700 hover:bg-forest-100 disabled:opacity-50`}
        disabled={!available || !q || search.state.status === 'searching'}
        onClick={() => void search.run(query)}
      >
        <CalendarSearch size={18} /> {search.state.status === 'searching' ? 'Searching your calendars' : 'Find in my calendar'}
      </button>
      <CalendarHint app={app} available={available} />
      {search.state.status === 'error' && <ErrorNotice message={search.state.message} onRetry={() => void search.run(query)} />}
      {search.state.status === 'done' && search.state.matches.length === 0 && (
        <p role="status" className="text-base text-stone-600">
          No events matching "{q}" in your calendars from last week to a year ahead.
        </p>
      )}
      {search.state.status === 'done' && search.state.matches.length > 0 && (
        <ul className="grid gap-1.5" aria-label="Calendar matches">
          {search.state.matches.map((m) => (
            <li key={`${m.id}-${m.start}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(m);
                  search.reset();
                }}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-forest-500 hover:bg-forest-50"
              >
                <span className="block font-medium text-stone-800 [overflow-wrap:anywhere]">{m.title}</span>
                <span className="block text-sm text-stone-600">{matchWhen(m)}</span>
                {m.location && (
                  <span className="flex items-start gap-1 text-sm text-stone-600 [overflow-wrap:anywhere]">
                    <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {m.location}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The linked calendar event inside a dialog, with a way to unlink it. */
export function LinkedEvent({ link, onUnlink }: { link?: string; onUnlink: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-forest-50 py-0.5 pr-1 pl-3 text-base text-stone-700">
      <span className="min-w-0 flex-1">From your calendar.</span>
      {link && (
        <a className={linkClass} href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> Open in Calendar
        </a>
      )}
      <button type="button" className={iconButton} aria-label="Unlink from the calendar event" onClick={onUnlink}>
        <X size={18} />
      </button>
    </div>
  );
}

/**
 * Import from calendar: the theme scan's events that are not in the app yet, each with Add, and
 * Add all. `records` are the app's own (appointments, log entries); an added event leaves the
 * list as soon as its record arrives.
 */
export function CalendarImportDialog({ state, records, intro, noneFound, allImported, onRetry, onAdd, onClose, children }: {
  state: CalendarSearchState;
  records: ImportedRecord[];
  /** What the scan looks for: "Prenatal, midwife, ultrasound and other baby events from last week to a year ahead." */
  intro: string;
  /** "No baby events found in your calendars." */
  noneFound: string;
  /** "Every baby event in your calendar is already in Baby." */
  allImported: string;
  onRetry: () => void;
  onAdd: (matches: CalendarMatch[]) => void;
  onClose: () => void;
  /** Shown above the events: an app's own suggestions from the same scan (Pet's birthdays). */
  children?: ReactNode;
}) {
  const fresh = state.status === 'done' ? notImported(state.matches, records) : [];
  return (
    <Dialog
      title="Import from calendar"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            Done
          </button>
          {fresh.length > 1 && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                onAdd(fresh);
                onClose();
              }}
            >
              Add all {fresh.length}
            </button>
          )}
        </>
      }
    >
      <p className="text-base text-stone-600">{intro}</p>
      {children}
      <div className="mt-4">
        {(state.status === 'searching' || state.status === 'idle') && (
          <p role="status" className="text-base text-stone-600">
            Searching your calendars
          </p>
        )}
        {state.status === 'error' && <ErrorNotice message={state.message} onRetry={onRetry} />}
        {state.status === 'done' && fresh.length === 0 && (
          <p role="status" className="text-base text-stone-600">
            {state.matches.length ? allImported : noneFound}
          </p>
        )}
        {fresh.length > 0 && (
          <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200" aria-label="Calendar events">
            {fresh.map((m) => (
              <li key={`${m.id}-${m.start}`} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-800 [overflow-wrap:anywhere]">{m.title}</p>
                  <p className="text-sm text-stone-600">{matchWhen(m)}</p>
                  {m.location && <p className="text-sm text-stone-600 [overflow-wrap:anywhere]">{m.location}</p>}
                </div>
                <button type="button" className={secondaryButton} onClick={() => onAdd([m])} aria-label={`Add ${m.title}`}>
                  <Plus size={18} /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
