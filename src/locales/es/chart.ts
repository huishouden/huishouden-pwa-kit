import type en from '../en/chart.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'chart.summary': '{label}: de {first} el {firstDay} a {last} el {lastDay}',
  'chart.summaryTarget': '{label}: de {first} el {firstDay} a {last} el {lastDay}; meta {target}',
  'chart.target': 'Meta {target}',
} satisfies CatalogueOf<typeof en>;
