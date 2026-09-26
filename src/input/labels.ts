// Libellés des commandes d'un joueur local (indications contextuelles, GDD §15.4) : les touches
// de son groupe, écrites selon la disposition réelle quand le navigateur la donne
// (navigator.keyboard.getLayoutMap), sinon repli AZERTY / QWERTY selon la langue.
import { t } from '../shared/i18n.ts'
import { keyLabel } from '../host/ui/keys.ts'
import type { LocalGroup } from './types.ts'

interface LayoutMap {
  get(code: string): string | undefined
}

let layout: LayoutMap | null = null
let requested = false

/** Demande la disposition du clavier (une fois ; sans effet si l'API manque). */
export function loadKeyboardLayout(): void {
  if (requested) return
  requested = true
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap(): Promise<LayoutMap> } }).keyboard
  kb?.getLayoutMap()
    .then(m => {
      layout = m
    })
    .catch(() => {
      // API refusée (iframe, Firefox) : libellés de repli
    })
}

/**
 * Libellés { dive, flap } des boutons du groupe local, pour les textes d'indication. Noms lisibles
 * (polish G7) : « AltGr » en AZERTY, « Alt droit » ailleurs ; « M » en AZERTY, « Point-virgule »
 * en QWERTY (jamais « ; », illisible à 3 m).
 */
export function localButtonLabels(group: LocalGroup): { dive: string; flap: string } {
  if (group === 1) return { dive: t('host.key.space'), flap: t('host.key.shift') }
  return { dive: keyLabel('AltRight', layout), flap: keyLabel('Semicolon', layout) }
}
