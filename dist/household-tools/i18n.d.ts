import en from './locales/en.js';
import { type Vars } from '../i18n.js';
export type ToolMessageKey = keyof typeof en;
/** A household tool's message in the current language (`withLang`), formatted. */
export declare const t: (key: ToolMessageKey, vars?: Vars) => string;
