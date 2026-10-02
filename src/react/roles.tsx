/**
 * Household roles in React (`../roles`): `useRole` for what the signed-in person may do, the note
 * that says why something isn't there, the role picker for the household panel, and the medicine
 * course's "Who can give it".
 */
import { useMemo } from 'react';
import type { Household } from '../household';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, can, householdRole, isRestricted, refusal, type Role, type RoleAction } from '../roles';
import { Checkbox, selectClass } from './ui';

export interface RoleState {
  /** Null while there is no household or the person isn't in it. */
  role: Role | null;
  /** Helpers and kids: reads of private-capable collections ask for `private == false`. */
  restricted: boolean;
  can: (action: RoleAction) => boolean;
}

/** The signed-in person's role in `household`, and what it allows. */
export function useRole(household: Pick<Household, 'members' | 'roles'> | null | undefined, email: string | null | undefined): RoleState {
  const members = household?.members.join(' ');
  const roles = JSON.stringify(household?.roles ?? {});
  return useMemo(() => {
    const role = householdRole(household, email);
    return { role, restricted: isRestricted(role), can: (action: RoleAction) => can(role, action) };
    // Recomputed when the members, roles or person change, not on every new household object.
  }, [members, roles, email]);
}

/** "Only admins and members can change settings." where a control is left out for this role. */
export function RoleNote({ action, className = '' }: { action: RoleAction; className?: string }) {
  return <p className={`text-sm text-stone-600 dark:text-stone-300 ${className}`}>{refusal(action)}</p>;
}

/** A member's role, for admins: a select with the four roles. */
export function RoleSelect({ value, onChange, label, disabled }: { value: Role; onChange: (role: Role) => void; label: string; disabled?: boolean }) {
  return (
    <select className={`${selectClass} w-auto`} aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

/** Each role in one line, under the household's member list. */
export function RoleList() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-stone-600 dark:text-stone-300">
      {ROLES.map((r) => (
        <div key={r} className="contents">
          <dt className="font-semibold text-stone-800 dark:text-stone-100">{ROLE_LABELS[r]}</dt>
          <dd>{ROLE_DESCRIPTIONS[r]}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface GiversValue {
  givers: 'all' | 'approved';
  approvedHelpers: string[];
}

/**
 * "Who can give it" on a medicine course: all helpers (the default) or only the chosen ones.
 * Admins and members always can and kids never do, so only helpers are listed. `name` turns an
 * email into what the household calls them.
 */
export function GiversField({ value, onChange, helpers, name = (e) => e }: { value: GiversValue; onChange: (v: GiversValue) => void; helpers: string[]; name?: (email: string) => string }) {
  const toggle = (email: string, on: boolean) =>
    onChange({ ...value, approvedHelpers: on ? [...new Set([...value.approvedHelpers, email])] : value.approvedHelpers.filter((e) => e !== email) });
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-200">Who can give it</legend>
      <div className="flex flex-col">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-base text-stone-800 dark:text-stone-100">
          <input type="radio" name="givers" className="h-5 w-5 accent-forest-700" checked={value.givers === 'all'} onChange={() => onChange({ ...value, givers: 'all' })} />
          All helpers
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-base text-stone-800 dark:text-stone-100">
          <input type="radio" name="givers" className="h-5 w-5 accent-forest-700" checked={value.givers === 'approved'} onChange={() => onChange({ ...value, givers: 'approved' })} />
          Only approved helpers
        </label>
        {value.givers === 'approved' && (
          <div className="ml-8">
            {helpers.length === 0 ? (
              <p className="text-sm text-stone-600 dark:text-stone-300">No helpers yet. An admin can make someone a helper in the household settings.</p>
            ) : (
              helpers.map((h) => (
                <Checkbox key={h} checked={value.approvedHelpers.includes(h)} onChange={(on) => toggle(h, on)}>
                  {name(h)}
                </Checkbox>
              ))
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Admins and members can always give it; kids can’t.</p>
    </fieldset>
  );
}
