import { jsx as _jsx } from "react/jsx-runtime";
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
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
const ClockContext = createContext({ now: Date.now(), read: () => Date.now() });
export function ClockProvider({ read, tickMs = 15_000, children }) {
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
    return _jsx(ClockContext.Provider, { value: { now, read: readAndTick }, children: children });
}
export const useClock = () => useContext(ClockContext);
