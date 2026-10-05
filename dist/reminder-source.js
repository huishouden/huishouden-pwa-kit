/** The sizes the sender and the rules accept. */
export const REMINDER_SOURCE_LIMITS = { checks: 8, conditions: 4, values: 8, path: 400, value: 200 };
const EVERYDAY = ['admin', 'member', 'helper'];
const HEALTH = ['admin', 'member', 'helper'];
/**
 * By app, the collections its reminders' sources may name (`*` is one document id) and what each
 * allows. Kids' sources are never used. Every collection listed is one any member of the roles
 * given may read in full (the rules' `isMember()` reads), except Bills (admins and members) and
 * Health records (the person's readers), which `roles` and `readers` cover; so even a check on
 * whether a document exists tells its writer nothing new. huishouden/rules mirrors the
 * collections (`hhSourceDoc`); add an app's collections here and there before its reminders name
 * them.
 */
export const REMINDER_SOURCES = deepFreeze({
    bills: { bills: { fields: ['status', 'dismissed', 'due'], roles: ['admin', 'member'] } },
    tasks: { items: { fields: ['completed', 'dueAt'], roles: EVERYDAY } },
    pet: {
        petMedCourses: { fields: [], roles: EVERYDAY },
        petMedDoses: { fields: [], roles: EVERYDAY },
        petMeals: { fields: [], roles: EVERYDAY },
        petProfiles: { fields: ['birthDate', 'birthDateApprox'], roles: EVERYDAY },
    },
    health: {
        'healthPeople/*/doses': { fields: [], roles: HEALTH, readers: true },
        'healthPeople/*/meds': { fields: ['refillOrderedAt'], roles: HEALTH, readers: true },
    },
    home: {
        homeEvents: { fields: [], roles: EVERYDAY },
        homeEventPrep: { fields: [], roles: EVERYDAY },
    },
});
function deepFreeze(value) {
    if (value && typeof value === 'object')
        for (const v of Object.values(value))
            deepFreeze(v);
    return Object.freeze(value);
}
const SEGMENT = /^(?!\.\.?$)(?!__.*__$)[^/]{1,200}$/;
/** The collection entry a document path falls in for `app`, or undefined when its sources may not name it. */
export function sourceCollection(app, doc) {
    if (typeof doc !== 'string' || doc.length > REMINDER_SOURCE_LIMITS.path)
        return undefined;
    const parts = doc.split('/');
    if (parts.length < 2 || parts.length % 2 !== 0 || !parts.every((p) => SEGMENT.test(p)))
        return undefined;
    const col = parts.slice(0, -1);
    for (const [pattern, entry] of Object.entries(REMINDER_SOURCES[app] ?? {})) {
        const want = pattern.split('/');
        if (want.length === col.length && want.every((w, i) => w === '*' || w === col[i]))
            return entry;
    }
    return undefined;
}
const isValue = (v) => v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= REMINDER_SOURCE_LIMITS.value);
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function readCondition(value, fields) {
    if (!isMap(value) || Object.keys(value).length !== 2 || typeof value.field !== 'string' || !fields.includes(value.field))
        return null;
    const op = 'in' in value ? 'in' : 'notIn' in value ? 'notIn' : null;
    const values = op ? value[op] : null;
    if (!op || !Array.isArray(values) || values.length === 0 || values.length > REMINDER_SOURCE_LIMITS.values || !values.every(isValue))
        return null;
    return op === 'in' ? { field: value.field, in: [...values] } : { field: value.field, notIn: [...values] };
}
function readCheck(app, value) {
    if (!isMap(value) || typeof value.doc !== 'string')
        return null;
    const entry = sourceCollection(app, value.doc);
    if (!entry)
        return null;
    if (value.absent !== undefined)
        return value.absent === true && Object.keys(value).length === 2 ? { doc: value.doc, absent: true } : null;
    if (Object.keys(value).some((k) => k !== 'doc' && k !== 'due'))
        return null;
    const raw = value.due ?? [];
    if (!Array.isArray(raw) || raw.length > REMINDER_SOURCE_LIMITS.conditions)
        return null;
    const due = raw.map((c) => readCondition(c, entry.fields));
    if (due.some((c) => !c))
        return null;
    return due.length ? { doc: value.doc, due: due } : { doc: value.doc };
}
/**
 * A stored or written `source` as the sender uses it, or null when there is none or it breaks any
 * limit: another app's collection, a field that isn't a done field, too many checks.
 */
export function readSource(app, value) {
    if (!isMap(value) || Object.keys(value).some((k) => k !== 'checks' && k !== 'any'))
        return null;
    if (!Array.isArray(value.checks) || value.checks.length === 0 || value.checks.length > REMINDER_SOURCE_LIMITS.checks)
        return null;
    if (value.any !== undefined && typeof value.any !== 'boolean')
        return null;
    const checks = value.checks.map((c) => readCheck(app, c));
    if (checks.some((c) => !c))
        return null;
    return { checks: checks, ...(value.any ? { any: true } : {}) };
}
/**
 * `source` as `reminderDoc` writes it, or undefined for none or for one the sender would refuse:
 * left off, the reminder still goes out (as one without a source) rather than failing the app's
 * sync. `readSource(app, source) === null` tells a caller it was refused.
 */
export function cleanSource(app, source) {
    if (source === undefined || source === null)
        return undefined;
    return readSource(app, source) ?? undefined;
}
/** The person document a Health record belongs to (`healthPeople/p1`), whose `readers` decide who may check it. */
const personOf = (doc) => doc.split('/').slice(0, 2).join('/');
/** Every document the sender reads for a source: its checks' and, for Health records, their people's. */
export function sourceReads(app, source) {
    const out = new Set();
    for (const c of source.checks) {
        out.add(c.doc);
        if (sourceCollection(app, c.doc)?.readers)
            out.add(personOf(c.doc));
    }
    return [...out];
}
/**
 * Whether a writer with this role may have their source checked: every collection allows the role
 * and, for Health records, the writer is an admin or one of the person's `readers`. Undefined while a
 * person document it needs wasn't read.
 */
export function sourceAllowed(app, source, writer, role, read) {
    const email = writer.trim().toLowerCase();
    let unknown = false;
    for (const c of source.checks) {
        const entry = sourceCollection(app, c.doc);
        if (!entry || !entry.roles.includes(role))
            return false;
        if (!entry.readers || role === 'admin')
            continue;
        const person = personOf(c.doc);
        if (!read.has(person)) {
            unknown = true;
            continue;
        }
        const readers = read.get(person)?.readers;
        if (!Array.isArray(readers) || !readers.some((r) => typeof r === 'string' && r.toLowerCase() === email))
            return false;
    }
    return unknown ? undefined : true;
}
const fieldOf = (fields, name) => (Object.prototype.hasOwnProperty.call(fields, name) && fields[name] !== undefined ? fields[name] : null);
const holds = (c, fields) => {
    const v = fieldOf(fields, c.field);
    return 'in' in c ? c.in.some((x) => x === v) : !c.notIn.some((x) => x === v);
};
const passes = (c, fields) => 'absent' in c ? fields === null : fields !== null && (c.due ?? []).every((d) => holds(d, fields));
/**
 * Whether the reminder is still due by its documents as read. Undefined when a document it needs
 * wasn't read and the ones that were don't settle it: the sender then sends it as before.
 */
export function stillDue(source, read) {
    const known = source.checks.filter((c) => read.has(c.doc));
    const results = known.map((c) => passes(c, read.get(c.doc) ?? null));
    if (source.any ? results.includes(true) : results.includes(false))
        return !!source.any;
    return known.length < source.checks.length ? undefined : !source.any;
}
