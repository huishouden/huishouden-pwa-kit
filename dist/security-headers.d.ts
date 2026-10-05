/**
 * Security headers every Huishouden site sends on its own pages (STANDARD.md "Security headers"):
 * no framing (clickjacking), no plugins, no `<base>` hijack, no MIME sniffing, a referrer that
 * stops at the origin, and only the device features the app uses.
 *
 * Firebase's reserved `/__/` paths are left alone: `/__/auth/handler` and `/__/auth/iframe` on the
 * auth domain are opened in a popup and framed by the apps during Google sign-in, so frame-denying
 * them would break sign-in. The rule matches every path except those, as an RE2 `regex` (RE2 has no
 * lookahead, hence the spelled-out alternatives).
 */
export declare const APP_PATHS_REGEX = "^/(?:[^_].*|_[^_].*|_)?$";
/** Device features an app may turn on for itself; everything else in `Permissions-Policy` is off. */
export interface DeviceFeatures {
    /** Taking a photo in the page (`getUserMedia`, photo pickers that capture). */
    camera?: boolean;
    /** "Near me": the browser's location. */
    geolocation?: boolean;
}
export declare const permissionsPolicy: ({ camera, geolocation }?: DeviceFeatures) => string;
/**
 * No fetch directives (script-src, style-src...), so the asset CDN (./asset-cdn) needs no entry. A
 * site that adds one must allow the CDN in it: `cspBlocksAssets` says where it doesn't.
 */
export declare const CONTENT_SECURITY_POLICY = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";
/** The CSP directives that decide whether the page may load the CDN's scripts, styles, fonts, images and the service worker's precache fetches. */
export declare const ASSET_DIRECTIVES: readonly ["script-src", "style-src", "font-src", "img-src", "connect-src"];
/**
 * The directives of `csp` that would block the asset CDN at `origin`: each of `ASSET_DIRECTIVES`
 * (or `default-src` standing in for it) that is set without the origin, `*` or `https:`.
 */
export declare function cspBlocksAssets(csp: string, origin?: string): string[];
/** The headers, in firebase.json's `{ key, value }` form. */
export declare function securityHeaders(features?: DeviceFeatures): {
    key: string;
    value: string;
}[];
/** Paths the check tries: app routes that must carry the headers, Firebase paths that must not be frame-denied. */
export declare const APP_PATHS: string[];
export declare const FIREBASE_PATHS: string[];
interface HeaderRule {
    source?: string;
    regex?: string;
    headers?: {
        key?: string;
        value?: string;
    }[];
}
/** A Firebase Hosting glob (`**`, `*`, `?`, `@(a|b)`, `!(a|b)`, `{a,b}`) as a RegExp over the path. */
export declare function globToRegExp(glob: string): RegExp;
/** The headers a path gets: every rule that matches it, later rules overriding earlier ones. */
export declare function headersFor(rules: HeaderRule[], path: string): Map<string, string>;
/**
 * What is wrong with a firebase.json's security headers; empty when nothing is. Every app path
 * needs all five headers (any `Permissions-Policy` that turns the microphone off; camera and
 * location are the app's choice), and no Firebase `/__/` path may be frame-denied.
 */
export declare function checkSecurityHeaders(firebaseJson: unknown): string[];
export {};
