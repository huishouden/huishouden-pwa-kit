import { kt } from './i18n.js';
export const CONTACT_FIELDS = [
    'name', 'role', 'phone', 'email', 'website', 'address', 'mapsUrl', 'notes', 'apps', 'private', 'createdAt', 'updatedAt', 'by',
];
/** Drops empty optional fields so documents only carry what was filled in; `private` is always written. */
export function cleanContact(input) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
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
/** What a contact dialog saves: trimmed to the rules' limits, the website made a full URL, and shown in `app`. */
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
        notes: cut(fields.notes, CONTACT_LIMITS.notes),
        apps: apps.includes(app) ? apps : [...apps, app],
        private: fields.private === true,
    };
}
