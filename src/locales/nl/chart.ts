import type en from '../en/chart.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'chart.summary': '{label}: van {first} op {firstDay} tot {last} op {lastDay}',
  'chart.summaryTarget': '{label}: van {first} op {firstDay} tot {last} op {lastDay}; doel {target}',
  'chart.target': 'Doel {target}',
} satisfies CatalogueOf<typeof en>;
