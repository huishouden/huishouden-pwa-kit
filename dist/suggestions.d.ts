/**
 * "Not this one" for suggestions from a member's Google services (calendar events, Google Tasks):
 * dismissed ids kept per source and member in localStorage, on this device. The React hook that
 * looks for suggestions is `useSuggestions` in `./react/suggestions`.
 */
/** How often an open app looks again when it comes back into view. */
export declare const SUGGESTION_RESCAN_MS: number;
/** Ids this member said "Not this one" to for a source (e.g. "pet-calendar"), on this device. */
export declare function dismissedIds(source: string, member: string): string[];
/** Remembers "Not this one", so the thing is never suggested to this member again. */
export declare function dismissId(source: string, member: string, id: string): string[];
