/**
 * "Not this one" for suggestions from a member's Google services (calendar events, Google Tasks):
 * dismissed ids kept per source and member in localStorage, on this device. The React hook that
 * looks for suggestions is `useSuggestions` in `./react/suggestions`.
 */
/** How often an open app looks again when it comes back into view. */
export const SUGGESTION_RESCAN_MS = 30 * 60_000;
/** Dismissed ids kept per member and source; the oldest go first. */
const DISMISSED_MAX = 200;
const storageKey = (source, member) => `${source.toLowerCase()}-dismissed-${member}`;
/** Ids this member said "Not this one" to for a source (e.g. "pet-calendar"), on this device. */
export function dismissedIds(source, member) {
    try {
        const list = JSON.parse(globalThis.localStorage?.getItem(storageKey(source, member)) ?? '[]');
        return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
    }
    catch {
        return [];
    }
}
/** Remembers "Not this one", so the thing is never suggested to this member again. */
export function dismissId(source, member, id) {
    const list = [...dismissedIds(source, member).filter((x) => x !== id), id].slice(-DISMISSED_MAX);
    try {
        globalThis.localStorage?.setItem(storageKey(source, member), JSON.stringify(list));
    }
    catch {
        // Storage full or unavailable: the dismissal still holds for this visit.
    }
    return list;
}
