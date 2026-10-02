import { afterAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { readdirSync, readFileSync } from 'node:fs';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { checkSource } from '../src/design-check';
import type { CalendarMatch } from '../src/calendar';

// React DOM decides at import whether it runs in a browser, so the DOM comes first.
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://baby.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');

const { Dialog, SectionTabs, Toast, StatusPill, useToast } = await import('../src/react/ui');
const { ClockProvider, useClock } = await import('../src/react/clock');
const { CalendarImportDialog, CalendarHint } = await import('../src/react/calendar');
const { ContactDialog, ContactCard } = await import('../src/react/contacts');

function render(node: React.ReactNode): { root: Root; el: HTMLElement } {
  document.body.innerHTML = '<div id="app"></div>';
  const el = document.getElementById('app')!;
  const root = createRoot(el);
  act(() => root.render(node));
  return { root, el };
}
const click = (el: Element | null) => act(() => (el as HTMLElement).click());
const byText = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null;

describe('Dialog', () => {
  test('titled, focuses the first field, closes on Escape and on the scrim', () => {
    const onClose = mock(() => {});
    render(
      <Dialog title="New contact" onClose={onClose}>
        <input id="first" />
      </Dialog>,
    );
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('New contact');
    expect(document.activeElement?.id).toBe('first');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);
    click(document.querySelector('[role=dialog]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    click(document.querySelector('[aria-label=Close]'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Toast', () => {
  function Harness({ onUndo }: { onUndo: () => void }) {
    const t = useToast();
    return (
      <>
        <button onClick={() => t.notify('Deleted Example Vet', onUndo)}>Delete</button>
        <button onClick={() => t.fail("Couldn't save.")}>Fail</button>
        <Toast toast={t.toast} onDone={t.clear} />
      </>
    );
  }

  test('Undo runs and dismisses; errors show without Undo', () => {
    const onUndo = mock(() => {});
    render(<Harness onUndo={onUndo} />);
    click(byText('Delete'));
    expect(document.querySelector('[aria-live]')!.textContent).toContain('Deleted Example Vet');
    click(byText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-live]')!.textContent).toBe('');
    click(byText('Fail'));
    expect(document.querySelector('.bg-red-700')!.textContent).toBe("Couldn't save.");
    expect(byText('Undo')).toBeNull();
  });
});

test('section tabs mark the current one and report taps', () => {
  const onTab = mock((_: string) => {});
  render(<SectionTabs tabs={[{ id: 'a', label: 'Overview' }, { id: 'b', label: 'History' }]} tab="a" onTab={onTab} />);
  expect(document.querySelector('[aria-current=page]')!.textContent).toBe('Overview');
  expect(document.querySelector('nav')!.getAttribute('slot')).toBe('nav');
  click(byText('History'));
  expect(onTab).toHaveBeenCalledWith('b');
  render(<SectionTabs tabs={[]} tab="a" onTab={onTab} />);
  expect(document.querySelector('nav')).toBeNull();
});

test('status pill labels only what needs attention', () => {
  render(<StatusPill state="overdue" />);
  expect(document.body.textContent).toBe('Overdue');
  render(<StatusPill state="ok" />);
  expect(document.body.textContent).toBe('');
});

test('the clock reads from the provider and moves on writes', () => {
  let t = 1000;
  let seen: ReturnType<typeof useClock> | null = null;
  function Show() {
    seen = useClock();
    return <span>{seen.now}</span>;
  }
  render(
    <ClockProvider read={() => t}>
      <Show />
    </ClockProvider>,
  );
  expect(seen!.now).toBe(1000);
  t = 5000;
  act(() => void seen!.read());
  expect(document.body.textContent).toBe('5000');
});

describe('calendar', () => {
  const m = (id: string, start: number): CalendarMatch => ({ id, title: `Visit ${id}`, start, allDay: true, location: '', description: '', link: `https://example.com/${id}`, calendarName: 'Family' });

  test('import lists events not yet imported, soonest first, with Add all', () => {
    const onAdd = mock((_: CalendarMatch[]) => {});
    render(
      <CalendarImportDialog
        state={{ status: 'done', matches: [m('b', 2e12), m('a', 1e12), m('c', 3e12)] }}
        records={[{ title: 'x', calendarEventId: 'c' }]}
        intro="Vet visits from last week to a year ahead."
        noneFound="No pet events found."
        allImported="Every pet event is already in Pet."
        onRetry={() => {}}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );
    expect(Array.from(document.querySelectorAll('[aria-label="Calendar events"] li p.font-medium')).map((p) => p.textContent)).toEqual(['Visit a', 'Visit b']);
    click(byText('Add all 2'));
    expect(onAdd.mock.calls[0][0].map((x) => x.id)).toEqual(['a', 'b']);
  });

  test('says when everything is already in', () => {
    render(
      <CalendarImportDialog
        state={{ status: 'done', matches: [m('c', 3e12)] }}
        records={[{ title: 'x', calendarEventId: 'c' }]}
        intro="i"
        noneFound="No pet events found."
        allImported="Every pet event is already in Pet."
        onRetry={() => {}}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    expect(document.querySelector('[role=status]')!.textContent).toBe('Every pet event is already in Pet.');
  });

  test('the hint before Google first asks names the app', () => {
    localStorage.clear();
    render(<CalendarHint app="Pet" available />);
    expect(document.body.textContent).toBe('Google will ask once to let Pet read your calendar. Pet never changes it.');
    localStorage.setItem('pet-calendar-allowed', '1');
    render(<CalendarHint app="Pet" available />);
    expect(document.body.textContent).toBe('');
    render(<CalendarHint app="Pet" available={false} />);
    expect(document.body.textContent).toBe('Sign in to search your calendar.');
  });
});

describe('contacts', () => {
  test('the dialog saves trimmed input shown in the app, keeping other apps, and offers the roles', () => {
    const onSave = mock((_: unknown) => {});
    const contact = { id: 'c', name: '  Example Vet Clinic ', website: 'example.com', apps: ['baby'], createdAt: 1, by: 'x' };
    render(<ContactDialog contact={contact} app="pet" roles={['Vet', 'Groomer']} onSave={onSave} onClose={() => {}} />);
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('Edit contact');
    click(byText('Groomer'));
    expect(byText('Groomer')!.getAttribute('aria-pressed')).toBe('true');
    click(byText('Save'));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Example Vet Clinic', role: 'Groomer', website: 'https://example.com', apps: ['baby', 'pet'] });
  });

  test('a new contact needs a name', () => {
    render(<ContactDialog contact={null} app="pet" roles={[]} title={{ add: 'New shop', edit: 'Edit shop' }} onSave={() => {}} onClose={() => {}} />);
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('New shop');
    expect(byText('Save')!.hasAttribute('disabled')).toBe(true);
  });

  test('the card links phone, website and the map', () => {
    render(
      <ContactCard
        contact={{ id: 'c', name: 'Example Vet', phone: '+1 (555) 010-0100', website: 'https://www.example.com/', address: '1 Example Way', apps: ['pet'], createdAt: 1, by: 'x' }}
        role="Vet"
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs[0]).toBe('tel:+15550100100');
    expect(hrefs).toContain('https://www.example.com/');
    expect(document.body.textContent).toContain('example.com');
    expect(hrefs.some((h) => h?.startsWith('https://www.google.com/maps/search/'))).toBe(true);
  });
});

test('the React components and the Tailwind theme follow the design language', () => {
  const files = readdirSync('src/react').map((f) => `src/react/${f}`).concat('src/tailwind.css');
  const findings = files.flatMap((f) => checkSource(readFileSync(f, 'utf8'), f.endsWith('.css') ? 'style' : 'script').map((x) => `${f}:${x.line} ${x.rule} ${x.text}`));
  expect(findings).toEqual([]);
});
