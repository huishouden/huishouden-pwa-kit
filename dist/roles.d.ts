import { type Firestore } from 'firebase/firestore';
import { type Household } from './household.js';
/**
 * Household roles, the same table the rules enforce (huishouden/rules README "Roles"). Each member
 * has one in the household document's `roles` map; anyone it doesn't name is a member, except the
 * household's creator (first in `members`), who is an admin.
 *
 * - **admin**: everything, including inviting and removing people and setting their roles.
 * - **member**: everything except managing people and roles. The default for new invitees.
 * - **helper** (a babysitter, a pet sitter, the shared wall tablet): reads the everyday things,
 *   ticks them off, adds their own and logs feeds and doses; changes or deletes only what they
 *   added; never sees Spending, Bills or anything marked private; changes no settings.
 * - **kid**: a helper who never gives medicine.
 *
 * The rules are the boundary; apps use `can` to hide what a role can't do and `refusal` to say why
 * when it is tried anyway.
 */
export type Role = 'admin' | 'member' | 'helper' | 'kid';
export declare const ROLES: readonly Role[];
/** The roles' names in English. Shown text uses `roleLabel` (the active language). */
export declare const ROLE_LABELS: Record<Role, string>;
/** A role's name in the active language: "Helper", "Ayudante", "Hulp". */
export declare function roleLabel(role: Role): string;
/** A role's one-line description in the active language, for a role picker. */
export declare function roleDescription(role: Role): string;
/** One line each, in English. Shown text uses `roleDescription`. */
export declare const ROLE_DESCRIPTIONS: Record<Role, string>;
/**
 * What a role may do, for hiding controls:
 * - `manage-people`: invite, remove, set roles.
 * - `change-settings`: the household name, app settings, food preferences, the portal layout,
 *   lists, the meal plan and medicine courses.
 * - `see-money`: Spending and Bills.
 * - `see-private`: contacts, appointments and agenda items marked private, and marking them so.
 * - `edit-others`: change or delete what someone else added.
 * - `give-medicine`: log a dose (a helper also needs the course to allow them, see `mayGive`).
 * - `add`, `tick`: add their own things, tick off anyone's.
 */
export type RoleAction = 'manage-people' | 'change-settings' | 'see-money' | 'see-private' | 'edit-others' | 'give-medicine' | 'add' | 'tick';
export declare function can(role: Role | null | undefined, action: RoleAction): boolean;
/** Apps whose every record is money, for admins and members only: their agenda items and reminders are always private. */
export declare const MONEY_APPS: readonly string[];
/** Helpers and kids: their reads of private-capable collections must ask for `private == false`. */
export declare function isRestricted(role: Role | null | undefined): boolean;
/** The sentence to show where `action` is refused, in the active language: "Only admins and members can change settings." */
export declare function refusal(action: RoleAction): string;
/** The `roles` map from a household document, keeping only valid entries. */
export declare function toRoles(data: unknown): Record<string, Role>;
/** Someone's role in the household, or null when they aren't in it. */
export declare function householdRole(household: Pick<Household, 'members' | 'roles'> | null | undefined, email: string | null | undefined): Role | null;
/** Every member's role as written out, for a write that changes people or roles. */
export declare function effectiveRoles(household: Pick<Household, 'members' | 'roles'>): Record<string, Role>;
/**
 * Sets a member's role (admins only, never their own: the rules refuse both). Writes every
 * member's role out, so nobody's depends on their place in the list any more.
 */
export declare function setRole(db: Firestore, household: Pick<Household, 'id' | 'members' | 'roles'>, email: string, role: Role): Promise<void>;
/** Who may give a medicine course: every helper (the default), or only the ones approved. */
export interface MedicineGivers {
    givers?: 'all' | 'approved';
    approvedHelpers?: string[];
}
/** Whether `email` with `role` may give this course: admins and members always, kids never. */
export declare function mayGive(course: MedicineGivers, role: Role | null | undefined, email: string | null | undefined): boolean;
/** The `givers` and `approvedHelpers` fields to store: approved helpers only when restricted. */
export declare function giversFields(givers: 'all' | 'approved', approvedHelpers?: string[]): MedicineGivers;
/** Members a course can be restricted to: the household's helpers. */
export declare function helpersOf(household: Pick<Household, 'members' | 'roles'>): string[];
