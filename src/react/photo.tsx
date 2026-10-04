/**
 * Choosing a small avatar photo: tap the avatar (or "Choose photo"), pick or take a photo, slide the
 * square along the photo if it isn't square, then Use photo. The result is a data URL from
 * `squarePhoto` in `../photo`, for the app to store in its own document. For avatars, not galleries.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { PhotoError, pickPhoto, squarePhoto, type SquarePhoto, type SquarePhotoOptions } from '../photo';
import { useKitT } from './i18n';
import { ghostButton, primaryButton, secondaryButton } from './ui';

export function PhotoPicker({ photo, fallback, label, size = 96, options, onSave, onRemove, pick = pickPhoto }: {
  /** The current photo (a data URL), if any. */
  photo?: string | null;
  /** Shown when there is no photo: the app's initial or icon avatar. */
  fallback: ReactNode;
  /** What the photo is of, for buttons: "Biscuit's photo". */
  label: string;
  /** Avatar size on screen, in px. */
  size?: number;
  options?: SquarePhotoOptions;
  onSave: (dataUrl: string) => void;
  onRemove?: () => void;
  /** How a file is chosen; tests pass their own. */
  pick?: () => Promise<Blob | null>;
}) {
  const kt = useKitT();
  const [draft, setDraft] = useState<{ file: Blob; result: SquarePhoto; position: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const make = async (file: Blob, position: number) => {
    const id = ++run.current;
    setBusy(true);
    setError(null);
    try {
      const result = await squarePhoto(file, { ...options, position });
      if (id === run.current) setDraft({ file, result, position });
    } catch (e) {
      if (id === run.current) setError(e instanceof PhotoError ? e.message : kt('photo.unreadable'));
    } finally {
      if (id === run.current) setBusy(false);
    }
  };
  const choose = async () => {
    const file = await pick();
    if (file) await make(file, 0);
  };

  const shown = draft?.result.dataUrl ?? photo ?? null;
  const slides = draft && draft.result.source.width !== draft.result.source.height;
  const avatar = shown ? <img src={shown} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover" /> : fallback;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => void choose()}
        disabled={busy}
        aria-label={photo ? kt('photo.change', { label }) : kt('photo.add', { label })}
        className="relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-forest-500 disabled:opacity-60"
        style={{ width: size, height: size }}
      >
        {avatar}
        <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary" aria-hidden="true">
          <Camera size={16} />
        </span>
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        {draft ? (
          <>
            {slides && (
              <label className="block text-sm font-medium text-ink-soft">
                {kt('photo.position')}
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={draft.position}
                  onChange={(e) => void make(draft.file, Number(e.target.value))}
                  className="mt-1 block w-full accent-primary"
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButton}
                disabled={busy}
                onClick={() => {
                  onSave(draft.result.dataUrl);
                  setDraft(null);
                }}
              >
                {kt('photo.use')}
              </button>
              <button type="button" className={ghostButton} onClick={() => setDraft(null)}>
                {kt('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => void choose()}>
              {busy ? kt('photo.making') : photo ? kt('photo.changePhoto') : kt('photo.choosePhoto')}
            </button>
            {photo && onRemove && (
              <button type="button" className={ghostButton} onClick={onRemove}>
                {kt('photo.remove')}
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
