/** Glyphs drawn inside the house (interior roughly x 120–392, y 236–420 on a 512 canvas). */
export declare const GLYPHS: {
    /** The portal: a door. */
    readonly home: "<rect x=\"222\" y=\"318\" width=\"68\" height=\"106\" rx=\"14\" fill=\"#2d6a4f\"/>";
    /** Tasks: a check mark. */
    readonly check: "<path d=\"M176 300 l40 40 l84 -88\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"34\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
    /** Spending: a payment card. Bills: `receipt`. */
    readonly card: "<rect x=\"166\" y=\"282\" width=\"180\" height=\"116\" rx=\"16\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"24\"/><path d=\"M166 322 h180\" stroke=\"#2d6a4f\" stroke-width=\"22\"/><path d=\"M196 364 h44\" stroke=\"#2d6a4f\" stroke-width=\"18\" stroke-linecap=\"round\"/>";
    /** Bills: a receipt with a torn edge and two lines. */
    readonly receipt: "<path d=\"M186 272 h140 v124 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 l-17.5 16 l-17.5 -16 z\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"22\" stroke-linejoin=\"round\"/><path d=\"M216 318 h80 M216 356 h52\" stroke=\"#2d6a4f\" stroke-width=\"16\" stroke-linecap=\"round\"/>";
    /** Baby: a feeding bottle. */
    readonly bottle: "<path d=\"M240 272 v-16 a16 16 0 0 1 32 0 v16\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"20\" stroke-linecap=\"round\"/><rect x=\"216\" y=\"272\" width=\"80\" height=\"140\" rx=\"26\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"22\"/><path d=\"M228 318 h56 M228 352 h56\" stroke=\"#2d6a4f\" stroke-width=\"16\" stroke-linecap=\"round\"/>";
    /** Pet: a paw print. */
    readonly paw: "<ellipse cx=\"256\" cy=\"362\" rx=\"46\" ry=\"38\" fill=\"#2d6a4f\"/><circle cx=\"204\" cy=\"306\" r=\"17\" fill=\"#2d6a4f\"/><circle cx=\"236\" cy=\"278\" r=\"17\" fill=\"#2d6a4f\"/><circle cx=\"276\" cy=\"278\" r=\"17\" fill=\"#2d6a4f\"/><circle cx=\"308\" cy=\"306\" r=\"17\" fill=\"#2d6a4f\"/>";
    /** Home upkeep: a wrench. */
    readonly wrench: "<path d=\"M200 398 l84 -84\" stroke=\"#2d6a4f\" stroke-width=\"32\" stroke-linecap=\"round\"/><path d=\"M286 268 a40 40 0 1 0 40 40 l-26 2 l-14 -14 z\" fill=\"#2d6a4f\"/>";
    /** Car: a small car. */
    readonly car: "<path d=\"M210 322 l16 -34 h60 l16 34\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"20\" stroke-linejoin=\"round\"/><rect x=\"176\" y=\"318\" width=\"160\" height=\"58\" rx=\"18\" fill=\"#2d6a4f\"/><circle cx=\"216\" cy=\"380\" r=\"18\" fill=\"#2d6a4f\" stroke=\"#faf9f5\" stroke-width=\"8\"/><circle cx=\"296\" cy=\"380\" r=\"18\" fill=\"#2d6a4f\" stroke=\"#faf9f5\" stroke-width=\"8\"/>";
    /** Lists: three lines. */
    readonly list: "<path d=\"M184 290 h144 M184 334 h144 M184 378 h96\" stroke=\"#2d6a4f\" stroke-width=\"26\" stroke-linecap=\"round\"/>";
    /** Shopping: a cart. */
    readonly cart: "<path d=\"M168 280 h28 l26 92 h104 l22 -68 h-136\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"24\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"234\" cy=\"404\" r=\"14\" fill=\"#2d6a4f\"/><circle cx=\"316\" cy=\"404\" r=\"14\" fill=\"#2d6a4f\"/>";
    /** Health: a capsule. */
    readonly pill: "<g transform=\"rotate(-45 256 344)\"><rect x=\"219\" y=\"266\" width=\"74\" height=\"156\" rx=\"37\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"22\"/><path d=\"M219 344 v41 a37 37 0 0 0 74 0 v-41 z\" fill=\"#2d6a4f\"/></g>";
};
export type Glyph = keyof typeof GLYPHS;
/** Full-bleed square for maskable icons (the launcher crops it); rounded tile otherwise. */
export declare function logoSvg(glyph: Glyph, { maskable }?: {
    maskable?: boolean | undefined;
}): string;
