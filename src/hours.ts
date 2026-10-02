/**
 * Business hours in OpenStreetMap's `opening_hours` format ("Mo-Fr 07:00-18:00; Sa 08:00-16:00"),
 * so an app can say "Closes 6:00 PM" or warn that a place shuts before an errand is due.
 *
 * Covers the forms most shops use: day ranges and lists, several time ranges a day, "off",
 * and "24/7". Anything else (public holidays, months, sunrise) makes `parseOpeningHours` return
 * null, and apps show the text as written rather than guess.
 */

/** Opening periods per weekday (0 = Sunday), in minutes after midnight; empty = closed. */
export type WeeklyHours = [number, number][][];

const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function dayIndex(code: string): number {
  return DAY_CODES.indexOf(code);
}

function parseDays(spec: string): number[] | null {
  const days: number[] = [];
  for (const part of spec.split(',')) {
    const range = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(part.trim());
    if (!range) return null;
    const from = dayIndex(range[1]);
    const to = range[2] ? dayIndex(range[2]) : from;
    if (from < 0 || to < 0) return null;
    // "Fr-Mo" wraps through the weekend.
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === to) break;
    }
  }
  return days;
}

function parseTimes(spec: string): [number, number][] | null {
  if (/^(off|closed)$/i.test(spec)) return [];
  const periods: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const open = Number(m[1]) * 60 + Number(m[2]);
    let close = Number(m[3]) * 60 + Number(m[4]);
    if (close <= open) close += 24 * 60; // past midnight, e.g. 18:00-02:00
    periods.push([open, close]);
  }
  return periods;
}

export function parseOpeningHours(text: string | undefined): WeeklyHours | null {
  const source = text?.trim();
  if (!source) return null;
  if (source === '24/7') return Array.from({ length: 7 }, () => [[0, 24 * 60]]);
  const week: WeeklyHours = Array.from({ length: 7 }, () => []);
  for (const rule of source.split(';').map((r) => r.trim()).filter(Boolean)) {
    // "Mo-Fr 07:00-18:00", "Sa off", or "08:00-20:00" for every day. Later rules replace earlier ones.
    const m = /^(?:([A-Z][a-z](?:-[A-Z][a-z])?(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+)?(.+)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const times = parseTimes(m[2].trim());
    if (!days || !times) return null;
    for (const d of days) week[d] = times;
  }
  return week;
}

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** Open at that moment, counting a period that started the evening before and runs past midnight. */
export function isOpenAt(hours: WeeklyHours, date: Date): boolean {
  const day = date.getDay();
  const now = minutesOf(date);
  if (hours[day].some(([open, close]) => now >= open && now < close)) return true;
  const yesterday = hours[(day + 6) % 7];
  return yesterday.some(([, close]) => close > 24 * 60 && now < close - 24 * 60);
}

/**
 * When the place closes on that date's day, as a Date, for the last period that is still open at
 * or after `date`'s time; null when it is closed for the rest of the day.
 */
export function closesAt(hours: WeeklyHours, date: Date): Date | null {
  const now = minutesOf(date);
  const period = hours[date.getDay()].filter(([, close]) => close > now).sort((a, b) => a[1] - b[1])[0];
  if (!period) return null;
  const at = new Date(date);
  at.setHours(0, 0, 0, 0);
  at.setMinutes(period[1]);
  return at;
}

/** "7:00 AM – 6:00 PM", "Closed" for that date's day, in the device's locale. */
export function describeDay(hours: WeeklyHours, date: Date): string {
  const periods = hours[date.getDay()];
  if (periods.length === 0) return 'Closed';
  const time = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (periods.length === 1 && periods[0][0] === 0 && periods[0][1] === 24 * 60) return 'Open 24 hours';
  return periods.map(([o, c]) => `${time(o)} – ${time(c)}`).join(', ');
}
