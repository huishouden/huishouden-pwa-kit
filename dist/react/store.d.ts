import { type Backend } from '../store.js';
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
export declare function useSampleStore<D extends object, C extends string = string>(initial: D | (() => D), key?: (col: C) => keyof D): SampleStore<D, C>;
