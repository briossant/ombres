import type { StringTable } from './index.ts'

// Chaînes de l'orchestration (agent runner).
export const runner: StringTable = {
  fr: {
    'runner.audioUnlock': 'Appuie sur une touche pour le son',
    'runner.toast.keyboardLeft': 'Clavier {n} quitte le désert',
    'runner.toast.escAgain': 'Échap encore une fois : retour au titre',
  },
  en: {
    'runner.audioUnlock': 'Press any key for sound',
    'runner.toast.keyboardLeft': 'Keyboard {n} leaves the desert',
    'runner.toast.escAgain': 'Esc once more: back to the title',
  },
}
