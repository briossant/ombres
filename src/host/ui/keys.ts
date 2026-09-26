// Libellés des touches du clavier (GDD §12.2) : positions physiques
// (KeyboardEvent.code), libellés selon la disposition réelle quand le
// navigateur la donne (navigator.keyboard.getLayoutMap), sinon AZERTY en
// français et QWERTY en anglais.
import { useEffect, useState } from 'react'
import { getLang } from '../../shared/i18n.ts'

const FALLBACK: Record<'fr' | 'en', Record<string, string>> = {
  fr: { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: 'M', KeyF: 'F' },
  en: { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: ';', KeyF: 'F' },
}

interface KeyboardLayoutMap {
  get(code: string): string | undefined
}
interface NavigatorKeyboard {
  getLayoutMap(): Promise<KeyboardLayoutMap>
}

let cached: KeyboardLayoutMap | null = null

/** Libellé affichable d'une touche physique. */
export function keyLabel(code: string, layout: KeyboardLayoutMap | null = cached): string {
  const v = layout?.get(code)
  if (v) return v.length === 1 ? v.toUpperCase() : v
  return FALLBACK[getLang()][code] ?? code.replace(/^Key/, '')
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
