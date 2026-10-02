#!/usr/bin/env bun
// Writes the Huishouden family logo with an app's glyph: forest tile, cream house, terracotta roof,
// glyph inside in forest green (DESIGN.md "Logos"). Then render sizes with `pwa-icons --background=#1b4332`.
// Usage: pwa-logo <glyph> [out=public/icon.svg]    glyphs: home, check, card, bottle, list, cart
import { writeFileSync } from 'node:fs';
import { logoSvg, GLYPHS, type Glyph } from '../src/logo';

const [glyph, out = 'public/icon.svg'] = process.argv.slice(2);
if (!glyph || !(glyph in GLYPHS)) {
  console.error(`usage: pwa-logo <${Object.keys(GLYPHS).join('|')}> [out]`);
  process.exit(2);
}
writeFileSync(out, logoSvg(glyph as Glyph));
console.log(`wrote ${out}`);
