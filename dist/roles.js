import { doc } from 'firebase/firestore';
import { updateDoc } from './firestore.js';
import { normalizeEmail } from './household.js';
export const ROLES = ['admin', 'member', 'helper', 'kid'];
export const ROLE_LABELS = { admin: 'Admin', member: 'Member', helper: 'Helper', kid: 'Kid' };
/** One line each, for a role picker. */
export const ROLE_DESCRIPTIONS = {
    admin: 'Everything, and invites people and sets their roles.',
    member: 'Everything except inviting people and setting roles.',
    helper: 'Sees the everyday things, ticks them off and adds their own. No money, nothing private, no settings.',
    kid: 'Like a helper, without medicine.',
};
const ALLOWED = {
    'manage-people': ['admin'],
    'change-settings': ['admin', 'member'],
    'see-money': ['admin', 'member'],
    'see-private': ['admin', 'member'],
    'edit-others': ['admin', 'member'],
    'give-medicine': ['admin', 'member', 'helper'],
    add: ROLES,
    tick: ROLES,
};
export function can(role, action) {
    return !!role && ALLOWED[action].includes(role);
}
/** Apps whose every record is money, for admins and members only: their agenda items and reminders are always private. */
export const MONEY_APPS = ['spending', 'bills'];
/** Helpers and kids: their reads of private-capable collections must ask for `private == false`. */
export function isRestricted(role) {
    return role === 'helper' || role === 'kid';
}
const REFUSALS = {
    'manage-people': 'Only admins can invite or remove people and set roles.',
    'change-settings': 'Only admins and members can change settings.',
    'see-money': 'Only admins and members can see the household’s money.',
    'see-private': 'Only admins and members can see this.',
    'edit-others': 'Only admins and members can change or delete what someone else added.',
    'give-medicine': 'Only admins, members and helpers can give medicine.',
    add: 'Only household members can add things.',
    tick: 'Only household members can tick things off.',
};
/** The sentence to show where `action` is refused: "Only admins and members can change settings." */
export function refusal(action) {
    return REFUSALS[action];
}
const isRole = (v) => typeof v === 'string' && ROLES.includes(v);
/** The `roles` map from a household document, keeping only valid entries. */
export function toRoles(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return {};
    return Object.fromEntries(Object.entries(data).filter(([, v]) => isRole(v)));
}
/** Someone's role in the household, or null when they aren't in it. */
export function householdRole(household, email) {
    if (!household || !email)
        return null;
    const me = normalizeEmail(email);
    if (!household.members.includes(me))
        return null;
    return household.roles?.[me] ?? (household.members[0] === me ? 'admin' : 'member');
}
/** Every member's role as written out, for a write that changes people or roles. */
export function effectiveRoles(household) {
    return Object.fromEntries(household.members.map((m) => [m, householdRole(household, m)]));
}
/**
 * Sets a member's role (admins only, never their own: the rules refuse both). Writes every
 * member's role out, so nobody's depends on their place in the list any more.
 */
export async function setRole(db, household, email, role) {
    const who = normalizeEmail(email);
    if (!household.members.includes(who))
        throw new Error(`${email} is not in this household.`);
    if (!isRole(role))
        throw new Error(`Unknown role: ${String(role)}`);
    await updateDoc(doc(db, 'households', household.id), { roles: { ...effectiveRoles(household), [who]: role } });
}
/** Whether `email` with `role` may give this course: admins and members always, kids never. */
export function mayGive(course, role, email) {
    if (role === 'admin' || role === 'member')
        return true;
    if (role !== 'helper' || !email)
        return false;
    return (course.givers ?? 'all') === 'all' || (course.approvedHelpers ?? []).includes(normalizeEmail(email));
}
/** The `givers` and `approvedHelpers` fields to store: approved helpers only when restricted. */
export function giversFields(givers, approvedHelpers = []) {
    if (givers !== 'approved')
        return { givers: 'all' };
    return { givers: 'approved', approvedHelpers: [...new Set(approvedHelpers.map(normalizeEmail))].slice(0, 12) };
}
/** Members a course can be restricted to: the household's helpers. */
export function helpersOf(household) {
    return household.members.filter((m) => householdRole(household, m) === 'helper');
}
