/**
 * A business's details from text the person already has: Google Maps' Share text, a listing copied
 * from Google Maps, Apple Maps or Yelp, or the OCR text of a listing screenshot. For the places
 * OpenStreetMap doesn't know (it often lacks local businesses), with no key and no billing.
 *
 * Fixed rules, no guessing: every line is either used for a field, recognised as listing chrome
 * (ratings, buttons, "Open · Closes 6 PM", distances, plus codes) and returned in `ignored`, or
 * returned in `unparsed` for the app to show next to the fields it filled in.
 */
import { readImageText } from './ocr';
// ---------------------------------------------------------------------------------------------
// Line patterns
/** Between the parts of a meta line; OCR reads Google's middle dot as a dash or plus. */
const SEP = /\s+[·⋅•∙|+\-–.]\s+|\s*[·⋅•∙]\s*/;
const STREET_TYPES = String.raw `(?:st|street|ave|av|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|trl|trail|sq|square|loop|pike|route|rte|row|crescent|cres|close|mews|broadway|plaza|plz|pt|point|xing|crossing|run|path|walk|alley|aly|expy|expressway|fwy|freeway|tpke|turnpike|grove|gardens|hill|green|park)`;
const DIRECTION = String.raw `(?:n|s|e|w|ne|nw|se|sw|north|south|east|west)\.?`;
/** "1234 Elm St", "12-B W. Oak Avenue Ste 4", "221 Baker Street". */
const US_STREET = new RegExp(String.raw `^\d{1,6}[a-z]?(?:-\d+[a-z]?)?\s+(?:${DIRECTION}\s+)?(?:[\p{L}0-9'.-]+\s+){0,5}?${STREET_TYPES}\b\.?`, 'iu');
/** "Kerkstraat 12", "Hauptstraße 5a", "Rue de Rivoli 10": European order, number after the name. */
const EU_STREET = /^[\p{L}' .-]*?(?:straat|straße|strasse|str\.|weg|laan|plein|gracht|kade|singel|dijk|gasse|platz|allee|ring|damm|ufer|markt|steeg|hof|rue|via|calle|avenida|carrer)\s+\d{1,5}\s?[a-z]?\b/iu;
const UNIT = /^(?:suite|ste\.?|unit|apt\.?|#|floor|fl\.?|building|bldg\.?)\s*[\w-]+$/i;
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const STATE_NAMES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming';
const LOCALITY = [
    // "Springfield, IL 62704", "Springfield IL 62704-1234", "Springfield, Illinois 62704"
    new RegExp(String.raw `\b(?:${US_STATES}|${STATE_NAMES})\.?,?\s+\d{5}(?:-\d{4})?\b`),
    // "Springfield, IL" at the end of a line
    new RegExp(String.raw `^[\p{Lu}][\p{L}.' -]+,\s*(?:${US_STATES})$`, 'u'),
    // Canada "Toronto, ON M5V 2T6"
    /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/,
    // UK "London NW1 6XE"
    /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/,
    // Netherlands "1017 GC Amsterdam"
    /\b\d{4}\s?[A-Z]{2}\s+[\p{Lu}][\p{L}-]+/u,
    // Germany, France, Spain, Italy: "10115 Berlin", "75001 Paris"
    /(?:^|,\s*)\d{5}\s+[\p{Lu}][\p{L}-]+(?:\s+[\p{Lu}][\p{L}-]+)?$/u,
];
/** A line ending in a state, waiting for the ZIP on the next line. */
const STATE_END = new RegExp(String.raw `\b(?:${US_STATES})$`);
const COUNTRY = /^(?:united states(?: of america)?|usa|us|canada|united kingdom|uk|great britain|netherlands|the netherlands|nederland|germany|deutschland|france|belgium|belgië|ireland|australia|new zealand)$/i;
/**
 * A map link from Google or Apple. The host must end where the pattern says it does, so
 * "maps.apple.example.com" or "google.example.com/maps" (anyone's site) is not taken for a map.
 */
const MAPS_URL = /\bhttps?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.(?:com?\.[a-z]{2}|[a-z]{2,3})\/maps|maps\.google\.(?:com?\.[a-z]{2}|[a-z]{2,3})|maps\.apple\.com|maps\.apple|g\.co\/kgs|share\.google)(?=[/?#\s]|$)\S*/i;
const ANY_URL = /\bhttps?:\/\/\S+/i;
const LISTING_URL = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:yelp\.[a-z.]+|google\.[a-z.]+\/search|tripadvisor\.[a-z.]+|facebook\.com\/(?:pages|profile)|search\.google\.com)/i;
const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d+)?(?:[/?#]\S*)?$/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i;
/** US numbers: "(217) 555-0142", "217.555.0142", "+1 217-555-0142". */
const US_PHONE = /(?<![\d+])(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\d)|(?<![\d+])\(\d{3}\)\s?\d{3}\d{4}(?!\d)|(?<![\d+-])[2-9]\d{2}[2-9]\d{6}(?![\d-])/;
/** Anything with a country code: "+31 20 123 4567", "+44 (0)20 7946 0958". */
const INTL_PHONE = /\+\d{1,3}(?:[\s.-]?\(?\d{1,5}\)?){2,6}(?!\d)/;
const DAY = String.raw `(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\.?`;
const CLOSED = String.raw `(?:closed|gesloten|geschlossen)`;
const TIME = String.raw `(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|noon|midnight)`;
const TIME_RANGE = new RegExp(String.raw `^${TIME}\s*(?:[-–—]|to)\s*${TIME}(?:\s*,\s*${TIME}\s*(?:[-–—]|to)\s*${TIME})*$`, 'i');
const HOURS_LINE = new RegExp(String.raw `^${DAY}(?:\s*(?:[-–—]|to|,|&)\s*${DAY})*\s*:?\s*(?:${TIME}\s*(?:[-–—]|to)\s*${TIME}(?:\s*,\s*${TIME}\s*(?:[-–—]|to)\s*${TIME})*|${CLOSED}|open 24 hours|24 hours|by appointment(?: only)?)(?:\s*\(.*\))?$`, 'i');
const DAY_ONLY = new RegExp(String.raw `^${DAY}(?:\s*(?:[-–—]|to)\s*${DAY})?$`, 'i');
const STATUS = /^(?:open(?: now)?|closed(?: now)?|clos(?:es|ing) soon|opens? soon|open 24 hours|hours(?: might differ)?)(?:\s*[·⋅•∙:-]?\s*(?:(?:closes|opens|reopens|until)\b.*|\d.*|[⌄v˅∨]))?\s*[⌄˅∨]?$/i;
const SHUT = /^(?:temporarily|permanently) closed$/i;
/** "4.6", "4.6 ★★★★★ (512)", "4.5 (128 reviews)"; OCR turns stars into a few stray characters. */
function isRating(s) {
    // OCR reads stars as "kkkkk", "**x**" or "Ye te te", before or after the number.
    const stars = /^(?:[kKxX*★☆✩✭⭐+.]+\s*)+(?=\d)/;
    // "4.6 Yedkdkkk (512)": one word of star noise between the rating and the count.
    if (/^\d[.,]\d\s+\S{1,14}\s*\(\d[\d,.]*k?\)$/i.test(s))
        return true;
    const m = /^(?:rated\s+)?\d[.,]\d(?!\d)(.*)$/i.exec(s.replace(stars, ''));
    if (!m)
        return false;
    const rest = m[1].replace(/(?:^|\s)[kKxX*★☆✩✭⭐]+(?=\s|$)/g, ' ').replace(/\(?\s*\d[\d,.]*\s*k?\s*(?:google\s+)?(?:reviews?|ratings?)?\s*\)?/gi, ' ').replace(/\b(?:out of 5|stars?|reviews?|ratings?|google)\b/gi, ' ');
    return rest.length <= 20 && !/\p{L}{4}/u.test(rest);
}
const REVIEW_COUNT = /^(?:\d(?:\.\d)? star rating|\(\d[\d,.]*k?\)|\d[\d,.]*k?\s+(?:google\s+)?(?:reviews?|ratings?)|no reviews(?: yet)?|\(?\d[\d,.]*k?\s+reviews?\)?)$/i;
const DISTANCE = /^(?:\d+(?:[.,]\d+)?\s*(?:mi|miles?|km|ft|m|min|%)|\$+|\$\d+[-–]\d+|€+|£+)$/i;
const PLUS_CODE = /^(?:plus code:?\s*)?[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
/** The phone's clock and signal at the top of a screenshot: "9:41 al = @)". */
const isStatusBar = (s) => /^\d{1,2}:\d{2}(?!\s*[-–]|\s*[ap]\.?m)/i.test(s) && !/\p{L}{4}/u.test(s.replace(/\bwifi\b/gi, '')) && s.length <= 30;
/** Buttons, tabs and headings on Google Maps, Apple Maps and Yelp listings. */
const CHROME_PHRASES = [
    'directions', 'get directions', 'start', 'call', 'website', 'business website', 'save', 'saved', 'share', 'nearby', 'send to phone',
    'send to your phone', 'overview', 'reviews', 'review', 'about', 'photos', 'photo', 'menu', 'updates', 'order online', 'book online', 'book',
    'reserve', 'reserve a table', 'more', 'tickets', 'claimed', 'unclaimed', 'write a review', 'add photo', 'add photos', 'add a photo', 'edit',
    'suggest an edit', 'suggest edits', 'claim this business', 'own this business', 'see hours', 'see all hours', 'ask a question',
    'ask the community', 'follow', 'check in', 'sponsored', 'ad', 'back', 'search here', 'search', 'view all', 'see all', 'more info',
    'people also search for', 'popular times', 'questions answers', 'questions and answers', 'reviews summary', 'sort', 'newest', 'highest',
    'lowest', 'rate and review', 'add a label', 'your maps activity', 'report a problem', 'from the business', 'phone', 'phone number',
    'address', 'hours', 'location hours', 'location and hours', 'amenities and more', 'about the business', 'recommended reviews', 'contact',
    'details', 'info', 'general info', 'map', 'satellite', 'explore', 'go', 'you', 'contribute', 'list', 'learn more', 'add', 'guide',
    'directions start', 'related', 'similar', 'useful', 'funny', 'cool', 'like', 'reply', 'translate', 'more reviews', 'see more', 'show more',
    'all', 'appointments', 'open in maps', 'open in google maps', 'apple maps', 'google maps', 'yelp', 'request a quote', 'message the business',
    'verified', 'verified license', 'highlights', 'services', 'products', 'q a', 'web results', 'x', 'q', 'open',
    'ratings', 'distance', 'report an issue', 'report issue', 'suggest new hours', 'add missing information', "add place's hours",
    'google reviews', 'view all google reviews', 'view more', 'all questions', 'read more', 'see all photos', 'all photos',
    'usually not too busy', 'usually a little busy', 'usually as busy as it gets', 'busier than usual', 'live', 'popular services',
    'edit business info', 'hours updated', 'months ago', 'days ago', 'weeks ago', 'ago',
];
// Matched without one-letter words, which OCR also makes out of icons.
/** Words of a line as chrome is matched: lowercase, no punctuation, no one-letter words or bare numbers ("View 10+ more"). */
const chromeTokens = (line) => line.toLowerCase().replace(/&/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1 && !/^\d+$/.test(t));
const CHROME = new Set(CHROME_PHRASES.map((p) => chromeTokens(p).join(' ')));
const CHROME_LONGEST = Math.max(...[...CHROME].map((p) => p.split(' ').length));
/** Labels in front of a value: "Phone: …", "Call (217) …", "Business website example.com". */
const LABEL = /^(?:phone(?: number)?|tel(?:ephone)?|call|address|located at|website|business website|site|web|email|e-?mail|hours|opening hours|maps?|directions(?: to)?)\b\s*[:\-–]?\s*/i;
/** Values the listing labels as something other than the business's website. */
const SIDE_LINK = /^(?:appointments?|menu|order|reservations?|booking|book online|products|services)\s*[:\-–]\s*/i;
/** Google's kinds of business, for telling a category line from a name. Common household ones. */
const CATEGORY_WORDS = /\b(?:veterinarians?|animal hospital|pet groomer|groomers?|pet (?:store|supply store|boarding service|sitter|trainer)|dog (?:trainer|day care center|park)|kennel|pediatricians?|doctors?|physicians?|dentists?|dental clinic|orthodontist|optometrist|pharmacy|drug ?store|urgent care center|hospital|medical clinic|clinic|auto repair shop|mechanic|car (?:dealer|wash|repair and maintenance service)|tire shop|oil change service|auto body shop|hardware store|home improvement store|grocery store|supermarket|restaurant|cafe|coffee shop|bakery|dry cleaner|laundromat|tailor|hair salon|barber shop|nail salon|plumber|electrician|hvac contractor|roofing contractor|landscaper|lawn care service|cleaning service|house cleaning service|pest control service|locksmith|daycare|child care agency|preschool|school|library|post office|bank|atm|insurance agency|real estate agency|gym|auto repair|oil change|repair|cleaning|laundry|alterations|grooming|child care|day ?care|(?:store|shop|service|contractor|agency|center|centre|station)s?)\b/i;
// ---------------------------------------------------------------------------------------------
// Helpers
/** OCR reads icons in front of a value as stray characters: "© 1234 Elm St", "& (217) 555-0142". */
const stripJunk = (s) => s.replace(/^[^\p{L}\p{N}(+"“'#$€£]+/u, '').replace(/[^\p{L}\p{N}).!?'"”’#&$€£%\]/]+$/u, '').trim();
const words = (s) => s.split(/\s+/).filter(Boolean);
function isChrome(line) {
    // Single letters are icons OCR'd as text ("a Directions o Call"); a line with a number in it is data.
    if (/\d{3}/.test(line))
        return false;
    const tokens = chromeTokens(line);
    if (!tokens.length)
        return false;
    let i = 0;
    while (i < tokens.length) {
        let matched = 0;
        for (let n = Math.min(CHROME_LONGEST, tokens.length - i); n > 0; n--) {
            if (CHROME.has(tokens.slice(i, i + n).join(' '))) {
                matched = n;
                break;
            }
        }
        if (!matched)
            return false;
        i += matched;
    }
    return true;
}
/** True for a line too broken to mean anything: no word of three letters. */
const isNoise = (line) => !/\p{L}{3}|\d{2}/u.test(line);
function findPhone(line) {
    // OCR mixes up O/0 and l/1 inside numbers; only fix a line that is mostly digits already.
    const digits = line.replace(/\D/g, '').length;
    const fixed = digits >= 7 && digits >= line.replace(/[^\p{L}]/gu, '').length ? line.replace(/[Oo](?=[\dOolI|\s)-]|$)/g, '0').replace(/[lI|](?=[\dOolI|\s)-]|$)/g, '1').replace(/(?<=\d)[Oo]/g, '0').replace(/(?<=\d)[lI|]/g, '1') : line;
    for (const re of [INTL_PHONE, US_PHONE]) {
        const m = re.exec(fixed);
        if (!m)
            continue;
        const n = m[0].replace(/\D/g, '').length;
        if (n < 7 || n > 15)
            continue;
        return { phone: m[0].trim(), rest: (fixed.slice(0, m.index) + ' ' + fixed.slice(m.index + m[0].length)).trim() };
    }
    return null;
}
/** OCR misreads of a domain's ending: ".corn" for ".com". */
const fixDomain = (s) => s.replace(/\.c[o0]rn\b/i, '.com').replace(/\.c0m\b/i, '.com').replace(/\.0rg\b/i, '.org').replace(/\s+\.\s*/g, '.').replace(/,(?=com\b|org\b|net\b)/i, '.');
function asWebsite(line) {
    const t = fixDomain(line.trim().replace(/[.,;]$/, ''));
    if (!DOMAIN.test(t) || EMAIL.test(t))
        return null;
    // "St.Louis" or "4.6" are not domains: the ending must look like one.
    if (!/\.(?:[a-z]{2,24})(?:[:/?#]|$)/i.test(t.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] + '/'))
        return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function isStreet(s) {
    return US_STREET.test(s) || EU_STREET.test(s) || /^(?:p\.?\s?o\.?\s+box|po box)\s+\d+/i.test(s);
}
function isLocality(s) {
    return LOCALITY.some((re) => re.test(s));
}
/** A whole address on one line, or the start of one. */
function addressKind(s) {
    const street = isStreet(s);
    const locality = isLocality(s);
    if (street && locality)
        return 'full';
    if (street)
        return words(s).length <= 12 ? 'street' : null;
    if (locality)
        return words(s).length <= 8 ? 'locality' : null;
    return null;
}
/** "Maple Grove Animal Hospital, 1234 Elm St, Springfield, IL 62704" → name and address. */
function splitNameAddress(line) {
    const parts = line.split(/\s*,\s*|\s+[-–—|·⋅•]\s+/);
    for (let i = 0; i < parts.length; i++) {
        if (!isStreet(parts[i]))
            continue;
        const rest = line.slice(line.indexOf(parts[i]));
        if (i === 0)
            return { address: rest };
        const name = line.slice(0, line.indexOf(parts[i])).replace(/[\s,\-–—|·⋅•]+$/, '').trim();
        return { name: name || undefined, address: rest };
    }
    return null;
}
const isSentence = (s) => /^["“'‘]/.test(s) || (words(s).length >= 6 && /[.!?…"”]$/.test(s)) || words(s).length > 12;
/** A name from a Google Maps place URL ("/maps/place/Maple+Grove+Animal+Hospital/@…") or Apple Maps `q=`. */
function nameFromMapsUrl(url) {
    const place = /\/maps\/place\/([^/@?]+)/.exec(url);
    const q = /[?&](?:q|name)=([^&]+)/.exec(url);
    const raw = place?.[1] ?? (url.includes('apple') ? q?.[1] : undefined);
    if (!raw)
        return undefined;
    try {
        const name = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
        return /\p{L}{2}/u.test(name) && !/^-?\d/.test(name) ? name : undefined;
    }
    catch {
        return undefined;
    }
}
/** "MAPLE GROVE ANIMAL HOSPITAL - Updated 2026 - … - Yelp" or "… - Google Maps" → the name part. */
const stripTitleSuffix = (s) => s
    // A search box's icons around the name: "Q Example Vet X", "Example Vet (X)".
    .replace(/^(?:[Qq«<←]|e)\s+(?=\S)/, '')
    .replace(/\s+(?:[xX×]|\(\s*[xX×]\s*\)|\[\s*[xX×]\s*\])$/, '')
    .replace(/\s+[-–|]\s+(?:updated \d{4}|\d+ photos|google maps|yelp|apple maps)\b.*$/i, '').replace(/\s+[-–|]\s+(?:google maps|yelp|apple maps)$/i, '').trim();
function classify(raw) {
    const out = [];
    let text = raw.replace(/\s+/g, ' ').trim();
    // Links anywhere on the line: "Maple Grove Animal Hospital https://maps.app.goo.gl/…".
    for (let m = MAPS_URL.exec(text); m; m = MAPS_URL.exec(text)) {
        out.push({ text: m[0], kind: 'maps', value: m[0].replace(/[).,;]+$/, '') });
        text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
    }
    // An email inside a sentence ("Email us at hello@example.com"): the address is used, the sentence shown.
    const email = EMAIL.exec(text);
    if (email && text.replace(email[0], '').replace(LABEL, '').trim().length > 2)
        out.push({ text: email[0], kind: 'email', value: email[0] });
    const url = ANY_URL.exec(text);
    if (url && text.replace(url[0], '').trim()) {
        out.push(...classify(url[0]));
        text = text.replace(url[0], ' ').trim();
    }
    // A Yelp page title: "NAME - Updated 2026 - 34 Photos & 128 Reviews - 1234 Elm St, Springfield, Illinois - Veterinarians - … - Yelp".
    if (/\s-\s(?:updated \d{4}|\d+ photos)\b/i.test(text)) {
        const [name, ...rest] = text.split(/\s+-\s+/);
        out.push(...classify(name));
        for (const seg of rest)
            out.push(isStreet(seg) ? { text: seg, kind: 'address', value: seg, part: isLocality(seg) ? 'full' : 'street' } : { text: seg, kind: 'chrome' });
        return out;
    }
    text = text.replace(/^(?:check out|see)\s+/i, '').replace(/\s*(?:on|in) (?:google maps|apple maps)[:.]?$/i, '').replace(/[:\-–]\s*$/, '').trim();
    if (!text)
        return out;
    // An icon OCR'd as a letter in front of a street: "Q 76 Sunrise Ave, Clearwater, FL 33755".
    const lead = /^\S{1,2}\s+(\d.*)$/.exec(text);
    if (lead && isStreet(lead[1]) && (!isStreet(text) || /^\d{1,2}\s+\d{2,}\s/.test(text)))
        text = lead[1];
    // ...or in front of a quoted review: '2 "Great vet."'.
    text = text.replace(/^\S{1,2}\s+(?=["“])/, '');
    const line = classifyText(text);
    if (line)
        return [...out, line];
    // An icon OCR'd as a letter or two in front of the value: "Q 1234 Elm St", "e maplegrove.example.com".
    const first = /^(\S{1,2})\s+(.+)$/.exec(text);
    if (first) {
        const retry = classifyText(first[2]);
        if (retry && retry.kind !== 'text' && retry.kind !== 'other' && retry.kind !== 'category')
            return [...out, { ...retry, text }];
    }
    return [...out, { text: stripJunk(text) || text, kind: classifyFallback(text) }];
}
function classifyFallback(text) {
    if (isNoise(text) || isChrome(text))
        return 'chrome';
    return isSentence(text) ? 'other' : 'text';
}
/** One line's meaning, or null when it is plain text (a name, a category, a review). */
function classifyText(input) {
    const text = stripJunk(input);
    if (!text)
        return { text: input, kind: 'chrome' };
    if (SHUT.test(text))
        return { text, kind: 'shut' };
    if (isStatusBar(text))
        return { text, kind: 'chrome' };
    if (isRating(text) || REVIEW_COUNT.test(text) || DISTANCE.test(text))
        return { text, kind: 'chrome', anchor: true };
    if (PLUS_CODE.test(text) || COUNTRY.test(text))
        return { text, kind: 'chrome' };
    if (STATUS.test(text) || isChrome(text))
        return { text, kind: 'chrome' };
    const side = SIDE_LINK.exec(text);
    if (side)
        return { text, kind: 'other' };
    const value = text.replace(LABEL, '');
    if (value !== text) {
        // "Phone: (217) 555-0142", "Hours: Open ⋅ Closes 5 PM": the value decides; a label on plain text is not a name.
        const inner = value ? classifyText(value) : { text, kind: 'chrome' };
        return inner && inner.kind !== 'text' && inner.kind !== 'category' ? { ...inner, text } : { text, kind: 'other', value };
    }
    const email = EMAIL.exec(value);
    if (email && value.replace(email[0], '').trim().length <= 2)
        return { text, kind: 'email', value: email[0] };
    if (LISTING_URL.test(value))
        return { text, kind: 'chrome' };
    const site = asWebsite(value);
    if (site)
        return { text, kind: 'website', value: site };
    if (HOURS_LINE.test(value) || TIME_RANGE.test(value) || DAY_ONLY.test(value))
        return { text, kind: 'hours', value };
    const address = addressKind(value);
    if (address)
        return { text, kind: 'address', value, part: address };
    if (UNIT.test(value))
        return { text, kind: 'address', value, part: 'unit' };
    if (/^\d{5}(?:-\d{4})?$/.test(value))
        return { text, kind: 'address', value, part: 'zip' };
    const split = splitNameAddress(value);
    if (split)
        return { text, kind: 'address', value: split.address, part: isLocality(split.address) ? 'full' : 'street', name: split.name };
    const phone = findPhone(value);
    if (phone) {
        const rest = stripJunk(phone.rest.replace(LABEL, ''));
        if (!rest || isChrome(rest) || isNoise(rest))
            return { text, kind: 'phone', value: phone.phone };
    }
    // A meta line under the name: "Veterinarian · 2.3 mi", "4.6 ★★★★★ (512) · Animal hospital",
    // "$$ · Veterinarians, Pet Groomers", "Veterinarian · Springfield" (a kind of business and a town).
    const parts = value.split(SEP).map(stripJunk).filter(Boolean);
    if (parts.length > 1) {
        const kinds = parts.map((p) => {
            const c = classifyText(p);
            if (c && (c.kind === 'chrome' || c.kind === 'hours'))
                return 'chrome';
            if (c)
                return 'other';
            if (CATEGORY_WORDS.test(p) && words(p).length <= 8)
                return 'category';
            return words(p).length <= 3 && !/\d/.test(p) ? 'town' : 'other';
        });
        if (!kinds.includes('other') && kinds.some((k) => k !== 'town')) {
            const category = parts[kinds.indexOf('category')];
            return { text, kind: category ? 'category' : 'chrome', value: category, anchor: true };
        }
    }
    return null;
}
const samePhone = (a, b) => a.replace(/\D/g, '').slice(-10) === b.replace(/\D/g, '').slice(-10);
const sameSite = (a, b) => a.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '').toLowerCase() === b.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '').toLowerCase();
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/**
 * Name, address, phone, website, map link and hours from listing text: Google Maps' Share text
 * (name, address, maps.app.goo.gl link), a listing copied from Google Maps, Apple Maps or Yelp, or
 * the OCR text of a listing screenshot. Lines it can't place come back in `unparsed`.
 */
export function parsePlaceText(text) {
    const result = { confidence: 0, unparsed: [], ignored: [] };
    const lines = [];
    for (const raw of text.replace(/\r/g, '').split(/\n|\t{2,}/)) {
        if (raw.trim())
            lines.push(...classify(raw.trim()));
    }
    // Below "People also search for" are other businesses: none of it describes this one.
    const others = lines.findIndex((l) => /^(?:people also search for|you might also consider|similar (?:businesses|places)|related places|nearby places|more places)$/i.test(stripJunk(l.text)));
    if (others >= 0)
        for (const l of lines.splice(others))
            result.ignored.push(l.text);
    const used = new Set();
    const take = (l) => used.add(l);
    const extra = (l) => {
        result.unparsed.push(l.text);
        used.add(l);
    };
    // Map link, phone, email and website: the first of each; a different second one is shown, not dropped.
    for (const l of lines) {
        if (l.kind === 'maps') {
            if (!result.mapsUrl)
                result.mapsUrl = l.value;
            else if (result.mapsUrl !== l.value)
                extra(l);
            take(l);
        }
        else if (l.kind === 'phone') {
            if (!result.phone)
                result.phone = l.value;
            else if (!samePhone(result.phone, l.value))
                extra(l);
            take(l);
        }
        else if (l.kind === 'website') {
            if (!result.website)
                result.website = l.value;
            else if (!sameSite(result.website, l.value))
                extra(l);
            take(l);
        }
        else if (l.kind === 'email') {
            if (!result.email)
                result.email = l.value;
            else if (result.email.toLowerCase() !== l.value.toLowerCase())
                extra(l);
            take(l);
        }
    }
    // Address: a full line, or a street line joined with the unit and town lines right after it.
    let nameFromAddress;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.kind !== 'address' || used.has(l))
            continue;
        const group = [l];
        if (l.part === 'street' && lines[i + 1]?.part === 'zip' && STATE_END.test(l.value))
            group.push(lines[i + 1]);
        else if (l.part === 'street' || l.part === 'unit') {
            for (let j = i + 1; j < lines.length && lines[j].kind === 'address' && lines[j].part !== 'full'; j++) {
                if (lines[j].part === 'street' && group.some((g) => g.part === 'street'))
                    break;
                if (lines[j].part === 'zip' && !STATE_END.test(group[group.length - 1].value))
                    break;
                group.push(lines[j]);
                if (lines[j].part === 'locality' || lines[j].part === 'zip') {
                    // A ZIP that wrapped onto its own line: "Rockford, IL" then "61107".
                    if (lines[j].part === 'locality' && lines[j + 1]?.part === 'zip' && STATE_END.test(lines[j].value))
                        group.push(lines[++j]);
                    break;
                }
            }
        }
        // A town line alone counts only when nothing better turns up.
        if (group.length === 1 && l.part === 'locality' && lines.some((o) => o !== l && o.kind === 'address' && o.part !== 'locality' && !used.has(o)))
            continue;
        if (group.length === 1 && (l.part === 'unit' || l.part === 'zip'))
            continue;
        const address = group
            .map((g) => g.value.replace(/,\s*$/, ''))
            .join(', ')
            .replace(/,\s*(\d{5}(?:-\d{4})?)$/, ' $1')
            .replace(/,\s*(?:united states(?: of america)?|usa|united kingdom|uk|canada|netherlands|nederland|germany|deutschland)$/i, '');
        group.forEach(take);
        if (!result.address) {
            result.address = address;
            nameFromAddress = l.name;
        }
        else if (norm(result.address) !== norm(address) && !norm(result.address).includes(norm(address)))
            group.forEach((g) => result.unparsed.push(g.text));
    }
    // Hours: day lines, with a time line that follows a bare day ("Mon" then "8:00 AM - 6:00 PM").
    const hours = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.kind !== 'hours' || used.has(l))
            continue;
        take(l);
        if (DAY_ONLY.test(l.value)) {
            const next = lines[i + 1];
            if (next?.kind === 'hours' && !DAY_ONLY.test(next.value) && !HOURS_LINE.test(next.value)) {
                hours.push(`${l.value} ${next.value}`);
                take(next);
                i++;
            }
            else if (new RegExp(`^${CLOSED}$`, 'i').test(next?.text ?? '')) {
                hours.push(`${l.value} ${next.text}`);
                take(next);
                i++;
            }
            else
                result.unparsed.push(l.text);
        }
        else if (HOURS_LINE.test(l.value))
            hours.push(l.value);
        else
            result.unparsed.push(l.text);
    }
    if (hours.length)
        result.hours = hours.join('; ');
    // Name: the line right above the rating when Google's layout shows one (a search box or app bar
    // can sit above it); otherwise the first plain line. Then a short line under it is the category.
    const candidates = lines.filter((l) => l.kind === 'text' && !used.has(l));
    const plausible = (l) => {
        const t = stripTitleSuffix(stripJunk(l.value ?? l.text));
        return t.length >= 2 && t.length <= 100 && words(t).length <= 10 && /\p{L}{2}/u.test(t);
    };
    let nameLine;
    const anchor = lines.findIndex((l) => l.anchor);
    if (anchor > 0)
        nameLine = lines.slice(0, anchor).reverse().find((l) => candidates.includes(l) && plausible(l));
    nameLine ??= candidates.find((l) => plausible(l) && /\p{Lu}|\d/u.test(l.text)) ?? candidates.find(plausible);
    if (nameFromAddress && (!nameLine || lines.indexOf(nameLine) > lines.findIndex((l) => l.name === nameFromAddress))) {
        result.name = nameFromAddress;
        nameLine = undefined;
    }
    else if (nameLine) {
        // "Veterinarian · 1234 Elm St" under the name: the part before the address is not dropped silently.
        if (nameFromAddress)
            result.unparsed.push(nameFromAddress);
        result.name = stripTitleSuffix(stripJunk(nameLine.value ?? nameLine.text));
        take(nameLine);
    }
    const urlName = result.mapsUrl ? nameFromMapsUrl(result.mapsUrl) : undefined;
    const shared = (a, b) => norm(a).split(' ').some((w) => w.length >= 3 && norm(b).split(' ').includes(w));
    if (urlName && result.name && !shared(result.name, urlName) && nameLine) {
        // "Here's the groomer I mentioned https://www.google.com/maps/place/Example+Grooming/…": the link names the place.
        result.unparsed.push(nameLine.text);
        result.name = urlName;
        nameLine = undefined;
    }
    if (!result.name && urlName)
        result.name = urlName;
    const start = nameLine ? lines.indexOf(nameLine) : -1;
    const firstField = lines.findIndex((l, i) => i > start && ['phone', 'website', 'address', 'hours'].includes(l.kind));
    const bare = (s) => norm(s).replace(/^\S\s+|\s+\S$/g, '');
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (used.has(l))
            continue;
        if (l.kind === 'category') {
            result.category ??= l.value;
            result.ignored.push(l.text);
            continue;
        }
        if (l.kind === 'text' && result.name && bare(l.value ?? l.text) && norm(result.name).includes(bare(l.value ?? l.text))) {
            result.ignored.push(l.text); // the search box or app bar repeating the name
            continue;
        }
        // Google lists the kind of business under the name: "Veterinarian", "Dentist in Brookfield, Wisconsin".
        const t = stripJunk(l.text);
        if (l.kind === 'text' && !result.category && start >= 0 && i > start && (firstField < 0 || i < firstField) && words(t).length <= 6 && !/\d/.test(t) && CATEGORY_WORDS.test(t)) {
            result.category = t.replace(/\s+in\s+.+$/i, '');
            result.ignored.push(l.text);
            continue;
        }
        if (l.kind === 'chrome')
            result.ignored.push(l.text);
        else
            result.unparsed.push(l.text);
    }
    result.confidence = Math.round(((result.name ? 0.4 : 0) + (result.address ? 0.25 : 0) + (result.phone ? 0.2 : 0) + (result.website || result.mapsUrl ? 0.15 : 0)) * 100) / 100;
    return result;
}
/**
 * A business's details from a screenshot of its Google Maps (or Apple Maps, Yelp) listing: the
 * text is read on the device (`./ocr`, tesseract.js, nothing uploaded) and parsed with
 * `parsePlaceText`. The engine is downloaded on first use only.
 */
export async function readPlaceScreenshot(image, options = {}) {
    const text = await readImageText(image, { ...options, screenshot: true });
    return { ...parsePlaceText(text), text };
}
/**
 * The query parameters `pwaApp({ shareTarget: true })` asks the browser to launch the app with.
 * GET share targets replace the action URL's query, so the marker is in the names, not `?share=1`.
 */
export const SHARE_PARAMS = { title: 'share_title', text: 'share_text', url: 'share_url' };
/**
 * The place shared into the app from another app's Share menu (Google Maps → Share → this app),
 * or null when the app was opened normally. Pass `location` (or a URL); after opening the dialog,
 * `clearSharedPlace()` takes the parameters off the address so a reload doesn't share again.
 * Also reads `?share=1&title=&text=&url=` for links made by hand.
 */
export function readSharedPlace(location) {
    const search = typeof location === 'string' ? new URL(location, 'https://app.invalid').search : location.search;
    const q = new URLSearchParams(search);
    const plain = q.get('share') === '1';
    const get = (key) => (q.get(SHARE_PARAMS[key]) ?? (plain ? q.get(key) : null))?.trim() || undefined;
    const shared = { title: get('title'), text: get('text'), url: get('url') };
    if (!shared.title && !shared.text && !shared.url)
        return null;
    // Apps put the name in the title, details in the text, and the link in either.
    const body = [shared.title, shared.text, shared.url].filter(Boolean).join('\n');
    return { ...shared, place: parsePlaceText(body) };
}
/** Takes the share parameters off the address bar without reloading. */
export function clearSharedPlace() {
    if (typeof window === 'undefined')
        return;
    const url = new URL(window.location.href);
    const plain = url.searchParams.get('share') === '1' ? ['share', 'title', 'text', 'url'] : [];
    for (const key of [...Object.values(SHARE_PARAMS), ...plain])
        url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
