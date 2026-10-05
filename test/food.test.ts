import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/food.json';
import { DEFAULT_PANTRY, DIETS, DIET_STRICT, GENTLE_DIETS, householdDietPreferences, isStrict, DIET_GUIDANCE, DIET_LABELS, FOOD_LIMITS, foodDoc, householdDietRules, householdDiets, householdSpiceLines, pantryText, pseudonymousFood, toFood, withMembers } from '../src/food';

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

describe('strict and gentle diets', () => {
  test('GERD and low-sodium are preferences; beliefs, allergies and pregnancy are rules', () => {
    expect([...GENTLE_DIETS]).toEqual(['gerd', 'low-sodium']);
    expect(DIETS.filter((d) => !isStrict(d))).toEqual(['gerd', 'low-sodium']);
    for (const d of ['vegan', 'vegetarian', 'nut allergy', 'shellfish allergy', 'pregnant', 'halal', 'kosher'] as const) expect(isStrict(d)).toBe(true);
    expect(Object.isFrozen(GENTLE_DIETS)).toBe(true);
    expect(Object.keys(DIET_STRICT).sort()).toEqual([...DIETS].sort());
  });

  test('rules can leave preferences out, and preferences are worded softly', () => {
    const food = { people: [{ id: 'a', name: 'Sam', diets: ['vegetarian', 'gerd'] as const, avoid: [] }] } as unknown as Parameters<typeof householdDietRules>[0];
    const strict = householdDietRules(food, { strictOnly: true });
    expect(strict.some((r) => r.includes('vegetarian'))).toBe(true);
    expect(strict.some((r) => r.includes('GERD'))).toBe(false);
    expect(householdDietRules(food).some((r) => r.includes('GERD'))).toBe(true);
    const prefs = householdDietPreferences(food);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatch(/^Sam has GERD \(reflux\): most meals, not every one, should follow this: avoid spicy food/);
  });
});

describe('spice tolerance', () => {
  const { householdMaxHeat, householdSpiceLines, householdDietPreferences, toFood } = require('../src/food');
  test('reads a valid tolerance and drops an unknown one', () => {
    const food = toFood({ people: [{ id: 'a', name: 'Amanda', diets: [], avoid: [], spice: 'none' }, { id: 'b', name: 'Sam', diets: [], avoid: [], spice: 'scorching' }], pantryAssumed: [] });
    expect(food.people[0].spice).toBe('none');
    expect(food.people[1].spice).toBeUndefined();
  });
  test('a shared meal follows the lowest tolerance anyone set', () => {
    const people = [{ id: 'a', name: 'Amanda', diets: [], avoid: [], spice: 'none' }, { id: 'b', name: 'Sam', diets: [], avoid: [], spice: 'hot' }, { id: 'c', name: 'Kid', diets: [], avoid: [] }];
    expect(householdMaxHeat({ people })).toBe(0);
    expect(householdMaxHeat({ people: [people[2]] })).toBeUndefined();
    expect(householdSpiceLines({ people })[0]).toContain('Amanda: keep meals mild, heat 0 of 3; a slight touch of heat (1) is tolerable now and then but not ideal.');
    expect(householdDietPreferences({ people })).toEqual(householdSpiceLines({ people }));
  });
});

describe('pseudonymous food for a model', () => {
  const food = toFood({
    people: [
      { id: 'amanda@example.com', name: 'Amanda Rivera', member: 'amanda@example.com', diets: ['gerd', 'nut allergy'], avoid: ['mushrooms'], spice: 'mild', note: 'Amanda is pregnant; ask amanda@example.com or Bob first' },
      { id: 'bob@example.com', name: 'Bob', member: 'bob@example.com', diets: ['vegetarian'], avoid: ['cilantro'], note: 'Cooks for Rivera family; writes to kim.lee@example.org' },
      { id: 'kid-1', name: 'Noor', diets: ['halal'], avoid: [] },
    ],
  });
  const real = ['Amanda', 'Rivera', 'Bob', 'Noor', 'amanda@example.com', 'bob@example.com', 'kim.lee@example.org', 'Kim'];

  test('names nobody: no name, first name or email in any prompt line', () => {
    const { food: anon } = pseudonymousFood(food, [{ email: 'kim.lee@example.org', name: 'Kim Lee' }]);
    const text = [...householdDietRules(anon), ...householdDietRules(anon, { strictOnly: true }), ...householdDietPreferences(anon), ...householdSpiceLines(anon)].join('\n');
    for (const r of real) expect(text).not.toMatch(new RegExp(`\\b${r}\\b`, 'i'));
    expect(JSON.stringify(anon.people)).not.toMatch(/@|Amanda|Bob|Rivera/);
  });

  test('keeps every condition, tied to a stand-in, and the avoid lists as written', () => {
    const { food: anon } = pseudonymousFood(food);
    expect(anon.people.map((p) => p.name)).toEqual(['Person A', 'Person B', 'Person C']);
    expect(anon.people.map((p) => p.diets)).toEqual(food.people.map((p) => p.diets));
    expect(anon.people[0].avoid).toEqual(['mushrooms']);
    expect(anon.people[0].note).toBe('Person A is pregnant; ask Person A or Person B first');
    expect(anon.people[1].note).toBe('Cooks for Person A family; writes to someone');
    expect(householdDietRules(anon).filter((r) => r.startsWith('Person C'))).toHaveLength(1);
  });

  test('leaves avoid lists as written, even when a name is also a food', () => {
    const { food: anon } = pseudonymousFood(toFood({ people: [{ id: 'olive', name: 'Olive', diets: [], avoid: ['olive oil'] }] }));
    expect(householdDietRules(anon)).toEqual(['Person A avoids olive oil.']);
  });

  test('is stable for the same list and puts real names back', () => {
    const a = pseudonymousFood(food);
    expect(pseudonymousFood(food).food).toEqual(a.food);
    expect(a.restore('Too spicy for Person A; Person C and Person Z')).toBe('Too spicy for Amanda Rivera; Noor and Person Z');
  });
});
