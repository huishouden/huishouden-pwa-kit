import type en from '../en/agenda.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'agenda.allDay': 'Hele dag',
  'agenda.timeRange': '{start} – {end}',
  'agenda.done': 'Gedaan',
  'agenda.overdueSince': 'Te laat sinds {time}',
  'agenda.dayAtTime': '{day}, {time}',
} satisfies CatalogueOf<typeof en>;
