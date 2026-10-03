import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Household roles in React (`../roles`): `useRole` for what the signed-in person may do, the note
 * that says why something isn't there, the role picker for the household panel, and the medicine
 * course's "Who can give it".
 */
import { useMemo } from 'react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, can, householdRole, isRestricted, refusal } from '../roles';
import { Checkbox, selectClass } from './ui';
/** The signed-in person's role in `household`, and what it allows. */
export function useRole(household, email) {
    const members = household?.members.join(' ');
    const roles = JSON.stringify(household?.roles ?? {});
    return useMemo(() => {
        const role = householdRole(household, email);
        return { role, restricted: isRestricted(role), can: (action) => can(role, action) };
        // Recomputed when the members, roles or person change, not on every new household object.
    }, [members, roles, email]);
}
/** "Only admins and members can change settings." where a control is left out for this role. */
export function RoleNote({ action, className = '' }) {
    return _jsx("p", { className: `text-sm text-muted ${className}`, children: refusal(action) });
}
/** A member's role, for admins: a select with the four roles. */
export function RoleSelect({ value, onChange, label, disabled }) {
    return (_jsx("select", { className: `${selectClass.replace('w-full', 'w-auto')} shrink-0`, "aria-label": label, value: value, disabled: disabled, onChange: (e) => onChange(e.target.value), children: ROLES.map((r) => (_jsx("option", { value: r, children: ROLE_LABELS[r] }, r))) }));
}
/** Each role in one line, under the household's member list. */
export function RoleList() {
    return (_jsx("dl", { className: "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted", children: ROLES.map((r) => (_jsxs("div", { className: "contents", children: [_jsx("dt", { className: "font-semibold text-ink", children: ROLE_LABELS[r] }), _jsx("dd", { children: ROLE_DESCRIPTIONS[r] })] }, r))) }));
}
/**
 * "Who can give it" on a medicine course: all helpers (the default) or only the chosen ones.
 * Admins and members always can and kids never do, so only helpers are listed. `name` turns an
 * email into what the household calls them.
 */
export function GiversField({ value, onChange, helpers, name = (e) => e }) {
    const toggle = (email, on) => onChange({ ...value, approvedHelpers: on ? [...new Set([...value.approvedHelpers, email])] : value.approvedHelpers.filter((e) => e !== email) });
    return (_jsxs("fieldset", { children: [_jsx("legend", { className: "mb-1.5 block text-sm font-medium text-ink-soft", children: "Who can give it" }), _jsxs("div", { className: "flex flex-col", children: [_jsxs("label", { className: "flex min-h-11 cursor-pointer items-center gap-3 px-1 text-base text-ink", children: [_jsx("input", { type: "radio", name: "givers", className: "h-5 w-5 accent-forest-700", checked: value.givers === 'all', onChange: () => onChange({ ...value, givers: 'all' }) }), "All helpers"] }), _jsxs("label", { className: "flex min-h-11 cursor-pointer items-center gap-3 px-1 text-base text-ink", children: [_jsx("input", { type: "radio", name: "givers", className: "h-5 w-5 accent-forest-700", checked: value.givers === 'approved', onChange: () => onChange({ ...value, givers: 'approved' }) }), "Only approved helpers"] }), value.givers === 'approved' && (_jsx("div", { className: "ml-8", children: helpers.length === 0 ? (_jsx("p", { className: "text-sm text-muted", children: "No helpers yet. An admin can make someone a helper in the household settings." })) : (helpers.map((h) => (_jsx(Checkbox, { checked: value.approvedHelpers.includes(h), onChange: (on) => toggle(h, on), children: name(h) }, h)))) }))] }), _jsx("p", { className: "mt-1 text-sm text-muted", children: "Admins and members can always give it; kids can\u2019t." })] }));
}
