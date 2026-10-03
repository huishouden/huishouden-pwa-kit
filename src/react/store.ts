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
import { memoryStore, type Backend } from '../store.js';

export interface SampleStore<D extends object, C extends string> {
  /** The data to render. */
  data: D;
  /** The data as of the last write, also between renders (for actions that read right after another). */
  read: () => D;
  /** Any other change (settings, contacts): applied at once like a write. */
  patch: (f: (data: D) => D) => void;
  backend: Backend<C>;
}

/**
 * `initial` (a value, or a function run once) held in memory; `read`, `patch` and `backend` keep
 * their identity for the life of the component. `key` maps an op's list name to the data key.
 */
export function useSampleStore<D extends object, C extends string = string>(initial: D | (() => D), key?: (col: C) => keyof D): SampleStore<D, C> {
  const [data, setData] = useState<D>(initial);
  const [store] = useState(() => memoryStore<D, C>(data, setData, key));
  return { data, read: store.read, patch: store.patch, backend: store.backend };
}
