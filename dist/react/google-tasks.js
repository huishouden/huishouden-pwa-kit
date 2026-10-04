import { jsx as _jsx } from "react/jsx-runtime";
/**
 * New Google Tasks that belong in the app (something told to the Gemini app or Google Assistant:
 * "add eggs to my list"), as suggestions or for the app to take in by itself. Built on
 * `useSuggestions`: it looks on open, when the member changes and when the app comes back into view,
 * only with a Google Tasks token this device already has (`cachedGoogleTasksToken`, which lasts an
 * hour after the member last connected here). It never opens Google's window.
 */
import { useCallback, useEffect, useRef } from 'react';
import { ListTodo } from 'lucide-react';
import { cachedGoogleTasksToken, googleTasks } from '../google-tasks';
import { formatDayShort, weekdayShort } from '../time';
import { kt } from '../i18n';
import { useKitT } from './i18n';
import { SuggestionsCard, useSuggestions } from './suggestions';
/** Open tasks in the chosen lists that the app doesn't have and this member hasn't dismissed, oldest first. */
export function useGoogleTasksSuggestions({ auth, app, listIds, isImported, since }) {
    const settings = useRef({ listIds, since });
    settings.current = { listIds, since };
    const look = useCallback(async (token) => {
        const { listIds, since } = settings.current;
        const lists = await Promise.all(listIds.map((id) => googleTasks(token, id, since === undefined ? {} : { updatedSince: since })));
        return lists.flat();
    }, []);
    const key = listIds.join(',');
    const state = useSuggestions({
        auth,
        source: `${app}-google-tasks`,
        cachedToken: () => cachedGoogleTasksToken(auth),
        look,
        idOf: (t) => t.id,
        isImported,
        order: (a, b) => a.updated - b.updated,
    });
    // A newly chosen list is looked at straight away rather than on the next open.
    const lastKey = useRef(key);
    const { scan } = state;
    useEffect(() => {
        if (lastKey.current === key)
            return;
        lastKey.current = key;
        void scan();
    }, [key, scan]);
    return state;
}
/** "Due Fri" or "Due Oct 14" for a task with a date. */
export function googleTaskDue(t, now = Date.now()) {
    if (!t.due)
        return null;
    const [y, m, d] = t.due.split('-').map(Number);
    const day = new Date(y, m - 1, d).getTime();
    const days = Math.round((day - new Date(new Date(now).toDateString()).getTime()) / 86_400_000);
    if (days === 0)
        return kt('time.dueToday');
    if (days === 1)
        return kt('time.dueTomorrow');
    return kt('googleTasks.dueOn', { day: days > 1 && days < 7 ? weekdayShort(day) : formatDayShort(day) });
}
/**
 * The card for new Google Tasks: "New in Google Tasks: Call the dentist · Due Fri · My Tasks", with
 * Add and Not this one (`SuggestionsCard`). `listTitle` names the Google list it came from.
 */
export function GoogleTasksSuggestions({ suggestions, listTitle, onAdd, onDismiss, now = Date.now() }) {
    const kt = useKitT();
    return (_jsx(SuggestionsCard, { suggestions: suggestions, idOf: (t) => t.id, titleOf: (t) => t.title, detailOf: (t) => [googleTaskDue(t, now), listTitle?.(t.listId)].filter(Boolean).join(' · ') || null, lead: kt('googleTasks.new'), label: kt('googleTasks.new'), moreLabel: kt('googleTasks.more'), icon: _jsx(ListTodo, { size: 20, className: "shrink-0 text-link", "aria-hidden": "true" }), onAdd: onAdd, onDismiss: onDismiss }));
}
