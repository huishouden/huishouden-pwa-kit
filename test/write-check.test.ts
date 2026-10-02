import { describe, expect, test } from 'bun:test';
import { findRawWrites, isAppSource } from '../src/write-check';

describe('write check', () => {
  test('flags write functions and sentinels imported from firebase/firestore, on their import line', () => {
    const src = [
      "import { useState } from 'react';",
      'import {',
      '  collection,',
      '  setDoc,',
      '  writeBatch as batch,',
      '  increment,',
      '  type Firestore,',
      "} from 'firebase/firestore';",
    ].join('\n');
    expect(findRawWrites(src)).toEqual([
      { line: 2, name: 'setDoc' },
      { line: 2, name: 'writeBatch' },
      { line: 2, name: 'increment' },
    ]);
  });

  test('reads, types and the kit module pass', () => {
    const src = [
      "import { doc, onSnapshot, deleteField } from 'firebase/firestore';",
      "import type { WriteBatch } from 'firebase/firestore';",
      "import { setDoc, writeBatch } from '@huishouden/pwa-kit/firestore';",
    ].join('\n');
    expect(findRawWrites(src)).toEqual([]);
  });

  test('tests and fixtures are not app code', () => {
    expect(isAppSource('src/data/useLiveStore.ts')).toBe(true);
    expect(isAppSource('src/App.tsx')).toBe(true);
    expect(isAppSource('src/lib/model.test.ts')).toBe(false);
    expect(isAppSource('src/__fixtures__/x.ts')).toBe(false);
    expect(isAppSource('src/index.css')).toBe(false);
  });
});
