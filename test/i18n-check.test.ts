import { describe, expect, test } from 'bun:test';
import { checkCatalogues, findJsxLiterals, findMessageLiterals, isCheckedSource, unusedKeys } from '../src/i18n-check';

describe('catalogues', () => {
  const en = { 'a.title': 'Bills', 'a.due': '{count, plural, one {# bill} other {# bills}}', 'a.hi': 'Hello, {name}' };
  test('a complete translation passes', () => {
    const es = { 'a.title': 'Facturas', 'a.due': '{count, plural, one {# factura} other {# facturas}}', 'a.hi': 'Hola, {name}' };
    expect(checkCatalogues(en, { es, nl: { ...es, 'a.title': 'Rekeningen' } })).toEqual({ errors: [], warnings: [] });
  });

  test('missing, extra, broken and renamed variables are errors; an English copy is a warning', () => {
    const es = { 'a.title': 'Bills to pay', 'a.due': '{count, plural, one {# factura}}', 'a.extra': 'x' };
    const nl = { 'a.title': 'Rekeningen', 'a.due': '{n, plural, one {# rekening} other {# rekeningen}}', 'a.hi': 'Hoi {naam}' };
    const { errors, warnings } = checkCatalogues(en, { es, nl });
    expect(errors.map((e) => `${e.file}: ${e.message.split(' (')[0]}`)).toEqual([
      'src/locales/es.json: "a.due": Bad message',
      'src/locales/es.json: missing "a.hi"',
      'src/locales/es.json: "a.extra" is not in en.json',
      'src/locales/nl.json: "a.due" uses {n}, which English doesn\'t pass',
      'src/locales/nl.json: "a.hi" uses {naam}, which English doesn\'t pass',
    ]);
    expect(warnings.map((w) => w.message)).toEqual(['"a.due" leaves out {count}, which English shows', '"a.hi" leaves out {name}, which English shows']);
    expect(checkCatalogues({ 'a.x': 'Settings page' }, { es: { 'a.x': 'Settings page' } }).warnings).toHaveLength(1);
    expect(checkCatalogues({ 'a.x': 'Privacy' }, { nl: { 'a.x': 'Privacy' } }).warnings).toHaveLength(0);
  });

  test('a missing language file is an error', () => {
    expect(checkCatalogues(en, { es: undefined }).errors[0].message).toMatch(/^missing/);
  });
});

describe('unused keys', () => {
  test('a key counts as used when a source has it as a string; i18n-dynamic prefixes count too', () => {
    const sources = [`t('a.title'); t("a.hi", { name }); const k = \`a.due\`;`, `// i18n-dynamic: status.\nt(\`status.\${s}\`)`];
    expect(unusedKeys(['a.title', 'a.hi', 'a.due', 'a.gone', 'status.paid'], sources)).toEqual(['a.gone']);
  });
});

describe('English left in JSX', () => {
  test('element text, text attributes and {"literals"}; not code, expressions or ignored lines', () => {
    const src = `
import { useState } from 'react';
export function A({ items }: { items: string[] }) {
  const [n, setN] = useState<number>(0);
  if (n < items.length && items.length > 2) setN(1);
  return (
    <div className="flex gap-2" data-x="Not text">
      <h2>Upcoming bills</h2>
      <p>
        {t('a.hi', { name })} and more
      </p>
      <button aria-label="Close dialog" title={'Close it'} onClick={() => setN(n + 1)}>×</button>
      <input placeholder={t('a.search')} />
      {n > 1 ? <span>Several</span> : <span>{n}</span>}
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
      <span>{'Literal child'}</span>
      <Field label="Amount">
        <code>12:30</code>
      <input placeholder="https://" title="example.com" aria-label="name@example.com" />
      </Field>
      <b>Huishouden</b> {/* i18n-ignore */}
    </div>
  );
}
const x = a < b ? 1 : 2;
const y = () => <>Fragment text</>;
`;
    expect(findJsxLiterals(src).map((l) => `${l.line} ${l.where} ${l.text}`)).toEqual([
      '8 text Upcoming bills',
      '10 text and more',
      '12 aria-label Close dialog',
      '12 title Close it',
      '14 text Several',
      '18 text Literal child',
      '19 label Amount',
      '28 text Fragment text',
    ]);
  });

  test('a file can opt out', () => {
    expect(findJsxLiterals('// i18n-ignore-file: a demo\nconst a = <p>Hello there</p>;')).toEqual([]);
    // A generic arrow's type parameters are not an element, and the code after them is still code.
    const generic = "const open =\n  <T extends { by?: string }>(show: (item: T) => void) =>\n  (item: T) => (ok ? show(item) : notify('Not yours'));\nconst b = <p>Left in English</p>;\nconst c = <U,>(u: U) => u;";
    expect(findJsxLiterals(generic).map((l) => `${l.line} ${l.text}`)).toEqual(['4 Left in English']);
  });

  test('toasts and errors given an English literal', () => {
    const src = "notify('Bill saved', undo);\nfail(`Couldn't save ${name}`);\nnotify(t('a.saved'));\nfail('...');";
    expect(findMessageLiterals(src).map((l) => `${l.line} ${l.where} ${l.text}`)).toEqual(['1 notify() Bill saved', "2 fail() Couldn't save ${name}"]);
  });

  test('which files are read', () => {
    expect(['src/App.tsx', 'src/lib/view.ts', 'src/lib/view.test.ts', 'src/locales/x.ts', 'src/lib/__fixtures__/a.ts', 'src/vite-env.d.ts'].filter(isCheckedSource)).toEqual(['src/App.tsx', 'src/lib/view.ts']);
  });
});

describe("the kit's own components", () => {
  test('show no English outside t()', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const found = readdirSync('src/react')
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) => findJsxLiterals(readFileSync(`src/react/${f}`, 'utf8')).map((l) => `src/react/${f}:${l.line} ${l.text}`));
    expect(found).toEqual([]);
  });
});
