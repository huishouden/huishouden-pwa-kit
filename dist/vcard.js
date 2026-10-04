/**
 * Contacts the person already has, read into the household's contact fields: a contact card file
 * (.vcf, vCard 2.1, 3.0 or 4.0, as iPhone, Android, Google Contacts and Outlook export them), the
 * phone's own contact picker (Contact Picker API, Chrome on Android), or a card shared into the
 * installed app (`pwaApp({ shareTarget: { contacts: true } })`).
 *
 * Nothing is uploaded: cards are read on the device. Photos are skipped.
 */
import { kt } from './i18n.js';
import { CONTACT_LIMITS as LIMITS } from './contacts';
/** Unescapes a 3.0/4.0 text value: "\n", "\,", "\;", "\\". */
const unescapeText = (s) => s.replace(/\\([nN,;:\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
/** Splits on separators not escaped with a backslash, keeping the escapes for `unescapeText`. */
function splitUnescaped(s, sep) {
    const parts = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '\\' && i + 1 < s.length) {
            cur += c + s[i + 1];
            i++;
        }
        else if (c === sep) {
            parts.push(cur);
            cur = '';
        }
        else
            cur += c;
    }
    parts.push(cur);
    return parts;
}
/** Quoted-printable bytes ("=C3=A9") decoded with the card's charset. */
function decodeQuotedPrintable(s, charset = 'utf-8') {
    const bytes = [];
    const text = s.replace(/=\r?\n/g, '');
    for (let i = 0; i < text.length; i++) {
        const hex = text[i] === '=' ? text.slice(i + 1, i + 3) : '';
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 2;
        }
        else {
            // Characters outside ASCII can only arrive already decoded; keep them as UTF-8.
            for (const b of new TextEncoder().encode(text[i]))
                bytes.push(b);
        }
    }
    try {
        return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(new Uint8Array(bytes));
    }
    catch {
        return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    }
}
/** "TYPE=WORK,VOICE", "TYPE=\"cell,voice\"", vCard 2.1's bare "WORK" and "CHARSET=UTF-8". */
function parseParams(parts) {
    const params = {};
    for (const part of parts) {
        if (!part)
            continue;
        const eq = part.indexOf('=');
        const key = (eq < 0 ? 'TYPE' : part.slice(0, eq)).trim().toUpperCase();
        const raw = eq < 0 ? part : part.slice(eq + 1);
        // vCard 2.1 writes encodings bare too: "TEL;QUOTED-PRINTABLE:" and "PHOTO;BASE64:".
        const bareEncoding = eq < 0 && /^(?:quoted-printable|base64|b|8bit|7bit)$/i.test(raw.trim());
        const values = raw
            .split(',')
            .map((v) => v.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
        const k = bareEncoding ? 'ENCODING' : key;
        params[k] = [...(params[k] ?? []), ...values];
    }
    return params;
}
/** Splits "item1.TEL;TYPE=CELL:555" at the first colon outside quotes. */
function parseLine(line) {
    let inQuotes = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"')
            inQuotes = !inQuotes;
        else if (line[i] === ':' && !inQuotes) {
            colon = i;
            break;
        }
    }
    if (colon < 0)
        return null;
    const head = line.slice(0, colon);
    const parts = splitUnescaped(head, ';');
    const full = parts[0].trim();
    const dot = full.lastIndexOf('.');
    return {
        group: dot > 0 ? full.slice(0, dot).toLowerCase() : undefined,
        name: (dot > 0 ? full.slice(dot + 1) : full).toUpperCase(),
        params: parseParams(parts.slice(1)),
        value: line.slice(colon + 1),
    };
}
const isQuotedPrintable = (line) => /;(?:ENCODING=)?QUOTED-PRINTABLE[;:]/i.test(line.split(':')[0] + ':');
/**
 * Logical lines: folded lines (a leading space or tab) joined, quoted-printable soft breaks ("=" at
 * the end) joined, and vCard 2.1's unindented base64 (a photo) kept with its property.
 */
function logicalLines(text) {
    const raw = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        let line = raw[i];
        if (/^[ \t]/.test(line) && out.length) {
            out[out.length - 1] += line.slice(1);
            continue;
        }
        if (isQuotedPrintable(line)) {
            while (line.endsWith('=') && i + 1 < raw.length)
                line = line.slice(0, -1) + raw[++i];
        }
        if (!line.trim())
            continue;
        // A line with no "name:" can only be the rest of the previous value (a 2.1 base64 photo).
        if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)?[;:]/.test(line) && out.length) {
            out[out.length - 1] += line;
            continue;
        }
        out.push(line);
    }
    return out;
}
/** A property's value as text: quoted-printable and charset decoded, escapes kept for splitting. */
function rawValue(p) {
    const encoding = p.params.ENCODING?.[0]?.toUpperCase();
    if (encoding === 'QUOTED-PRINTABLE')
        return decodeQuotedPrintable(p.value, p.params.CHARSET?.[0]);
    return p.value;
}
const text = (p) => unescapeText(rawValue(p)).trim();
const structured = (p) => splitUnescaped(rawValue(p), ';').map((s) => unescapeText(s).trim());
// Labels shown beside a number or address, in the active language ("iPhone" is a name).
const TYPE_LABELS = {
    cell: 'contacts.label.mobile',
    mobile: 'contacts.label.mobile',
    iphone: '',
    home: 'contacts.label.home',
    work: 'contacts.label.work',
    main: 'contacts.label.main',
    fax: 'contacts.label.fax',
    pager: 'contacts.label.pager',
    other: 'contacts.label.other',
    text: 'contacts.label.text',
    video: 'contacts.label.video',
    internet: '',
    voice: '',
    pref: '',
    x400: '',
};
const typeWord = (t) => (t === 'iphone' ? 'iPhone' : TYPE_LABELS[t] ? kt(TYPE_LABELS[t]) : undefined);
/** Apple writes custom labels as "_$!<Mobile>!$_" for its own and plain text for the person's. */
const cleanLabel = (s) => s.replace(/^_\$!<(.+)>!\$_$/, '$1').trim();
function typeLabel(p) {
    const types = (p.params.TYPE ?? []).flatMap((t) => t.split(',')).map((t) => t.toLowerCase());
    // "work fax" reads better than "Fax" alone; "home" alone says little next to "Mobile".
    if (types.includes('fax'))
        return kt(types.includes('home') ? 'contacts.label.homeFax' : types.includes('work') ? 'contacts.label.workFax' : 'contacts.label.fax');
    for (const t of ['cell', 'mobile', 'iphone', 'main', 'work', 'home', 'pager', 'other', 'text', 'video'])
        if (types.includes(t))
            return typeWord(t);
    const custom = types.find((t) => t.startsWith('x-'));
    return custom ? custom.slice(2) : undefined;
}
const isPreferred = (p) => (p.params.TYPE ?? []).some((t) => t.toLowerCase() === 'pref') || (p.params.PREF ?? []).length > 0;
/** "tel:+1-555-010-0101" → "+1-555-010-0101"; "mailto:" likewise. */
const stripScheme = (s, scheme) => s.replace(new RegExp(`^${scheme}:`, 'i'), '').trim();
function formatAddress(parts) {
    // PO box; extended; street; locality; region; postal code; country. Apple puts several street lines in one field.
    const [pobox = '', extended = '', street = '', locality = '', region = '', postal = '', country = ''] = parts.map((s) => s.replace(/\s*\n\s*/g, ', ').trim());
    const regionPostal = [region, postal].filter(Boolean).join(' ');
    return [street, extended, pobox && `PO Box ${pobox.replace(/^p\.?\s*o\.?\s*box\s*/i, '')}`, locality, regionPostal, country].filter(Boolean).join(', ');
}
/** One BEGIN:VCARD … END:VCARD block. */
function readCard(props) {
    const labels = new Map();
    for (const p of props)
        if (p.name === 'X-ABLABEL' && p.group)
            labels.set(p.group, cleanLabel(text(p)));
    const labelOf = (p) => (p.group && labels.get(p.group)) || typeLabel(p);
    const first = (name) => props.find((p) => p.name === name);
    const values = (name, scheme) => {
        const list = props
            .filter((p) => p.name === name)
            .map((p, i) => ({ p, i, value: scheme ? stripScheme(text(p), scheme) : text(p) }))
            .filter((v) => v.value);
        list.sort((a, b) => Number(isPreferred(b.p)) - Number(isPreferred(a.p)) || a.i - b.i);
        const seen = new Set();
        return list
            .filter((v) => {
            // "555-010-0161" and "+1 555-010-0161" are one number; emails differ only in case.
            const key = name === 'TEL' ? v.value.replace(/\D/g, '').slice(-10) : v.value.toLowerCase();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        })
            .map(({ p, value }) => {
            const label = labelOf(p);
            return label ? { value, label } : { value };
        });
    };
    const n = first('N') ? structured(first('N')) : [];
    const [family = '', given = '', additional = '', prefix = '', suffix = ''] = n;
    const fromN = [prefix, given, additional, family].filter(Boolean).join(' ') + (suffix ? `, ${suffix}` : '');
    const fn = first('FN') ? text(first('FN')) : '';
    const orgParts = first('ORG') ? structured(first('ORG')).filter(Boolean) : [];
    const organization = orgParts.join(', ') || undefined;
    // A company card (Apple's "Show as company", or no person's name at all) is named for the business.
    const companyCard = props.some((p) => p.name === 'X-ABSHOWAS' && /company/i.test(text(p))) || (props.find((p) => p.name === 'KIND') && /org/i.test(text(first('KIND'))));
    const person = companyCard ? '' : fn && fn !== organization ? fn : fromN.trim();
    const name = person || organization || fn || '';
    const adr = props.find((p) => p.name === 'ADR' && isPreferred(p)) ?? first('ADR');
    const address = adr ? formatAddress(structured(adr)) : first('LABEL') ? text(first('LABEL')).replace(/\s*\n\s*/g, ', ') : '';
    const title = first('TITLE') ? text(first('TITLE')) : first('ROLE') ? text(first('ROLE')) : '';
    const website = values('URL')[0]?.value;
    const note = props
        .filter((p) => p.name === 'NOTE')
        .map(text)
        .filter(Boolean)
        .join('\n');
    const card = { name, phones: values('TEL', 'tel'), emails: values('EMAIL', 'mailto') };
    if (address)
        card.address = address;
    if (organization)
        card.organization = organization;
    if (title)
        card.title = title;
    if (website)
        card.website = website;
    if (note)
        card.note = note;
    if (!card.name && !card.phones.length && !card.emails.length && !card.address)
        return null;
    if (!card.name)
        card.name = card.emails[0]?.value ?? card.phones[0]?.value ?? '';
    return card;
}
/**
 * Every contact in a contact card file (.vcf): vCard 2.1, 3.0 and 4.0, one or many cards, as
 * iPhone, Android, Google Contacts and Outlook export them. Folded lines, quoted-printable text in
 * any charset, Apple's custom labels ("item1.X-ABLabel") and TYPE parameters are understood;
 * photos are skipped. Cards with nothing usable are left out.
 */
export function parseVCard(input) {
    const cards = [];
    let current = null;
    for (const line of logicalLines(input)) {
        const p = parseLine(line);
        if (!p)
            continue;
        if (p.name === 'BEGIN' && /^vcard$/i.test(p.value.trim()))
            current = [];
        else if (p.name === 'END' && /^vcard$/i.test(p.value.trim())) {
            if (current) {
                const card = readCard(current);
                if (card)
                    cards.push(card);
            }
            current = null;
        }
        else if (current && p.name !== 'PHOTO' && p.name !== 'LOGO' && p.name !== 'SOUND' && p.name !== 'KEY')
            current.push(p);
    }
    return cards;
}
/** True when the text looks like a contact card. */
export const isVCard = (text) => /BEGIN:VCARD/i.test(text);
// ---------------------------------------------------------------------------------------------
// Into the household's contact fields
const labelled = (v) => (v.label ? `${v.value} (${v.label[0].toLowerCase()}${v.label.slice(1)})` : v.value);
/**
 * A parsed contact as the contact dialog's fields: the first phone and email, the rest in notes
 * with their labels, the organization as the name of a business card or (with the job title) as the
 * role of a person, and the card's own note. Each field cut to the rules' limits.
 */
export function contactFromCard(card, { role: fillRole = true } = {}) {
    const out = {};
    const cut = (s, max) => s?.trim().slice(0, max) || undefined;
    out.name = cut(card.name, LIMITS.name);
    // A phone number longer than the field allows is not one worth half-keeping.
    const phone = card.phones.find((p) => p.value.length <= LIMITS.phone);
    const email = card.emails.find((e) => e.value.length <= LIMITS.email);
    if (phone)
        out.phone = phone.value;
    if (email)
        out.email = email.value;
    out.website = cut(card.website, LIMITS.website);
    out.address = cut(card.address, LIMITS.address);
    const isBusiness = !!card.organization && card.organization === card.name;
    const roleText = [card.title, isBusiness ? '' : card.organization].filter(Boolean).join(', ');
    const notes = [];
    if (roleText && fillRole && roleText.length <= LIMITS.role)
        out.role = roleText;
    else if (roleText)
        notes.push(roleText);
    const otherPhones = card.phones.filter((p) => p !== phone);
    const otherEmails = card.emails.filter((e) => e !== email);
    if (otherPhones.length)
        notes.push(kt('contacts.otherPhones', { list: otherPhones.map(labelled).join(', ') }));
    if (otherEmails.length)
        notes.push(kt('contacts.otherEmails', { list: otherEmails.map(labelled).join(', ') }));
    if (card.note)
        notes.push(card.note);
    out.notes = cut(notes.join('\n'), LIMITS.notes);
    for (const k of Object.keys(out))
        if (out[k] === undefined)
            delete out[k];
    return out;
}
/** One line under a contact's name in a "choose one" list: its first phone and email, or organization. */
export function contactSummary(card) {
    return [card.organization && card.organization !== card.name ? card.organization : '', card.phones[0]?.value, card.emails[0]?.value].filter(Boolean).join(' · ');
}
/**
 * The phone's own contact picker is there (Chrome on Android; not Safari on iPhone, not desktop
 * browsers). Show "Pick from my contacts" only then.
 */
export function contactPickerSupported() {
    return typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window;
}
/** A contact the picker returned, in the same shape as a parsed card. */
export function fromPickerContact(c) {
    const address = c.address?.[0];
    const line = address
        ? [...(address.addressLine ?? []), address.city, [address.region, address.postalCode].filter(Boolean).join(' '), address.country].map((s) => s?.trim()).filter(Boolean).join(', ')
        : '';
    const uniq = (list) => [...new Set((list ?? []).map((s) => s.trim()).filter(Boolean))].map((value) => ({ value }));
    const card = { name: c.name?.find((n) => n.trim())?.trim() ?? '', phones: uniq(c.tel), emails: uniq(c.email) };
    if (line)
        card.address = line;
    if (!card.name && !card.phones.length && !card.emails.length && !card.address)
        return null;
    if (!card.name)
        card.name = card.emails[0]?.value ?? card.phones[0]?.value ?? '';
    return card;
}
/**
 * Opens the phone's contact picker for one contact: name, phone numbers, emails and (where the
 * phone offers it) address. Call from a tap. Null when the person closes it without choosing.
 */
export async function pickContact() {
    const contacts = navigator.contacts;
    const wanted = ['name', 'tel', 'email', 'address'];
    const available = await contacts.getProperties?.().catch(() => wanted);
    const props = wanted.filter((p) => !available || available.includes(p));
    const [chosen] = await contacts.select(props, { multiple: false });
    return chosen ? fromPickerContact(chosen) : null;
}
// ---------------------------------------------------------------------------------------------
// A card shared into the installed app
/** The marker the share target's redirect puts on the app's address: `?share=contact`. */
export const SHARED_CONTACT_PARAM = { share: 'contact' };
/** Where the service worker keeps a shared card until the app reads it (Cache Storage). */
export const SHARE_CACHE = 'hh-share';
/** The cached card's key, relative to the app's scope. */
export const SHARED_CONTACT_KEY = 'hh-shared-contact';
let sharedRead = null;
/**
 * The contact card(s) shared into the app (Contacts → Share → the app), or null when the app was
 * opened normally. The service worker keeps the shared file until this reads it, once; later calls
 * in the same page give the same answer. An empty list means a share arrived but held no card the
 * app could read. After opening the dialog, `clearSharedContact()` tidies the address bar.
 */
export function readSharedContact(location = window.location) {
    if (new URLSearchParams(location.search).get('share') !== SHARED_CONTACT_PARAM.share)
        return Promise.resolve(null);
    sharedRead ??= (async () => {
        if (typeof caches === 'undefined')
            return [];
        const cache = await caches.open(SHARE_CACHE);
        const key = new URL(SHARED_CONTACT_KEY, location.origin + location.pathname).href;
        let hit = await cache.match(key);
        let used = key;
        if (!hit) {
            // The app moved off the scope's root before reading: take the one card waiting.
            const any = (await cache.keys()).find((r) => r.url.endsWith(`/${SHARED_CONTACT_KEY}`));
            if (any) {
                hit = await cache.match(any);
                used = any.url;
            }
        }
        if (!hit)
            return [];
        const body = await hit.text();
        await cache.delete(used);
        return parseVCard(body);
    })().catch(() => []);
    return sharedRead;
}
/** Takes `?share=contact` off the address bar without reloading. */
export function clearSharedContact() {
    if (typeof window === 'undefined')
        return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('share') !== SHARED_CONTACT_PARAM.share)
        return;
    url.searchParams.delete('share');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
/** Tests only: forget the shared card this page read. */
export function resetSharedContactForTests() {
    sharedRead = null;
}
