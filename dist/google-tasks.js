import { cachedGoogleToken, googleAccessToken, googleFetch } from './google-token';
import { kt } from './i18n.js';
/**
 * Reads the person's Google Tasks (read-only), so something said to an assistant ("add eggs to my
 * list": the Gemini app and Google Assistant write Google Tasks) can reach a household list. The
 * app never writes to Google Tasks.
 *
 * Like every Google API here, the token comes from Google Identity Services (`./google-token`):
 * `googleTasksToken` from a tap asks once, then `cachedGoogleTasksToken` lets code that runs on
 * its own (on open, when the app comes back into view) read for the rest of that token's hour,
 * without ever opening a window. Browser tests stand in with `window.__mockGoogleTasks`,
 * `window.__mockGoogleTaskLists` and `window.__mockGoogleTasksToken`.
 */
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks.readonly';
const SCOPES = [GOOGLE_TASKS_SCOPE];
const API = 'https://tasks.googleapis.com/tasks/v1';
/** A token that can read Google Tasks: from a tap, asking once; kept for its hour on this device. */
export function googleTasksToken(auth) {
    if (typeof window !== 'undefined' && typeof window.__mockGoogleTasksToken === 'string')
        return Promise.resolve(window.__mockGoogleTasksToken);
    return googleAccessToken(auth, SCOPES, { persist: true, deniedMessage: kt('googleTasks.denied') });
}
/** The Google Tasks token this device already has, without asking anyone; null when there is none. */
export function cachedGoogleTasksToken(auth) {
    if (typeof window !== 'undefined' && typeof window.__mockGoogleTasksToken === 'string')
        return window.__mockGoogleTasksToken;
    return cachedGoogleToken(auth, SCOPES);
}
/** One task as the API returns it, read defensively; null for deleted, untitled or malformed ones. */
export function toGoogleTask(raw, listId) {
    const title = raw.title?.trim();
    if (!raw.id || !title || raw.deleted)
        return null;
    const updated = Date.parse(raw.updated ?? '');
    // `due` is a date written as midnight UTC ("2031-05-16T00:00:00.000Z"): the date part is the day.
    const due = /^\d{4}-\d{2}-\d{2}/.exec(raw.due ?? '')?.[0];
    return {
        id: raw.id,
        listId,
        title,
        notes: (raw.notes ?? '').trim(),
        ...(due ? { due } : {}),
        updated: Number.isFinite(updated) ? updated : 0,
        completed: raw.status === 'completed',
    };
}
/** The person's Google Tasks lists ("My Tasks", "Groceries"), in Google's order. */
export async function googleTaskLists(token) {
    if (typeof window !== 'undefined' && window.__mockGoogleTaskLists)
        return window.__mockGoogleTaskLists;
    const lists = [];
    let pageToken;
    do {
        const url = new URL(`${API}/users/@me/lists`);
        url.searchParams.set('maxResults', '100');
        if (pageToken)
            url.searchParams.set('pageToken', pageToken);
        const page = await googleFetch(token, url, { label: 'Google Tasks' });
        for (const l of page.items ?? [])
            if (l.id)
                lists.push({ id: l.id, title: l.title?.trim() || kt('googleTasks.untitledList') });
        pageToken = page.nextPageToken;
    } while (pageToken);
    return lists;
}
/** The open tasks in one list (all pages), oldest change first. */
export async function googleTasks(token, listId, { updatedSince, showCompleted = false } = {}) {
    if (typeof window !== 'undefined' && window.__mockGoogleTasks) {
        return window.__mockGoogleTasks.filter((t) => t.listId === listId && (showCompleted || !t.completed) && (updatedSince === undefined || t.updated > updatedSince));
    }
    const tasks = [];
    let pageToken;
    do {
        const url = new URL(`${API}/lists/${encodeURIComponent(listId)}/tasks`);
        url.searchParams.set('maxResults', '100');
        url.searchParams.set('showCompleted', String(showCompleted));
        url.searchParams.set('showHidden', String(showCompleted));
        if (updatedSince !== undefined)
            url.searchParams.set('updatedMin', new Date(updatedSince).toISOString());
        if (pageToken)
            url.searchParams.set('pageToken', pageToken);
        const page = await googleFetch(token, url, { label: 'Google Tasks' });
        for (const raw of page.items ?? []) {
            const task = toGoogleTask(raw, listId);
            if (task && (showCompleted || !task.completed))
                tasks.push(task);
        }
        pageToken = page.nextPageToken;
    } while (pageToken);
    return tasks.sort((a, b) => a.updated - b.updated);
}
/** Tasks no record has taken in yet, oldest first. */
export function notImportedTasks(tasks, records) {
    const taken = new Set(records.map((r) => r.googleTaskId).filter(Boolean));
    return tasks.filter((t) => !taken.has(t.id));
}
