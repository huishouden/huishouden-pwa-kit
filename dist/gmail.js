import { googleAccessMessage, popupBlocked, popupCancelled } from './feedback';
import { cachedGoogleToken, forgetGoogleToken, googleAccessToken } from './google-token';
import { kt } from './i18n.js';
/**
 * Read-only Gmail for the signed-in member, in the browser: search, read a message's text and HTML,
 * and turn email HTML into readable text. For apps that read the household's own statement and
 * alert emails (Bills, Spending) with the member's consent; nothing leaves the browser.
 *
 * Google asks once, in a window opened from a tap (`./google-token`); the token is kept in
 * localStorage until it ends, so reopening the app can check again without another window. Nothing
 * ever asks without a tap: `storedGmailToken` never opens a window, `requestGmailToken` does.
 */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** A read-only token that is still valid, without asking anyone; null when Google must be asked. */
export function storedGmailToken(auth) {
    if (typeof window !== 'undefined' && window.__gmailTestToken)
        return window.__gmailTestToken;
    return cachedGoogleToken(auth, [GMAIL_READONLY_SCOPE]);
}
/** Asks Google for read-only Gmail access (or reuses the hour's token). Call from a tap. */
export function requestGmailToken(auth) {
    if (typeof window !== 'undefined' && window.__gmailTestToken)
        return Promise.resolve(window.__gmailTestToken);
    return googleAccessToken(auth, [GMAIL_READONLY_SCOPE], { persist: true, deniedMessage: kt('gmail.denied') });
}
export class GmailError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'GmailError';
    }
}
async function call(token, path, params, onUnauthorized) {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries(params))
        for (const one of Array.isArray(v) ? v : [v])
            url.searchParams.append(k, one);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401)
        onUnauthorized();
    if (!res.ok) {
        const body = (await res.json().catch(() => ({})));
        throw new GmailError(res.status === 401 ? kt('gmail.ended') : kt('gmail.answered', { status: String(res.status), message: body.error?.message ?? res.statusText }), res.status);
    }
    return (await res.json());
}
/**
 * The member's Gmail through the REST API with a read-only token. A 401 (access revoked or
 * expired) forgets the token, so the next `requestGmailToken` asks Google again.
 */
export function gmailMailbox(token) {
    const forget = () => forgetGoogleToken(token);
    return {
        async search(q, max) {
            const r = await call(token, 'messages', { q, maxResults: String(max) }, forget);
            return (r.messages ?? []).map((m) => m.id);
        },
        async get(id) {
            return toMailMessage(await call(token, `messages/${encodeURIComponent(id)}`, { format: 'full' }, forget));
        },
        async headers(id) {
            const m = toMailMessage(await call(token, `messages/${encodeURIComponent(id)}`, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }, forget));
            return { id: m.id, date: m.date, from: m.from, subject: m.subject };
        },
    };
}
/** Plain words for a failed Gmail check. */
export function gmailError(e) {
    if (popupCancelled(e))
        return kt('gmail.notConnected');
    if (popupBlocked(e))
        return kt('gmail.popupBlocked');
    const access = googleAccessMessage(e, 'Gmail');
    if (access)
        return access;
    if (e instanceof GmailError)
        return e.message;
    if (e instanceof TypeError)
        return kt('gmail.unreachable');
    return e?.message || kt('gmail.couldNotCheck');
}
/** base64url (Gmail's encoding of part bodies) to UTF-8 text. */
export function decodeBase64Url(data) {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(data.length / 4) * 4, '=');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
export function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes)
        binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function header(part, name) {
    return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}
/** The first text/plain and text/html bodies, depth first (attachments have no inline data). */
function bodies(part, out = {}) {
    if (!part)
        return out;
    const type = (part.mimeType ?? '').toLowerCase();
    if (part.body?.data) {
        if (type === 'text/plain' && out.text === undefined)
            out.text = decodeBase64Url(part.body.data);
        if (type === 'text/html' && out.html === undefined)
            out.html = decodeBase64Url(part.body.data);
    }
    for (const p of part.parts ?? [])
        bodies(p, out);
    return out;
}
/** A Gmail API message as a `MailMessage`: headers, date, and the first text and HTML bodies. */
export function toMailMessage(m) {
    const p = m.payload;
    const date = Number(m.internalDate) || Date.parse(header(p, 'Date')) || 0;
    return { id: m.id, date, from: header(p, 'From'), subject: header(p, 'Subject'), ...bodies(p) };
}
const NAMED = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    dollar: '$',
    ndash: '–',
    mdash: '—',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    hellip: '…',
    bull: '•',
    middot: '·',
    copy: '©',
    reg: '®',
    trade: '™',
    zwnj: '',
    zwj: '',
    shy: '',
};
/** Named and numeric HTML entities to their characters; unknown ones are left as written. */
export function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
        if (name[0] === '#') {
            const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
        }
        return NAMED[name.toLowerCase()] ?? whole;
    });
}
/**
 * Readable text from an email's HTML: block ends become line breaks, table cells become spaces (so
 * "Amount due" and "$120.00" in neighbouring cells read as one line), entities are decoded and the
 * invisible padding characters email builders put in preheaders are removed.
 */
export function htmlToText(html) {
    const s = html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|ul|ol|h[1-6]|table|section|header|footer|center|blockquote)\s*>/gi, '\n')
        .replace(/<\/(td|th|span|a|b|strong|em|i|font)\s*>/gi, (m) => (/t[dh]/i.test(m) ? ' ' : ''))
        .replace(/<[^>]+>/g, ' ');
    return tidy(decodeEntities(s));
}
/** Collapses spaces, drops zero-width characters, keeps single line breaks. */
export function tidy(text) {
    return text
        .replace(/[​-‍⁠﻿͏­]/g, '')
        .replace(/[ \t   ]+/g, ' ')
        .replace(/ *\r?\n */g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}
