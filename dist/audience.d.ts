/**
 * Items for named people only. The household agenda, to-do list and reminders are read by every
 * admin and member (and helpers and kids see what isn't private). Some records are about one
 * person's care and are kept from everyone else: a medicine is for that person, their carers and
 * the household's admins. Their dated things go to the `personal` collections instead
 * (`personalAgenda`, `personalTodos`, `personalReminders`), each item carrying `audience`, the
 * lowercase emails of the members who may read it; the rules let only those members read, write or
 * delete it, and the writer must be one of them.
 *
 * Apps work out the audience from their own record (Health: the household's admins, the person's
 * carers and the person themself, never kids) and publish with `syncPersonalAgenda`,
 * `syncPersonalTodos` and `syncPersonalReminders`. Each device syncs what its member is in the
 * audience of, so every allowed member's device keeps the same items current. The portal follows a
 * member's personal items next to the shared ones (`watchAgenda` and `watchTodos` with `me`).
 */
/** How many members an item may name, the same as a household's size limit in the rules. */
export declare const AUDIENCE_MAX = 12;
/** Lowercase, trimmed, unique and sorted (so the same people always compare equal), at most `AUDIENCE_MAX`. */
export declare function cleanAudience(emails: readonly string[]): string[];
/** Whether `email` is in a stored item's audience (as read back, defensively). */
export declare function inAudience(audience: unknown, email: string | null | undefined): boolean;
