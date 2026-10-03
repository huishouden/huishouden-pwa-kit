/** What the bar shows of the signed-in person. A Firebase `User` fits as it is. */
export interface AppBarUser {
    name?: string | null;
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
}
export declare const SIGN_IN_EVENT = "hh-sign-in";
export declare const SIGN_OUT_EVENT = "hh-sign-out";
export declare const SUITE_NAME = "Huishouden";
/** The person's name when known, else their email. */
export declare function displayNameOf(user: AppBarUser): string;
/** The single letter shown when there is no photo (or it fails to load). */
export declare function initialOf(user: AppBarUser): string;
/** True for the portal itself, which is named just "Huishouden". */
export declare function isSuite(app: string): boolean;
/** "Huishouden Baby 1.2.0 (abc1234)"; the portal's is "Huishouden 1.2.0 (abc1234)". */
export declare function versionLabel(app: string, version: string): string;
/** Whether `url` points at the page's own origin. */
export declare function sameSite(url: string, base: string): boolean;
/** The portal's page saying what the apps collect, linked from every app's account menu. */
export declare const PRIVACY_PATH = "/privacy";
/** The privacy page on the portal `portalUrl` points at ("https://example-portal.web.app/privacy"). */
export declare function privacyUrl(portalUrl: string, base: string): string;
declare const Base: typeof HTMLElement;
export declare class HhAppBar extends Base {
    #private;
    static observedAttributes: string[];
    constructor();
    /** Short app name: "Spending". The portal passes "Huishouden" (or nothing). */
    get app(): string;
    set app(value: string | null | undefined);
    /** Logo glyph from `@huishouden/pwa-kit/logo` (`card`, `bottle`, …). */
    get glyph(): string;
    set glyph(value: string | null | undefined);
    /** Where the logo and "All apps" lead. */
    get portalUrl(): string;
    set portalUrl(value: string | null | undefined);
    /** Shown in the account menu, e.g. "1.2.0 (abc1234)". */
    get version(): string;
    set version(value: string | null | undefined);
    /** Disables Sign in and says so while the Google popup is open. */
    get signingIn(): boolean;
    set signingIn(value: boolean);
    /** `undefined` while restoring the session, `null` signed out, the person when signed in. */
    get user(): AppBarUser | null | undefined;
    set user(value: AppBarUser | null | undefined);
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string): void;
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
export {};
