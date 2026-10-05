/**
 * The Huishouden UI primitives for React apps (DESIGN.md "Components"): class strings for buttons,
 * inputs and cards, and the dialog, chip, field, toast-with-Undo, error notice, status pill,
 * checkbox, section tabs (a bottom bar on phones), member badge, "Sample data" banner every app shows, and
 * the suggestion chip (tap to add, long press to stop suggesting) with its `useLongPress`, a copy button,
 * the note offering to bring back Google's window when it may have opened out of sight, and the
 * completion pattern (`CompleteButton`, `CompletionRow`, `CompletionList`: DESIGN.md "Completion").
 *
 * Styled with Tailwind v4 on the kit's palette: import `@huishouden/pwa-kit/tailwind.css` after
 * `tailwindcss` in the app's stylesheet. It maps the theme (forest, cream, terracotta) and adds
 * these files to Tailwind's sources. Icons are lucide-react, like the apps'. Each has `dark:` styles
 * (DESIGN.md "Dark and ambient modes") that apply only under a `.dark` class, for apps with a dark setting.
 */
import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
export declare const inputClass = "w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:bg-forest-900 dark:focus:ring-forest-700";
/** A select styled like the inputs. */
export declare const selectClass = "w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:bg-forest-900 dark:focus:ring-forest-700 appearance-auto";
export declare const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-on-primary transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50";
export declare const ghostButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-muted transition-colors duration-150 hover:bg-stone-100 dark:hover:bg-forest-700";
/** The second action next to a primary button. */
export declare const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-muted transition-colors duration-150 hover:bg-stone-100 dark:hover:bg-forest-700 border border-line bg-surface disabled:opacity-50";
export declare const iconButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-forest-700";
/** Footer button that deletes; the destructive action stays quiet until asked for. */
export declare const deleteButton = "mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-error hover:bg-stone-100 dark:hover:bg-forest-700";
export declare const cardClass = "rounded-2xl border border-line bg-surface shadow-sm";
export declare const overline = "text-xs font-semibold uppercase tracking-wide text-muted";
/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export declare const linkClass = "-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-link underline-offset-4 transition-colors duration-150 hover:bg-tint hover:underline";
export declare function Chip({ active, onClick, children, label }: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
    label?: string;
}): import("react").JSX.Element;
/** How long a finger rests on something before it counts as a long press. */
export declare const LONG_PRESS_MS = 500;
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
export declare function useLongPress(onLongPress: () => void, ms?: number): LongPressHandlers;
/**
 * Something the app learned and offers back, "tap to add": a pill that runs `onPick` on a tap. A
 * long press or right-click opens a small sheet with "Don't suggest <label>"; with `editing` an ×
 * beside the label does the same at once, for a visible way in (an "Edit" link by the shelf's
 * heading). Every target is at least 44px. Removing is the app's (with its Undo).
 */
export declare function SuggestionChip({ label, onPick, onRemove, editing, large, removeLabel, hint, }: {
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
}): import("react").JSX.Element;
/**
 * A dialog: bottom sheet on phones, centred on tablets; title and close row; Escape and the scrim
 * close it. `wide` for a dialog with a table or two columns.
 *
 * Focus is placed once, when it opens, and never again: re-renders (a clock tick, a snapshot, a
 * new `onClose` arrow from the parent) leave it where the person put it. With a mouse the first
 * field takes it (or a field already focused with `autoFocus`); on a touch screen the dialog
 * itself does, so the keyboard only opens when a field is tapped.
 */
export declare function Dialog({ title, onClose, children, footer, wide }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    wide?: boolean;
}): import("react").JSX.Element;
export declare function Field({ label, children, hint }: {
    label: string;
    children: ReactNode;
    hint?: string;
}): import("react").JSX.Element;
/**
 * Copies `text` to the clipboard from a tap, and says "Copied" for a moment: a Zelle email, an
 * account number. `what` names it for screen readers and the tooltip ("Copy the Zelle email").
 */
export declare function CopyButton({ text, what, className }: {
    text: string;
    what: string;
    className?: string;
}): import("react").JSX.Element;
export declare function Checkbox({ checked, onChange, children }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
}): import("react").JSX.Element;
export type Attention = 'overdue' | 'soon' | 'ok' | 'unknown';
/** "Overdue" and "Soon" labels; nothing for the rest, so the eye goes to what needs doing. */
export declare function StatusPill({ state }: {
    state: Attention;
}): import("react").JSX.Element | null;
/** A failed action in words, with Try again. */
export declare function ErrorNotice({ message, onRetry }: {
    message: string;
    onRetry: () => void;
}): import("react").JSX.Element;
/**
 * The note above a signed-out app's invented household. On phones it is one line, the "Sample data"
 * chip and `short`, which opens `text` on a tap; from 640px up `text` sits beside the chip.
 * `notice` (a sign-in error) takes the text's place at every width. `children` (scenario chips) follow
 * on their own row on phones, on the same row when there is room.
 */
export declare function SampleBanner({ text, short, notice, children, className, }: {
    text: string;
    short?: string;
    notice?: ReactNode;
    children?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
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
export declare const BOTTOM_NAV_MAX = 5;
/**
 * Which tabs the phone's bottom bar shows and which go under More: all of them when they fit
 * (four or fewer), else the ones marked `primary` (the first four if none is), in their order.
 */
export declare function splitTabs(tabs: Tab[]): {
    bar: Tab[];
    more: Tab[];
};
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
export declare function SectionTabs({ tabs, tab, onTab }: {
    tabs: Tab[];
    tab: string;
    onTab: (id: string) => void;
    compact?: boolean;
}): import("react").JSX.Element | null;
/** A member's initial on their colour, for "logged by" marks. */
export declare function PersonBadge({ email, me, members, size }: {
    email: string;
    me: string;
    members: string[];
    size?: number;
}): import("react").JSX.Element;
export interface ToastState {
    id: number;
    message: string;
    tone: 'info' | 'error';
    undo?: () => void;
}
/** One toast at a time: `notify` (with an optional Undo), `fail` (an error), `clear`. Pair with `<Toast>`. */
export declare function useToast(): {
    toast: ToastState | null;
    notify: (message: string, undo?: () => void) => void;
    fail: (message: string) => void;
    clear: () => void;
};
/** The toast at the bottom: 6 seconds for news, 9 for errors; Undo runs and dismisses it. */
export declare function Toast({ toast, onDone }: {
    toast: ToastState | null;
    onDone: () => void;
}): import("react").JSX.Element;
/** How long a wait on Google's window lasts before `GoogleWindowWait` offers to bring it back. */
export declare const GOOGLE_WINDOW_HINT_MS = 4000;
/**
 * Under a button that opens Google's window (`googleAuthCode`): when the wait lasts a few seconds,
 * says the window may be behind this one (desktop browsers, installed apps) and offers to bring it
 * to the front; `onShow` calls `googleAuthCode` again, which reuses the open window. With
 * `onContinueHere` (`googleAuthCodeRedirect`) it also offers "Continue in this tab", and shows that
 * button alone while `blocked` (the browser refused the window; the page says so with
 * `googleWindowMessage(e, service, { continueHere: true })`).
 */
export declare function GoogleWindowWait({ waiting, onShow, blocked, onContinueHere, delayMs, }: {
    waiting: boolean;
    onShow: () => void;
    blocked?: boolean;
    onContinueHere?: () => void;
    delayMs?: number;
}): import("react").JSX.Element | null;
/** How long something done keeps its Undo (DESIGN.md "Completion"): six hours, or less when the next one comes sooner. */
export declare const UNDO_DONE_MS: number;
/**
 * Whether something done at `at` still offers Undo at `now`: within `windowMs` (six hours) and
 * before `until` (the next occurrence, when there is one). Undone later, it goes through the
 * item's own editor or history.
 */
export declare function canUndoDone(at: number | undefined, now: number, { windowMs, until }?: {
    windowMs?: number;
    until?: number;
}): boolean;
/** Open items first, done ones after, each group keeping its order. */
export declare function openFirst<T>(items: readonly T[], isDone: (item: T) => boolean): T[];
/** The outlined "Mark done" button (DESIGN.md "Completion"): forest outline, never a fill. */
export declare const completeButton = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary bg-surface px-4 py-2 font-semibold text-link transition-colors duration-150 hover:bg-tint disabled:opacity-50";
/** The quiet Undo beside something done: small text, no border, a 44px target. */
export declare const undoDoneButton = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted underline-offset-4 transition-colors duration-150 hover:bg-stone-100 hover:underline dark:hover:bg-forest-700";
/** The filled forest check (or, skipped, a quiet skip mark) that says a row is done. Decorative: the row's words say it too. */
export declare function DoneBadge({ skipped, size }: {
    skipped?: boolean;
    size?: 'md' | 'lg';
}): import("react").JSX.Element;
export interface CompleteButtonProps {
    done: boolean;
    /** What is being done, for the buttons' names: "Take the garbage out". */
    name: string;
    onDone: () => void;
    /** Offered while done; leave it out once Undo has run out (`canUndoDone`). */
    onUndo?: () => void;
    /** The open button's visible word: the domain verb ("Give", "Feed", "Mark paid"); "Mark done" by default. */
    verb?: string;
    /** The open button's name; "Mark {name} done" by default. Give one with a domain verb: "Give Heartgard to Biscuit". */
    label?: string;
    /** Undo's name; "Undo done for {name}" by default ("Undo skip for {name}" when skipped). */
    undoLabel?: string;
    skipped?: boolean;
    size?: 'md' | 'lg';
    /** Under 640px only the check shows (the name still says it all): for tight rows. */
    compact?: boolean;
    disabled?: boolean;
    className?: string;
}
/**
 * Not done: an outlined forest button with a verb ("Mark done", "Give", "Mark paid"). Done: no
 * button that looks like an action, only a small "Undo" while `onUndo` is given (or nothing). The
 * two states carry different names ("Mark Take the garbage out done" / "Undo done for Take the
 * garbage out"), never `aria-pressed`. Pair with `DoneBadge` and a "Done by You · 8:10 PM" line, or
 * use `CompletionRow`, which does.
 */
export declare function CompleteButton({ done, name, onDone, onUndo, verb, label, undoLabel, skipped, size, compact, disabled, className }: CompleteButtonProps): import("react").JSX.Element | null;
/** "Done by You · 8:10 PM" (or "Skipped by …"); `at` is a moment or words already said. */
export declare function doneLine({ by, at, skipped }: {
    by?: string;
    at?: number | string;
    skipped?: boolean;
}): string;
export interface CompletionRowProps extends Omit<CompleteButtonProps, 'className'> {
    /** The thing to do, as a person reads it. `name` (the buttons' names) defaults to it when it is a string. */
    title: ReactNode;
    name: string;
    /** The line under the title while open: "Tonight by 7 PM", "Overdue by 5 days". */
    meta?: ReactNode;
    /** Late or due now: the open row's meta in the attention colour. The button stays the same. */
    attention?: boolean;
    /** Who did it, as shown ("You", "Sam"), and when (a moment, or words). */
    by?: string;
    at?: number | string;
    /** The done line in other words ("Given late 11:02 AM by Jo"); `doneLine({ by, at })` by default. */
    status?: ReactNode;
    /** Shown before the title while open (a category or event tile); the done badge takes its place once done. */
    leading?: ReactNode;
    /** Tapping the title (to edit or open it). */
    onOpen?: () => void;
    openLabel?: string;
    /** More actions while open, before the button: a quiet Skip. */
    actions?: ReactNode;
    /** Under the meta line, either state: notes, who to call. */
    children?: ReactNode;
}
/**
 * A completable item (DESIGN.md "Completion"). Open: the leading tile, the title, its meta (in
 * terracotta when `attention`), any extra actions and the outlined "Mark done". Done: the filled
 * check badge, the title muted (never struck through), "Done by You · 8:10 PM" and a small Undo.
 * Renders an `<li>`; put it in a `<ul>`, or a `CompletionList` that sorts done after open.
 */
export declare function CompletionRow({ title, meta, attention, by, at, status, leading, onOpen, openLabel, actions, children, ...button }: CompletionRowProps): import("react").JSX.Element;
export interface CompletionListProps<T> {
    items: readonly T[];
    isDone: (item: T) => boolean;
    /** One `CompletionRow` (an `<li>`) per item. */
    children: (item: T) => ReactNode;
    /** The list's name. */
    label: string;
    /** The one line when everything is done: "All done for tonight"; "All done" by default. */
    allDone?: string;
    className?: string;
}
/**
 * Completable rows with the done ones after the open ones. Once every item is done the list folds
 * to one line, the check badge and "All done for tonight", which opens the rows again (to undo).
 */
export declare function CompletionList<T>({ items, isDone, children, label, allDone, className }: CompletionListProps<T>): import("react").JSX.Element;
