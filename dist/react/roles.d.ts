import type { Household } from '../household';
import { type Role, type RoleAction } from '../roles';
export interface RoleState {
    /** Null while there is no household or the person isn't in it. */
    role: Role | null;
    /** Helpers and kids: reads of private-capable collections ask for `private == false`. */
    restricted: boolean;
    can: (action: RoleAction) => boolean;
}
/** The signed-in person's role in `household`, and what it allows. */
export declare function useRole(household: Pick<Household, 'members' | 'roles'> | null | undefined, email: string | null | undefined): RoleState;
/** "Only admins and members can change settings." where a control is left out for this role. */
export declare function RoleNote({ action, className }: {
    action: RoleAction;
    className?: string;
}): import("react").JSX.Element;
/** A member's role, for admins: a select with the four roles. */
export declare function RoleSelect({ value, onChange, label, disabled }: {
    value: Role;
    onChange: (role: Role) => void;
    label: string;
    disabled?: boolean;
}): import("react").JSX.Element;
/** Each role in one line, under the household's member list. */
export declare function RoleList(): import("react").JSX.Element;
export interface GiversValue {
    givers: 'all' | 'approved';
    approvedHelpers: string[];
}
/**
 * "Who can give it" on a medicine course: all helpers (the default) or only the chosen ones.
 * Admins and members always can and kids never do, so only helpers are listed. `name` turns an
 * email into what the household calls them.
 */
export declare function GiversField({ value, onChange, helpers, name }: {
    value: GiversValue;
    onChange: (v: GiversValue) => void;
    helpers: string[];
    name?: (email: string) => string;
}): import("react").JSX.Element;
