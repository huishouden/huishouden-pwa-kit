/**
 * What `pwa-i18n-check` checks in an app (docs/i18n.md): every language has every English key and
 * no others, each translation parses and uses the same `{variables}` as its English, every key is
 * used somewhere in the code, and no visible text is left as an English literal in JSX.
 *
 * The JSX scan is a small hand-written scanner rather than a parser: it finds element children and
 * the text attributes people read (`aria-label`, `title`, `placeholder`, `label`, ...) whose value is
 * a plain string with letters in it. A line with `i18n-ignore` on it (or on the line above), or a
 * file with `i18n-ignore-file`, is skipped: brand names, sample text, code shown as code.
 */
import { messageArgs, parseMessage } from './i18n.js';

export interface Problem {
  file: string;
  line?: number;
  message: string;
}

export interface CatalogueReport {
  errors: Problem[];
  warnings: Problem[];
}

/** Languages beside English that every app ships. */
export const CHECK_LANGS = ['es', 'nl'] as const;

/**
 * Compares the other languages with English: missing and extra keys, messages that don't parse, and
 * translations using a variable the English doesn't pass (a renamed `{count}` would show as text).
 * A translation may leave a variable out (a warning: usually a slip, sometimes the grammar), and the
 * English may pass a variable only one language uses (Spanish's "a la 1" against "a las 2").
 * Also warns on a translation identical to its English, which is usually a copy left untranslated.
 */
export function checkCatalogues(en: Record<string, unknown>, others: Record<string, Record<string, unknown> | undefined>, dir = 'src/locales'): CatalogueReport {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const enFile = `${dir}/en.json`;
  for (const [key, value] of Object.entries(en)) {
    if (typeof value !== 'string') {
      errors.push({ file: enFile, message: `"${key}" is not a string (catalogues are flat: "screen.thing": "Text")` });
      continue;
    }
    try {
      parseMessage(value);
    } catch (e) {
      errors.push({ file: enFile, message: `"${key}": ${(e as Error).message}` });
    }
  }
  for (const [lang, catalogue] of Object.entries(others)) {
    const file = `${dir}/${lang}.json`;
    if (!catalogue) {
      errors.push({ file, message: `missing: every app ships ${['en', ...CHECK_LANGS].join(', ')}` });
      continue;
    }
    for (const [key, enValue] of Object.entries(en)) {
      if (typeof enValue !== 'string') continue;
      const value = catalogue[key];
      if (value === undefined) {
        errors.push({ file, message: `missing "${key}" (en: ${JSON.stringify(enValue)})` });
        continue;
      }
      if (typeof value !== 'string') {
        errors.push({ file, message: `"${key}" is not a string` });
        continue;
      }
      let args: string[];
      try {
        args = messageArgs(value);
      } catch (e) {
        errors.push({ file, message: `"${key}": ${(e as Error).message}` });
        continue;
      }
      let enArgs: string[] = [];
      try {
        enArgs = messageArgs(enValue);
      } catch {
        // reported against en.json above
      }
      const extra = args.filter((a) => !enArgs.includes(a));
      const unused = enArgs.filter((a) => !args.includes(a));
      if (extra.length) errors.push({ file, message: `"${key}" uses {${extra.join('}, {')}}, which English doesn't pass (English uses {${enArgs.join('}, {')}})` });
      if (unused.length) warnings.push({ file, message: `"${key}" leaves out {${unused.join('}, {')}}, which English shows` });
      if (value === enValue && /\p{L}{4,}/u.test(value) && !SAME_IN_EVERY_LANGUAGE.test(value)) warnings.push({ file, message: `"${key}" is the same as English: ${JSON.stringify(value)}` });
    }
    for (const key of Object.keys(catalogue)) if (!(key in en)) errors.push({ file, message: `"${key}" is not in en.json (remove it, or add the English)` });
  }
  return { errors, warnings };
}

// Words that are the same in Spanish or Dutch as in English, so an identical translation is fine.
const SAME_IN_EVERY_LANGUAGE = /^(?:\{[^}]*\}|[\s\p{P}\p{S}\d]|Huishouden|Google|Gmail|Email|E-mail|App|Apps|Online|Offline|Privacy|Detail|Details|Status|Account|Total|Normal|Menu|Ok|OK|PDF|CSV|Wi-Fi|Internet|Water|Hotel|Taxi|Radio|Video|Chat|Sms|SMS|Web|Club|Gas|Hospital|Dentista|Auto)+$/u;

/** Keys from `keys` that no source mentions as a string literal, nor match a declared dynamic prefix (`i18n-dynamic: bills.status.`). */
export function unusedKeys(keys: string[], sources: string[]): string[] {
  const text = sources.join('\n');
  const prefixes = [...text.matchAll(/i18n-dynamic:\s*([\w.-]+)/g)].map((m) => m[1]);
  const used = new Set<string>();
  for (const m of text.matchAll(/(['"`])([\w-]+(?:\.[\w-]+)+)\1/g)) used.add(m[2]);
  return keys.filter((k) => !used.has(k) && !prefixes.some((p) => k.startsWith(p)));
}

/** Attributes whose plain-string value someone reads or hears. */
export const TEXT_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
  'label',
  'hint',
  'text',
  'short',
  'description',
  'removeLabel',
  'emptyText',
  'confirmLabel',
  'notice',
  'heading',
];

export interface Literal {
  line: number;
  text: string;
  /** `text` for element children, else the attribute's name. */
  where: string;
}

// Letters make it text; a URL, an address or a file name is not words to translate.
const hasWords = (s: string) => /\p{L}{2,}/u.test(s) && !/^(?:[a-z][\w+.-]*:\/\/\S*|[\w.+-]+@[\w-]+\.[\w.]+|[\w-]+(?:\.[\w-]+)+\/?)$/i.test(s.trim());

/**
 * English left in JSX: element text and text attributes with letters in them. `{'literal'}`
 * children count too. Lines marked `i18n-ignore` (or below such a line) and files marked
 * `i18n-ignore-file` give nothing.
 */
export function findJsxLiterals(source: string, attributes: readonly string[] = TEXT_ATTRIBUTES): Literal[] {
  if (source.includes('i18n-ignore-file')) return [];
  const lines = source.split('\n');
  const ignored = (line: number) => /i18n-ignore/.test(lines[line - 1] ?? '') || /i18n-ignore/.test(lines[line - 2] ?? '');
  const out: Literal[] = [];
  const lineAt = (i: number) => {
    let n = 1;
    for (let k = 0; k < i; k++) if (source.charCodeAt(k) === 10) n++;
    return n;
  };
  const push = (index: number, text: string, where: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || !hasWords(clean)) return;
    const line = lineAt(index);
    if (!ignored(line)) out.push({ line, text: clean, where });
  };

  let i = 0;
  const n = source.length;
  // The last significant character outside strings and comments, to tell `<div` (JSX) from `a < b` and `Array<T>`.
  let prev = '';
  let prevWord = '';

  const skipString = (quote: string) => {
    i++;
    while (i < n && source[i] !== quote) {
      if (source[i] === '\\') i++;
      i++;
    }
    i++;
  };
  const skipTemplate = () => {
    i++;
    while (i < n && source[i] !== '`') {
      if (source[i] === '\\') i += 2;
      else if (source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        code('}');
        i++;
      } else i++;
    }
    i++;
  };
  const skipComment = (): boolean => {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      return true;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      return true;
    }
    return false;
  };
  const startsJsx = () => {
    if (source[i] !== '<') return false;
    const next = source[i + 1];
    if (!(next === '>' || /[A-Za-z]/.test(next ?? ''))) return false;
    if (/[\w$)\]]/.test(prev) && !['return', 'case', 'default', 'yield', 'await', 'in', 'of', 'else', 'do', '&&', '||', '??'].includes(prevWord)) return false;
    // A generic arrow function's type parameters in a .tsx file (`<T extends X>(...) =>`, `<T,>(...) =>`), not an element.
    if (/^<[A-Za-z_$][\w$]*\s*(extends\b|,)/.test(source.slice(i, i + 80))) return false;
    return true;
  };

  /** JavaScript until `close` (unbalanced), noting JSX inside it. */
  function code(close: string) {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (skipComment()) continue;
      if (c === '"' || c === "'") {
        skipString(c);
        prev = 'a';
        prevWord = '';
        continue;
      }
      if (c === '`') {
        skipTemplate();
        prev = 'a';
        prevWord = '';
        continue;
      }
      if (startsJsx()) {
        element();
        prev = ')';
        prevWord = '';
        continue;
      }
      if (c === '{' || c === '(' || c === '[') depth++;
      if (c === '}' || c === ')' || c === ']') {
        if (depth === 0 && c === close) return;
        depth--;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (/[\w$]/.test(c)) {
        const start = i;
        while (i < n && /[\w$]/.test(source[i])) i++;
        prevWord = source.slice(start, i);
        prev = source[i - 1];
        continue;
      }
      if ((c === '&' && source[i + 1] === '&') || (c === '|' && source[i + 1] === '|') || (c === '?' && source[i + 1] === '?')) {
        prevWord = c + c;
        prev = c;
        i += 2;
        continue;
      }
      prev = c;
      prevWord = '';
      i++;
    }
  }

  /** One element from its `<` to the end of its closing tag (or `/>`). */
  function element() {
    i++; // <
    if (source[i] === '>') {
      i++;
      children();
      return;
    }
    while (i < n && /[\w$.:-]/.test(source[i])) i++; // tag name
    // attributes
    while (i < n) {
      if (skipComment()) continue;
      const c = source[i];
      if (c === '/' && source[i + 1] === '>') {
        i += 2;
        return;
      }
      if (c === '>') {
        i++;
        children();
        return;
      }
      if (c === '{') {
        i++;
        code('}');
        i++;
        continue;
      }
      if (/[\w$-]/.test(c)) {
        const start = i;
        while (i < n && /[\w$:-]/.test(source[i])) i++;
        const name = source.slice(start, i);
        while (/\s/.test(source[i] ?? '')) i++;
        if (source[i] !== '=') continue;
        i++;
        while (/\s/.test(source[i] ?? '')) i++;
        const q = source[i];
        if (q === '"' || q === "'") {
          const at = i;
          const end = source.indexOf(q, i + 1);
          const value = source.slice(i + 1, end < 0 ? n : end);
          i = end < 0 ? n : end + 1;
          if (attributes.includes(name)) push(at, value, name);
        } else if (q === '{') {
          i++;
          const at = i;
          while (/\s/.test(source[i] ?? '')) i++;
          const lit = /^(['"])((?:\\.|(?!\1).)*)\1\s*\}/.exec(source.slice(i));
          if (lit && attributes.includes(name)) push(at, lit[2], name);
          code('}');
          i++;
        }
        continue;
      }
      i++;
    }
  }

  /** Children until the matching closing tag. */
  function children() {
    let textStart = i;
    while (i < n) {
      const c = source[i];
      if (c === '<' && source[i + 1] === '/') {
        push(textStart, source.slice(textStart, i), 'text');
        const end = source.indexOf('>', i);
        i = end < 0 ? n : end + 1;
        return;
      }
      if (c === '<') {
        push(textStart, source.slice(textStart, i), 'text');
        element();
        textStart = i;
        continue;
      }
      if (c === '{') {
        push(textStart, source.slice(textStart, i), 'text');
        i++;
        while (/\s/.test(source[i] ?? '')) i++;
        const lit = /^(['"])((?:\\.|(?!\1).)*)\1\s*\}/.exec(source.slice(i));
        if (lit) push(i, lit[2], 'text');
        prev = '{';
        prevWord = '';
        code('}');
        i++;
        textStart = i;
        continue;
      }
      i++;
    }
  }

  code('\u0000');
  return out;
}

/** `notify('Saved')`, `fail("Couldn't save")`: toasts and errors given an English literal. */
export function findMessageLiterals(source: string, calls: readonly string[] = ['notify', 'fail', 'setError', 'setNotice', 'toast']): Literal[] {
  if (source.includes('i18n-ignore-file')) return [];
  const lines = source.split('\n');
  const out: Literal[] = [];
  const pattern = new RegExp(`\\b(${calls.join('|')})\\(\\s*(['"\`])((?:\\\\.|(?!\\2).)*)\\2`, 'g');
  for (const m of source.matchAll(pattern)) {
    const line = source.slice(0, m.index).split('\n').length;
    if (/i18n-ignore/.test(lines[line - 1] ?? '') || /i18n-ignore/.test(lines[line - 2] ?? '')) continue;
    if (hasWords(m[3].replace(/\$\{[^}]*\}/g, ''))) out.push({ line, text: m[3], where: `${m[1]}()` });
  }
  return out;
}

/** App source files the scans read: TypeScript, not tests, fixtures or the catalogues. */
export const isCheckedSource = (path: string): boolean =>
  /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path) && !/(^|\/)(__tests__|__fixtures__|locales)\//.test(path) && !/\.d\.ts$/.test(path);
