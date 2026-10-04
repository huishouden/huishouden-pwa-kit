/** The household's currency (ISO 4217, "USD", "EUR"): the default for `formatCents` and amount fields. */
export declare function getCurrency(): string;
/** Sets the currency amounts are shown in when a call names none. Anything but a three-letter code means US dollars. */
export declare function setCurrency(code: string | null | undefined): void;
export declare const isCurrencyCode: (code: unknown) => code is string;
/** The locale's decimal mark: "." in English, "," in Spanish and Dutch. */
export declare function decimalMark(locale?: string): string;
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
 *
 * Either mark works as the decimal point: the last "." or "," followed by one or two digits is the
 * decimal ("12,50" is 12.50 anywhere); followed by three, it's the locale's call ("1.500" is 1500 in
 * Dutch, 1.5 in English). Other marks and spaces group thousands.
 */
export declare function parseCents(text: string, { max, locale }?: {
    max?: number;
    locale?: string;
}): number | undefined | null;
/** 12345 → "$123.45"; `headline` rounds to whole units for the one big number: "$1,235". In the household's currency unless `currency` says. */
export declare function formatCents(cents: number, { headline, currency, locale }?: {
    headline?: boolean;
    currency?: string;
    locale?: string;
}): string;
/** Cents back to what an amount field shows: 12050 → "120.50" ("120,50" in Spanish and Dutch); nothing → "". */
export declare const centsToInput: (cents: number | undefined | null, locale?: string) => string;
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
export declare function formatMoney(m: Money, { headline, locale }?: {
    headline?: boolean;
    locale?: string;
}): string;
/** The sum of the amounts in the first one's currency (others are left out); null for none. */
export declare function sumMoney(list: Money[]): Money | null;
