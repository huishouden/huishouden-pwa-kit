import { addDoc, arrayRemove, arrayUnion, collection, doc, getDocs, onSnapshot, query, updateDoc, where, } from 'firebase/firestore';
export const normalizeEmail = (email) => email.trim().toLowerCase();
const COLLECTION = 'households';
/**
 * The household an app uses when a person belongs to several: the oldest, so every app picks the
 * same one. Documents still waiting for the server (a household created a moment ago on this device)
 * are skipped — the rules can't see them yet, so subscriptions under them would be refused.
 */
export function pickHousehold(docs) {
    const households = docs
        .filter((d) => !d.pending)
        .map((d) => toHousehold(d.id, d.data))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return households[0] ?? null;
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
        const household = pickHousehold(docs);
        onChange(household ? { status: 'ready', household } : { status: 'none' });
    }, (error) => onChange({ status: 'error', error }));
}
/** One-off lookup of the same household `watchHousehold` follows; null when not a member anywhere. */
export async function findHousehold(db, email) {
    const snap = await getDocs(membersQuery(db, email));
    return pickHousehold(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
}
export function toHousehold(id, data) {
    return {
        id,
        name: String(data.name ?? 'Household'),
        members: Array.isArray(data.members) ? data.members.map(String) : [],
        joined: Array.isArray(data.joined) ? data.joined.map(String) : [],
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    };
}
/** Starts a household with only its creator; others are invited from inside. */
export async function createHousehold(db, email, name) {
    const ref = await addDoc(collection(db, COLLECTION), { name: name.trim(), members: [normalizeEmail(email)], createdAt: Date.now() });
    return ref.id;
}
/** Invites by email: they get every app the next time they sign in with that Google account. */
export async function inviteMember(db, householdId, email) {
    const address = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        throw new Error(`Not an email address: ${email}`);
    await updateDoc(doc(db, COLLECTION, householdId), { members: arrayUnion(address) });
}
export async function removeMember(db, householdId, email) {
    await updateDoc(doc(db, COLLECTION, householdId), { members: arrayRemove(normalizeEmail(email)) });
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
