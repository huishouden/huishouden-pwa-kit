import type { Auth } from 'firebase/auth';
/**
 * Tells someone they were invited to the household, the way sharing a Google Sheet does: an email
 * from the inviter's own Gmail. Sending needs Gmail's send permission, which Google asks for once
 * in a popup; the app only ever sends these invitations. `inviteMailto` is the fallback that opens
 * a prefilled draft in the person's own mail app instead.
 */
export declare const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export interface Invitation {
    to: string;
    /** Who is inviting, for the greeting: their name or email. */
    from: string;
    householdName: string;
    /** Where to sign in: the portal. */
    url: string;
}
export declare function inviteSubject(invite: Invitation): string;
export declare function inviteBody(invite: Invitation): string;
/** RFC 2822 message, base64url-encoded as the Gmail API expects. */
export declare function rawMessage(invite: Invitation): string;
/** Sends the invitation from the signed-in person's Gmail (asks for send permission the first time; call from a tap). */
export declare function sendInviteEmail(auth: Auth, invite: Invitation): Promise<void>;
/** A prefilled draft in the person's own mail app, for when sending from Gmail isn't wanted. */
export declare function inviteMailto(invite: Invitation): string;
