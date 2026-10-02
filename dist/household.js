import { addDoc, arrayRemove, arrayUnion, collection, doc, onSnapshot, query, updateDoc, where, } from 'firebase/firestore';
export const normalizeEmail = (email) => email.trim().toLowerCase();
const COLLECTION = 'households';
/**
 * Follows the household the signed-in person belongs to. If they belong to several, the oldest
 * wins, so every app picks the same one.
 */
export function watchHousehold(db, email, onChange) {
    onChange({ status: 'loading' });
    const q = query(collection(db, COLLECTION), where('members', 'array-contains', normalizeEmail(email)));
    return onSnapshot(q, (snap) => {
        const households = snap.docs
            .map((d) => toHousehold(d.id, d.data()))
            .sort((a, b) => a.createdAt - b.createdAt);
        onChange(households.length ? { status: 'ready', household: households[0] } : { status: 'none' });
    }, (error) => onChange({ status: 'error', error }));
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
