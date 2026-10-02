import { describe, expect, test } from 'bun:test';
import { findRecurring, merchantKey, merchantName, monthlyEquivalent, sameMerchant, type CardCharge } from '../src/recurring';
import history from './fixtures/recurring/card-history.json';
import keys from './fixtures/recurring/merchant-keys.json';
import expected from './fixtures/recurring/expected.json';

// An invented household's card history, read on Wednesday 14 May 2031.
const NOW = '2031-05-14';
const charges = history as CardCharge[];

describe('merchantKey', () => {
  test.each(keys as [string, string][])('%p → %p', (description, key) => expect(merchantKey(description)).toBe(key));

  test('names: a known service by its name, anything else in title case', () => {
    expect(merchantName('netflix')).toBe('Netflix');
    expect(merchantName('apple#10')).toBe('Apple');
    expect(merchantName('att')).toBe('AT&T');
    expect(merchantName('blue bottle')).toBe('Blue Bottle');
  });
});

describe('sameMerchant', () => {
  test.each([
    ['Netflix', 'NETFLIX.COM 800-555-0101 CA', true],
    ['Spotify Family', 'PAYPAL *SPOTIFY', true],
    ['Planet Fitness gym', 'PLANET FITNESS SPRINGFIELD IL', true],
    ['Xfinity', 'COMCAST CABLE 800-555-0108 PA', true],
    ['Example Power Co', 'Example Power', true],
    ['Netflix', 'Hulu', false],
    ['Example Power Co', 'Example Water District', false],
    ['Car insurance', 'GEICO *AUTO', false],
    ['', 'Netflix', false],
  ])('%p and %p: %p', (a, b, same) => expect(sameMerchant(a, b)).toBe(same));
});

describe('findRecurring', () => {
  const found = findRecurring(charges, { now: NOW });

  test('finds the regular charges, most confident first', () => {
    expect(found.map(({ merchantKey, cadence, typicalAmount, amountVaries, lastDate, nextExpected, occurrences, subscription }) => ({ merchantKey, cadence, typicalAmount, amountVaries, lastDate, nextExpected, occurrences, subscription }))).toEqual(expected as typeof found);
    for (let i = 1; i < found.length; i++) expect(found[i - 1].confidence).toBeGreaterThanOrEqual(found[i].confidence);
  });

  test('leaves out refunds, card payments, irregular shopping, varying groceries and a subscription that stopped', () => {
    const keys = found.map((c) => c.merchantKey);
    expect(keys).not.toContain('thank you mobile');
    expect(keys).not.toContain('shell oil');
    expect(keys).not.toContain('trader joes');
    expect(keys).not.toContain('hulu');
  });

  test('a well-known service is more confident than an equally regular unknown one', () => {
    const coffee = found.find((c) => c.merchantKey === 'starbucks store')!;
    const meals = found.find((c) => c.merchantKey === 'hellofresh')!;
    expect(meals.known).toBe('subscription');
    expect(coffee.known).toBeNull();
    expect(meals.confidence).toBeGreaterThan(coffee.confidence);
  });

  test('a price rise keeps the subscription, at the new price', () => {
    const spotify = found.find((c) => c.merchantKey === 'spotify')!;
    expect(spotify).toMatchObject({ typicalAmount: 11.99, amountVaries: true });
  });

  test('a utility whose amount varies is kept; the same spread in an unknown category is not', () => {
    expect(found.find((c) => c.merchantKey === 'example city utilities')).toMatchObject({ amountVaries: true, cadence: 'monthly', subscription: false });
    const unknown = charges.filter((c) => c.description.startsWith('EXAMPLE CITY')).map((c) => ({ ...c, category: 'Miscellaneous' }));
    expect(findRecurring(unknown, { now: NOW })).toEqual([]);
  });

  test('one merchant with two regular charges gives two candidates', () => {
    const apple = found.filter((c) => c.displayName === 'Apple');
    expect(apple.map((c) => [c.merchantKey, c.typicalAmount])).toEqual([
      ['apple#10', 10.99],
      ['apple#2', 2.99],
    ]);
  });

  test('monthly equivalents', () => {
    expect(found.find((c) => c.merchantKey === 'amazon prime')!.monthlyAmount).toBe(11.58);
    expect(found.find((c) => c.merchantKey === 'geico')!.monthlyAmount).toBe(137.5);
    expect(monthlyEquivalent(10, 'weekly')).toBe(43.33);
  });

  test('yearly needs about a year between charges', () => {
    const yearly = (second: string) => findRecurring([{ date: '2030-04-10', description: 'EXAMPLE CLUB ANNUAL', amount: 99, category: 'Subscriptions' }, { date: second, description: 'EXAMPLE CLUB ANNUAL', amount: 99, category: 'Subscriptions' }], { now: NOW });
    expect(yearly('2031-04-12')[0]).toMatchObject({ cadence: 'yearly', nextExpected: '2032-04-12' });
    expect(yearly('2031-04-28')).toEqual([]);
  });

  test('two monthly charges are not enough', () => {
    const two = charges.filter((c) => c.description.startsWith('NETFLIX') && c.date >= '2031-03-01' && c.date <= NOW && c.amount > 0);
    expect(two).toHaveLength(2);
    expect(findRecurring(two, { now: NOW })).toEqual([]);
  });

  test('a missed month counts half; the next charge is moved past today', () => {
    const list = ['2030-12-01', '2031-01-01', '2031-03-01', '2031-04-01'].map((date) => ({ date, description: 'EXAMPLE CLOUD BACKUP', amount: 6, category: '' }));
    expect(findRecurring(list, { now: '2031-05-03' })[0]).toMatchObject({ cadence: 'monthly', nextExpected: '2031-06-01' });
    expect(findRecurring(list, { now: '2031-04-20' })[0].nextExpected).toBe('2031-05-01');
  });

  test('ignore, minConfidence and the household’s own category words', () => {
    expect(findRecurring(charges, { now: NOW, ignore: ['netflix', 'apple#2'] }).map((c) => c.merchantKey)).not.toContain('netflix');
    expect(findRecurring(charges, { now: NOW, ignore: ['apple#2'] }).map((c) => c.merchantKey)).not.toContain('apple#2');
    expect(findRecurring(charges, { now: NOW, minConfidence: 0.9 }).every((c) => c.confidence >= 0.9)).toBe(true);
    const coffee = charges.filter((c) => c.description.startsWith('STARBUCKS'));
    expect(findRecurring(coffee, { now: NOW })).toHaveLength(1);
    expect(findRecurring(coffee, { now: NOW, notBillCategories: ['dining'] })).toHaveLength(1);
    expect(findRecurring(coffee.map((c, i) => (i === 3 ? { ...c, amount: 6.1 } : c)), { now: NOW })).toEqual([]);
  });

  test('takes now as a moment too, and ignores charges after it and malformed rows', () => {
    const at = new Date(2031, 4, 14, 10, 30).getTime();
    expect(findRecurring(charges, { now: at })).toEqual(found);
    const junk = [...charges, { date: '14/05/2031', description: 'NETFLIX.COM', amount: 22.99 }, { date: '2031-05-13', description: 'NETFLIX.COM', amount: Number.NaN }];
    expect(findRecurring(junk, { now: NOW })).toEqual(found);
  });
});
