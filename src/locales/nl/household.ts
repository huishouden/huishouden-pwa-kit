import type en from '../en/household.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'household.notEmail': 'Geen e-mailadres: {email}',
  'household.alreadyIn': '{email} hoort al bij het huishouden.',
} satisfies CatalogueOf<typeof en>;
