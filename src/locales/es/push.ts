import type en from '../en/push.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'push.iosNotInstalled': 'En iPhone y iPad, las notificaciones funcionan cuando la app está en la pantalla de inicio: toca Compartir, luego “Agregar a inicio” y ábrela desde ahí.',
  'push.iosTooOld': 'Las notificaciones necesitan iOS o iPadOS 16.4 o posterior.',
  'push.unsupported': 'Este navegador no puede mostrar notificaciones de apps web.',
  'push.denied': 'Las notificaciones están bloqueadas para esta app. Permítelas en la configuración del navegador o del sistema para este sitio.',
  'push.notConfigured': 'Las notificaciones no están configuradas para esta app (VITE_VAPID_PUBLIC_KEY está vacío).',
  'push.notAllowed': 'No se permitieron las notificaciones.',
  'push.incomplete': 'El navegador devolvió una suscripción de notificaciones incompleta.',
  'push.couldNotTurnOn': 'No se pudieron activar las notificaciones.',
  'push.couldNotTurnOff': 'No se pudieron desactivar las notificaciones. Inténtalo de nuevo.',
  'push.title': 'Notificaciones en este dispositivo',
  'push.notSetUp': 'Las notificaciones aún no están configuradas para esta app.',
  'push.turnOff': 'Desactivar',
  'push.turnOn': 'Activar',
  'push.asking': 'Preguntando al navegador',
} satisfies CatalogueOf<typeof en>;
