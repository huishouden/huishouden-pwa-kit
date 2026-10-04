/** Opening periods per weekday (0 = Sunday), in minutes after midnight; empty = closed. Read-only; each day is its own array. */
export type WeeklyHours = readonly (readonly (readonly [number, number])[])[];
export declare function parseOpeningHours(text: string | undefined): WeeklyHours | null;
/** Open at that moment, counting a period that started the evening before and runs past midnight. */
export declare function isOpenAt(hours: WeeklyHours, date: Date, timeZone?: string | undefined): boolean;
/**
 * When the place closes, if it is open at `date`: the end of the period it is in, including one
 * that started the evening before and runs past midnight. Null when it is closed at `date`.
 */
export declare function closesAt(hours: WeeklyHours, date: Date, timeZone?: string | undefined): Date | null;
/** "7:00 AM – 6:00 PM", "Closed" or "Open 24 hours" for that date's day; times in `locale` (the active one). */
export declare function describeDay(hours: WeeklyHours, date: Date, locale?: string, timeZone?: string | undefined): string;
