/**
 * A business's details from text the person already has: Google Maps' Share text, a listing copied
 * from Google Maps, Apple Maps or Yelp, or the OCR text of a listing screenshot. For the places
 * OpenStreetMap doesn't know (it often lacks local businesses), with no key and no billing.
 *
 * Fixed rules, no guessing: every line is either used for a field, recognised as listing chrome
 * (ratings, buttons, "Open · Closes 6 PM", distances, plus codes) and returned in `ignored`, or
 * returned in `unparsed` for the app to show next to the fields it filled in.
 */
import { type ReadTextOptions } from './ocr';
export interface ParsedPlace {
    name?: string;
    address?: string;
    phone?: string;
    /** Full URL: a bare domain gets `https://`. */
    website?: string;
    email?: string;
    /** A Google Maps or Apple Maps link to the place, when the text had one. */
    mapsUrl?: string;
    /** Opening hours as the listing wrote them, one day or range per entry joined with "; ". */
    hours?: string;
    /** The listing's kind of business ("Veterinarian"), when it says so. */
    category?: string;
    /** 0..1: name 0.4, address 0.25, phone 0.2, website or map link 0.15. */
    confidence: number;
    /** Lines the parser did not understand, for the app to show. Never dropped silently. */
    unparsed: string[];
    /** Lines recognised as listing chrome (ratings, buttons, distances, status) and not used. */
    ignored: string[];
}
/**
 * Name, address, phone, website, map link and hours from listing text: Google Maps' Share text
 * (name, address, maps.app.goo.gl link), a listing copied from Google Maps, Apple Maps or Yelp, or
 * the OCR text of a listing screenshot. Lines it can't place come back in `unparsed`.
 */
export declare function parsePlaceText(text: string): ParsedPlace;
export type ReadPlaceScreenshotOptions = Omit<ReadTextOptions, 'screenshot'>;
/**
 * A business's details from a screenshot of its Google Maps (or Apple Maps, Yelp) listing: the
 * text is read on the device (`./ocr`, tesseract.js, nothing uploaded) and parsed with
 * `parsePlaceText`. The engine is downloaded on first use only.
 */
export declare function readPlaceScreenshot(image: Blob, options?: ReadPlaceScreenshotOptions): Promise<ParsedPlace & {
    text: string;
}>;
/**
 * The query parameters `pwaApp({ shareTarget: true })` asks the browser to launch the app with.
 * GET share targets replace the action URL's query, so the marker is in the names, not `?share=1`.
 */
export declare const SHARE_PARAMS: {
    readonly title: "share_title";
    readonly text: "share_text";
    readonly url: "share_url";
};
export interface SharedPlace {
    /** What the sharing app sent, as sent. */
    title?: string;
    text?: string;
    url?: string;
    place: ParsedPlace;
}
/**
 * The place shared into the app from another app's Share menu (Google Maps → Share → this app),
 * or null when the app was opened normally. Pass `location` (or a URL); after opening the dialog,
 * `clearSharedPlace()` takes the parameters off the address so a reload doesn't share again.
 * Also reads `?share=1&title=&text=&url=` for links made by hand.
 */
export declare function readSharedPlace(location: {
    search: string;
} | URL | string): SharedPlace | null;
/** Takes the share parameters off the address bar without reloading. */
export declare function clearSharedPlace(): void;
