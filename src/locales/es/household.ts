import type en from '../en/household.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'household.notEmail': 'No es una dirección de correo: {email}',
  'household.alreadyIn': '{email} ya está en el hogar.',
} satisfies CatalogueOf<typeof en>;
