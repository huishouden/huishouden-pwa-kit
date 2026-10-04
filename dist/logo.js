/**
 * The Huishouden logo family. Every app shares the tile, house and roof; only the glyph inside the
 * house differs, so the icons read as one suite on a home screen. Geometry from the first app's icon.
 */
const FOREST_700 = '#1b4332';
const FOREST_600 = '#2d6a4f';
const CREAM = '#faf9f5';
const TERRACOTTA = '#c86d51';
/** Glyphs drawn inside the house (interior roughly x 120–392, y 236–420 on a 512 canvas). */
export const GLYPHS = {
    /** The portal: a door. */
    home: `<rect x="222" y="318" width="68" height="106" rx="14" fill="${FOREST_600}"/>`,
    /** Tasks: a check mark. */
    check: `<path d="M176 300 l40 40 l84 -88" fill="none" stroke="${FOREST_600}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`,
    /** Spending: a payment card. */
    card: `<rect x="166" y="282" width="180" height="116" rx="16" fill="none" stroke="${FOREST_600}" stroke-width="24"/><path d="M166 322 h180" stroke="${FOREST_600}" stroke-width="22"/><path d="M196 364 h44" stroke="${FOREST_600}" stroke-width="18" stroke-linecap="round"/>`,
    /** Baby: a feeding bottle. */
    bottle: `<path d="M240 272 v-16 a16 16 0 0 1 32 0 v16" fill="none" stroke="${FOREST_600}" stroke-width="20" stroke-linecap="round"/><rect x="216" y="272" width="80" height="140" rx="26" fill="none" stroke="${FOREST_600}" stroke-width="22"/><path d="M228 318 h56 M228 352 h56" stroke="${FOREST_600}" stroke-width="16" stroke-linecap="round"/>`,
    /** Pet: a paw print. */
    paw: `<ellipse cx="256" cy="362" rx="46" ry="38" fill="${FOREST_600}"/><circle cx="204" cy="306" r="17" fill="${FOREST_600}"/><circle cx="236" cy="278" r="17" fill="${FOREST_600}"/><circle cx="276" cy="278" r="17" fill="${FOREST_600}"/><circle cx="308" cy="306" r="17" fill="${FOREST_600}"/>`,
    /** Home upkeep: a wrench. */
    wrench: `<path d="M200 398 l84 -84" stroke="${FOREST_600}" stroke-width="32" stroke-linecap="round"/><path d="M286 268 a40 40 0 1 0 40 40 l-26 2 l-14 -14 z" fill="${FOREST_600}"/>`,
    /** Car: a small car. */
    car: `<path d="M210 322 l16 -34 h60 l16 34" fill="none" stroke="${FOREST_600}" stroke-width="20" stroke-linejoin="round"/><rect x="176" y="318" width="160" height="58" rx="18" fill="${FOREST_600}"/><circle cx="216" cy="380" r="18" fill="${FOREST_600}" stroke="#faf9f5" stroke-width="8"/><circle cx="296" cy="380" r="18" fill="${FOREST_600}" stroke="#faf9f5" stroke-width="8"/>`,
    /** Lists: three lines. */
    list: `<path d="M184 290 h144 M184 334 h144 M184 378 h96" stroke="${FOREST_600}" stroke-width="26" stroke-linecap="round"/>`,
    /** Shopping: a cart. */
    cart: `<path d="M168 280 h28 l26 92 h104 l22 -68 h-136" fill="none" stroke="${FOREST_600}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><circle cx="234" cy="404" r="14" fill="${FOREST_600}"/><circle cx="316" cy="404" r="14" fill="${FOREST_600}"/>`,
    /** Health: a capsule. */
    pill: `<g transform="rotate(-45 256 344)"><rect x="219" y="266" width="74" height="156" rx="37" fill="none" stroke="${FOREST_600}" stroke-width="22"/><path d="M219 344 v41 a37 37 0 0 0 74 0 v-41 z" fill="${FOREST_600}"/></g>`,
};
/** Full-bleed square for maskable icons (the launcher crops it); rounded tile otherwise. */
export function logoSvg(glyph, { maskable = false } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect class="hh-logo-tile" width="512" height="512" rx="${maskable ? 0 : 112}" fill="${FOREST_700}"/>
  <g transform="translate(256 262) scale(${maskable ? 0.72 : 0.9}) translate(-256 -262)">
    <path d="M256 96 L416 220 V400 a24 24 0 0 1 -24 24 H120 a24 24 0 0 1 -24 -24 V220 Z" fill="${CREAM}"/>
    <path d="M256 96 L416 220 M256 96 L96 220" stroke="${TERRACOTTA}" stroke-width="36" stroke-linecap="round"/>
    ${GLYPHS[glyph]}
  </g>
</svg>
`;
}
