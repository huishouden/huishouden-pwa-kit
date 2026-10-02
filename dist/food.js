import { doc, onSnapshot, setDoc } from 'firebase/firestore';
/**
 * The household's food preferences: who eats at home, their diets, allergies and dislikes, and the
 * kitchen basics a recipe may assume. One document, `households/{id}/settings/food`, edited in the
 * portal and read by any app that suggests meals (Tasks' meal ideas), so every app plans for the
 * same people. `householdDietRules` words it as plain constraints for a prompt or a filter.
 *
 * Fields match the rules exactly (see FOOD_FIELDS, FOOD_PERSON_FIELDS and FOOD_LIMITS); keep them in step.
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
];
/** How a chip names each diet. */
export const DIET_LABELS = {
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
/** "Sam is vegetarian", "Sam has GERD (reflux)": what the diet says about the person. */
const DIET_PHRASES = {
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
export const DIET_GUIDANCE = {
    vegan: 'no meat, poultry, fish or seafood, and no dairy, eggs or honey, including ingredients made from them (stock, gelatin, fish sauce, butter)',
    vegetarian: 'no meat, poultry, fish or seafood, including ingredients made from them (meat or fish stock, gelatin, fish sauce, anchovies)',
    pescatarian: 'no meat or poultry; fish, seafood, eggs and dairy are fine',
    'gluten-free': 'no wheat, barley or rye, and only oats labelled gluten-free, including in pasta, bread, breadcrumbs, flour-thickened sauces, stock cubes and soy sauce (tamari is fine)',
    'dairy-free': 'no milk, cream, butter, cheese or yogurt, including in sauces and baking',
    'nut allergy': 'a strict allergy: no peanuts or tree nuts (almonds, cashews, walnuts, pecans, pistachios, hazelnuts), nut oils or nut butters, or ingredients that may contain them, such as pesto, satay and some sauces',
    'shellfish allergy': 'a strict allergy: no shrimp, prawns, crab, lobster, crayfish, clams, mussels, oysters, scallops or squid, and no sauces or stocks made from them',
    gerd: 'avoid spicy food, citrus, tomato-heavy dishes, fried and fatty food, mint, chocolate, caffeine and carbonated drinks; no large meals late in the evening',
    pregnant: 'no raw or undercooked meat, poultry, eggs, fish or shellfish (no sushi, rare meat or runny eggs); no high-mercury fish (shark, swordfish, king mackerel, tilefish, bigeye tuna); no unpasteurised milk or soft cheese made from it; deli meats and hot dogs only heated until steaming; no alcohol; keep caffeine low',
    'low-sodium': 'keep salt low: little added salt, and go easy on soy sauce, stock cubes, cured meat, cheese and canned or processed food',
    halal: 'no pork or alcohol (including in cooking); meat and poultry should be halal',
    kosher: 'no pork or shellfish, and no meat and dairy in the same meal; meat should be kosher',
};
export const FOOD_FIELDS = ['people', 'pantryAssumed', 'updatedAt', 'by'];
export const FOOD_PERSON_FIELDS = ['id', 'name', 'member', 'diets', 'avoid', 'note'];
/** The rules' limits. List entries may not contain `|` (the rules check a list as one joined string). */
export const FOOD_LIMITS = { people: 20, id: 60, name: 60, member: 254, avoid: 30, avoidItem: 40, note: 200, pantry: 40, pantryItem: 40 };
/** What a kitchen usually has; the household edits it. */
export const DEFAULT_PANTRY = ['salt', 'black pepper', 'common dried herbs and spices', 'cooking oil', 'cooking spray', 'butter'];
const docOf = (db, householdId) => doc(db, 'households', householdId, 'settings', 'food');
const clip = (s, max) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, max) : '');
/** Trimmed, de-duplicated (ignoring case), non-empty and within the limits. */
function words(list, maxItems, maxLength) {
    if (!Array.isArray(list))
        return [];
    const seen = new Set();
    const out = [];
    for (const v of list) {
        const w = clip(v, maxLength);
        if (!w || seen.has(w.toLowerCase()))
            continue;
        seen.add(w.toLowerCase());
        out.push(w);
    }
    return out.slice(0, maxItems);
}
function toPerson(value) {
    if (!value || typeof value !== 'object')
        return null;
    const v = value;
    const name = clip(v.name, FOOD_LIMITS.name);
    const id = clip(v.id, FOOD_LIMITS.id);
    if (!name || !id)
        return null;
    const member = clip(v.member, FOOD_LIMITS.member).toLowerCase();
    const note = clip(v.note, FOOD_LIMITS.note);
    const diets = Array.isArray(v.diets) ? DIETS.filter((d) => v.diets.includes(d)) : [];
    return {
        id,
        name,
        ...(member ? { member } : {}),
        diets,
        avoid: words(v.avoid, FOOD_LIMITS.avoid, FOOD_LIMITS.avoidItem),
        ...(note ? { note } : {}),
    };
}
/** Reads a stored document defensively; a missing one is nobody yet and the default pantry. */
export function toFood(data) {
    if (!data)
        return { people: [], pantryAssumed: [...DEFAULT_PANTRY], updatedAt: 0, by: '' };
    const people = [];
    const ids = new Set();
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
export function foodDoc(input, by, now = Date.now()) {
    const { people, pantryAssumed } = toFood({ ...input });
    return { people, pantryAssumed, updatedAt: now, by: by.trim().toLowerCase() };
}
/** Follows the household's food preferences (the default when none are saved yet). */
export function watchFood(db, householdId, onChange, onError) {
    return onSnapshot(docOf(db, householdId), (snap) => onChange(toFood(snap.exists() ? snap.data() : undefined)), (error) => onError?.(error));
}
/** Saves the whole document; the last save wins. */
export async function saveFood(db, householdId, input, by) {
    await setDoc(docOf(db, householdId), foodDoc(input, by));
}
/**
 * The list with every member in it: members not listed yet are added (named from their profile, or
 * their email's first part) with no diets, after the people already there. Nothing is saved.
 */
export function withMembers(people, members) {
    const listed = new Set(people.flatMap((p) => (p.member ? [p.member.toLowerCase()] : [])));
    const added = members
        .filter((m) => !listed.has(m.email.toLowerCase()))
        .map((m) => ({
        id: m.email.toLowerCase(),
        name: clip(m.name?.split(/\s+/)[0] || m.email.split('@')[0], FOOD_LIMITS.name),
        member: m.email.toLowerCase(),
        diets: [],
        avoid: [],
    }));
    return [...people, ...added].slice(0, FOOD_LIMITS.people);
}
/** Every diet anyone in the household has, in the fixed order: for filtering recipes. */
export function householdDiets(food) {
    return DIETS.filter((d) => food.people.some((p) => p.diets.includes(d)));
}
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
/**
 * The household's food constraints as plain sentences, for a meal-idea prompt or to show next to a
 * suggestion: one per diet per person with what it means, one per person's avoid list and note,
 * and, when more than one person has constraints, that shared meals must suit all of them.
 * Empty when nobody has any.
 */
export function householdDietRules(food) {
    const rules = [];
    let constrained = 0;
    for (const p of food.people) {
        const before = rules.length;
        for (const d of p.diets)
            rules.push(`${p.name} ${DIET_PHRASES[d]}: ${DIET_GUIDANCE[d]}.`);
        if (p.avoid.length)
            rules.push(`${p.name} avoids ${list(p.avoid)}.`);
        if (p.note)
            rules.push(`About ${p.name}: ${p.note.replace(/[.\s]+$/, '')}.`);
        if (rules.length > before)
            constrained++;
    }
    if (constrained > 1)
        rules.push('Meals for the whole household should suit all of these at once.');
    return rules;
}
/** "Assume the kitchen already has salt, black pepper and cooking oil." or '' when the list is empty. */
export function pantryText(food) {
    return food.pantryAssumed.length ? `Assume the kitchen already has ${list(food.pantryAssumed)}.` : '';
}
