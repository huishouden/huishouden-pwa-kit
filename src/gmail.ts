import type { Auth } from 'firebase/auth';
import { googleAccessMessage, popupBlocked, popupCancelled } from './feedback';
import { cachedGoogleToken, forgetGoogleToken, googleAccessToken } from './google-token';
import { kt } from './i18n.js';
import { toMailMessage, type GmailApiMessage, type Mailbox } from './mail-core';

export { decodeBase64Url, decodeEntities, encodeBase64Url, htmlToText, tidy, toMailMessage, type GmailApiMessage, type GmailPart, type Mailbox, type MailMessage } from './mail-core';

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

declare global {
  interface Window {
    /** Browser tests set this to use a stubbed Gmail API (page.route) without a Google account. */
    __gmailTestToken?: string;
  }
}

/** A read-only token that is still valid, without asking anyone; null when Google must be asked. */
export function storedGmailToken(auth: Auth): string | null {
  if (typeof window !== 'undefined' && window.__gmailTestToken) return window.__gmailTestToken;
  return cachedGoogleToken(auth, [GMAIL_READONLY_SCOPE]);
}

/** Asks Google for read-only Gmail access (or reuses the hour's token). Call from a tap. */
export function requestGmailToken(auth: Auth): Promise<string> {
  if (typeof window !== 'undefined' && window.__gmailTestToken) return Promise.resolve(window.__gmailTestToken);
  return googleAccessToken(auth, [GMAIL_READONLY_SCOPE], { persist: true, deniedMessage: kt('gmail.denied') });
}

export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

async function call<T>(token: string, path: string, params: Record<string, string | string[]>, onUnauthorized: () => void): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GmailError(
      res.status === 401 ? kt('gmail.ended') : kt('gmail.answered', { status: String(res.status), message: body.error?.message ?? res.statusText }),
      res.status,
    );
  }
  return (await res.json()) as T;
}

/**
 * The member's Gmail through the REST API with a read-only token. A 401 (access revoked or
 * expired) forgets the token, so the next `requestGmailToken` asks Google again.
 */
export function gmailMailbox(token: string): Mailbox {
  const forget = () => forgetGoogleToken(token);
  return {
    async search(q, max) {
      const r = await call<{ messages?: { id: string }[] }>(token, 'messages', { q, maxResults: String(max) }, forget);
      return (r.messages ?? []).map((m) => m.id);
    },
    async get(id) {
      return toMailMessage(await call<GmailApiMessage>(token, `messages/${encodeURIComponent(id)}`, { format: 'full' }, forget));
    },
    async headers(id) {
      const m = toMailMessage(
        await call<GmailApiMessage>(token, `messages/${encodeURIComponent(id)}`, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }, forget),
      );
      return { id: m.id, date: m.date, from: m.from, subject: m.subject };
    },
  };
}

/** Plain words for a failed Gmail check. */
export function gmailError(e: unknown): string {
  if (popupCancelled(e)) return kt('gmail.notConnected');
  if (popupBlocked(e)) return kt('gmail.popupBlocked');
  const access = googleAccessMessage(e, 'Gmail');
  if (access) return access;
  if (e instanceof GmailError) return e.message;
  if (e instanceof TypeError) return kt('gmail.unreachable');
  return (e as Error)?.message || kt('gmail.couldNotCheck');
}
