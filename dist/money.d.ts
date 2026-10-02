/**
 * Money without float drift, in two shapes:
 *
 * - **cents** (`number`, an integer): what a form stores. `parseCents` reads what someone typed,
 *   `formatCents` shows it, `centsToInput` puts it back in the field.
 * - **`Money`** (`{ amount: '1234.50', currency: 'USD' }`, a decimal string): what imported data
 *   carries, the same shape as the household CLIs' JSON. `toDecimal` reads statement text
 *   ("$1,234.50", "(30.00)", "30.00 CR"), `formatMoney` shows it, `sumMoney` adds it up.
 *
 * Display follows DESIGN.md: the currency symbol and two decimals, except the one headline figure,
 * which rounds to whole units (`{ headline: true }`).
 */
export interface Money {
    /** A decimal string with two places, negative for credits: "1234.50", "-20.00". */
    amount: string;
    currency: string;
}
/** The default cap on a typed amount: $1,000,000.00. */
export declare const MAX_CENTS = 100000000;
/**
 * "89.99", "$1,234.5", "40", "40." → cents; blank → undefined; anything else (negative, more than
 * two decimals, over `max`) → null. Integer arithmetic only.
 */
export declare function parseCents(text: string, { max }?: {
    max?: number;
}): number | undefined | null;
/** 12345 → "$123.45"; `headline` rounds to whole units for the one big number: "$1,235". */
export declare function formatCents(cents: number, { headline, currency }?: {
    headline?: boolean;
    currency?: string;
}): string;
/** Cents back to what an amount field shows: 12050 → "120.50"; nothing → "". */
export declare const centsToInput: (cents: number | undefined | null) => string;
/**
 * "1,234.5", "$1,234.50", "(30.00)", "30.00 CR" or 12.5 → a two-place decimal string ("-30.00" for
 * the credit forms); null when it isn't money. Rounds half up on the third place.
 */
export declare function toDecimal(v: unknown): string | null;
export declare const usd: (amount: string) => Money;
/** A `Money` as integer cents. */
export declare function moneyToCents(m: Money): number;
/** Integer cents as a `Money`. */
export declare function centsToMoney(cents: number, currency?: string): Money;
/** "$1,234.50"; credits as "-$20.00"; `headline` rounds to whole units. */
export declare function formatMoney(m: Money, { headline }?: {
    headline?: boolean;
}): string;
/** The sum of the amounts in the first one's currency (others are left out); null for none. */
export declare function sumMoney(list: Money[]): Money | null;
