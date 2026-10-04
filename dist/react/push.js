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
import { disablePush, enablePush, pushEnabled, pushSupport, setAppMuted, watchMutedApps, watchPushLang } from '../push';
import { useKitT } from './i18n';
import { Checkbox, cardClass, overline, primaryButton, secondaryButton } from './ui';
export function NotificationsCard({ db, householdId, user, app, vapidKey, offText, onText, plain, muteText }) {
    const kt = useKitT();
    const support = pushSupport();
    const [state, setState] = useState('checking');
    const [error, setError] = useState(null);
    const [muted, setMuted] = useState(null);
    const email = user.email;
    useEffect(() => (muteText && email ? watchMutedApps(db, householdId, email, (apps) => setMuted(apps.includes(app)), () => setMuted(null)) : undefined), [muteText, db, householdId, email, app]);
    useEffect(() => {
        let live = true;
        pushEnabled(db, householdId, user)
            .then((on) => live && setState(on ? 'on' : 'off'))
            .catch(() => live && setState('off'));
        return () => {
            live = false;
        };
    }, [db, householdId, user]);
    // While on, the stored subscription follows the language, so reminders arrive in it.
    useEffect(() => (state === 'on' ? watchPushLang(db, householdId, user) : undefined), [state, db, householdId, user]);
    const turnOn = async () => {
        setError(null);
        setState('working');
        try {
            await enablePush(db, householdId, user, vapidKey ?? '', { app });
            setState('on');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : kt('push.couldNotTurnOn'));
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
            setError(kt('push.couldNotTurnOff'));
            setState('on');
        }
    };
    return (_jsxs("section", { className: plain ? '' : `${cardClass} p-6`, "aria-label": kt('push.title'), children: [_jsx("h3", { className: overline, children: kt('push.title') }), !vapidKey ? (_jsx("p", { className: "mt-2 text-base text-muted", children: kt('push.notSetUp') })) : !support.supported ? (_jsx("p", { className: "mt-2 text-base text-muted", children: support.message })) : (_jsxs("div", { className: "mt-2 flex flex-wrap items-center justify-between gap-3", children: [_jsx("p", { className: "min-w-0 flex-1 text-base text-muted", children: state === 'on' ? onText : offText }), state === 'on' ? (_jsxs("button", { type: "button", className: secondaryButton, onClick: () => void turnOff(), children: [_jsx(BellOff, { size: 18 }), " ", kt('push.turnOff')] })) : (_jsxs("button", { type: "button", className: primaryButton, disabled: state !== 'off', onClick: () => void turnOn(), children: [_jsx(Bell, { size: 18 }), " ", state === 'working' ? kt('push.asking') : kt('push.turnOn')] }))] })), muteText && email && muted !== null && (_jsxs("div", { className: "mt-3", children: [_jsx(Checkbox, { checked: muted, onChange: (on) => {
                            setError(null);
                            setMuted(on);
                            setAppMuted(db, householdId, email, app, on).catch(() => {
                                setMuted(!on);
                                setError(kt('push.couldNotMute'));
                            });
                        }, children: muteText }), _jsx("p", { className: "ml-9 text-sm text-muted", children: kt('push.muteHint') })] })), error && (_jsx("p", { role: "alert", className: "mt-2 text-base text-error", children: error }))] }));
}
