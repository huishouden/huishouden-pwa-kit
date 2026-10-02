import type { Auth } from 'firebase/auth';
/**
 * Read-only Gmail for the signed-in member, in the browser: search, read a message's text and HTML,
 * and turn email HTML into readable text. For apps that read the household's own statement and
 * alert emails (Bills, Spending) with the member's consent; nothing leaves the browser.
 *
 * Google asks once, in a popup opened from a tap; the token is kept for its hour in localStorage,
 * so reopening the app can check again without another popup. Nothing ever asks without a tap:
 * `storedGmailToken` never opens a popup, `requestGmailToken` does.
 */
export declare const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
declare global {
    interface Window {
        /** Browser tests set this to use a stubbed Gmail API (page.route) without a Google account. */
        __gmailTestToken?: string;
    }
}
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
/** A read-only token that is still valid, without asking anyone; null when Google must be asked. */
export declare function storedGmailToken(auth: Auth): string | null;
/** Asks Google for read-only Gmail access (or reuses the hour's token). Call from a tap. */
export declare function requestGmailToken(auth: Auth): Promise<string>;
export declare class GmailError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/** The parts of the Gmail API's `users.messages.get` answer that are read here. */
export interface GmailPart {
    mimeType?: string;
    headers?: {
        name: string;
        value: string;
    }[];
    body?: {
        data?: string;
        size?: number;
    };
    parts?: GmailPart[];
}
export interface GmailApiMessage {
    id: string;
    internalDate?: string;
    payload?: GmailPart;
}
/**
 * The member's Gmail through the REST API with a read-only token. A 401 (access revoked or
 * expired) forgets the token, so the next `requestGmailToken` asks Google again.
 */
export declare function gmailMailbox(token: string): Mailbox;
/** Plain words for a failed Gmail check. */
export declare function gmailError(e: unknown): string;
/** base64url (Gmail's encoding of part bodies) to UTF-8 text. */
export declare function decodeBase64Url(data: string): string;
export declare function encodeBase64Url(text: string): string;
/** A Gmail API message as a `MailMessage`: headers, date, and the first text and HTML bodies. */
export declare function toMailMessage(m: GmailApiMessage): MailMessage;
/** Named and numeric HTML entities to their characters; unknown ones are left as written. */
export declare function decodeEntities(s: string): string;
/**
 * Readable text from an email's HTML: block ends become line breaks, table cells become spaces (so
 * "Amount due" and "$120.00" in neighbouring cells read as one line), entities are decoded and the
 * invisible padding characters email builders put in preheaders are removed.
 */
export declare function htmlToText(html: string): string;
/** Collapses spaces, drops zero-width characters, keeps single line breaks. */
export declare function tidy(text: string): string;
