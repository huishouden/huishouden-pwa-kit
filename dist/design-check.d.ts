/**
 * Mechanical half of the Huishouden design language (DESIGN.md): flags what code can decide on its
 * own. Judgment calls (hierarchy, copy tone) belong to the design reviewer.
 */
export interface DesignFinding {
    line: number;
    rule: string;
    text: string;
}
/** Theme and chart colours (DESIGN.md "Colour"), lowercase. */
export declare const PALETTE_HEX: Set<string>;
export declare function checkSource(source: string, kind: 'markup' | 'style' | 'script'): DesignFinding[];
export declare function kindOf(path: string): 'markup' | 'style' | 'script' | null;
