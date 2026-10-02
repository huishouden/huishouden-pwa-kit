/**
 * New Google Tasks that belong in the app (something told to the Gemini app or Google Assistant:
 * "add eggs to my list"), as suggestions or for the app to take in by itself. Built on
 * `useSuggestions`: it looks on open, when the member changes and when the app comes back into view,
 * only with a Google Tasks token this device already has (`cachedGoogleTasksToken`, which lasts an
 * hour after the member last connected here). It never opens Google's window.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Auth } from 'firebase/auth';
import { ListTodo } from 'lucide-react';
import { cachedGoogleTasksToken, googleTasks, type GoogleTask } from '../google-tasks';
import { formatDayShort } from '../time';
import { SuggestionsCard, useSuggestions, type SuggestionsState } from './suggestions';

export interface GoogleTasksSuggestionsOptions {
  /** The app's one `Auth`. */
  auth: Auth;
  /** The app's short name ("tasks"): keys the dismissals. */
  app: string;
  /** The Google Tasks lists to look in. */
  listIds: readonly string[];
  /** Whether the app already has this task, e.g. by a stored `googleTaskId`. */
  isImported: (t: GoogleTask) => boolean;
  /** Ignore tasks last changed before this (ms), e.g. when the list was connected. */
  since?: number;
}

/** Open tasks in the chosen lists that the app doesn't have and this member hasn't dismissed, oldest first. */
export function useGoogleTasksSuggestions({ auth, app, listIds, isImported, since }: GoogleTasksSuggestionsOptions): SuggestionsState<GoogleTask> {
  const settings = useRef({ listIds, since });
  settings.current = { listIds, since };
  const look = useCallback(async (token: string) => {
    const { listIds, since } = settings.current;
    const lists = await Promise.all(listIds.map((id) => googleTasks(token, id, since === undefined ? {} : { updatedSince: since })));
    return lists.flat();
  }, []);
  const key = listIds.join(',');
  const state = useSuggestions<GoogleTask>({
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
    if (lastKey.current === key) return;
    lastKey.current = key;
    void scan();
  }, [key, scan]);
  return state;
}

/** "Due Fri" or "Due Oct 14" for a task with a date. */
export function googleTaskDue(t: GoogleTask, now: number = Date.now()): string | null {
  if (!t.due) return null;
  const [y, m, d] = t.due.split('-').map(Number);
  const day = new Date(y, m - 1, d).getTime();
  const days = Math.round((day - new Date(new Date(now).toDateString()).getTime()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1 && days < 7) return `Due ${new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}`;
  return `Due ${formatDayShort(day)}`;
}

/**
 * The card for new Google Tasks: "New in Google Tasks: Call the dentist · Due Fri · My Tasks", with
 * Add and Not this one (`SuggestionsCard`). `listTitle` names the Google list it came from.
 */
export function GoogleTasksSuggestions({ suggestions, listTitle, onAdd, onDismiss, now = Date.now() }: {
  suggestions: GoogleTask[];
  listTitle?: (listId: string) => string | undefined;
  onAdd: (t: GoogleTask) => void;
  onDismiss: (t: GoogleTask) => void;
  now?: number;
}) {
  return (
    <SuggestionsCard
      suggestions={suggestions}
      idOf={(t) => t.id}
      titleOf={(t) => t.title}
      detailOf={(t) => [googleTaskDue(t, now), listTitle?.(t.listId)].filter(Boolean).join(' · ') || null}
      lead="New in Google Tasks"
      label="New in Google Tasks"
      moreLabel="More new Google Tasks"
      icon={<ListTodo size={20} className="shrink-0 text-forest-700 dark:text-forest-300" aria-hidden="true" />}
      onAdd={onAdd}
      onDismiss={onDismiss}
    />
  );
}
