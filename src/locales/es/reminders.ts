import type en from '../en/reminders.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'reminders.medicine': 'Medicamento',
  'reminders.titleFor': '{who}: {name}',
  'reminders.bodyDoseFood': '{dose} {at}, {food, select, with {con comida} other {en ayunas}}',
  'reminders.bodyDose': '{dose} {at}',
  'reminders.bodyFood': '{food, select, with {con comida} other {en ayunas}}',
  'reminders.bodyTime': 'Dosis {at}',
} satisfies CatalogueOf<typeof en>;
