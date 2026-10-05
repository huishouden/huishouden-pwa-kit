import { kt } from './i18n.js';
export const CONTACT_FIELDS = [
    'name', 'role', 'phone', 'email', 'website', 'address', 'lat', 'lng', 'geoTried', 'mapsUrl', 'notes', 'apps', 'private', 'createdAt', 'updatedAt', 'by', 'via',
];
/**
 * Where a contact's pay details live: `households/{id}/contactPay/{contactId}`, admins and members
 * only. Its fields are the ways of paying plus `updatedAt` and `by` (CONTACT_PAY_FIELDS).
 */
export const CONTACT_PAY_COLLECTION = 'contactPay';
/** Ways of paying a contact that carry a detail worth remembering, in the order forms show them. */
export const CONTACT_PAY_KINDS = ['zelle', 'venmo', 'bank', 'check', 'portal'];
/** Lengths the household rules allow for each pay detail; `portal` is an https:// link. */
export const CONTACT_PAY_LIMITS = { zelle: 120, venmo: 60, bank: 200, check: 300, portal: 500 };
/**
 * Pay details as stored: known ways only, trimmed to their limits, a portal only as an https://
 * link, empty ones left out. Undefined when nothing is left.
 */
export function cleanContactPay(pay) {
    if (!pay || typeof pay !== 'object')
        return undefined;
    const out = {};
    for (const kind of CONTACT_PAY_KINDS) {
        const raw = pay[kind];
        const v = typeof raw === 'string' ? raw.trim().slice(0, CONTACT_PAY_LIMITS[kind]) : '';
        if (!v || (kind === 'portal' && !/^https:\/\/./i.test(v)))
            continue;
        out[kind] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
export const CONTACT_PAY_FIELDS = [...CONTACT_PAY_KINDS, 'updatedAt', 'by'];
/**
 * The `contactPay` document for these pay details, or null when none are left (delete it then).
 */
export function contactPayDoc(pay, by, now) {
    const clean = cleanContactPay(pay);
    return clean ? { ...clean, updatedAt: now, by } : null;
}
/** Contacts with their pay details (`contactPay` documents by contact id) attached. */
export function withContactPay(contacts, pay) {
    return contacts.map((c) => {
        const { pay: _old, ...rest } = c;
        const p = pay.get(c.id);
        return (p ? { ...rest, pay: p } : rest);
    });
}
/**
 * What an admin's or member's app tidies once contacts and pay details have loaded from the server:
 * pay details on contact documents (written before they moved to `contactPay`) are moved, a
 * `contactPay` document already there winning way by way; pay details whose contact was deleted
 * (by a helper, who can't remove them) are deleted once older than `orphanAfter` (a day), so an
 * Undo of the deletion still finds them.
 */
export function tidyContactPay(contacts, pay, now, orphanAfter = 24 * 3600_000) {
    const payById = new Map(pay.map((p) => [p.id, p.data]));
    const ids = new Set(contacts.map((c) => c.id));
    const moves = contacts.flatMap((c) => {
        if (!('pay' in c.data))
            return [];
        const merged = { ...(cleanContactPay(c.data.pay) ?? {}), ...(cleanContactPay(payById.get(c.id)) ?? {}) };
        return [{ id: c.id, pay: merged }];
    });
    const orphans = pay
        .filter((p) => !ids.has(p.id) && now - (typeof p.data.updatedAt === 'number' ? p.data.updatedAt : 0) > orphanAfter)
        .map((p) => p.id);
    return { moves, orphans };
}
/**
 * The contact's document: empty optional fields dropped so it only carries what was filled in;
 * `private` always written. Pay details are never on it (`contactPayDoc`).
 */
export function cleanContact(input) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (k === 'pay')
            continue;
        if (typeof v === 'string') {
            if (v.trim())
                out[k] = v.trim();
        }
        else if (v !== undefined)
            out[k] = v;
    }
    out.private = input.private === true;
    return out;
}
/** `lat` and `lng` when both are on the map; undefined otherwise. */
export function coordinates(d) {
    const ok = (n, max) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
    return d && ok(d.lat, 90) && ok(d.lng, 180) ? { lat: d.lat, lng: d.lng } : undefined;
}
/** A contact document as a Contact. Pay details are read from `contactPay`, never from here. */
export function toContact(id, data) {
    const str = (k) => (typeof data[k] === 'string' ? data[k] : undefined);
    return {
        id,
        name: str('name') ?? '',
        role: str('role'),
        phone: str('phone'),
        email: str('email'),
        website: str('website'),
        address: str('address'),
        mapsUrl: str('mapsUrl'),
        notes: str('notes'),
        ...(coordinates(data) ?? {}),
        apps: Array.isArray(data.apps) ? data.apps.map(String) : [],
        ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
        by: str('by') ?? '',
    };
}
// ---- Helpers for an app's contacts screen and dialog ----
/** Field lengths the household rules allow for contacts. */
export const CONTACT_LIMITS = { name: 120, role: 60, phone: 40, email: 120, website: 300, address: 300, notes: 1000 };
/**
 * Contacts grouped by role: the app's known `roles` first in their order (matched ignoring case),
 * then typed roles A–Z, then contacts without a role as "Other" (in the active language). Names A–Z within each group.
 * With `roleLabel` (as on `ContactDialog`), a role typed as a known role's label ("Plomero") joins
 * that role's group; a group's `role` is still the stored one, shown with `roleLabel`.
 */
export function groupContacts(contacts, roles, roleLabel) {
    const other = kt('contacts.other');
    const groups = new Map();
    const known = (typed) => roles.find((r) => r.toLowerCase() === typed.toLowerCase()) ?? (roleLabel ? roles.find((r) => roleLabel(r).toLowerCase() === typed.toLowerCase()) : undefined);
    for (const c of [...contacts].sort((a, b) => a.name.localeCompare(b.name))) {
        const typed = c.role?.trim();
        const role = (typed && (known(typed) ?? typed)) || other;
        groups.set(role, [...(groups.get(role) ?? []), c]);
    }
    const rank = (role) => {
        const i = roles.indexOf(role);
        if (i >= 0)
            return i;
        return role === other ? roles.length + 2 : roles.length + 1;
    };
    return [...groups.entries()]
        .map(([role, list]) => ({ role, contacts: list }))
        .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role));
}
/** "example.com" → "https://example.com"; empty stays empty. */
export function normalizeWebsite(url) {
    const t = url?.trim();
    if (!t)
        return undefined;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
/** "https://www.example.com/kids/" → "example.com/kids", for showing a link compactly. */
export function displayWebsite(url) {
    return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}
/**
 * What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`.
 * `pay`, when given, is kept even when empty (`{}`), so `updateContact` removes cleared pay details;
 * left out, a contact's pay details are kept as they are.
 */
export function contactInput(fields, apps, app) {
    const cut = (s, max) => s?.trim().slice(0, max) || undefined;
    return {
        name: fields.name.trim().slice(0, CONTACT_LIMITS.name),
        role: cut(fields.role, CONTACT_LIMITS.role),
        phone: cut(fields.phone, CONTACT_LIMITS.phone),
        email: cut(fields.email, CONTACT_LIMITS.email),
        website: cut(normalizeWebsite(fields.website), CONTACT_LIMITS.website),
        address: cut(fields.address, CONTACT_LIMITS.address),
        mapsUrl: fields.mapsUrl?.trim() || undefined,
        // A position only with the address it belongs to.
        ...(fields.address?.trim() && coordinates(fields) ? coordinates(fields) : {}),
        notes: cut(fields.notes, CONTACT_LIMITS.notes),
        ...('pay' in fields ? { pay: cleanContactPay(fields.pay) ?? {} } : {}),
        apps: apps.includes(app) ? apps : [...apps, app],
        private: fields.private === true,
    };
}
// ---- Positions for contacts saved before they had one ----
/** How long an address the map couldn't find waits before it is looked up again: 30 days. */
export const POSITION_RETRY_MS = 30 * 86_400_000;
/** How many contacts one load looks up at most. */
export const POSITION_BACKFILL_LIMIT = 10;
/**
 * Whether a contact document has an address but no position, and the map wasn't asked about it in
 * the last `POSITION_RETRY_MS` (`geoTried`, the ms of a lookup that found nothing).
 */
export function needsPosition(data, now) {
    if (!data || typeof data.address !== 'string' || !data.address.trim() || coordinates(data))
        return false;
    const tried = data.geoTried;
    return !(typeof tried === 'number' && Number.isFinite(tried) && now - tried < POSITION_RETRY_MS);
}
/**
 * Looks up, one at a time, up to `limit` contacts that `needsPosition`, and writes each one's
 * position, or `geoTried` when the map has no match. Stops at the first lookup or write that fails
 * (the service is busy, offline, the rules refused), leaving the rest for the next load.
 */
export async function backfillPositions(docs, { geocode, write, current, whenVisible, limit = POSITION_BACKFILL_LIMIT, now = Date.now, signal }) {
    const result = { located: [], missed: [] };
    const queue = docs.filter((d) => needsPosition(d.data, now())).slice(0, Math.max(0, limit));
    for (const d of queue) {
        if (signal?.aborted || (whenVisible && !(await whenVisible())) || signal?.aborted)
            break;
        const address = String(d.data.address);
        const unchanged = () => {
            const latest = current ? current(d.id) : d.data;
            return !!latest && latest.address === address && needsPosition(latest, now());
        };
        if (!unchanged())
            continue;
        let found;
        try {
            found = await geocode(address.trim());
        }
        catch {
            break;
        }
        if (signal?.aborted)
            break;
        if (!unchanged())
            continue;
        const at = found && coordinates(found);
        try {
            if (at) {
                await write(d.id, { lat: Math.round(at.lat * 1e6) / 1e6, lng: Math.round(at.lng * 1e6) / 1e6 });
                result.located.push(d.id);
            }
            else {
                await write(d.id, { geoTried: Math.round(now()) });
                result.missed.push(d.id);
            }
        }
        catch {
            break;
        }
    }
    return result;
}
