// Libellés des touches du clavier (GDD §12.2) : positions physiques
// (KeyboardEvent.code), libellés selon la disposition réelle quand le
// navigateur la donne (navigator.keyboard.getLayoutMap), sinon AZERTY en
// français et QWERTY en anglais.
import { useEffect, useState } from 'react'
import { getLang, t } from '../../shared/i18n.ts'

const FALLBACK: Record<'fr' | 'en', Record<string, string>> = {
  fr: { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: 'M', KeyF: 'F' },
  en: { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: ';', KeyF: 'F' },
}

/** Signes de ponctuation écrits en toutes lettres (« ; » se lit mal sur une touche à 3 m). */
const PUNCT_NAMES: Record<string, string> = {
  ';': 'host.key.semicolon',
  ',': 'host.key.comma',
  '.': 'host.key.period',
  ':': 'host.key.colon',
  '/': 'host.key.slash',
  "'": 'host.key.quote',
  '[': 'host.key.bracket',
  ']': 'host.key.bracket',
  '-': 'host.key.minus',
  '=': 'host.key.equal',
}

/** Touches sans caractère : nom lisible (clé i18n). AltRight : « AltGr » en AZERTY, « Alt droit » sinon. */
const NAMED: Record<string, string> = {
  Space: 'host.key.space',
  ShiftLeft: 'host.key.shift',
  ShiftRight: 'host.key.shiftRight',
  Escape: 'host.key.esc',
  Enter: 'host.key.enter',
  NumpadEnter: 'host.key.numpadEnter',
  Numpad0: 'host.key.numpad0',
}

interface KeyboardLayoutMap {
  get(code: string): string | undefined
}
interface NavigatorKeyboard {
  getLayoutMap(): Promise<KeyboardLayoutMap>
}

let cached: KeyboardLayoutMap | null = null

/** Disposition AZERTY ? (la touche physique Q écrit « a ») ; sans API, repli selon la langue. */
export function isAzerty(layout: KeyboardLayoutMap | null = cached): boolean {
  const q = layout?.get('KeyQ')
  return q ? q.toLowerCase() === 'a' : getLang() === 'fr'
}

/** Libellé affichable d'une touche physique : caractère de la disposition réelle, ou nom lisible. */
export function keyLabel(code: string, layout: KeyboardLayoutMap | null = cached): string {
  if (code === 'AltRight') return t(isAzerty(layout) ? 'host.key.altgr' : 'host.key.altRight')
  const named = NAMED[code]
  if (named) return t(named)
  const v = layout?.get(code) ?? FALLBACK[getLang()][code]
  if (v) {
    const name = PUNCT_NAMES[v]
    if (name) return t(name)
    return v.length === 1 ? v.toUpperCase() : v
  }
  return code.replace(/^Key/, '')
}

/** Re-rend quand la disposition du clavier est connue. */
export function useKeyLayout(): KeyboardLayoutMap | null {
  const [layout, setLayout] = useState<KeyboardLayoutMap | null>(cached)
  useEffect(() => {
    if (cached) return
    const kb = (navigator as unknown as { keyboard?: NavigatorKeyboard }).keyboard
    kb?.getLayoutMap()
      .then(m => {
        cached = m
        setLayout(m)
      })
      .catch(() => {
        // API refusée (iframe, navigateur) : libellés de repli.
      })
  }, [])
  return layout
}
