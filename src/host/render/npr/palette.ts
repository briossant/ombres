// Horloge de palette et interpolation OKLab des keyframes (ART_BIBLE §2).
//
// - `paletteElev(e)` : horloge dédiée qui garantit que KF16 → KF10 → KF3 → KF1
//   tombe dans les 30 derniers % du soleil (la sim la fournit déjà dans
//   `SunState.paletteElevDeg` ; la fonction sert aux pages de lookdev).
// - `updatePalette(frame)` : une fois par frame, interpole les 9 keyframes de
//   src/shared/palette.json en OKLab (CPU) et pousse les uniforms partagés
//   (jour + nuit), les couleurs dérivées (oiseaux, hachures, lumière des objets)
//   et les tables par joueur (teinte du lavis, couleur d'identité, motif).
import * as THREE from 'three'
import paletteJson from '../../../shared/palette.json'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import type { PlayerVisual } from '../../view.ts'
import { NPR, OWNER_CODES } from './uniforms.ts'
import {
  clamp01,
  hexToLinear,
  hexToOklab,
  linearToOklabInto,
  mixInto,
  mixOklchInto,
  oklabToLinearInto,
  smoothstep,
  type Vec3,
} from './oklab.ts'

// ─── Keyframes ─────────────────────────────────────────────────────────────

const COLOR_KEYS = [
  'skyTop',
  'skyMid',
  'skyHorizon',
  'sun',
  'haze',
  'sandLit',
  'groundFlat',
  'sandShade',
  'castShadow',
  'ink',
  'hatch',
  'birdLit',
  'birdShade',
] as const
export type PaletteColorKey = (typeof COLOR_KEYS)[number]

interface Keyframe {
  id: string
  elev: number
  lab: Record<PaletteColorKey, Vec3>
  hatchOpacity: number
  paintC: number
}

const KEYFRAMES: Keyframe[] = paletteJson.keyframes
  .map((k) => {
    const hex: Record<PaletteColorKey, string> = {
      ...(k.hex as Record<Exclude<PaletteColorKey, 'hatch' | 'birdLit' | 'birdShade'>, string>),
      hatch: k.derived.hatch,
      birdLit: k.derived.birdLit,
      birdShade: k.derived.birdShade,
    }
    const lab = {} as Record<PaletteColorKey, Vec3>
    for (const key of COLOR_KEYS) lab[key] = hexToOklab(hex[key])
    return { id: k.id, elev: k.paletteElevDeg, lab, hatchOpacity: k.derived.hatchOpacity, paintC: k.derived.paintChroma }
  })
  .sort((a, b) => a.elev - b.elev)

const KF = (id: string): Keyframe => {
  const k = KEYFRAMES.find((x) => x.id === id)
  if (!k) throw new Error(`keyframe ${id} absente de palette.json`)
  return k
}
const KF_DUSK = KF('KF-4')
const KF_NIGHT = KF('KF-15')
const KF_FALAISE = KF('KF1')

/** Identifiants et élévations de palette des keyframes (pour les pages de dev). */
export const KEYFRAME_ELEVS: ReadonlyArray<{ id: string; elev: number }> = KEYFRAMES.map((k) => ({ id: k.id, elev: k.elev }))

// ─── Horloge de palette (ART_BIBLE §2.4) ───────────────────────────────────

/** Élévation de gameplay (°) au temps u = t/T (GDD §7). */
export function sunElevationDeg(u: number): number {
  const v = clamp01(u)
  return RULES.sunElevEndDeg + (RULES.sunElevStartDeg - RULES.sunElevEndDeg) * Math.pow(1 - v, RULES.sunElevGamma)
}

/** Azimut du soleil (°, depuis le nord, sens horaire) au temps u (GDD §7). */
export function sunAzimuthDeg(u: number): number {
  const v = clamp01(u)
  return RULES.sunAzEndDeg - (RULES.sunAzEndDeg - RULES.sunAzStartDeg) * Math.pow(1 - v, RULES.sunAzEaseExp)
}

const E_END = RULES.sunElevEndDeg
const E_S = sunElevationDeg(0.7)

/** Élévation de palette pour une élévation de gameplay e (°) : [E_end, E_s] → [1°, E_s]. */
export function paletteElev(e: number): number {
  if (e >= E_S) return e
  return 1 + ((e - E_END) * (E_S - 1)) / (E_S - E_END)
}

/** Inverse de paletteElev (lookdev : ?kf=3.5 → élévation de gameplay correspondante). */
export function gameElevForPalette(pe: number): number {
  if (pe >= E_S) return pe
  return E_END + ((pe - 1) * (E_S - E_END)) / (E_S - 1)
}

// ─── Interpolation ─────────────────────────────────────────────────────────

interface Slot {
  lab: Record<PaletteColorKey, Vec3>
  hatchOpacity: number
  paintC: number
}

const newSlot = (): Slot => {
  const lab = {} as Record<PaletteColorKey, Vec3>
  for (const key of COLOR_KEYS) lab[key] = [0, 0, 0]
  return { lab, hatchOpacity: 0, paintC: 0 }
}

const day = newSlot()
const night = newSlot()

function sampleDay(out: Slot, pe: number): void {
  const K = KEYFRAMES
  let a = K[0]!
  let b = K[K.length - 1]!
  if (pe <= a.elev) b = a
  else if (pe >= b.elev) a = b
  else
    for (let i = 0; i < K.length - 1; i++) {
      if (pe >= K[i]!.elev && pe <= K[i + 1]!.elev) {
        a = K[i]!
        b = K[i + 1]!
        break
      }
    }
  const t = a === b ? 0 : clamp01((pe - a.elev) / (b.elev - a.elev))
  for (const key of COLOR_KEYS) mixInto(out.lab[key], a.lab[key], b.lab[key], t)
  out.hatchOpacity = a.hatchOpacity + (b.hatchOpacity - a.hatchOpacity) * t
  out.paintC = a.paintC + (b.paintC - a.paintC) * t
}

const SKY_KEYS: ReadonlySet<PaletteColorKey> = new Set(['skyTop', 'skyMid', 'skyHorizon', 'sun', 'haze'])

/** Emplacement de nuit : KF-4 → KF-15 ; le ciel passe par OKLCH (chemin court, §2.3). */
function sampleNight(out: Slot, t: number): void {
  for (const key of COLOR_KEYS) {
    if (SKY_KEYS.has(key)) mixOklchInto(out.lab[key], KF_DUSK.lab[key], KF_NIGHT.lab[key], t)
    else mixInto(out.lab[key], KF_DUSK.lab[key], KF_NIGHT.lab[key], t)
  }
  out.hatchOpacity = KF_DUSK.hatchOpacity + (KF_NIGHT.hatchOpacity - KF_DUSK.hatchOpacity) * t
  out.paintC = KF_DUSK.paintC + (KF_NIGHT.paintC - KF_DUSK.paintC) * t
}

const tmp: Vec3 = [0, 0, 0]
function setColor(u: { value: THREE.Color }, lab: Readonly<Vec3>): void {
  oklabToLinearInto(tmp, lab)
  u.value.setRGB(tmp[0], tmp[1], tmp[2], THREE.LinearSRGBColorSpace)
}
const setLab = (u: { value: THREE.Vector3 }, lab: Readonly<Vec3>) => u.value.set(lab[0], lab[1], lab[2])

// ─── Joueurs ───────────────────────────────────────────────────────────────

const PATTERN_IDS: Record<string, number> = {
  lignes45: 0,
  lignes0: 1,
  points: 2,
  lignes90: 3,
  lignes135: 4,
  grille: 5,
  grilleDiag: 6,
  vagues: 7,
  tirets0: 8,
  anneaux: 9,
  zigzag: 10,
  tirets90: 11,
}

const IDENTITY_LIN = PLAYER_COLORS.map((p) => hexToLinear(p.hex))
const TEXT_LIN = PLAYER_COLORS.map((p) => hexToLinear(p.text))

/**
 * Remplit les tables par code propriétaire (slot + 1) depuis les joueurs visibles.
 * Un slot sans joueur prend la couleur d'attribution par défaut (index = slot).
 */
export function updateOwnerTables(players: ReadonlyArray<PlayerVisual | undefined>): void {
  const terr = NPR.uOwnerTerr.value
  const col = NPR.uOwnerCol.value
  const text = NPR.uOwnerText.value
  terr[0]!.set(0, 0, 0, 1)
  col[0]!.set(0, 0, 0, 0)
  for (let code = 1; code < OWNER_CODES; code++) {
    const slot = code - 1
    const ci = players[slot]?.colorIndex ?? slot
    const pc = PLAYER_COLORS[ci] ?? PLAYER_COLORS[0]!
    const h = (pc.terr.h * Math.PI) / 180
    terr[code]!.set(Math.cos(h), Math.sin(h), pc.terr.dL, pc.terr.cs)
    const lin = IDENTITY_LIN[ci] ?? IDENTITY_LIN[0]!
    col[code]!.set(lin[0], lin[1], lin[2], PATTERN_IDS[pc.pattern] ?? 0)
    const tl = TEXT_LIN[ci] ?? TEXT_LIN[0]!
    text[code]!.setRGB(tl[0], tl[1], tl[2], THREE.LinearSRGBColorSpace)
  }
}

// ─── Mise à jour par frame ─────────────────────────────────────────────────

export interface PaletteFrame {
  /** Horloge de palette (°), `SunState.paletteElevDeg`. */
  paletteElevDeg: number
  /** Fondu des résultats KF-4 → KF-15 (0..1) pour l'emplacement de nuit. */
  nightFade?: number
  /** Palette de nuit forcée partout (0..1). */
  nightAll?: number
}

const labLight: Vec3 = [0, 0, 0]
const labLipTmp: Vec3 = [0, 0, 0]

/** Pousse la palette de la frame dans les uniforms partagés. Aucune allocation. */
export function updatePalette(frame: PaletteFrame): void {
  const pe = frame.paletteElevDeg
  sampleDay(day, pe)
  sampleNight(night, clamp01(frame.nightFade ?? 0))

  const L = day.lab
  setColor(NPR.uSkyTop, L.skyTop)
  setColor(NPR.uSkyMid, L.skyMid)
  setColor(NPR.uSkyHorizon, L.skyHorizon)
  setColor(NPR.uSun, L.sun)
  setColor(NPR.uHaze, L.haze)
  setColor(NPR.uSandLit, L.sandLit)
  setColor(NPR.uGroundFlat, L.groundFlat)
  setColor(NPR.uSandShade, L.sandShade)
  setColor(NPR.uCastShadow, L.castShadow)
  setColor(NPR.uInk, L.ink)
  setColor(NPR.uHatchCol, L.hatch)
  setColor(NPR.uBirdLit, L.birdLit)
  setColor(NPR.uBirdShade, L.birdShade)
  NPR.uHatchOpacity.value = day.hatchOpacity
  NPR.uPaintC.value = day.paintC
  NPR.uPaletteElev.value = pe

  // Couleurs dérivées (ART_BIBLE §2.6) : warm 0 de jour → 1 au coucher ; au passage
  // sous l'horizon (paletteElev 1 → −4), les formules « nuit » prennent le relais.
  const warm = clamp01((60 - pe) / 56)
  const dusk = smoothstep(1, -4, pe)
  NPR.uWarm.value = warm
  setLab(NPR.uLabGround, L.groundFlat)
  setLab(NPR.uLabSandLit, L.sandLit)
  setLab(NPR.uLabCast, L.castShadow)
  mixInto(labLight, L.sun, L.sandLit, warm)
  setLab(NPR.uLabBirdLight, labLight)
  NPR.uTintK.value.set(
    0.12 + 0.48 * warm + (0.6 - 0.12 - 0.48 * warm) * dusk,
    0.8 - 0.1 * warm,
    0.1 + 0.4 * warm + (0.55 - 0.1 - 0.4 * warm) * dusk,
    0.15 + 0.45 * warm,
  )

  const N = night.lab
  setColor(NPR.uNGroundFlat, N.groundFlat)
  setColor(NPR.uNSandShade, N.sandShade)
  setColor(NPR.uNCastShadow, N.castShadow)
  setColor(NPR.uNInk, N.ink)
  setColor(NPR.uNHaze, N.haze)
  setColor(NPR.uNHatchCol, N.hatch)
  setColor(NPR.uNBirdLit, N.birdLit)
  setColor(NPR.uNBirdShade, N.birdShade)
  setColor(NPR.uNSkyTop, N.skyTop)
  setColor(NPR.uNSkyMid, N.skyMid)
  setColor(NPR.uNSkyHorizon, N.skyHorizon)
  setColor(NPR.uNSun, N.sun)
  NPR.uNHatchOpacity.value = night.hatchOpacity
  NPR.uNPaintC.value = night.paintC
  setLab(NPR.uNLabGround, N.groundFlat)
  setLab(NPR.uNLabSandLit, N.sandLit)
  setLab(NPR.uNLabCast, N.castShadow)
  setLab(NPR.uNLabBirdLight, N.sandLit)
  NPR.uNTintK.value.set(0.6, 0.7, 0.55, 0.6)
  NPR.uNightAll.value = clamp01(frame.nightAll ?? 0)

  // Lèvre de dernière lumière : le sandLit du jour courant, jamais plus froid que KF1.
  mixInto(labLipTmp, L.sandLit, KF_FALAISE.lab.sandLit, smoothstep(10, 1, pe))
  setColor(NPR.uLipColor, labLipTmp)
}

/** Couleur de palette (jour) interpolée, en RGB linéaire, pour les consommateurs CPU (HUD…). */
export function paletteColor(key: PaletteColorKey, out = new THREE.Color()): THREE.Color {
  oklabToLinearInto(tmp, day.lab[key])
  return out.setRGB(tmp[0], tmp[1], tmp[2], THREE.LinearSRGBColorSpace)
}

/** Couleur OKLab courante (jour) d'une clé de palette (lecture seule). */
export function paletteLab(key: PaletteColorKey): Readonly<Vec3> {
  return day.lab[key]
}

/** Utilitaire : RGB linéaire three → OKLab. */
export function colorToLab(c: THREE.Color, out: Vec3 = [0, 0, 0]): Vec3 {
  tmp[0] = c.r
  tmp[1] = c.g
  tmp[2] = c.b
  return linearToOklabInto(out, tmp)
}

// Initialisation : une palette valide dès l'import (zénith), joueurs par défaut.
updatePalette({ paletteElevDeg: 80 })
updateOwnerTables([])
