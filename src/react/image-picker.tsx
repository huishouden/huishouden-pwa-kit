/**
 * Getting photos into an app, the one way everywhere: **Take a photo** (the camera, phones) and
 * **Choose a photo** (the photo library or files, no camera forced), plus what a computer offers:
 * paste an image (Ctrl+V or Cmd+V anywhere on the page, or the Paste button where the browser lets a
 * page read the clipboard) and drag and drop. `multiple` takes several at once (the front and the
 * back of a box). Nothing is read or uploaded here: the app gets `File`s and decides.
 *
 * No app puts `capture` on its own file input: that opens only the camera, and a person cannot pick
 * a photo they already have.
 *
 * ```tsx
 * <ImagePicker label="Label photo" multiple onImages={(files) => void read(files)} />
 * ```
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, ClipboardPaste, ImageUp } from 'lucide-react';
import { useKitT } from './i18n';
import { secondaryButton } from './ui';

/** The images in a list of files, in order; anything else is left out. */
export const onlyImages = (files: ArrayLike<File | Blob | null | undefined>): File[] =>
  Array.from(files)
    .filter((f): f is File | Blob => !!f && f.type.startsWith('image/'))
    .map((f) => (f instanceof File ? f : new File([f], 'photo', { type: f.type })));

/** Whether the page may read the clipboard's images with a button (secure page, Clipboard API). */
export function canReadClipboardImages(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext !== false && typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

const matches = (query: string): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

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

export function ImagePicker({ onImages, label, multiple = false, disabled = false, camera, pastePage = true, className = '' }: ImagePickerProps) {
  const kt = useKitT();
  const id = useId();
  const taken = useRef<HTMLInputElement>(null);
  const chosen = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<'' | 'noImage' | 'noneOnClipboard' | 'pasteDenied'>('');
  const [clipboard] = useState(canReadClipboardImages);
  const [touch] = useState(() => matches('(any-pointer: coarse)'));
  const [desktop] = useState(() => matches('(any-pointer: fine)') && matches('(hover: hover)'));
  const showCamera = camera ?? touch;

  const give = (files: File[]) => {
    if (files.length === 0) {
      setNote('noImage');
      return;
    }
    setNote('');
    onImages(multiple ? files : files.slice(0, 1));
  };
  // The latest `give` for the page-wide listener, so it never goes stale.
  const latest = useRef(give);
  latest.current = give;
  const busy = useRef(disabled);
  busy.current = disabled;

  useEffect(() => {
    if (!pastePage) return;
    const onPaste = (e: ClipboardEvent) => {
      if (busy.current) return;
      const images = onlyImages(Array.from(e.clipboardData?.files ?? []));
      if (images.length === 0) return; // text pastes as usual
      e.preventDefault();
      latest.current(images);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [pastePage]);

  const pasteFromClipboard = async () => {
    try {
      const images: File[] = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) images.push(new File([await item.getType(type)], `pasted-${images.length + 1}.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (images.length === 0) setNote('noneOnClipboard');
      else give(images);
    } catch {
      setNote('pasteDenied');
    }
  };

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) give(onlyImages(files));
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      className={`space-y-2 rounded-xl ${dragging ? 'outline-2 outline-dashed outline-offset-4 outline-forest-500' : ''} ${className}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        // Always claim the drag: a drop the page ignores would open the image and lose the form.
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (!disabled) give(onlyImages(Array.from(e.dataTransfer.files)));
      }}
    >
      <div className="flex flex-wrap gap-2">
        {showCamera && (
          <button type="button" className={secondaryButton} aria-disabled={disabled || undefined} onClick={() => !disabled && taken.current?.click()}>
            <Camera size={18} aria-hidden="true" /> {kt('image.take')}
          </button>
        )}
        <button type="button" className={secondaryButton} aria-disabled={disabled || undefined} onClick={() => !disabled && chosen.current?.click()}>
          <ImageUp size={18} aria-hidden="true" /> {multiple ? kt('image.chooseMany') : kt('image.choose')}
        </button>
        {clipboard && (
          <button type="button" className={secondaryButton} aria-disabled={disabled || undefined} onClick={() => !disabled && void pasteFromClipboard()}>
            <ClipboardPaste size={18} aria-hidden="true" /> {kt('image.paste')}
          </button>
        )}
      </div>
      {/* Taking a photo opens only the camera (capture); choosing has no capture, so the library and files are offered. */}
      <input ref={taken} type="file" accept="image/*" capture="environment" className="hidden" aria-label={kt('image.cameraInput')} onChange={picked} />
      <input ref={chosen} id={id} type="file" accept="image/*" multiple={multiple} className="hidden" aria-label={label} onChange={picked} />
      {desktop && <p className="text-sm text-muted">{kt('image.dropHint')}</p>}
      {note && (
        <p role="alert" className="text-sm text-error">
          {kt(note === 'noImage' ? 'image.noImage' : note === 'noneOnClipboard' ? 'image.noneOnClipboard' : 'image.pasteDenied')}
        </p>
      )}
    </div>
  );
}
