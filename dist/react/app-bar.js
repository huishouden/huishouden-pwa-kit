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
import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { HhAppBar, SIGN_IN_EVENT, SIGN_OUT_EVENT } from '../app-bar';
export function AppBar({ app, glyph, portalUrl, version, theme, user, signingIn, onSignIn, onSignOut, className, children }) {
    const ref = useRef(null);
    const handlers = useRef({ onSignIn, onSignOut });
    handlers.current = { onSignIn, onSignOut };
    useLayoutEffect(() => {
        if (ref.current)
            ref.current.user = user;
    }, [user]);
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const signIn = () => handlers.current.onSignIn?.();
        const signOut = () => handlers.current.onSignOut?.();
        el.addEventListener(SIGN_IN_EVENT, signIn);
        el.addEventListener(SIGN_OUT_EVENT, signOut);
        return () => {
            el.removeEventListener(SIGN_IN_EVENT, signIn);
            el.removeEventListener(SIGN_OUT_EVENT, signOut);
        };
    }, []);
    return createElement('hh-app-bar', {
        ref,
        app,
        glyph,
        'portal-url': portalUrl,
        version: version || undefined,
        theme: theme === 'dark' ? 'dark' : undefined,
        'signing-in': signingIn ? '' : undefined,
        className,
    }, children);
}
// Registered by the import above; referenced so bundlers keep it.
void HhAppBar;
