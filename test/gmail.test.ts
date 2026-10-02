import { describe, expect, test } from 'bun:test';
import { decodeBase64Url, decodeEntities, encodeBase64Url, GmailError, gmailError, htmlToText, tidy, toMailMessage } from '../src/gmail';
import message from './fixtures/gmail-message.json' with { type: 'json' };

describe('Gmail messages', () => {
  test('base64url round trip keeps UTF-8', () => {
    const s = 'Amount due — $5.00 · é';
    expect(decodeBase64Url(encodeBase64Url(s))).toBe(s);
  });

  test('headers, date and the nested text and HTML parts are read; attachments ignored', () => {
    const m = toMailMessage(message);
    expect(m.id).toBe('msg-0001');
    expect(m.from).toBe('Example Power Co <billing@power.example.com>');
    expect(m.subject).toBe('Your bill is ready');
    expect(m.date).toBe(Date.parse('2031-05-02T13:00:00Z'));
    expect(m.text).toBe('Amount due: $120.00\nDue date: May 20, 2031\n');
    expect(m.html).toContain('<td>$120.00</td>');
  });

  test('a message without parts or dates', () => {
    expect(toMailMessage({ id: 'x' })).toEqual({ id: 'x', date: 0, from: '', subject: '' });
  });
});

describe('email HTML to text', () => {
  test('table cells read as one line; blocks as lines; head and styles dropped', () => {
    const html = '<html><head><style>td{color:red}</style></head><body><table><tr><td>Amount due</td><td>$120.00</td></tr><tr><td>Due</td><td>May 20</td></tr></table><p>Thanks&nbsp;&amp; bye</p></body></html>';
    expect(htmlToText(html)).toBe('Amount due $120.00\nDue May 20\nThanks & bye');
  });

  test('entities, zero-width padding and odd spaces', () => {
    expect(decodeEntities('&#36;5 &#x24;6 &ndash; &unknown;')).toBe('$5 $6 – &unknown;');
    expect(tidy('a​­b  c \n\n\n d')).toBe('ab c\nd');
  });
});

test('failed checks in plain words', () => {
  expect(gmailError({ code: 'auth/popup-closed-by-user' })).toBe('Gmail was not connected.');
  expect(gmailError({ code: 'auth/popup-blocked' })).toContain('Allow popups');
  expect(gmailError(new GmailError('Gmail answered 500: backend', 500))).toBe('Gmail answered 500: backend');
  expect(gmailError(new TypeError('Failed to fetch'))).toBe("Couldn't reach Gmail. Check the connection.");
  expect(gmailError(null)).toBe("Couldn't check email.");
});
