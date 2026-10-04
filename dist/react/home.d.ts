import { type GeocodeOptions, type HomeCandidate, type HouseholdHome } from '../home';
/** The current household's home (set by `watchHousehold`); re-renders when it changes. */
export declare function useHome(): HouseholdHome | undefined;
/**
 * A small, still map of a point from OpenStreetMap's tiles (free, with the attribution their policy
 * asks for), a pin on the house or a circle on an approximate one, and a link to the full map.
 */
export declare function HomeMap({ point, label, approximate }: {
    point: {
        lat: number;
        lng: number;
    };
    label: string;
    approximate?: boolean;
}): import("react").JSX.Element;
export interface HomeEditorProps {
    home?: HouseholdHome;
    /** Admins and members; helpers and kids see the address only. */
    canChange: boolean;
    onSave: (home: HomeCandidate) => Promise<void>;
    onRemove: () => Promise<void>;
    /** A member's name for "Set by"; the email when not given. */
    nameOf?: (email: string) => string;
    /** For tests: stands in for the network. */
    geocode?: GeocodeOptions;
}
/**
 * The household's home: shown with a map, and for admins and members found by address search or
 * from this device's location, saved whole or, with "Approximate only", as its neighbourhood.
 */
export declare function HomeEditor({ home, canChange, onSave, onRemove, nameOf, geocode }: HomeEditorProps): import("react").JSX.Element;
