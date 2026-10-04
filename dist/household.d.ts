import { type Firestore, type Unsubscribe } from 'firebase/firestore';
import { type Role } from './roles.js';
/**
 * A household shared by every app in the family: one document per household in
 * `households/{householdId}`, with members identified by lowercase email. Apps keep their own data
 * in subcollections (`households/{id}/lists`, `/spendingTransactions`, ...), and security rules grant
 * access to members of the parent document — so adding someone here gives them every app at once.
 *
 * Shape matches the rules every app shares:
 *   { name: string, members: string[], joined?: string[], roles?: { [email]: Role }, currency?: string, createdAt: number }
 */
export interface Household {
    id: string;
    name: string;
    /** Lowercase emails allowed in. Invited people are members before they first sign in. */
    members: string[];
    /** Members who have signed in at least once (each member records their own). */
    joined: string[];
    /** Roles written out (`./roles`); anyone missing is a member, except the creator (first), an admin. */
    roles?: Record<string, Role>;
    /** ISO 4217 code amounts are shown in ("USD", "EUR"); unset means US dollars. Admins and members set it. */
    currency?: string;
    createdAt: number;
}
export type HouseholdState = {
    status: 'loading';
} | {
    status: 'none';
} | {
    status: 'ready';
    household: Household;
} | {
    status: 'error';
    error: Error;
};
export declare const normalizeEmail: (email: string) => string;
/**
 * The household an app uses when a person belongs to several. Any member of any household can add
 * an email to it, so an invitation the person never acted on must not displace a household they
 * already use: households they have joined (opened an app in, see `markJoined`) come first, and
 * among those, or among invitations when they have joined none, the oldest, so every app picks the
 * same one. Documents still waiting for the server (a household created a moment ago on this
 * device) are skipped — the rules can't see them yet, so subscriptions under them would be refused.
 */
export declare function pickHousehold(docs: {
    id: string;
    data: Record<string, unknown>;
    pending?: boolean;
}[], email?: string): Household | null;
/** Follows the household the signed-in person belongs to (see `pickHousehold`). */
export declare function watchHousehold(db: Firestore, email: string, onChange: (state: HouseholdState) => void): Unsubscribe;
/** One-off lookup of the same household `watchHousehold` follows; null when not a member anywhere. */
export declare function findHousehold(db: Firestore, email: string): Promise<Household | null>;
export declare function toHousehold(id: string, data: Record<string, unknown>): Household;
/** Sets the currency the household's amounts are shown in (admins and members; the rules check). */
export declare function setHouseholdCurrency(db: Firestore, householdId: string, currency: string): Promise<void>;
/** Starts a household with only its creator, its admin; others are invited from inside. */
export declare function createHousehold(db: Firestore, email: string, name: string): Promise<string>;
type People = Pick<Household, 'id' | 'members' | 'roles'>;
/**
 * Invites by email (admins only): they get every app the next time they sign in with that Google
 * account, as a member unless `role` says otherwise. Pass the household to give a role.
 */
export declare function inviteMember(db: Firestore, household: string | People, email: string, role?: Role): Promise<void>;
/**
 * Removes someone (admins only, never themselves). With the household, their role goes too and
 * everyone else's is written out, so removing the creator never makes the next person an admin by
 * position; the rules refuse a removal that would leave a role behind.
 */
export declare function removeMember(db: Firestore, household: string | People, email: string): Promise<void>;
/** Records the signed-in member's first visit; harmless to call on every sign-in. */
export declare function markJoined(db: Firestore, household: Household, email: string): Promise<void>;
/** Members who were invited but have not signed in yet. */
export declare function pendingMembers(household: Household): string[];
/**
 * A member's name and photo as their own Google account reports them. Google has no public lookup
 * from an email to a profile, so each member records their own on sign-in
 * (`households/{id}/profiles/{email}`, writable only by that member).
 */
export interface Profile {
    email: string;
    name?: string;
    photoURL?: string;
    updatedAt: number;
}
/**
 * Records the signed-in member's name and photo; cheap to call on every sign-in. Also tags this
 * visit's usage counts with the household's hash (`./observability`), so active households can be
 * counted without knowing which.
 */
export declare function saveMyProfile(db: Firestore, householdId: string, user: {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}): Promise<void>;
/** Follows the profiles members have recorded, keyed by email. */
export declare function watchProfiles(db: Firestore, householdId: string, onChange: (profiles: Map<string, Profile>) => void, onError?: (error: Error) => void): Unsubscribe;
export {};
