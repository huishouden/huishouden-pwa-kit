import type en from '../en/reminders.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'reminders.medicine': 'Medicijn',
  'reminders.titleFor': '{who}: {name}',
  'reminders.bodyDoseFood': '{dose} {at}, {food, select, with {bij het eten} other {op een lege maag}}',
  'reminders.bodyDose': '{dose} {at}',
  'reminders.bodyFood': '{food, select, with {bij het eten} other {op een lege maag}}',
  'reminders.bodyTime': 'Dosis {at}',
} satisfies CatalogueOf<typeof en>;
