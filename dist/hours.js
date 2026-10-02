/**
 * Business hours in OpenStreetMap's `opening_hours` format ("Mo-Fr 07:00-18:00; Sa 08:00-16:00"),
 * so an app can say "Closes 6:00 PM" or warn that a place shuts before an errand is due.
 *
 * Covers the forms most shops use: day ranges and lists, several time ranges a day, "off",
 * and "24/7". Anything else (public holidays, months, sunrise) makes `parseOpeningHours` return
 * null, and apps show the text as written rather than guess.
 */
const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function dayIndex(code) {
    return DAY_CODES.indexOf(code);
}
function parseDays(spec) {
    const days = [];
    for (const part of spec.split(',')) {
        const range = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(part.trim());
        if (!range)
            return null;
        const from = dayIndex(range[1]);
        const to = range[2] ? dayIndex(range[2]) : from;
        if (from < 0 || to < 0)
            return null;
        // "Fr-Mo" wraps through the weekend.
        for (let d = from;; d = (d + 1) % 7) {
            days.push(d);
            if (d === to)
                break;
        }
    }
    return days;
}
function parseTimes(spec) {
    if (/^(off|closed)$/i.test(spec))
        return [];
    const periods = [];
    for (const part of spec.split(',')) {
        const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim());
        if (!m)
            return null;
        const open = Number(m[1]) * 60 + Number(m[2]);
        let close = Number(m[3]) * 60 + Number(m[4]);
        if (close <= open)
            close += 24 * 60; // past midnight, e.g. 18:00-02:00
        periods.push([open, close]);
    }
    return periods;
}
export function parseOpeningHours(text) {
    const source = text?.trim();
    if (!source)
        return null;
    if (source === '24/7')
        return Array.from({ length: 7 }, () => [[0, 24 * 60]]);
    const week = Array.from({ length: 7 }, () => []);
    for (const rule of source.split(';').map((r) => r.trim()).filter(Boolean)) {
        // "Mo-Fr 07:00-18:00", "Sa off", or "08:00-20:00" for every day. Later rules replace earlier ones.
        const m = /^(?:([A-Z][a-z](?:-[A-Z][a-z])?(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+)?(.+)$/.exec(rule);
        if (!m)
            return null;
        const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
        const times = parseTimes(m[2].trim());
        if (!days || !times)
            return null;
        for (const d of days)
            week[d] = times.map((p) => [p[0], p[1]]);
    }
    return week;
}
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();
/** Open at that moment, counting a period that started the evening before and runs past midnight. */
export function isOpenAt(hours, date) {
    const day = date.getDay();
    const now = minutesOf(date);
    if (hours[day].some(([open, close]) => now >= open && now < close))
        return true;
    const yesterday = hours[(day + 6) % 7];
    return yesterday.some(([, close]) => close > 24 * 60 && now < close - 24 * 60);
}
/**
 * When the place closes, if it is open at `date`: the end of the period it is in, including one
 * that started the evening before and runs past midnight. Null when it is closed at `date`.
 */
export function closesAt(hours, date) {
    const day = date.getDay();
    const now = minutesOf(date);
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    const at = (minutes) => new Date(midnight.getTime() + minutes * 60_000);
    const yesterday = hours[(day + 6) % 7].find(([, close]) => close > 24 * 60 && now < close - 24 * 60);
    if (yesterday)
        return at(yesterday[1] - 24 * 60);
    const today = hours[day].find(([open, close]) => now >= open && now < close);
    return today ? at(today[1]) : null;
}
/** "7:00 AM – 6:00 PM", "Closed" or "Open 24 hours" for that date's day; times in `locale`. */
export function describeDay(hours, date, locale = navigator.language) {
    const periods = hours[date.getDay()];
    if (periods.length === 0)
        return 'Closed';
    const time = (m) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    if (periods.length === 1 && periods[0][0] === 0 && periods[0][1] === 24 * 60)
        return 'Open 24 hours';
    return periods.map(([o, c]) => `${time(o)} – ${time(c)}`).join(', ');
}
