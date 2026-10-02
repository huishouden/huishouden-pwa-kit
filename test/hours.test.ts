import { describe, expect, test } from 'bun:test';
import { closesAt, describeDay, isOpenAt, parseOpeningHours } from '../src/hours';

// Monday 6 January 2031.
const at = (day: number, h: number, m = 0) => new Date(2031, 0, 5 + day, h, m);

describe('opening hours', () => {
  const shop = parseOpeningHours('Mo-Fr 07:00-18:00; Sa 08:00-16:00; Su off')!;

  test('weekday ranges, a Saturday, and a closed Sunday', () => {
    expect(isOpenAt(shop, at(1, 9))).toBe(true);
    expect(isOpenAt(shop, at(1, 18))).toBe(false);
    expect(isOpenAt(shop, at(6, 15, 59))).toBe(true);
    expect(isOpenAt(shop, at(0, 12))).toBe(false);
  });

  test('closing time is the end of the period still open that day', () => {
    expect(closesAt(shop, at(1, 9))!.getHours()).toBe(18);
    expect(closesAt(shop, at(1, 19))).toBeNull();
    expect(closesAt(shop, at(0, 9))).toBeNull();
  });

  test('later rules override earlier days; split days; past midnight; 24/7', () => {
    const h = parseOpeningHours('Mo-Su 09:00-17:00; We 09:00-12:00,13:00-17:00; Fr 18:00-02:00')!;
    expect(isOpenAt(h, at(3, 12, 30))).toBe(false);
    expect(isOpenAt(h, at(5, 23))).toBe(true);
    expect(isOpenAt(h, at(6, 1))).toBe(true); // Friday night into Saturday
    expect(isOpenAt(parseOpeningHours('24/7')!, at(0, 3))).toBe(true);
    expect(describeDay(parseOpeningHours('24/7')!, at(2, 3))).toBe('Open 24 hours');
    expect(describeDay(shop, at(0, 9))).toBe('Closed');
  });

  test('unsupported forms are not guessed at', () => {
    for (const text of ['Mo-Fr 07:00-18:00; PH off', 'sunrise-sunset', 'Jan-Mar Mo 10:00-12:00', '', undefined]) {
      expect(parseOpeningHours(text)).toBeNull();
    }
  });
});
