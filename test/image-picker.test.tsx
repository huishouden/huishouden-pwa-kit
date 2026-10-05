import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';

if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://health.example.com/' });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());
const { createRoot } = await import('react-dom/client');
const { ImagePicker, onlyImages } = await import('../src/react/image-picker');

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const pdf = new File(['x'], 'scan.pdf', { type: 'application/pdf' });

// happy-dom ships a Clipboard API; each test decides whether the browser has one.
const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
setClipboard(undefined);

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  setClipboard(undefined);
  act(() => root?.unmount());
  root = undefined;
});

function mount(props: Partial<Parameters<typeof ImagePicker>[0]> = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const got: File[][] = [];
  root = createRoot(document.getElementById('app')!);
  act(() => root!.render(<ImagePicker label="Label photo" camera onImages={(f) => got.push(f)} {...props} />));
  return got;
}
const input = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const buttons = () => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());

async function choose(el: HTMLInputElement, files: File[]) {
  Object.defineProperty(el, 'files', { value: files, configurable: true });
  await act(async () => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('ImagePicker', () => {
  test('two clear choices: only Take a photo forces the camera; Choose a photo has no capture', () => {
    mount();
    expect(buttons()).toEqual(['Take a photo', 'Choose a photo']);
    expect(input('Camera').getAttribute('capture')).toBe('environment');
    expect(input('Label photo').hasAttribute('capture')).toBe(false);
    expect(input('Label photo').accept).toBe('image/*');
    expect(input('Label photo').multiple).toBe(false);
  });

  test('Take a photo is for phones: a computer (no touch) shows Choose only, unless asked', () => {
    mount({ camera: undefined });
    expect(buttons()).toEqual(['Choose a photo']);
  });

  test('multiple chooses several at once and passes them in order', async () => {
    const got = mount({ multiple: true });
    expect(buttons()).toContain('Choose photos');
    expect(input('Label photo').multiple).toBe(true);
    await choose(input('Label photo'), [jpg('front.jpg'), jpg('back.jpg')]);
    expect(got.map((g) => g.map((f) => f.name))).toEqual([['front.jpg', 'back.jpg']]);
  });

  test('a single picker passes on only the first image', async () => {
    const got = mount();
    await choose(input('Label photo'), [jpg('a.jpg'), jpg('b.jpg')]);
    expect(got.map((g) => g.map((f) => f.name))).toEqual([['a.jpg']]);
  });

  test('the camera input hands over its photo', async () => {
    const got = mount();
    await choose(input('Camera'), [jpg('shot.jpg')]);
    expect(got[0][0].name).toBe('shot.jpg');
  });

  test('something that is not an image says so and passes nothing on', async () => {
    const got = mount();
    await choose(input('Label photo'), [pdf]);
    expect(got).toEqual([]);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('not a photo');
  });

  function pasteEvent(files: File[]) {
    const e = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', { value: { files } });
    return e;
  }

  test('pasting an image (Ctrl+V) anywhere on the page picks it; pasting text is left alone', async () => {
    const got = mount({ multiple: true });
    const text = pasteEvent([]);
    await act(async () => void document.dispatchEvent(text));
    expect(text.defaultPrevented).toBe(false);
    const image = pasteEvent([jpg('pasted.png'), pdf]);
    await act(async () => void document.dispatchEvent(image));
    expect(image.defaultPrevented).toBe(true);
    expect(got.map((g) => g.map((f) => f.name))).toEqual([['pasted.png']]);
  });

  test('a disabled picker ignores a paste, and an unmounted one stops listening', async () => {
    const got = mount({ disabled: true });
    await act(async () => void document.dispatchEvent(pasteEvent([jpg('a.jpg')])));
    expect(got).toEqual([]);
    act(() => root!.unmount());
    root = undefined;
    await act(async () => void document.dispatchEvent(pasteEvent([jpg('a.jpg')])));
    expect(got).toEqual([]);
  });

  test('dropping files picks the images', async () => {
    const got = mount({ multiple: true });
    const zone = document.querySelector('#app > div')!;
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [jpg('front.jpg'), pdf, jpg('back.jpg')] } });
    await act(async () => void zone.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(got.map((g) => g.map((f) => f.name))).toEqual([['front.jpg', 'back.jpg']]);
  });

  test('a busy picker still claims a drop (the page must not open the image) but passes nothing on', async () => {
    const got = mount({ disabled: true });
    const zone = document.querySelector('#app > div')!;
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files: [jpg('a.jpg')] } });
    await act(async () => void zone.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(got).toEqual([]);
    expect(document.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
  });

  describe('the Paste button, where the browser lets a page read the clipboard', () => {
    const withClipboard = (read: () => Promise<unknown>) => setClipboard({ read });
    const click = async () => {
      await act(async () => {
        (Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Paste') as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
      });
    };

    test('is not offered without the Clipboard API', () => {
      mount();
      expect(buttons()).not.toContain('Paste');
    });

    test('reads the image on the clipboard', async () => {
      withClipboard(async () => [{ types: ['text/plain', 'image/png'], getType: async () => new Blob(['x'], { type: 'image/png' }) }]);
      const got = mount();
      await click();
      expect(got[0][0].type).toBe('image/png');
      expect(got[0][0].name).toBe('pasted-1.png');
    });

    test('says when the clipboard holds no picture, and when it may not be read', async () => {
      withClipboard(async () => [{ types: ['text/plain'], getType: async () => new Blob(['x']) }]);
      const got = mount();
      await click();
      expect(got).toEqual([]);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('no picture on the clipboard');
      withClipboard(async () => {
        throw new DOMException('denied', 'NotAllowedError');
      });
      await click();
      expect(document.querySelector('[role="alert"]')?.textContent).toContain("Couldn't read the clipboard");
    });
  });

  test('onlyImages keeps images in order', () => {
    expect(onlyImages([jpg('a.jpg'), pdf, null, jpg('b.jpg')]).map((f) => f.name)).toEqual(['a.jpg', 'b.jpg']);
  });
});
