/**
 * The household's contacts in React: the add/edit dialog (with an OpenStreetMap business search
 * that fills in the address, phone and website) and the contact card with tap-to-call, email,
 * website and map links. Saves go through `contactInput` in `../contacts`, so every app trims and
 * links the same way.
 */
import { useState } from 'react';
import { ExternalLink, Globe, Mail, MapPin, Pencil, Phone, Search, Trash2 } from 'lucide-react';
import { CONTACT_LIMITS, contactInput, displayWebsite, type Contact, type ContactInput } from '../contacts';
import { mapsSearchUrl, searchPlaces, telHref, type Place } from '../places';
import { Chip, Dialog, ErrorNotice, Field, cardClass, deleteButton, ghostButton, iconButton, inputClass, linkClass, overline, primaryButton, secondaryButton } from './ui';

type PlaceSearch = { status: 'idle' } | { status: 'searching' } | { status: 'done'; places: Place[]; query: string } | { status: 'error' };

export interface ContactDialogProps {
  contact: Contact | null;
  /** The app's id in `apps` ("baby"): a new contact shows there, an edited one keeps showing there. */
  app: string;
  /** Roles offered as one-tap chips; any other role can be typed. */
  roles: readonly string[];
  /** Prefills the role for a new contact, e.g. from "Choose a pediatrician". */
  role?: string;
  /** Default "New contact" / "Edit contact"; Car says "New shop" / "Edit shop". */
  title?: { add: string; edit: string };
  /** The business search's placeholder: "Practice name and town". */
  searchPlaceholder?: string;
  /** The name field's placeholder, an invented example: "Example Pediatrics". */
  namePlaceholder?: string;
  onSave: (input: ContactInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function ContactDialog({
  contact,
  app,
  roles,
  role: initialRole,
  title = { add: 'New contact', edit: 'Edit contact' },
  searchPlaceholder = 'Business name and town',
  namePlaceholder,
  onSave,
  onDelete,
  onClose,
}: ContactDialogProps) {
  const [name, setName] = useState(contact?.name ?? '');
  const [role, setRole] = useState(contact?.role ?? initialRole ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [website, setWebsite] = useState(contact?.website ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');
  const [mapsUrl, setMapsUrl] = useState(contact?.mapsUrl ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<PlaceSearch>({ status: 'idle' });
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    onSave(contactInput({ name, role, phone, email, website, address, mapsUrl, notes }, contact?.apps ?? [app], app));
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
              <Trash2 size={18} /> Delete
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <section className="mb-5 space-y-3 rounded-2xl border border-stone-200 p-4">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <label htmlFor="place-query" className="block text-sm font-medium text-stone-700">
            Find a business
          </label>
          <div className="flex gap-2">
            <input id="place-query" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} autoComplete="off" />
            <button type="submit" className={secondaryButton} disabled={!query.trim() || search.status === 'searching'}>
              <Search size={18} /> {search.status === 'searching' ? 'Searching' : 'Search'}
            </button>
          </div>
        </form>
        {search.status === 'error' && <ErrorNotice message="Couldn't reach OpenStreetMap. Check the connection." onRetry={() => void find()} />}
        {search.status === 'done' && search.places.length === 0 && (
          <p role="status" className="text-base text-stone-600">
            No places found for "{search.query}".
          </p>
        )}
        {search.status === 'done' && search.places.length > 0 && (
          <ul className="grid gap-1.5" aria-label="Places">
            {search.places.slice(0, 5).map((p) => (
              <li key={p.osmUrl}>
                <button type="button" onClick={() => pick(p)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-forest-500 hover:bg-forest-50">
                  <span className="block font-medium text-stone-800 [overflow-wrap:anywhere]">{p.name}</span>
                  {p.address && <span className="block text-sm text-stone-600 [overflow-wrap:anywhere]">{p.address}</span>}
                  {(p.phone || p.website) && (
                    <span className="block text-sm text-stone-600 [overflow-wrap:anywhere]">{[p.phone, p.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-stone-600">
          <span>Results from OpenStreetMap. Missing a phone number? Check Google Maps.</span>
          {mapsQuery && (
            <a className={`${linkClass} text-sm`} href={mapsSearchUrl(mapsQuery)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Search Google Maps
            </a>
          )}
        </div>
      </section>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <input className={inputClass} value={name} maxLength={CONTACT_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-stone-700">Role</legend>
          <div className="mb-2 flex flex-wrap gap-2">
            {roles.map((r) => (
              <Chip key={r} active={role.trim().toLowerCase() === r.toLowerCase()} onClick={() => setRole(r)}>
                {r}
              </Chip>
            ))}
          </div>
          <input className={inputClass} value={role} maxLength={CONTACT_LIMITS.role} onChange={(e) => setRole(e.target.value)} placeholder="Or type a role" aria-label="Role" />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input className={inputClass} type="tel" value={phone} maxLength={CONTACT_LIMITS.phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={email} maxLength={CONTACT_LIMITS.email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Website">
          <input className={inputClass} inputMode="url" value={website} maxLength={CONTACT_LIMITS.website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Address">
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
        <Field label="Notes">
          <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={CONTACT_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map link, and notes. */
export function ContactCard({ contact: c, role, onEdit, onDelete }: { contact: Contact; role: string; onEdit: () => void; onDelete: () => void }) {
  const maps = c.mapsUrl || (c.address ? mapsSearchUrl(`${c.name}, ${c.address}`) : null);
  return (
    <section className={`${cardClass} p-5`} aria-label={c.name}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={overline}>{role}</p>
          <h3 className="mt-0.5 text-xl font-semibold text-stone-800 [overflow-wrap:anywhere]">{c.name}</h3>
        </div>
        <button type="button" className={iconButton} onClick={onEdit} aria-label={`Edit ${c.name}`}>
          <Pencil size={18} />
        </button>
        <button type="button" className={iconButton} onClick={onDelete} aria-label={`Delete ${c.name}`}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="mt-2 flex flex-col items-start">
        {c.phone && (
          <a className={`${linkClass} text-lg tabular-nums`} href={telHref(c.phone)} aria-label={`Call ${c.name}, ${c.phone}`}>
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
        <div className="mt-1 text-base text-stone-700">
          <p className="flex items-start gap-1.5">
            <MapPin size={18} className="mt-0.5 shrink-0 text-stone-600" aria-hidden="true" /> <span className="[overflow-wrap:anywhere]">{c.address}</span>
          </p>
          {maps && (
            <a className={linkClass} href={maps} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} aria-hidden="true" /> Open in Google Maps
            </a>
          )}
        </div>
      )}
      {c.notes && <p className="mt-2 text-base whitespace-pre-line text-stone-600">{c.notes}</p>}
    </section>
  );
}
