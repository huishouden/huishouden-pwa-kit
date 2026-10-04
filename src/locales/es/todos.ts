import type en from '../en/todos.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'todos.addedToday': 'Agregado hoy',
  'todos.addedYesterday': 'Agregado ayer',
  'todos.addedDays': 'Agregado hace {n} días',
  'todos.addedWeeks': '{n, plural, one {Agregado hace # semana} other {Agregado hace # semanas}}',
  'todos.addedMonths': '{n, plural, one {Agregado hace # mes} other {Agregado hace # meses}}',
  'todos.addedYears': '{n, plural, one {Agregado hace un año} other {Agregado hace # años}}',
  'todos.onlyInApp': 'Esto solo se puede cambiar en su app.',
  'todos.changedInApp': '{title} se cambió en su app. Ábrelo allí.',
} satisfies CatalogueOf<typeof en>;
