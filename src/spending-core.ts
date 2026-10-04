import { htmlToText, type Mailbox, type MailMessage } from './mail-core';
import { isTimeZone, offsetAt } from './local-clock';
import { DAY } from './time';

/**
 * Huishouden Spending's core, shared by the app and huishouden/calendar's mail checker so both read
 * a card alert the same way: categories from the household's rules, matching a new transaction
 * against those the household has, card alert emails to transactions, and the transaction document
 * as the rules allow it (huishouden/rules `spendingTransactions`). No browser, no Firebase.
 */

// ---- Categories ----

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
export const CATEGORIES = [
  'Groceries',
  'Dining & Food',
  'Shopping & Retail',
  'Gas & Transport',
  'Subscriptions & Tech',
  'Bills & Utilities',
  'Home & Garden',
  'Health & Personal Care',
  'Travel & Lodging',
  'Entertainment',
  'Miscellaneous',
] as const;

/** Where a charge goes when no rule matches and the statement file names no category. */
export const FALLBACK_CATEGORY = 'Miscellaneous';

/** The chart's bucket for the smallest categories past eight. */
export const OTHER_CATEGORY = 'Other';

const rules = (category: string, words: string[]): CategoryRule[] => words.map((contains) => ({ contains, category }));

export const DEFAULT_RULES: CategoryRule[] = [
  ...rules('Groceries', ['grocery', 'supermarket', 'farmers market', 'whole foods', 'wholefds', 'trader joe', 'safeway', 'kroger', 'costco', 'aldi', 'publix']),
  ...rules('Dining & Food', ['restaurant', 'cafe', 'coffee', 'bakery', 'pizza', 'taco', 'burger', 'grill', 'diner', 'doordash', 'uber eats', 'grubhub', 'starbucks', 'mcdonald', 'chipotle']),
  ...rules('Shopping & Retail', ['amazon', 'mktplace pmts', 'target', 'walmart', 'etsy', 'best buy', 'nike', 'macy']),
  ...rules('Gas & Transport', ['fuel', 'gas station', 'chevron', 'shell oil', 'exxon', 'mobil', 'circle k', 'parking', 'toll', 'transit', 'lyft', 'uber trip']),
  ...rules('Subscriptions & Tech', ['netflix', 'spotify', 'hulu', 'disney plus', 'apple.com', 'google storage', 'amazon web services', 'subscription']),
  ...rules('Bills & Utilities', ['utility', 'utilities', 'electric', 'water bill', 'internet', 'wireless', 'insurance', 'comcast', 'xfinity', 'verizon', 't-mobile']),
  ...rules('Home & Garden', ['home depot', "lowe's", 'lowes', 'ikea', 'wayfair', 'hardware', 'garden', 'nursery']),
  ...rules('Health & Personal Care', ['pharmacy', 'cvs', 'walgreens', 'clinic', 'hospital', 'medical', 'doctor', 'dental', 'veterinar', 'animal hospital', 'salon', 'barber', 'fitness', 'gym']),
  ...rules('Travel & Lodging', ['airline', 'airways', 'airbnb', 'hotel', 'motel', 'resort']),
  ...rules('Entertainment', ['cinema', 'theater', 'theatre', 'tickets', 'museum', 'concert']),
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Whether `needle` occurs in `text` starting at a word boundary, so "market" finds "FARMERS MARKET"
 * and "MARKETPLACE" but "gas" does not find "VEGAS".
 */
export function matchesRule(text: string, needle: string): boolean {
  const n = norm(needle);
  if (!n) return false;
  const t = norm(text);
  let from = 0;
  for (;;) {
    const i = t.indexOf(n, from);
    if (i < 0) return false;
    if (i === 0 || !/[a-z0-9]/.test(t[i - 1])) return true;
    from = i + 1;
  }
}

/**
 * The household's category for a merchant: the rule with the longest matching phrase wins, so
 * "amazon web services" beats "amazon", and a household's "example cafe → Groceries" beats the
 * default "cafe". On a tie the later rule (usually the household's own) wins.
 * Returns null when no rule matches.
 */
export function ruleCategory(merchant: string, list: CategoryRule[]): string | null {
  let best: CategoryRule | null = null;
  for (const r of list) {
    if (!r.contains.trim() || !r.category.trim()) continue;
    if (!matchesRule(merchant, r.contains)) continue;
    if (!best || norm(r.contains).length >= norm(best.contains).length) best = r;
  }
  return best ? best.category.trim() : null;
}

/** Rule first, then the category the bank's file gave (in the dashboard's words), then Miscellaneous. */
export function categorise(merchant: string, list: CategoryRule[], bankCategory?: string): string {
  const rule = ruleCategory(merchant, list);
  if (rule) return rule;
  return bankCategory?.trim() ? cleanCategoryName(bankCategory) : FALLBACK_CATEGORY;
}

/** A bank's own category name (a statement file's column) in the dashboard's words. */
export function cleanCategoryName(cat: string): string {
  const trimmed = (cat || '').trim();
  if (!trimmed) return 'Miscellaneous';

  const lower = trimmed.toLowerCase();
  if (lower.includes('groc') || lower.includes('supermarket') || lower.includes('costco') || lower.includes('trader joe')) {
    return 'Groceries';
  }
  if (lower.includes('dining') || lower.includes('restaurant') || lower.includes('food') || lower.includes('cafe') || lower.includes('coffee') || lower.includes('doordash') || lower.includes('uber eats')) {
    return 'Dining & Food';
  }
  if (lower.includes('gas') || lower.includes('fuel') || lower.includes('ev charge') || lower.includes('transit') || lower.includes('parking') || lower.includes('uber') || lower.includes('lyft')) {
    return 'Gas & Transport';
  }
  if (lower.includes('shop') || lower.includes('amazon') || lower.includes('target') || lower.includes('clothing') || lower.includes('electronics')) {
    return 'Shopping & Retail';
  }
  if (lower.includes('sub') || lower.includes('stream') || lower.includes('netflix') || lower.includes('spotify') || lower.includes('apple') || lower.includes('software')) {
    return 'Subscriptions & Tech';
  }
  if (lower.includes('travel') || lower.includes('airline') || lower.includes('flight') || lower.includes('hotel') || lower.includes('airbnb')) {
    return 'Travel & Lodging';
  }
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('concert') || lower.includes('recreation') || lower.includes('game')) {
    return 'Entertainment';
  }
  if (lower.includes('health') || lower.includes('pharmacy') || lower.includes('doctor') || lower.includes('gym') || lower.includes('fitness') || lower.includes('wellness')) {
    return 'Health & Personal Care';
  }
  if (lower.includes('home') || lower.includes('repair') || lower.includes('hardware') || lower.includes('garden') || lower.includes('home depot')) {
    return 'Home & Garden';
  }

  // Capitalize first letter of words
  return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Matching ----

/**
 * Whether an incoming transaction (a statement file row or a card alert email) is one the household
 * already has. The rules are the Apps Script's (apps-script/Code.gs findExisting): the same card,
 * the same amount, dates at most MATCH_WINDOW_DAYS apart, because an alert carries the email's date
 * and a statement the transaction's date. Added here: the descriptions must look alike, so two
 * different shops charging the same amount in the same week stay two transactions.
 */

export const MATCH_WINDOW_DAYS = 3;

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

/** Words that say nothing about which shop it was. */
const FILLER = new Set([
  'the', 'and', 'card', 'purchase', 'payment', 'pos', 'debit', 'credit', 'online', 'www', 'com', 'inc', 'llc', 'ltd', 'co',
  'store', 'shop', 'usa', 'us', 'recurring', 'transaction', 'sale', 'pmts', 'pmt', 'mktplace', 'mktp',
]);

/** The words of a description that identify the merchant: letters only, 3+ long, no filler. */
export function merchantWords(description: string): string[] {
  return description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w));
}

/**
 * Alike when they share a merchant word, or when one has no merchant words at all (an alert that
 * only said "Card purchase"), or when one word starts the other ("AMZN" and "AMAZON" do not, but
 * "BOOKSHOP" and "BOOKSHOPS" do).
 */
export function similarDescriptions(a: string, b: string): boolean {
  const wa = merchantWords(a);
  const wb = merchantWords(b);
  if (wa.length === 0 || wb.length === 0) return true;
  return wa.some((x) => wb.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))));
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const sameText = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** The script's rule plus alike descriptions: same card and amount, within the window. */
export function sameTransaction(a: TxFields, b: TxFields): boolean {
  return a.card === b.card && sameAmount(a.amount, b.amount) && daysApart(a.date, b.date) <= MATCH_WINDOW_DAYS && similarDescriptions(a.description, b.description);
}

/** Two statement rows are the same only when they agree on everything: a statement's date is exact. */
export function sameStatementRow(a: TxFields, b: TxFields): boolean {
  return a.card === b.card && sameAmount(a.amount, b.amount) && a.date === b.date && sameText(a.description, b.description);
}

export interface Plan<T extends TxFields> {
  /** New transactions to write. */
  create: T[];
  /** Alerts the household already has that this statement row replaces (statements are the record). */
  replace: { id: string; tx: T }[];
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
export function planImport<T extends TxFields>(incoming: T[], existing: Existing[], source: Source): Plan<T> {
  const pool: (TxFields & { id?: string; used?: boolean })[] = existing.map((e) => ({ ...e }));
  const plan: Plan<T> = { create: [], replace: [], duplicates: 0 };
  for (const tx of incoming) {
    if (source === 'statement') {
      // Rows of the same file never match each other; overlapping files do.
      const exact = pool.find((e) => !e.used && e.source !== 'alert' && (e.group === undefined || e.group !== tx.group) && sameStatementRow(e, tx));
      if (exact) {
        exact.used = true;
        plan.duplicates++;
        continue;
      }
      const alert = pool.find((e) => !e.used && e.source === 'alert' && e.id && sameTransaction(e, tx));
      if (alert) {
        alert.used = true;
        plan.replace.push({ id: alert.id!, tx });
        continue;
      }
    } else {
      const match = pool.find((e) => !e.used && sameTransaction(e, tx));
      if (match) {
        match.used = true;
        plan.duplicates++;
        continue;
      }
    }
    plan.create.push(tx);
    // A second email about the same purchase is a duplicate of the first; a second identical row in
    // one statement file is a second purchase, but the same row in another file is the same one.
    pool.push({ ...tx, source, group: source === 'statement' ? (tx.group ?? -1) : undefined });
  }
  return plan;
}

/** cyrb53, as apps-script/Firestore.gs: a stable 53-bit hash in base 36. Not cryptographic. */
export function stableHash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Document ids for statement rows: stable, so importing the same file twice from two devices at
 * once writes the same documents instead of doubles. Prefixed so they never collide with the ids
 * the Apps Script mirror uses. Identical rows get an occurrence suffix, so give it the whole file
 * (before planning): the second of two identical charges keeps its own id whichever is new.
 */
export function statementIds(rows: TxFields[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = [r.date, r.description.trim(), r.amount.toFixed(2), r.card].join('|');
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `st-${stableHash(key)}${n ? `-${n}` : ''}`;
  });
}

/** An alert's document id: one per email, so checking the same email twice changes nothing. */
export const alertId = (messageId: string) => `al-${messageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;

// ---- Card alert emails ----

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
export const ALERT_LOOKBACK_DAYS = 30;

const unsafe = (s: string) => s.replace(/["(){}]/g, ' ').replace(/\s+/g, ' ').trim();
const looksLikeSender = (w: string) => /@/.test(w) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(w);

/** Gmail's search form of a label name: lowercase, spaces and slashes as dashes. */
export const labelToken = (label: string) => unsafe(label).toLowerCase().replace(/[\s/]+/g, '-');

/**
 * The Gmail search for the household's card alerts: any card's alert words (an address or domain
 * searches the sender, anything else is a phrase), or any of the household's alert labels. `since`
 * is a number of days back, or `{ after }` (ms since epoch) for mail that arrived after a moment.
 * Null when there is nothing to search for.
 */
export function alertQuery(cards: AlertCard[], labels: string[] = [], since: number | { after: number } = ALERT_LOOKBACK_DAYS): string | null {
  const terms = new Set<string>();
  for (const c of cards) {
    for (const raw of c.alertWords) {
      const w = unsafe(raw);
      if (!w) continue;
      terms.add(looksLikeSender(w) ? `from:(${w.toLowerCase()})` : `"${w}"`);
    }
  }
  for (const l of labels) if (unsafe(l)) terms.add(`label:${labelToken(l)}`);
  if (terms.size === 0) return null;
  const window = typeof since === 'number' ? `newer_than:${since}d` : `after:${Math.floor(since.after / 1000)}`;
  return `${window} (${[...terms].join(' OR ')})`;
}

function wordPattern(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

/**
 * The card an alert is for: its last four digits when the email quotes them and the household has
 * that card; otherwise a word only one card lists (a product name, a sender only that card uses);
 * otherwise the digits as they are, never a guess.
 */
export function identifyCard(text: string, cards: AlertCard[]): { card: string; last4?: string } {
  const m = text.match(/(?:ending|ends)\s+in\s+(\d{4})|\(\.{2,3}\s?(\d{4})\)|x{2,}(\d{4})|\bon card\s+(\d{4})/i);
  const digits = m ? m[1] || m[2] || m[3] || m[4] : undefined;
  const byDigits = digits ? cards.find((c) => c.last4 === digits) : undefined;
  if (byDigits) return { card: byDigits.name, last4: digits };
  const count = new Map<string, number>();
  for (const c of cards) for (const w of new Set(c.alertWords.map((x) => x.trim().toLowerCase()).filter(Boolean))) count.set(w, (count.get(w) ?? 0) + 1);
  for (const c of cards) {
    const own = c.alertWords.map((x) => x.trim()).filter((w) => w && count.get(w.toLowerCase()) === 1);
    if (own.length && wordPattern(own).test(text)) return { card: c.name, ...(digits ? { last4: digits } : {}) };
  }
  return digits ? { card: `Card ...${digits}`, last4: digits } : { card: 'Unknown Card' };
}

export function cleanMerchantName(raw: string): string {
  let s = String(raw || '').trim().replace(/<[^>]*>/g, '').replace(/^(?:at|with|purchase at|charged at)\s+/i, '');
  s = s.replace(/\s+(?:on\s+[A-Za-z]+|on\s+\d{1,2}\/|with your card|with card|\.|\$|\().*$/i, '');
  return s.trim() || 'Card Purchase';
}

/** The merchant, by the wordings card alerts use (labelled fields, table cells, sentences). */
export function extractMerchant(subject: string, body: string, html: string): string {
  const text = `${subject}\n${body}`;
  const isLabel = (s: string) => /Amount|Date|Account|\$|Card ending/i.test(s);

  const labelled = text.match(/(?:Merchant|Payee|Where|Vendor|Store)\s*[:\n\r]+\s*([^\r\n<]+)/i);
  if (labelled && labelled[1].trim() && !isLabel(labelled[1])) return cleanMerchantName(labelled[1]);

  const cell = html.match(/(?:Merchant|Payee|Store|Vendor)[\s\S]*?<td[^>]*>([^<]+)<\/td>/i);
  if (cell && cell[1].trim() && !isLabel(cell[1])) return cleanMerchantName(cell[1]);

  // "77.77 USD at MERCHANT in LOCATION on Card 1234" or "used at MERCHANT in LOCATION, USA for 77.77 USD".
  const located = text.match(/USD at (.+?) in [^\n]+? on Card \d{4}/i) || text.match(/\bat (.+?) in [^\n]+?, [A-Z]{2,3} for [0-9.,]+ USD/);
  if (located && located[1].trim()) return cleanMerchantName(located[1]);

  // "a refund of $18.00 from MERCHANT", "You have a $18.00 refund from MERCHANT".
  const refundFrom = text.match(/(?:refund|credit)(?:\s+of\s+\$[0-9.,]+)?\s+from\s+([^\r\n<]+?)(?:\s+(?:was|on|to)\b|\.\s|\n|<|$)/i);
  if (refundFrom && refundFrom[1].trim() && !isLabel(refundFrom[1])) return cleanMerchantName(refundFrom[1]);

  // "You made a $27.10 transaction with MERCHANT".
  const withMerchant = text.match(/transaction\s+with\s+([^\r\n<]+?)(?:\s+(?:on\b|using\b|was\b)|\.\s|\n|<|$)/i);
  if (withMerchant && withMerchant[1].trim() && !isLabel(withMerchant[1])) return cleanMerchantName(withMerchant[1]);

  // "You spent $12.00 at MERCHANT", "A purchase of $12.50 at MERCHANT was made".
  const at = text.match(/(?:purchase|transaction|charge|spent|used for).*?\bat\s+([A-Za-z0-9 &.,'’\-*#]+?)(?:\s+(?:on|with|using|for|was|has|is)\b|\.|\n|<|\$|\d{1,2}\/\d{1,2})/i);
  if (at && at[1].trim() && !/\b(?:visa|mastercard|card)\b/i.test(at[1])) return cleanMerchantName(at[1]);

  const subj = subject.match(/\bat\s+([A-Za-z0-9 &.,'’\-*#]+?)(?:\s+(?:on\b|with\b)|\.|\$|$)/i);
  if (subj && subj[1].trim()) return cleanMerchantName(subj[1]);

  return 'Card Purchase';
}

/** The calendar day of a moment: in `timeZone` when given (a server reading a member's mail), otherwise where the code runs. */
export function dayOf(ms: number, timeZone?: string): string {
  if (timeZone && isTimeZone(timeZone)) return new Date(ms + offsetAt(timeZone, ms)).toISOString().slice(0, 10);
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ParseOptions {
  /** The household's time zone (IANA), for the alert's date. Default: where the code runs. */
  timeZone?: string;
}

/** One alert email as a transaction, or null when it isn't a purchase or refund (a payment notice, say). */
export function parseAlertEmail(msg: MailMessage, cards: AlertCard[], rules: CategoryRule[], options: ParseOptions = {}): ParsedAlert | null {
  const html = msg.html ?? '';
  const body = msg.text ?? (html ? htmlToText(html) : '');
  const text = `${msg.subject}\n${body}`;

  if (/payment thank you|autopay|automatic payment|payment received|we received your payment|thank you for your payment/i.test(text)) return null;

  const amountMatch = text.match(/\$\s?([0-9,]+\.[0-9]{2})/) || text.match(/([0-9,]+\.[0-9]{2})\s*USD/i);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
  if (!amount || Number.isNaN(amount)) return null;

  const description = extractMerchant(msg.subject, body, html);
  // Only the alert's wording marks a refund.
  const isRefund = /\brefund|\bcredit (?:of|for|to)|\breturn(?:ed)?\b|merchant credit/i.test(text);
  const { card, last4 } = identifyCard(`${msg.from}\n${text}`, cards);
  return {
    date: dayOf(msg.date, options.timeZone),
    description,
    amount: isRefund ? -amount : amount,
    category: categorise(description, rules),
    card,
    type: isRefund ? 'Return' : 'Sale',
    ...(last4 ? { last4 } : {}),
  };
}

// ---- Checking the mail ----

/**
 * One email check: search the mail for the household's card alerts, read the ones not seen before,
 * and keep those that aren't already a transaction. Pure apart from the mailbox it is handed, so it
 * runs the same against Gmail in the browser, the sample mailbox and test fixtures. A server that
 * finds new mail its own way (Gmail's history) hands the messages to `planAlerts`: the same parsing
 * and matching.
 */

/** At most this many alert emails per check (a month of alerts for a busy household). */
export const MAX_ALERTS = 100;

export interface AlertTx extends ParsedAlert {
  /** The document id (one per email). */
  id: string;
  emailId: string;
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
  /** Message ids read this time, to skip next time. */
  read: string[];
}

/** No card has alert words and there are no alert labels: the app says what to add. */
export class NothingToSearch extends Error {
  constructor() {
    super('nothing-to-search');
    this.name = 'NothingToSearch';
  }
}

export interface AlertInput extends ParseOptions {
  cards: AlertCard[];
  labels: string[];
  rules: CategoryRule[];
  existing: Existing[];
  seen?: Set<string>;
}

/** Messages to the alerts to write: parsed, oldest first, matched against what the household has. */
export function planAlerts(messages: MailMessage[], input: Omit<AlertInput, 'labels' | 'seen'>): Pick<AlertCheck, 'create' | 'duplicates' | 'notPurchases'> {
  const parsed: AlertTx[] = [];
  let notPurchases = 0;
  for (const m of messages) {
    const tx = parseAlertEmail(m, input.cards, input.rules, input);
    if (!tx) notPurchases++;
    else parsed.push({ ...tx, id: alertId(m.id), emailId: m.id });
  }
  // Oldest first, so of two alerts for one purchase the first one sent is kept.
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  const plan = planImport(parsed, input.existing, 'alert');
  return { create: plan.create, duplicates: plan.duplicates, notPurchases };
}

export async function checkAlerts(mailbox: Pick<Mailbox, 'search' | 'get'>, input: AlertInput): Promise<AlertCheck> {
  const query = alertQuery(input.cards, input.labels);
  if (!query) throw new NothingToSearch();
  const ids = await mailbox.search(query, MAX_ALERTS);
  const have = new Set(input.existing.map((e) => e.id));
  const fresh = ids.filter((id) => !have.has(alertId(id)) && !input.seen?.has(id));
  const messages: MailMessage[] = [];
  // A few at a time: Gmail answers quickly, but a hundred at once trips its rate limit.
  for (let i = 0; i < fresh.length; i += 10) messages.push(...(await Promise.all(fresh.slice(i, i + 10).map((id) => mailbox.get(id)))));
  return { query, found: ids.length, ...planAlerts(messages, input), read: fresh };
}

// ---- Transaction documents ----

/** The fields huishouden/rules allows on `spendingTransactions`. */
export const TRANSACTION_FIELDS = ['date', 'description', 'amount', 'category', 'card', 'type', 'source', 'last4', 'emailId', 'createdAt', 'updatedAt', 'by'] as const;

export interface NewTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  card: string;
  type: string;
  last4?: string;
  emailId?: string;
}

/** A transaction document as a member writes it: only the allowed fields, no empty optional ones. */
export function transactionDoc(tx: NewTransaction, source: Source, by: string, createdAt: number, updatedAt?: number) {
  return {
    date: tx.date,
    description: tx.description.slice(0, 200),
    amount: Math.round(tx.amount * 100) / 100,
    category: tx.category.slice(0, 60),
    card: tx.card.slice(0, 60),
    type: (tx.type || (tx.amount < 0 ? 'Return' : 'Sale')).slice(0, 20),
    source,
    ...(tx.last4 && /^\d{4}$/.test(tx.last4) ? { last4: tx.last4 } : {}),
    ...(tx.emailId ? { emailId: tx.emailId.slice(0, 64) } : {}),
    createdAt,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    by,
  };
}

// ---- Alert inboxes ----

/**
 * `households/{h}/spendingInboxes/{id}`: a Gmail account a member connected so huishouden/calendar's
 * mail checker reads the household's card alerts from it, every few minutes, as that member. Only
 * the address and the checker's last state are here; the Google grant stays sealed in the Worker.
 */
export const ALERT_INBOXES = 'spendingInboxes';

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

export function toAlertInbox(id: string, d: Record<string, unknown>): AlertInbox {
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    id,
    address: typeof d.address === 'string' ? d.address : '',
    by: typeof d.by === 'string' ? d.by : '',
    connectedAt: num(d.connectedAt) ?? 0,
    ...(num(d.lastAlertAt) !== undefined ? { lastAlertAt: num(d.lastAlertAt) } : {}),
    ...(num(d.lastAdded) !== undefined ? { lastAdded: num(d.lastAdded) } : {}),
    ...(typeof d.error === 'string' && d.error ? { error: d.error } : {}),
  };
}
