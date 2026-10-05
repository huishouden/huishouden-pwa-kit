import { householdRole, isRestricted } from '../role-core.js';
import { isLang, loadLang } from '../i18n.js';
import { LocalClock, isTimeZone } from '../local-clock.js';
import { FirestoreError } from '../firestore-rest.js';
import { toHome } from '../home.js';
export function toHousehold(id, d) {
    const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    const roles = d.roles && typeof d.roles === 'object' ? d.roles : undefined;
    const home = toHome(d.home);
    return {
        id,
        name: typeof d.name === 'string' ? d.name : '',
        members: strings(d.members),
        joined: strings(d.joined),
        ...(roles ? { roles } : {}),
        ...(typeof d.currency === 'string' ? { currency: d.currency } : {}),
        ...(home ? { home } : {}),
        createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    };
}
/** The household the apps open (`@huishouden/pwa-kit/household` pickHousehold): joined first, then oldest. */
export function pickHousehold(households, email) {
    const sorted = [...households].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return sorted.find((h) => h.joined.includes(email)) ?? sorted[0] ?? null;
}
/** Thrown for anything the person should hear in their language (an unknown pet, no household). */
export class UserError extends Error {
    key;
    vars;
    constructor(key, vars = {}) {
        super(key);
        this.key = key;
        this.vars = vars;
    }
}
/**
 * One tool call's view of the world: who is asking (their FirestoreRest access, as them), their clock
 * and language, and their households. Built per request; cheap, since reads happen on demand.
 */
export class Session {
    props;
    db;
    siteUrl;
    realNow;
    audit;
    householdsP = null;
    profiles = new Map();
    constructor(props, db, siteUrl, realNow = Date.now, audit = () => { }) {
        this.props = props;
        this.db = db;
        this.siteUrl = siteUrl;
        this.realNow = realNow;
        this.audit = audit;
    }
    get email() {
        return this.props.email;
    }
    /** What every write by this session carries: `{ via: 'assistant' }` for the connector, else nothing. */
    get via() {
        return this.props.via ? { via: this.props.via } : {};
    }
    households() {
        this.householdsP ??= this.db
            .query('', 'households', { where: [{ field: 'members', op: 'ARRAY_CONTAINS', value: this.email }] })
            .then((docs) => docs.map((d) => toHousehold(d.id, d.data)));
        return this.householdsP;
    }
    /** The household `id`, or the one the apps open; throws a UserError when there is none. */
    async here(id) {
        const all = await this.households();
        const h = id ? all.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase()) : pickHousehold(all, this.email);
        if (!h)
            throw new UserError(id ? 'error.noSuchHousehold' : 'error.noHousehold');
        const role = householdRole(h, this.email) ?? 'member';
        return { ...h, role, restricted: isRestricted(role) };
    }
    profile(householdId) {
        let p = this.profiles.get(householdId);
        if (!p) {
            p = this.db
                .get(`households/${householdId}/profiles/${this.email}`)
                .then((d) => {
                const data = d?.data ?? {};
                return {
                    ...(typeof data.name === 'string' && data.name ? { name: data.name } : {}),
                    ...(isLang(data.lang) ? { lang: data.lang } : {}),
                    ...(isTimeZone(data.timeZone) ? { timeZone: data.timeZone } : {}),
                };
            })
                .catch(() => ({}));
            this.profiles.set(householdId, p);
        }
        return p;
    }
    /** The language to answer in: the call's, the profile's, the one at sign-in, else English. Loaded. */
    async lang(householdId, asked) {
        const profile = householdId ? await this.profile(householdId) : {};
        const lang = isLang(asked) ? asked : (profile.lang ?? this.props.lang ?? 'en');
        await loadLang(lang);
        return lang;
    }
    async clock(householdId, asked) {
        const profile = householdId ? await this.profile(householdId) : {};
        const zone = [asked, profile.timeZone, this.props.timeZone].find(isTimeZone) ?? 'UTC';
        return new LocalClock(zone, this.realNow);
    }
    /** "Sam": the profile's first name, else the email's name part, for `addedBy`. */
    async firstName(householdId) {
        const { name } = await this.profile(householdId);
        const first = (name ?? '').trim().split(/\s+/)[0];
        if (first)
            return first.slice(0, 40);
        const local = this.email.split('@')[0].split(/[._+-]/)[0];
        return (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 40);
    }
    link(app, query = '') {
        return `${this.siteUrl.replace(/\/$/, '')}/${app}/${query}`;
    }
    record(householdId, entry) {
        this.audit(householdId, entry);
    }
    /** Reads `collection` under the household, as the person may (helpers and kids only open records). */
    async openRecords(here, collection, privateCapable, where = {}) {
        const filters = [...(where.where ?? []), ...(privateCapable && here.restricted ? [{ field: 'private', op: 'EQUAL', value: false }] : [])];
        return this.db.query(`households/${here.id}`, collection, { ...where, where: filters });
    }
}
export const isDenied = (e) => e instanceof FirestoreError && e.code === 'permission-denied';
