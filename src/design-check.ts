/**
 * Mechanical half of the Huishouden design language (DESIGN.md): flags what code can decide on its
 * own. Judgment calls (hierarchy, copy tone) belong to the design reviewer.
 */
export interface DesignFinding {
  line: number;
  rule: string;
  text: string;
}

const COLOR_UTILITIES = 'bg|text|border|border-[trblxy]|from|via|to|ring|ring-offset|outline|fill|stroke|shadow|divide|placeholder|decoration|accent|caret';
// Families outside the palette. Allowed: forest, cream, terracotta, stone, white, black, red (errors),
// amber only as the pending/warning dot (bg-amber-400/500).
const OFF_PALETTE = 'slate|gray|zinc|neutral|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const offPaletteClass = new RegExp(`(?<![\\w-])(?:[a-z0-9]+:)*(?:${COLOR_UTILITIES})-(?:${OFF_PALETTE})-\\d{2,3}(?:/\\d+)?(?![\\w-])`, 'g');
const amberClass = /(?<![\w-])(?:[a-z0-9]+:)*(?:[a-z-]+)-amber-\d{2,3}(?:\/\d+)?(?![\w-])/g;
const ALLOWED_AMBER = new Set(['bg-amber-400', 'bg-amber-500']);
const gradient = /(?<![\w-])(?:[a-z0-9]+:)*bg-(?:gradient|linear|radial|conic)-[\w-]+|(?:linear|radial|conic)-gradient\(/g;
const blur = /(?<![\w-])(?:[a-z0-9]+:)*backdrop-blur(?:-[\w]+)?|backdrop-filter\s*:/g;
const hex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
const fontFamily = /font-family\s*:\s*([^;}]+)/gi;
const foreignFont = /fonts\.googleapis\.com\/css2?\?family=(?!Inter\b)[\w+]+/g;
const emoji = /\p{Extended_Pictographic}/gu;

/** Theme and chart colours (DESIGN.md "Colour"), lowercase. */
export const PALETTE_HEX = new Set([
  '#fff', '#ffffff', '#000', '#000000',
  '#f0f7f2', '#d8f3dc', '#b7e4c7', '#95d5b2', '#74c69d', '#40916c', '#2d6a4f', '#1b4332', '#12301f', '#081c15',
  '#faf9f5', '#c86d51', '#ffdbcf', '#94452f',
  // red-700 / red-300 / red-50: errors only
  '#b91c1c', '#fca5a5', '#fef2f2',
  '#b08d57', '#5b7a99', '#8a6f9e', '#6f8f72', '#a8735a',
  '#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917',
]);

export function checkSource(source: string, kind: 'markup' | 'style' | 'script'): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const lines = source.split('\n');
  lines.forEach((raw, i) => {
    // Comments describe code; they aren't rendered.
    const line = kind === 'style' ? raw.replace(/\/\*.*?\*\//g, '') : raw.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/\s.*$/, '');
    const add = (rule: string, text: string) => findings.push({ line: i + 1, rule, text });
    for (const m of line.matchAll(offPaletteClass)) add('off-palette colour', m[0]);
    for (const m of line.matchAll(amberClass)) {
      const bare = m[0].replace(/^(?:[a-z0-9]+:)+/, '');
      if (!ALLOWED_AMBER.has(bare)) add('amber outside the warning dot', m[0]);
    }
    for (const m of line.matchAll(gradient)) add('gradient', m[0]);
    for (const m of line.matchAll(blur)) add('glass blur', m[0]);
    for (const m of line.matchAll(hex)) if (!PALETTE_HEX.has(m[0].toLowerCase())) add('colour outside the palette', m[0]);
    for (const m of line.matchAll(fontFamily)) {
      const value = m[1].trim();
      if (!/^(?:var\(--hh-font\)|['"]?Inter['"]?)/.test(value) && !/^inherit|^ui-monospace|monospace/.test(value)) add('typeface other than Inter', value);
    }
    for (const m of line.matchAll(foreignFont)) add('typeface other than Inter', m[0]);
    if (kind !== 'style') for (const m of line.matchAll(emoji)) add('emoji in UI', m[0]);
  });
  return findings;
}

export function kindOf(path: string): 'markup' | 'style' | 'script' | null {
  if (/\.(test|spec)\.[jt]sx?$/.test(path) || /(^|\/)(__fixtures__|fixtures|node_modules|dist)\//.test(path)) return null;
  if (/\.(css|scss)$/.test(path)) return 'style';
  if (/\.html$/.test(path)) return 'markup';
  if (/\.[jt]sx?$/.test(path)) return 'script';
  return null;
}
