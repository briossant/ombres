// État de l'app téléphone (zustand). Alimenté par link.ts (réseau) et par les gestes du joueur.
// Les animations à 60 Hz (joystick, anneau de recharge) ne passent pas par ce store : elles
// manipulent le DOM directement. Ici : écrans, vue du PC, statut de jeu, préférences locales.
import { create } from 'zustand'
import type { Lang } from '../shared/protocol.ts'
import { detectLang, setLang } from '../shared/i18n.ts'
import type { ControlScheme, PhoneStatus, PhoneView, ToastParams, ToastTone } from '../shared/messages.ts'
import { CONTROL_SCHEMES } from '../shared/messages.ts'
import { readJson, webStore } from '../net/util.ts'
import type { PhoneConnState, PhoneFatal } from '../net/phoneClient.ts'
import { setHapticsEnabled } from './device/haptics.ts'

export interface Prefs {
  /** Nom saisi (mémorisé pour la prochaine partie), null = jamais choisi. */
  name: string | null
  /** Dernière couleur choisie. */
  color: number | null
  scheme: ControlScheme
  assist: boolean
  haptics: boolean
}

export interface ToastItem {
  id: number
  key: string
  params?: ToastParams
  tone: ToastTone
  at: number
}

export type Sheet = null | 'settings' | 'profile' | 'rules'

export interface PhoneState {
  room: string
  conn: PhoneConnState
  error: PhoneFatal | null
  hostOnline: boolean
  /** Au moins une connexion réussie (on distingue « connexion » et « reconnexion »). */
  everOnline: boolean
  /** Début de la coupure en cours (performance.now), null si tout va bien. */
  troubleSince: number | null
  view: PhoneView | null
  /** Instant local (performance.now) de réception de la vue : base des compte-à-rebours. */
  viewAt: number
  status: PhoneStatus | null
  statusAt: number
  lang: Lang
  prefs: Prefs
  sheet: Sheet
  toasts: ToastItem[]
  /** Profil envoyé, en attente de confirmation par la vue du PC (affichage optimiste). */
  pendingProfile: { name: string; color: number | null; at: number } | null
  /** Coup d'aile pressé localement (prédiction de l'anneau de recharge). */
  flapPressedAt: number
  /** Vote / prêt envoyés (optimiste). */
  pendingReady: boolean | null
  pendingVote: 'rematch' | 'toLobby' | null
  /** Micro-objectifs détectés localement (retour instantané avant la confirmation du PC). */
  localGoals: { fly: boolean; dive: boolean }
  /** Le joueur a touché le joystick au moins une fois (masque l'indication « pouce ici »). */
  touchedStick: boolean
}

const PREFS_KEY = 'ombres.phone.prefs.v1'
const prefsStore = webStore('local')

function loadPrefs(): Prefs {
  const p = readJson<Partial<Prefs>>(prefsStore, PREFS_KEY) ?? {}
  return {
    name: typeof p.name === 'string' && p.name ? p.name : null,
    color: typeof p.color === 'number' && p.color >= 0 && p.color < 12 ? p.color : null,
    scheme: p.scheme && CONTROL_SCHEMES.includes(p.scheme) ? p.scheme : 'absolute',
    assist: p.assist === true,
    haptics: p.haptics !== false,
  }
}

const initialLang = detectLang()
setLang(initialLang)
const initialPrefs = loadPrefs()
setHapticsEnabled(initialPrefs.haptics)

export const usePhone = create<PhoneState>(() => ({
  room: '',
  conn: 'idle',
  error: null,
  hostOnline: false,
  everOnline: false,
  troubleSince: null,
  view: null,
  viewAt: 0,
  status: null,
  statusAt: 0,
  lang: initialLang,
  prefs: initialPrefs,
  sheet: null,
  toasts: [],
  pendingProfile: null,
  flapPressedAt: -Infinity,
  pendingReady: null,
  pendingVote: null,
  localGoals: { fly: false, dive: false },
  touchedStick: false,
}))

export const phoneState = (): PhoneState => usePhone.getState()

export function setPrefs(patch: Partial<Prefs>): void {
  const prefs = { ...usePhone.getState().prefs, ...patch }
  usePhone.setState({ prefs })
  prefsStore.set(PREFS_KEY, JSON.stringify(prefs))
  if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics)
}

export function setPhoneLang(lang: Lang): void {
  if (usePhone.getState().lang === lang) return
  setLang(lang)
  usePhone.setState({ lang })
  document.documentElement.lang = lang
}

let toastSeq = 0
export function pushToast(key: string, params?: ToastParams, tone: ToastTone = 'info'): void {
  const item: ToastItem = { id: ++toastSeq, key, params, tone, at: performance.now() }
  // Au plus deux messages à la fois : le plus récent chasse le plus ancien.
  usePhone.setState(s => ({ toasts: [...s.toasts.slice(-1), item] }))
  setTimeout(() => usePhone.setState(s => ({ toasts: s.toasts.filter(t => t.id !== item.id) })), 2800)
}

export function openSheet(sheet: Sheet): void {
  usePhone.setState({ sheet })
}

/** Couleur affichée pour le joueur : profil en attente > vue du PC > préférence. */
export function displayedColor(s: PhoneState): number | null {
  if (s.pendingProfile && s.pendingProfile.color !== null) return s.pendingProfile.color
  return s.view?.you.color ?? s.prefs.color
}
