/**
 * Sample data for the signed-out app, in React state behind a `./store` backend: fully clickable,
 * nothing saved, a reload starts over.
 *
 * ```tsx
 * const { data, read, backend } = useSampleStore(demoData);
 * const actions = useMemo(() => createActions(backend, read, me, clock), [backend, read]);
 * ```
 */
import { useState } from 'react';
import { memoryStore } from '../store.js';
/**
 * `initial` (a value, or a function run once) held in memory; `read`, `patch` and `backend` keep
 * their identity for the life of the component. `key` maps an op's list name to the data key.
 */
export function useSampleStore(initial, key) {
    const [data, setData] = useState(initial);
    const [store] = useState(() => memoryStore(data, setData, key));
    return { data, read: store.read, patch: store.patch, backend: store.backend };
}
