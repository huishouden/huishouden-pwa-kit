import { type Firestore, type Unsubscribe } from 'firebase/firestore';
/**
 * A household shared by every app in the family: one document per household in
 * `households/{householdId}`, with members identified by lowercase email. Apps keep their own data
 * in subcollections (`households/{id}/lists`, `/spendingTransactions`, ...), and security rules grant
 * access to members of the parent document — so adding someone here gives them every app at once.
 *
 * Shape matches the rules every app shares:
 *   { name: string, members: string[], joined?: string[], createdAt: number }
 */
export interface Household {
    id: string;
    name: string;
    /** Lowercase emails allowed in. Invited people are members before they first sign in. */
    members: string[];
    /** Members who have signed in at least once (each member records their own). */
    joined: string[];
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
 * Follows the household the signed-in person belongs to. If they belong to several, the oldest
 * wins, so every app picks the same one.
 */
export declare function watchHousehold(db: Firestore, email: string, onChange: (state: HouseholdState) => void): Unsubscribe;
export declare function toHousehold(id: string, data: Record<string, unknown>): Household;
/** Starts a household with only its creator; others are invited from inside. */
export declare function createHousehold(db: Firestore, email: string, name: string): Promise<string>;
/** Invites by email: they get every app the next time they sign in with that Google account. */
export declare function inviteMember(db: Firestore, householdId: string, email: string): Promise<void>;
export declare function removeMember(db: Firestore, householdId: string, email: string): Promise<void>;
/** Records the signed-in member's first visit; harmless to call on every sign-in. */
export declare function markJoined(db: Firestore, household: Household, email: string): Promise<void>;
/** Members who were invited but have not signed in yet. */
export declare function pendingMembers(household: Household): string[];
