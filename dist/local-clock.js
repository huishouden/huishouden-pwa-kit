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
const formatters = new Map();
function formatter(timeZone) {
    let f = formatters.get(timeZone);
    if (!f) {
        // Only read back as numbers (formatToParts), never shown: a fixed locale keeps the parts' order.
        f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); // locale-check:allow
        formatters.set(timeZone, f);
    }
    return f;
}
/** Whether the runtime knows the IANA zone ("Europe/Amsterdam"). */
export function isTimeZone(zone) {
    if (typeof zone !== 'string' || !zone || zone.length > 64)
        return false;
    try {
        formatter(zone);
        return true;
    }
    catch {
        return false;
    }
}
/** ms to add to UTC for the zone's wall clock at `t`. */
export function offsetAt(timeZone, t) {
    const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return wall - Math.floor(t / 1000) * 1000;
}
export class LocalClock {
    timeZone;
    realNow;
    constructor(timeZone, realNow = Date.now) {
        this.timeZone = timeZone;
        this.realNow = realNow;
    }
    /** Absolute now (ms). */
    now() {
        return this.realNow();
    }
    /** An absolute time in the local frame. */
    local(t) {
        return t + offsetAt(this.timeZone, t);
    }
    /** A local-frame time back to absolute (the earlier of two on a clock change's repeated hour). */
    utc(local) {
        const first = local - offsetAt(this.timeZone, local);
        return local - offsetAt(this.timeZone, first);
    }
    /** Now in the local frame. */
    localNow() {
        return this.local(this.realNow());
    }
    /** "2031-01-05" today, on the person's calendar. */
    today() {
        return new Date(this.localNow()).toISOString().slice(0, 10);
    }
    /**
     * An absolute time from a local "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (an ISO time with an offset or
     * Z is taken as given). Null when it doesn't parse.
     */
    parse(text) {
        const s = text.trim();
        let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) {
            const local = Date.UTC(+m[1], +m[2] - 1, +m[3]);
            return Number.isNaN(local) || new Date(local).getUTCDate() !== +m[3] ? null : { at: this.utc(local), allDay: true };
        }
        m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
        if (m) {
            const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
            if (Number.isNaN(local) || +m[4] > 23 || +m[5] > 59 || new Date(local).getUTCDate() !== +m[3])
                return null;
            return { at: this.utc(local), allDay: false };
        }
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
            const at = Date.parse(s);
            return Number.isNaN(at) ? null : { at, allDay: false };
        }
        return null;
    }
    /** "2031-01-05T08:00" (local) for an absolute time. */
    isoLocal(t) {
        return new Date(this.local(t)).toISOString().slice(0, 16);
    }
}
