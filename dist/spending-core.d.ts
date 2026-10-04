import { type Mailbox, type MailMessage } from './mail-core';
/**
 * Huishouden Spending's core, shared by the app and huishouden/calendar's mail checker so both read
 * a card alert the same way: categories from the household's rules, matching a new transaction
 * against those the household has, card alert emails to transactions, and the transaction document
 * as the rules allow it (huishouden/rules `spendingTransactions`). No browser, no Firebase.
 */
/**
 * Categories come from the household's own rules: "when the merchant contains X, it's category Y".
 * A new household starts with DEFAULT_RULES (national chains and generic words, the same ground the
 * Apps Script's built-in rules covered); the household edits, adds and removes them as data.
 */
export interface CategoryRule {
    contains: string;
    category: string;
}
/** The dashboard's categories, in the order the Settings screen offers them. */
export declare const CATEGORIES: readonly ["Groceries", "Dining & Food", "Shopping & Retail", "Gas & Transport", "Subscriptions & Tech", "Bills & Utilities", "Home & Garden", "Health & Personal Care", "Travel & Lodging", "Entertainment", "Miscellaneous"];
/** Where a charge goes when no rule matches and the statement file names no category. */
export declare const FALLBACK_CATEGORY = "Miscellaneous";
/** The chart's bucket for the smallest categories past eight. */
export declare const OTHER_CATEGORY = "Other";
export declare const DEFAULT_RULES: CategoryRule[];
/**
 * Whether `needle` occurs in `text` starting at a word boundary, so "market" finds "FARMERS MARKET"
 * and "MARKETPLACE" but "gas" does not find "VEGAS".
 */
export declare function matchesRule(text: string, needle: string): boolean;
/**
 * The household's category for a merchant: the rule with the longest matching phrase wins, so
 * "amazon web services" beats "amazon", and a household's "example cafe → Groceries" beats the
 * default "cafe". On a tie the later rule (usually the household's own) wins.
 * Returns null when no rule matches.
 */
export declare function ruleCategory(merchant: string, list: CategoryRule[]): string | null;
/** Rule first, then the category the bank's file gave (in the dashboard's words), then Miscellaneous. */
export declare function categorise(merchant: string, list: CategoryRule[], bankCategory?: string): string;
/** A bank's own category name (a statement file's column) in the dashboard's words. */
export declare function cleanCategoryName(cat: string): string;
/**
 * Whether an incoming transaction (a statement file row or a card alert email) is one the household
 * already has. The rules are the Apps Script's (apps-script/Code.gs findExisting): the same card,
 * the same amount, dates at most MATCH_WINDOW_DAYS apart, because an alert carries the email's date
 * and a statement the transaction's date. Added here: the descriptions must look alike, so two
 * different shops charging the same amount in the same week stay two transactions.
 */
export declare const MATCH_WINDOW_DAYS = 3;
export type Source = 'statement' | 'alert';
export interface TxFields {
    date: string;
    description: string;
    amount: number;
    card: string;
    source?: string;
    /** Which statement file a row came from, when several are imported together. */
    group?: number;
}
export interface Existing extends TxFields {
    id: string;
}
/** The words of a description that identify the merchant: letters only, 3+ long, no filler. */
export declare function merchantWords(description: string): string[];
/**
 * Alike when they share a merchant word, or when one has no merchant words at all (an alert that
 * only said "Card purchase"), or when one word starts the other ("AMZN" and "AMAZON" do not, but
 * "BOOKSHOP" and "BOOKSHOPS" do).
 */
export declare function similarDescriptions(a: string, b: string): boolean;
/** The script's rule plus alike descriptions: same card and amount, within the window. */
export declare function sameTransaction(a: TxFields, b: TxFields): boolean;
/** Two statement rows are the same only when they agree on everything: a statement's date is exact. */
export declare function sameStatementRow(a: TxFields, b: TxFields): boolean;
export interface Plan<T extends TxFields> {
    /** New transactions to write. */
    create: T[];
    /** Alerts the household already has that this statement row replaces (statements are the record). */
    replace: {
        id: string;
        tx: T;
    }[];
    /** How many incoming were already there. */
    duplicates: number;
}
/**
 * What to write for a batch of incoming transactions of one source.
 *
 * - A statement row the household already has from a statement is skipped (each existing row
 *   accounts for one incoming row, so two identical charges in a file against one already saved
 *   adds the second). Rows repeated across files imported together (overlapping exports) count once.
 * - A statement row matching an alert replaces that alert: the statement has the real date and the
 *   bank's name for the shop.
 * - An alert matching anything already there (or earlier in the batch) is skipped.
 */
export declare function planImport<T extends TxFields>(incoming: T[], existing: Existing[], source: Source): Plan<T>;
/** cyrb53, as apps-script/Firestore.gs: a stable 53-bit hash in base 36. Not cryptographic. */
export declare function stableHash(str: string, seed?: number): string;
/**
 * Document ids for statement rows: stable, so importing the same file twice from two devices at
 * once writes the same documents instead of doubles. Prefixed so they never collide with the ids
 * the Apps Script mirror uses. Identical rows get an occurrence suffix, so give it the whole file
 * (before planning): the second of two identical charges keeps its own id whichever is new.
 */
export declare function statementIds(rows: TxFields[]): string[];
/** An alert's document id: one per email, so checking the same email twice changes nothing. */
export declare const alertId: (messageId: string) => string;
/**
 * Card purchase alert emails to transactions. The patterns are Spending's legacy Apps Script's
 * parseTransactionEmail with every bank name taken out: which emails are card alerts, and which card
 * each is for, comes from the household's cards (their last four digits and alert words).
 */
export interface AlertCard {
    name: string;
    last4?: string;
    /** Sender addresses or words that appear in this card's alert emails. */
    alertWords: string[];
}
export interface ParsedAlert {
    date: string;
    description: string;
    amount: number;
    category: string;
    card: string;
    type: 'Sale' | 'Return';
    last4?: string;
}
/** How far back a check looks, as the Apps Script did: a missed week loses nothing. */
export declare const ALERT_LOOKBACK_DAYS = 30;
/** Gmail's search form of a label name: lowercase, spaces and slashes as dashes. */
export declare const labelToken: (label: string) => string;
/**
 * The Gmail search for the household's card alerts: any card's alert words (an address or domain
 * searches the sender, anything else is a phrase), or any of the household's alert labels. `since`
 * is a number of days back, or `{ after }` (ms since epoch) for mail that arrived after a moment.
 * Null when there is nothing to search for.
 */
export declare function alertQuery(cards: AlertCard[], labels?: string[], since?: number | {
    after: number;
}): string | null;
/**
 * The card an alert is for: its last four digits when the email quotes them and the household has
 * that card; otherwise a word only one card lists (a product name, a sender only that card uses);
 * otherwise the digits as they are, never a guess.
 */
export declare function identifyCard(text: string, cards: AlertCard[]): {
    card: string;
    last4?: string;
};
export declare function cleanMerchantName(raw: string): string;
/** The merchant, by the wordings card alerts use (labelled fields, table cells, sentences). */
export declare function extractMerchant(subject: string, body: string, html: string): string;
/** The calendar day of a moment: in `timeZone` when given (a server reading a member's mail), otherwise where the code runs. */
export declare function dayOf(ms: number, timeZone?: string): string;
export interface ParseOptions {
    /** The household's time zone (IANA), for the alert's date. Default: where the code runs. */
    timeZone?: string;
}
/**
 * What an email is, read as a card alert:
 *
 * - `purchase`: a purchase or refund rule found both the amount and the merchant (`rule` says which).
 * - `not-purchase`: a payment, a declined charge, a statement, a security notice, or mail sent to a
 *   list (newsletters, offers, an investing account's notices) that says nothing of a purchase.
 *   Nothing is written and nobody is asked.
 * - `unreadable`: it looks like a purchase (an amount, a purchase word) but no rule found a merchant
 *   it can trust. Nothing is written: the member is asked ("Couldn't read N emails").
 *
 * Only `purchase` becomes a transaction. A merchant is never a guess from loose wording ("at a
 * reasonable price"), and the amount is the one the rule matched, not the first in the email.
 */
export type AlertReading = {
    kind: 'purchase';
    tx: ParsedAlert;
    rule: string;
} | {
    kind: 'not-purchase';
    reason: NotPurchaseReason;
} | {
    kind: 'unreadable';
    reason: UnreadableReason;
    date: string;
    amount?: number;
};
export type NotPurchaseReason = 'payment' | 'declined' | 'statement' | 'security' | 'account' | 'bulk' | 'no-purchase' | 'no-amount';
export type UnreadableReason = 'no-merchant' | 'generic-merchant';
interface PurchaseRule {
    name: string;
    pattern: RegExp;
    /** Indexes of the amount and merchant groups, and the card's digits when the rule has them. */
    amount: number;
    merchant: number;
    digits?: number;
    refund?: boolean;
    /** Trusted even in mail sent to a list (its wording is an issuer's alert, not prose). */
    strict?: boolean;
}
/**
 * The purchase rules, most specific first. Issuer wordings (Visa Purchase Alerts, "You made a $X
 * transaction with M") are tried before the generic "purchase/transaction/charge of $X at M".
 */
export declare const PURCHASE_RULES: PurchaseRule[];
/** Why a merchant can't be trusted, or null when it can. */
export declare function merchantProblem(merchant: string): UnreadableReason | null;
/** A written date as YYYY-MM-DD (US month first for slashes), or null. */
export declare function writtenDay(token: string): string | null;
/**
 * The transaction's day: a date the email writes for it ("Date: Oct 2, 2031", "on 10/02/2031" in
 * the purchase's sentence), when it is at most 10 days before the email and not after it; otherwise
 * the day the email was sent, in the household's time zone.
 */
export declare function alertDay(text: string, sentence: string, sent: number, timeZone?: string): string;
/** Markup where plain text should be: tags or style attributes. */
export declare const looksLikeHtml: (s: string) => boolean;
/** One email, read as a card alert (see `AlertReading`). */
export declare function readAlert(msg: MailMessage, cards: AlertCard[], rules: CategoryRule[], options?: ParseOptions): AlertReading;
/** One alert email as a transaction, or null when it isn't one it can trust (`readAlert` says why). */
export declare function parseAlertEmail(msg: MailMessage, cards: AlertCard[], rules: CategoryRule[], options?: ParseOptions): ParsedAlert | null;
/**
 * One email check: search the mail for the household's card alerts, read the ones not seen before,
 * and keep those that aren't already a transaction. Pure apart from the mailbox it is handed, so it
 * runs the same against Gmail in the browser, the sample mailbox and test fixtures. A server that
 * finds new mail its own way (Gmail's history) hands the messages to `planAlerts`: the same parsing
 * and matching.
 */
/** At most this many alert emails per check (a month of alerts for a busy household). */
export declare const MAX_ALERTS = 100;
export interface AlertTx extends ParsedAlert {
    /** The document id (one per email). */
    id: string;
    emailId: string;
}
/** An email that looked like a purchase but couldn't be read with confidence: the member is asked about it. */
export interface AlertReview {
    emailId: string;
    subject: string;
    /** When the email was sent (ms). */
    sent: number;
    /** The household's day it was sent. */
    date: string;
    reason: UnreadableReason;
    /** The first amount the email writes, to start "Enter it" with. */
    amount?: number;
}
export interface AlertCheck {
    query: string;
    /** Emails the search found. */
    found: number;
    /** Alerts to write. */
    create: AlertTx[];
    /** Alerts the household already had (from a statement or another member's check). */
    duplicates: number;
    /** Emails that matched the search but weren't a purchase or refund. */
    notPurchases: number;
    /** Emails that looked like purchases but couldn't be read: nothing is written for them. */
    review: AlertReview[];
    /** Message ids read this time, to skip next time. */
    read: string[];
}
/** No card has alert words and there are no alert labels: the app says what to add. */
export declare class NothingToSearch extends Error {
    constructor();
}
export interface AlertInput extends ParseOptions {
    cards: AlertCard[];
    labels: string[];
    rules: CategoryRule[];
    existing: Existing[];
    seen?: Set<string>;
}
/** Messages to the alerts to write: read, oldest first, matched against what the household has. Unconfident ones go to `review`, never to `create`. */
export declare function planAlerts(messages: MailMessage[], input: Omit<AlertInput, 'labels' | 'seen'>): Pick<AlertCheck, 'create' | 'duplicates' | 'notPurchases' | 'review'>;
export declare function checkAlerts(mailbox: Pick<Mailbox, 'search' | 'get'>, input: AlertInput): Promise<AlertCheck>;
/** The fields huishouden/rules allows on `spendingTransactions`. */
export declare const TRANSACTION_FIELDS: readonly ["date", "description", "amount", "category", "card", "type", "source", "last4", "emailId", "importId", "createdAt", "updatedAt", "by"];
export interface NewTransaction {
    date: string;
    description: string;
    amount: number;
    category: string;
    card: string;
    type: string;
    last4?: string;
    emailId?: string;
    /** The mail checker's import that wrote it: "Undo last import" removes that import's rows. */
    importId?: string;
}
/** A transaction document as a member writes it: only the allowed fields, no empty optional ones. */
export declare function transactionDoc(tx: NewTransaction, source: Source, by: string, createdAt: number, updatedAt?: number): {
    by: string;
    updatedAt?: number | undefined;
    createdAt: number;
    importId?: string | undefined;
    emailId?: string | undefined;
    last4?: string | undefined;
    date: string;
    description: string;
    amount: number;
    category: string;
    card: string;
    type: string;
    source: Source;
};
/**
 * `households/{h}/spendingInboxes/{id}`: a Gmail account a member connected so huishouden/calendar's
 * mail checker reads the household's card alerts from it, every few minutes, as that member. Only
 * the address and the checker's last state are here; the Google grant stays sealed in the Worker.
 */
export declare const ALERT_INBOXES = "spendingInboxes";
/** What the checker last ran into: Google access removed, the member left, or no search terms. */
export type InboxError = 'revoked' | 'not-member' | 'nothing-to-search' | 'gmail' | string;
export interface AlertInbox {
    id: string;
    address: string;
    /** The member who connected it (the checker acts as them). */
    by: string;
    connectedAt: number;
    lastAlertAt?: number;
    /** Alerts added by the last check that found any. */
    lastAdded?: number;
    error?: InboxError;
}
export declare function toAlertInbox(id: string, d: Record<string, unknown>): AlertInbox;
export {};
