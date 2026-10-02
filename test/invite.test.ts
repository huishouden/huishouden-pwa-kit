import { describe, expect, test } from 'bun:test';
import { inviteMailto, inviteSubject, rawMessage } from '../src/invite';

const invite = { to: 'sam@example.com', from: 'Alex Example', householdName: 'Example Household', url: 'https://example.web.app' };

describe('invite email', () => {
  test('subject names the inviter and the household', () => {
    expect(inviteSubject(invite)).toBe('Alex Example invited you to Example Household');
  });
  test('raw message is base64url and decodes to a plain-text email to the invitee', () => {
    const raw = rawMessage(invite);
    expect(raw).not.toMatch(/[+/=]/);
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toContain('To: sam@example.com');
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    const body = Buffer.from(decoded.split('\r\n\r\n')[1], 'base64').toString('utf8');
    expect(body).toContain('sign in with Google as sam@example.com');
    expect(body).toContain('https://example.web.app');
  });
  test('mailto fallback is fully encoded', () => {
    expect(inviteMailto(invite)).toStartWith('mailto:sam%40example.com?subject=Alex%20Example%20invited');
  });
});
