import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/food.json';
import { DEFAULT_PANTRY, DIETS, DIET_GUIDANCE, DIET_LABELS, FOOD_LIMITS, foodDoc, householdDietRules, householdDiets, pantryText, toFood, withMembers } from '../src/food';

describe('reading the stored document', () => {
  test('keeps valid people once, known diets only, avoid lists trimmed and de-duplicated', () => {
    const food = toFood(fixture.stored);
    expect(food.people).toEqual(fixture.people as never);
    expect(food.pantryAssumed).toEqual(fixture.pantryAssumed);
  });

  test('a missing document is nobody yet and the default pantry', () => {
    expect(toFood(undefined)).toEqual({ people: [], pantryAssumed: [...DEFAULT_PANTRY], updatedAt: 0, by: '' });
  });

  test('an empty pantry stays empty rather than falling back to the default', () => {
    expect(toFood({ people: [], pantryAssumed: [] }).pantryAssumed).toEqual([]);
  });
});

describe('the saved document', () => {
  test('is clipped to the rules and stamped', () => {
    const long = 'x'.repeat(100);
    const doc = foodDoc(
      {
        people: Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, name: long, diets: ['vegan'], avoid: Array.from({ length: 40 }, (_, j) => `${long}${j}`), note: long.repeat(3) })),
        pantryAssumed: ['salt'],
      },
      ' Sam@Example.com ',
      123,
    );
    expect(doc.people).toHaveLength(FOOD_LIMITS.people);
    expect(doc.people[0].name).toHaveLength(FOOD_LIMITS.name);
    expect(doc.people[0].note).toHaveLength(FOOD_LIMITS.note);
    expect(doc.people[0].avoid.length).toBeLessThanOrEqual(FOOD_LIMITS.avoid);
    expect(doc.people[0].avoid.every((a) => a.length <= FOOD_LIMITS.avoidItem)).toBe(true);
    expect(doc.updatedAt).toBe(123);
    expect(doc.by).toBe('sam@example.com');
    expect(Object.values(doc.people[0]).includes(undefined as never)).toBe(false);
  });
});

describe('members', () => {
  test('adds members not listed yet, by first name, after the people already there', () => {
    const people = withMembers(toFood(fixture.stored).people, [
      { email: 'sam@example.com', name: 'Sam Example' },
      { email: 'jo@example.com' },
      { email: 'kim@example.com', name: 'Kim Example' },
    ]);
    expect(people.map((p) => [p.id, p.name, p.member])).toEqual([
      ['sam@example.com', 'Sam', 'sam@example.com'],
      ['alex@example.com', 'Alex', 'alex@example.com'],
      ['kid-1', 'Robin', undefined],
      ['jo@example.com', 'Jo', 'jo@example.com'],
      ['kim@example.com', 'Kim', 'kim@example.com'],
    ]);
  });
});

describe('constraints in words', () => {
  test('one sentence per diet, avoid list and note, and that shared meals suit everyone', () => {
    const food = toFood(fixture.stored);
    expect(householdDietRules(food)).toEqual(fixture.rules);
    expect(pantryText(food)).toBe(fixture.pantryText);
  });

  test('nothing when nobody has constraints, and no "suit all" line for one person', () => {
    expect(householdDietRules({ people: [{ id: 'a', name: 'Sam', diets: [], avoid: [] }] })).toEqual([]);
    expect(householdDietRules({ people: [{ id: 'a', name: 'Sam', diets: ['halal'], avoid: [] }] })).toEqual([
      'Sam eats halal: no pork or alcohol (including in cooking); meat and poultry should be halal.',
    ]);
    expect(pantryText({ pantryAssumed: [] })).toBe('');
  });

  test('the household diets for filtering, in the fixed order', () => {
    expect(householdDiets(toFood(fixture.stored))).toEqual(['vegetarian', 'nut allergy', 'gerd', 'pregnant']);
  });

  test('every diet has a label and guidance', () => {
    for (const d of DIETS) {
      expect(DIET_LABELS[d]).toBeTruthy();
      expect(DIET_GUIDANCE[d]).toBeTruthy();
    }
  });
});
