import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { setDoc } from './firestore.js';
import { kt, type KitKey } from './i18n.js';

/**
 * The household's food preferences: who eats at home, their diets, allergies and dislikes, and the
 * kitchen basics a recipe may assume. One document, `households/{id}/settings/food`, edited in the
 * portal and read by any app that suggests meals (Groceries' meal ideas), so every app plans for the
 * same people. `householdDietRules` words it as plain constraints for a prompt or a filter.
 *
 * The rules check the document's shape (FOOD_FIELDS, list sizes, the pantry); they can't afford to check
 * every person's fields, so writes go through `saveFood`, which clips each person to FOOD_PERSON_FIELDS
 * and FOOD_LIMITS. Keep them in step.
 */

export const DIETS = [
  'vegan',
  'vegetarian',
  'pescatarian',
  'gluten-free',
  'dairy-free',
  'nut allergy',
  'shellfish allergy',
  'gerd',
  'pregnant',
  'low-sodium',
  'halal',
  'kosher',
] as const;
export type Diet = (typeof DIETS)[number];

/** How a chip names each diet in English. Shown text uses `dietLabel` (the active language). */
export const DIET_LABELS: Record<Diet, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  pescatarian: 'Pescatarian',
  'gluten-free': 'Gluten-free',
  'dairy-free': 'Dairy-free',
  'nut allergy': 'Nut allergy',
  'shellfish allergy': 'Shellfish allergy',
  gerd: 'GERD (reflux)',
  pregnant: 'Pregnant',
  'low-sodium': 'Low sodium',
  halal: 'Halal',
  kosher: 'Kosher',
};

const DIET_KEYS = {
  vegan: 'food.diet.vegan',
  vegetarian: 'food.diet.vegetarian',
  pescatarian: 'food.diet.pescatarian',
  'gluten-free': 'food.diet.glutenFree',
  'dairy-free': 'food.diet.dairyFree',
  'nut allergy': 'food.diet.nutAllergy',
  'shellfish allergy': 'food.diet.shellfishAllergy',
  gerd: 'food.diet.gerd',
  pregnant: 'food.diet.pregnant',
  'low-sodium': 'food.diet.lowSodium',
  halal: 'food.diet.halal',
  kosher: 'food.diet.kosher',
} as const satisfies Record<Diet, KitKey>;

/** A diet's chip in the active language: "Vegetarian", "Vegetariano", "Vegetarisch". */
export function dietLabel(diet: Diet): string {
  return kt(DIET_KEYS[diet]);
}

/**
 * "Sam is vegetarian", "Sam has GERD (reflux)": what the diet says about the person. */
const DIET_PHRASES: Record<Diet, string> = {
  vegan: 'eats vegan',
  vegetarian: 'is vegetarian',
  pescatarian: 'is pescatarian',
  'gluten-free': 'eats gluten-free',
  'dairy-free': 'eats dairy-free',
  'nut allergy': 'is allergic to nuts',
  'shellfish allergy': 'is allergic to shellfish',
  gerd: 'has GERD (reflux)',
  pregnant: 'is pregnant',
  'low-sodium': 'eats low-sodium',
  halal: 'eats halal',
  kosher: 'keeps kosher',
};

/** What each diet means for a meal, from well-known guidance, in plain words. */
export const DIET_GUIDANCE: Record<Diet, string> = {
  vegan: 'no meat, poultry, fish or seafood, and no dairy, eggs or honey, including ingredients made from them (stock, gelatin, fish sauce, butter)',
  vegetarian: 'no meat, poultry, fish or seafood, including ingredients made from them (meat or fish stock, gelatin, fish sauce, anchovies)',
  pescatarian: 'no meat or poultry; fish, seafood, eggs and dairy are fine',
  'gluten-free': 'no wheat, barley or rye, and only oats labelled gluten-free, including in pasta, bread, breadcrumbs, flour-thickened sauces, stock cubes and soy sauce (tamari is fine)',
  'dairy-free': 'no milk, cream, butter, cheese or yogurt, including in sauces and baking',
  'nut allergy': 'a strict allergy: no peanuts or tree nuts (almonds, cashews, walnuts, pecans, pistachios, hazelnuts), nut oils or nut butters, or ingredients that may contain them, such as pesto, satay and some sauces',
  'shellfish allergy': 'a strict allergy: no shrimp, prawns, crab, lobster, crayfish, clams, mussels, oysters, scallops or squid, and no sauces or stocks made from them',
  gerd: 'avoid spicy food, citrus, tomato-heavy dishes, fried and fatty food, mint, chocolate, caffeine and carbonated drinks; no large meals late in the evening',
  pregnant:
    'no raw or undercooked meat, poultry, eggs, fish or shellfish (no sushi, rare meat or runny eggs); no high-mercury fish (shark, swordfish, king mackerel, tilefish, bigeye tuna); no unpasteurised milk or soft cheese made from it; deli meats and hot dogs only heated until steaming; no alcohol; keep caffeine low',
  'low-sodium': 'keep salt low: little added salt, and go easy on soy sauce, stock cubes, cured meat, cheese and canned or processed food',
  halal: 'no pork or alcohol (including in cooking); meat and poultry should be halal',
  kosher: 'no pork or shellfish, and no meat and dairy in the same meal; meat should be kosher',
};

/**
 * Whether each diet is a rule (true) or a preference (false). A strict reflux or low-salt diet every
 * day leaves only bland food (and many people manage reflux with medication), so apps rate and order
 * meals for preferences instead of dropping them. Beliefs, allergies and pregnancy safety are rules.
 * A Record, so adding a diet forces the choice.
 */
export const DIET_STRICT: Readonly<Record<Diet, boolean>> = Object.freeze({
  vegan: true,
  vegetarian: true,
  pescatarian: true,
  'gluten-free': true,
  'dairy-free': true,
  'nut allergy': true,
  'shellfish allergy': true,
  gerd: false,
  pregnant: true,
  'low-sodium': false,
  halal: true,
  kosher: true,
});

/** Whether a meal that breaks this diet must be left out (true) or only rated and ordered (false). */
export function isStrict(diet: Diet): boolean {
  return DIET_STRICT[diet];
}

/** The preference diets, in DIETS order. */
export const GENTLE_DIETS: readonly Diet[] = Object.freeze(DIETS.filter((d) => !DIET_STRICT[d]));

/**
 * How much heat (chili spice) someone enjoys. Matches the 0–3 heat scale meal ideas use:
 * none = 0 (a slight touch now and then is tolerable, not ideal), mild = 1, medium = 2, hot = 3.
 */
export const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot'] as const;
export type SpiceTolerance = (typeof SPICE_LEVELS)[number];

/** Heat tolerance in English. Shown text uses `spiceLabel`. */
export const SPICE_LABELS: Record<SpiceTolerance, string> = {
  none: 'No heat',
  mild: 'A little',
  medium: 'Medium',
  hot: 'Loves heat',
};

/** A heat tolerance in the active language: "Loves heat", "Le encanta el picante", "Houdt van pittig". */
export function spiceLabel(spice: SpiceTolerance): string {
  return kt(spice === 'none' ? 'food.spice.none' : spice === 'mild' ? 'food.spice.mild' : spice === 'medium' ? 'food.spice.medium' : 'food.spice.hot');
}

/** The highest heat (0–3) that suits someone most of the time. */
export const SPICE_MAX_HEAT: Record<SpiceTolerance, number> = { none: 0, mild: 1, medium: 2, hot: 3 };

export interface FoodPerson {
  /** Stable within the household's list: the member's email, or an invented id for someone without an account. */
  id: string;
  name: string;
  /** The member's email when this person has an account in the household. */
  member?: string;
  diets: Diet[];
  /** Ingredients they avoid or dislike: "cilantro", "olives". */
  avoid: string[];
  /** Heat tolerance; absent means no preference. */
  spice?: SpiceTolerance;
  note?: string;
}

export interface FoodPreferences {
  people: FoodPerson[];
  /** Kitchen basics a recipe may assume without listing them to buy. */
  pantryAssumed: string[];
  updatedAt: number;
  /** Lowercase email of the member who saved it. */
  by: string;
}

export type FoodInput = Pick<FoodPreferences, 'people' | 'pantryAssumed'>;

export const FOOD_FIELDS = ['people', 'pantryAssumed', 'updatedAt', 'by'] as const;
export const FOOD_PERSON_FIELDS = ['id', 'name', 'member', 'diets', 'avoid', 'spice', 'note'] as const;

/** The rules' limits. List entries may not contain `|` (the rules check a list as one joined string). */
export const FOOD_LIMITS = { people: 20, id: 60, name: 60, member: 254, avoid: 30, avoidItem: 40, note: 200, pantry: 40, pantryItem: 40 } as const;

/** What a kitchen usually has; the household edits it. */
export const DEFAULT_PANTRY: readonly string[] = ['salt', 'black pepper', 'common dried herbs and spices', 'cooking oil', 'cooking spray', 'butter'];

const docOf = (db: Firestore, householdId: string) => doc(db, 'households', householdId, 'settings', 'food');

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, max) : '');

/** Trimmed, de-duplicated (ignoring case), non-empty and within the limits. */
function words(list: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const w = clip(v, maxLength);
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
  }
  return out.slice(0, maxItems);
}

function toPerson(value: unknown): FoodPerson | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = clip(v.name, FOOD_LIMITS.name);
  const id = clip(v.id, FOOD_LIMITS.id);
  if (!name || !id) return null;
  const member = clip(v.member, FOOD_LIMITS.member).toLowerCase();
  const note = clip(v.note, FOOD_LIMITS.note);
  const diets = Array.isArray(v.diets) ? DIETS.filter((d) => (v.diets as unknown[]).includes(d)) : [];
  return {
    id,
    name,
    ...(member ? { member } : {}),
    diets,
    avoid: words(v.avoid, FOOD_LIMITS.avoid, FOOD_LIMITS.avoidItem),
    ...((SPICE_LEVELS as readonly unknown[]).includes(v.spice) ? { spice: v.spice as SpiceTolerance } : {}),
    ...(note ? { note } : {}),
  };
}

/** Reads a stored document defensively; a missing one is nobody yet and the default pantry. */
export function toFood(data: Record<string, unknown> | undefined): FoodPreferences {
  if (!data) return { people: [], pantryAssumed: [...DEFAULT_PANTRY], updatedAt: 0, by: '' };
  const people: FoodPerson[] = [];
  const ids = new Set<string>();
  for (const p of Array.isArray(data.people) ? data.people : []) {
    const person = toPerson(p);
    if (person && !ids.has(person.id)) {
      ids.add(person.id);
      people.push(person);
    }
  }
  return {
    people: people.slice(0, FOOD_LIMITS.people),
    pantryAssumed: Array.isArray(data.pantryAssumed) ? words(data.pantryAssumed, FOOD_LIMITS.pantry, FOOD_LIMITS.pantryItem) : [...DEFAULT_PANTRY],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    by: typeof data.by === 'string' ? data.by : '',
  };
}

/** The stored document: cleaned and clipped to the rules' limits. */
export function foodDoc(input: FoodInput, by: string, now = Date.now()): FoodPreferences {
  const { people, pantryAssumed } = toFood({ ...input });
  return { people, pantryAssumed, updatedAt: now, by: by.trim().toLowerCase() };
}

/** Follows the household's food preferences (the default when none are saved yet). */
export function watchFood(db: Firestore, householdId: string, onChange: (food: FoodPreferences) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    docOf(db, householdId),
    (snap) => onChange(toFood(snap.exists() ? snap.data() : undefined)),
    (error) => onError?.(error),
  );
}

/** Saves the whole document; the last save wins. */
export async function saveFood(db: Firestore, householdId: string, input: FoodInput, by: string): Promise<void> {
  await setDoc(docOf(db, householdId), foodDoc(input, by));
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The list with every member in it: members not listed yet are added (named from their profile, or
 * their email's first part, capitalised) with no diets, after the people already there. Nothing is saved.
 */
export function withMembers(people: FoodPerson[], members: { email: string; name?: string }[]): FoodPerson[] {
  const listed = new Set(people.flatMap((p) => (p.member ? [p.member.toLowerCase()] : [])));
  const added = members
    .filter((m) => !listed.has(m.email.toLowerCase()))
    .map((m) => ({
      id: m.email.toLowerCase(),
      name: clip(m.name?.trim().split(/\s+/)[0] || capitalise(m.email.split('@')[0]), FOOD_LIMITS.name),
      member: m.email.toLowerCase(),
      diets: [] as Diet[],
      avoid: [] as string[],
    }));
  return [...people, ...added].slice(0, FOOD_LIMITS.people);
}

/**
 * The most heat (0–3) a shared meal should usually have: the lowest tolerance anyone has set, or
 * undefined when nobody has set one.
 */
export function householdMaxHeat(food: Pick<FoodPreferences, 'people'>): number | undefined {
  const levels = food.people.flatMap((p) => (p.spice ? [SPICE_MAX_HEAT[p.spice]] : []));
  return levels.length ? Math.min(...levels) : undefined;
}

const SPICE_GUIDANCE: Record<SpiceTolerance, string> = {
  none: 'keep meals mild, heat 0 of 3; a slight touch of heat (1) is tolerable now and then but not ideal',
  mild: 'a little heat is fine, up to 1 of 3; hotter now and then at most',
  medium: 'medium heat is welcome, up to 2 of 3',
  hot: 'enjoys spicy food, any heat',
};

/** "Pat: keep meals mild, heat 0 of 3; …", one line per person who set a tolerance. */
export function householdSpiceLines(food: Pick<FoodPreferences, 'people'>): string[] {
  return food.people.flatMap((p) => (p.spice ? [`${p.name}: ${SPICE_GUIDANCE[p.spice]}.`] : []));
}

/** Every diet anyone in the household has, in the fixed order: for filtering recipes. */
export function householdDiets(food: Pick<FoodPreferences, 'people'>): Diet[] {
  return DIETS.filter((d) => food.people.some((p) => p.diets.includes(d)));
}

const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** Options for `householdDietRules`. */
export interface DietRulesOptions {
  /**
   * Leave preference diets (GERD, low-sodium; see `isStrict`) out of the rules, for apps that word
   * them separately with `householdDietPreferences`. Default false: every diet is worded as a rule.
   */
  strictOnly?: boolean;
}

/**
 * The household's food constraints as plain sentences, for a meal-idea prompt or to show next to a
 * suggestion: one per diet per person with what it means, one per person's avoid list and note,
 * and, when more than one person has constraints, that shared meals must suit all of them.
 * Empty when nobody has any. With `strictOnly`, preference diets are left out (see
 * `householdDietPreferences`).
 */
export function householdDietRules(food: Pick<FoodPreferences, 'people'>, { strictOnly = false }: DietRulesOptions = {}): string[] {
  const rules: string[] = [];
  let constrained = 0;
  for (const p of food.people) {
    const before = rules.length;
    for (const d of p.diets) if (!strictOnly || isStrict(d)) rules.push(`${p.name} ${DIET_PHRASES[d]}: ${DIET_GUIDANCE[d]}.`);
    if (p.avoid.length) rules.push(`${p.name} avoids ${list(p.avoid)}.`);
    if (p.note) rules.push(`About ${p.name}: ${p.note.replace(/[.\s]+$/, '')}.`);
    if (rules.length > before) constrained++;
  }
  if (constrained > 1) rules.push('Meals for the whole household should suit all of these at once.');
  return rules;
}

/**
 * The household's preference diets as soft guidance, one line each: "Sam has GERD (reflux): most
 * meals, not every one, should follow this: avoid spicy food, …". Pair with `householdDietRules(food,
 * { strictOnly: true })`: most meals should lean this way, not every one.
 */
export function householdDietPreferences(food: Pick<FoodPreferences, 'people'>): string[] {
  return [
    ...food.people.flatMap((p) =>
      p.diets.filter((d) => !isStrict(d)).map((d) => `${p.name} ${DIET_PHRASES[d]}: most meals, not every one, should follow this: ${DIET_GUIDANCE[d]}.`),
    ),
    ...householdSpiceLines(food),
  ];
}

/** What `pseudonymousFood` returns: the people under stand-in names, and the way back. */
export interface PseudonymousFood {
  /**
   * Only the people, each as "Person A", "Person B", … (in list order) with their diets, avoid list,
   * spice and note, no name, id or email, and names and emails taken out of the note. Nothing else
   * from the input is carried (not `by`, the saving member's email).
   */
  food: Pick<FoodPreferences, 'people'>;
  /** Puts the real names back in text that came back from a model: "Person B" becomes the second person's name. */
  restore: (text: string) => string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** Without accents, so "José" in a note matches the person "Jose" (and the reverse). */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const label = (i: number) => `Person ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ''}`;

/**
 * The household's food preferences with nobody named, for a prompt sent to a model outside the
 * household (Gemini): each person becomes "Person A", "Person B", … by their place in the list, so
 * the stand-ins are stable while the list is, and diets, allergies and notes stay but are not tied
 * to anyone's name or email. In a note, every listed person's name, each word of it, their email
 * and its first part are replaced by their stand-in, ignoring case and accents (the note goes without
 * accents), and any other email
 * by "someone"; `others` names more people to replace by "someone" (household members not in the
 * list). A note is free text: anything else in it (a stranger's name, a phone number, an address)
 * goes to the model as written, so the portal asks for food notes, not contact details. Avoid lists
 * are ingredients and stay as written: a first name can be a food ("Olive"), and "olive oil" must
 * reach the model intact. Build the prompt's rules from `food` (householdDietRules,
 * householdDietPreferences, householdSpiceLines); show the household anything the model wrote about
 * a person through `restore`.
 */
export function pseudonymousFood(food: Pick<FoodPreferences, 'people'>, others: { email?: string; name?: string }[] = []): PseudonymousFood {
  const swaps = new Map<string, string>();
  const add = (term: string | undefined, to: string) => {
    const t = fold(term?.trim().toLowerCase() ?? '');
    if (t.length >= 2 && !swaps.has(t)) swaps.set(t, to);
  };
  const addPerson = (name: string | undefined, email: string | undefined, to: string) => {
    add(name, to);
    for (const word of name?.split(/\s+/) ?? []) add(word, to);
    add(email, to);
    add(email?.split('@')[0], to);
  };
  food.people.forEach((p, i) => addPerson(p.name, p.member ?? (p.id.includes('@') ? p.id : undefined), label(i)));
  for (const o of others) addPerson(o.name, o.email, 'someone');
  // Longest first, so "mary ann" goes before "mary"; whole words only.
  const terms = [...swaps.keys()].sort((a, b) => b.length - a.length);
  const pattern = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  const scrub = (text: string) => {
    const folded = fold(text).replace(EMAIL, (m) => swaps.get(m.toLowerCase()) ?? 'someone');
    return pattern ? folded.replace(pattern, (m) => swaps.get(m.toLowerCase()) ?? m) : folded;
  };
  const people = food.people.map((p, i): FoodPerson => ({
    id: `person-${i + 1}`,
    name: label(i),
    diets: [...p.diets],
    avoid: [...p.avoid],
    ...(p.spice ? { spice: p.spice } : {}),
    ...(p.note ? { note: scrub(p.note) } : {}),
  }));
  const back = new Map(food.people.map((p, i) => [label(i), p.name]));
  const restore = (text: string) => text.replace(/\bPerson [A-Z]\d*\b/g, (m) => back.get(m) ?? m);
  return { food: { people }, restore };
}

/** "Assume the kitchen already has salt, black pepper and cooking oil." or '' when the list is empty. */
export function pantryText(food: Pick<FoodPreferences, 'pantryAssumed'>): string {
  return food.pantryAssumed.length ? `Assume the kitchen already has ${list(food.pantryAssumed)}.` : '';
}
