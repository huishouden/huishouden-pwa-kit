import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * "Notifications on this device": the per-device switch for the shared sender's push reminders
 * (STANDARD.md "Notifications"). Each person turns it on per phone or tablet, from a tap; where the
 * device can't (an iPhone not added to the Home Screen), it says why instead of offering a button.
 *
 * ```tsx
 * <NotificationsCard db={db} householdId={id} user={user} app="tasks" vapidKey={import.meta.env.VITE_VAPID_PUBLIC_KEY}
 *   offText="Get a notification here an hour before a task is due." onText="On. This device tells you an hour before a task is due." />
 * ```
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { disablePush, enablePush, pushEnabled, pushSupport } from '../push';
import { cardClass, overline, primaryButton, secondaryButton } from './ui';
export function NotificationsCard({ db, householdId, user, app, vapidKey, offText, onText, plain }) {
    const support = pushSupport();
    const [state, setState] = useState('checking');
    const [error, setError] = useState(null);
    useEffect(() => {
        let live = true;
        pushEnabled(db, householdId, user)
            .then((on) => live && setState(on ? 'on' : 'off'))
            .catch(() => live && setState('off'));
        return () => {
            live = false;
        };
    }, [db, householdId, user]);
    const turnOn = async () => {
        setError(null);
        setState('working');
        try {
            await enablePush(db, householdId, user, vapidKey ?? '', { app });
            setState('on');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
            setState('off');
        }
    };
    const turnOff = async () => {
        setError(null);
        setState('working');
        try {
            await disablePush(db, householdId, user);
            setState('off');
        }
        catch {
            setError("Couldn't turn off notifications. Try again.");
            setState('on');
        }
    };
    return (_jsxs("section", { className: plain ? '' : `${cardClass} p-6`, "aria-label": "Notifications on this device", children: [_jsx("h3", { className: overline, children: "Notifications on this device" }), !vapidKey ? (_jsx("p", { className: "mt-2 text-base text-stone-600 dark:text-stone-300", children: "Notifications are not set up for this app yet." })) : !support.supported ? (_jsx("p", { className: "mt-2 text-base text-stone-600 dark:text-stone-300", children: support.message })) : (_jsxs("div", { className: "mt-2 flex flex-wrap items-center justify-between gap-3", children: [_jsx("p", { className: "min-w-0 flex-1 text-base text-stone-600 dark:text-stone-300", children: state === 'on' ? onText : offText }), state === 'on' ? (_jsxs("button", { type: "button", className: secondaryButton, onClick: () => void turnOff(), children: [_jsx(BellOff, { size: 18 }), " Turn off"] })) : (_jsxs("button", { type: "button", className: primaryButton, disabled: state !== 'off', onClick: () => void turnOn(), children: [_jsx(Bell, { size: 18 }), " ", state === 'working' ? 'Asking the browser' : 'Turn on'] }))] })), error && (_jsx("p", { role: "alert", className: "mt-2 text-base text-red-700 dark:text-red-300", children: error }))] }));
}
