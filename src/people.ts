import { kt } from './i18n.js';
/**
 * Household members as they appear on shared records: a short name, an initial and a colour of
 * their own, from the email address a record carries (`by`). Members' chosen names and photos come
 * from `watchProfiles` in `./household`; these are the fallbacks every screen can rely on.
 */

/** A short name for whoever logged something: "You", their first name, or the address's first word. */
export function personName(email: string, me?: { email?: string | null; displayName?: string | null } | null): string {
  if (me?.email && email.toLowerCase() === me.email.toLowerCase()) return kt('people.you');
  const local = email.split('@')[0] ?? email;
  const word = local.split(/[^a-zA-Z]+/).find(Boolean) ?? local;
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '?';
}

/** The initial on a member's badge: from their display name when it is the signed-in member. */
export function personInitial(email: string, me?: { email?: string | null; displayName?: string | null } | null): string {
  if (me?.email && email.toLowerCase() === me.email.toLowerCase() && me.displayName) return me.displayName.trim().charAt(0).toUpperCase();
  return personName(email).charAt(0);
}

/** Palette colours that keep white initials above 4.5:1; each member keeps one colour. */
export const PERSON_COLOURS = ['#2d6a4f', '#94452f', '#44403c', '#1b4332'];

/** A member's colour: by their place in `members`, so two members never share one; a stable hash for anyone else. */
export function personColour(email: string, members: string[]): string {
  const i = members.indexOf(email.toLowerCase());
  if (i >= 0) return PERSON_COLOURS[i % PERSON_COLOURS.length];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PERSON_COLOURS[h % PERSON_COLOURS.length];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The one person a text names, by full name, else by first or last name ("Ana's dentist" → Ana),
 * as a whole word in any language; null when it names nobody or more than one. Never a guess from
 * there being only one person: whose a health visit or a baby's checkup is gets asked, not assumed.
 */
export function namedIn<P extends { name: string }>(text: string, people: readonly P[]): P | null {
  const named = (name: string) => !!name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
  const found = people.filter((p) => {
    const words = p.name.trim().split(/\s+/);
    return named(p.name.trim()) || named(words[0] ?? '') || (words.length > 1 && named(words[words.length - 1]));
  });
  return found.length === 1 ? found[0] : null;
}
