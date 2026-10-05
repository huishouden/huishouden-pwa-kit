import { type ParsedCourse } from '../dose';
declare global {
    interface Window {
        /** Browser tests set this to stand in for the label photo's text (OCR needs a real photo). */
        __mockLabelText?: string;
    }
}
/** One field the app filled from the label: "Medicine", "Lisinopril 10 mg". */
export interface LabelFill {
    label: string;
    value: string;
}
export interface LabelScanProps {
    /** Fills the app's form from what was read; returns what it filled, in the form's order. */
    onRead: (parsed: ParsedCourse, text: string) => LabelFill[];
    /** The line under the title before a photo is picked. */
    intro?: string;
    /** Reads the photo's text (tests); default `readLabel`, or `window.__mockLabelText` when set. */
    read?: (photo: Blob, onProgress: (progress: number) => void) => Promise<string>;
    /** Photos to read as soon as this shows, such as ones shared in from the gallery (`../shared-images`). */
    images?: File[];
}
export declare function LabelScan({ onRead, intro, read, images }: LabelScanProps): import("react").JSX.Element;
