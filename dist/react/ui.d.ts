/**
 * The Huishouden UI primitives for React apps (DESIGN.md "Components"): class strings for buttons,
 * inputs and cards, and the dialog, chip, field, toast-with-Undo, error notice, status pill,
 * checkbox, section tabs and member badge every app shows.
 *
 * Styled with Tailwind v4 on the kit's palette: import `@huishouden/pwa-kit/tailwind.css` after
 * `tailwindcss` in the app's stylesheet. It maps the theme (forest, cream, terracotta) and adds
 * these files to Tailwind's sources. Icons are lucide-react, like the apps'.
 */
import { type ReactNode } from 'react';
export declare const inputClass = "w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200";
/** A select styled like the inputs. */
export declare const selectClass = "w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200 appearance-auto";
export declare const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-forest-600 disabled:opacity-50";
export declare const ghostButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100";
/** The second action next to a primary button. */
export declare const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100 border border-stone-200 bg-white disabled:opacity-50";
export declare const iconButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-600 transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30";
/** Footer button that deletes; the destructive action stays quiet until asked for. */
export declare const deleteButton = "mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-red-700 hover:bg-stone-100";
export declare const cardClass = "rounded-2xl border border-stone-200 bg-white shadow-sm";
export declare const overline = "text-xs font-semibold uppercase tracking-wide text-stone-600";
/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export declare const linkClass = "-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-forest-700 underline-offset-4 transition-colors duration-150 hover:bg-forest-50 hover:underline";
export declare function Chip({ active, onClick, children, label }: {
    active?: boolean;
    onClick: () => void;
    children: ReactNode;
    label?: string;
}): import("react").JSX.Element;
/**
 * A dialog: bottom sheet on phones, centred on tablets; title and close row; Escape and the scrim
 * close it; the first field (or button) takes focus.
 */
export declare function Dialog({ title, onClose, children, footer }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
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
export interface Tab {
    id: string;
    label: string;
}
/**
 * The app's sections as a segmented control, for the app bar's `nav` slot:
 * `<AppBar …><SectionTabs tabs={…} tab={tab} onTab={setTab} /></AppBar>`. `compact` tightens the
 * spacing on phones for five or more tabs.
 */
export declare function SectionTabs({ tabs, tab, onTab, compact }: {
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
