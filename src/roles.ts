import { doc, type Firestore } from 'firebase/firestore';
import { updateDoc } from './firestore.js';
import { normalizeEmail, type Household } from './household.js';
import { kt, type KitKey } from './i18n.js';

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

export const ROLES: readonly Role[] = ['admin', 'member', 'helper', 'kid'];

/** The roles' names in English. Shown text uses `roleLabel` (the active language). */
export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', member: 'Member', helper: 'Helper', kid: 'Kid' };

/** A role's name in the active language: "Helper", "Ayudante", "Hulp". */
export function roleLabel(role: Role): string {
  return kt(`roles.${role}` as KitKey);
}

/** A role's one-line description in the active language, for a role picker. */
export function roleDescription(role: Role): string {
  return kt(`roles.${role}Description` as KitKey);
}

/** One line each, in English. Shown text uses `roleDescription`. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Everything, and invites people and sets their roles.',
  member: 'Everything except inviting people and setting roles.',
  helper: 'Sees the everyday things, ticks them off and adds their own. No money, nothing private, no settings.',
  kid: 'Like a helper, without medicine.',
};

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

const ALLOWED: Record<RoleAction, readonly Role[]> = {
  'manage-people': ['admin'],
  'change-settings': ['admin', 'member'],
  'see-money': ['admin', 'member'],
  'see-private': ['admin', 'member'],
  'edit-others': ['admin', 'member'],
  'give-medicine': ['admin', 'member', 'helper'],
  add: ROLES,
  tick: ROLES,
};

export function can(role: Role | null | undefined, action: RoleAction): boolean {
  return !!role && ALLOWED[action].includes(role);
}

/** Apps whose every record is money, for admins and members only: their agenda items and reminders are always private. */
export const MONEY_APPS: readonly string[] = ['spending', 'bills'];

/** Helpers and kids: their reads of private-capable collections must ask for `private == false`. */
export function isRestricted(role: Role | null | undefined): boolean {
  return role === 'helper' || role === 'kid';
}

const REFUSALS = {
  'manage-people': 'roles.refuseManagePeople',
  'change-settings': 'roles.refuseChangeSettings',
  'see-money': 'roles.refuseSeeMoney',
  'see-private': 'roles.refuseSeePrivate',
  'edit-others': 'roles.refuseEditOthers',
  'give-medicine': 'roles.refuseGiveMedicine',
  add: 'roles.refuseAdd',
  tick: 'roles.refuseTick',
} as const satisfies Record<RoleAction, KitKey>;

/** The sentence to show where `action` is refused, in the active language: "Only admins and members can change settings." */
export function refusal(action: RoleAction): string {
  return kt(REFUSALS[action]);
}

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** The `roles` map from a household document, keeping only valid entries. */
export function toRoles(data: unknown): Record<string, Role> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, v]) => isRole(v))) as Record<string, Role>;
}

/** Someone's role in the household, or null when they aren't in it. */
export function householdRole(household: Pick<Household, 'members' | 'roles'> | null | undefined, email: string | null | undefined): Role | null {
  if (!household || !email) return null;
  const me = normalizeEmail(email);
  if (!household.members.includes(me)) return null;
  return household.roles?.[me] ?? (household.members[0] === me ? 'admin' : 'member');
}

/** Every member's role as written out, for a write that changes people or roles. */
export function effectiveRoles(household: Pick<Household, 'members' | 'roles'>): Record<string, Role> {
  return Object.fromEntries(household.members.map((m) => [m, householdRole(household, m)!]));
}

/**
 * Sets a member's role (admins only, never their own: the rules refuse both). Writes every
 * member's role out, so nobody's depends on their place in the list any more.
 */
export async function setRole(db: Firestore, household: Pick<Household, 'id' | 'members' | 'roles'>, email: string, role: Role): Promise<void> {
  const who = normalizeEmail(email);
  if (!household.members.includes(who)) throw new Error(kt('roles.notInHousehold', { email }));
  if (!isRole(role)) throw new Error(`Unknown role: ${String(role)}`);
  await updateDoc(doc(db, 'households', household.id), { roles: { ...effectiveRoles(household), [who]: role } });
}

/** Who may give a medicine course: every helper (the default), or only the ones approved. */
export interface MedicineGivers {
  givers?: 'all' | 'approved';
  approvedHelpers?: string[];
}

/** Whether `email` with `role` may give this course: admins and members always, kids never. */
export function mayGive(course: MedicineGivers, role: Role | null | undefined, email: string | null | undefined): boolean {
  if (role === 'admin' || role === 'member') return true;
  if (role !== 'helper' || !email) return false;
  return (course.givers ?? 'all') === 'all' || (course.approvedHelpers ?? []).includes(normalizeEmail(email));
}

/** The `givers` and `approvedHelpers` fields to store: approved helpers only when restricted. */
export function giversFields(givers: 'all' | 'approved', approvedHelpers: string[] = []): MedicineGivers {
  if (givers !== 'approved') return { givers: 'all' };
  return { givers: 'approved', approvedHelpers: [...new Set(approvedHelpers.map(normalizeEmail))].slice(0, 12) };
}

/** Members a course can be restricted to: the household's helpers. */
export function helpersOf(household: Pick<Household, 'members' | 'roles'>): string[] {
  return household.members.filter((m) => householdRole(household, m) === 'helper');
}
