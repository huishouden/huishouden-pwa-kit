import type en from '../en/invite.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'invite.subject': '{from} heeft je uitgenodigd voor {household}',
  'invite.added': '{from} heeft je toegevoegd aan {household} op Huishouden, de gedeelde apps van het huishouden voor uitgaven, taken en meer.',
  'invite.open': 'Open {url} en log in met Google als {to}. Je hebt meteen alle apps.',
  'invite.install': 'Gebruik op een telefoon of tablet ‘App installeren’ of ‘Toevoegen aan startscherm’ in het browsermenu om de app op je startscherm te zetten.',
  'invite.denied': 'Google heeft geen toestemming gegeven om e-mail te versturen.',
} satisfies CatalogueOf<typeof en>;
