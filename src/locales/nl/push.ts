import type en from '../en/push.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'push.iosNotInstalled': 'Op iPhone en iPad werken meldingen zodra de app op het beginscherm staat: tik op Deel, dan op ‘Zet op beginscherm’, en open de app vanaf daar.',
  'push.iosTooOld': 'Voor meldingen heb je iOS of iPadOS 16.4 of later nodig.',
  'push.unsupported': 'Deze browser kan geen meldingen van webapps tonen.',
  'push.denied': 'Meldingen zijn geblokkeerd voor deze app. Sta ze toe in de instellingen van de browser of het systeem voor deze site.',
  'push.notConfigured': 'Meldingen zijn niet ingesteld voor deze app (VITE_VAPID_PUBLIC_KEY is leeg).',
  'push.notAllowed': 'Meldingen zijn niet toegestaan.',
  'push.incomplete': 'De browser gaf een onvolledig meldingsabonnement terug.',
  'push.couldNotTurnOn': 'Meldingen aanzetten lukte niet.',
  'push.couldNotTurnOff': 'Meldingen uitzetten lukte niet. Probeer het opnieuw.',
  'push.title': 'Meldingen op dit apparaat',
  'push.notSetUp': 'Meldingen zijn nog niet ingesteld voor deze app.',
  'push.turnOff': 'Uitzetten',
  'push.turnOn': 'Aanzetten',
  'push.asking': 'Browser vraagt toestemming',
} satisfies CatalogueOf<typeof en>;
