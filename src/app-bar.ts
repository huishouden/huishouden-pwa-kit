/**
 * `<hh-app-bar>`: the Huishouden frame every app opens in (DESIGN.md "Frame"). Family logo and
 * "Huishouden" over the app's name, linking to the portal; a `nav` slot for the app's own tabs or
 * switchers (on phones it collapses when everything in it carries `data-bottom-nav`, as the kit's
 * `SectionTabs` does, whose phone tabs sit in a bar at the bottom of the screen); an `actions` slot for app buttons; and the account area: "Sign in with Google" while
 * signed out, the profile photo with a small account menu while signed in.
 *
 * The element never calls Firebase. It dispatches `hh-sign-in` and `hh-sign-out` (bubbling,
 * composed) and the app does the work, so it serves vanilla and React apps alike.
 *
 * ```html
 * <hh-app-bar app="Baby" glyph="bottle" portal-url="https://example-portal.web.app" version="1.2.0 (abc1234)">
 *   <nav slot="nav">…</nav>
 * </hh-app-bar>
 * ```
 * `bar.user = { name, email, photoURL }` once signed in, `null` when signed out; leave it
 * `undefined` while the session is being restored so neither the avatar nor Sign in flashes.
 */
import { GLYPHS, logoSvg, type Glyph } from './logo';
import { LANG_CHOICES, LANG_NAMES, getLangChoice, kt, onLangChange, setLangChoice, type LangChoice } from './i18n';
import { THEME_MODES, getThemeMode, onThemeChange, setThemeMode, startTheme, type ThemeMode } from './theme';

/** What the bar shows of the signed-in person. A Firebase `User` fits as it is. */
export interface AppBarUser {
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export const SIGN_IN_EVENT = 'hh-sign-in';
export const SIGN_OUT_EVENT = 'hh-sign-out';
export const SUITE_NAME = 'Huishouden';

/** The person's name when known, else their email. */
export function displayNameOf(user: AppBarUser): string {
  return (user.name ?? user.displayName ?? user.email ?? '').trim();
}

/** The single letter shown when there is no photo (or it fails to load). */
export function initialOf(user: AppBarUser): string {
  return (displayNameOf(user).charAt(0) || '?').toUpperCase();
}

/** True for the portal itself, which is named just "Huishouden". */
export function isSuite(app: string): boolean {
  return !app.trim() || app.trim().toLowerCase() === SUITE_NAME.toLowerCase();
}

/** "Huishouden Baby 1.2.0 (abc1234)"; the portal's is "Huishouden 1.2.0 (abc1234)". */
export function versionLabel(app: string, version: string): string {
  if (!version.trim()) return '';
  return [SUITE_NAME, isSuite(app) ? '' : app.trim(), version.trim()].filter(Boolean).join(' ');
}

/** Whether `url` points at the page's own origin. */
export function sameSite(url: string, base: string): boolean {
  try {
    return new URL(url, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** The portal's page saying what the apps collect, linked from every app's account menu. */
export const PRIVACY_PATH = '/privacy';

/** The privacy page on the portal `portalUrl` points at ("https://example-portal.web.app/privacy"). */
export function privacyUrl(portalUrl: string, base: string): string {
  try {
    return new URL(PRIVACY_PATH, new URL(portalUrl, base)).href;
  } catch {
    return PRIVACY_PATH;
  }
}

function isGlyph(value: string | null): value is Glyph {
  return !!value && Object.prototype.hasOwnProperty.call(GLYPHS, value);
}

// Only theme tokens and the stone neutrals from DESIGN.md. The variables cross the shadow boundary,
// so an app's theme.css drives these; the fallbacks keep the bar right without it.
const STYLE = `
:host {
  display: block;
  position: sticky;
  top: 0;
  z-index: 30;
  font-family: var(--hh-font, 'Inter', ui-sans-serif, system-ui, sans-serif);
  -webkit-tap-highlight-color: transparent;
  --bar-bg: var(--hh-page, #faf9f5);
  --bar-border: var(--hh-line, #e7e5e4);
  --bar-overline: var(--hh-muted, #57534e);
  --bar-title: var(--hh-link, #1b4332);
  --menu-bg: var(--hh-surface, #fff);
  --menu-border: var(--hh-line, #e7e5e4);
  --menu-text: var(--hh-ink, #292524);
  --menu-muted: var(--hh-muted, #57534e);
  --item-text: var(--hh-link, #1b4332);
  --item-hover: var(--hh-tint, #f0f7f2);
  --primary-bg: var(--hh-primary, #1b4332);
  --primary-hover: var(--hh-primary-hover, #2d6a4f);
  --primary-text: var(--hh-on-primary, #fff);
  --focus: var(--hh-terracotta, #c86d51);
}
/* Dark whatever the page says; the page's own .dark (./theme) already turns the bar dark through the variables above. */
:host([theme='dark']) {
  --bar-bg: var(--hh-forest-900, #081c15);
  --bar-border: var(--hh-forest-600, #2d6a4f);
  --bar-overline: #d6d3d1;
  --bar-title: var(--hh-forest-300, #95d5b2);
  --menu-bg: var(--hh-forest-800, #12301f);
  --menu-border: var(--hh-forest-600, #2d6a4f);
  --menu-text: #f5f5f4;
  --menu-muted: #d6d3d1;
  --item-text: var(--hh-forest-300, #95d5b2);
  --item-hover: var(--hh-forest-700, #1b4332);
  --primary-bg: var(--hh-forest-400, #74c69d);
  --primary-hover: var(--hh-forest-300, #95d5b2);
  --primary-text: var(--hh-forest-900, #081c15);
}
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
header {
  background: var(--bar-bg);
  border-bottom: 1px solid var(--bar-border);
  padding-top: env(safe-area-inset-top);
}
.inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
}
.home {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
}
.logo, .logo svg { display: block; width: 44px; height: 44px; flex-shrink: 0; }
.suite { display: block; margin: 0; font-size: 12px; line-height: 16px; font-weight: 500; color: var(--bar-overline); }
h1 { margin: 0; font-size: 18px; line-height: 1.25; font-weight: 700; letter-spacing: -0.025em; color: var(--bar-title); }
.nav { order: 3; display: flex; width: 100%; min-width: 0; }
/* Phones: section tabs that move to the bottom bar (SectionTabs) leave the bar to logo, name and account. */
@media (max-width: 639px) { :host([bottom-nav]) .nav { display: none; } }
.end { display: flex; align-items: center; gap: 12px; }
.account { position: relative; display: flex; }
@media (min-width: 640px) {
  .inner { padding-left: max(24px, env(safe-area-inset-left)); padding-right: max(24px, env(safe-area-inset-right)); }
  .nav { order: 0; width: auto; }
}
button { font-family: inherit; }
.signin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  border-radius: 12px;
  background: var(--primary-bg);
  color: var(--primary-text);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.signin:hover { background: var(--primary-hover); }
/* Phones: "Sign in" alone keeps the button beside a long app name; its label still says Google. */
@media (max-width: 479px) { .signin .long { display: none; } }
.signin:disabled { opacity: 0.6; cursor: default; }
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  overflow: hidden;
  border: 2px solid var(--menu-bg);
  border-radius: 999px;
  background: var(--hh-forest-600, #2d6a4f);
  color: #fff;
  font-size: 18px;
  line-height: 1;
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  cursor: pointer;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--bar-title);
  cursor: pointer;
}
.menu-button:hover { background: var(--item-hover); }
.menu-button svg { width: 22px; height: 22px; }
.signed-out { display: flex; align-items: center; gap: 4px; }
.menu {
  position: absolute;
  top: 56px;
  right: 0;
  z-index: 40;
  width: 280px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  border: 1px solid var(--menu-border);
  border-radius: 16px;
  background: var(--menu-bg);
  color: var(--menu-text);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
.menu p { margin: 0; overflow-wrap: anywhere; }
.who-name { font-size: 16px; line-height: 24px; font-weight: 600; }
.who-email { font-size: 14px; line-height: 20px; color: var(--menu-muted); }
.items { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--item-text);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.item:hover { background: var(--item-hover); }
.theme-label { margin-top: 12px; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--menu-muted); }
.who-name + .theme-label, .who-email + .theme-label { margin-top: 12px; }
.menu > .theme-label:first-child { margin-top: 0; }
.modes {
  display: grid;
  /* Equal while every word fits; a long one ("Automatisch") takes the room it needs. */
  grid-template-columns: repeat(3, minmax(max-content, 1fr));
  gap: 4px;
  margin-top: 6px;
  padding: 3px;
  border: 1px solid var(--menu-border);
  border-radius: 12px;
}
.mode {
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--menu-text);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
}
.mode:hover { background: var(--item-hover); }
.langs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mode[aria-pressed='true'] { background: var(--primary-bg); color: var(--primary-text); font-weight: 600; }
.menu .version { margin-top: 8px; font-size: 12px; line-height: 16px; color: var(--menu-muted); }
.signin, .avatar, .item, .mode, .menu-button { transition: background-color 150ms ease-out; }
a:focus-visible, button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .signin, .avatar, .item, .mode, .menu-button { transition: none; }
}
`;

const TEMPLATE = `
<style>${STYLE}</style>
<header part="bar">
  <div class="inner">
    <a class="home" part="home">
      <span class="logo" aria-hidden="true"></span>
      <span class="names"><span class="suite">${SUITE_NAME}</span><h1></h1></span>
    </a>
    <div class="nav" part="nav" hidden><slot name="nav"></slot></div>
    <div class="end" part="end">
      <slot name="actions"></slot>
      <div class="account" part="account"></div>
    </div>
  </div>
</header>
`;

// Lets the module load where there is no DOM (unit tests, server rendering); it registers nothing there.
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class HhAppBar extends Base {
  static observedAttributes = ['app', 'glyph', 'portal-url', 'version', 'signing-in'];

  #user: AppBarUser | null | undefined = undefined;
  #open = false;
  #root: ShadowRoot;
  #menuId = `hh-account-menu-${Math.random().toString(36).slice(2, 8)}`;
  #offTheme: (() => void) | undefined;
  #offLang: (() => void) | undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = TEMPLATE;
    const slot = this.#root.querySelector<HTMLSlotElement>('slot[name="nav"]')!;
    slot.addEventListener('slotchange', () => this.#syncNav());
  }

  /** Short app name: "Spending". The portal passes "Huishouden" (or nothing). */
  get app(): string { return this.getAttribute('app') ?? ''; }
  set app(value: string | null | undefined) { this.#attr('app', value); }

  /** Logo glyph from `@huishouden/pwa-kit/logo` (`card`, `bottle`, …). */
  get glyph(): string { return this.getAttribute('glyph') ?? 'home'; }
  set glyph(value: string | null | undefined) { this.#attr('glyph', value); }

  /** Where the logo and "All apps" lead. */
  get portalUrl(): string { return this.getAttribute('portal-url') ?? '/'; }
  set portalUrl(value: string | null | undefined) { this.#attr('portal-url', value); }

  /** Shown in the account menu, e.g. "1.2.0 (abc1234)". */
  get version(): string { return this.getAttribute('version') ?? ''; }
  set version(value: string | null | undefined) { this.#attr('version', value); }

  /** Disables Sign in and says so while the Google popup is open. */
  get signingIn(): boolean { return this.hasAttribute('signing-in'); }
  set signingIn(value: boolean) { this.toggleAttribute('signing-in', !!value); }

  /** `undefined` while restoring the session, `null` signed out, the person when signed in. */
  get user(): AppBarUser | null | undefined { return this.#user; }
  set user(value: AppBarUser | null | undefined) {
    this.#user = value;
    this.#open = false;
    this.#renderAccount();
  }

  connectedCallback() {
    // A property set before the element was defined sits on the instance and hides the accessor.
    for (const key of ['user', 'app', 'glyph', 'portalUrl', 'version', 'signingIn'] as const) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        const value = (this as Record<string, unknown>)[key];
        delete (this as Record<string, unknown>)[key];
        (this as Record<string, unknown>)[key] = value;
      }
    }
    startTheme();
    this.#offTheme?.();
    this.#offTheme = onThemeChange(this.#syncThemeChoice);
    this.#offLang?.();
    this.#offLang = onLangChange(() => {
      this.#renderHome();
      this.#renderAccount();
    });
    this.#renderHome();
    this.#renderAccount();
    this.#syncNav();
  }

  disconnectedCallback() {
    this.#setOpen(false);
    this.#offTheme?.();
    this.#offTheme = undefined;
    this.#offLang?.();
    this.#offLang = undefined;
  }

  attributeChangedCallback(name: string) {
    if (name === 'signing-in') this.#renderAccount();
    else if (name === 'version' || name === 'portal-url') {
      this.#renderHome();
      this.#renderAccount();
    } else this.#renderHome();
  }

  #attr(name: string, value: string | null | undefined) {
    if (value == null) this.removeAttribute(name);
    else this.setAttribute(name, value);
  }

  #renderHome() {
    const home = this.#root.querySelector<HTMLAnchorElement>('.home')!;
    home.href = this.portalUrl;
    home.setAttribute('aria-label', kt('appBar.home'));
    const glyph = isGlyph(this.glyph) ? this.glyph : 'home';
    const logo = this.#root.querySelector<HTMLElement>('.logo')!;
    if (logo.dataset.glyph !== glyph) {
      logo.innerHTML = logoSvg(glyph); // trusted: kit geometry for a known glyph
      logo.dataset.glyph = glyph;
    }
    const suite = isSuite(this.app);
    this.#root.querySelector<HTMLElement>('.suite')!.hidden = suite;
    this.#root.querySelector('h1')!.textContent = suite ? SUITE_NAME : this.app.trim();
  }

  #syncNav() {
    const slot = this.#root.querySelector<HTMLSlotElement>('slot[name="nav"]')!;
    const assigned = slot.assignedElements();
    this.#root.querySelector<HTMLElement>('.nav')!.hidden = assigned.length === 0;
    this.toggleAttribute('bottom-nav', assigned.length > 0 && assigned.every((el) => el.hasAttribute('data-bottom-nav')));
  }

  #renderAccount() {
    const account = this.#root.querySelector<HTMLElement>('.account')!;
    const focused = this.#root.activeElement?.className;
    account.replaceChildren();
    const user = this.#user;
    if (user === undefined) return;
    if (user === null) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'signin';
      button.setAttribute('part', 'sign-in');
      button.disabled = this.signingIn;
      if (this.signingIn) button.textContent = kt('appBar.openingGoogle');
      else {
        button.setAttribute('aria-label', kt('appBar.signInWithGoogle'));
        const label = document.createElement('span');
        const long = document.createElement('span');
        long.className = 'long';
        long.textContent = `\u00a0${kt('appBar.withGoogle')}`;
        label.append(kt('appBar.signIn'), long);
        button.append(label);
      }
      button.addEventListener('click', () => this.#emit(SIGN_IN_EVENT));
      // Signed out there is no avatar, so the theme, the language and Privacy sit behind a small sliders button. Its name
      // is not "Settings", which apps use for their own settings button.
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'menu-button';
      trigger.setAttribute('part', 'menu-button');
      trigger.setAttribute('aria-label', kt('appBar.settingsMenu'));
      trigger.innerHTML = SETTINGS_ICON; // trusted: static markup
      this.#wireTrigger(trigger);
      const menu = this.#menu();
      menu.append(...this.#themeChoice(), ...this.#langChoice());
      const items = document.createElement('div');
      items.className = 'items';
      items.append(this.#privacyLink());
      menu.append(items);
      const version = versionLabel(this.app, this.version);
      if (version) menu.append(paragraph('version', version));
      const wrap = document.createElement('div');
      wrap.className = 'signed-out';
      wrap.append(trigger, button);
      account.append(wrap, menu);
      if (focused === 'menu-button') trigger.focus();
      return;
    }

    const email = user.email ?? '';
    const name = (user.name ?? user.displayName ?? '').trim();
    const avatar = document.createElement('button');
    avatar.type = 'button';
    avatar.className = 'avatar';
    avatar.setAttribute('part', 'avatar');
    avatar.setAttribute('aria-haspopup', 'true');
    avatar.setAttribute('aria-controls', this.#menuId);
    avatar.setAttribute('aria-expanded', String(this.#open));
    avatar.setAttribute('aria-label', kt('appBar.signedInAs', { who: email || name || kt('appBar.you') }));
    avatar.title = email;
    const initial = () => {
      const span = document.createElement('span');
      span.textContent = initialOf(user);
      return span;
    };
    if (user.photoURL) {
      const img = document.createElement('img');
      img.alt = '';
      // Google profile photos refuse requests that carry a referrer from another site.
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.replaceWith(initial()));
      img.src = user.photoURL;
      avatar.append(img);
    } else {
      avatar.append(initial());
    }
    this.#wireTrigger(avatar);

    const menu = this.#menu();
    if (name) menu.append(paragraph('who-name', name));
    if (email) menu.append(paragraph('who-email', email));
    menu.append(...this.#themeChoice(), ...this.#langChoice());
    const items = document.createElement('div');
    items.className = 'items';
    // Every app shares the portal's origin (docs/one-site.md), so only the portal itself, by name, lacks the link.
    if (!isSuite(this.app)) {
      const all = document.createElement('a');
      all.className = 'item';
      all.href = this.portalUrl;
      all.textContent = kt('appBar.allApps');
      items.append(all);
    }
    items.append(this.#privacyLink());
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'item';
    out.textContent = kt('appBar.signOut');
    out.addEventListener('click', () => {
      this.#setOpen(false);
      this.#emit(SIGN_OUT_EVENT);
    });
    items.append(out);
    menu.append(items);
    const version = versionLabel(this.app, this.version);
    if (version) menu.append(paragraph('version', version));

    account.append(avatar, menu);
    if (focused === 'avatar') avatar.focus();
  }

  #wireTrigger(trigger: HTMLButtonElement) {
    trigger.dataset.trigger = '';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-controls', this.#menuId);
    trigger.setAttribute('aria-expanded', String(this.#open));
    trigger.addEventListener('click', () => this.#setOpen(!this.#open));
  }

  #menu() {
    const menu = document.createElement('div');
    menu.id = this.#menuId;
    menu.className = 'menu';
    menu.setAttribute('part', 'menu');
    menu.hidden = !this.#open;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', this.#user ? kt('appBar.account') : kt('appBar.settingsMenu'));
    return menu;
  }

  #privacyLink() {
    const privacy = document.createElement('a');
    privacy.className = 'item';
    privacy.href = privacyUrl(this.portalUrl, location.href);
    privacy.textContent = kt('appBar.privacy');
    return privacy;
  }

  /** "Theme" and Automatic / Light / Dark: the suite's one choice (./theme), for every app at once. */
  #themeChoice(): HTMLElement[] {
    const label = paragraph('theme-label', kt('appBar.theme'));
    label.id = `${this.#menuId}-theme`;
    const modes = document.createElement('div');
    modes.className = 'modes';
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-labelledby', label.id);
    modes.setAttribute('part', 'theme');
    const chosen = getThemeMode();
    for (const mode of THEME_MODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode';
      b.dataset.mode = mode;
      b.textContent = kt(THEME_KEYS[mode]);
      b.setAttribute('aria-pressed', String(mode === chosen));
      b.addEventListener('click', () => setThemeMode(mode));
      modes.append(b);
    }
    return [label, modes];
  }

  /** "Language" and Automatic / English / Español / Nederlands: the suite's one choice (./i18n). Each language is named in itself. */
  #langChoice(): HTMLElement[] {
    const label = paragraph('theme-label', kt('appBar.language'));
    label.id = `${this.#menuId}-lang`;
    const choices = document.createElement('div');
    choices.className = 'modes langs';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', label.id);
    choices.setAttribute('part', 'language');
    const chosen = getLangChoice();
    for (const choice of LANG_CHOICES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode';
      b.dataset.lang = choice;
      if (choice === 'auto') b.textContent = kt('lang.auto');
      else {
        b.textContent = LANG_NAMES[choice];
        b.lang = choice;
      }
      b.setAttribute('aria-pressed', String(choice === chosen));
      b.addEventListener('click', () => void setLangChoice(choice as LangChoice));
      choices.append(b);
    }
    return [label, choices];
  }

  #syncThemeChoice = () => {
    const chosen = getThemeMode();
    this.#root.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === chosen)));
  };

  #setOpen(open: boolean, { restoreFocus = false } = {}) {
    if (open === this.#open) return;
    this.#open = open;
    const avatar = this.#root.querySelector<HTMLButtonElement>('[data-trigger]');
    const menu = this.#root.querySelector<HTMLElement>('.menu');
    avatar?.setAttribute('aria-expanded', String(open));
    if (menu) menu.hidden = !open;
    if (open) {
      document.addEventListener('pointerdown', this.#onOutside, true);
      document.addEventListener('keydown', this.#onKey, true);
      this.addEventListener('focusout', this.#onFocusOut);
    } else {
      document.removeEventListener('pointerdown', this.#onOutside, true);
      document.removeEventListener('keydown', this.#onKey, true);
      this.removeEventListener('focusout', this.#onFocusOut);
      if (restoreFocus) avatar?.focus();
    }
  }

  #onOutside = (e: Event) => {
    if (!e.composedPath().includes(this)) this.#setOpen(false);
  };

  #onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.#setOpen(false, { restoreFocus: true });
    }
  };

  #onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && !this.contains(next) && !this.#root.contains(next)) this.#setOpen(false);
  };

  #emit(type: string) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }
}

const THEME_KEYS = { auto: 'theme.auto', light: 'theme.light', dark: 'theme.dark' } as const satisfies Record<ThemeMode, string>;

// lucide "settings-2" (two sliders), stroke 2, coloured by the text colour.
const SETTINGS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>';

function paragraph(className: string, text: string) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

if (typeof customElements !== 'undefined' && !customElements.get('hh-app-bar')) {
  customElements.define('hh-app-bar', HhAppBar);
}

declare global {
  interface HTMLElementTagNameMap {
    'hh-app-bar': HhAppBar;
  }
  interface HTMLElementEventMap {
    'hh-sign-in': CustomEvent<void>;
    'hh-sign-out': CustomEvent<void>;
  }
}
