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

// ─── Ombre portée sur le lavis (polish 2) ─────────────────────────────────
//
// Par couleur de joueur, la teinte de l'ombre sur son lavis est FIXE à une heure donnée (la teinte
// du lavis l'est) : on la calcule ici, une fois par frame pour 12 couleurs, au lieu d'un atan /
// cos / sin par pixel. De jour (W4) : rotation vers 290° de 0,22 × l'écart côté rouge, 0,15 côté
// vert, ≤ 40°, chroma × 0,85. En fin de journée (uShadowCool → 1) : vers 300°, 0,45 × l'écart côté
// rouge (≤ 90°), chroma × 1 ; le sol ajoute un glacis de 30 % vers l'ombre neutre. Le Safran (89°)
// a sa propre cible : mauve (340°) un peu plus clair, chroma × 0,75 (sinon framboise, voisin du
// Rose) ; porte gameFrozenPair de docs/art/tools/final.mjs : ΔE ≥ 0,059 entre joueurs gelés.
interface ShadeTarget {
  /** Teinte cible de l'ombre en fin de journée (°), à la place de la rotation par défaut. */
  h: number
  cf: number
  kL: number
}
const SHADE_OVERRIDE: ReadonlyArray<ShadeTarget | undefined> = PLAYER_COLORS.map((p) => (p.name.en === 'Saffron' ? { h: 340, cf: 0.75, kL: 1.16 } : undefined))
/**
 * Côté nuit (W6) : chroma × 0,52 et rotation W4 ; Safran mauve 325°, L + 0,06, chroma × 0,5 ; Corail
 * lie-de-vin 0°, L + 0,04 (sinon ocre brun et brun marron sur la moitié gelée ; porte gameNightPair ≥ 0,05).
 */
const NIGHT_CHROMA = 0.52
const NIGHT_TARGETS: Readonly<Record<string, { h: number; cf: number; dL: number }>> = {
  Saffron: { h: 325, cf: 0.5, dL: 0.06 },
  Coral: { h: 0, cf: 0.52, dL: 0.04 },
}
const NIGHT_OVERRIDE = PLAYER_COLORS.map((p) => NIGHT_TARGETS[p.name.en])
const ownerColor = new Int8Array(OWNER_CODES).fill(0)
const DEG = Math.PI / 180
/** Angle signé (rad) de la teinte h (°) vers la teinte t (°), par le chemin court. */
function hueDelta(h: number, t: number): number {
  const d = (t - h) * DEG
  return Math.atan2(Math.sin(d), Math.cos(d))
}
/** Rotation (rad) vers `target` : fraction fr côté rouge (écart négatif), fg côté vert, au plus mx. */
function shadeRot(h: number, target: number, fr: number, fg: number, mx: number): number {
  const dh = hueDelta(h, target)
  return Math.sign(dh) * Math.min(Math.abs(dh) * (dh < 0 ? fr : fg), mx)
}
let overridesOn = true
/**
 * Levier de mesure (worldView.lookPolish2) : false = teintes d'ombre et de nuit d'avant le polish 2
 * (aucune cible propre à une couleur). Sans effet si l'état ne change pas.
 */
export function setShadeOverrides(on: boolean): void {
  if (on === overridesOn) return
  overridesOn = on
  updateOwnerNight()
  updateOwnerShade(NPR.uShadowCool.value)
}

/** Remplit uOwnerNight (fixe tant que les couleurs ne changent pas). */
function updateOwnerNight(): void {
  const out = NPR.uOwnerNight.value
  out[0]!.set(1, 0, NIGHT_CHROMA, 0)
  for (let code = 1; code < OWNER_CODES; code++) {
    const ci = ownerColor[code]!
    const h = (PLAYER_COLORS[ci] ?? PLAYER_COLORS[0]!).terr.h
    const ov = overridesOn ? NIGHT_OVERRIDE[ci] : undefined
    const a = ov ? ov.h * DEG : h * DEG + shadeRot(h, 290, 0.22, 0.15, 40 * DEG)
    out[code]!.set(Math.cos(a), Math.sin(a), ov ? ov.cf : NIGHT_CHROMA, ov ? ov.dL : 0)
  }
}

/** Remplit uOwnerShade pour le poids de fin de journée s (0..1). Aucune allocation. */
export function updateOwnerShade(s: number): void {
  const out = NPR.uOwnerShade.value
  out[0]!.set(1, 0, 0.85, 1)
  for (let code = 1; code < OWNER_CODES; code++) {
    const ci = ownerColor[code]!
    const pc = PLAYER_COLORS[ci] ?? PLAYER_COLORS[0]!
    const h = pc.terr.h
    const day = shadeRot(h, 290, 0.22, 0.15, 40 * DEG)
    const ov = overridesOn ? SHADE_OVERRIDE[ci] : undefined
    const eve = ov ? hueDelta(h, ov.h) : shadeRot(h, 300, 0.45, 0.15, 90 * DEG)
    const a = h * DEG + day + (eve - day) * s
    const cfEve = ov ? ov.cf : 1
    const kLEve = ov ? ov.kL : 1
    out[code]!.set(Math.cos(a), Math.sin(a), 0.85 + (cfEve - 0.85) * s, 1 + (kLEve - 1) * s)
  }
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
    ownerColor[code] = PLAYER_COLORS[ci] ? ci : 0
    const h = (pc.terr.h * Math.PI) / 180
    terr[code]!.set(Math.cos(h), Math.sin(h), pc.terr.dL, pc.terr.cs)
    const lin = IDENTITY_LIN[ci] ?? IDENTITY_LIN[0]!
    col[code]!.set(lin[0], lin[1], lin[2], PATTERN_IDS[pc.pattern] ?? 0)
    const tl = TEXT_LIN[ci] ?? TEXT_LIN[0]!
    text[code]!.setRGB(tl[0], tl[1], tl[2], THREE.LinearSRGBColorSpace)
  }
  updateOwnerShade(NPR.uShadowCool.value)
  updateOwnerNight()
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
/**
 * Plafond de chroma des lavis forts à l'heure dorée (polish W12). 0,125 et non 0,12 : à 0,12 deux
 * joueurs gelés sous une ombre (Corail / Carmin) tombaient à ΔE 0,058 (< 0,059, bible §3.4) ;
 * docs/art/tools/final.mjs (porte gameFrozenPair) le vérifie.
 */
export const PAINT_C_GOLDEN_MAX = 0.125
/**
 * Plafond de chroma des lavis forts au couchant (KF3 → KF1, polish 2) : 0,12 au lieu de 0,155
 * (paintC 0,135 × cs 1,15), pour les lavis CLAIRS seulement (uPaintCapDark : Safran, Anis, Lagon, Rose,
 * Lilas, les « néons » sur le sol gris) ; les écarts entre forts restent ≥ 0,088 (porte gameStrongPair).
 */
export const PAINT_C_SUNSET_MAX = 0.12
const labLipTmp: Vec3 = [0, 0, 0]

/** Pousse la palette de la frame dans les uniforms partagés. Aucune allocation. */
export function updatePalette(frame: PaletteFrame): void {
  const pe = frame.paletteElevDeg
  const fade = clamp01(frame.nightFade ?? 0)
  const all = clamp01(frame.nightAll ?? 0)
  sampleDay(day, pe)
  sampleNight(night, fade)

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
  NPR.uNightAll.value = all

  // Rideau du Simoun (StormCurtain) : voile = mix OKLab (sandShade, haze, 0,3), jour et nuit
  mixInto(labLipTmp, L.sandShade, L.haze, 0.3)
  setColor(NPR.uStormVeil, labLipTmp)
  mixInto(labLipTmp, N.sandShade, N.haze, 0.3)
  setColor(NPR.uNStormVeil, labLipTmp)

  // Lèvre de dernière lumière : le sandLit du jour courant, jamais plus froid que KF1.
  mixInto(labLipTmp, L.sandLit, KF_FALAISE.lab.sandLit, smoothstep(10, 1, pe))
  setColor(NPR.uLipColor, labLipTmp)
  setLab(NPR.uLipLab, labLipTmp)
  // Heure dorée (≈ KF25 → KF10) : chroma des lavis forts plafonnée (polish W12 : les grandes zones
  // Safran / Carmin se lisaient comme des aplats vectoriels). Couchant (polish 2) : plafond un peu
  // plus haut (vitrail) mais plus de chroma 0,155 : à 12 joueurs, KF3 faisait « tapis de Twister ».
  const late = smoothstep(34, 25, pe)
  const cap = PAINT_C_GOLDEN_MAX + (PAINT_C_SUNSET_MAX - PAINT_C_GOLDEN_MAX) * smoothstep(9, 5, pe)
  NPR.uPaintCMax.value = cap * late + (1 - late)
  NPR.uPaintCapDark.value = smoothstep(9, 5, pe)
  NPR.uShadowCool.value = smoothstep(40, 22, pe)
  updateOwnerShade(NPR.uShadowCool.value)
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
