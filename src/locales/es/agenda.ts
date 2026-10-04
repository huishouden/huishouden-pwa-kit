import type en from '../en/agenda.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'agenda.allDay': 'Todo el día',
  'agenda.timeRange': '{start} – {end}',
  'agenda.done': 'Hecho',
  'agenda.overdueSince': 'Atrasado desde las {time}',
  'agenda.dayAtTime': '{day}, {time}',
} satisfies CatalogueOf<typeof en>;
