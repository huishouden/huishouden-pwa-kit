import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Choosing a small avatar photo: tap the avatar (or "Choose photo"), pick or take a photo, slide the
 * square along the photo if it isn't square, then Use photo. The result is a data URL from
 * `squarePhoto` in `../photo`, for the app to store in its own document. For avatars, not galleries.
 */
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { PhotoError, pickPhoto, squarePhoto } from '../photo';
import { useKitT } from './i18n';
import { ghostButton, primaryButton, secondaryButton } from './ui';
export function PhotoPicker({ photo, fallback, label, size = 96, options, onSave, onRemove, pick = pickPhoto }) {
    const kt = useKitT();
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const run = useRef(0);
    const make = async (file, position) => {
        const id = ++run.current;
        setBusy(true);
        setError(null);
        try {
            const result = await squarePhoto(file, { ...options, position });
            if (id === run.current)
                setDraft({ file, result, position });
        }
        catch (e) {
            if (id === run.current)
                setError(e instanceof PhotoError ? e.message : kt('photo.unreadable'));
        }
        finally {
            if (id === run.current)
                setBusy(false);
        }
    };
    const choose = async () => {
        const file = await pick();
        if (file)
            await make(file, 0);
    };
    const shown = draft?.result.dataUrl ?? photo ?? null;
    const slides = draft && draft.result.source.width !== draft.result.source.height;
    const avatar = shown ? _jsx("img", { src: shown, alt: "", width: size, height: size, className: "h-full w-full rounded-full object-cover" }) : fallback;
    return (_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("button", { type: "button", onClick: () => void choose(), disabled: busy, "aria-label": photo ? kt('photo.change', { label }) : kt('photo.add', { label }), className: "relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-forest-500 disabled:opacity-60", style: { width: size, height: size }, children: [avatar, _jsx("span", { className: "absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary", "aria-hidden": "true", children: _jsx(Camera, { size: 16 }) })] }), _jsxs("div", { className: "min-w-0 flex-1 space-y-2", children: [draft ? (_jsxs(_Fragment, { children: [slides && (_jsxs("label", { className: "block text-sm font-medium text-ink-soft", children: [kt('photo.position'), _jsx("input", { type: "range", min: -1, max: 1, step: 0.1, value: draft.position, onChange: (e) => void make(draft.file, Number(e.target.value)), className: "mt-1 block w-full accent-primary" })] })), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: primaryButton, disabled: busy, onClick: () => {
                                            onSave(draft.result.dataUrl);
                                            setDraft(null);
                                        }, children: kt('photo.use') }), _jsx("button", { type: "button", className: ghostButton, onClick: () => setDraft(null), children: kt('common.cancel') })] })] })) : (_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: secondaryButton, disabled: busy, onClick: () => void choose(), children: busy ? kt('photo.making') : photo ? kt('photo.changePhoto') : kt('photo.choosePhoto') }), photo && onRemove && (_jsx("button", { type: "button", className: ghostButton, onClick: onRemove, children: kt('photo.remove') }))] })), error && (_jsx("p", { role: "alert", className: "text-sm text-error", children: error }))] })] }));
}
