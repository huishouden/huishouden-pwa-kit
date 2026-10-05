import { afterAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import type { ParsedCourse } from '../src/dose';

if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://health.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { LabelScan } = await import('../src/react/dose');

const LABEL = ['Lisinopril 10 mg tablets', 'Take 1 tablet by mouth once daily', 'Qty: 30', 'zq7 smudge', 'May cause dizziness'].join('\n');

async function scan(text: string | string[], onRead: (p: ParsedCourse, text: string) => { label: string; value: string }[], files = 1) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = createRoot(document.getElementById('app')!);
  const texts = [text].flat();
  let n = 0;
  act(() => root.render(<LabelScan onRead={onRead} read={async () => texts[n++] ?? texts[0]} />));
  const input = document.querySelector('input[aria-label="Label photo"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: Array.from({ length: files }, (_, i) => new File(['x'], `label${i}.jpg`, { type: 'image/jpeg' })), configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  return root;
}

const region = (name: string) => document.querySelector(`[aria-label="${name}"]`)?.textContent ?? '';

describe('LabelScan', () => {
  test('shows what it filled, what it read but did not use, and everything it read', async () => {
    let parsed: ParsedCourse | null = null;
    const root = await scan(LABEL, (p) => {
      parsed = p;
      return [
        { label: 'Medicine', value: [p.name, p.strength].filter(Boolean).join(' ') },
        { label: 'Dose', value: p.dose ?? '' },
        { label: 'Notes', value: '' },
      ];
    });
    expect(parsed!.name).toBe('Lisinopril');
    expect(region('Filled in from the label')).toContain('Filled in from the label. Check each field before saving.');
    expect(region('Filled in from the label')).toContain('MedicineLisinopril 10 mg');
    expect(region('Filled in from the label')).toContain('Dose1 tablet');
    // An empty value is not claimed as filled.
    expect(region('Filled in from the label')).not.toContain('Notes');
    expect(region('Not used')).toContain('zq7 smudge');
    expect(document.body.textContent).toContain('Nothing above holds these lines.');
    expect(document.body.textContent).toContain('Left out: one pharmacy line');
    expect(region('Read from the photo')).toContain('Qty: 30');
    expect(document.querySelector('input[capture]')?.getAttribute('aria-label')).toBe('Camera');
    expect(document.querySelector('input[aria-label="Label photo"]')?.hasAttribute('capture')).toBe(false);
    act(() => root.unmount());
  });

  test('says so when nothing could be filled in', async () => {
    const root = await scan('blurry', () => []);
    expect(document.body.textContent).toContain('Nothing on that photo could be filled in.');
    expect(region('Filled in from the label')).toBe('');
    act(() => root.unmount());
  });

  test('the front and the back of a box, chosen together, fill one form', async () => {
    const seen: string[] = [];
    const root = await scan(['Lisinopril 10 mg tablets\nQty: 30', 'Take 1 tablet by mouth once daily\nQty: 30'], (p, text) => {
      seen.push(text);
      return [{ label: 'Medicine', value: p.name ?? '' }, { label: 'Dose', value: p.dose ?? '' }];
    }, 2);
    expect(seen).toEqual(['Lisinopril 10 mg tablets\nQty: 30\nTake 1 tablet by mouth once daily']);
    expect(region('Filled in from the label')).toContain('MedicineLisinopril');
    expect(region('Filled in from the label')).toContain('Dose1 tablet');
    act(() => root.unmount());
  });

  test('one unreadable photo does not lose the others; all failing is an error', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = createRoot(document.getElementById('app')!);
    let n = 0;
    const read = async () => {
      if (n++ === 0) throw new Error('blurry');
      return LABEL;
    };
    act(() => root.render(<LabelScan onRead={(p) => [{ label: 'Medicine', value: p.name ?? '' }]} read={read} images={[new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['x'], 'b.jpg', { type: 'image/jpeg' })]} />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(region('Filled in from the label')).toContain('MedicineLisinopril');
    act(() => root.render(<LabelScan onRead={() => []} read={async () => Promise.reject(new Error('x'))} images={[new File(['x'], 'c.jpg', { type: 'image/jpeg' })]} />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Couldn't read that photo");
    act(() => root.unmount());
  });
});
