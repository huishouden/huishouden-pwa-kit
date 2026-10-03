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
import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
export declare const inputClass = "w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:border-forest-600 dark:bg-forest-900 dark:text-stone-100 dark:focus:ring-forest-700";
/** A select styled like the inputs. */
export declare const selectClass = "w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 dark:border-forest-600 dark:bg-forest-900 dark:text-stone-100 dark:focus:ring-forest-700 appearance-auto";
export declare const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-forest-600 disabled:opacity-50 dark:bg-forest-400 dark:text-forest-900 dark:hover:bg-forest-300";
export declare const ghostButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-forest-700";
/** The second action next to a primary button. */
export declare const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-forest-700 border border-stone-200 bg-white disabled:opacity-50 dark:border-forest-600 dark:bg-forest-800";
export declare const iconButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-600 transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30 dark:text-stone-300 dark:hover:bg-forest-700";
/** Footer button that deletes; the destructive action stays quiet until asked for. */
export declare const deleteButton = "mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-red-700 hover:bg-stone-100 dark:text-red-300 dark:hover:bg-forest-700";
export declare const cardClass = "rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-forest-600 dark:bg-forest-800";
export declare const overline = "text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300";
/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export declare const linkClass = "-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-forest-700 underline-offset-4 transition-colors duration-150 hover:bg-forest-50 hover:underline dark:text-forest-300 dark:hover:bg-forest-700";
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
