import type en from '../en/calendarExport.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'calendarExport.medicineFor': 'Medicina para {who}',
  'calendarExport.healthFor': 'Salud: {who}',
  'calendarExport.health': 'Salud',
  'calendarExport.done': '✓ {title}',
  'calendarExport.todo': 'Pendiente: {title}',
  'calendarExport.description': 'De Huishouden: citas, eventos habituales y cosas por hacer en casa.',
  'calendarExport.add': 'Añadir al calendario',
  'calendarExport.addTo': 'Añadir {title} a un calendario',
  'calendarExport.google': 'Google Calendar',
  'calendarExport.ics': 'Apple, Outlook u otro (.ics)',
  'calendarExport.repeats': 'Añade toda la serie, con sus repeticiones.',
} satisfies CatalogueOf<typeof en>;
