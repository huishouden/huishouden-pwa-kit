import type en from '../en/roles.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'roles.admin': 'Beheerder',
  'roles.member': 'Lid',
  'roles.helper': 'Hulp',
  'roles.kid': 'Kind',
  'roles.adminDescription': 'Alles, en nodigt mensen uit en stelt hun rol in.',
  'roles.memberDescription': 'Alles, behalve mensen uitnodigen en rollen instellen.',
  'roles.helperDescription': 'Ziet de dagelijkse dingen, vinkt ze af en voegt eigen dingen toe. Geen geld, niets privé, geen instellingen.',
  'roles.kidDescription': 'Zoals een hulp, maar zonder medicijnen.',
  'roles.refuseManagePeople': 'Alleen beheerders kunnen mensen uitnodigen of verwijderen en rollen instellen.',
  'roles.refuseChangeSettings': 'Alleen beheerders en leden kunnen instellingen wijzigen.',
  'roles.refuseSeeMoney': 'Alleen beheerders en leden kunnen het geld van het huishouden zien.',
  'roles.refuseSeePrivate': 'Alleen beheerders en leden kunnen dit zien.',
  'roles.refuseEditOthers': 'Alleen beheerders en leden kunnen wijzigen of verwijderen wat iemand anders heeft toegevoegd.',
  'roles.refuseGiveMedicine': 'Alleen beheerders, leden en hulpen kunnen medicijnen geven.',
  'roles.refuseAdd': 'Alleen mensen uit het huishouden kunnen dingen toevoegen.',
  'roles.refuseTick': 'Alleen mensen uit het huishouden kunnen dingen afvinken.',
  'roles.notInHousehold': '{email} hoort niet bij dit huishouden.',
  'roles.whoCanGive': 'Wie mag het geven',
  'roles.allHelpers': 'Alle hulpen',
  'roles.onlyApproved': 'Alleen goedgekeurde hulpen',
  'roles.noHelpers': 'Nog geen hulpen. Een beheerder kan iemand hulp maken in de instellingen van het huishouden.',
  'roles.alwaysGive': 'Beheerders en leden mogen het altijd geven; kinderen niet.',
} satisfies CatalogueOf<typeof en>;
