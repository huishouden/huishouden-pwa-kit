import { kt, t, type Lang, type LangChoice } from '../i18n';
export type { Lang, LangChoice, MessageKey, Vars } from '../i18n';
export { LANG_CHOICES, LANG_NAMES, LANGS, t } from '../i18n';
/** Re-renders the caller whenever the language or locale changes; returns the change count. */
export declare function useI18nVersion(): number;
/**
 * `t` for this render: the app's messages, then the kit's, in the active language. A new function
 * after each change, so `useMemo`/`useCallback` that list it recompute.
 */
export declare function useT(): typeof t;
/** For kit components: the kit's own messages. */
export declare function useKitT(): typeof kt;
/** The locale every formatter uses ("en-US", "es-US", "nl-NL"). */
export declare function useLocale(): string;
/** The language shown, the stored choice and a setter for it (every app at once). */
export declare function useLang(): {
    lang: Lang;
    choice: LangChoice;
    locale: string;
    setChoice: (choice: LangChoice) => Promise<void>;
};
