/**
 * `<hh-app-bar>`: the Huishouden frame every app opens in (DESIGN.md "Frame"). Family logo and
 * "Huishouden" over the app's name, linking to the portal; a `nav` slot for the app's own tabs or
 * switchers; an `actions` slot for app buttons; and the account area: "Sign in with Google" while
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
import { GLYPHS, logoSvg } from './logo';
export const SIGN_IN_EVENT = 'hh-sign-in';
export const SIGN_OUT_EVENT = 'hh-sign-out';
export const SUITE_NAME = 'Huishouden';
/** The person's name when known, else their email. */
export function displayNameOf(user) {
    return (user.name ?? user.displayName ?? user.email ?? '').trim();
}
/** The single letter shown when there is no photo (or it fails to load). */
export function initialOf(user) {
    return (displayNameOf(user).charAt(0) || '?').toUpperCase();
}
/** True for the portal itself, which is named just "Huishouden". */
export function isSuite(app) {
    return !app.trim() || app.trim().toLowerCase() === SUITE_NAME.toLowerCase();
}
/** "Huishouden Baby 1.2.0 (abc1234)"; the portal's is "Huishouden 1.2.0 (abc1234)". */
export function versionLabel(app, version) {
    if (!version.trim())
        return '';
    return [SUITE_NAME, isSuite(app) ? '' : app.trim(), version.trim()].filter(Boolean).join(' ');
}
/** Whether `url` points at the page's own site, where an "All apps" link would go nowhere new. */
export function sameSite(url, base) {
    try {
        return new URL(url, base).origin === new URL(base).origin;
    }
    catch {
        return false;
    }
}
function isGlyph(value) {
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
  --bar-bg: var(--hh-cream, #faf9f5);
  --bar-border: #e7e5e4;
  --bar-overline: #57534e;
  --bar-title: var(--hh-forest-700, #1b4332);
  --menu-bg: #fff;
  --menu-border: #e7e5e4;
  --menu-text: #292524;
  --menu-muted: #57534e;
  --item-text: var(--hh-forest-700, #1b4332);
  --item-hover: var(--hh-forest-50, #f0f7f2);
  --primary-bg: var(--hh-forest-700, #1b4332);
  --primary-hover: var(--hh-forest-600, #2d6a4f);
  --primary-text: #fff;
  --focus: var(--hh-terracotta, #c86d51);
}
:host([theme='dark']) {
  --bar-bg: var(--hh-forest-900, #081c15);
  --bar-border: var(--hh-forest-800, #12301f);
  --bar-overline: #d6d3d1;
  --bar-title: #faf9f5;
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
  border: 2px solid #fff;
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
.menu {
  position: absolute;
  top: 56px;
  right: 0;
  z-index: 40;
  width: 256px;
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
.menu .version { margin-top: 8px; font-size: 12px; line-height: 16px; color: var(--menu-muted); }
.signin, .avatar, .item { transition: background-color 150ms ease-out; }
a:focus-visible, button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .signin, .avatar, .item { transition: none; }
}
`;
const TEMPLATE = `
<style>${STYLE}</style>
<header part="bar">
  <div class="inner">
    <a class="home" part="home" aria-label="${SUITE_NAME} home">
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
const Base = (typeof HTMLElement === 'undefined' ? class {
} : HTMLElement);
export class HhAppBar extends Base {
    static observedAttributes = ['app', 'glyph', 'portal-url', 'version', 'signing-in'];
    #user = undefined;
    #open = false;
    #root;
    #menuId = `hh-account-menu-${Math.random().toString(36).slice(2, 8)}`;
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: 'open' });
        this.#root.innerHTML = TEMPLATE;
        const slot = this.#root.querySelector('slot[name="nav"]');
        slot.addEventListener('slotchange', () => this.#syncNav());
    }
    /** Short app name: "Spending". The portal passes "Huishouden" (or nothing). */
    get app() { return this.getAttribute('app') ?? ''; }
    set app(value) { this.#attr('app', value); }
    /** Logo glyph from `@huishouden/pwa-kit/logo` (`card`, `bottle`, …). */
    get glyph() { return this.getAttribute('glyph') ?? 'home'; }
    set glyph(value) { this.#attr('glyph', value); }
    /** Where the logo and "All apps" lead. */
    get portalUrl() { return this.getAttribute('portal-url') ?? '/'; }
    set portalUrl(value) { this.#attr('portal-url', value); }
    /** Shown in the account menu, e.g. "1.2.0 (abc1234)". */
    get version() { return this.getAttribute('version') ?? ''; }
    set version(value) { this.#attr('version', value); }
    /** Disables Sign in and says so while the Google popup is open. */
    get signingIn() { return this.hasAttribute('signing-in'); }
    set signingIn(value) { this.toggleAttribute('signing-in', !!value); }
    /** `undefined` while restoring the session, `null` signed out, the person when signed in. */
    get user() { return this.#user; }
    set user(value) {
        this.#user = value;
        this.#open = false;
        this.#renderAccount();
    }
    connectedCallback() {
        // A property set before the element was defined sits on the instance and hides the accessor.
        for (const key of ['user', 'app', 'glyph', 'portalUrl', 'version', 'signingIn']) {
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                const value = this[key];
                delete this[key];
                this[key] = value;
            }
        }
        this.#renderHome();
        this.#renderAccount();
        this.#syncNav();
    }
    disconnectedCallback() {
        this.#setOpen(false);
    }
    attributeChangedCallback(name) {
        if (name === 'signing-in')
            this.#renderAccount();
        else if (name === 'version' || name === 'portal-url') {
            this.#renderHome();
            this.#renderAccount();
        }
        else
            this.#renderHome();
    }
    #attr(name, value) {
        if (value == null)
            this.removeAttribute(name);
        else
            this.setAttribute(name, value);
    }
    #renderHome() {
        const home = this.#root.querySelector('.home');
        home.href = this.portalUrl;
        const glyph = isGlyph(this.glyph) ? this.glyph : 'home';
        const logo = this.#root.querySelector('.logo');
        if (logo.dataset.glyph !== glyph) {
            logo.innerHTML = logoSvg(glyph); // trusted: kit geometry for a known glyph
            logo.dataset.glyph = glyph;
        }
        const suite = isSuite(this.app);
        this.#root.querySelector('.suite').hidden = suite;
        this.#root.querySelector('h1').textContent = suite ? SUITE_NAME : this.app.trim();
    }
    #syncNav() {
        const slot = this.#root.querySelector('slot[name="nav"]');
        this.#root.querySelector('.nav').hidden = slot.assignedElements().length === 0;
    }
    #renderAccount() {
        const account = this.#root.querySelector('.account');
        const focused = this.#root.activeElement?.className;
        account.replaceChildren();
        const user = this.#user;
        if (user === undefined)
            return;
        if (user === null) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'signin';
            button.setAttribute('part', 'sign-in');
            button.disabled = this.signingIn;
            if (this.signingIn)
                button.textContent = 'Opening Google';
            else {
                button.setAttribute('aria-label', 'Sign in with Google');
                button.innerHTML = '<span>Sign in<span class="long">&nbsp;with Google</span></span>';
            }
            button.addEventListener('click', () => this.#emit(SIGN_IN_EVENT));
            account.append(button);
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
        avatar.setAttribute('aria-label', `Signed in as ${email || name || 'you'}`);
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
        }
        else {
            avatar.append(initial());
        }
        avatar.addEventListener('click', () => this.#setOpen(!this.#open));
        const menu = document.createElement('div');
        menu.id = this.#menuId;
        menu.className = 'menu';
        menu.setAttribute('part', 'menu');
        menu.hidden = !this.#open;
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', 'Account');
        if (name)
            menu.append(paragraph('who-name', name));
        if (email)
            menu.append(paragraph('who-email', email));
        const items = document.createElement('div');
        items.className = 'items';
        if (!sameSite(this.portalUrl, location.href)) {
            const all = document.createElement('a');
            all.className = 'item';
            all.href = this.portalUrl;
            all.textContent = 'All apps';
            items.append(all);
        }
        const out = document.createElement('button');
        out.type = 'button';
        out.className = 'item';
        out.textContent = 'Sign out';
        out.addEventListener('click', () => {
            this.#setOpen(false);
            this.#emit(SIGN_OUT_EVENT);
        });
        items.append(out);
        menu.append(items);
        const version = versionLabel(this.app, this.version);
        if (version)
            menu.append(paragraph('version', version));
        account.append(avatar, menu);
        if (focused === 'avatar')
            avatar.focus();
    }
    #setOpen(open, { restoreFocus = false } = {}) {
        if (open === this.#open)
            return;
        this.#open = open;
        const avatar = this.#root.querySelector('.avatar');
        const menu = this.#root.querySelector('.menu');
        avatar?.setAttribute('aria-expanded', String(open));
        if (menu)
            menu.hidden = !open;
        if (open) {
            document.addEventListener('pointerdown', this.#onOutside, true);
            document.addEventListener('keydown', this.#onKey, true);
            this.addEventListener('focusout', this.#onFocusOut);
        }
        else {
            document.removeEventListener('pointerdown', this.#onOutside, true);
            document.removeEventListener('keydown', this.#onKey, true);
            this.removeEventListener('focusout', this.#onFocusOut);
            if (restoreFocus)
                avatar?.focus();
        }
    }
    #onOutside = (e) => {
        if (!e.composedPath().includes(this))
            this.#setOpen(false);
    };
    #onKey = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.#setOpen(false, { restoreFocus: true });
        }
    };
    #onFocusOut = (e) => {
        const next = e.relatedTarget;
        if (next && !this.contains(next) && !this.#root.contains(next))
            this.#setOpen(false);
    };
    #emit(type) {
        this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
    }
}
function paragraph(className, text) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    return p;
}
if (typeof customElements !== 'undefined' && !customElements.get('hh-app-bar')) {
    customElements.define('hh-app-bar', HhAppBar);
}
