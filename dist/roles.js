import { doc } from 'firebase/firestore';
import { updateDoc } from './firestore.js';
import { normalizeEmail } from './household.js';
import { kt } from './i18n.js';
import { effectiveRoles, ROLES } from './role-core.js';
/** The roles table and every check over it, without Firebase (`./role-core`), and `setRole`. */
export * from './role-core.js';
const isRole = (v) => typeof v === 'string' && ROLES.includes(v);
/**
 * Sets a member's role (admins only, never their own: the rules refuse both). Writes every
 * member's role out, so nobody's depends on their place in the list any more.
 */
export async function setRole(db, household, email, role) {
    const who = normalizeEmail(email);
    if (!household.members.includes(who))
        throw new Error(kt('roles.notInHousehold', { email }));
    if (!isRole(role))
        throw new Error(`Unknown role: ${String(role)}`);
    await updateDoc(doc(db, 'households', household.id), { roles: { ...effectiveRoles(household), [who]: role } });
}
