/**
 * Business hours in OpenStreetMap's `opening_hours` format ("Mo-Fr 07:00-18:00; Sa 08:00-16:00"),
 * so an app can say "Closes 6:00 PM" or warn that a place shuts before an errand is due.
 *
 * Covers the forms most shops use: day ranges and lists, several time ranges a day, "off",
 * and "24/7". Anything else (public holidays, months, sunrise) makes `parseOpeningHours` return
 * null, and apps show the text as written rather than guess.
 */
/** Opening periods per weekday (0 = Sunday), in minutes after midnight; empty = closed. Read-only: days in a range share data. */
export type WeeklyHours = readonly (readonly (readonly [number, number])[])[];
export declare function parseOpeningHours(text: string | undefined): WeeklyHours | null;
/** Open at that moment, counting a period that started the evening before and runs past midnight. */
export declare function isOpenAt(hours: WeeklyHours, date: Date): boolean;
/**
 * When the place closes, if it is open at `date`: the end of the period it is in, including one
 * that started the evening before and runs past midnight. Null when it is closed at `date`.
 */
export declare function closesAt(hours: WeeklyHours, date: Date): Date | null;
/** "7:00 AM – 6:00 PM", "Closed" or "Open 24 hours" for that date's day; times in `locale`. */
export declare function describeDay(hours: WeeklyHours, date: Date, locale?: string): string;
