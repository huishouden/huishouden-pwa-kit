import { decodeEntities, htmlToText } from './mail-core';
import { isTimeZone, offsetAt } from './local-clock';
import { DAY } from './time';
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
];
/** Where a charge goes when no rule matches and the statement file names no category. */
export const FALLBACK_CATEGORY = 'Miscellaneous';
/** The chart's bucket for the smallest categories past eight. */
export const OTHER_CATEGORY = 'Other';
const rules = (category, words) => words.map((contains) => ({ contains, category }));
export const DEFAULT_RULES = [
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
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/**
 * Whether `needle` occurs in `text` starting at a word boundary, so "market" finds "FARMERS MARKET"
 * and "MARKETPLACE" but "gas" does not find "VEGAS".
 */
export function matchesRule(text, needle) {
    const n = norm(needle);
    if (!n)
        return false;
    const t = norm(text);
    let from = 0;
    for (;;) {
        const i = t.indexOf(n, from);
        if (i < 0)
            return false;
        if (i === 0 || !/[a-z0-9]/.test(t[i - 1]))
            return true;
        from = i + 1;
    }
}
/**
 * The household's category for a merchant: the rule with the longest matching phrase wins, so
 * "amazon web services" beats "amazon", and a household's "example cafe → Groceries" beats the
 * default "cafe". On a tie the later rule (usually the household's own) wins.
 * Returns null when no rule matches.
 */
export function ruleCategory(merchant, list) {
    let best = null;
    for (const r of list) {
        if (!r.contains.trim() || !r.category.trim())
            continue;
        if (!matchesRule(merchant, r.contains))
            continue;
        if (!best || norm(r.contains).length >= norm(best.contains).length)
            best = r;
    }
    return best ? best.category.trim() : null;
}
/** Rule first, then the category the bank's file gave (in the dashboard's words), then Miscellaneous. */
export function categorise(merchant, list, bankCategory) {
    const rule = ruleCategory(merchant, list);
    if (rule)
        return rule;
    return bankCategory?.trim() ? cleanCategoryName(bankCategory) : FALLBACK_CATEGORY;
}
/** A bank's own category name (a statement file's column) in the dashboard's words. */
export function cleanCategoryName(cat) {
    const trimmed = (cat || '').trim();
    if (!trimmed)
        return 'Miscellaneous';
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
/** Words that say nothing about which shop it was. */
const FILLER = new Set([
    'the', 'and', 'card', 'purchase', 'payment', 'pos', 'debit', 'credit', 'online', 'www', 'com', 'inc', 'llc', 'ltd', 'co',
    'store', 'shop', 'usa', 'us', 'recurring', 'transaction', 'sale', 'pmts', 'pmt', 'mktplace', 'mktp',
]);
/** The words of a description that identify the merchant: letters only, 3+ long, no filler. */
export function merchantWords(description) {
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
export function similarDescriptions(a, b) {
    const wa = merchantWords(a);
    const wb = merchantWords(b);
    if (wa.length === 0 || wb.length === 0)
        return true;
    return wa.some((x) => wb.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))));
}
const sameAmount = (a, b) => Math.abs(a - b) < 0.005;
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const sameText = (a, b) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');
/** The script's rule plus alike descriptions: same card and amount, within the window. */
export function sameTransaction(a, b) {
    return a.card === b.card && sameAmount(a.amount, b.amount) && daysApart(a.date, b.date) <= MATCH_WINDOW_DAYS && similarDescriptions(a.description, b.description);
}
/** Two statement rows are the same only when they agree on everything: a statement's date is exact. */
export function sameStatementRow(a, b) {
    return a.card === b.card && sameAmount(a.amount, b.amount) && a.date === b.date && sameText(a.description, b.description);
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
export function planImport(incoming, existing, source) {
    const pool = existing.map((e) => ({ ...e }));
    const plan = { create: [], replace: [], duplicates: 0 };
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
                plan.replace.push({ id: alert.id, tx });
                continue;
            }
        }
        else {
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
export function stableHash(str, seed = 0) {
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
export function statementIds(rows) {
    const seen = new Map();
    return rows.map((r) => {
        const key = [r.date, r.description.trim(), r.amount.toFixed(2), r.card].join('|');
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        return `st-${stableHash(key)}${n ? `-${n}` : ''}`;
    });
}
/** An alert's document id: one per email, so checking the same email twice changes nothing. */
export const alertId = (messageId) => `al-${messageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
/** How far back a check looks, as the Apps Script did: a missed week loses nothing. */
export const ALERT_LOOKBACK_DAYS = 30;
const unsafe = (s) => s.replace(/["(){}]/g, ' ').replace(/\s+/g, ' ').trim();
const looksLikeSender = (w) => /@/.test(w) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(w);
/** Gmail's search form of a label name: lowercase, spaces and slashes as dashes. */
export const labelToken = (label) => unsafe(label).toLowerCase().replace(/[\s/]+/g, '-');
/**
 * The Gmail search for the household's card alerts: any card's alert words (an address or domain
 * searches the sender, anything else is a phrase), or any of the household's alert labels. `since`
 * is a number of days back, or `{ after }` (ms since epoch) for mail that arrived after a moment.
 * Null when there is nothing to search for.
 */
export function alertQuery(cards, labels = [], since = ALERT_LOOKBACK_DAYS) {
    const terms = new Set();
    for (const c of cards) {
        for (const raw of c.alertWords) {
            const w = unsafe(raw);
            if (!w)
                continue;
            terms.add(looksLikeSender(w) ? `from:(${w.toLowerCase()})` : `"${w}"`);
        }
    }
    for (const l of labels)
        if (unsafe(l))
            terms.add(`label:${labelToken(l)}`);
    if (terms.size === 0)
        return null;
    const window = typeof since === 'number' ? `newer_than:${since}d` : `after:${Math.floor(since.after / 1000)}`;
    return `${window} (${[...terms].join(' OR ')})`;
}
function wordPattern(words) {
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}
/**
 * The card an alert is for: its last four digits when the email quotes them and the household has
 * that card; otherwise a word only one card lists (a product name, a sender only that card uses);
 * otherwise the digits as they are, never a guess.
 */
export function identifyCard(text, cards) {
    const m = text.match(/(?:ending|ends)\s+in\s+(\d{4})|\(\.{2,3}\s?(\d{4})\)|x{2,}(\d{4})|\bon card\s+(\d{4})/i);
    const digits = m ? m[1] || m[2] || m[3] || m[4] : undefined;
    const byDigits = digits ? cards.find((c) => c.last4 === digits) : undefined;
    if (byDigits)
        return { card: byDigits.name, last4: digits };
    const count = new Map();
    for (const c of cards)
        for (const w of new Set(c.alertWords.map((x) => x.trim().toLowerCase()).filter(Boolean)))
            count.set(w, (count.get(w) ?? 0) + 1);
    for (const c of cards) {
        const own = c.alertWords.map((x) => x.trim()).filter((w) => w && count.get(w.toLowerCase()) === 1);
        if (own.length && wordPattern(own).test(text))
            return { card: c.name, ...(digits ? { last4: digits } : {}) };
    }
    return digits ? { card: `Card ...${digits}`, last4: digits } : { card: 'Unknown Card' };
}
export function cleanMerchantName(raw) {
    let s = String(raw || '').trim().replace(/<[^>]*>/g, '').replace(/^(?:at|with|purchase at|charged at)\s+/i, '');
    s = s.replace(/\s+(?:on\s+[A-Za-z]+|on\s+\d{1,2}\/|with your card|with card|\.|\$|\().*$/i, '');
    return s.trim() || 'Card Purchase';
}
/** The merchant, by the wordings card alerts use (labelled fields, table cells, sentences). */
export function extractMerchant(subject, body, html) {
    const text = `${subject}\n${body}`;
    const isLabel = (s) => /Amount|Date|Account|\$|Card ending/i.test(s);
    const labelled = text.match(/(?:Merchant|Payee|Where|Vendor|Store)\s*[:\n\r]+\s*([^\r\n<]+)/i);
    if (labelled && labelled[1].trim() && !isLabel(labelled[1]))
        return cleanMerchantName(labelled[1]);
    const cell = html.match(/(?:Merchant|Payee|Store|Vendor)[\s\S]*?<td[^>]*>([^<]+)<\/td>/i);
    if (cell && cell[1].trim() && !isLabel(cell[1]))
        return cleanMerchantName(cell[1]);
    // "77.77 USD at MERCHANT in LOCATION on Card 1234" or "used at MERCHANT in LOCATION, USA for 77.77 USD".
    const located = text.match(/USD at (.+?) in [^\n]+? on Card \d{4}/i) || text.match(/\bat (.+?) in [^\n]+?, [A-Z]{2,3} for [0-9.,]+ USD/);
    if (located && located[1].trim())
        return cleanMerchantName(located[1]);
    // "a refund of $18.00 from MERCHANT", "You have a $18.00 refund from MERCHANT".
    const refundFrom = text.match(/(?:refund|credit)(?:\s+of\s+\$[0-9.,]+)?\s+from\s+([^\r\n<]+?)(?:\s+(?:was|on|to)\b|\.\s|\n|<|$)/i);
    if (refundFrom && refundFrom[1].trim() && !isLabel(refundFrom[1]))
        return cleanMerchantName(refundFrom[1]);
    // "You made a $27.10 transaction with MERCHANT".
    const withMerchant = text.match(/transaction\s+with\s+([^\r\n<]+?)(?:\s+(?:on\b|using\b|was\b)|\.\s|\n|<|$)/i);
    if (withMerchant && withMerchant[1].trim() && !isLabel(withMerchant[1]))
        return cleanMerchantName(withMerchant[1]);
    // "You spent $12.00 at MERCHANT", "A purchase of $12.50 at MERCHANT was made".
    const at = text.match(/(?:purchase|transaction|charge|spent|used for).*?\bat\s+([A-Za-z0-9 &.,'’\-*#]+?)(?:\s+(?:on|with|using|for|was|has|is)\b|\.|\n|<|\$|\d{1,2}\/\d{1,2})/i);
    if (at && at[1].trim() && !/\b(?:visa|mastercard|card)\b/i.test(at[1]))
        return cleanMerchantName(at[1]);
    const subj = subject.match(/\bat\s+([A-Za-z0-9 &.,'’\-*#]+?)(?:\s+(?:on\b|with\b)|\.|\$|$)/i);
    if (subj && subj[1].trim())
        return cleanMerchantName(subj[1]);
    return 'Card Purchase';
}
/** The calendar day of a moment: in `timeZone` when given (a server reading a member's mail), otherwise where the code runs. */
export function dayOf(ms, timeZone) {
    if (timeZone && isTimeZone(timeZone))
        return new Date(ms + offsetAt(timeZone, ms)).toISOString().slice(0, 10);
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const AMOUNT = String.raw `\$\s?([0-9][0-9,]*(?:\.[0-9]{2})?)`;
const USD = String.raw `([0-9][0-9,]*\.[0-9]{2})\s*USD`;
/** A merchant: up to the end of the clause ("on", "using", "was", a full stop before a space, a line end). */
const MERCHANT = String.raw `([^\n<>]{2,80}?)`;
const MERCHANT_END = String.raw `(?=\s+(?:on|using|with your|with card|was|has|is|for|in)\b|\.\s|\.?$|,\s|\n|<)`;
/**
 * The purchase rules, most specific first. Issuer wordings (Visa Purchase Alerts, "You made a $X
 * transaction with M") are tried before the generic "purchase/transaction/charge of $X at M".
 */
export const PURCHASE_RULES = [
    // Visa Purchase Alerts: "123.45 USD at MERCHANT in PLACE on Card 1111".
    { name: 'visa-alert', pattern: new RegExp(String.raw `${USD} at ([^\n]{2,80}?) in [^\n]+? on Card (\d{4})`, 'i'), amount: 1, merchant: 2, digits: 3, strict: true },
    // "used at MERCHANT in PLACE, ST for 77.77 USD".
    { name: 'visa-used-at', pattern: /\bused at ([^\n]{2,80}?) in [^\n]+?, [A-Z]{2,3} for ([0-9][0-9,]*\.[0-9]{2}) USD/, amount: 2, merchant: 1, strict: true },
    // "You made a $27.10 transaction with MERCHANT", "Your $27.10 transaction with MERCHANT".
    { name: 'transaction-with', pattern: new RegExp(String.raw `\b(?:you made an?|your)\s+${AMOUNT}\s+(?:transaction|purchase|charge)\s+(?:with|at)\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2, strict: true },
    // "A refund of $18.00 from MERCHANT", "a $18.00 refund from MERCHANT", "credit of $5.00 from MERCHANT".
    { name: 'refund-from', pattern: new RegExp(String.raw `\b(?:refund|credit|return)\s+of\s+${AMOUNT}\s+from\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2, refund: true },
    { name: 'refund-from', pattern: new RegExp(String.raw `${AMOUNT}\s+(?:refund|credit|return)\s+from\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2, refund: true },
    // "A purchase of $12.50 at MERCHANT", "a transaction of $9.00 with MERCHANT", "charge of $3.00 at MERCHANT".
    { name: 'purchase-of', pattern: new RegExp(String.raw `\b(?:purchase|transaction|charge)\s+(?:of|for)\s+${AMOUNT}\s+(?:at|with|from)\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2 },
    // "You spent $12.00 at MERCHANT", "You were charged $4.00 by MERCHANT", "$12.00 purchase at MERCHANT".
    { name: 'spent-at', pattern: new RegExp(String.raw `\b(?:spent|charged)\s+${AMOUNT}\s+(?:at|with|by)\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2 },
    { name: 'amount-purchase-at', pattern: new RegExp(String.raw `${AMOUNT}\s+(?:purchase|transaction|charge)\s+(?:at|with)\s+${MERCHANT}${MERCHANT_END}`, 'i'), amount: 1, merchant: 2 },
    // "A purchase at MERCHANT for $12.00".
    { name: 'purchase-at-for', pattern: new RegExp(String.raw `\b(?:purchase|transaction|charge)\s+at\s+${MERCHANT}\s+(?:for|of)\s+${AMOUNT}`, 'i'), amount: 2, merchant: 1 },
];
/** Words that mean an email is a payment, not a purchase. */
const PAYMENT = /payment thank you|autopay|automatic payment|payment received|payment (?:is )?scheduled|we received your payment|thank you for your payment|payment posted/i;
const DECLINED = /\bdeclined\b|\bwas not approved\b/i;
const STATEMENT = /\b(?:statement|e-?statement) (?:is )?(?:ready|available)|\byour (?:monthly )?statement\b|\bpayment (?:is )?due\b|\bminimum payment\b/i;
const SECURITY = /\b(?:verification|security|one-time|login|sign-?in) code\b|\bpassword\b|\bnew device\b|\bverify (?:your|it'?s)\b|\bunusual (?:sign-?in|activity)\b|\bidentity\b/i;
const PURCHASE_WORDS = /\b(?:purchases?|purchased|transactions?|charged?|spent|refund(?:ed)?|card (?:was )?used)\b/i;
const PROMO = /\bunsubscribe\b|\blimited time\b|\boffers?\b|\bearn\b|\bsign up\b|\bapply now\b|\bget up to\b|\bcash ?back\b|\brewards?\b|\bbonus\b|\binvest(?:ing|ment)?\b|\bshares?\b|\bportfolio\b|\bmarket order\b|\blimit order\b|\bdividend\b|\bdeposit(?:ed)?\b|\bwithdrawal\b/i;
/** Words that are never a shop: what loose wording leaves where a merchant should be. */
const NOT_A_MERCHANT = new Set([
    'card purchase', 'purchase', 'purchases', 'transaction', 'merchant', 'store', 'shop', 'unknown', 'online', 'card', 'your card', 'debit card', 'credit card',
    'visa', 'mastercard', 'account', 'your account', 'order', 'payment', 'price', 'model', 'models', 'option', 'options', 'stock', 'stocks', 'shares', 'market', 'home', 'here', 'checkout',
]);
/** Why a merchant can't be trusted, or null when it can. */
export function merchantProblem(merchant) {
    const m = merchant.trim();
    if (m.length < 2 || m.length > 60 || !/[A-Za-z]/.test(m))
        return 'generic-merchant';
    if (NOT_A_MERCHANT.has(m.toLowerCase()))
        return 'generic-merchant';
    // Prose, not a name: "a reasonable price", "your card", "the end of the day".
    if (/^(?:a|an|the|your|our|my|this|that|these|those|any|some|each|every|its|their|least|most|all|no|one)\b/i.test(m))
        return 'generic-merchant';
    // Alerts write shops as they're named (capitals, digits, a domain): all-lowercase words are prose.
    if (!/[A-Z0-9]/.test(m) && !/\.[a-z]{2,}/.test(m))
        return 'generic-merchant';
    return null;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_TOKEN = String.raw `((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})`;
const LABELLED_DATE = new RegExp(String.raw `\b(?:transaction date|purchase date|date of (?:transaction|purchase)|date)\s*:?\s*${DATE_TOKEN}`, 'i');
const ON_DATE = new RegExp(String.raw `\bon\s+(?:[A-Z][a-z]+day,?\s+)?${DATE_TOKEN}`, 'i');
/** A written date as YYYY-MM-DD (US month first for slashes), or null. */
export function writtenDay(token) {
    const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let y, mo, d;
    if (iso)
        [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else {
        const slash = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slash)
            [mo, d, y] = [Number(slash[1]), Number(slash[2]), Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3])];
        else {
            const named = token.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
            if (!named)
                return null;
            mo = MONTHS.indexOf(named[1].toLowerCase()) + 1;
            [d, y] = [Number(named[2]), Number(named[3])];
        }
    }
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31))
        return null;
    const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day ? day : null;
}
/**
 * The transaction's day: a date the email writes for it ("Date: Oct 2, 2031", "on 10/02/2031" in
 * the purchase's sentence), when it is at most 10 days before the email and not after it; otherwise
 * the day the email was sent, in the household's time zone.
 */
export function alertDay(text, sentence, sent, timeZone) {
    const sentDay = dayOf(sent, timeZone);
    for (const m of [sentence.match(ON_DATE), text.match(LABELLED_DATE)]) {
        const day = m ? writtenDay(m[1]) : null;
        if (!day)
            continue;
        const back = (Date.parse(sentDay) - Date.parse(day)) / DAY;
        if (back >= 0 && back <= 10)
            return day;
    }
    return sentDay;
}
const money = (s) => parseFloat(s.replace(/,/g, ''));
/** A labelled merchant and amount ("Merchant: X" / a "Merchant" table cell, and "Amount: $Y"), both or neither. */
function labelledPurchase(text, html) {
    const line = text.match(/^\s*(?:merchant|merchant name|payee|vendor|store name|where)\s*:\s*([^\n<]{2,80})$/im) ?? text.match(/^\s*(?:merchant|merchant name|payee|vendor|store name)\s*\n\s*([^\n<]{2,80})$/im);
    const cell = html.match(/>\s*(?:merchant|merchant name|payee|vendor|store name)\s*:?\s*<\/t[dh]>\s*<t[dh][^>]*>([^<]{2,80})<\/t[dh]>/i);
    const merchant = (line?.[1] ?? (cell ? decodeEntities(cell[1]) : '')).trim();
    if (!merchant)
        return null;
    const amountLine = text.match(/^\s*(?:amount|transaction amount|purchase amount|total)\s*:?\s*\$\s?([0-9][0-9,]*\.[0-9]{2})/im) ?? text.match(/\b(?:amount|transaction amount|purchase amount|total)\s*:?\s*\n?\s*\$\s?([0-9][0-9,]*\.[0-9]{2})/i);
    if (!amountLine)
        return null;
    return { merchant, amount: money(amountLine[1]), line: line?.[0] ?? merchant };
}
/** One email, read as a card alert (see `AlertReading`). */
export function readAlert(msg, cards, rules, options = {}) {
    const html = msg.html ?? '';
    const body = msg.text ?? (html ? htmlToText(html) : '');
    const text = `${msg.subject}\n${body}`;
    const sentDay = () => dayOf(msg.date, options.timeZone);
    if (PAYMENT.test(text))
        return { kind: 'not-purchase', reason: 'payment' };
    if (DECLINED.test(text))
        return { kind: 'not-purchase', reason: 'declined' };
    let found = null;
    let generic = false;
    for (const r of PURCHASE_RULES) {
        const m = text.match(r.pattern);
        if (!m)
            continue;
        const merchant = cleanMerchantName(m[r.merchant]);
        const amount = money(m[r.amount]);
        if (!(amount > 0))
            continue;
        if (merchantProblem(merchant)) {
            generic = true;
            continue;
        }
        const at = m.index ?? 0;
        const sentence = text.slice(text.lastIndexOf('\n', at) + 1, (text.indexOf('\n', at + m[0].length) + 1 || text.length + 1) - 1);
        found = { merchant, amount, rule: r.name, refund: !!r.refund, sentence, strict: !!r.strict };
        break;
    }
    if (!found) {
        const labelled = labelledPurchase(text, html);
        if (labelled && labelled.amount > 0) {
            const merchant = cleanMerchantName(labelled.merchant);
            if (!merchantProblem(merchant))
                found = { merchant, amount: labelled.amount, rule: 'labelled', refund: false, sentence: labelled.line, strict: true };
            else
                generic = true;
        }
    }
    // Prose rules in mail sent to a list (offers: "earn 3% on every purchase of $50 at ...") are not trusted.
    if (found && !found.strict && PROMO.test(text) && (msg.bulk || /\bunsubscribe\b/i.test(text)))
        found = null;
    if (found) {
        const isRefund = found.refund || /\brefund(?:ed)?\b|\bmerchant credit\b/i.test(found.sentence);
        const { card, last4 } = identifyCard(`${msg.from}\n${text}`, cards);
        return {
            kind: 'purchase',
            rule: found.rule,
            tx: {
                date: alertDay(text, found.sentence, msg.date, options.timeZone),
                description: found.merchant,
                amount: isRefund ? -found.amount : found.amount,
                category: categorise(found.merchant, rules),
                card,
                type: isRefund ? 'Return' : 'Sale',
                ...(last4 ? { last4 } : {}),
            },
        };
    }
    const anyAmount = text.match(/\$\s?([0-9][0-9,]*\.[0-9]{2})/) || text.match(/([0-9][0-9,]*\.[0-9]{2})\s*USD/i);
    const amount = anyAmount ? money(anyAmount[1]) : 0;
    if (STATEMENT.test(text))
        return { kind: 'not-purchase', reason: 'statement' };
    if (SECURITY.test(text))
        return { kind: 'not-purchase', reason: 'security' };
    const listMail = msg.bulk || /\bunsubscribe\b/i.test(text);
    if ((listMail || PROMO.test(text)) && !PURCHASE_WORDS.test(text))
        return { kind: 'not-purchase', reason: 'bulk' };
    if (!(amount > 0))
        return { kind: 'not-purchase', reason: 'no-amount' };
    if (listMail && !generic && !/\b(?:card|purchase[ds]?|transaction|charged)\b/i.test(msg.subject))
        return { kind: 'not-purchase', reason: 'bulk' };
    return { kind: 'unreadable', reason: generic ? 'generic-merchant' : 'no-merchant', date: sentDay(), amount };
}
/** One alert email as a transaction, or null when it isn't one it can trust (`readAlert` says why). */
export function parseAlertEmail(msg, cards, rules, options = {}) {
    const r = readAlert(msg, cards, rules, options);
    return r.kind === 'purchase' ? r.tx : null;
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
/** No card has alert words and there are no alert labels: the app says what to add. */
export class NothingToSearch extends Error {
    constructor() {
        super('nothing-to-search');
        this.name = 'NothingToSearch';
    }
}
/** Messages to the alerts to write: read, oldest first, matched against what the household has. Unconfident ones go to `review`, never to `create`. */
export function planAlerts(messages, input) {
    const parsed = [];
    const review = [];
    let notPurchases = 0;
    for (const m of messages) {
        const r = readAlert(m, input.cards, input.rules, input);
        if (r.kind === 'purchase')
            parsed.push({ ...r.tx, id: alertId(m.id), emailId: m.id });
        else if (r.kind === 'unreadable')
            review.push({ emailId: m.id, subject: m.subject.slice(0, 200), sent: m.date, date: r.date, reason: r.reason, ...(r.amount ? { amount: r.amount } : {}) });
        else
            notPurchases++;
    }
    // Oldest first, so of two alerts for one purchase the first one sent is kept.
    parsed.sort((a, b) => a.date.localeCompare(b.date));
    review.sort((a, b) => a.sent - b.sent);
    const plan = planImport(parsed, input.existing, 'alert');
    return { create: plan.create, duplicates: plan.duplicates, notPurchases, review };
}
export async function checkAlerts(mailbox, input) {
    const query = alertQuery(input.cards, input.labels);
    if (!query)
        throw new NothingToSearch();
    const ids = await mailbox.search(query, MAX_ALERTS);
    const have = new Set(input.existing.map((e) => e.id));
    const fresh = ids.filter((id) => !have.has(alertId(id)) && !input.seen?.has(id));
    const messages = [];
    // A few at a time: Gmail answers quickly, but a hundred at once trips its rate limit.
    for (let i = 0; i < fresh.length; i += 10)
        messages.push(...(await Promise.all(fresh.slice(i, i + 10).map((id) => mailbox.get(id)))));
    return { query, found: ids.length, ...planAlerts(messages, input), read: fresh };
}
// ---- Transaction documents ----
/** The fields huishouden/rules allows on `spendingTransactions`. */
export const TRANSACTION_FIELDS = ['date', 'description', 'amount', 'category', 'card', 'type', 'source', 'last4', 'emailId', 'importId', 'createdAt', 'updatedAt', 'by'];
/** A transaction document as a member writes it: only the allowed fields, no empty optional ones. */
export function transactionDoc(tx, source, by, createdAt, updatedAt) {
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
        ...(tx.importId ? { importId: tx.importId.slice(0, 40) } : {}),
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
export function toAlertInbox(id, d) {
    const num = (v) => (typeof v === 'number' ? v : undefined);
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
