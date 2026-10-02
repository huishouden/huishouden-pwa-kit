/** Glyphs drawn inside the house (interior roughly x 120–392, y 236–420 on a 512 canvas). */
export declare const GLYPHS: {
    /** The portal: a door. */
    readonly home: "<rect x=\"222\" y=\"318\" width=\"68\" height=\"106\" rx=\"14\" fill=\"#2d6a4f\"/>";
    /** Tasks: a check mark. */
    readonly check: "<path d=\"M176 300 l40 40 l84 -88\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"34\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
    /** Spending: a payment card. */
    readonly card: "<rect x=\"166\" y=\"282\" width=\"180\" height=\"116\" rx=\"16\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"24\"/><path d=\"M166 322 h180\" stroke=\"#2d6a4f\" stroke-width=\"22\"/><path d=\"M196 364 h44\" stroke=\"#2d6a4f\" stroke-width=\"18\" stroke-linecap=\"round\"/>";
    /** Baby: a feeding bottle. */
    readonly bottle: "<path d=\"M240 272 v-16 a16 16 0 0 1 32 0 v16\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"20\" stroke-linecap=\"round\"/><rect x=\"216\" y=\"272\" width=\"80\" height=\"140\" rx=\"26\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"22\"/><path d=\"M228 318 h56 M228 352 h56\" stroke=\"#2d6a4f\" stroke-width=\"16\" stroke-linecap=\"round\"/>";
    /** Lists: three lines. */
    readonly list: "<path d=\"M184 290 h144 M184 334 h144 M184 378 h96\" stroke=\"#2d6a4f\" stroke-width=\"26\" stroke-linecap=\"round\"/>";
    /** Shopping: a cart. */
    readonly cart: "<path d=\"M168 280 h28 l26 92 h104 l22 -68 h-136\" fill=\"none\" stroke=\"#2d6a4f\" stroke-width=\"24\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"234\" cy=\"404\" r=\"14\" fill=\"#2d6a4f\"/><circle cx=\"316\" cy=\"404\" r=\"14\" fill=\"#2d6a4f\"/>";
};
export type Glyph = keyof typeof GLYPHS;
/** Full-bleed square for maskable icons (the launcher crops it); rounded tile otherwise. */
export declare function logoSvg(glyph: Glyph, { maskable }?: {
    maskable?: boolean | undefined;
}): string;
