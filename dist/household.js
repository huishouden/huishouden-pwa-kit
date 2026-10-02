import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { addDoc, arrayRemove, arrayUnion, setDoc, updateDoc } from './firestore.js';
import { observeHousehold } from './observability.js';
import { effectiveRoles, toRoles } from './roles.js';
export const normalizeEmail = (email) => email.trim().toLowerCase();
const COLLECTION = 'households';
/**
 * The household an app uses when a person belongs to several. Any member of any household can add
 * an email to it, so an invitation the person never acted on must not displace a household they
 * already use: households they have joined (opened an app in, see `markJoined`) come first, and
 * among those, or among invitations when they have joined none, the oldest, so every app picks the
 * same one. Documents still waiting for the server (a household created a moment ago on this
 * device) are skipped — the rules can't see them yet, so subscriptions under them would be refused.
 */
export function pickHousehold(docs, email) {
    const me = email ? normalizeEmail(email) : null;
    const households = docs
        .filter((d) => !d.pending)
        .map((d) => toHousehold(d.id, d.data))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return (me && households.find((h) => h.joined.includes(me))) || households[0] || null;
}
const membersQuery = (db, email) => query(collection(db, COLLECTION), where('members', 'array-contains', normalizeEmail(email)));
/** Follows the household the signed-in person belongs to (see `pickHousehold`). */
export function watchHousehold(db, email, onChange) {
    onChange({ status: 'loading' });
    return onSnapshot(membersQuery(db, email), { includeMetadataChanges: true }, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data(), pending: d.metadata.hasPendingWrites }));
        // Stay loading while the only household is a local one the server hasn't accepted yet.
        if (docs.length && docs.every((d) => d.pending))
            return;
        const household = pickHousehold(docs, email);
        onChange(household ? { status: 'ready', household } : { status: 'none' });
    }, (error) => onChange({ status: 'error', error }));
}
/** One-off lookup of the same household `watchHousehold` follows; null when not a member anywhere. */
export async function findHousehold(db, email) {
    const snap = await getDocs(membersQuery(db, email));
    return pickHousehold(snap.docs.map((d) => ({ id: d.id, data: d.data() })), email);
}
export function toHousehold(id, data) {
    return {
        id,
        name: String(data.name ?? 'Household'),
        members: Array.isArray(data.members) ? data.members.map(String) : [],
        joined: Array.isArray(data.joined) ? data.joined.map(String) : [],
        roles: toRoles(data.roles),
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    };
}
/** Starts a household with only its creator, its admin; others are invited from inside. */
export async function createHousehold(db, email, name) {
    const me = normalizeEmail(email);
    const ref = await addDoc(collection(db, COLLECTION), { name: name.trim(), members: [me], roles: { [me]: 'admin' }, createdAt: Date.now() });
    return ref.id;
}
/**
 * Invites by email (admins only): they get every app the next time they sign in with that Google
 * account, as a member unless `role` says otherwise. Pass the household to give a role.
 */
export async function inviteMember(db, household, email, role = 'member') {
    const address = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        throw new Error(`Not an email address: ${email}`);
    const id = typeof household === 'string' ? household : household.id;
    if (role === 'member') {
        await updateDoc(doc(db, COLLECTION, id), { members: arrayUnion(address) });
        return;
    }
    if (typeof household === 'string')
        throw new Error('Pass the household to invite someone with a role.');
    if (household.members.includes(address))
        throw new Error(`${address} is already in the household.`);
    await updateDoc(doc(db, COLLECTION, id), {
        members: arrayUnion(address),
        roles: { ...effectiveRoles(household), [address]: role },
    });
}
/**
 * Removes someone (admins only, never themselves). With the household, their role goes too and
 * everyone else's is written out, so removing the creator never makes the next person an admin by
 * position; the rules refuse a removal that would leave a role behind.
 */
export async function removeMember(db, household, email) {
    const address = normalizeEmail(email);
    if (typeof household === 'string') {
        await updateDoc(doc(db, COLLECTION, household), { members: arrayRemove(address) });
        return;
    }
    const rest = household.members.filter((m) => m !== address);
    const { [address]: _gone, ...roles } = effectiveRoles(household);
    await updateDoc(doc(db, COLLECTION, household.id), { members: rest, roles: Object.fromEntries(rest.map((m) => [m, roles[m]])) });
}
/** Records the signed-in member's first visit; harmless to call on every sign-in. */
export async function markJoined(db, household, email) {
    const address = normalizeEmail(email);
    if (household.joined.includes(address) || !household.members.includes(address))
        return;
    await updateDoc(doc(db, COLLECTION, household.id), { joined: arrayUnion(address) });
}
/** Members who were invited but have not signed in yet. */
export function pendingMembers(household) {
    return household.members.filter((m) => !household.joined.includes(m));
}
/**
 * Records the signed-in member's name and photo; cheap to call on every sign-in. Also tags this
 * visit's usage counts with the household's hash (`./observability`), so active households can be
 * counted without knowing which.
 */
export async function saveMyProfile(db, householdId, user) {
    if (!user.email)
        return;
    const email = normalizeEmail(user.email);
    const profile = { updatedAt: Date.now() };
    if (user.displayName)
        profile.name = user.displayName.slice(0, 100);
    if (user.photoURL?.startsWith('https://'))
        profile.photoURL = user.photoURL.slice(0, 500);
    void observeHousehold(householdId);
    await setDoc(doc(db, COLLECTION, householdId, 'profiles', email), profile);
}
/** Follows the profiles members have recorded, keyed by email. */
export function watchProfiles(db, householdId, onChange, onError) {
    return onSnapshot(collection(db, COLLECTION, householdId, 'profiles'), (snap) => onChange(new Map(snap.docs.map((d) => {
        const data = d.data();
        return [
            d.id,
            {
                email: d.id,
                name: typeof data.name === 'string' ? data.name : undefined,
                photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
                updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
            },
        ];
    }))), (error) => onError?.(error));
}
