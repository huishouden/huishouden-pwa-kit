import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  confidenceOf,
  courseDays,
  doseSlots,
  doseState,
  doseSummary,
  doseTimes,
  everyDaysOf,
  formatDose,
  parseDirections,
  parseNumber,
  toMedCourse,
} from '../src/dose';

const fixtures = join(import.meta.dir, 'fixtures');

describe('parseDirections: label photos (OCR text)', () => {
  const labels = readdirSync(join(fixtures, 'labels')).filter((f) => f.endsWith('.txt'));
  for (const file of labels) {
    test(file, () => {
      const text = readFileSync(join(fixtures, 'labels', file), 'utf8');
      const expected = JSON.parse(readFileSync(join(fixtures, 'labels', file.replace('.txt', '.expected.json')), 'utf8'));
      const parsed = parseDirections(text);
      expect(parsed).toMatchObject(expected.parsed);
      expect(toMedCourse(parsed, { startDate: '2026-03-14' })).toEqual(expected.course);
    });
  }
});

describe('parseDirections: directions wording', () => {
  const sigs: { text: string; expect: Record<string, unknown> }[] = JSON.parse(readFileSync(join(fixtures, 'sigs.json'), 'utf8'));
  for (const sig of sigs) {
    test(sig.text || '(empty)', () => {
      expect(parseDirections(sig.text)).toMatchObject(sig.expect);
    });
  }

  test('never drops wording silently: every word is understood, a note, or unparsed', () => {
    const parsed = parseDirections('Give 1 tablet twice daily, rub belly gently, with food');
    expect(parsed.unparsed).toEqual(['rub belly gently']);
    expect(parsed.confidence).toBeLessThan(1);
  });

  test('boilerplate lines are reported as ignored, not unparsed', () => {
    const parsed = parseDirections('Rx# 99999\nGive 1 tablet daily\nRefills: 2');
    expect(parsed.ignored).toEqual(['Rx# 99999', 'Refills: 2']);
    expect(parsed.unparsed).toEqual([]);
  });

  test('a label without a recognisable name says so', () => {
    expect(parseDirections('Give 1 tablet daily\nfor 5 days').assumptions).toContain('no medicine name found on the label');
  });

  test('two different doses are reported, the first kept', () => {
    const parsed = parseDirections('Give 1 tablet or 2 capsules twice daily');
    expect(parsed.dose).toBe('1 tablet');
    expect(parsed.unparsed).toContain('2 capsules');
  });
});

describe('numbers and doses', () => {
  test.each([
    ['1', 1], ['0.5', 0.5], ['.5', 0.5], ['1/2', 0.5], ['1 1/2', 1.5], ['one', 1], ['two', 2],
    ['half', 0.5], ['one-half', 0.5], ['one and a half', 1.5], ['½', 0.5], ['a', 1],
  ])('parseNumber(%p) = %p', (text, n) => expect(parseNumber(text)).toBe(n));

  test('formatDose pluralises counted units only', () => {
    expect(formatDose(1, 'tablet')).toBe('1 tablet');
    expect(formatDose(2, 'tablet')).toBe('2 tablets');
    expect(formatDose(2.5, 'ml')).toBe('2.5 ml');
    expect(formatDose(2, 'patch')).toBe('2 patches');
  });

  test('confidence weighs schedule, dose, length, name and leftovers', () => {
    const base = { notes: [], unparsed: [], assumptions: [], ignored: [], confidence: 0 };
    expect(confidenceOf({ ...base, timesPerDay: 2, dose: '1 tablet', days: 7, name: 'X' })).toBe(1);
    expect(confidenceOf({ ...base, unparsed: ['?'] })).toBe(0);
    expect(confidenceOf({ ...base, timesPerDay: 1, assumptions: ['a'] })).toBe(0.4);
  });
});

describe('doseTimes', () => {
  test('spreads doses from morning to evening', () => {
    expect(doseTimes({ timesPerDay: 1 })).toEqual(['08:00']);
    expect(doseTimes({ timesPerDay: 2 })).toEqual(['08:00', '20:00']);
    expect(doseTimes({ timesPerDay: 3 })).toEqual(['08:00', '14:00', '20:00']);
    expect(doseTimes({ timesPerDay: 4 })).toEqual(['08:00', '12:00', '16:00', '20:00']);
  });
  test('uses named times of day and the household defaults', () => {
    expect(doseTimes({ timesPerDay: 2, timesOfDay: ['morning', 'bedtime'] })).toEqual(['08:00', '22:00']);
    expect(doseTimes({ timesOfDay: ['evening'] }, { defaultTimes: { evening: '18:30' } })).toEqual(['18:30']);
  });
  test('spaces intervals exactly from the first dose', () => {
    expect(doseTimes({ intervalHours: 8, timesPerDay: 3 }, { firstDose: '06:00' })).toEqual(['06:00', '14:00', '22:00']);
    expect(doseTimes({ intervalHours: 12, timesPerDay: 2 }, { firstDose: '07:30' })).toEqual(['07:30', '19:30']);
    expect(doseTimes({ intervalHours: 6, timesPerDay: 4 })).toEqual(['02:00', '08:00', '14:00', '20:00']);
  });
  test('every other day and weekly: one dose on dosing days', () => {
    expect(doseTimes({ intervalHours: 48, timesPerDay: 1 })).toEqual(['08:00']);
    expect(everyDaysOf({ intervalHours: 48 })).toBe(2);
    expect(everyDaysOf({ intervalHours: 168 })).toBe(7);
    expect(everyDaysOf({ intervalHours: 12 })).toBe(1);
  });
  test('as needed: no times', () => {
    expect(doseTimes({ asNeeded: true })).toEqual([]);
  });
});

describe('courseDays', () => {
  test('consecutive days across a month end', () => {
    expect(courseDays('2026-01-30', 4)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });
  test('every other day', () => {
    expect(courseDays('2026-03-01', 5, 2)).toEqual(['2026-03-01', '2026-03-03', '2026-03-05']);
  });
});

describe('due and missed doses', () => {
  const course = { startDate: '2026-03-14', days: 2, times: ['08:00', '20:00'] };
  const at = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).getTime();

  test('doseSlots lists every dose of the course in order', () => {
    const slots = doseSlots(course, 0, at(20, 0));
    expect(slots.map((s) => s.key)).toEqual(['2026-03-14T08:00', '2026-03-14T20:00', '2026-03-15T08:00', '2026-03-15T20:00']);
    expect(slots[0].at).toBe(at(14, 8));
  });

  test('ongoing courses run until the end of the window', () => {
    const slots = doseSlots({ startDate: '2026-03-14', times: ['09:00'] }, at(14, 0), at(17, 23));
    expect(slots.map((s) => s.date)).toEqual(['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17']);
  });

  test('every other day skips the days between', () => {
    const slots = doseSlots({ startDate: '2026-03-14', days: 6, times: ['08:00'], everyDays: 2 }, 0, at(31, 0));
    expect(slots.map((s) => s.date)).toEqual(['2026-03-14', '2026-03-16', '2026-03-18']);
  });

  test('doseState: upcoming, due within the window, missed after it, given when recorded', () => {
    const [slot] = doseSlots(course, 0, at(14, 9));
    expect(doseState(slot, [], at(14, 7))).toBe('upcoming');
    expect(doseState(slot, [], at(14, 7, 45))).toBe('due');
    expect(doseState(slot, [], at(14, 9, 59))).toBe('due');
    expect(doseState(slot, [], at(14, 10, 1))).toBe('missed');
    expect(doseState(slot, ['2026-03-14T08:00'], at(14, 12))).toBe('given');
    expect(doseState(slot, new Set(['2026-03-14T08:00']), at(14, 12))).toBe('given');
  });

  test('doseSummary: due now, missed so far, and the next one', () => {
    const summary = doseSummary(course, ['2026-03-14T08:00'], at(15, 8, 30));
    expect(summary.missed.map((s) => s.key)).toEqual(['2026-03-14T20:00']);
    expect(summary.due.map((s) => s.key)).toEqual(['2026-03-15T08:00']);
    expect(summary.next?.key).toBe('2026-03-15T20:00');
  });

  test('a finished course has no next dose', () => {
    const summary = doseSummary(course, [], at(20, 12));
    expect(summary.next).toBeUndefined();
    expect(summary.missed).toHaveLength(4);
  });
});
