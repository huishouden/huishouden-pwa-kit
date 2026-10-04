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
import type { Firestore } from 'firebase/firestore';
import { disablePush, enablePush, pushEnabled, pushSupport, watchPushLang } from '../push';
import { useKitT } from './i18n';
import { cardClass, overline, primaryButton, secondaryButton } from './ui';

type State = 'checking' | 'off' | 'on' | 'working';

export interface NotificationsCardProps {
  db: Firestore;
  householdId: string;
  user: { email: string | null };
  /** The app the subscription is for ("tasks"). */
  app: string;
  /** `VITE_VAPID_PUBLIC_KEY`; without it the card says notifications are not set up. */
  vapidKey: string | undefined;
  /** What turning it on gives, in the app's words. */
  offText: string;
  /** What it does while on. */
  onText: string;
  /** Without the card's own border and padding, inside another card or a dialog. */
  plain?: boolean;
}

export function NotificationsCard({ db, householdId, user, app, vapidKey, offText, onText, plain }: NotificationsCardProps) {
  const kt = useKitT();
  const support = pushSupport();
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
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
    } catch {
      setError(kt('push.couldNotTurnOff'));
      setState('on');
    }
  };

  return (
    <section className={plain ? '' : `${cardClass} p-6`} aria-label={kt('push.title')}>
      <h3 className={overline}>{kt('push.title')}</h3>
      {!vapidKey ? (
        <p className="mt-2 text-base text-muted">{kt('push.notSetUp')}</p>
      ) : !support.supported ? (
        <p className="mt-2 text-base text-muted">{support.message}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-base text-muted">{state === 'on' ? onText : offText}</p>
          {state === 'on' ? (
            <button type="button" className={secondaryButton} onClick={() => void turnOff()}>
              <BellOff size={18} /> {kt('push.turnOff')}
            </button>
          ) : (
            <button type="button" className={primaryButton} disabled={state !== 'off'} onClick={() => void turnOn()}>
              <Bell size={18} /> {state === 'working' ? kt('push.asking') : kt('push.turnOn')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base text-error">
          {error}
        </p>
      )}
    </section>
  );
}
