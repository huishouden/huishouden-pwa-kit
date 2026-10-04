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
    /** Sent to a list: it has a List-Unsubscribe header or `Precedence: bulk/list` (newsletters, offers). */
    bulk?: boolean;
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
