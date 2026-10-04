/**
 * Email as the apps read it, without a browser: the `MailMessage` shape, a Gmail API message turned
 * into one, and email HTML turned into readable text. Shared by `./gmail` (the member's Gmail in the
 * browser) and servers that read Gmail with their own tokens (huishouden/calendar's mail checker), so
 * both see the same text. No DOM, no Firebase.
 */

/** One email. */
export interface MailMessage {
  id: string;
  /** ms since epoch. */
  date: number;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Gmail, or a stand-in for it (sample data, test fixtures). */
export interface Mailbox {
  /** Message ids matching a Gmail search, newest first. */
  search(query: string, max: number): Promise<string[]>;
  /** One message with its text and HTML parts. */
  get(id: string): Promise<MailMessage>;
  /** Sender, subject and date only (cheaper). */
  headers(id: string): Promise<Omit<MailMessage, 'text' | 'html'>>;
}

/** The parts of the Gmail API's `users.messages.get` answer that are read here. */
export interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export interface GmailApiMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
}

/** base64url (Gmail's encoding of part bodies) to UTF-8 text. */
export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(data.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** The first text/plain and text/html bodies, depth first (attachments have no inline data). */
function bodies(part: GmailPart | undefined, out: { text?: string; html?: string } = {}) {
  if (!part) return out;
  const type = (part.mimeType ?? '').toLowerCase();
  if (part.body?.data) {
    if (type === 'text/plain' && out.text === undefined) out.text = decodeBase64Url(part.body.data);
    if (type === 'text/html' && out.html === undefined) out.html = decodeBase64Url(part.body.data);
  }
  for (const p of part.parts ?? []) bodies(p, out);
  return out;
}

/** A Gmail API message as a `MailMessage`: headers, date, and the first text and HTML bodies. */
export function toMailMessage(m: GmailApiMessage): MailMessage {
  const p = m.payload;
  const date = Number(m.internalDate) || Date.parse(header(p, 'Date')) || 0;
  return { id: m.id, date, from: header(p, 'From'), subject: header(p, 'Subject'), ...bodies(p) };
}

const NAMED: Record<string, string> = {
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
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
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
export function htmlToText(html: string): string {
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
export function tidy(text: string): string {
  return text
    .replace(/[​-‍⁠﻿͏­]/g, '')
    .replace(/[ \t   ]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
