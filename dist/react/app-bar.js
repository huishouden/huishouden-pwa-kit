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
import { HhAppBar, SETTINGS_EVENT, SIGN_IN_EVENT, SIGN_OUT_EVENT } from '../app-bar';
import { kt } from '../i18n';
import { useI18nVersion } from './i18n';
export function AppBar({ app, glyph, portalUrl, version, theme, user, signingIn, onSignIn, onSignOut, onSettings, settingsLabel, className, children }) {
    const ref = useRef(null);
    const handlers = useRef({ onSignIn, onSignOut, onSettings });
    handlers.current = { onSignIn, onSignOut, onSettings };
    useI18nVersion(); // the default label follows the language
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
        const settings = () => handlers.current.onSettings?.();
        el.addEventListener(SIGN_IN_EVENT, signIn);
        el.addEventListener(SIGN_OUT_EVENT, signOut);
        el.addEventListener(SETTINGS_EVENT, settings);
        return () => {
            el.removeEventListener(SIGN_IN_EVENT, signIn);
            el.removeEventListener(SIGN_OUT_EVENT, signOut);
            el.removeEventListener(SETTINGS_EVENT, settings);
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
        settings: onSettings ? settingsLabel || kt('appBar.appSettings', { app }) : undefined,
        className,
    }, children);
}
// Registered by the import above; referenced so bundlers keep it.
void HhAppBar;
