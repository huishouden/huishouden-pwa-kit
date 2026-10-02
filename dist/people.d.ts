/**
 * Household members as they appear on shared records: a short name, an initial and a colour of
 * their own, from the email address a record carries (`by`). Members' chosen names and photos come
 * from `watchProfiles` in `./household`; these are the fallbacks every screen can rely on.
 */
/** A short name for whoever logged something: "You", their first name, or the address's first word. */
export declare function personName(email: string, me?: {
    email?: string | null;
    displayName?: string | null;
} | null): string;
/** The initial on a member's badge: from their display name when it is the signed-in member. */
export declare function personInitial(email: string, me?: {
    email?: string | null;
    displayName?: string | null;
} | null): string;
/** Palette colours that keep white initials above 4.5:1; each member keeps one colour. */
export declare const PERSON_COLOURS: string[];
/** A member's colour: by their place in `members`, so two members never share one; a stable hash for anyone else. */
export declare function personColour(email: string, members: string[]): string;
