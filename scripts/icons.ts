#!/usr/bin/env bun
// Renders public/icon.svg into the PNG sizes the manifest and iOS need. Run after editing the SVG.
// Usage: pwa-icons [--background=#rrggbb]  (fill behind the maskable icon; default white)
import sharp from 'sharp';

const svg = await Bun.file('public/icon.svg').arrayBuffer();
const src = Buffer.from(svg);

await sharp(src).resize(192, 192).png().toFile('public/pwa-192.png');
await sharp(src).resize(512, 512).png().toFile('public/pwa-512.png');
await sharp(src).resize(180, 180).png().toFile('public/apple-touch-icon.png');
// Maskable: launchers crop to a circle/squircle, so keep the mark inside the central 80%.
await sharp({ create: { width: 512, height: 512, channels: 4, background: process.argv.find((a) => a.startsWith('--background='))?.split('=')[1] ?? '#ffffff' } })
  .composite([{ input: await sharp(src).resize(410, 410).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile('public/pwa-maskable-512.png');
