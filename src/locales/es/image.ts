import type en from '../en/image.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'image.take': 'Tomar una foto',
  'image.choose': 'Elegir una foto',
  'image.chooseMany': 'Elegir fotos',
  'image.paste': 'Pegar',
  'image.cameraInput': 'Cámara',
  'image.dropHint': 'También puedes soltar fotos aquí o pegarlas con Ctrl+V o Cmd+V.',
  'image.noImage': 'Eso no es una foto. Elige una imagen.',
  'image.noneOnClipboard': 'No hay ninguna imagen en el portapapeles. Copia una primero y luego pega.',
  'image.pasteDenied': 'No se pudo leer el portapapeles. Permítelo cuando se pida, o pega con Ctrl+V o Cmd+V.',
} satisfies CatalogueOf<typeof en>;
