/**
 * Regular charges in card spending: subscriptions and bills paid by card, found from the
 * transactions alone. `findRecurring(transactions, { now })` groups charges by merchant
 * (`merchantKey` strips processor prefixes, store numbers, ids, phone numbers and the city and
 * state), then keeps the groups that come back on a steady schedule for a steady amount. Pure:
 * nothing is read or stored, and every date is a calendar day (`'YYYY-MM-DD'`).
 *
 * The kit knows only national subscription services and bill payees by name; anything a household
 * calls its own (category names, merchants it never wants suggested) is passed in as options.
 */
import { type Ymd } from './time';
export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
/** One card transaction. Charges are positive; refunds and credits negative. */
export interface CardCharge {
    date: Ymd;
    description: string;
    amount: number;
    category?: string;
    /** The statement's own type ("Sale", "Return", "Payment"), when it has one. */
    type?: string;
}
export interface RecurringCandidate {
    /** The normalised merchant ("netflix", "planet fitness"); with `#<dollars>` when one merchant has two regular charges of different sizes. */
    merchantKey: string;
    /** "Netflix", or the merchant's words in title case. */
    displayName: string;
    cadence: Cadence;
    /** The amount to expect next, in the transactions' currency units, rounded to cents. */
    typicalAmount: number;
    /** True when the charges were not all the same to the cent (a utility, a price change). */
    amountVaries: boolean;
    /** The newest charge. */
    lastDate: Ymd;
    /** When the next charge should come: one interval after `lastDate`, moved past `now` when that has gone by. */
    nextExpected: Ymd;
    occurrences: number;
    /** 0 to 1. Steady gaps, steady amounts, more occurrences and a well-known service raise it; a category that is rarely a bill lowers it. */
    confidence: number;
    /** A subscription service rather than a utility or insurance bill. */
    subscription: boolean;
    /** Whether the merchant is a well-known subscription service or bill payee. */
    known: 'subscription' | 'bill' | null;
    /** The category most of its charges carry, if any. */
    category: string | null;
    /** `typicalAmount` per month (weekly × 52 / 12, quarterly / 3, yearly / 12), rounded to cents. */
    monthlyAmount: number;
}
export interface RecurringOptions {
    /** Today, as a day or a moment. */
    now: Ymd | number;
    /** Candidates below this confidence are left out. Default 0.5. */
    minConfidence?: number;
    /** Words in a category that mean "rarely a bill" (groceries, dining, fuel). Lowercase; replaces the default. */
    notBillCategories?: readonly string[];
    /** Words in a category that mean a bill whose amount may vary (utilities, insurance). Lowercase; replaces the default. */
    billCategories?: readonly string[];
    /** Words in a category that mean a subscription. Lowercase; replaces the default. */
    subscriptionCategories?: readonly string[];
    /** Merchant keys (as `merchantKey` gives them) never to suggest. */
    ignore?: readonly string[];
}
interface CadenceSpec {
    days: number;
    tolerance: number;
    /** Charges needed before it counts. */
    min: number;
    perMonth: number;
    next: (d: Ymd, day: number) => Ymd;
}
export declare const CADENCES: Record<Cadence, CadenceSpec>;
/** What each cadence is called, in the active language ("Monthly", "Mensual", "Maandelijks"). */
export declare const CADENCE_LABELS: Readonly<Record<Cadence, string>>;
/** An amount per `cadence` as an amount per month, rounded to cents. */
export declare const monthlyEquivalent: (amount: number, cadence: Cadence) => number;
export declare const DEFAULT_NOT_BILL_CATEGORIES: string[];
export declare const DEFAULT_BILL_CATEGORIES: string[];
export declare const DEFAULT_SUBSCRIPTION_CATEGORIES: string[];
/**
 * A merchant's name as a stable key: "SQ *BLUE BOTTLE #123 OAKLAND CA" and "Blue Bottle 123" both
 * give "blue bottle"; "NETFLIX.COM 866-579-7172 CA" and "Netflix Subscription" give "netflix".
 * At most three words. Empty when the text has no letters or digits.
 */
export declare function merchantKey(description: string): string;
/** "Netflix" for a known service; otherwise the key's words in title case ("Blue Bottle"). */
export declare function merchantName(key: string): string;
/**
 * Whether two names are the same merchant: the same known service, one key's words all in the
 * other's, or most of their words shared. For matching a candidate against bills a household
 * already has ("Netflix" and "NETFLIX.COM", "Planet Fitness" and "Planet Fitness gym").
 */
export declare function sameMerchant(a: string, b: string): boolean;
/**
 * Regular charges among card transactions, most confident first. Refunds, credits and card
 * payments are left out; so are charges that stopped (overdue by half an interval or more).
 */
export declare function findRecurring(transactions: readonly CardCharge[], options: RecurringOptions): RecurringCandidate[];
export {};
