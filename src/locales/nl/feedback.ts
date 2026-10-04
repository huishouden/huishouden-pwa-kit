import type en from '../en/feedback.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'feedback.refused': '{action}: alleen beheerders en leden kunnen dat doen.',
  'feedback.offline': '{action}: offline. Het wordt opnieuw geprobeerd zodra de verbinding terug is.',
  'feedback.failed': '{action}.',
  'feedback.accessClosed': 'Toegang tot {service} is niet toegestaan: het venster van Google is gesloten. Probeer het opnieuw wanneer je zover bent.',
  'feedback.popupBlocked': 'De browser heeft het venster van Google geblokkeerd. Sta pop-ups toe voor deze site en probeer het opnieuw.',
  'feedback.accessDenied': 'Toegang tot {service} is niet toegestaan. Probeer het opnieuw en sta het toe op de pagina van Google.',
  'feedback.notConfigured': 'Toegang tot {service} is nog niet ingesteld voor deze app.',
  'feedback.unreachable': 'Google is niet bereikbaar. Controleer de verbinding en probeer het opnieuw.',
  'feedback.signInFirst': 'Log eerst in.',
  'feedback.windowBlocked': 'Je browser heeft het venster van Google geblokkeerd. Sta pop-ups toe voor deze site en probeer het opnieuw.',
  'feedback.windowClosed': 'Het venster van Google is gesloten voordat het klaar was. Probeer het opnieuw wanneer je zover bent.',
  'feedback.windowFailed': 'Het venster van Google is gestopt voordat het klaar was. Probeer het opnieuw.',
  'feedback.windowWaiting': 'Wachten op het venster van Google. Zie je het niet? Het staat misschien achter dit venster.',
  'feedback.windowShow': 'Venster van Google tonen',
} satisfies CatalogueOf<typeof en>;
