import type en from '../en/todos.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'todos.addedToday': 'Vandaag toegevoegd',
  'todos.addedYesterday': 'Gisteren toegevoegd',
  'todos.addedDays': '{n} dagen geleden toegevoegd',
  'todos.addedWeeks': '{n, plural, one {# week geleden toegevoegd} other {# weken geleden toegevoegd}}',
  'todos.addedMonths': '{n, plural, one {# maand geleden toegevoegd} other {# maanden geleden toegevoegd}}',
  'todos.addedYears': '{n, plural, one {Een jaar geleden toegevoegd} other {# jaar geleden toegevoegd}}',
  'todos.onlyInApp': 'Dit kun je alleen in de bijbehorende app wijzigen.',
  'todos.changedInApp': '{title} is in de bijbehorende app gewijzigd. Open het daar.',
} satisfies CatalogueOf<typeof en>;
