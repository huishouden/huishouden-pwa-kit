import { describe, expect, test } from 'bun:test';
import { calendarError, isImported, notImported, plainText, type CalendarMatch } from '../src/calendar';
import { contactInput, displayWebsite, groupContacts, normalizeWebsite, type Contact } from '../src/contacts';
import { accessDenied, googleAccessMessage, popupBlocked, popupCancelled, readError } from '../src/feedback';
import { PERSON_COLOURS, personColour, personInitial, personName } from '../src/people';
import fixture from './fixtures/calendar-matches.json';

const matches = fixture.matches as CalendarMatch[];
const [prenatal, , scan] = matches;

describe('calendar import', () => {
  test('HTML descriptions become plain text with line breaks', () => {
    expect(plainText(prenatal.description)).toBe('Bring the glucose results.\nAsk about the birth plan & hospital tour.');
    expect(plainText(scan.description)).toBe('Line one\nLine two');
    expect(plainText('   ')).toBe('');
  });

  test('long descriptions are cut to the limit with an ellipsis', () => {
    const out = plainText('word '.repeat(400), 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out.endsWith('…')).toBe(true);
    expect(plainText('word '.repeat(400)).length).toBe(1999);
  });

  test('imported by id, by link, or the same title at the same time or on the same day', () => {
    const r = (fields: object) => [{ title: 'Something', ...fields }];
    expect(isImported(prenatal, r({ calendarEventId: 'evt-prenatal-1' }))).toBe(true);
    expect(isImported(prenatal, r({ calendarLink: prenatal.link }))).toBe(true);
    expect(isImported(prenatal, r({ title: ' prenatal VISIT ', at: prenatal.start }))).toBe(true);
    expect(isImported(prenatal, r({ title: 'Prenatal visit', at: prenatal.start + 60_000 }))).toBe(false);
    const day = new Date(prenatal.start);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    expect(isImported(prenatal, r({ title: 'Prenatal visit', date: ymd }))).toBe(true);
    expect(isImported(prenatal, r({ title: 'Prenatal visit', date: '2001-01-01' }))).toBe(false);
    expect(isImported(prenatal, [])).toBe(false);
  });

  test('lists each new event once, soonest first', () => {
    expect(notImported([...matches, matches[0]], []).map((m) => m.id)).toEqual(['evt-scan', 'evt-prenatal-1', 'evt-tour']);
    expect(notImported(matches, [{ title: 'x', calendarEventId: 'evt-scan' }]).map((m) => m.id)).toEqual(['evt-prenatal-1', 'evt-tour']);
  });

  test('a closed Google window reads as not allowed; anything else as a connection problem', () => {
    expect(calendarError({ code: 'auth/popup-closed-by-user' })).toContain('not allowed');
    expect(calendarError({ code: 'auth/user-cancelled' })).toContain('not allowed');
    expect(calendarError({ code: 'auth/popup-blocked' })).toContain('pop-ups');
    expect(calendarError(new Error('[500] Calendar: backend'))).toContain('connection');
  });
});

describe('contacts', () => {
  const contact = (name: string, role?: string): Contact => ({ id: name, name, role, apps: ['baby'], createdAt: 1, by: 'sam@example.com' });
  const ROLES = ['Pediatrician', 'OB / midwife', 'Hospital'];

  test('known roles first in their order, typed roles A–Z, no role last as Other', () => {
    const groups = groupContacts(
      [contact('B Hospital', 'Hospital'), contact('Night help', 'Night nanny'), contact('A Peds', 'pediatrician'), contact('Plumber'), contact('C Peds', 'Pediatrician'), contact('Aunt', 'Backup driver')],
      ROLES,
    );
    expect(groups.map((g) => g.role)).toEqual(['Pediatrician', 'Hospital', 'Backup driver', 'Night nanny', 'Other']);
    expect(groups[0].contacts.map((c) => c.name)).toEqual(['A Peds', 'C Peds']);
  });

  test('with role labels, a role typed as a label joins that role\'s group', () => {
    const label = (r: string) => ({ Pediatrician: 'Pediatra', Hospital: 'Hospital' })[r] ?? r;
    const groups = groupContacts([contact('A Peds', 'pediatra'), contact('B Peds', 'Pediatrician'), contact('Doula', 'Doula')], ROLES, label);
    expect(groups.map((g) => [g.role, g.contacts.map((c) => c.name)])).toEqual([
      ['Pediatrician', ['A Peds', 'B Peds']],
      ['Doula', ['Doula']],
    ]);
  });

  test('websites get a scheme and display without one', () => {
    expect(normalizeWebsite('pediatrics.example.com')).toBe('https://pediatrics.example.com');
    expect(normalizeWebsite('http://example.com')).toBe('http://example.com');
    expect(normalizeWebsite('  ')).toBeUndefined();
    expect(displayWebsite('https://www.example.com/kids/')).toBe('example.com/kids');
  });

  test('input is trimmed to the rules and always shown in the app, keeping other apps', () => {
    const out = contactInput({ name: '  Example Pediatrics ', role: '', notes: 'x'.repeat(1200), website: 'example.com' }, ['health'], 'baby');
    expect(out).toMatchObject({ name: 'Example Pediatrics', role: undefined, website: 'https://example.com', apps: ['health', 'baby'] });
    expect(out.notes?.length).toBe(1000);
    expect(contactInput({ name: 'X' }, ['baby'], 'baby').apps).toEqual(['baby']);
  });
});

describe('feedback', () => {
  test('Firestore codes in words', () => {
    expect(readError({ code: 'permission-denied' }, "Couldn't save")).toBe("Couldn't save: only admins and members can do that.");
    expect(readError({ code: 'unavailable' }, "Couldn't load the log")).toBe("Couldn't load the log: offline. It will retry when the connection is back.");
    expect(readError(new Error('boom'), "Couldn't save")).toBe("Couldn't save.");
    expect(readError(undefined, "Couldn't save")).toBe("Couldn't save.");
  });
  test('popup outcomes', () => {
    expect(popupCancelled({ code: 'auth/cancelled-popup-request' })).toBe(true);
    expect(popupCancelled({ code: 'auth/popup-blocked' })).toBe(false);
    expect(popupBlocked({ code: 'auth/popup-blocked' })).toBe(true);
  });
  test('Google Identity Services token errors in words', () => {
    expect(popupCancelled({ code: 'popup_closed' })).toBe(true);
    expect(popupBlocked({ code: 'popup_failed_to_open' })).toBe(true);
    expect(accessDenied({ code: 'access_denied' })).toBe(true);
    expect(googleAccessMessage({ code: 'popup_closed' }, 'Gmail')).toBe('Gmail access was not allowed: Google’s window was closed. Try again when you are ready.');
    expect(googleAccessMessage({ code: 'popup_failed_to_open' })).toBe('The browser blocked Google’s window. Allow pop-ups for this site and try again.');
    expect(googleAccessMessage({ code: 'access_denied' }, 'Calendar')).toBe('Calendar access was not allowed. Try again and allow it on Google’s page.');
    expect(googleAccessMessage({ code: 'not_configured' }, 'Gmail')).toBe('Gmail access is not set up for this app yet.');
    expect(googleAccessMessage({ code: 'unavailable' })).toBe('Couldn’t reach Google. Check the connection and try again.');
    expect(googleAccessMessage(new Error('boom'))).toBeNull();
    expect(calendarError({ code: 'access_denied' })).toBe('Calendar access was not allowed. Try again and allow it on Google’s page.');
  });
});

describe('people', () => {
  test('names from addresses', () => {
    expect(personName('pat.lee@example.com')).toBe('Pat');
    expect(personName('JORDAN99@example.com')).toBe('Jordan');
    expect(personName('pat@example.com', { email: 'Pat@example.com' })).toBe('You');
    expect(personInitial('pat@example.com', { email: 'pat@example.com', displayName: 'Robin Doe' })).toBe('R');
  });
  test('colours follow member order', () => {
    const members = ['pat@example.com', 'lee@example.com'];
    expect(personColour('lee@example.com', members)).toBe(PERSON_COLOURS[1]);
    expect(PERSON_COLOURS).toContain(personColour('someone@example.com', members));
  });
});
