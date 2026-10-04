import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The household's contacts in React: the add/edit dialog (filling from the person's own contacts:
 * the phone's contact picker, a contact card file or Google Contacts; an OpenStreetMap business
 * search that fills in the address, phone and website, and for businesses the map lacks, filling
 * from a listing screenshot or pasted listing text) and the contact card with tap-to-call, email,
 * website and map links, and the select that names one of them on a record. Saves go through `contactInput` in `../contacts`, so every app trims and
 * links the same way.
 */
import { useRef, useState } from 'react';
import { BookUser, ClipboardPaste, ExternalLink, FileUp, Globe, ImageUp, Lock, Mail, MapPin, Pencil, Phone, Search, Trash2, UserSearch } from 'lucide-react';
import { CONTACT_LIMITS, CONTACT_PAY_KINDS, CONTACT_PAY_LIMITS, contactInput, displayWebsite, normalizeWebsite } from '../contacts';
import { contactFromCard, contactPickerSupported, contactSummary, parseVCard, pickContact } from '../vcard';
import { googleContactsAvailable, googleContactsToken, searchGoogleContacts } from '../google-contacts';
import { googleAccessMessage, popupCancelled } from '../feedback';
import { mapsSearchUrl, parsePlaceText, readPlaceScreenshot, searchPlaces, telHref } from '../places';
import { capitalize, formatList, kt as kitT } from '../i18n';
import { useKitT } from './i18n';
import { Checkbox, Chip, Dialog, ErrorNotice, Field, cardClass, deleteButton, ghostButton, iconButton, inputClass, linkClass, overline, primaryButton, secondaryButton, selectClass } from './ui';
const FIELD_KEYS = {
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
const listWords = (fields) => formatList(fields.map((f) => kitT(FIELD_KEYS[f])));
/** A role as the field shows it: one of the app's roles in its shown name, anything typed as typed. */
export function shownRole(role, roles, roleLabel) {
    const known = roles.find((r) => r.toLowerCase() === role.trim().toLowerCase());
    return known ? roleLabel(known) : role;
}
/** What to save for the field's text: one of the app's roles when it is that role's shown name, else the text. */
export function storedRole(text, roles, roleLabel) {
    const typed = text.trim().toLowerCase();
    return (typed && roles.find((r) => roleLabel(r).toLowerCase() === typed)) || text;
}
export function ContactDialog({ contact, app, roles, roleLabel = (r) => r, role: initialRole, title, searchPlaceholder, namePlaceholder, prefill, sharedContacts, auth, readScreenshot = (image, onProgress) => readPlaceScreenshot(image, { onProgress }), canMarkPrivate = true, payDetails = false, onSave, onDelete, onClose, }) {
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
    const [pay, setPay] = useState(contact?.pay ?? {});
    const hadPay = !!contact?.pay && Object.keys(contact.pay).length > 0;
    const showPay = canMarkPrivate && (payDetails || hadPay);
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState({ status: 'idle' });
    const [fill, setFill] = useState(start ? { status: 'done', source: 'share', place: start, filled: filledFields(start) } : { status: 'idle' });
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState('');
    const fileInput = useRef(null);
    const cardInput = useRef(null);
    const lastImage = useRef(null);
    const [picker] = useState(contactPickerSupported);
    const [google] = useState(() => googleContactsAvailable(auth));
    const [googleOpen, setGoogleOpen] = useState(false);
    const [googleQuery, setGoogleQuery] = useState('');
    // Fills right away from one shared card; several wait for the person to choose.
    const [own, setOwn] = useState(() => {
        if (contact || !sharedContacts)
            return { status: 'idle' };
        if (sharedContacts.length === 0)
            return { status: 'none', message: kitT('contacts.sharedNone') };
        if (sharedContacts.length > 1)
            return { status: 'choose', source: 'shared', cards: sharedContacts };
        return { status: 'done', source: 'shared', name: sharedContacts[0].name, filled: fillFields(contactFromCard(sharedContacts[0], { role: !initialRole })) };
    });
    // Notes a filled contact wrote, replaced (not added to again) when another one is chosen.
    const filledNotes = useRef(card?.notes ?? '');
    const valid = name.trim().length > 0;
    const save = () => {
        if (!valid)
            return;
        const fields = { name, role, phone, email, website, address, mapsUrl, notes, private: canMarkPrivate && isPrivate };
        // Pay details go in only where they were shown, so saving elsewhere keeps them as they are.
        onSave(contactInput(showPay ? { ...fields, pay: { ...pay, portal: normalizeWebsite(pay.portal) } } : fields, contact?.apps ?? [app], app));
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
            setNotes(kt('contacts.hoursNote', { hours: p.hours }).slice(0, CONTACT_LIMITS.notes));
        setSearch({ status: 'idle' });
        setFill({ status: 'done', source, place: p, filled: filledFields(p, !notes.trim()) });
    };
    // Fills what the contact has, keeps what was typed for anything it lacks, and says which.
    const fillFromContact = (c, source) => {
        const f = contactFromCard(c, { role: !role.trim() });
        if (f.name)
            setName(f.name);
        if (f.role)
            setRole(f.role);
        if (f.phone)
            setPhone(f.phone);
        if (f.email)
            setEmail(f.email);
        if (f.website)
            setWebsite(f.website);
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
    const offer = (cards, source, none) => {
        if (cards.length === 0)
            setOwn({ status: 'none', message: none });
        else if (cards.length === 1 && source !== 'google')
            fillFromContact(cards[0], source);
        else
            setOwn({ status: 'choose', source, cards });
    };
    const pickFromPhone = async () => {
        try {
            const chosen = await pickContact();
            if (chosen)
                fillFromContact(chosen, 'picker');
        }
        catch {
            setOwn({ status: 'error', message: kt('contacts.pickerFailed'), retry: () => void pickFromPhone() });
        }
    };
    const importCard = async (file) => {
        setOwn({ status: 'busy', doing: kt('contacts.readingCard') });
        try {
            offer(parseVCard(await file.text()), 'card', kt('contacts.cardNone'));
        }
        catch {
            setOwn({ status: 'error', message: kt('contacts.cardUnreadable'), retry: () => cardInput.current?.click() });
        }
    };
    const findInGoogle = async () => {
        const q = googleQuery.trim();
        if (!q)
            return;
        setOwn({ status: 'busy', doing: kt('contacts.searchingGoogle') });
        try {
            const token = await googleContactsToken(auth);
            offer(await searchGoogleContacts(token, q), 'google', kt('contacts.googleNone', { query: q }));
        }
        catch (e) {
            if (popupCancelled(e))
                return setOwn({ status: 'idle' });
            setOwn({ status: 'error', message: googleAccessMessage(e, 'Google Contacts') ?? kt('contacts.googleFailed'), retry: () => void findInGoogle() });
        }
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
                    }, children: [_jsx(Trash2, { size: 18 }), " ", kt('common.delete')] })), _jsx("button", { type: "button", className: ghostButton, onClick: onClose, children: kt('common.cancel') }), _jsx("button", { type: "button", className: primaryButton, disabled: !valid, onClick: save, children: kt('common.save') })] }), children: [_jsxs("section", { className: "mb-5 space-y-3 rounded-2xl border border-line p-4", "aria-labelledby": "own-contacts", children: [_jsx("p", { id: "own-contacts", className: "text-sm font-medium text-ink-soft", children: kt('contacts.alreadyInContacts') }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [picker && (_jsxs("button", { type: "button", className: secondaryButton, disabled: own.status === 'busy', onClick: () => void pickFromPhone(), children: [_jsx(BookUser, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.pickFromMine')] })), _jsxs("button", { type: "button", className: secondaryButton, disabled: own.status === 'busy', onClick: () => cardInput.current?.click(), children: [_jsx(FileUp, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.importCard')] }), google && (_jsxs("button", { type: "button", className: secondaryButton, "aria-expanded": googleOpen, onClick: () => setGoogleOpen(!googleOpen), children: [_jsx(UserSearch, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.findInGoogle')] })), _jsx("input", { ref: cardInput, type: "file", accept: ".vcf,.vcard,text/vcard,text/x-vcard", hidden: true, "aria-label": kt('contacts.cardFile'), onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file)
                                        void importCard(file);
                                } })] }), googleOpen && (_jsxs("form", { className: "space-y-1.5", onSubmit: (e) => {
                            e.preventDefault();
                            void findInGoogle();
                        }, children: [_jsx("label", { htmlFor: "google-contacts-query", className: "block text-sm font-medium text-ink-soft", children: kt('contacts.googleQuery') }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: "google-contacts-query", className: inputClass, value: googleQuery, onChange: (e) => setGoogleQuery(e.target.value), autoComplete: "off" }), _jsxs("button", { type: "submit", className: secondaryButton, disabled: !googleQuery.trim() || own.status === 'busy', children: [_jsx(Search, { size: 18, "aria-hidden": "true" }), " ", kt('common.search')] })] }), _jsx("p", { className: "text-sm text-muted", children: kt('contacts.unverifiedHint') })] })), own.status === 'busy' && (_jsx("p", { role: "status", className: "text-base text-muted", children: own.doing })), own.status === 'none' && (_jsx("p", { role: "status", className: "text-base text-muted", children: own.message })), own.status === 'error' && _jsx(ErrorNotice, { message: own.message, onRetry: own.retry }), own.status === 'choose' && (_jsxs("div", { className: "space-y-1.5", children: [_jsx("p", { className: "text-sm text-muted", children: own.source === 'google' ? kt('contacts.chooseWho') : kt('contacts.chooseFrom', { source: own.source, count: own.cards.length }) }), _jsx("ul", { className: "grid gap-1.5", "aria-label": kt('contacts.chooseList'), children: own.cards.map((c, i) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => fillFromContact(c, own.source), className: "w-full rounded-xl border border-line px-3 py-2 text-left hover:border-forest-500 hover:bg-tint", children: [_jsx("span", { className: "block font-medium text-ink [overflow-wrap:anywhere]", children: c.name }), contactSummary(c) && _jsx("span", { className: "block text-sm text-muted [overflow-wrap:anywhere]", children: contactSummary(c) })] }) }, i))) })] })), own.status === 'done' && (_jsx("p", { role: "status", className: "text-base text-ink-soft", children: own.filled.length ? capitalize(kt('contacts.filledFrom', { fields: listWords(own.filled), source: own.source })) : kt('contacts.noDetails', { name: own.name }) }))] }), _jsxs("section", { className: "mb-5 space-y-3 rounded-2xl border border-line p-4", children: [_jsxs("form", { className: "space-y-1.5", onSubmit: (e) => {
                            e.preventDefault();
                            void find();
                        }, children: [_jsx("label", { htmlFor: "place-query", className: "block text-sm font-medium text-ink-soft", children: kt('contacts.findBusiness') }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { id: "place-query", className: inputClass, value: query, onChange: (e) => setQuery(e.target.value), placeholder: searchPlaceholder, autoComplete: "off" }), _jsxs("button", { type: "submit", className: secondaryButton, disabled: !query.trim() || search.status === 'searching', children: [_jsx(Search, { size: 18 }), " ", search.status === 'searching' ? kt('contacts.searching') : kt('common.search')] })] })] }), search.status === 'error' && _jsx(ErrorNotice, { message: kt('contacts.osmUnreachable'), onRetry: () => void find() }), search.status === 'done' && search.places.length === 0 && (_jsx("p", { role: "status", className: "text-base text-muted", children: kt('contacts.noPlaces', { query: search.query }) })), search.status === 'done' && search.places.length > 0 && (_jsx("ul", { className: "grid gap-1.5", "aria-label": kt('contacts.places'), children: search.places.slice(0, 5).map((p) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => pick(p), className: "w-full rounded-xl border border-line px-3 py-2 text-left hover:border-forest-500 hover:bg-tint", children: [_jsx("span", { className: "block font-medium text-ink [overflow-wrap:anywhere]", children: p.name }), p.address && _jsx("span", { className: "block text-sm text-muted [overflow-wrap:anywhere]", children: p.address }), (p.phone || p.website) && (_jsx("span", { className: "block text-sm text-muted [overflow-wrap:anywhere]", children: [p.phone, p.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ') }))] }) }, p.osmUrl))) })), _jsxs("div", { className: "flex flex-wrap items-center gap-x-3 text-sm text-muted", children: [_jsx("span", { children: kt('contacts.osmNote') }), mapsQuery && (_jsxs("a", { className: `${linkClass} text-sm`, href: mapsSearchUrl(mapsQuery), target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 16, "aria-hidden": "true" }), " ", kt('contacts.searchMaps')] }))] }), _jsxs("div", { className: "space-y-2 border-t border-line pt-3", children: [_jsx("p", { className: "text-sm text-muted", children: kt('contacts.notListed') }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", className: secondaryButton, disabled: fill.status === 'reading', onClick: () => fileInput.current?.click(), children: [_jsx(ImageUp, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.fromScreenshot')] }), _jsxs("button", { type: "button", className: secondaryButton, "aria-expanded": pasting, onClick: () => setPasting(!pasting), children: [_jsx(ClipboardPaste, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.pasteListing')] }), _jsx("input", { ref: fileInput, type: "file", accept: "image/*", hidden: true, "aria-label": kt('contacts.screenshotFile'), onChange: (e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file)
                                                void readImage(file);
                                        } })] }), pasting && (_jsxs("div", { className: "space-y-2", children: [_jsx("textarea", { className: `${inputClass} min-h-28`, value: pasted, onChange: (e) => setPasted(e.target.value), "aria-label": kt('contacts.listingText'), placeholder: kt('contacts.listingPlaceholder') }), _jsx("button", { type: "button", className: secondaryButton, disabled: !pasted.trim(), onClick: () => {
                                            fillFrom(parsePlaceText(pasted), 'text');
                                            setPasting(false);
                                            setPasted('');
                                        }, children: kt('contacts.fillIn') })] })), fill.status === 'reading' && (_jsx("p", { role: "status", className: "text-base text-muted", children: fill.progress === undefined ? kt('contacts.readerLoading') : kt('contacts.readingScreenshot', { percent: Math.round(fill.progress * 100) }) })), fill.status === 'error' && (_jsx(ErrorNotice, { message: kt('contacts.screenshotFailed'), onRetry: () => lastImage.current && void readImage(lastImage.current) })), fill.status === 'done' && _jsx(FillNote, { source: fill.source, place: fill.place, filled: fill.filled })] })] }), _jsxs("form", { className: "space-y-4", onSubmit: (e) => {
                    e.preventDefault();
                    save();
                }, children: [_jsx(Field, { label: kt('contacts.name'), children: _jsx("input", { className: inputClass, value: name, maxLength: CONTACT_LIMITS.name, onChange: (e) => setName(e.target.value), placeholder: namePlaceholder }) }), _jsxs("fieldset", { children: [_jsx("legend", { className: "mb-1.5 block text-sm font-medium text-ink-soft", children: kt('contacts.role') }), _jsx("div", { className: "mb-2 flex flex-wrap gap-2", children: roles.map((r) => (_jsx(Chip, { active: role.trim().toLowerCase() === r.toLowerCase(), onClick: () => setRole(r), children: roleLabel(r) }, r))) }), _jsx("input", { className: inputClass, value: shownRole(role, roles, roleLabel), maxLength: CONTACT_LIMITS.role, onChange: (e) => setRole(storedRole(e.target.value, roles, roleLabel)), placeholder: kt('contacts.rolePlaceholder'), "aria-label": kt('contacts.role') })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: kt('contacts.phone'), children: _jsx("input", { className: inputClass, type: "tel", value: phone, maxLength: CONTACT_LIMITS.phone, onChange: (e) => setPhone(e.target.value), autoComplete: "off" }) }), _jsx(Field, { label: kt('contacts.email'), children: _jsx("input", { className: inputClass, type: "email", value: email, maxLength: CONTACT_LIMITS.email, onChange: (e) => setEmail(e.target.value), autoComplete: "off" }) })] }), _jsx(Field, { label: kt('contacts.website'), children: _jsx("input", { className: inputClass, inputMode: "url", value: website, maxLength: CONTACT_LIMITS.website, onChange: (e) => setWebsite(e.target.value), placeholder: "example.com" /* i18n-ignore */ }) }), _jsx(Field, { label: kt('contacts.address'), children: _jsx("input", { className: inputClass, value: address, maxLength: CONTACT_LIMITS.address, onChange: (e) => {
                                setAddress(e.target.value);
                                // A typed address no longer matches the place the map link pointed at.
                                setMapsUrl('');
                            } }) }), _jsx(Field, { label: kt('contacts.notes'), children: _jsx("textarea", { className: `${inputClass} min-h-20`, value: notes, maxLength: CONTACT_LIMITS.notes, onChange: (e) => setNotes(e.target.value) }) }), showPay && _jsx(PayFields, { pay: pay, onChange: setPay, open: payDetails || hadPay }), canMarkPrivate && _jsx(PrivateCheckbox, { checked: isPrivate, onChange: setPrivate }), _jsx("button", { type: "submit", hidden: true })] })] }));
}
const PAY_LABELS = {
    zelle: 'contacts.pay.zelle',
    venmo: 'contacts.pay.venmo',
    bank: 'contacts.pay.bank',
    check: 'contacts.pay.check',
    portal: 'contacts.pay.portal',
};
/** On the card, before the detail: "Zelle", "Check to". */
const PAY_SHORT = {
    zelle: 'contacts.pay.zelleShort',
    venmo: 'contacts.pay.venmoShort',
    bank: 'contacts.pay.bankShort',
    check: 'contacts.pay.checkShort',
    portal: 'contacts.pay.portal',
};
const PAY_PLACEHOLDERS = {
    zelle: 'contacts.pay.zellePlaceholder',
    venmo: 'contacts.pay.venmoPlaceholder',
    bank: 'contacts.pay.bankPlaceholder',
    check: 'contacts.pay.checkPlaceholder',
    portal: 'contacts.pay.portalPlaceholder',
};
/** "How to pay them": one field per way of paying, in a section that folds away. */
function PayFields({ pay, onChange, open }) {
    const kt = useKitT();
    return (_jsxs("details", { className: "rounded-xl border border-line p-3", open: open, children: [_jsx("summary", { className: "cursor-pointer select-none text-sm font-medium text-ink-soft", children: kt('contacts.pay.title') }), _jsxs("div", { className: "mt-3 space-y-3", children: [_jsx("p", { className: "text-sm text-muted", children: kt('contacts.pay.hint') }), CONTACT_PAY_KINDS.map((kind) => (_jsx(Field, { label: kt(PAY_LABELS[kind]), children: _jsx("input", { className: inputClass, value: pay[kind] ?? '', maxLength: CONTACT_PAY_LIMITS[kind], inputMode: kind === 'portal' ? 'url' : undefined, autoComplete: "off", placeholder: kt(PAY_PLACEHOLDERS[kind]), onChange: (e) => onChange({ ...pay, [kind]: e.target.value }) }) }, kind)))] })] }));
}
/** Field names a contact fills in, in the order the form shows them. */
function fillFields(f) {
    const ids = [f.name && 'name', f.role && 'role', f.phone && 'phone', f.email && 'email', f.website && 'website', f.address && 'address', f.notes && 'notes'];
    return ids.filter((x) => !!x);
}
/** Field names a parsed listing fills in, in the order the form shows them. */
function filledFields(p, hoursToNotes = true) {
    const ids = [p.name && 'name', p.phone && 'phone', p.email && 'email', p.website && 'website', p.address && 'address', p.hours && hoursToNotes && 'hours'];
    return ids.filter((f) => !!f);
}
/** What was filled in from a listing; the text that wasn't used stays one tap away, collapsed. */
function FillNote({ source, place, filled }) {
    const kt = useKitT();
    const unparsed = place.unparsed.slice(0, 8);
    return (_jsxs("div", { role: "status", className: "space-y-1 text-base text-ink-soft", children: [filled.length ? (_jsx("p", { children: capitalize(kt('contacts.filledFrom', { fields: listWords(filled), source })) })) : (_jsxs("p", { children: [kt('contacts.noBusinessDetails', { source }), source === 'screenshot' ? ` ${kt('contacts.screenshotTip')}` : ''] })), unparsed.length > 0 && (_jsxs("details", { className: "text-sm text-muted", children: [_jsx("summary", { className: "cursor-pointer select-none py-1", children: kt('contacts.showUnused') }), _jsx("ul", { className: "mt-1 list-disc pl-5", children: unparsed.map((line, i) => (_jsx("li", { className: "[overflow-wrap:anywhere]", children: line }, i))) }), place.unparsed.length > unparsed.length && _jsx("p", { children: kt('contacts.moreLines', { count: place.unparsed.length - unparsed.length }) })] }))] }));
}
/**
 * "Only admins and members": the private flag on a contact or appointment (`./roles`), with its
 * one-line explanation. Show it only to those who may set it (`can(role, 'see-private')`).
 */
export function PrivateCheckbox({ checked, onChange }) {
    const kt = useKitT();
    return (_jsxs("div", { children: [_jsx(Checkbox, { checked: checked, onChange: onChange, children: kt('contacts.onlyAdmins') }), _jsx("p", { className: "ml-9 text-sm text-muted", children: kt('contacts.helpersWontSee') })] }));
}
/** The quiet "Private" marker on a record only admins and members see. */
export function PrivateMark() {
    const kt = useKitT();
    return (_jsxs("span", { className: "inline-flex items-center gap-1 text-sm font-medium text-muted", children: [_jsx(Lock, { size: 14, "aria-hidden": "true" }), " ", kt('contacts.private')] }));
}
/**
 * One contact: role, name, edit and delete, then tap-to-call, email, website, address with a map
 * link, and notes. Leave out `onEdit` or `onDelete` where the person may not (a helper on a contact
 * someone else added).
 */
export function ContactCard({ contact: c, role, onEdit, onDelete }) {
    const kt = useKitT();
    const maps = c.mapsUrl || (c.address ? mapsSearchUrl(`${c.name}, ${c.address}`) : null);
    return (_jsxs("section", { className: `${cardClass} p-5`, "aria-label": c.name, children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: overline, children: role }), _jsx("h3", { className: "mt-0.5 text-xl font-semibold text-ink [overflow-wrap:anywhere]", children: c.name }), c.private && _jsx(PrivateMark, {})] }), onEdit && (_jsx("button", { type: "button", className: iconButton, onClick: onEdit, "aria-label": kt('contacts.editName', { name: c.name }), children: _jsx(Pencil, { size: 18 }) })), onDelete && (_jsx("button", { type: "button", className: iconButton, onClick: onDelete, "aria-label": kt('contacts.deleteName', { name: c.name }), children: _jsx(Trash2, { size: 18 }) }))] }), _jsxs("div", { className: "mt-2 flex flex-col items-start", children: [c.phone && (_jsxs("a", { className: `${linkClass} text-lg tabular-nums`, href: telHref(c.phone), "aria-label": kt('contacts.call', { name: c.name, phone: c.phone }), children: [_jsx(Phone, { size: 18, "aria-hidden": "true" }), " ", c.phone] })), c.email && (_jsxs("a", { className: `${linkClass} [overflow-wrap:anywhere]`, href: `mailto:${c.email}`, children: [_jsx(Mail, { size: 18, "aria-hidden": "true" }), " ", c.email] })), c.website && (_jsxs("a", { className: `${linkClass} [overflow-wrap:anywhere]`, href: c.website, target: "_blank", rel: "noopener noreferrer", children: [_jsx(Globe, { size: 18, "aria-hidden": "true" }), " ", displayWebsite(c.website)] }))] }), c.address && (_jsxs("div", { className: "mt-1 text-base text-ink-soft", children: [_jsxs("p", { className: "flex items-start gap-1.5", children: [_jsx(MapPin, { size: 18, className: "mt-0.5 shrink-0 text-muted", "aria-hidden": "true" }), " ", _jsx("span", { className: "[overflow-wrap:anywhere]", children: c.address })] }), maps && (_jsxs("a", { className: linkClass, href: maps, target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.openMaps')] }))] })), c.pay && _jsx(PayLines, { pay: c.pay }), c.notes && _jsx("p", { className: "mt-2 text-base whitespace-pre-line text-muted", children: c.notes })] }));
}
/** A contact's pay details on its card: "Zelle: (555) 010-2231", the portal as a link. */
export function PayLines({ pay }) {
    const kt = useKitT();
    const kinds = CONTACT_PAY_KINDS.filter((k) => pay[k]);
    if (!kinds.length)
        return null;
    return (_jsxs("div", { className: "mt-2", "aria-label": kt('contacts.pay.title'), role: "group", children: [_jsx("p", { className: overline, children: kt('contacts.pay.title') }), _jsx("ul", { className: "mt-0.5 space-y-0.5 text-base text-ink-soft", children: kinds.map((k) => k === 'portal' ? (_jsx("li", { children: _jsxs("a", { className: `${linkClass} [overflow-wrap:anywhere]`, href: pay.portal, target: "_blank", rel: "noopener noreferrer", children: [_jsx(ExternalLink, { size: 18, "aria-hidden": "true" }), " ", kt('contacts.pay.openPortal', { site: displayWebsite(pay.portal) })] }) }, k)) : (_jsx("li", { className: "[overflow-wrap:anywhere]", children: kt('contacts.pay.line', { way: kt(PAY_SHORT[k]), detail: pay[k] }) }, k))) })] }));
}
/**
 * Names one of the household's contacts on a record (who a bill is paid to, who does a job): a
 * select of `contacts` with their roles, "No one" (or `empty`) first. A contact that was removed
 * stays chosen and shows as removed, so saving doesn't drop it unseen.
 */
export function ContactSelect({ id, value, contacts, onChange, empty, roleLabel = (r) => r, label, }) {
    const kt = useKitT();
    const removed = value && !contacts.some((c) => c.id === value);
    return (_jsxs("select", { id: id, className: selectClass, value: value, onChange: (e) => onChange(e.target.value), "aria-label": label, children: [_jsx("option", { value: "", children: empty ?? kt('contacts.noOne') }), contacts.map((c) => (_jsx("option", { value: c.id, children: c.role ? kt('contacts.withRole', { name: c.name, role: roleLabel(c.role) }) : c.name }, c.id))), removed && _jsx("option", { value: value, children: kt('contacts.removedContact') })] }));
}
