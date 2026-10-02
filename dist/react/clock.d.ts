/**
 * A shared "now" that moves on its own: every 15 seconds and when the screen comes back, so "2h
 * 10m ago" and "Due today" stay true on a tablet that is never reloaded. `read` lets a demo run on
 * its own clock (a fixed day), and tests freeze it.
 *
 * ```tsx
 * <ClockProvider read={demo ? demoClock : Date.now}>…</ClockProvider>
 * const { now, read } = useClock(); // now for display, read() for a write's timestamp
 * ```
 */
import { type ReactNode } from 'react';
export interface Clock {
    /** Re-rendered every 15 seconds, so "ago" values move without a reload. */
    now: number;
    /** Current time for writes; also moves `now`, so a new entry is never "in the future". */
    read: () => number;
}
export declare function ClockProvider({ read, tickMs, children }: {
    read: () => number;
    tickMs?: number;
    children: ReactNode;
}): import("react").JSX.Element;
export declare const useClock: () => Clock;
