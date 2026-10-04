/**
 * "Scan the label": a medicine label photo read on the device (`../dose` `readLabel`, nothing
 * uploaded or kept) and parsed (`parseDirections`); the app fills its own form from the result and
 * says what it filled. The card then shows, in this order, what was filled in (field by field),
 * what it should check (`assumptions`), the label lines it read but did not use (`unparsed`, never
 * hidden: a person must see what the form does not hold, such as a warning), the pharmacy lines it
 * left out on purpose, and the whole text it read, folded.
 *
 * ```tsx
 * <LabelScan onRead={(parsed) => {
 *   const draft = toMedCourse(parsed, { startDate: today });
 *   if (draft.name) setName(draft.name);
 *   return [draft.name && { label: 'Medicine', value: draft.name }].filter(Boolean);
 * }} />
 * ```
 */
import { useRef, useState } from 'react';
import { ScanText } from 'lucide-react';
import { parseDirections, readLabel, type ParsedCourse } from '../dose';
import { useKitT } from './i18n';
import { secondaryButton } from './ui';

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

type Scan =
  | { status: 'idle' }
  | { status: 'reading'; progress: number }
  | { status: 'done'; text: string; filled: LabelFill[]; parsed: ParsedCourse }
  | { status: 'error' };

export interface LabelScanProps {
  /** Fills the app's form from what was read; returns what it filled, in the form's order. */
  onRead: (parsed: ParsedCourse, text: string) => LabelFill[];
  /** The line under the button before a photo is taken. */
  intro?: string;
  /** Reads the photo's text (tests); default `readLabel`, or `window.__mockLabelText` when set. */
  read?: (photo: Blob, onProgress: (progress: number) => void) => Promise<string>;
}

const defaultRead = (photo: Blob, onProgress: (progress: number) => void) =>
  window.__mockLabelText !== undefined ? Promise.resolve(window.__mockLabelText) : readLabel(photo, { onProgress });

export function LabelScan({ onRead, intro, read = defaultRead }: LabelScanProps) {
  const kt = useKitT();
  intro ??= kt('dose.scanIntro');
  const photo = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<Scan>({ status: 'idle' });

  const readPhoto = async (file: File) => {
    setScan({ status: 'reading', progress: 0 });
    try {
      const text = await read(file, (progress) => setScan({ status: 'reading', progress }));
      const parsed = parseDirections(text);
      const filled = onRead(parsed, text).filter((f) => f.value.trim());
      setScan({ status: 'done', text, filled, parsed });
    } catch {
      setScan({ status: 'error' });
    } finally {
      if (photo.current) photo.current.value = '';
    }
  };

  const lines = (scan.status === 'done' ? scan.text : '').split(/\n+/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <input
        ref={photo}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={kt('dose.labelPhoto')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readPhoto(file);
        }}
      />
      <button type="button" className={secondaryButton} disabled={scan.status === 'reading'} onClick={() => photo.current?.click()}>
        <ScanText size={18} /> {scan.status === 'reading'
          ? kt('dose.reading', { percent: Math.round(scan.progress * 100) })
          : scan.status === 'done'
            ? kt('dose.scanAgain')
            : kt('dose.scan')}
      </button>
      {scan.status === 'idle' && <p className="text-sm text-muted">{intro}</p>}
      {scan.status === 'error' && (
        <p role="alert" className="text-base text-error">
          {kt('dose.readError')}
        </p>
      )}
      {scan.status === 'done' && (
        <div role="status" className="space-y-3 text-base text-ink-soft">
          {scan.filled.length === 0 ? (
            <p>{kt('dose.nothingFilled')}</p>
          ) : (
            <section aria-label={kt('dose.filledSection')}>
              <p className="font-medium text-link">{kt('dose.filledCheck')}</p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                {scan.filled.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {scan.parsed.assumptions.length > 0 && (
            <section aria-label={kt('dose.checkThese')}>
              <p className="text-sm font-medium text-ink">{kt('dose.checkThese')}</p>
              <ul className="list-disc pl-5 text-sm">
                {scan.parsed.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
          {scan.parsed.unparsed.length > 0 && (
            <section aria-label={kt('dose.notUsedSection')}>
              <p className="text-sm font-medium text-ink">{kt('dose.notUsedSection')}</p>
              <p className="text-sm text-muted">{kt('dose.notUsedHelp')}</p>
              <ul aria-label={kt('dose.notUsed')} className="mt-1 list-disc pl-5 text-sm">
                {scan.parsed.unparsed.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </section>
          )}
          {scan.parsed.ignored.length > 0 && (
            <p className="text-sm text-muted">{kt('dose.leftOut', { n: scan.parsed.ignored.length })}</p>
          )}
          {lines.length > 0 && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer select-none py-1">{kt('dose.everythingRead')}</summary>
              <ul aria-label={kt('dose.readFromPhoto')} className="mt-1 space-y-0.5 pl-1">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
