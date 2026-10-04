import type { Auth } from 'firebase/auth';
import { googleAccessToken, googleFetch } from './google-token';
import { kt } from './i18n.js';
import type { LabelledValue, ParsedContact } from './vcard';

/**
 * Finds people in the member's Google Contacts (read-only, People API), to fill a household
 * contact from one tap: their saved contacts and the "other contacts" Gmail keeps for people they
 * have emailed. The app never writes to Google Contacts.
 *
 * The token comes from Google Identity Services (`./google-token`), so call `googleContactsToken`
 * from a tap. Browser tests stand in with `window.__mockGoogleContactsToken` and answer
 * people.googleapis.com themselves (Playwright's `page.route`).
 */

export const GOOGLE_CONTACTS_SCOPES = ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/contacts.other.readonly'] as const;
const API = 'https://people.googleapis.com/v1';
/** What a saved contact's search returns; "other contacts" only offer names, emails and phones. */
const CONTACT_FIELDS = 'names,phoneNumbers,emailAddresses,addresses,organizations,urls,biographies';
const OTHER_FIELDS = 'names,phoneNumbers,emailAddresses';
/** People shown for one search. */
export const GOOGLE_CONTACTS_LIMIT = 10;

declare global {
  interface Window {
    /** Browser tests: a Google Contacts token this device already has. */
    __mockGoogleContactsToken?: string;
  }
}

/** A token that can read Google Contacts: from a tap, asking once; kept for its hour on this device. */
export function googleContactsToken(auth: Auth): Promise<string> {
  if (typeof window !== 'undefined' && typeof window.__mockGoogleContactsToken === 'string') return Promise.resolve(window.__mockGoogleContactsToken);
  return googleAccessToken(auth, GOOGLE_CONTACTS_SCOPES, { persist: true, deniedMessage: kt('contacts.googleDenied') });
}

/** The Google Contacts search can be offered: a member is signed in (or a test stands in). */
export function googleContactsAvailable(auth: Auth | null | undefined): boolean {
  return !!auth?.currentUser || (typeof window !== 'undefined' && typeof window.__mockGoogleContactsToken === 'string');
}

interface RawField {
  value?: string;
  formattedValue?: string;
  formattedType?: string;
  type?: string;
  displayName?: string;
  name?: string;
  title?: string;
  metadata?: { primary?: boolean };
}

export interface RawPerson {
  resourceName?: string;
  names?: RawField[];
  phoneNumbers?: RawField[];
  emailAddresses?: RawField[];
  addresses?: RawField[];
  organizations?: RawField[];
  urls?: RawField[];
  biographies?: RawField[];
}

interface SearchAnswer {
  results?: { person?: RawPerson }[];
}

const primaryFirst = (list: RawField[] | undefined) => [...(list ?? [])].sort((a, b) => Number(!!b.metadata?.primary) - Number(!!a.metadata?.primary));

const labelled = (list: RawField[] | undefined): LabelledValue[] => {
  const seen = new Set<string>();
  const out: LabelledValue[] = [];
  for (const f of primaryFirst(list)) {
    const value = f.value?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    const label = f.formattedType?.trim() || (f.type && f.type !== 'other' ? f.type[0].toUpperCase() + f.type.slice(1) : undefined);
    out.push(label ? { value, label } : { value });
  }
  return out;
};

/** One person from the People API, in the same shape as a parsed contact card; null when empty. */
export function fromGooglePerson(p: RawPerson): ParsedContact | null {
  const name = primaryFirst(p.names)[0]?.displayName?.trim() ?? '';
  const org = primaryFirst(p.organizations)[0];
  const card: ParsedContact = { name: name || org?.name?.trim() || '', phones: labelled(p.phoneNumbers), emails: labelled(p.emailAddresses) };
  const address = primaryFirst(p.addresses)[0]?.formattedValue?.replace(/\s*\n\s*/g, ', ').trim();
  if (address) card.address = address;
  if (org?.name?.trim()) card.organization = org.name.trim();
  if (org?.title?.trim()) card.title = org.title.trim();
  const url = primaryFirst(p.urls)[0]?.value?.trim();
  if (url) card.website = url;
  const note = primaryFirst(p.biographies)[0]?.value?.trim();
  if (note) card.note = note;
  if (!card.name && !card.phones.length && !card.emails.length) return null;
  if (!card.name) card.name = card.emails[0]?.value ?? card.phones[0]?.value ?? '';
  return card;
}

/** Tokens whose searches have been warmed up, per endpoint (Google asks for one empty search first). */
const warmed = new Set<string>();

async function search(token: string, endpoint: 'people:searchContacts' | 'otherContacts:search', query: string, readMask: string): Promise<RawPerson[]> {
  const url = (q: string) => {
    const u = new URL(`${API}/${endpoint}`);
    u.searchParams.set('query', q);
    u.searchParams.set('readMask', readMask);
    u.searchParams.set('pageSize', String(GOOGLE_CONTACTS_LIMIT));
    return u;
  };
  const key = `${endpoint} ${token}`;
  if (!warmed.has(key)) {
    // People API: "send a warmup request with an empty query to update the cache" before searching.
    await googleFetch(token, url(''), { label: 'Google Contacts' });
    warmed.add(key);
  }
  const answer = await googleFetch<SearchAnswer>(token, url(query), { label: 'Google Contacts' });
  return (answer.results ?? []).map((r) => r.person).filter((p): p is RawPerson => !!p);
}

/**
 * Up to ten people matching `query` (a name, email or phone) in the member's Google Contacts:
 * saved contacts first, then the "other contacts" Gmail keeps, without repeats.
 */
export async function searchGoogleContacts(token: string, query: string): Promise<ParsedContact[]> {
  const q = query.trim();
  if (!q) return [];
  const [saved, other] = await Promise.all([search(token, 'people:searchContacts', q, CONTACT_FIELDS), search(token, 'otherContacts:search', q, OTHER_FIELDS)]);
  const out: ParsedContact[] = [];
  const seen = new Set<string>();
  for (const person of [...saved, ...other]) {
    const card = fromGooglePerson(person);
    if (!card) continue;
    const key = [card.name.toLowerCase(), card.emails[0]?.value.toLowerCase() ?? '', card.phones[0]?.value.replace(/\D/g, '') ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length === GOOGLE_CONTACTS_LIMIT) break;
  }
  return out;
}

/** Tests only: forget which searches were warmed up. */
export function resetGoogleContactsForTests(): void {
  warmed.clear();
}
