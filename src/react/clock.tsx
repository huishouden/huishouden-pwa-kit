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
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface Clock {
  /** Re-rendered every 15 seconds, so "ago" values move without a reload. */
  now: number;
  /** Current time for writes; also moves `now`, so a new entry is never "in the future". */
  read: () => number;
}

const ClockContext = createContext<Clock>({ now: Date.now(), read: () => Date.now() });

export function ClockProvider({ read, tickMs = 15_000, children }: { read: () => number; tickMs?: number; children: ReactNode }) {
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    tick();
    const id = setInterval(tick, tickMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [read, tickMs]);
  const readAndTick = useCallback(() => {
    const t = read();
    setNow(t);
    return t;
  }, [read]);
  return <ClockContext.Provider value={{ now, read: readAndTick }}>{children}</ClockContext.Provider>;
}

export const useClock = () => useContext(ClockContext);
