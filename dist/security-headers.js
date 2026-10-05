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
export const APP_PATHS_REGEX = '^/(?:[^_].*|_[^_].*|_)?$';
export const permissionsPolicy = ({ camera = false, geolocation = false } = {}) => `camera=${camera ? '(self)' : '()'}, microphone=(), geolocation=${geolocation ? '(self)' : '()'}`;
import { ASSET_ORIGINS } from './asset-cdn.js';
/**
 * No fetch directives (script-src, style-src...), so the asset CDN (./asset-cdn) needs no entry. A
 * site that adds one must allow the CDN in it: `cspBlocksAssets` says where it doesn't.
 */
export const CONTENT_SECURITY_POLICY = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";
/** The CSP directives that decide whether the page may load the CDN's scripts, styles, fonts, images and the service worker's precache fetches. */
export const ASSET_DIRECTIVES = ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src'];
/**
 * The directives of `csp` that would block the asset CDN at `origin`: each of `ASSET_DIRECTIVES`
 * (or `default-src` standing in for it) that is set without the origin, `*` or `https:`.
 */
export function cspBlocksAssets(csp, origin = ASSET_ORIGINS.production) {
    const directives = new Map();
    for (const part of csp.split(';')) {
        const [name, ...sources] = part.trim().split(/\s+/);
        if (name)
            directives.set(name.toLowerCase(), sources);
    }
    const blocked = [];
    for (const d of ASSET_DIRECTIVES) {
        const name = directives.has(d) ? d : directives.has('default-src') ? 'default-src' : null;
        if (!name)
            continue;
        const sources = directives.get(name);
        if (!sources.some((s) => s === origin || s === `${origin}/` || s === '*' || s === 'https:'))
            blocked.push(name === d ? d : `${d} (from default-src)`);
    }
    return blocked;
}
/** The headers, in firebase.json's `{ key, value }` form. */
export function securityHeaders(features = {}) {
    return [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Permissions-Policy', value: permissionsPolicy(features) },
    ];
}
/** Paths the check tries: app routes that must carry the headers, Firebase paths that must not be frame-denied. */
export const APP_PATHS = ['/', '/index.html', '/settings', '/assets/index-abc123.js', '/_x'];
export const FIREBASE_PATHS = ['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json'];
/** A Firebase Hosting glob (`**`, `*`, `?`, `@(a|b)`, `!(a|b)`, `{a,b}`) as a RegExp over the path. */
export function globToRegExp(glob) {
    let out = '';
    let i = 0;
    const g = glob.startsWith('/') || glob.startsWith('**') ? glob : `/${glob}`;
    while (i < g.length) {
        const c = g[i];
        if (c === '*' && g[i + 1] === '*') {
            // `**/` matches zero or more whole segments; a trailing `**` anything.
            if (g[i + 2] === '/') {
                out += '(?:.*/)?';
                i += 3;
            }
            else {
                out += '.*';
                i += 2;
            }
        }
        else if ((c === '@' || c === '!') && g[i + 1] === '(') {
            const end = g.indexOf(')', i);
            const alts = g.slice(i + 2, end).split('|').map(escape).join('|');
            // `!(x)` as minimatch reads it: one segment part that isn't exactly one of the alternatives.
            out += c === '@' ? `(?:${alts})` : `(?!(?:${alts})(?:/|$))[^/]*`;
            i = end + 1;
        }
        else if (c === '{') {
            const end = g.indexOf('}', i);
            out += `(?:${g.slice(i + 1, end).split(',').map(escape).join('|')})`;
            i = end + 1;
        }
        else if (c === '*') {
            out += '[^/]*';
            i++;
        }
        else if (c === '?') {
            out += '[^/]';
            i++;
        }
        else {
            out += escape(c);
            i++;
        }
    }
    return new RegExp(`^${out}$`);
}
const escape = (s) => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');
function matcher(rule) {
    if (rule.regex !== undefined) {
        try {
            const re = new RegExp(rule.regex);
            return (p) => re.test(p);
        }
        catch {
            return null;
        }
    }
    if (rule.source !== undefined) {
        const re = globToRegExp(rule.source);
        return (p) => re.test(p);
    }
    return null;
}
/** The headers a path gets: every rule that matches it, later rules overriding earlier ones. */
export function headersFor(rules, path) {
    const out = new Map();
    for (const rule of rules) {
        const m = matcher(rule);
        if (!m?.(path))
            continue;
        for (const h of rule.headers ?? [])
            if (h.key && h.value !== undefined)
                out.set(h.key.toLowerCase(), h.value);
    }
    return out;
}
/**
 * What is wrong with a firebase.json's security headers; empty when nothing is. Every app path
 * needs all five headers (any `Permissions-Policy` that turns the microphone off; camera and
 * location are the app's choice), and no Firebase `/__/` path may be frame-denied.
 */
export function checkSecurityHeaders(firebaseJson) {
    const hosting = firebaseJson?.hosting;
    const sites = (Array.isArray(hosting) ? hosting : [hosting]);
    const problems = [];
    for (const site of sites) {
        if (!site) {
            problems.push('firebase.json has no hosting section');
            continue;
        }
        const name = sites.length > 1 ? `${site.target ?? 'site'}: ` : '';
        const rules = site.headers ?? [];
        for (const rule of rules)
            if (!matcher(rule))
                problems.push(`${name}header rule ${JSON.stringify(rule.source ?? rule.regex)} has no usable source or regex`);
        for (const path of APP_PATHS) {
            const got = headersFor(rules, path);
            const want = securityHeaders();
            for (const { key, value } of want) {
                const actual = got.get(key.toLowerCase());
                if (actual === undefined)
                    problems.push(`${name}${path}: no ${key}`);
                else if (key === 'Permissions-Policy') {
                    if (!/(^|,\s*)microphone=\(\)/.test(actual))
                        problems.push(`${name}${path}: Permissions-Policy must include microphone=() (got "${actual}")`);
                }
                else if (key === 'Content-Security-Policy') {
                    for (const part of CONTENT_SECURITY_POLICY.split('; '))
                        if (!actual.includes(part))
                            problems.push(`${name}${path}: Content-Security-Policy lacks ${part}`);
                    for (const d of cspBlocksAssets(actual))
                        problems.push(`${name}${path}: Content-Security-Policy ${d} must allow the asset CDN ${ASSET_ORIGINS.production} (docs/one-site.md "Asset CDN")`);
                }
                else if (actual !== value)
                    problems.push(`${name}${path}: ${key} is "${actual}", want "${value}"`);
            }
        }
        for (const path of FIREBASE_PATHS) {
            const got = headersFor(rules, path);
            if (got.has('x-frame-options'))
                problems.push(`${name}${path}: X-Frame-Options would break Google sign-in; leave /__/ paths out (regex ${APP_PATHS_REGEX})`);
            if (/frame-ancestors/.test(got.get('content-security-policy') ?? ''))
                problems.push(`${name}${path}: frame-ancestors would break Google sign-in; leave /__/ paths out`);
        }
    }
    return problems;
}
