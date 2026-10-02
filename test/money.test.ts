import { describe, expect, test } from 'bun:test';
import { centsToInput, centsToMoney, formatCents, formatMoney, moneyToCents, parseCents, sumMoney, toDecimal, usd } from '../src/money';

describe('typed amounts', () => {
  test.each([
    ['120', 12000],
    ['120.5', 12050],
    ['89.99', 8999],
    ['$1,234.5', 123450],
    ['$1,200.00', 120000],
    [' 0.99 ', 99],
    ['0.05', 5],
    ['40.', 4000],
    ['', undefined],
    ['   ', undefined],
    ['abc', null],
    ['1.234', null],
    ['-5', null],
    ['1000001', null],
  ])('%p', (text, cents) => expect(parseCents(text)).toBe(cents as number | null | undefined));

  test('the cap is the caller’s', () => {
    expect(parseCents('2000000', { max: 999_999_999 })).toBe(200_000_000);
    expect(parseCents('10', { max: 500 })).toBeNull();
  });

  test('shown with two decimals; the headline in whole units', () => {
    expect(formatCents(8999)).toBe('$89.99');
    expect(formatCents(123450)).toBe('$1,234.50');
    expect(formatCents(123450, { headline: true })).toBe('$1,235');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(500, { currency: 'EUR' })).toBe('€5.00');
    expect(centsToInput(6500)).toBe('65.00');
    expect(centsToInput(undefined)).toBe('');
  });
});

describe('statement amounts', () => {
  test.each([
    ['1,234.5', '1234.50'],
    ['$1,234.50', '1234.50'],
    ['(30.00)', '-30.00'],
    ['30.00 CR', '-30.00'],
    ['12.345', '12.35'],
    ['0', '0.00'],
    [12.5, '12.50'],
    ['ten', null],
    [Number.NaN, null],
    [null, null],
  ])('%p → %p', (v, out) => expect(toDecimal(v)).toBe(out));

  test('cents both ways and sums without drift', () => {
    expect(moneyToCents(usd('-20.05'))).toBe(-2005);
    expect(centsToMoney(-2005)).toEqual(usd('-20.05'));
    expect(centsToMoney(0)).toEqual(usd('0.00'));
    expect(sumMoney([usd('0.10'), usd('0.20'), { amount: '5.00', currency: 'EUR' }])).toEqual(usd('0.30'));
    expect(sumMoney([])).toBeNull();
    expect(formatMoney(usd('-20.00'))).toBe('-$20.00');
    expect(formatMoney(usd('1234.50'), { headline: true })).toBe('$1,235');
  });
});
