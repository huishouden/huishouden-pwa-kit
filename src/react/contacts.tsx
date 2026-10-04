/**
 * The household's contacts in React: the add/edit dialog (filling from the person's own contacts:
 * the phone's contact picker, a contact card file or Google Contacts; an OpenStreetMap business
 * search that fills in the address, phone and website, and for businesses the map lacks, filling
 * from a listing screenshot or pasted listing text) and the contact card with tap-to-call, email,
 * website and map links, and the select that names one of them on a record. Saves go through `contactInput` in `../contacts`, so every app trims and
 * links the same way.
 */
import { useRef, useState } from 'react';
import type { Auth } from 'firebase/auth';
import { BookUser, ClipboardPaste, ExternalLink, FileUp, Globe, ImageUp, Lock, Mail, MapPin, Pencil, Phone, Search, Trash2, UserSearch } from 'lucide-react';
import { CONTACT_LIMITS, contactInput, displayWebsite, type Contact, type ContactInput } from '../contacts';
import { contactFromCard, contactPickerSupported, contactSummary, parseVCard, pickContact, type ContactFill, type ParsedContact } from '../vcard';
import { googleContactsAvailable, googleContactsToken, searchGoogleContacts } from '../google-contacts';
import { googleAccessMessage, popupCancelled } from '../feedback';
import { mapsSearchUrl, parsePlaceText, readPlaceScreenshot, searchPlaces, telHref, type ParsedPlace, type Place } from '../places';
import { capitalize, formatList, kt as kitT, type KitKey } from '../i18n';
import { useKitT } from './i18n';
import { Checkbox, Chip, Dialog, ErrorNotice, Field, cardClass, deleteButton, ghostButton, iconButton, inputClass, linkClass, overline, primaryButton, secondaryButton, selectClass } from './ui';

type PlaceSearch = { status: 'idle' } | { status: 'searching' } | { status: 'done'; places: Place[]; query: string } | { status: 'error' };

/** Where filled-in details came from, for the note under the buttons. */
type FillSource = 'screenshot' | 'text' | 'share';
type Fill =
  | { status: 'idle' }
  | { status: 'reading'; progress?: number }
  | { status: 'error' }
  | { status: 'done'; source: FillSource; place: ParsedPlace; filled: FieldId[] };


/** Where a contact of the person's own came from. */
type CardSource = 'picker' | 'card' | 'google' | 'shared';

/** Filling from the person's own contacts: a list to choose from, a Google search, or what was filled. */
type Own =
  | { status: 'idle' }
  | { status: 'busy'; doing: string }
  | { status: 'choose'; source: CardSource; cards: ParsedContact[] }
  | { status: 'none'; message: string }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'done'; source: CardSource; name: string; filled: FieldId[] };

/** A field id the dialog fills, and its name mid-sentence in the active language. */
type FieldId = 'name' | 'role' | 'phone' | 'email' | 'website' | 'address' | 'notes' | 'hours';
const FIELD_KEYS: Record<FieldId, KitKey> = {
  name: 'contacts.field.name',
  role: 'contacts.field.role',
  phone: 'contacts.field.phone',
  email: 'contacts.field.email',
  website: 'contacts.field.website',
  address: 'contacts.field.address',
  notes: 'contacts.field.notes',
  hours: 'contacts.field.hours',
};

/** "name, phone, and address" in the active language. */
const listWords = (fields: FieldId[]) => formatList(fields.map((f) => kitT(FIELD_KEYS[f])));

/** A role as the field shows it: one of the app's roles in its shown name, anything typed as typed. */
export function shownRole(role: string, roles: readonly string[], roleLabel: (role: string) => string): string {
  const known = roles.find((r) => r.toLowerCase() === role.trim().toLowerCase());
  return known ? roleLabel(known) : role;
}

/** What to save for the field's text: one of the app's roles when it is that role's shown name, else the text. */
export function storedRole(text: string, roles: readonly string[], roleLabel: (role: string) => string): string {
  const typed = text.trim().toLowerCase();
  return (typed && roles.find((r) => roleLabel(r).toLowerCase() === typed)) || text;
}

export interface ContactDialogProps {
  contact: Contact | null;
  /** The app's id in `apps` ("baby"): a new contact shows there, an edited one keeps showing there. */
  app: string;
  /** Roles offered as one-tap chips; any other role can be typed. */
  roles: readonly string[];
  /**
   * How one of `roles` reads in the active language, when the app keeps them in English: "Plumber"
   * shows as "Plomero" on its chip and in the field, and is still saved as "Plumber" (so contacts
   * group the same whoever added them). Typing a role's shown name saves the role. Default: as is.
   */
  roleLabel?: (role: string) => string;
  /** Prefills the role for a new contact, e.g. from "Choose a pediatrician". */
  role?: string;
  /** Default "New contact" / "Edit contact"; Car says "New shop" / "Edit shop". */
  title?: { add: string; edit: string };
  /** The business search's placeholder: "Practice name and town". */
  searchPlaceholder?: string;
  /** The name field's placeholder, an invented example: "Example Pediatrics". */
  namePlaceholder?: string;
  /**
   * Details to start a new contact with, e.g. `readSharedPlace(location)?.place` when the app was
   * opened from Google Maps' Share menu. Shown with what wasn't understood, for the person to check.
   */
  prefill?: ParsedPlace;
  /**
   * Contact cards shared into the app (`readSharedContact()` in `../contacts`): one fills the new
   * contact, several are listed to choose from.
   */
  sharedContacts?: ParsedContact[];
  /**
   * The app's Firebase Auth: with a member signed in, offers "Find in my Google Contacts"
   * (read-only, asks Google for permission on the first tap). Leave out to not offer it.
   */
  auth?: Auth | null;
  /** Reads a listing screenshot; defaults to on-device OCR (`readPlaceScreenshot`). Tests pass a stand-in. */
  readScreenshot?: (image: Blob, onProgress: (progress: number, status: string) => void) => Promise<ParsedPlace>;
  /**
   * Offers "Only admins and members" (`private`). Pass `can(role, 'see-private')`: helpers and kids
   * can't mark a contact private, and what they save stays visible to them. Default true.
   */
  canMarkPrivate?: boolean;
  onSave: (input: ContactInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function ContactDialog({
  contact,
  app,
  roles,
  roleLabel = (r) => r,
  role: initialRole,
  title,
  searchPlaceholder,
  namePlaceholder,
  prefill,
  sharedContacts,
  auth,
  readScreenshot = (image, onProgress) => readPlaceScreenshot(image, { onProgress }),
  canMarkPrivate = true,
  onSave,
  onDelete,
  onClose,
}: ContactDialogProps) {
  const kt = useKitT();
  title ??= { add: kt('contacts.newContact'), edit: kt('contacts.editContact') };
  searchPlaceholder ??= kt('contacts.searchPlaceholder');
  const start = contact ? undefined : prefill;
  const card = !contact && sharedContacts?.length === 1 ? contactFromCard(sharedContacts[0], { role: !initialRole }) : undefined;
  const [name, setName] = useState(contact?.name ?? card?.name ?? start?.name?.slice(0, CONTACT_LIMITS.name) ?? '');
  const [role, setRole] = useState(contact?.role ?? initialRole ?? card?.role ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? card?.phone ?? start?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? card?.email ?? start?.email ?? '');
  const [website, setWebsite] = useState(contact?.website ?? card?.website ?? start?.website ?? '');
  const [address, setAddress] = useState(contact?.address ?? card?.address ?? start?.address?.slice(0, CONTACT_LIMITS.address) ?? '');
  const [mapsUrl, setMapsUrl] = useState(contact?.mapsUrl ?? start?.mapsUrl ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? card?.notes ?? (start?.hours ? kitT('contacts.hoursNote', { hours: start.hours }).slice(0, CONTACT_LIMITS.notes) : ''));
  const [isPrivate, setPrivate] = useState(contact?.private === true);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<PlaceSearch>({ status: 'idle' });
  const [fill, setFill] = useState<Fill>(start ? { status: 'done', source: 'share', place: start, filled: filledFields(start) } : { status: 'idle' });
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cardInput = useRef<HTMLInputElement>(null);
  const lastImage = useRef<Blob | null>(null);
  const [picker] = useState(contactPickerSupported);
  const [google] = useState(() => googleContactsAvailable(auth));
  const [googleOpen, setGoogleOpen] = useState(false);
  const [googleQuery, setGoogleQuery] = useState('');
  // Fills right away from one shared card; several wait for the person to choose.
  const [own, setOwn] = useState<Own>(() => {
    if (contact || !sharedContacts) return { status: 'idle' };
    if (sharedContacts.length === 0) return { status: 'none', message: kitT('contacts.sharedNone') };
    if (sharedContacts.length > 1) return { status: 'choose', source: 'shared', cards: sharedContacts };
    return { status: 'done', source: 'shared', name: sharedContacts[0].name, filled: fillFields(contactFromCard(sharedContacts[0], { role: !initialRole })) };
  });
  // Notes a filled contact wrote, replaced (not added to again) when another one is chosen.
  const filledNotes = useRef(card?.notes ?? '');
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    onSave(contactInput({ name, role, phone, email, website, address, mapsUrl, notes, private: canMarkPrivate && isPrivate }, contact?.apps ?? [app], app));
    onClose();
  };

  const find = async () => {
    const q = query.trim();
    if (!q) return;
    setSearch({ status: 'searching' });
    try {
      setSearch({ status: 'done', places: await searchPlaces(q), query: q });
    } catch {
      setSearch({ status: 'error' });
    }
  };

  // Fills what the place has and keeps what was typed for anything it lacks.
  const pick = (p: Place) => {
    setName(p.name.slice(0, CONTACT_LIMITS.name));
    if (p.address) setAddress(p.address.slice(0, CONTACT_LIMITS.address));
    if (p.phone) setPhone(p.phone);
    if (p.website) setWebsite(p.website);
    setMapsUrl(p.mapsUrl);
    setSearch({ status: 'idle' });
  };

  // Fills what the listing had, keeps what was typed for anything it lacked, and says which.
  const fillFrom = (p: ParsedPlace, source: FillSource) => {
    if (p.name) setName(p.name.slice(0, CONTACT_LIMITS.name));
    if (p.address) setAddress(p.address.slice(0, CONTACT_LIMITS.address));
    if (p.phone) setPhone(p.phone);
    if (p.email) setEmail(p.email);
    if (p.website) setWebsite(p.website);
    if (p.mapsUrl) setMapsUrl(p.mapsUrl);
    else if (p.address) setMapsUrl('');
    if (p.hours && !notes.trim()) setNotes(kt('contacts.hoursNote', { hours: p.hours }).slice(0, CONTACT_LIMITS.notes));
    setSearch({ status: 'idle' });
    setFill({ status: 'done', source, place: p, filled: filledFields(p, !notes.trim()) });
  };

  // Fills what the contact has, keeps what was typed for anything it lacks, and says which.
  const fillFromContact = (c: ParsedContact, source: CardSource) => {
    const f = contactFromCard(c, { role: !role.trim() });
    if (f.name) setName(f.name);
    if (f.role) setRole(f.role);
    if (f.phone) setPhone(f.phone);
    if (f.email) setEmail(f.email);
    if (f.website) setWebsite(f.website);
    if (f.address) {
      setAddress(f.address);
      setMapsUrl('');
    }
    if (f.notes) {
      const kept = notes.trim() === filledNotes.current.trim() ? '' : notes.trim();
      setNotes((kept ? `${kept}\n${f.notes}` : f.notes).slice(0, CONTACT_LIMITS.notes));
      filledNotes.current = f.notes;
    }
    setOwn({ status: 'done', source, name: c.name, filled: fillFields(f) });
  };

  const offer = (cards: ParsedContact[], source: CardSource, none: string) => {
    if (cards.length === 0) setOwn({ status: 'none', message: none });
    else if (cards.length === 1 && source !== 'google') fillFromContact(cards[0], source);
    else setOwn({ status: 'choose', source, cards });
  };

  const pickFromPhone = async () => {
    try {
      const chosen = await pickContact();
      if (chosen) fillFromContact(chosen, 'picker');
    } catch {
      setOwn({ status: 'error', message: kt('contacts.pickerFailed'), retry: () => void pickFromPhone() });
    }
  };

  const importCard = async (file: File) => {
    setOwn({ status: 'busy', doing: kt('contacts.readingCard') });
    try {
      offer(parseVCard(await file.text()), 'card', kt('contacts.cardNone'));
    } catch {
      setOwn({ status: 'error', message: kt('contacts.cardUnreadable'), retry: () => cardInput.current?.click() });
    }
  };

  const findInGoogle = async () => {
    const q = googleQuery.trim();
    if (!q) return;
    setOwn({ status: 'busy', doing: kt('contacts.searchingGoogle') });
    try {
      const token = await googleContactsToken(auth as Auth);
      offer(await searchGoogleContacts(token, q), 'google', kt('contacts.googleNone', { query: q }));
    } catch (e) {
      if (popupCancelled(e)) return setOwn({ status: 'idle' });
      setOwn({ status: 'error', message: googleAccessMessage(e, 'Google Contacts') ?? kt('contacts.googleFailed'), retry: () => void findInGoogle() });
    }
  };

  const readImage = async (image: Blob) => {
    lastImage.current = image;
    setPasting(false);
    setFill({ status: 'reading' });
    try {
      const place = await readScreenshot(image, (progress, status) => setFill({ status: 'reading', progress: status.startsWith('recogniz') ? progress : undefined }));
      fillFrom(place, 'screenshot');
    } catch {
      setFill({ status: 'error' });
    }
  };

  const mapsQuery = query.trim() || name.trim();

  return (
    <Dialog
      title={contact ? title.edit : title.add}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              className={deleteButton}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              <Trash2 size={18} /> {kt('common.delete')}
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            {kt('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            {kt('common.save')}
          </button>
        </>
      }
    >
      <section className="mb-5 space-y-3 rounded-2xl border border-line p-4" aria-labelledby="own-contacts">
        <p id="own-contacts" className="text-sm font-medium text-ink-soft">
          {kt('contacts.alreadyInContacts')}
        </p>
        <div className="flex flex-wrap gap-2">
          {picker && (
            <button type="button" className={secondaryButton} disabled={own.status === 'busy'} onClick={() => void pickFromPhone()}>
              <BookUser size={18} aria-hidden="true" /> {kt('contacts.pickFromMine')}
            </button>
          )}
          <button type="button" className={secondaryButton} disabled={own.status === 'busy'} onClick={() => cardInput.current?.click()}>
            <FileUp size={18} aria-hidden="true" /> {kt('contacts.importCard')}
          </button>
          {google && (
            <button type="button" className={secondaryButton} aria-expanded={googleOpen} onClick={() => setGoogleOpen(!googleOpen)}>
              <UserSearch size={18} aria-hidden="true" /> {kt('contacts.findInGoogle')}
            </button>
          )}
          <input
            ref={cardInput}
            type="file"
            accept=".vcf,.vcard,text/vcard,text/x-vcard"
            hidden
            aria-label={kt('contacts.cardFile')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importCard(file);
            }}
          />
        </div>
        {googleOpen && (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void findInGoogle();
            }}
          >
            <label htmlFor="google-contacts-query" className="block text-sm font-medium text-ink-soft">
              {kt('contacts.googleQuery')}
            </label>
            <div className="flex gap-2">
              <input id="google-contacts-query" className={inputClass} value={googleQuery} onChange={(e) => setGoogleQuery(e.target.value)} autoComplete="off" />
              <button type="submit" className={secondaryButton} disabled={!googleQuery.trim() || own.status === 'busy'}>
                <Search size={18} aria-hidden="true" /> {kt('common.search')}
              </button>
            </div>
            <p className="text-sm text-muted">{kt('contacts.unverifiedHint')}</p>
          </form>
        )}
        {own.status === 'busy' && (
          <p role="status" className="text-base text-muted">
            {own.doing}
          </p>
        )}
        {own.status === 'none' && (
          <p role="status" className="text-base text-muted">
            {own.message}
          </p>
        )}
        {own.status === 'error' && <ErrorNotice message={own.message} onRetry={own.retry} />}
        {own.status === 'choose' && (
          <div className="space-y-1.5">
            <p className="text-sm text-muted">{own.source === 'google' ? kt('contacts.chooseWho') : kt('contacts.chooseFrom', { source: own.source, count: own.cards.length })}</p>
            <ul className="grid gap-1.5" aria-label={kt('contacts.chooseList')}>
              {own.cards.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => fillFromContact(c, own.source)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-forest-500 hover:bg-tint"
                  >
                    <span className="block font-medium text-ink [overflow-wrap:anywhere]">{c.name}</span>
                    {contactSummary(c) && <span className="block text-sm text-muted [overflow-wrap:anywhere]">{contactSummary(c)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {own.status === 'done' && (
          <p role="status" className="text-base text-ink-soft">
            {own.filled.length ? capitalize(kt('contacts.filledFrom', { fields: listWords(own.filled), source: own.source })) : kt('contacts.noDetails', { name: own.name })}
          </p>
        )}
      </section>

      <section className="mb-5 space-y-3 rounded-2xl border border-line p-4">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <label htmlFor="place-query" className="block text-sm font-medium text-ink-soft">
            {kt('contacts.findBusiness')}
          </label>
          <div className="flex gap-2">
            <input id="place-query" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} autoComplete="off" />
            <button type="submit" className={secondaryButton} disabled={!query.trim() || search.status === 'searching'}>
              <Search size={18} /> {search.status === 'searching' ? kt('contacts.searching') : kt('common.search')}
            </button>
          </div>
        </form>
        {search.status === 'error' && <ErrorNotice message={kt('contacts.osmUnreachable')} onRetry={() => void find()} />}
        {search.status === 'done' && search.places.length === 0 && (
          <p role="status" className="text-base text-muted">
            {kt('contacts.noPlaces', { query: search.query })}
          </p>
        )}
        {search.status === 'done' && search.places.length > 0 && (
          <ul className="grid gap-1.5" aria-label={kt('contacts.places')}>
            {search.places.slice(0, 5).map((p) => (
              <li key={p.osmUrl}>
                <button type="button" onClick={() => pick(p)} className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-forest-500 hover:bg-tint">
                  <span className="block font-medium text-ink [overflow-wrap:anywhere]">{p.name}</span>
                  {p.address && <span className="block text-sm text-muted [overflow-wrap:anywhere]">{p.address}</span>}
                  {(p.phone || p.website) && (
                    <span className="block text-sm text-muted [overflow-wrap:anywhere]">{[p.phone, p.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>{kt('contacts.osmNote')}</span>
          {mapsQuery && (
            <a className={`${linkClass} text-sm`} href={mapsSearchUrl(mapsQuery)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> {kt('contacts.searchMaps')}
            </a>
          )}
        </div>
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm text-muted">{kt('contacts.notListed')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} disabled={fill.status === 'reading'} onClick={() => fileInput.current?.click()}>
              <ImageUp size={18} aria-hidden="true" /> {kt('contacts.fromScreenshot')}
            </button>
            <button type="button" className={secondaryButton} aria-expanded={pasting} onClick={() => setPasting(!pasting)}>
              <ClipboardPaste size={18} aria-hidden="true" /> {kt('contacts.pasteListing')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              aria-label={kt('contacts.screenshotFile')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void readImage(file);
              }}
            />
          </div>
          {pasting && (
            <div className="space-y-2">
              <textarea
                className={`${inputClass} min-h-28`}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                aria-label={kt('contacts.listingText')}
                placeholder={kt('contacts.listingPlaceholder')}
              />
              <button
                type="button"
                className={secondaryButton}
                disabled={!pasted.trim()}
                onClick={() => {
                  fillFrom(parsePlaceText(pasted), 'text');
                  setPasting(false);
                  setPasted('');
                }}
              >
                {kt('contacts.fillIn')}
              </button>
            </div>
          )}
          {fill.status === 'reading' && (
            <p role="status" className="text-base text-muted">
              {fill.progress === undefined ? kt('contacts.readerLoading') : kt('contacts.readingScreenshot', { percent: Math.round(fill.progress * 100) })}
            </p>
          )}
          {fill.status === 'error' && (
            <ErrorNotice
              message={kt('contacts.screenshotFailed')}
              onRetry={() => lastImage.current && void readImage(lastImage.current)}
            />
          )}
          {fill.status === 'done' && <FillNote source={fill.source} place={fill.place} filled={fill.filled} />}
        </div>
      </section>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={kt('contacts.name')}>
          <input className={inputClass} value={name} maxLength={CONTACT_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{kt('contacts.role')}</legend>
          <div className="mb-2 flex flex-wrap gap-2">
            {roles.map((r) => (
              <Chip key={r} active={role.trim().toLowerCase() === r.toLowerCase()} onClick={() => setRole(r)}>
                {roleLabel(r)}
              </Chip>
            ))}
          </div>
          <input
            className={inputClass}
            value={shownRole(role, roles, roleLabel)}
            maxLength={CONTACT_LIMITS.role}
            onChange={(e) => setRole(storedRole(e.target.value, roles, roleLabel))}
            placeholder={kt('contacts.rolePlaceholder')}
            aria-label={kt('contacts.role')}
          />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kt('contacts.phone')}>
            <input className={inputClass} type="tel" value={phone} maxLength={CONTACT_LIMITS.phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={kt('contacts.email')}>
            <input className={inputClass} type="email" value={email} maxLength={CONTACT_LIMITS.email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label={kt('contacts.website')}>
          <input className={inputClass} inputMode="url" value={website} maxLength={CONTACT_LIMITS.website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" /* i18n-ignore */ />
        </Field>
        <Field label={kt('contacts.address')}>
          <input
            className={inputClass}
            value={address}
            maxLength={CONTACT_LIMITS.address}
            onChange={(e) => {
              setAddress(e.target.value);
              // A typed address no longer matches the place the map link pointed at.
              setMapsUrl('');
            }}
          />
        </Field>
        <Field label={kt('contacts.notes')}>
          <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={CONTACT_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {canMarkPrivate && <PrivateCheckbox checked={isPrivate} onChange={setPrivate} />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Field names a contact fills in, in the order the form shows them. */
function fillFields(f: ContactFill): FieldId[] {
  const ids: (FieldId | false | undefined | '')[] = [f.name && 'name', f.role && 'role', f.phone && 'phone', f.email && 'email', f.website && 'website', f.address && 'address', f.notes && 'notes'];
  return ids.filter((x): x is FieldId => !!x);
}

/** Field names a parsed listing fills in, in the order the form shows them. */
function filledFields(p: ParsedPlace, hoursToNotes = true): FieldId[] {
  const ids: (FieldId | false | undefined | '')[] = [p.name && 'name', p.phone && 'phone', p.email && 'email', p.website && 'website', p.address && 'address', p.hours && hoursToNotes && 'hours'];
  return ids.filter((f): f is FieldId => !!f);
}

/** What was filled in from a listing; the text that wasn't used stays one tap away, collapsed. */
function FillNote({ source, place, filled }: { source: FillSource; place: ParsedPlace; filled: FieldId[] }) {
  const kt = useKitT();
  const unparsed = place.unparsed.slice(0, 8);
  return (
    <div role="status" className="space-y-1 text-base text-ink-soft">
      {filled.length ? (
        <p>{capitalize(kt('contacts.filledFrom', { fields: listWords(filled), source }))}</p>
      ) : (
        <p>
          {kt('contacts.noBusinessDetails', { source })}
          {source === 'screenshot' ? ` ${kt('contacts.screenshotTip')}` : ''}
        </p>
      )}
      {unparsed.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer select-none py-1">{kt('contacts.showUnused')}</summary>
          <ul className="mt-1 list-disc pl-5">
            {unparsed.map((line, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {line}
              </li>
            ))}
          </ul>
          {place.unparsed.length > unparsed.length && <p>{kt('contacts.moreLines', { count: place.unparsed.length - unparsed.length })}</p>}
        </details>
      )}
    </div>
  );
}

/**
 * "Only admins and members": the private flag on a contact or appointment (`./roles`), with its
 * one-line explanation. Show it only to those who may set it (`can(role, 'see-private')`).
 */
export function PrivateCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const kt = useKitT();
  return (
    <div>
      <Checkbox checked={checked} onChange={onChange}>
        {kt('contacts.onlyAdmins')}
      </Checkbox>
      <p className="ml-9 text-sm text-muted">{kt('contacts.helpersWontSee')}</p>
    </div>
  );
}

/** The quiet "Private" marker on a record only admins and members see. */
export function PrivateMark() {
  const kt = useKitT();
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
      <Lock size={14} aria-hidden="true" /> {kt('contacts.private')}
    </span>
  );
}

/**
 * One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map
 * link, and notes. Leave out `onEdit` or `onDelete` where the person may not (a helper on a contact
 * someone else added).
 */
export function ContactCard({ contact: c, role, onEdit, onDelete }: { contact: Contact; role: string; onEdit?: () => void; onDelete?: () => void }) {
  const kt = useKitT();
  const maps = c.mapsUrl || (c.address ? mapsSearchUrl(`${c.name}, ${c.address}`) : null);
  return (
    <section className={`${cardClass} p-5`} aria-label={c.name}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={overline}>{role}</p>
          <h3 className="mt-0.5 text-xl font-semibold text-ink [overflow-wrap:anywhere]">{c.name}</h3>
          {c.private && <PrivateMark />}
        </div>
        {onEdit && (
          <button type="button" className={iconButton} onClick={onEdit} aria-label={kt('contacts.editName', { name: c.name })}>
            <Pencil size={18} />
          </button>
        )}
        {onDelete && (
          <button type="button" className={iconButton} onClick={onDelete} aria-label={kt('contacts.deleteName', { name: c.name })}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-col items-start">
        {c.phone && (
          <a className={`${linkClass} text-lg tabular-nums`} href={telHref(c.phone)} aria-label={kt('contacts.call', { name: c.name, phone: c.phone })}>
            <Phone size={18} aria-hidden="true" /> {c.phone}
          </a>
        )}
        {c.email && (
          <a className={`${linkClass} [overflow-wrap:anywhere]`} href={`mailto:${c.email}`}>
            <Mail size={18} aria-hidden="true" /> {c.email}
          </a>
        )}
        {c.website && (
          <a className={`${linkClass} [overflow-wrap:anywhere]`} href={c.website} target="_blank" rel="noopener noreferrer">
            <Globe size={18} aria-hidden="true" /> {displayWebsite(c.website)}
          </a>
        )}
      </div>
      {c.address && (
        <div className="mt-1 text-base text-ink-soft">
          <p className="flex items-start gap-1.5">
            <MapPin size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" /> <span className="[overflow-wrap:anywhere]">{c.address}</span>
          </p>
          {maps && (
            <a className={linkClass} href={maps} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} aria-hidden="true" /> {kt('contacts.openMaps')}
            </a>
          )}
        </div>
      )}
      {c.notes && <p className="mt-2 text-base whitespace-pre-line text-muted">{c.notes}</p>}
    </section>
  );
}

/**
 * Names one of the household's contacts on a record (who a bill is paid to, who does a job): a
 * select of `contacts` with their roles, "No one" (or `empty`) first. A contact that was removed
 * stays chosen and shows as removed, so saving doesn't drop it unseen.
 */
export function ContactSelect({
  id,
  value,
  contacts,
  onChange,
  empty,
  roleLabel = (r) => r,
  label,
}: {
  id?: string;
  /** The chosen contact's id, or '' for none. */
  value: string;
  contacts: readonly Contact[];
  onChange: (id: string) => void;
  empty?: string;
  roleLabel?: (role: string) => string;
  /** Its accessible name, when no visible label wraps it. */
  label?: string;
}) {
  const kt = useKitT();
  const removed = value && !contacts.some((c) => c.id === value);
  return (
    <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{empty ?? kt('contacts.noOne')}</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.role ? kt('contacts.withRole', { name: c.name, role: roleLabel(c.role) }) : c.name}
        </option>
      ))}
      {removed && <option value={value}>{kt('contacts.removedContact')}</option>}
    </select>
  );
}
