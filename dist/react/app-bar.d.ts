/**
 * React wrapper for `<hh-app-bar>`: typed props, `onSignIn` / `onSignOut` callbacks and the `user`
 * property set before the first paint. Children go into the bar's slots, so give each a `slot`:
 *
 * ```tsx
 * <AppBar app="Baby" glyph="bottle" portalUrl={PORTAL} user={user} onSignIn={signIn} onSignOut={signOut}>
 *   <nav slot="nav">…</nav>
 * </AppBar>
 * ```
 */
import { type ReactNode } from 'react';
import { HhAppBar, type AppBarUser } from '../app-bar';
import type { Glyph } from '../logo';
export type { AppBarUser } from '../app-bar';
export interface AppBarProps {
    /** Short app name ("Spending"); the portal passes "Huishouden". */
    app: string;
    glyph: Glyph;
    portalUrl: string;
    /** Shown in the account menu, e.g. "1.2.0 (abc1234)". */
    version?: string;
    theme?: 'light' | 'dark';
    /** `undefined` while restoring the session, `null` signed out. */
    user: AppBarUser | null | undefined;
    signingIn?: boolean;
    onSignIn?: () => void;
    onSignOut?: () => void;
    className?: string;
    children?: ReactNode;
}
export declare function AppBar({ app, glyph, portalUrl, version, theme, user, signingIn, onSignIn, onSignOut, className, children }: AppBarProps): import("react").ReactElement<{
    ref: import("react").RefObject<HhAppBar | null>;
    app: string;
    glyph: "list" | "home" | "check" | "card" | "bottle" | "paw" | "wrench" | "car" | "cart" | "pill";
    'portal-url': string;
    version: string | undefined;
    theme: string | undefined;
    'signing-in': string | undefined;
    className: string | undefined;
}, string | import("react").JSXElementConstructor<any>>;
