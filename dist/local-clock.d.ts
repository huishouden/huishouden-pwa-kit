/**
 * The person's local time on a server whose clock is UTC (a Cloudflare Worker).
 *
 * The kit's day and dose logic (`./time`, `./dose`, `./agenda-core`) reads days with the runtime's
 * local-time getters, which in a Worker are UTC. The connector therefore works in a "local frame":
 * an absolute time `t` becomes `local(t) = t + offset(t)`, whose UTC fields are the person's wall
 * clock. Kit functions given local-frame times answer exactly as on the person's own device (slot
 * keys like "2031-01-05T08:00", "today", "overdue"), and `utc()` turns a local-frame time back into
 * an absolute one for storage. Formatting a local-frame time with the runtime's (UTC) formatters
 * shows the person's clock.
 */
/** Whether the runtime knows the IANA zone ("Europe/Amsterdam"). */
export declare function isTimeZone(zone: unknown): zone is string;
/** ms to add to UTC for the zone's wall clock at `t`. */
export declare function offsetAt(timeZone: string, t: number): number;
export declare class LocalClock {
    readonly timeZone: string;
    private readonly realNow;
    constructor(timeZone: string, realNow?: () => number);
    /** Absolute now (ms). */
    now(): number;
    /** An absolute time in the local frame. */
    local(t: number): number;
    /** A local-frame time back to absolute (the earlier of two on a clock change's repeated hour). */
    utc(local: number): number;
    /** Now in the local frame. */
    localNow(): number;
    /** "2031-01-05" today, on the person's calendar. */
    today(): string;
    /**
     * An absolute time from a local "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (an ISO time with an offset or
     * Z is taken as given). Null when it doesn't parse.
     */
    parse(text: string): {
        at: number;
        allDay: boolean;
    } | null;
    /** "2031-01-05T08:00" (local) for an absolute time. */
    isoLocal(t: number): string;
}
