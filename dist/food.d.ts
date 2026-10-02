import { type Firestore, type Unsubscribe } from 'firebase/firestore';
/**
 * The household's food preferences: who eats at home, their diets, allergies and dislikes, and the
 * kitchen basics a recipe may assume. One document, `households/{id}/settings/food`, edited in the
 * portal and read by any app that suggests meals (Tasks' meal ideas), so every app plans for the
 * same people. `householdDietRules` words it as plain constraints for a prompt or a filter.
 *
 * The rules check the document's shape (FOOD_FIELDS, list sizes, the pantry); they can't afford to check
 * every person's fields, so writes go through `saveFood`, which clips each person to FOOD_PERSON_FIELDS
 * and FOOD_LIMITS. Keep them in step.
 */
export declare const DIETS: readonly ["vegan", "vegetarian", "pescatarian", "gluten-free", "dairy-free", "nut allergy", "shellfish allergy", "gerd", "pregnant", "low-sodium", "halal", "kosher"];
export type Diet = (typeof DIETS)[number];
/** How a chip names each diet. */
export declare const DIET_LABELS: Record<Diet, string>;
/** What each diet means for a meal, from well-known guidance, in plain words. */
export declare const DIET_GUIDANCE: Record<Diet, string>;
/**
 * Whether each diet is a rule (true) or a preference (false). A strict reflux or low-salt diet every
 * day leaves only bland food (and many people manage reflux with medication), so apps rate and order
 * meals for preferences instead of dropping them. Beliefs, allergies and pregnancy safety are rules.
 * A Record, so adding a diet forces the choice.
 */
export declare const DIET_STRICT: Readonly<Record<Diet, boolean>>;
/** Whether a meal that breaks this diet must be left out (true) or only rated and ordered (false). */
export declare function isStrict(diet: Diet): boolean;
/** The preference diets, in DIETS order. */
export declare const GENTLE_DIETS: readonly Diet[];
export interface FoodPerson {
    /** Stable within the household's list: the member's email, or an invented id for someone without an account. */
    id: string;
    name: string;
    /** The member's email when this person has an account in the household. */
    member?: string;
    diets: Diet[];
    /** Ingredients they avoid or dislike: "cilantro", "olives". */
    avoid: string[];
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
export declare const FOOD_FIELDS: readonly ["people", "pantryAssumed", "updatedAt", "by"];
export declare const FOOD_PERSON_FIELDS: readonly ["id", "name", "member", "diets", "avoid", "note"];
/** The rules' limits. List entries may not contain `|` (the rules check a list as one joined string). */
export declare const FOOD_LIMITS: {
    readonly people: 20;
    readonly id: 60;
    readonly name: 60;
    readonly member: 254;
    readonly avoid: 30;
    readonly avoidItem: 40;
    readonly note: 200;
    readonly pantry: 40;
    readonly pantryItem: 40;
};
/** What a kitchen usually has; the household edits it. */
export declare const DEFAULT_PANTRY: readonly string[];
/** Reads a stored document defensively; a missing one is nobody yet and the default pantry. */
export declare function toFood(data: Record<string, unknown> | undefined): FoodPreferences;
/** The stored document: cleaned and clipped to the rules' limits. */
export declare function foodDoc(input: FoodInput, by: string, now?: number): FoodPreferences;
/** Follows the household's food preferences (the default when none are saved yet). */
export declare function watchFood(db: Firestore, householdId: string, onChange: (food: FoodPreferences) => void, onError?: (error: Error) => void): Unsubscribe;
/** Saves the whole document; the last save wins. */
export declare function saveFood(db: Firestore, householdId: string, input: FoodInput, by: string): Promise<void>;
/**
 * The list with every member in it: members not listed yet are added (named from their profile, or
 * their email's first part, capitalised) with no diets, after the people already there. Nothing is saved.
 */
export declare function withMembers(people: FoodPerson[], members: {
    email: string;
    name?: string;
}[]): FoodPerson[];
/** Every diet anyone in the household has, in the fixed order: for filtering recipes. */
export declare function householdDiets(food: Pick<FoodPreferences, 'people'>): Diet[];
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
export declare function householdDietRules(food: Pick<FoodPreferences, 'people'>, { strictOnly }?: DietRulesOptions): string[];
/**
 * The household's preference diets as soft guidance, one line each: "Sam has GERD (reflux): most
 * meals, not every one, should follow this: avoid spicy food, …". Pair with `householdDietRules(food,
 * { strictOnly: true })`: most meals should lean this way, not every one.
 */
export declare function householdDietPreferences(food: Pick<FoodPreferences, 'people'>): string[];
/** "Assume the kitchen already has salt, black pepper and cooking oil." or '' when the list is empty. */
export declare function pantryText(food: Pick<FoodPreferences, 'pantryAssumed'>): string;
