import type { Auth } from 'firebase/auth';
import { type Mailbox } from './mail-core';
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
export declare const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
declare global {
    interface Window {
        /** Browser tests set this to use a stubbed Gmail API (page.route) without a Google account. */
        __gmailTestToken?: string;
    }
}
/** A read-only token that is still valid, without asking anyone; null when Google must be asked. */
export declare function storedGmailToken(auth: Auth): string | null;
/** Asks Google for read-only Gmail access (or reuses the hour's token). Call from a tap. */
export declare function requestGmailToken(auth: Auth): Promise<string>;
export declare class GmailError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * The member's Gmail through the REST API with a read-only token. A 401 (access revoked or
 * expired) forgets the token, so the next `requestGmailToken` asks Google again.
 */
export declare function gmailMailbox(token: string): Mailbox;
/** Plain words for a failed Gmail check. */
export declare function gmailError(e: unknown): string;
