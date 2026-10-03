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

async function scan(text: string, onRead: (p: ParsedCourse) => { label: string; value: string }[]) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = createRoot(document.getElementById('app')!);
  act(() => root.render(<LabelScan onRead={onRead} read={async () => text} />));
  const input = document.querySelector('input[aria-label="Label photo"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'label.jpg', { type: 'image/jpeg' })], configurable: true });
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
    expect(document.body.textContent).toContain('Scan again');
    act(() => root.unmount());
  });

  test('says so when nothing could be filled in', async () => {
    const root = await scan('blurry', () => []);
    expect(document.body.textContent).toContain('Nothing on that photo could be filled in.');
    expect(region('Filled in from the label')).toBe('');
    act(() => root.unmount());
  });
});
