import type en from '../en/googleToken.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'googleToken.denied': 'Google heeft geen toegang gegeven.',
  'googleToken.notConfigured': 'Toegang tot Google is niet ingesteld voor deze app.',
  'googleToken.unreachable': 'Google is niet bereikbaar. Controleer de verbinding en probeer het opnieuw.',
  'googleToken.closed': 'Het venster van Google is gesloten.',
  'googleToken.blocked': 'De browser heeft het venster van Google geblokkeerd.',
  'googleToken.noAnswer': 'Google gaf geen antwoord.',
  'googleToken.answered': 'Google antwoordde: {error}',
} satisfies CatalogueOf<typeof en>;
