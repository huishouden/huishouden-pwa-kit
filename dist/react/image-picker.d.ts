/** The images in a list of files, in order; anything else is left out. */
export declare const onlyImages: (files: ArrayLike<File | Blob | null | undefined>) => File[];
/** Whether the page may read the clipboard's images with a button (secure page, Clipboard API). */
export declare function canReadClipboardImages(): boolean;
export interface ImagePickerProps {
    /** Called with the images picked, pasted or dropped (one batch each time, at least one image). */
    onImages: (images: File[]) => void;
    /** What the photos are of, for the screen reader's name of the file input ("Label photo"). */
    label: string;
    /** Several images at once; otherwise only the first of a batch is passed on. Default false. */
    multiple?: boolean;
    /** Greyed out while the app is busy with the last batch (aria-disabled, so keyboard focus stays on the button). */
    disabled?: boolean;
    /** Show Take a photo. Default: on touch devices, where `capture` opens the camera (a computer ignores it). */
    camera?: boolean;
    /** Listen for Ctrl/Cmd+V on the page. Default true; turn off where two pickers share a page. */
    pastePage?: boolean;
    className?: string;
}
export declare function ImagePicker({ onImages, label, multiple, disabled, camera, pastePage, className }: ImagePickerProps): import("react").JSX.Element;
