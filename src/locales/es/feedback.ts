import type en from '../en/feedback.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'feedback.refused': '{action}: solo los administradores y miembros pueden hacer eso.',
  'feedback.offline': '{action}: sin conexión. Se volverá a intentar cuando vuelva la conexión.',
  'feedback.failed': '{action}.',
  'feedback.accessClosed': 'No se permitió el acceso a {service}: se cerró la ventana de Google. Inténtalo de nuevo cuando quieras.',
  'feedback.popupBlocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.',
  'feedback.accessDenied': 'No se permitió el acceso a {service}. Inténtalo de nuevo y permítelo en la página de Google.',
  'feedback.notConfigured': 'El acceso a {service} aún no está configurado para esta app.',
  'feedback.unreachable': 'No se pudo conectar con Google. Revisa la conexión e inténtalo de nuevo.',
  'feedback.signInFirst': 'Primero inicia sesión.',
  'feedback.windowBlocked': 'Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.',
  'feedback.windowClosed': 'La ventana de Google se cerró antes de terminar. Inténtalo de nuevo cuando quieras.',
  'feedback.windowFailed': 'La ventana de Google se detuvo antes de terminar. Inténtalo de nuevo.',
  'feedback.windowWaiting': 'Esperando la ventana de Google. ¿No la ves? Puede estar detrás de esta ventana.',
  'feedback.windowShow': 'Mostrar la ventana de Google',
  'feedback.windowBlockedHere': 'Tu navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio o usa Continuar en esta pestaña.',
  'feedback.windowContinueHere': 'Continuar en esta pestaña',
  'feedback.windowWaitingHere': 'Esperando la ventana de Google. ¿No la ves? Puede estar detrás de esta ventana, o continúa en esta pestaña.',
} satisfies CatalogueOf<typeof en>;
