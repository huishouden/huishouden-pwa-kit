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
import { createElement, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { HhAppBar, SETTINGS_EVENT, SIGN_IN_EVENT, SIGN_OUT_EVENT, type AppBarUser } from '../app-bar';
import { kt } from '../i18n';
import { useI18nVersion } from './i18n';
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
  /**
   * The app's own settings: the bar's menu (the account menu, or the sliders button signed out)
   * holds them beside Theme and Language, so the app shows no gear of its own. Leave it out when
   * there is nothing to set (a helper's view, say).
   */
  onSettings?: () => void;
  /** Their name in the menu; by default "<app> settings" in the page's language. */
  settingsLabel?: string;
  className?: string;
  children?: ReactNode;
}

export function AppBar({ app, glyph, portalUrl, version, theme, user, signingIn, onSignIn, onSignOut, onSettings, settingsLabel, className, children }: AppBarProps) {
  const ref = useRef<HhAppBar>(null);
  const handlers = useRef({ onSignIn, onSignOut, onSettings });
  handlers.current = { onSignIn, onSignOut, onSettings };
  useI18nVersion(); // the default label follows the language

  useLayoutEffect(() => {
    if (ref.current) ref.current.user = user;
  }, [user]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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

  return createElement(
    'hh-app-bar',
    {
      ref,
      app,
      glyph,
      'portal-url': portalUrl,
      version: version || undefined,
      theme: theme === 'dark' ? 'dark' : undefined,
      'signing-in': signingIn ? '' : undefined,
      settings: onSettings ? settingsLabel || kt('appBar.appSettings', { app }) : undefined,
      className,
    },
    children,
  );
}

// Registered by the import above; referenced so bundlers keep it.
void HhAppBar;
