/**
 * The suite's language in React (`@huishouden/pwa-kit/i18n`). Components that show text call
 * `useT()` and re-render when the language changes; components that format dates, numbers or
 * money call `useLocale()` (or `useT()`, which subscribes the same way) so they follow too.
 *
 * ```tsx
 * const t = useT();
 * return <h2>{t('bills.upcoming')}</h2>;
 * ```
 * `useLang()` gives the choice and `setChoice` for a language setting; the app bar's account menu
 * already offers it.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  getI18nVersion,
  getLang,
  getLangChoice,
  getLocale,
  kt,
  onLangChange,
  setLangChoice,
  startI18n,
  t,
  type Lang,
  type LangChoice,
} from '../i18n';

export type { Lang, LangChoice, MessageKey, Vars } from '../i18n';
export { LANG_CHOICES, LANG_NAMES, LANGS, t } from '../i18n';

const subscribe = (notify: () => void) => onLangChange(notify);
const serverSnapshot = () => 0;

/** Re-renders the caller whenever the language or locale changes; returns the change count. */
export function useI18nVersion(): number {
  return useSyncExternalStore(subscribe, getI18nVersion, serverSnapshot);
}

/**
 * `t` for this render: the app's messages, then the kit's, in the active language. A new function
 * after each change, so `useMemo`/`useCallback` that list it recompute.
 */
export function useT(): typeof t {
  const version = useI18nVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<typeof t>(() => (key, vars) => t(key, vars), [version]);
}

/** For kit components: the kit's own messages. */
export function useKitT(): typeof kt {
  const version = useI18nVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<typeof kt>(() => (key, vars) => kt(key, vars), [version]);
}

/** The locale every formatter uses ("en-US", "es-US", "nl-NL"). */
export function useLocale(): string {
  useI18nVersion();
  return getLocale();
}

/** The language shown, the stored choice and a setter for it (every app at once). */
export function useLang(): { lang: Lang; choice: LangChoice; locale: string; setChoice: (choice: LangChoice) => Promise<void> } {
  useI18nVersion();
  useEffect(() => void startI18n(), []);
  return { lang: getLang(), choice: getLangChoice(), locale: getLocale(), setChoice: setLangChoice };
}
