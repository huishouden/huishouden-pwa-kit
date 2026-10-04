/**
 * The Huishouden UI primitives for React apps (DESIGN.md "Components"): class strings for buttons,
 * inputs and cards, and the dialog, chip, field, toast-with-Undo, error notice, status pill,
 * checkbox, section tabs (a bottom bar on phones), member badge, "Sample data" banner every app shows, and
 * the suggestion chip (tap to add, long press to stop suggesting) with its `useLongPress`.
 *
 * Styled with Tailwind v4 on the kit's palette: import `@huishouden/pwa-kit/tailwind.css` after
 * `tailwindcss` in the app's stylesheet. It maps the theme (forest, cream, terracotta) and adds
 * these files to Tailwind's sources. Icons are lucide-react, like the apps'. Each has `dark:` styles
 * (DESIGN.md "Dark and ambient modes") that apply only under a `.dark` class, for apps with a dark setting.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Ellipsis, EyeOff, Plus, X, type LucideIcon } from 'lucide-react';
import { personColour, personInitial, personName } from '../people';
import { useKitT } from './i18n';

export const inputClass =
  'w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:bg-forest-900 dark:focus:ring-forest-700';

/** A select styled like the inputs. */
export const selectClass = `${inputClass} appearance-auto`;

export const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-on-primary transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50';

export const ghostButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-muted transition-colors duration-150 hover:bg-stone-100 dark:hover:bg-forest-700';

/** The second action next to a primary button. */
export const secondaryButton = `${ghostButton} border border-line bg-surface disabled:opacity-50`;

export const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-forest-700';

/** Footer button that deletes; the destructive action stays quiet until asked for. */
export const deleteButton = 'mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-error hover:bg-stone-100 dark:hover:bg-forest-700';

export const cardClass = 'rounded-2xl border border-line bg-surface shadow-sm';

export const overline = 'text-xs font-semibold uppercase tracking-wide text-muted';

/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export const linkClass =
  '-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-link underline-offset-4 transition-colors duration-150 hover:bg-tint hover:underline';

export function Chip({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
        active
          ? 'border-forest-700 bg-forest-700 text-white dark:border-forest-300 dark:bg-forest-300 dark:text-forest-900'
          : 'border-line bg-surface text-ink-soft hover:border-forest-400'
      }`}
    >
      {children}
    </button>
  );
}

/** How long a finger rests on something before it counts as a long press. */
export const LONG_PRESS_MS = 500;

/** Handlers to spread on an element so a long press or a right-click (or the keyboard's menu key) runs `onLongPress`. */
export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onClickCapture: (e: ReactMouseEvent) => void;
}

/**
 * A long press (touch or mouse, held still for `ms`) or a right-click runs `onLongPress`, and the
 * click that ends a long press is swallowed, so the element's own onClick runs only for a tap.
 * Moving more than 10px is a scroll, not a press. Pair the element with a visible way to reach the
 * same action: a long press is not discoverable on its own.
 */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS): LongPressHandlers {
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    onPointerDown: (e) => {
      fired.current = false;
      if (e.button !== 0) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        start.current = null;
        fired.current = true;
        latest.current();
      }, ms);
    },
    onPointerMove: (e) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      e.preventDefault();
      cancel();
      // A long press on Android also raises contextmenu; the press already ran it.
      if (!fired.current) latest.current();
    },
    onClickCapture: (e) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

/**
 * Something the app learned and offers back, "tap to add": a pill that runs `onPick` on a tap. A
 * long press or right-click opens a small sheet with "Don't suggest <label>"; with `editing` an ×
 * beside the label does the same at once, for a visible way in (an "Edit" link by the shelf's
 * heading). Every target is at least 44px. Removing is the app's (with its Undo).
 */
export function SuggestionChip({
  label,
  onPick,
  onRemove,
  editing,
  large,
  removeLabel,
  hint,
}: {
  label: string;
  onPick: () => void;
  onRemove: () => void;
  /** Shows an × that removes it with one tap. */
  editing?: boolean;
  /** The always-on tablet's larger text. */
  large?: boolean;
  removeLabel?: string;
  /** A line in the sheet under the action, such as when it may come back. */
  hint?: string;
}) {
  const kt = useKitT();
  removeLabel ??= kt('ui.dontSuggest', { label });
  const [menu, setMenu] = useState(false);
  const press = useLongPress(() => setMenu(true));
  return (
    <span
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border border-forest-200 bg-forest-50 font-medium text-forest-700 dark:border-forest-600 dark:bg-forest-800 dark:text-forest-100 ${
        large ? 'text-lg' : 'text-sm'
      }`}
    >
      <button
        type="button"
        {...press}
        onClick={onPick}
        aria-label={kt('ui.addSuggestion', { label })}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full whitespace-nowrap select-none [-webkit-touch-callout:none] hover:bg-forest-100 dark:hover:bg-forest-700 ${
          large ? 'px-4' : 'px-3.5'
        } ${editing ? 'pr-1' : ''}`}
      >
        <Plus size={large ? 18 : 14} strokeWidth={2.5} aria-hidden="true" />
        {label}
      </button>
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-700 hover:bg-tint-strong dark:text-forest-100"
        >
          <X size={large ? 18 : 16} aria-hidden="true" />
        </button>
      )}
      {menu &&
        // Into the body, so the sheet takes none of the pill's text styles and no scroller clips it.
        createPortal(
          <Dialog title={label} onClose={() => setMenu(false)}>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onRemove();
              }}
              className={`${secondaryButton} w-full justify-start`}
            >
              <EyeOff size={18} aria-hidden="true" /> {removeLabel}
            </button>
            {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
          </Dialog>,
          document.body,
        )}
    </span>
  );
}

/**
 * A dialog: bottom sheet on phones, centred on tablets; title and close row; Escape and the scrim
 * close it. `wide` for a dialog with a table or two columns.
 *
 * Focus is placed once, when it opens, and never again: re-renders (a clock tick, a snapshot, a
 * new `onClose` arrow from the parent) leave it where the person put it. With a mouse the first
 * field takes it (or a field already focused with `autoFocus`); on a touch screen the dialog
 * itself does, so the keyboard only opens when a field is tapped.
 */
export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const kt = useKitT();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (touchScreen()) return el.focus({ preventScroll: true });
    if (el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('input, select, textarea, button:not([data-dialog-close])')?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`safe-bottom outline-none max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className={iconButton} aria-label={kt('ui.close')} data-dialog-close="">
            <X size={20} />
          </button>
        </div>
        {children}
        {/* Labels never break inside a button: on a narrow phone the buttons share rows, growing to fill them. */}
        {footer && <div className="mt-6 flex flex-wrap items-center justify-end gap-2 [&>*]:whitespace-nowrap max-sm:[&>*]:grow">{footer}</div>}
      </div>
    </div>
  );
}

/** A touch screen, where focusing a text field opens the on-screen keyboard. */
const touchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-base text-ink">
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export type Attention = 'overdue' | 'soon' | 'ok' | 'unknown';

/** "Overdue" and "Soon" labels; nothing for the rest, so the eye goes to what needs doing. */
export function StatusPill({ state }: { state: Attention }) {
  const kt = useKitT();
  if (state === 'overdue')
    return <span className="inline-flex shrink-0 items-center rounded-full bg-attention-tint px-2.5 py-0.5 text-sm font-semibold text-attention">{kt('ui.overdue')}</span>;
  if (state === 'soon')
    return <span className="inline-flex shrink-0 items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-semibold text-ink-soft">{kt('ui.soon')}</span>;
  return null;
}

/** A failed action in words, with Try again. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  const kt = useKitT();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-error-tint px-3 py-2 text-base text-error">
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" className="min-h-11 rounded-xl px-3 font-semibold underline-offset-4 hover:underline" onClick={onRetry}>
        {kt('ui.tryAgain')}
      </button>
    </div>
  );
}

/**
 * The note above a signed-out app's invented household. On phones it is one line, the "Sample data"
 * chip and `short`, which opens `text` on a tap; from 640px up `text` sits beside the chip.
 * `notice` (a sign-in error) takes the text's place at every width. `children` (scenario chips) follow
 * on their own row on phones, on the same row when there is room.
 */
export function SampleBanner({
  text,
  short,
  notice,
  children,
  className = '',
}: {
  text: string;
  short?: string;
  notice?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const kt = useKitT();
  short ??= kt('ui.nothingSaved');
  const [open, setOpen] = useState(false);
  return (
    <div role="note" data-sample-banner className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1 sm:px-4 sm:py-1.5 ${className}`}>
      <div data-sample-line className="flex min-h-11 w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 sm:gap-4">
        <span data-sample-chip className="shrink-0 rounded-full bg-attention-tint px-3 py-1 text-sm font-semibold whitespace-nowrap text-attention">
          {kt('ui.sampleData')}
        </span>
        {notice ? (
          typeof notice === 'string' ? <p className="min-w-0 flex-1 text-base text-muted">{notice}</p> : <div className="min-w-0 flex-1">{notice}</div>
        ) : (
          <>
            <button
              type="button"
              data-sample-short
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-xl text-left text-sm text-muted sm:hidden"
            >
              <span className="truncate">{short}</span>
              <ChevronDown size={16} strokeWidth={2.2} aria-hidden className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
              <span className="sr-only">{open ? kt('ui.hideDetails') : kt('ui.details')}</span>
            </button>
            <p className="hidden min-w-0 flex-1 text-base text-muted sm:block">{text}</p>
          </>
        )}
      </div>
      {open && !notice && <p className="w-full pb-1.5 text-sm text-muted sm:hidden">{text}</p>}
      {children}
    </div>
  );
}

export interface Tab {
  id: string;
  label: string;
  /** A lucide icon, shown beside the label in the phone's bottom bar and its More sheet. */
  icon?: LucideIcon;
  /** One of the (at most four) tabs the phone's bottom bar shows; the rest go under More. */
  primary?: boolean;
  /** A shorter label for the bottom bar when `label` is long ("Visits" for "Appointments"). */
  short?: string;
}

/** Tabs the phone's bottom bar has room for, More included. */
export const BOTTOM_NAV_MAX = 5;

/**
 * Which tabs the phone's bottom bar shows and which go under More: all of them when they fit
 * (four or fewer), else the ones marked `primary` (the first four if none is), in their order.
 */
export function splitTabs(tabs: Tab[]): { bar: Tab[]; more: Tab[] } {
  if (tabs.length < BOTTOM_NAV_MAX) return { bar: tabs, more: [] };
  const marked = tabs.filter((t) => t.primary).slice(0, BOTTOM_NAV_MAX - 1);
  const bar = marked.length ? marked : tabs.slice(0, BOTTOM_NAV_MAX - 1);
  return { bar, more: tabs.filter((t) => !bar.includes(t)) };
}

/**
 * The app's sections. On tablets and desktops (640px and up) a segmented control in the app bar's
 * `nav` slot: `<AppBar …><SectionTabs tabs={…} tab={tab} onTab={setTab} /></AppBar>`. On phones a
 * bar fixed to the bottom of the screen instead (DESIGN.md "Frame"): up to four tabs with icon and
 * short label, and More opening a sheet with the rest when there are five or more. While the bar
 * shows, `<html data-hh-bottom-nav>` gives the page bottom padding (the kit's tailwind.css) and sets
 * `--hh-bottom-nav` to its height, so an app's own fixed bottom elements sit above it with
 * `bottom-(--hh-bottom-nav)`. Dialogs and sheets cover it.
 *
 * `compact` tightened the phone tabs before the bottom bar; it no longer changes anything.
 */
export function SectionTabs({ tabs, tab, onTab }: { tabs: Tab[]; tab: string; onTab: (id: string) => void; compact?: boolean }) {
  const kt = useKitT();
  if (tabs.length === 0) return null;
  return (
    <>
      <nav
        slot="nav"
        data-bottom-nav=""
        aria-label={kt('ui.sections')}
        className="hidden w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 sm:flex sm:w-auto"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-current={t.id === tab ? 'page' : undefined}
            className={`min-h-11 flex-1 rounded-xl px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:flex-none sm:px-5 sm:text-base ${
              t.id === tab ? 'bg-primary text-on-primary' : 'text-muted hover:bg-stone-100 dark:hover:bg-forest-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {typeof document !== 'undefined' && createPortal(<BottomNav tabs={tabs} tab={tab} onTab={onTab} />, document.body)}
    </>
  );
}

const BOTTOM_NAV_ATTR = 'data-hh-bottom-nav';

function BottomNav({ tabs, tab, onTab }: { tabs: Tab[]; tab: string; onTab: (id: string) => void }) {
  const kt = useKitT();
  const [sheet, setSheet] = useState(false);
  const { bar, more } = splitTabs(tabs);
  const inMore = more.some((t) => t.id === tab);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(BOTTOM_NAV_ATTR, '');
    return () => root.removeAttribute(BOTTOM_NAV_ATTR);
  }, []);
  const item = (key: string, label: string, Icon: LucideIcon | undefined, active: boolean, props: Record<string, unknown>) => (
    <li key={key} className="flex min-w-0 flex-1">
      <button
        type="button"
        {...props}
        className={`flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors duration-150 ${
          active ? 'text-link' : 'text-muted'
        }`}
      >
        <span
          aria-hidden
          className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ${active ? 'bg-forest-100 dark:bg-forest-700' : ''}`}
        >
          {Icon ? <Icon size={22} strokeWidth={active ? 2.4 : 2} /> : null}
        </span>
        <span className={`max-w-full truncate ${active ? 'font-semibold' : ''}`}>{label}</span>
      </button>
    </li>
  );
  return (
    <>
      <nav
        {...{ [BOTTOM_NAV_ATTR]: '' }}
        aria-label={kt('ui.sections')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] sm:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {bar.map((t) => item(t.id, t.short ?? t.label, t.icon, t.id === tab, { onClick: () => onTab(t.id), 'aria-current': t.id === tab ? 'page' : undefined }))}
          {more.length > 0 &&
            item('more', kt('ui.more'), Ellipsis, inMore, {
              onClick: () => setSheet(true),
              'aria-haspopup': 'dialog',
              'aria-expanded': sheet,
              'aria-label': inMore ? kt('ui.moreShowing', { tab: more.find((t) => t.id === tab)!.label }) : kt('ui.more'),
            })}
        </ul>
      </nav>
      {sheet && (
        <Dialog title={kt('ui.more')} onClose={() => setSheet(false)}>
          <ul className="grid gap-1">
            {more.map((t) => {
              const Icon = t.icon;
              const active = t.id === tab;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setSheet(false);
                      onTab(t.id);
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium transition-colors duration-150 ${
                      active ? 'bg-tint text-forest-700 dark:text-forest-200' : 'text-ink hover:bg-stone-100 dark:hover:bg-forest-700'
                    }`}
                  >
                    {Icon ? <Icon size={22} aria-hidden /> : null}
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog>
      )}
    </>
  );
}

/** A member's initial on their colour, for "logged by" marks. */
export function PersonBadge({ email, me, members, size = 32 }: { email: string; me: string; members: string[]; size?: number }) {
  const kt = useKitT();
  const name = personName(email, { email: me });
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-tile-ring"
      style={{ width: size, height: size, backgroundColor: personColour(email, members), fontSize: size * 0.42 }}
      title={kt('ui.loggedBy', { name })}
      aria-label={kt('ui.loggedBy', { name })}
      role="img"
    >
      {personInitial(email)}
    </span>
  );
}

export interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'error';
  undo?: () => void;
}

/** One toast at a time: `notify` (with an optional Undo), `fail` (an error), `clear`. Pair with `<Toast>`. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => setToast({ id: Date.now(), message, tone: 'info', undo }), []);
  const fail = useCallback((message: string) => setToast({ id: Date.now(), message, tone: 'error' }), []);
  const clear = useCallback(() => setToast(null), []);
  return { toast, notify, fail, clear };
}

/** The toast at the bottom: 6 seconds for news, 9 for errors; Undo runs and dismisses it. */
export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  const kt = useKitT();
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, toast.tone === 'error' ? 9000 : 6000);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-(--hh-bottom-nav) z-[60] flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {toast && (
        <div
          className={`pointer-events-auto flex min-h-14 max-w-xl items-center gap-4 rounded-2xl px-5 py-2 text-base font-medium text-white shadow-lg ${
            toast.tone === 'error' ? 'bg-red-700 ring-1 ring-toast-ring' : 'bg-toast ring-1 ring-toast-ring'
          }`}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                onDone();
              }}
              className="min-h-11 rounded-xl px-3 font-semibold text-forest-200 underline-offset-4 hover:underline"
            >
              {kt('ui.undo')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
