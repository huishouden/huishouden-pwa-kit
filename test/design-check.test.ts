import { describe, expect, test } from 'bun:test';
import { checkSource } from '../src/design-check';

const rules = (src: string, kind: 'markup' | 'style' | 'script' = 'script') => checkSource(src, kind).map((f) => `${f.rule}: ${f.text}`);

describe('pwa-design-check', () => {
  test('palette classes pass', () => {
    expect(rules(`<div className="bg-cream text-stone-800 border-stone-200 hover:bg-forest-600 text-terracotta bg-amber-500 text-red-700" />`)).toEqual([]);
  });

  test('off-palette families, including with variants and opacity, fail', () => {
    expect(rules(`className="bg-indigo-600 dark:text-slate-400 hover:border-sky-300/50"`)).toEqual([
      'off-palette colour: bg-indigo-600',
      'off-palette colour: dark:text-slate-400',
      'off-palette colour: hover:border-sky-300/50',
    ]);
  });

  test('amber only as the warning dot', () => {
    expect(rules(`className="bg-amber-500 text-amber-800"`)).toEqual(['amber outside the warning dot: text-amber-800']);
  });

  test('gradients, glass and stray hex colours fail; theme hex passes', () => {
    expect(rules(`className="bg-gradient-to-r from-forest-700 backdrop-blur-md" style={{ color: '#6366f1', background: '#faf9f5' }}`)).toEqual([
      'gradient: bg-gradient-to-r',
      'glass blur: backdrop-blur-md',
      'colour outside the palette: #6366f1',
    ]);
  });

  test('other typefaces fail; Inter passes', () => {
    expect(rules(`body { font-family: 'Plus Jakarta Sans', sans-serif; }`, 'style')).toEqual(['typeface other than Inter: \'Plus Jakarta Sans\', sans-serif']);
    expect(rules(`body { font-family: var(--hh-font); }`, 'style')).toEqual([]);
    expect(rules(`<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans" />`, 'markup')).toHaveLength(1);
  });

  test('emoji in rendered text fail, but not in comments', () => {
    expect(rules(`<h2>📊 Spending</h2>`)).toEqual(['emoji in UI: 📊']);
    expect(rules(`// shows 📊 in old versions`)).toEqual([]);
  });
});
