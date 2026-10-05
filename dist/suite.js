// The suite's production address, in a module of its own that imports nothing, so every other
// module (./site, ./asset-cdn) can derive from it without import cycles.
/**
 * The suite's Firebase Hosting site (docs/one-site.md): every app is served at
 * `https://<SUITE_SITE>.web.app/<app>/`. The one place the production address is set: deploys,
 * link previews, the asset CDN's CORS, smoke tests, sign-in origin checks and the bootstrap derive it from here
 * (docs/one-site.md "Moving the suite").
 */
export const SUITE_SITE = 'huishouden-piekstra';
/** `<SUITE_SITE>.web.app` */
export const SUITE_HOST = `${SUITE_SITE}.web.app`;
/** `https://<SUITE_SITE>.web.app` */
export const SUITE_ORIGIN = `https://${SUITE_HOST}`;
