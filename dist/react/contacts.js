import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The household's contacts in React: the add/edit dialog (with an OpenStreetMap business search
 * that fills in the address, phone and website, and for businesses the map lacks, filling from a
 * listing screenshot or pasted listing text) and the contact card with tap-to-call, email,
 * website and map links. Saves go through `contactInput` in `../contacts`, so every app trims and
 * links the same way.
 */
import { useRef, useState } from 'react';
import { ClipboardPaste, ExternalLink, Globe, ImageUp, Lock, Mail, MapPin, Pencil, Phone, Search, Trash2 } from 'lucide-react';
import { CONTACT_LIMITS, contactInput, displayWebsite } from '../contacts';
import { mapsSearchUrl, parsePlaceText, readPlaceScreenshot, searchPlaces, telHref } from '../places';
import { Checkbox, Chip, Dialog, ErrorNotice, Field, cardClass, deleteButton, ghostButton, iconButton, inputClass, linkClass, overline, primaryButton, secondaryButton } from './ui';
const SOURCE_WORDS = { screenshot: 'the screenshot', text: 'the pasted text', share: 'what was shared' };
const listWords = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
export function ContactDialog({ contact, app, roles, role: initialRole, title = { add: 'New contact', edit: 'Edit contact' }, searchPlaceholder = 'Business name and town', namePlaceholder, prefill, readScreenshot = (image, onProgress) => readPlaceScreenshot(image, { onProgress }), canMarkPrivate = true, onSave, onDelete, onClose, }) {
    const start = contact ? undefined : prefill;
    const [name, setName] = useState(contact?.name ?? start?.name?.slice(0, CONTACT_LIMITS.name) ?? '');
    const [role, setRole] = useState(contact?.role ?? initialRole ?? '');
    const [phone, setPhone] = useState(contact?.phone ?? start?.phone ?? '');
    const [email, setEmail] = useState(contact?.email ?? start?.email ?? '');
    const [website, setWebsite] = useState(contact?.website ?? start?.website ?? '');
    const [address, setAddress] = useState(contact?.address ?? start?.address?.slice(0, CONTACT_LIMITS.address) ?? '');
    const [mapsUrl, setMapsUrl] = useState(contact?.mapsUrl ?? start?.mapsUrl ?? '');
    const [notes, setNotes] = useState(contact?.notes ?? (start?.hours ? `Hours: ${start.hours}`.slice(0, CONTACT_LIMITS.notes) : ''));
    const [isPrivate, setPrivate] = useState(contact?.private === true);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState({ status: 'idle' });
    const [fill, setFill] = useState(start ? { status: 'done', source: 'share', place: start, filled: filledFields(start) } : { status: 'idle' });
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState('');
    const fileInput = useRef(null);
    const lastImage = useRef(null);
    const valid = name.trim().length > 0;
    const save = () => {
        if (!valid)
            return;
        onSave(contactInput({ name, role, phone, email, website, address, mapsUrl, notes, private: canMarkPrivate && isPrivate }, contact?.apps ?? [app], app));
        onClose();
    };
    const find = async () => {
        const q = query.trim();
        if (!q)
            return;
        setSearch({ status: 'searching' });
        try {
            setSearch({ status: 'done', places: await searchPlaces(q), query: q });
        }
        catch {
            setSearch({ status: 'error' });
        }
    };
    // Fills what the place has and keeps what was typed for anything it lacks.
    const pick = (p) => {
        setName(p.name.slice(0, CONTACT_LIMITS.name));
        if (p.address)
            setAddress(p.address.slice(0, CONTACT_LIMITS.address));
        if (p.phone)
            setPhone(p.phone);
        if (p.website)
            setWebsite(p.website);
        setMapsUrl(p.mapsUrl);
        setSearch({ status: 'idle' });
    };
    // Fills what the listing had, keeps what was typed for anything it lacked, and says which.
    const fillFrom = (p, source) => {
        if (p.name)
            setName(p.name.slice(0, CONTACT_LIMITS.name));
        if (p.address)
            setAddress(p.address.slice(0, CONTACT_LIMITS.address));
        if (p.phone)
            setPhone(p.phone);
        if (p.email)
            setEmail(p.email);
        if (p.website)
            setWebsite(p.website);
        if (p.mapsUrl)
            setMapsUrl(p.mapsUrl);
        else if (p.address)
            setMapsUrl('');
        if (p.hours && !notes.trim())
            setNotes(`Hours: ${p.hours}`.slice(0, CONTACT_LIMITS.notes));
        setSearch({ status: 'idle' });
        setFill({ status: 'done', source, place: p, filled: filledFields(p, !notes.trim()) });
    };
    const readImage = async (image) => {
        lastImage.current = image;
        setPasting(false);
        setFill({ status: 'reading' });
        try {
            const place = await readScreenshot(image, (progress, status) => setFill({ status: 'reading', progress: status.startsWith('recogniz') ? progress : undefined }));
            fillFrom(place, 'screenshot');
        }
        catch {
            setFill({ status: 'error' });
        }
    };
    const mapsQuery = query.trim() || name.trim();
    return (_jsxs(Dialog, { title: contact ? title.edit : title.add, onClose: onClose, footer: _jsxs(_Fragment, { children: [onDelete && (_jsxs("button", { type: "button", className: deleteButton, onClick: () => {
                        onDelete();
                        onClose();
                    }, children: [_jsx(Trash2, { size: 18 }), " Delete"] })), _jsx("button", { type: "button", className: ghostButton, onClick: onClose, children: "Cancel" }), _jsx("button", { type: "button", className: primaryButton, disabled: !valid, onClick: save, children: "Save" })] }), children: [_jsxs("section", { className: "mb-5 space-y-3 rounded-2xl border border-stone-200 p-4", children: [_jsxs("form", { className: "space-y-1.5", onSubmit: (e) => {
                            e.preventDefault();
                            void find();
                        }, children: [_jsx("label", { htmlFor: "place-query", className: "block text-sm font-medium text-stone-700", children: "Find a business" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: "place-query", className: inputClass, value: query, onChange: (e) => setQuery(e.target.value), placeholder: searchPlaceholder, autoComplete: "off" }), _jsxs("button", { type: "submit", className: secondaryButton, disabled: !query.trim() || search.status === 'searching', children: [_jsx(Search, { size: 18 }), " ", search.status === 'searching' ? 'Searching' : 'Search'] })] })] }), search.status === 'error' && _jsx(ErrorNotice, { message: "Couldn't reach OpenStreetMap. Check the connection.", onRetry: () => void find() }), search.status === 'done' && search.places.length === 0 && (_jsxs("p", { role: "status", className: "text-base text-stone-600", children: ["No places found for \"", search.query, "\"."] })), search.status === 'done' && search.places.length > 0 && (_jsx("ul", { className: "grid gap-1.5", "aria-label": "Places", children: search.places.slice(0, 5).map((p) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => pick(p), className: "w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-forest-500 hover:bg-forest-50", children: [_jsx("span", { className: "block font-medium text-stone-800 [overflow-wrap:anywhere]", children: p.name }), p.address && _jsx("span", { className: "block text-sm text-stone-600 [overflow-wrap:anywhere]", children: p.address }), (p.phone || p.website) && (_jsx("span", { className: "block text-sm text-stone-600 [overflow-wrap:anywhere]", children: [p.phone, p.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ') }))] }) }, p.osmUrl))) })), _jsxs("div", { className: "flex flex-wrap items-center gap-x-3 text-sm text-stone-600", children: [_jsx("span", { children: "Results from OpenStreetMap. Missing a phone number? Check Google Maps." }), mapsQuery && (_jsxs("a", { className: `${linkClass} text-sm`, href: mapsSearchUrl(mapsQuery), target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 16, "aria-hidden": "true" }), " Search Google Maps"] }))] }), _jsxs("div", { className: "space-y-2 border-t border-stone-200 pt-3", children: [_jsx("p", { className: "text-sm text-stone-600", children: "Not listed? Take a screenshot of the business in Google Maps, then choose it here." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", className: secondaryButton, disabled: fill.status === 'reading', onClick: () => fileInput.current?.click(), children: [_jsx(ImageUp, { size: 18, "aria-hidden": "true" }), " Fill from a screenshot"] }), _jsxs("button", { type: "button", className: secondaryButton, "aria-expanded": pasting, onClick: () => setPasting(!pasting), children: [_jsx(ClipboardPaste, { size: 18, "aria-hidden": "true" }), " Paste listing text"] }), _jsx("input", { ref: fileInput, type: "file", accept: "image/*", hidden: true, "aria-label": "Screenshot of the business", onChange: (e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file)
                                                void readImage(file);
                                        } })] }), pasting && (_jsxs("div", { className: "space-y-2", children: [_jsx("textarea", { className: `${inputClass} min-h-28`, value: pasted, onChange: (e) => setPasted(e.target.value), "aria-label": "Listing text", placeholder: "Copy the business's name, address and phone number from Google Maps, Apple Maps or Yelp and paste them here." }), _jsx("button", { type: "button", className: secondaryButton, disabled: !pasted.trim(), onClick: () => {
                                            fillFrom(parsePlaceText(pasted), 'text');
                                            setPasting(false);
                                            setPasted('');
                                        }, children: "Fill in" })] })), fill.status === 'reading' && (_jsx("p", { role: "status", className: "text-base text-stone-600", children: fill.progress === undefined ? 'Getting the text reader ready…' : `Reading the screenshot… ${Math.round(fill.progress * 100)}%` })), fill.status === 'error' && (_jsx(ErrorNotice, { message: "Couldn't read the screenshot. The text reader needs a connection the first time.", onRetry: () => lastImage.current && void readImage(lastImage.current) })), fill.status === 'done' && _jsx(FillNote, { source: fill.source, place: fill.place, filled: fill.filled })] })] }), _jsxs("form", { className: "space-y-4", onSubmit: (e) => {
                    e.preventDefault();
                    save();
                }, children: [_jsx(Field, { label: "Name", children: _jsx("input", { className: inputClass, value: name, maxLength: CONTACT_LIMITS.name, onChange: (e) => setName(e.target.value), placeholder: namePlaceholder }) }), _jsxs("fieldset", { children: [_jsx("legend", { className: "mb-1.5 block text-sm font-medium text-stone-700", children: "Role" }), _jsx("div", { className: "mb-2 flex flex-wrap gap-2", children: roles.map((r) => (_jsx(Chip, { active: role.trim().toLowerCase() === r.toLowerCase(), onClick: () => setRole(r), children: r }, r))) }), _jsx("input", { className: inputClass, value: role, maxLength: CONTACT_LIMITS.role, onChange: (e) => setRole(e.target.value), placeholder: "Or type a role", "aria-label": "Role" })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Phone", children: _jsx("input", { className: inputClass, type: "tel", value: phone, maxLength: CONTACT_LIMITS.phone, onChange: (e) => setPhone(e.target.value), autoComplete: "off" }) }), _jsx(Field, { label: "Email", children: _jsx("input", { className: inputClass, type: "email", value: email, maxLength: CONTACT_LIMITS.email, onChange: (e) => setEmail(e.target.value), autoComplete: "off" }) })] }), _jsx(Field, { label: "Website", children: _jsx("input", { className: inputClass, inputMode: "url", value: website, maxLength: CONTACT_LIMITS.website, onChange: (e) => setWebsite(e.target.value), placeholder: "example.com" }) }), _jsx(Field, { label: "Address", children: _jsx("input", { className: inputClass, value: address, maxLength: CONTACT_LIMITS.address, onChange: (e) => {
                                setAddress(e.target.value);
                                // A typed address no longer matches the place the map link pointed at.
                                setMapsUrl('');
                            } }) }), _jsx(Field, { label: "Notes", children: _jsx("textarea", { className: `${inputClass} min-h-20`, value: notes, maxLength: CONTACT_LIMITS.notes, onChange: (e) => setNotes(e.target.value) }) }), canMarkPrivate && _jsx(PrivateCheckbox, { checked: isPrivate, onChange: setPrivate }), _jsx("button", { type: "submit", hidden: true })] })] }));
}
/** Field names a parsed listing fills in, in the order the form shows them. */
function filledFields(p, hoursToNotes = true) {
    return [
        p.name && 'name',
        p.phone && 'phone',
        p.email && 'email',
        p.website && 'website',
        p.address && 'address',
        p.hours && hoursToNotes && 'hours (in notes)',
    ].filter((f) => !!f);
}
/** What was filled in from a listing; the text that wasn't used stays one tap away, collapsed. */
function FillNote({ source, place, filled }) {
    const from = SOURCE_WORDS[source];
    const unparsed = place.unparsed.slice(0, 8);
    return (_jsxs("div", { role: "status", className: "space-y-1 text-base text-stone-700", children: [filled.length ? (_jsxs("p", { children: ["Filled in the ", listWords(filled), " from ", from, ". Check them before saving."] })) : (_jsxs("p", { children: ["Couldn't find a business's details in ", from, ".", source === 'screenshot' ? ' Try a screenshot that shows the name, address and phone number, or paste the text instead.' : ''] })), unparsed.length > 0 && (_jsxs("details", { className: "text-sm text-stone-500", children: [_jsx("summary", { className: "cursor-pointer select-none py-1", children: "Show the text that wasn't used" }), _jsx("ul", { className: "mt-1 list-disc pl-5", children: unparsed.map((line, i) => (_jsx("li", { className: "[overflow-wrap:anywhere]", children: line }, i))) }), place.unparsed.length > unparsed.length && _jsxs("p", { children: ["And ", place.unparsed.length - unparsed.length, " more lines."] })] }))] }));
}
/**
 * "Only admins and members": the private flag on a contact or appointment (`./roles`), with its
 * one-line explanation. Show it only to those who may set it (`can(role, 'see-private')`).
 */
export function PrivateCheckbox({ checked, onChange }) {
    return (_jsxs("div", { children: [_jsx(Checkbox, { checked: checked, onChange: onChange, children: "Only admins and members" }), _jsx("p", { className: "ml-9 text-sm text-stone-600 dark:text-stone-300", children: "Helpers and kids won\u2019t see it." })] }));
}
/** The quiet "Private" marker on a record only admins and members see. */
export function PrivateMark() {
    return (_jsxs("span", { className: "inline-flex items-center gap-1 text-sm font-medium text-stone-600 dark:text-stone-300", children: [_jsx(Lock, { size: 14, "aria-hidden": "true" }), " Private"] }));
}
/**
 * One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map
 * link, and notes. Leave out `onEdit` or `onDelete` where the person may not (a helper on a contact
 * someone else added).
 */
export function ContactCard({ contact: c, role, onEdit, onDelete }) {
    const maps = c.mapsUrl || (c.address ? mapsSearchUrl(`${c.name}, ${c.address}`) : null);
    return (_jsxs("section", { className: `${cardClass} p-5`, "aria-label": c.name, children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: overline, children: role }), _jsx("h3", { className: "mt-0.5 text-xl font-semibold text-stone-800 [overflow-wrap:anywhere]", children: c.name }), c.private && _jsx(PrivateMark, {})] }), onEdit && (_jsx("button", { type: "button", className: iconButton, onClick: onEdit, "aria-label": `Edit ${c.name}`, children: _jsx(Pencil, { size: 18 }) })), onDelete && (_jsx("button", { type: "button", className: iconButton, onClick: onDelete, "aria-label": `Delete ${c.name}`, children: _jsx(Trash2, { size: 18 }) }))] }), _jsxs("div", { className: "mt-2 flex flex-col items-start", children: [c.phone && (_jsxs("a", { className: `${linkClass} text-lg tabular-nums`, href: telHref(c.phone), "aria-label": `Call ${c.name}, ${c.phone}`, children: [_jsx(Phone, { size: 18, "aria-hidden": "true" }), " ", c.phone] })), c.email && (_jsxs("a", { className: `${linkClass} [overflow-wrap:anywhere]`, href: `mailto:${c.email}`, children: [_jsx(Mail, { size: 18, "aria-hidden": "true" }), " ", c.email] })), c.website && (_jsxs("a", { className: `${linkClass} [overflow-wrap:anywhere]`, href: c.website, target: "_blank", rel: "noopener noreferrer", children: [_jsx(Globe, { size: 18, "aria-hidden": "true" }), " ", displayWebsite(c.website)] }))] }), c.address && (_jsxs("div", { className: "mt-1 text-base text-stone-700", children: [_jsxs("p", { className: "flex items-start gap-1.5", children: [_jsx(MapPin, { size: 18, className: "mt-0.5 shrink-0 text-stone-600", "aria-hidden": "true" }), " ", _jsx("span", { className: "[overflow-wrap:anywhere]", children: c.address })] }), maps && (_jsxs("a", { className: linkClass, href: maps, target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 18, "aria-hidden": "true" }), " Open in Google Maps"] }))] })), c.notes && _jsx("p", { className: "mt-2 text-base whitespace-pre-line text-stone-600", children: c.notes })] }));
}
