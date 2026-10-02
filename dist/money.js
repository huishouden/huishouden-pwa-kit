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
/** The default cap on a typed amount: $1,000,000.00. */
export const MAX_CENTS = 100_000_000;
/**
 * "89.99", "$1,234.5", "40", "40." → cents; blank → undefined; anything else (negative, more than
 * two decimals, over `max`) → null. Integer arithmetic only.
 */
export function parseCents(text, { max = MAX_CENTS } = {}) {
    const t = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
    if (!t)
        return undefined;
    if (!/^\d{1,13}(\.\d{0,2})?$/.test(t))
        return null;
    const [whole, frac = ''] = t.split('.');
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    return cents <= max ? cents : null;
}
const FORMATS = new Map();
function formatter(currency, headline) {
    const key = `${currency}:${headline}`;
    let f = FORMATS.get(key);
    if (!f) {
        f = new Intl.NumberFormat('en-US', headline ? { style: 'currency', currency, maximumFractionDigits: 0 } : { style: 'currency', currency });
        FORMATS.set(key, f);
    }
    return f;
}
/** 12345 → "$123.45"; `headline` rounds to whole units for the one big number: "$1,235". */
export function formatCents(cents, { headline = false, currency = 'USD' } = {}) {
    return formatter(currency, headline).format(cents / 100);
}
/** Cents back to what an amount field shows: 12050 → "120.50"; nothing → "". */
export const centsToInput = (cents) => (cents === undefined || cents === null ? '' : (cents / 100).toFixed(2));
const AMOUNT = /^-?\d+(\.\d+)?$/;
/**
 * "1,234.5", "$1,234.50", "(30.00)", "30.00 CR" or 12.5 → a two-place decimal string ("-30.00" for
 * the credit forms); null when it isn't money. Rounds half up on the third place.
 */
export function toDecimal(v) {
    let s;
    if (typeof v === 'number') {
        if (!Number.isFinite(v))
            return null;
        s = v.toFixed(2);
    }
    else if (typeof v === 'string') {
        s = v.trim().replace(/[$,\s]/g, '');
        let negative = false;
        const paren = /^\((.*)\)$/.exec(s);
        if (paren)
            [s, negative] = [paren[1], true];
        if (/cr$/i.test(s))
            [s, negative] = [s.slice(0, -2), true];
        if (negative)
            s = `-${s.replace(/^-/, '')}`;
    }
    else
        return null;
    if (!AMOUNT.test(s))
        return null;
    const negative = s.startsWith('-');
    const [whole, frac = ''] = s.replace('-', '').split('.');
    let cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
    if (frac.length > 2 && Number(frac[2]) >= 5)
        cents += 1;
    if (!Number.isSafeInteger(cents))
        return null;
    if (cents === 0)
        return '0.00';
    const out = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
    return negative ? `-${out}` : out;
}
export const usd = (amount) => ({ amount, currency: 'USD' });
/** A `Money` as integer cents. */
export function moneyToCents(m) {
    const d = toDecimal(m.amount);
    if (d === null)
        throw new Error(`Not an amount: ${m.amount}`);
    const negative = d.startsWith('-');
    const [whole, frac] = d.replace('-', '').split('.');
    const cents = Number(whole) * 100 + Number(frac);
    return negative ? -cents : cents;
}
/** Integer cents as a `Money`. */
export function centsToMoney(cents, currency = 'USD') {
    const sign = cents < 0 ? '-' : '';
    const n = Math.abs(Math.round(cents));
    return { amount: n === 0 ? '0.00' : `${sign}${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`, currency };
}
/** "$1,234.50"; credits as "-$20.00"; `headline` rounds to whole units. */
export function formatMoney(m, { headline = false } = {}) {
    return formatter(m.currency, headline).format(Number(m.amount));
}
/** The sum of the amounts in the first one's currency (others are left out); null for none. */
export function sumMoney(list) {
    if (!list.length)
        return null;
    const currency = list[0].currency;
    return centsToMoney(list.filter((m) => m.currency === currency).reduce((n, m) => n + moneyToCents(m), 0), currency);
}
