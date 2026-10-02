import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHARE_PARAMS, parsePlaceText, readSharedPlace } from '../src/places';
import { TESSERACT_URL, TESSERACT_VERSION, screenshotFrame, toReadableGray } from '../src/ocr';
import { OCR_CACHE, SHARE_TARGET, webManifest } from '../src/vite';

const dir = join(import.meta.dir, 'fixtures', 'listings');
const FIELDS = ['name', 'address', 'phone', 'website', 'email', 'mapsUrl', 'hours', 'category'] as const;

describe('parsePlaceText: invented listings (share text, copied listings, screenshot OCR)', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
    test(file.replace('.txt', ''), () => {
      const expected = JSON.parse(readFileSync(join(dir, file.replace('.txt', '.expected.json')), 'utf8'));
      const parsed = parsePlaceText(readFileSync(join(dir, file), 'utf8'));
      // Every field exactly, including the ones that must stay empty: no silent guesses.
      for (const field of FIELDS) expect([field, parsed[field]]).toEqual([field, expected[field]]);
      expect(parsed.unparsed).toEqual(expected.unparsed);
    });
  }
});

describe('parsePlaceText', () => {
  test('confidence weighs the fields a contact needs most', () => {
    expect(parsePlaceText('').confidence).toBe(0);
    expect(parsePlaceText('Example Vet\nhttps://maps.app.goo.gl/abc').confidence).toBe(0.55);
    expect(parsePlaceText('Example Vet\n1 Example Way, Springfield, IL 62704\n(217) 555-0100\nexample.com').confidence).toBe(1);
  });

  test('a second, different phone or website is shown, not dropped', () => {
    const p = parsePlaceText('Example Vet\n(217) 555-0100\n(217) 555-0199\nexample.com\nhttps://other.example.com');
    expect(p.phone).toBe('(217) 555-0100');
    expect(p.website).toBe('https://example.com');
    expect(p.unparsed).toEqual(['(217) 555-0199', 'https://other.example.com']);
  });

  test('the same phone written twice is used once', () => {
    const p = parsePlaceText('Example Vet\n(217) 555-0100\n+1 217-555-0100');
    expect(p.unparsed).toEqual([]);
  });

  test('listing chrome is reported as ignored, not as unparsed', () => {
    const p = parsePlaceText('Example Vet\n4.6 ★★★★★ (512)\nVeterinarian · 2.3 mi\nOpen ⋅ Closes 6 PM\nDirections Save Share');
    expect(p.ignored).toEqual(['4.6 ★★★★★ (512)', 'Veterinarian · 2.3 mi', 'Open ⋅ Closes 6 PM', 'Directions Save Share']);
    expect(p.category).toBe('Veterinarian');
    expect(p.unparsed).toEqual([]);
  });

  test('a closed business is flagged, not hidden', () => {
    expect(parsePlaceText('Example Vet\nPermanently closed').unparsed).toEqual(['Permanently closed']);
  });

  test('ratings, distances and times are never read as a phone or a name', () => {
    const p = parsePlaceText('4.8\n(1,204)\n2.3 mi\n9:41\nOpen 24 hours');
    expect(p).toMatchObject({ confidence: 0, unparsed: [] });
    expect(p.name).toBeUndefined();
    expect(p.phone).toBeUndefined();
  });

  test('a name in a Google Maps place link is used when the text has none', () => {
    expect(parsePlaceText('https://www.google.com/maps/place/Example+Vet+%26+Spa/@1,2,17z').name).toBe('Example Vet & Spa');
  });
});

describe('readSharedPlace', () => {
  test('reads what the Share menu sent: title, text and link', () => {
    const shared = readSharedPlace({
      search: `?${SHARE_PARAMS.title}=Jiffy+Lube&${SHARE_PARAMS.text}=${encodeURIComponent('902 Commerce Pkwy, Fairview, TX 75069')}&${SHARE_PARAMS.url}=${encodeURIComponent('https://maps.app.goo.gl/x1')}`,
    });
    expect(shared).toMatchObject({ title: 'Jiffy Lube', url: 'https://maps.app.goo.gl/x1' });
    expect(shared!.place).toMatchObject({ name: 'Jiffy Lube', address: '902 Commerce Pkwy, Fairview, TX 75069', mapsUrl: 'https://maps.app.goo.gl/x1' });
  });

  test('Google Maps sending name, address and link all in the text', () => {
    const text = 'Example Animal Hospital\n1 Example Way, Springfield, IL 62704\nhttps://maps.app.goo.gl/x2';
    const shared = readSharedPlace(`https://pet.example.com/?${SHARE_PARAMS.title}=Example+Animal+Hospital&${SHARE_PARAMS.text}=${encodeURIComponent(text)}`);
    expect(shared!.place).toMatchObject({ name: 'Example Animal Hospital', address: '1 Example Way, Springfield, IL 62704', mapsUrl: 'https://maps.app.goo.gl/x2', unparsed: [] });
  });

  test('hand-made ?share=1 links work; an ordinary launch is not a share', () => {
    expect(readSharedPlace('/?share=1&title=Example+Vet')!.place.name).toBe('Example Vet');
    expect(readSharedPlace('/?title=Example+Vet')).toBeNull();
    expect(readSharedPlace({ search: '' })).toBeNull();
  });
});

describe('share target and OCR setup', () => {
  test('the manifest asks for the parameters readSharedPlace reads', () => {
    expect(SHARE_TARGET.params).toEqual(SHARE_PARAMS);
    const options = { name: 'Huishouden Example', description: 'd', themeColor: '#000', backgroundColor: '#fff' };
    expect(webManifest({ ...options, shareTarget: true }).share_target).toEqual(SHARE_TARGET);
    expect('share_target' in webManifest(options)).toBe(false);
  });

  test('the engine loaded from the CDN is the version the kit tests, and the offline cache covers it', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));
    expect(pkg.devDependencies['tesseract.js']).toBe(TESSERACT_VERSION);
    expect(OCR_CACHE.urlPattern.test(TESSERACT_URL)).toBe(true);
  });

  test('phone screenshots lose the status bar; small ones are scaled up', () => {
    expect(screenshotFrame(1170, 2532)).toEqual({ top: 127, height: 2405, scale: 1 });
    expect(screenshotFrame(390, 844).scale).toBeCloseTo(1080 / 390);
    expect(screenshotFrame(1600, 1000)).toEqual({ top: 0, height: 1000, scale: 1 });
  });

  test('dark mode screenshots become dark text on light', () => {
    const dark = new Uint8ClampedArray([20, 20, 20, 255, 240, 240, 240, 255, 20, 20, 20, 255]);
    toReadableGray(dark);
    expect(Array.from(dark.slice(0, 3))).toEqual([235, 235, 235]);
    const light = new Uint8ClampedArray([250, 250, 250, 255, 10, 10, 10, 255]);
    toReadableGray(light);
    expect(light[0]).toBe(250);
  });
});

describe('map links come from Google or Apple only', () => {
  test('does not take a look-alike host for a map link', () => {
    for (const fake of [
      'https://maps.apple.example.com/place?q=x',
      'https://google.example.com/maps/place/x',
      'https://www.google.com.example.io/maps/place/x',
      'https://maps.google.example.com/?q=x',
    ]) expect(parsePlaceText(`Example Vet\n${fake}`).mapsUrl).toBeUndefined();
  });
  test('still reads real map links', () => {
    for (const real of [
      'https://maps.app.goo.gl/abc123',
      'https://www.google.com/maps/place/Example+Vet/@1,2,17z',
      'https://www.google.co.uk/maps/place/Example+Vet',
      'https://maps.google.de/?q=Example',
      'https://maps.apple.com/?q=Example',
      'https://maps.apple/p/abc',
    ]) expect(parsePlaceText(`Example Vet\n${real}`).mapsUrl).toBe(real);
  });
});
