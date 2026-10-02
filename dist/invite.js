import { googleAccessToken, googleFetch } from './google-token';
/**
 * Tells someone they were invited to the household, the way sharing a Google Sheet does: an email
 * from the inviter's own Gmail. Sending needs Gmail's send permission, which Google asks for once
 * in a popup; the app only ever sends these invitations. `inviteMailto` is the fallback that opens
 * a prefilled draft in the person's own mail app instead.
 */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export function inviteSubject(invite) {
    return `${invite.from} invited you to ${invite.householdName}`;
}
export function inviteBody(invite) {
    return [
        `${invite.from} added you to ${invite.householdName} on Huishouden, the household's shared apps for spending, tasks and more.`,
        '',
        `Open ${invite.url} and sign in with Google as ${invite.to}. You'll have every app straight away.`,
        '',
        'On a phone or tablet, use "Install app" or "Add to Home screen" in the browser menu to keep it on your home screen.',
    ].join('\n');
}
/** RFC 2822 message, base64url-encoded as the Gmail API expects. */
export function rawMessage(invite) {
    const subject = `=?UTF-8?B?${toBase64(inviteSubject(invite))}?=`;
    const message = [
        `To: ${invite.to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        toBase64(inviteBody(invite)),
    ].join('\r\n');
    return toBase64(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes)
        binary += String.fromCharCode(b);
    return btoa(binary);
}
/** Sends the invitation from the signed-in person's Gmail (asks for send permission the first time; call from a tap). */
export async function sendInviteEmail(auth, invite) {
    const token = await googleAccessToken(auth, [GMAIL_SEND_SCOPE], { deniedMessage: 'Google did not allow sending email.' });
    await googleFetch(token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { label: 'Gmail', method: 'POST', body: { raw: rawMessage(invite) } });
}
/** A prefilled draft in the person's own mail app, for when sending from Gmail isn't wanted. */
export function inviteMailto(invite) {
    return `mailto:${encodeURIComponent(invite.to)}?subject=${encodeURIComponent(inviteSubject(invite))}&body=${encodeURIComponent(inviteBody(invite))}`;
}
