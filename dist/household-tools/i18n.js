import en from './locales/en.js';
import { registerMessages, t as anyT } from '../i18n.js';
/**
 * The household tools' words (English imported, Spanish and Dutch loaded on first use), registered
 * with the kit's i18n like an app's catalogue, so `withLang` and `loadLang` switch them too.
 */
registerMessages(en, { es: () => import('./locales/es.js'), nl: () => import('./locales/nl.js') });
/** A household tool's message in the current language (`withLang`), formatted. */
export const t = (key, vars) => anyT(key, vars);
