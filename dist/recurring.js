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
import { addDays, addMonths, daysBetween, isYmd, toYmd, ymdParts } from './time';
import { kt } from './i18n.js';
export const CADENCES = {
    weekly: { days: 7, tolerance: 2, min: 3, perMonth: 52 / 12, next: (d) => addDays(d, 7) },
    monthly: { days: 30.44, tolerance: 5, min: 3, perMonth: 1, next: (d, day) => addMonths(d, 1, day) },
    quarterly: { days: 91.3, tolerance: 10, min: 3, perMonth: 1 / 3, next: (d, day) => addMonths(d, 3, day) },
    yearly: { days: 365, tolerance: 10, min: 2, perMonth: 1 / 12, next: (d, day) => addMonths(d, 12, day) },
};
/** What each cadence is called, in the active language ("Monthly", "Mensual", "Maandelijks"). */
export const CADENCE_LABELS = {
    get weekly() { return kt('recurring.weekly'); },
    get monthly() { return kt('recurring.monthly'); },
    get quarterly() { return kt('recurring.quarterly'); },
    get yearly() { return kt('recurring.yearly'); },
};
/** An amount per `cadence` as an amount per month, rounded to cents. */
export const monthlyEquivalent = (amount, cadence) => round2(amount * CADENCES[cadence].perMonth);
export const DEFAULT_NOT_BILL_CATEGORIES = ['grocer', 'dining', 'restaurant', 'food', 'gas', 'fuel', 'transport', 'shopping', 'retail', 'travel', 'lodging', 'entertainment'];
export const DEFAULT_BILL_CATEGORIES = ['bill', 'utilit', 'insurance', 'phone', 'internet', 'mortgage', 'rent'];
export const DEFAULT_SUBSCRIPTION_CATEGORIES = ['subscription', 'streaming', 'membership'];
/** National services, matched against a merchant key's whole words. */
const KNOWN = [
    ...[
        [['netflix'], 'Netflix'],
        [['spotify'], 'Spotify'],
        [['hulu'], 'Hulu'],
        [['disney plus', 'disneyplus'], 'Disney+'],
        [['hbo max', 'hbomax'], 'Max'],
        [['youtube premium', 'youtubepremium', 'youtube tv', 'youtubetv', 'youtube music'], 'YouTube'],
        [['=apple', 'apple services', 'apple music', 'apple tv', 'itunes', 'icloud'], 'Apple'],
        [['google one', 'google storage', 'googlestorage'], 'Google One'],
        [['amazon prime', 'prime video', 'amzn prime', 'kindle unlimited'], 'Amazon Prime'],
        [['audible'], 'Audible'],
        [['paramount'], 'Paramount+'],
        [['peacock'], 'Peacock'],
        [['siriusxm', 'sirius xm', 'sirius'], 'SiriusXM'],
        [['nytimes', 'ny times', 'new york times'], 'The New York Times'],
        [['wsj', 'wall street journal'], 'The Wall Street Journal'],
        [['washington post', 'washpost'], 'The Washington Post'],
        [['dropbox'], 'Dropbox'],
        [['microsoft', 'msft'], 'Microsoft'],
        [['adobe'], 'Adobe'],
        [['playstation'], 'PlayStation'],
        [['xbox'], 'Xbox'],
        [['nintendo'], 'Nintendo'],
        [['patreon'], 'Patreon'],
        [['openai', 'chatgpt'], 'ChatGPT'],
        [['anthropic', 'claude ai'], 'Claude'],
        [['duolingo'], 'Duolingo'],
        [['headspace'], 'Headspace'],
        [['=calm', 'calm app'], 'Calm'],
        [['peloton'], 'Peloton'],
        [['planet fitness'], 'Planet Fitness'],
        [['la fitness'], 'LA Fitness'],
        [['crunch fitness'], 'Crunch Fitness'],
        [['hellofresh'], 'HelloFresh'],
        [['blue apron'], 'Blue Apron'],
        [['dashpass'], 'DashPass'],
        [['uber one'], 'Uber One'],
        [['instacart plus', 'instacart express'], 'Instacart+'],
        [['walmart plus'], 'Walmart+'],
        [['github'], 'GitHub'],
        [['1password'], '1Password'],
        [['nordvpn'], 'NordVPN'],
        [['expressvpn'], 'ExpressVPN'],
        [['crunchyroll'], 'Crunchyroll'],
        [['espn plus', 'espnplus'], 'ESPN+'],
        [['sling'], 'Sling TV'],
        [['fubo', 'fubotv'], 'Fubo'],
        [['philo'], 'Philo'],
    ].map(([words, name]) => ({ words, name, kind: 'subscription' })),
    ...[
        [['comcast', 'xfinity'], 'Xfinity'],
        [['spectrum'], 'Spectrum'],
        [['cox communications', 'cox comm'], 'Cox'],
        [['verizon'], 'Verizon'],
        [['att'], 'AT&T'],
        [['tmobile', 't mobile'], 'T-Mobile'],
        [['mint mobile'], 'Mint Mobile'],
        [['google fi'], 'Google Fi'],
        [['geico'], 'GEICO'],
        [['state farm'], 'State Farm'],
        [['progressive'], 'Progressive'],
        [['allstate'], 'Allstate'],
        [['liberty mutual'], 'Liberty Mutual'],
        [['lemonade'], 'Lemonade'],
    ].map(([words, name]) => ({ words, name, kind: 'bill' })),
];
/** Card processors and wallets whose name comes before the merchant's: "SQ *", "TST*", "PAYPAL *". */
const PROCESSORS = new Set(['sq', 'tst', 'sp', 'py', 'pp', 'paypal', 'pypl', 'dd', 'ic', 'in', 'bt', 'fs', '2co', 'google', 'goog', 'gglpay', 'apl', 'pmt', 'clp', 'pos', 'ckp', 'lsp', 'wpy', 'payp']);
/** Words a statement puts before the merchant. */
const LEADING = /^(?:purchase authorized on \d{1,2}\/\d{1,2}|pos (?:debit|purchase)|debit card purchase|card purchase(?: with pin)?|checkcard \d{4}|recurring (?:payment|debit|charge)|ach (?:debit|withdrawal)|preauthorized debit|\d{1,2}\/\d{1,2})\s+/;
const STATES = new Set('al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy'.split(' '));
const NOISE = new Set(['usa', 'us', 'inc', 'llc', 'ltd', 'corp', 'co', 'the', 'com', 'www', 'bill', 'billing', 'payment', 'pmt', 'recurring', 'subscription', 'subscr', 'autopay', 'online', 'purchase', 'debit', 'monthly', 'membership', 'member', 'svc', 'service', 'services', 'digital', 'intl']);
const round2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);
function cleanWords(description) {
    let s = description.toLowerCase().replace(/[’']/g, '').replace(/&/g, '').trim();
    for (let i = 0; i < 3 && LEADING.test(s); i++)
        s = s.replace(LEADING, '');
    const star = s.indexOf('*');
    if (star >= 0) {
        const left = s.slice(0, star).trim();
        const right = s.slice(star + 1).trim();
        if (PROCESSORS.has(left.replace(/\s+/g, '')) || !left)
            s = right.split('*')[0];
        else
            s = left;
    }
    s = s
        .replace(/https?:\/\//g, ' ')
        .replace(/\bwww\./g, '')
        .replace(/\b([a-z0-9-]+)\.(?:com|net|org|io|co|tv|app)\b/g, '$1 ')
        .replace(/\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b|\b\d{3}-\d{7}\b/g, ' ')
        .replace(/#\s*\d+/g, ' ');
    let words = s.split(/[^a-z0-9]+/).filter(Boolean);
    // Store numbers, zip codes and reference ids: three or more digits, or letters mixed with digits.
    const kept = words.filter((w) => !(/\d{3,}/.test(w) || (/\d/.test(w) && /[a-z]/.test(w) && !/^\d+(st|nd|rd|th)$/.test(w) && w !== '1password')));
    if (kept.length)
        words = kept;
    if (words.length > 1 && STATES.has(words[words.length - 1])) {
        words = words.slice(0, -1);
        while (words.length > 1 && NOISE.has(words[words.length - 1]))
            words = words.slice(0, -1);
        // "PLANET FITNESS DENVER CO": the word before the state is the city.
        if (words.length >= 3)
            words = words.slice(0, -1);
    }
    const meaningful = words.filter((w) => !NOISE.has(w));
    return (meaningful.length ? meaningful : words).filter((w, i, all) => w !== all[i - 1]);
}
/**
 * A merchant's name as a stable key: "SQ *BLUE BOTTLE #123 OAKLAND CA" and "Blue Bottle 123" both
 * give "blue bottle"; "NETFLIX.COM 866-579-7172 CA" and "Netflix Subscription" give "netflix".
 * At most three words. Empty when the text has no letters or digits.
 */
export function merchantKey(description) {
    return cleanWords(description).slice(0, 3).join(' ');
}
function knownFor(key) {
    const base = key.split('#')[0];
    const padded = ` ${base} `;
    return KNOWN.find((k) => k.words.some((w) => (w.startsWith('=') ? base === w.slice(1) : padded.includes(` ${w} `)))) ?? null;
}
/** "Netflix" for a known service; otherwise the key's words in title case ("Blue Bottle"). */
export function merchantName(key) {
    const known = knownFor(key);
    if (known)
        return known.name;
    return key
        .split('#')[0]
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
/**
 * Whether two names are the same merchant: the same known service, one key's words all in the
 * other's, or most of their words shared. For matching a candidate against bills a household
 * already has ("Netflix" and "NETFLIX.COM", "Planet Fitness" and "Planet Fitness gym").
 */
export function sameMerchant(a, b) {
    const ka = merchantKey(a).split('#')[0];
    const kb = merchantKey(b).split('#')[0];
    if (!ka || !kb)
        return false;
    if (ka === kb)
        return true;
    const na = knownFor(ka);
    const nb = knownFor(kb);
    if (na || nb)
        return na === nb;
    const wa = new Set(ka.split(' '));
    const wb = new Set(kb.split(' '));
    const shared = [...wa].filter((w) => wb.has(w)).length;
    if (shared === Math.min(wa.size, wb.size) && shared > 0 && [...(wa.size <= wb.size ? wa : wb)].some((w) => w.length >= 4))
        return true;
    return shared / new Set([...wa, ...wb]).size >= 0.6;
}
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const NOT_CHARGES = /return|refund|credit|payment|reversal|adjust|cash ?back|interest/i;
const NOT_CHARGE_WORDS = /payment thank you|autopay payment|online payment|interest charge|annual percentage|balance transfer/i;
function isCharge(t, today) {
    return isYmd(t.date) && t.date <= today && Number.isFinite(t.amount) && cents(t.amount) > 0 && !NOT_CHARGES.test(t.type ?? '') && !NOT_CHARGE_WORDS.test(t.description);
}
function pickCadence(gap) {
    for (const c of Object.keys(CADENCES))
        if (Math.abs(gap - CADENCES[c].days) <= CADENCES[c].tolerance)
            return c;
    return null;
}
/** How many of the gaps fit the cadence: a skipped week or month (twice or three times the gap) counts half. */
function regularity(gaps, spec, cadence) {
    let score = 0;
    for (const g of gaps) {
        if (Math.abs(g - spec.days) <= spec.tolerance)
            score += 1;
        else if ((cadence === 'weekly' || cadence === 'monthly') && [2, 3].some((k) => Math.abs(g - k * spec.days) <= k * spec.tolerance))
            score += 0.5;
    }
    return score / gaps.length;
}
function mostCommon(values) {
    const counts = new Map();
    for (const v of values)
        if (v.trim())
            counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = null;
    for (const [v, n] of counts)
        if (best === null || n > counts.get(best))
            best = v;
    return best;
}
function candidate(key, charges, policy) {
    const n = charges.length;
    if (n < 2)
        return null;
    const dates = charges.map((c) => c.date);
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    if (gaps.some((g) => g === 0))
        return null;
    const cadence = pickCadence(median(gaps));
    if (!cadence)
        return null;
    const spec = CADENCES[cadence];
    if (n < spec.min)
        return null;
    const r = regularity(gaps, spec, cadence);
    if (r < 0.75)
        return null;
    const amounts = charges.map((c) => c.amount);
    const last = amounts[n - 1];
    const typical = round2(n >= 2 && cents(amounts[n - 2]) === cents(last) ? last : median(amounts.slice(-3)));
    const exact = amounts.every((a) => cents(a) === cents(amounts[0]));
    const amountScore = amounts.filter((a) => Math.abs(a - typical) <= typical * 0.1 + 0.005).length / n;
    const category = mostCommon(charges.map((c) => c.category ?? ''));
    const known = knownFor(key);
    const cls = policy.classify(category);
    const variable = known?.kind === 'bill' || cls === 'bill';
    const notBill = cls === 'not-bill' && !known;
    if (notBill) {
        // Groceries, dining and fuel are only kept when strongly periodic: every gap on time, the same amount each time.
        if (r < 1 || !exact || n < (cadence === 'yearly' ? 2 : 4))
            return null;
    }
    else if (!variable && amountScore < 0.75)
        return null;
    const lastDate = dates[n - 1];
    // Stopped: it should have come back by now.
    if (daysBetween(lastDate, policy.today) > spec.days * 1.5 + spec.tolerance)
        return null;
    const day = ymdParts(lastDate).d;
    let next = spec.next(lastDate, day);
    while (next < policy.today)
        next = spec.next(next, day);
    const confidence = 0.4 +
        0.25 * r +
        (variable ? 0.1 : 0.15 * amountScore) +
        Math.min(0.1, 0.025 * (n - spec.min)) +
        (known ? 0.15 : 0) +
        (cls === 'subscription' || cls === 'bill' ? 0.05 : 0) -
        (notBill ? 0.2 : 0) -
        (!exact && !variable ? 0.05 : 0);
    return {
        merchantKey: key,
        displayName: merchantName(key),
        cadence,
        typicalAmount: typical,
        amountVaries: !exact,
        lastDate,
        nextExpected: next,
        occurrences: n,
        confidence: Math.max(0, Math.min(1, round2(confidence))),
        subscription: known ? known.kind === 'subscription' : cls === 'subscription',
        known: known?.kind ?? null,
        category,
        monthlyAmount: monthlyEquivalent(typical, cadence),
    };
}
/** Charges of one merchant split by size, each run of amounts within 10% of its smallest. */
function amountClusters(charges) {
    const sorted = [...charges].sort((a, b) => a.amount - b.amount);
    const out = [];
    for (const c of sorted) {
        const cur = out[out.length - 1];
        if (cur && c.amount <= cur[0].amount * 1.1 + 0.005)
            cur.push(c);
        else
            out.push([c]);
    }
    return out.map((cl) => cl.sort((a, b) => a.date.localeCompare(b.date)));
}
/**
 * Regular charges among card transactions, most confident first. Refunds, credits and card
 * payments are left out; so are charges that stopped (overdue by half an interval or more).
 */
export function findRecurring(transactions, options) {
    const today = typeof options.now === 'number' ? toYmd(options.now) : options.now;
    const notBill = options.notBillCategories ?? DEFAULT_NOT_BILL_CATEGORIES;
    const bill = options.billCategories ?? DEFAULT_BILL_CATEGORIES;
    const subscription = options.subscriptionCategories ?? DEFAULT_SUBSCRIPTION_CATEGORIES;
    const ignore = new Set(options.ignore ?? []);
    const policy = {
        today,
        classify: (category) => {
            const c = category?.toLowerCase() ?? '';
            if (!c)
                return null;
            if (subscription.some((w) => c.includes(w)))
                return 'subscription';
            if (bill.some((w) => c.includes(w)))
                return 'bill';
            if (notBill.some((w) => c.includes(w)))
                return 'not-bill';
            return null;
        },
    };
    const groups = new Map();
    for (const t of transactions) {
        if (!isCharge(t, today))
            continue;
        const key = merchantKey(t.description);
        if (!key || ignore.has(key))
            continue;
        groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const out = [];
    for (const [key, list] of groups) {
        const charges = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const whole = candidate(key, charges, policy);
        if (whole) {
            out.push(whole);
            continue;
        }
        // One merchant, two regular charges ("APPLE.COM/BILL" for storage and for music).
        const clusters = amountClusters(charges);
        if (clusters.length < 2)
            continue;
        for (const cl of clusters) {
            const k = `${key}#${Math.floor(cl[0].amount)}`;
            if (ignore.has(k))
                continue;
            const c = candidate(k, cl, policy);
            if (c)
                out.push(c);
        }
    }
    return out
        .filter((c) => c.confidence >= (options.minConfidence ?? 0.5))
        .sort((a, b) => b.confidence - a.confidence || b.monthlyAmount - a.monthlyAmount || a.merchantKey.localeCompare(b.merchantKey));
}
