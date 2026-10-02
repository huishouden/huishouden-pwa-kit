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
const { PhotoPicker } = await import('../src/react/photo');

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
      >
        <p id="extra">Set Biscuit's birthday</p>
      </CalendarImportDialog>,
    );
    expect(document.getElementById('extra')!.textContent).toBe("Set Biscuit's birthday");
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

  const typeInto = (el: HTMLTextAreaElement | HTMLInputElement, value: string) =>
    act(() => {
      // React skips the change when its value tracker already holds the new value; reset it first.
      el.value = value;
      (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker?.setValue('');
      // Where React was first loaded without a DOM (another test file), it watches focus and keys instead of input.
      el.focus();
      for (const type of ['input', 'change', 'keyup']) el.dispatchEvent(new Event(type, { bubbles: true }));
    });
  const field = (label: string) => Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))?.querySelector('input') ?? null;

  test('pasted listing text fills the fields and shows what was not used', () => {
    const onSave = mock((_: unknown) => {});
    render(<ContactDialog contact={null} app="pet" roles={['Vet']} onSave={onSave} onClose={() => {}} />);
    click(byText('Paste listing text'));
    const box = document.querySelector('textarea[aria-label="Listing text"]') as HTMLTextAreaElement;
    typeInto(box, 'Example Animal Hospital\n4.6 (512)\n1 Example Way, Springfield, IL 62704\n(217) 555-0100\nexample.com\n"Lovely staff, very kind to our dog."');
    click(byText('Fill in'));
    expect(document.body.textContent).toContain('Filled in the name, phone, website and address from the pasted text. Check them before saving.');
    expect(document.querySelector('details:not([open]) summary')?.textContent).toBe("Show the text that wasn't used");
    expect(document.body.textContent).toContain('Lovely staff, very kind to our dog.');
    click(byText('Save'));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Example Animal Hospital', phone: '(217) 555-0100', website: 'https://example.com', address: '1 Example Way, Springfield, IL 62704', apps: ['pet'] });
  });

  test('a screenshot is read and fills the fields; a failed read can be retried', async () => {
    let fail = true;
    const readScreenshot = mock(async () => {
      if (fail) throw new Error('offline');
      return { name: 'Example Vet', phone: '(217) 555-0101', confidence: 0.6, unparsed: [], ignored: [] };
    });
    render(<ContactDialog contact={null} app="pet" roles={[]} readScreenshot={readScreenshot} onSave={() => {}} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Take a screenshot of the business in Google Maps, then choose it here.');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(document.querySelector('[role=alert]')!.textContent).toContain("Couldn't read the screenshot");
    fail = false;
    await act(async () => click(byText('Try again')));
    expect(readScreenshot).toHaveBeenCalledTimes(2);
    expect(field('Name')!.value).toBe('Example Vet');
    expect(field('Phone')!.value).toBe('(217) 555-0101');
    expect(document.body.textContent).toContain('Filled in the name and phone from the screenshot.');
  });

  test('a screenshot with nothing recognisable says so', async () => {
    render(<ContactDialog contact={null} app="pet" roles={[]} readScreenshot={async () => ({ confidence: 0, unparsed: ['lorem'], ignored: [] })} onSave={() => {}} onClose={() => {}} />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 's.png')], configurable: true });
    await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(document.body.textContent).toContain("Couldn't find a business's details in the screenshot.");
  });

  test('a shared place starts a new contact, with its hours in the notes', () => {
    const prefill = { name: 'Example Vet', mapsUrl: 'https://maps.app.goo.gl/x', hours: 'Mon 8 AM–6 PM', confidence: 0.55, unparsed: ['Here is the vet'], ignored: [] };
    render(<ContactDialog contact={null} app="pet" roles={[]} prefill={prefill} onSave={() => {}} onClose={() => {}} />);
    expect(field('Name')!.value).toBe('Example Vet');
    expect(document.querySelector('textarea')!.value).toBe('Hours: Mon 8 AM–6 PM');
    expect(document.body.textContent).toContain('from what was shared');
    expect(document.body.textContent).toContain('Here is the vet');
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

describe('PhotoPicker', () => {
  test('choose, Use photo saves the small data URL; Remove photo clears it', async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas };
    g.createImageBitmap = async () => ({ width: 800, height: 600, close() {} });
    g.OffscreenCanvas = class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob({ type }: { type: string }) {
        return new Blob([new Uint8Array(1000)], { type });
      }
    };
    try {
      const saves: string[] = [];
      let removed = 0;
      render(<PhotoPicker photo={null} fallback={<span>B</span>} label="Biscuit's photo" pick={async () => new Blob(['x'])} onSave={(d) => saves.push(d)} onRemove={() => removed++} />);
      expect(document.querySelector('[aria-label="Add Biscuit\'s photo"]')).not.toBeNull();
      await act(async () => click(byText('Choose photo')));
      expect(document.querySelector('input[type="range"]')).not.toBeNull();
      await act(async () => click(byText('Use photo')));
      expect(saves).toHaveLength(1);
      expect(saves[0].startsWith('data:image/webp;base64,')).toBe(true);

      render(<PhotoPicker photo={saves[0]} fallback={<span>B</span>} label="Biscuit's photo" onSave={() => {}} onRemove={() => removed++} />);
      expect(document.querySelector('img')?.getAttribute('src')).toBe(saves[0]);
      click(byText('Remove photo'));
      expect(removed).toBe(1);
    } finally {
      Object.assign(g, saved);
    }
  });
});

test('the React components and the Tailwind theme follow the design language', () => {
  const files = readdirSync('src/react').map((f) => `src/react/${f}`).concat('src/tailwind.css');
  const findings = files.flatMap((f) => checkSource(readFileSync(f, 'utf8'), f.endsWith('.css') ? 'style' : 'script').map((x) => `${f}:${x.line} ${x.rule} ${x.text}`));
  expect(findings).toEqual([]);
});
