// Réglages du PC, persistés dans localStorage (lecture/écriture protégées).
// Lus par l'audio, le rendu (qualité), l'UI, le narrateur, les indications.
import { create } from 'zustand'
import type { Lang } from '../shared/protocol.ts'
import { detectLang, setLang } from '../shared/i18n.ts'

export type QualityPreset = 'auto' | 'low' | 'medium' | 'high' | 'ultra'
export type NarratorMode = 'voice' | 'text' | 'off' // voix + sous-titres / sous-titres seuls / rien
export type HintsMode = 'auto' | 'always' | 'never'

export interface Settings {
  lang: Lang
  volMaster: number // 0..1
  volMusic: number
  volSfx: number
  volVoice: number
  narrator: NarratorMode
  quality: QualityPreset
  colorblind: boolean
  hints: HintsMode
  reduceFlashes: boolean
  screenShake: boolean
}

const KEY = 'ombres.settings.v1'

const DEFAULTS: Settings = {
  lang: detectLang(),
  volMaster: 0.9,
  volMusic: 0.7,
  volSfx: 0.8,
  volVoice: 0.9,
  narrator: 'voice',
  quality: 'auto',
  colorblind: false,
  hints: 'auto',
  // Par défaut, suit la préférence du système (« réduire les animations ») ; réglable ensuite.
  reduceFlashes: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  screenShake: true,
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // stockage indisponible (navigation privée…) : valeurs par défaut
  }
  return { ...DEFAULTS }
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>((set, get) => {
  const initial = load()
  setLang(initial.lang)
  const persist = () => {
    try {
      const { set: _s, reset: _r, ...values } = get()
      localStorage.setItem(KEY, JSON.stringify(values))
    } catch {
      // ignoré
    }
  }
  return {
    ...initial,
    set: (key, value) => {
      set({ [key]: value } as Partial<SettingsStore>)
      if (key === 'lang') setLang(value as Lang)
      persist()
    },
    reset: () => {
      set({ ...DEFAULTS })
      setLang(DEFAULTS.lang)
      persist()
    },
  }
})

/** Accès hors React (audio, rendu, runner). */
export const getSettings = (): Settings => useSettings.getState()
