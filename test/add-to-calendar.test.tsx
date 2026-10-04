import { afterAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';

if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://home.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { AddToCalendar } = await import('../src/react/calendar');

function render(node: React.ReactNode): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  const el = document.getElementById('app')!;
  act(() => createRoot(el).render(node));
  return el;
}

describe('AddToCalendar', () => {
  const entry = { title: 'Garbage pickup', start: Date.parse('2031-10-02T07:00:00+02:00'), allDay: false, series: { rule: { freq: 'week' as const, every: 1, start: '2031-09-04' }, time: '07:00', minutes: 30 } };

  test('opens a menu with a Google Calendar link and a .ics download; a series says it repeats', () => {
    const el = render(<AddToCalendar entry={entry} />);
    const button = el.querySelector('button')!;
    expect(button.textContent).toContain('Add to calendar');
    expect(el.querySelector('[role="menu"]')).toBeNull();
    act(() => button.click());
    const link = el.querySelector('a[role="menuitem"]') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TH;WKST=SU');
    expect(link.target).toBe('_blank');
    expect(el.textContent).toContain('.ics');
    expect(el.textContent).toContain('Adds the whole series');
  });

  test('compact shows only the icon, named for the item', () => {
    const el = render(<AddToCalendar entry={{ ...entry, series: undefined }} compact />);
    expect(el.querySelector('button')!.getAttribute('aria-label')).toBe('Add Garbage pickup to a calendar');
  });
});
