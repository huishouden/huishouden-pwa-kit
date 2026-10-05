/**
 * The suite's Firebase Hosting site (docs/one-site.md): every app is served at
 * `https://<SUITE_SITE>.web.app/<app>/`. The one place the production address is set: deploys,
 * link previews, the asset CDN's CORS, smoke tests, sign-in origin checks and the bootstrap derive it from here
 * (docs/one-site.md "Moving the suite").
 */
export declare const SUITE_SITE = "huishouden-piekstra";
/** `<SUITE_SITE>.web.app` */
export declare const SUITE_HOST = "huishouden-piekstra.web.app";
/** `https://<SUITE_SITE>.web.app` */
export declare const SUITE_ORIGIN = "https://huishouden-piekstra.web.app";
/** The app path (`/pet/`, the portal `/`) whose folder holds `path`: the longest of `appPaths` it starts with. */
export declare function appOf(path: string, appPaths: string[]): string | undefined;
