import type { Firestore } from 'firebase/firestore';
export interface NotificationsCardProps {
    db: Firestore;
    householdId: string;
    user: {
        email: string | null;
    };
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
    /**
     * Offers muting this app's reminders for the signed-in member on all their devices
     * (`setAppMuted`), in the app's words: "Mute bill reminders for me". The household's own setting
     * is untouched. Leave out to not offer it.
     */
    muteText?: string;
}
export declare function NotificationsCard({ db, householdId, user, app, vapidKey, offText, onText, plain, muteText }: NotificationsCardProps): import("react").JSX.Element;
