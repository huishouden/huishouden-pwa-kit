import { afterEach, describe, expect, test } from 'bun:test';
import lists from './fixtures/google-tasks/lists.json';
import page1 from './fixtures/google-tasks/tasks-page-1.json';
import page2 from './fixtures/google-tasks/tasks-page-2.json';

const { GOOGLE_TASKS_SCOPE, googleTaskLists, googleTasks, notImportedTasks, toGoogleTask } = await import('../src/google-tasks');

const realFetch = globalThis.fetch;
afterEach(() => void (globalThis.fetch = realFetch));

/** Google Tasks stand-in: answers from the fixtures and records each request. */
function serve(): { url: URL; auth: string | null }[] {
  const calls: { url: URL; auth: string | null }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    const body = url.pathname.endsWith('/users/@me/lists') ? lists : url.searchParams.get('pageToken') === 'page-2' ? page2 : page1;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe('Google Tasks', () => {
  test('reads the lists with the token', async () => {
    const calls = serve();
    expect(await googleTaskLists('t1')).toEqual([
      { id: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA6MDow', title: 'My Tasks' },
      { id: 'Z3JvY2VyaWVzLWxpc3QtaWQ', title: 'Groceries' },
    ]);
    expect(calls[0].auth).toBe('Bearer t1');
    expect(GOOGLE_TASKS_SCOPE).toBe('https://www.googleapis.com/auth/tasks.readonly');
  });

  test('reads every page of open tasks, oldest change first, dates as days, untitled and done left out', async () => {
    const calls = serve();
    const tasks = await googleTasks('t1', 'Z3JvY2VyaWVzLWxpc3QtaWQ', { updatedSince: Date.UTC(2031, 4, 1) });
    expect(tasks.map((t) => [t.title, t.due ?? null, t.notes])).toEqual([
      ['Call the dentist', '2031-05-16', 'Ask about Tuesday'],
      ['Eggs', null, ''],
      ['Oat milk', null, ''],
    ]);
    expect(calls.map((c) => c.url.searchParams.get('pageToken'))).toEqual([null, 'page-2']);
    expect(calls[0].url.pathname).toBe('/tasks/v1/lists/Z3JvY2VyaWVzLWxpc3QtaWQ/tasks');
    expect(calls[0].url.searchParams.get('showCompleted')).toBe('false');
    expect(calls[0].url.searchParams.get('updatedMin')).toBe('2031-05-01T00:00:00.000Z');
  });

  test('a task is read defensively', () => {
    expect(toGoogleTask({ id: 'a', title: 'x', deleted: true }, 'l')).toBeNull();
    expect(toGoogleTask({ title: 'x' }, 'l')).toBeNull();
    expect(toGoogleTask({ id: 'a', title: ' Milk ', status: 'completed', updated: 'nonsense' }, 'l')).toEqual({ id: 'a', listId: 'l', title: 'Milk', notes: '', updated: 0, completed: true });
  });

  test('tasks already taken in are not offered again', () => {
    const t = (id: string) => ({ id, listId: 'l', title: id, notes: '', updated: 0, completed: false });
    expect(notImportedTasks([t('a'), t('b'), t('c')], [{ googleTaskId: 'b' }, { googleTaskId: null }, {}]).map((x) => x.id)).toEqual(['a', 'c']);
  });
});
