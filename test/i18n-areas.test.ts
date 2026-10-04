import { afterEach, describe, expect, test } from 'bun:test';
import { resetI18nForTests, setLangForTests } from '../src/i18n';
import { addedText } from '../src/todos';
import { agendaTime, dayLabel, todayItems, type AgendaItem } from '../src/agenda';
import { calendarError, suggestionWhen } from '../src/calendar';
import { refusal, roleDescription, roleLabel } from '../src/roles';
import { googleAccessMessage, readError } from '../src/feedback';
import { inviteBody, inviteSubject } from '../src/invite';
import { pushSupport } from '../src/push';
import { gmailError } from '../src/gmail';

// Representative outputs of the reminders, to-dos, agenda, calendar, roles, push and feedback
// areas in Spanish and Dutch; English is covered by each module's own tests.
afterEach(async () => {
  await setLangForTests('en').catch(() => {});
  resetI18nForTests();
});

const NOW = new Date(2031, 10, 4, 12, 0).getTime();
const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: 'i', app: 'home', ref: 'r', kind: 'due', title: 'Filter', start: NOW, allDay: true, url: 'https://x.example.com/', updatedAt: 0, by: 'a@example.com', ...over,
});

describe('Spanish', () => {
  test('to-dos, agenda and calendar words', async () => {
    await setLangForTests('es');
    expect(addedText({ createdAt: NOW - 3 * 86_400_000 }, NOW)).toBe('Agregado hace 3 días');
    expect(addedText({ createdAt: NOW - 400 * 86_400_000 }, NOW)).toBe('Agregado hace un año');
    expect(agendaTime(item({}))).toBe('Todo el día');
    expect(dayLabel('2031-11-05', NOW)).toBe('Mañana');
    expect(todayItems([item({ status: 'upcoming' })], NOW)[0].when).toBe('Vence hoy');
    expect(suggestionWhen({ id: 'e', title: 'Vet', start: NOW + 86_400_000, allDay: true, location: '', description: '', link: '', calendarName: '' }, NOW)).toBe('Mañana, todo el día');
    expect(calendarError({ code: 'popup_closed' })).toBe('No se permitió el acceso al calendario. Inténtalo de nuevo cuando quieras.');
  });

  test('roles, feedback, push and invitations', async () => {
    await setLangForTests('es');
    expect(refusal('change-settings')).toBe('Solo los administradores y miembros pueden cambiar la configuración.');
    expect(roleLabel('helper')).toBe('Ayudante');
    expect(roleDescription('kid')).toBe('Como un ayudante, sin medicamentos.');
    expect(readError({ code: 'unavailable' }, 'No se pudo guardar')).toBe('No se pudo guardar: sin conexión. Se volverá a intentar cuando vuelva la conexión.');
    expect(googleAccessMessage({ code: 'not_configured' }, 'Gmail')).toBe('El acceso a Gmail aún no está configurado para esta app.');
    const r = pushSupport({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5, standalone: false, hasServiceWorker: true, hasPushManager: true, permission: 'denied' });
    expect(r.supported === false && r.message).toStartWith('Las notificaciones están bloqueadas');
    const invite = { to: 'sam@example.com', from: 'Alex', householdName: 'Casa', url: 'https://x.example.com/' };
    expect(inviteSubject(invite)).toBe('Alex te invitó a Casa');
    expect(inviteBody(invite)).toContain('Abre https://x.example.com/ e inicia sesión con Google como sam@example.com.');
  });
});

describe('Dutch', () => {
  test('to-dos, agenda, roles and email', async () => {
    await setLangForTests('nl');
    expect(addedText({ createdAt: NOW - 21 * 86_400_000 }, NOW)).toBe('3 weken geleden toegevoegd');
    expect(agendaTime(item({ allDay: false, start: NOW, end: NOW + 3_600_000 }))).toBe('12:00 – 13:00');
    expect(dayLabel('2031-11-03', NOW)).toBe('Gisteren');
    expect(refusal('see-money')).toBe('Alleen beheerders en leden kunnen het geld van het huishouden zien.');
    expect(roleLabel('admin')).toBe('Beheerder');
    expect(gmailError({ code: 'popup_closed' })).toBe('Gmail is niet gekoppeld.');
  });
});
