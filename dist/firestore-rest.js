/**
 * Firestore over REST for servers (no Firebase SDK, no DOM), as the signed-in person (their Firebase ID token on every call), so the
 * household's security rules decide every read and write exactly as in the apps. Values come back
 * typed (`{"integerValue": "5"}`) and are decoded into plain JSON; whole numbers are written as
 * integers, as the Firebase SDK does, since the rules check `is int`.
 */
/** `increment(n)`: added on the server, as the SDK's FieldValue. */
export class Increment {
    by;
    constructor(by) {
        this.by = by;
    }
}
export class FirestoreError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const STATUS_CODES = {
    PERMISSION_DENIED: 'permission-denied',
    NOT_FOUND: 'not-found',
    ALREADY_EXISTS: 'already-exists',
    FAILED_PRECONDITION: 'failed-precondition',
    INVALID_ARGUMENT: 'invalid-argument',
    UNAUTHENTICATED: 'unauthenticated',
    UNAVAILABLE: 'unavailable',
    ABORTED: 'unavailable',
};
export function encode(v) {
    if (v === null || v === undefined)
        return { nullValue: null };
    if (typeof v === 'boolean')
        return { booleanValue: v };
    if (typeof v === 'number')
        return Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string')
        return { stringValue: v };
    if (Array.isArray(v))
        return { arrayValue: { values: v.map(encode) } };
    if (typeof v === 'object')
        return { mapValue: { fields: encodeFields(v) } };
    throw new FirestoreError('invalid-argument', `Cannot store a ${typeof v}`);
}
/** Fields of a document, leaving out `undefined` (as JSON does) and increments (written as transforms). */
export function encodeFields(data) {
    const out = {};
    for (const [k, v] of Object.entries(data))
        if (v !== undefined && !(v instanceof Increment))
            out[k] = encode(v);
    return out;
}
export function decode(value) {
    if ('nullValue' in value)
        return null;
    if ('booleanValue' in value)
        return value.booleanValue;
    if ('integerValue' in value)
        return Number(value.integerValue);
    if ('doubleValue' in value)
        return value.doubleValue;
    if ('timestampValue' in value)
        return Date.parse(value.timestampValue);
    if ('stringValue' in value)
        return value.stringValue;
    if ('arrayValue' in value)
        return (value.arrayValue.values ?? []).map(decode);
    if ('mapValue' in value)
        return decodeFields(value.mapValue.fields);
    return undefined;
}
export function decodeFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}
/** A field path segment, quoted when it isn't a simple name ("2031-01-05" in a map of days). */
const segment = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `\`${k.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``);
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Increment);
/** Leaf field paths of a merge, as the SDK's `set(…, { merge: true })` writes them (nested maps merge too). */
export function mergePaths(data, prefix = '') {
    return Object.entries(data).flatMap(([k, v]) => {
        if (v === undefined || v instanceof Increment)
            return [];
        const path = prefix + segment(k);
        return isPlainObject(v) && Object.keys(v).length > 0 ? mergePaths(v, `${path}.`) : [path];
    });
}
function transforms(data, prefix = '') {
    return Object.entries(data).flatMap(([k, v]) => {
        const path = prefix + segment(k);
        if (v instanceof Increment)
            return [{ fieldPath: path, increment: encode(v.by) }];
        return isPlainObject(v) ? transforms(v, `${path}.`) : [];
    });
}
export class FirestoreRest {
    root;
    projectId;
    base;
    token;
    fetchImpl;
    constructor({ projectId, token, baseUrl = 'https://firestore.googleapis.com/v1', fetch: fetchImpl }) {
        this.projectId = projectId;
        this.token = token;
        this.base = baseUrl.replace(/\/$/, '');
        this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
        this.root = `projects/${projectId}/databases/(default)/documents`;
    }
    async call(method, url, body) {
        let res;
        try {
            res = await this.fetchImpl(`${this.base}/${url}`, {
                method,
                headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        catch {
            throw new FirestoreError('unavailable', 'Firestore unreachable');
        }
        const parsed = (await res.json().catch(() => ({})));
        if (!res.ok) {
            const error = (Array.isArray(parsed) ? parsed[0] : parsed);
            const status = error?.error?.status ?? '';
            throw new FirestoreError(STATUS_CODES[status] ?? (res.status === 403 ? 'permission-denied' : res.status === 404 ? 'not-found' : 'unknown'), `Firestore ${res.status} ${status}`.trim());
        }
        return parsed;
    }
    docOf(raw) {
        const at = raw.name.indexOf('/documents/');
        const path = raw.name.slice(at + '/documents/'.length);
        return { id: path.split('/').pop(), path, data: decodeFields(raw.fields), updateTime: raw.updateTime };
    }
    /** The document, or null when it doesn't exist. A refused read throws `permission-denied`. */
    async get(path) {
        try {
            return this.docOf(await this.call('GET', `${this.root}/${path}`));
        }
        catch (e) {
            if (e instanceof FirestoreError && e.code === 'not-found')
                return null;
            throw e;
        }
    }
    /**
     * Documents of `collection` under `parent` (a document path, or '' for the root) matching every
     * filter. The rules check the query as a whole, so a helper's reads of private-capable
     * collections must ask for `private == false`.
     */
    async query(parent, collection, { where = [], orderBy = [], limit } = {}) {
        const filters = where.map((f) => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: encode(f.value) } }));
        const structuredQuery = {
            from: [{ collectionId: collection }],
            ...(filters.length === 1 ? { where: filters[0] } : filters.length > 1 ? { where: { compositeFilter: { op: 'AND', filters } } } : {}),
            ...(orderBy.length ? { orderBy: orderBy.map((o) => ({ field: { fieldPath: o.field }, direction: o.direction ?? 'ASCENDING' })) } : {}),
            ...(limit ? { limit } : {}),
        };
        const url = parent ? `${this.root}/${parent}:runQuery` : `${this.root}:runQuery`;
        const rows = await this.call('POST', url, { structuredQuery });
        return rows.filter((r) => r.document).map((r) => this.docOf(r.document));
    }
    /** Every write at once, or none: the rules check each as if the app had made it. */
    async commit(writes) {
        if (writes.length === 0)
            return;
        const name = (path) => `${this.root}/${path}`;
        const body = writes.map((w) => {
            if ('delete' in w)
                return { delete: name(w.path) };
            const data = 'set' in w ? w.set : 'merge' in w ? w.merge : w.create;
            const fieldTransforms = transforms(data);
            return {
                update: { name: name(w.path), fields: encodeFields(data) },
                ...('merge' in w ? { updateMask: { fieldPaths: mergePaths(data) } } : {}),
                ...('create' in w ? { currentDocument: { exists: false } } : {}),
                ...(fieldTransforms.length ? { updateTransforms: fieldTransforms } : {}),
            };
        });
        await this.call('POST', `${this.root}:commit`, { writes: body });
    }
}
