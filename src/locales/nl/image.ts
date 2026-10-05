import type en from '../en/image.js';
import type { CatalogueOf } from '../../i18n.js';

export default {
  'image.take': 'Foto maken',
  'image.choose': 'Foto kiezen',
  'image.chooseMany': 'Foto’s kiezen',
  'image.paste': 'Plakken',
  'image.cameraInput': 'Camera',
  'image.dropHint': 'Je kunt foto’s ook hierheen slepen of plakken met Ctrl+V of Cmd+V.',
  'image.noImage': 'Dat is geen foto. Kies een afbeelding.',
  'image.noneOnClipboard': 'Er staat geen afbeelding op het klembord. Kopieer er eerst een en plak dan.',
  'image.pasteDenied': 'Het klembord kon niet worden gelezen. Sta het toe als erom wordt gevraagd, of plak met Ctrl+V of Cmd+V.',
} satisfies CatalogueOf<typeof en>;
