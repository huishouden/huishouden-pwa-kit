import { afterAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from './dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppBar } from '../src/react/app-bar';
import { displayNameOf, initialOf, isSuite, sameSite, versionLabel } from '../src/app-bar';

describe('app bar helpers', () => {
  test('the initial comes from the name, then the email', () => {
    expect(initialOf({ name: 'sam example', email: 'x@example.com' })).toBe('S');
    expect(initialOf({ displayName: 'Robin', email: 'x@example.com' })).toBe('R');
    expect(initialOf({ email: 'alex@example.com' })).toBe('A');
    expect(initialOf({})).toBe('?');
    expect(displayNameOf({ name: '  Kim  ' })).toBe('Kim');
  });

  test('the portal is the suite itself', () => {
    expect(isSuite('Huishouden')).toBe(true);
    expect(isSuite('')).toBe(true);
    expect(isSuite('Baby')).toBe(false);
  });

  test('version label names the suite and the app', () => {
    expect(versionLabel('Baby', '1.2.0 (abc1234)')).toBe('Huishouden Baby 1.2.0 (abc1234)');
    expect(versionLabel('Huishouden', '1.2.0')).toBe('Huishouden 1.2.0');
    expect(versionLabel('Baby', '')).toBe('');
  });

  test('sameSite compares origins, resolving relative URLs', () => {
    expect(sameSite('/', 'https://portal.example.com/x')).toBe(true);
    expect(sameSite('https://portal.example.com', 'https://baby.example.com/')).toBe(false);
    expect(sameSite('not a url', 'also not')).toBe(false);
  });
});

// Element tests share one DOM, removed afterwards so later test files see none.
afterAll(() => GlobalRegistrator.unregister());

describe('<hh-app-bar>', () => {
  type Bar = HTMLElementTagNameMap['hh-app-bar'];
  function mount(attrs: Record<string, string> = {}, inner = '') {
    document.body.innerHTML = '';
    const bar = document.createElement('hh-app-bar') as Bar;
    bar.setAttribute('app', 'Baby');
    bar.setAttribute('glyph', 'bottle');
    bar.setAttribute('portal-url', 'https://portal.example.com/');
    bar.setAttribute('version', '1.2.0 (abc1234)');
    for (const [k, v] of Object.entries(attrs)) bar.setAttribute(k, v);
    bar.innerHTML = inner;
    document.body.append(bar);
    return { bar, $: (sel: string) => bar.shadowRoot!.querySelector<HTMLElement>(sel) };
  }

  test('shows the logo and names, linking to the portal', () => {
    const { $ } = mount();
    expect(($('a.home') as HTMLAnchorElement).getAttribute('href')).toBe('https://portal.example.com/');
    expect($('a.home')!.getAttribute('aria-label')).toBe('Huishouden home');
    expect($('.logo svg')).not.toBeNull();
    expect($('.suite')!.textContent).toBe('Huishouden');
    expect($('.suite')!.hidden).toBe(false);
    expect($('h1')!.textContent).toBe('Baby');
  });

  test('the portal shows one name', () => {
    const { $ } = mount({ app: 'Huishouden', glyph: 'home' });
    expect($('.suite')!.hidden).toBe(true);
    expect($('h1')!.textContent).toBe('Huishouden');
  });

  test('an unknown glyph falls back to the portal door', () => {
    const { bar, $ } = mount({ glyph: 'nonsense' });
    expect(bar.glyph).toBe('nonsense');
    expect($('.logo')!.dataset.glyph).toBe('home');
  });

  test('shows nothing in the account area until the session is known', () => {
    const { $ } = mount();
    expect($('.account')!.children.length).toBe(0);
  });

  test('signed out: Sign in with Google raises hh-sign-in', () => {
    const { bar, $ } = mount();
    bar.user = null;
    let fired = 0;
    document.addEventListener('hh-sign-in', () => fired++, { once: true });
    const button = $('.signin') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Sign in with Google');
    expect(button.textContent).toBe('Sign in\u00a0with Google');
    button.click();
    expect(fired).toBe(1);
    bar.signingIn = true;
    expect(($('.signin') as HTMLButtonElement).disabled).toBe(true);
    expect($('.signin')!.textContent).toBe('Opening Google');
  });

  test('signed in: the avatar opens the account menu; Escape closes it', () => {
    const { bar, $ } = mount();
    bar.user = { name: 'Sam Example', email: 'sam@example.com', photoURL: null };
    const avatar = $('.avatar') as HTMLButtonElement;
    expect(avatar.textContent).toBe('S');
    expect(avatar.getAttribute('aria-label')).toBe('Signed in as sam@example.com');
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect($('.menu')!.hidden).toBe(true);

    avatar.click();
    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(avatar.getAttribute('aria-controls')).toBe($('.menu')!.id);
    const menu = $('.menu')!;
    expect(menu.hidden).toBe(false);
    expect(menu.querySelector('.who-name')!.textContent).toBe('Sam Example');
    expect(menu.querySelector('.who-email')!.textContent).toBe('sam@example.com');
    expect(menu.querySelector('a.item')!.getAttribute('href')).toBe('https://portal.example.com/');
    expect(menu.querySelector('a.item')!.textContent).toBe('All apps');
    const links = Array.from(menu.querySelectorAll('a.item')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['All apps', 'https://portal.example.com/'], ['Privacy', 'https://portal.example.com/privacy']]);
    expect(menu.querySelector('.version')!.textContent).toBe('Huishouden Baby 1.2.0 (abc1234)');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
  });

  test('a click outside closes the menu; Sign out raises hh-sign-out', () => {
    const { bar, $ } = mount();
    bar.user = { email: 'sam@example.com' };
    ($('.avatar') as HTMLButtonElement).click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect($('.menu')!.hidden).toBe(true);

    ($('.avatar') as HTMLButtonElement).click();
    let fired = 0;
    bar.addEventListener('hh-sign-out', () => fired++);
    const out = Array.from($('.menu')!.querySelectorAll('button.item')).find((b) => b.textContent === 'Sign out') as HTMLButtonElement;
    out.click();
    expect(fired).toBe(1);
    expect($('.menu')!.hidden).toBe(true);
  });

  test('the photo carries no referrer', () => {
    const { bar, $ } = mount();
    bar.user = { email: 'sam@example.com', photoURL: 'https://photos.example.com/sam.png' };
    const img = $('.avatar img') as HTMLImageElement;
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('src')).toBe('https://photos.example.com/sam.png');
  });

  test("an app on the portal's own site still links to all apps", () => {
    const { bar, $ } = mount({ 'portal-url': '/' });
    bar.user = { email: 'sam@example.com' };
    const links = Array.from($('.menu')!.querySelectorAll('a.item')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['All apps', '/'], ['Privacy', new URL('/privacy', location.href).href]]);
  });

  test('no "All apps" on the portal itself; Privacy stays', () => {
    const { bar, $ } = mount({ 'portal-url': '/', app: 'Huishouden' });
    bar.user = { email: 'sam@example.com' };
    const links = Array.from($('.menu')!.querySelectorAll('a.item')).map((a) => a.textContent);
    expect(links).toEqual(['Privacy']);
    expect($('.menu a.item')!.getAttribute('href')).toBe(new URL('/privacy', location.href).href);
  });

  test('the nav area shows only when the app slots something into it', async () => {
    expect(mount().$('.nav')!.hidden).toBe(true);
    const { $ } = mount({}, '<nav slot="nav"><button>Today</button></nav>');
    await new Promise((r) => setTimeout(r, 0));
    expect($('.nav')!.hidden).toBe(false);
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppBar (React)', () => {
  test('passes attributes, the user property, slotted children and both events', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    const calls: string[] = [];
    const render = (user: { email: string } | null) =>
      act(() =>
        root.render(
          createElement(
            AppBar,
            {
              app: 'Spending',
              glyph: 'card',
              portalUrl: 'https://portal.example.com/',
              version: '1.0.0 (abc1234)',
              theme: 'dark',
              user,
              onSignIn: () => calls.push('in'),
              onSignOut: () => calls.push('out'),
            },
            createElement('nav', { slot: 'nav' }, 'March'),
          ),
        ),
      );

    await render(null);
    const bar = document.querySelector('hh-app-bar')!;
    expect(bar.getAttribute('portal-url')).toBe('https://portal.example.com/');
    expect(bar.getAttribute('theme')).toBe('dark');
    expect(bar.querySelector('nav[slot="nav"]')!.textContent).toBe('March');
    expect(bar.user).toBeNull();
    bar.shadowRoot!.querySelector<HTMLButtonElement>('.signin')!.click();

    await render({ email: 'sam@example.com' });
    expect(bar.user).toEqual({ email: 'sam@example.com' });
    bar.shadowRoot!.querySelector<HTMLButtonElement>('.avatar')!.click();
    Array.from(bar.shadowRoot!.querySelectorAll<HTMLButtonElement>('button.item')).find((b) => b.textContent === 'Sign out')!.click();
    expect(calls).toEqual(['in', 'out']);
    await act(() => root.unmount());
  });
});
