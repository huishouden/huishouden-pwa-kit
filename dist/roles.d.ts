import { type Firestore } from 'firebase/firestore';
import { type Household } from './household.js';
import { type Role } from './role-core.js';
/** The roles table and every check over it, without Firebase (`./role-core`), and `setRole`. */
export * from './role-core.js';
/**
 * Sets a member's role (admins only, never their own: the rules refuse both). Writes every
 * member's role out, so nobody's depends on their place in the list any more.
 */
export declare function setRole(db: Firestore, household: Pick<Household, 'id' | 'members' | 'roles'>, email: string, role: Role): Promise<void>;
