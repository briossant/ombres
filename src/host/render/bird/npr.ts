// Adaptateur NPR de l'oiseau et des FX : unique point de contact avec le cadre
// NPR de l'agent world (src/host/render/npr/, voir son README). On y prend :
//   - les uniforms partagés (palette jour/nuit, soleil, height map, brume, uPx…),
//     un seul objet { value } par uniform, jamais copié ;
//   - les chunks GLSL (mrt, common, oklab, palette, night, shadow, fog, tint) ;
//   - le registre des casters de la height shadow map (« âme » des ombres) ;
//   - l'espace des IDs d'encre.
// On y ajoute quelques constantes propres (papier, or de couronne, os).
import { Color } from 'three'
import paletteJson from '../../../shared/palette.json'
import { GLSL, NPR, OBJ_ID, shadowCasters as nprCasters, type CasterHandle } from '../npr/index.ts'
import type { SkinnedMesh } from 'three'

// ─── Couleurs (CPU) ────────────────────────────────────────────────────────

const srgbToLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [srgbToLin(((n >> 16) & 255) / 255), srgbToLin(((n >> 8) & 255) / 255), srgbToLin((n & 255) / 255)]
}

export const PALETTE = paletteJson.constants

const lin = (hex: string) => new Color().setRGB(...hexToLinear(hex))

// ─── Uniforms ──────────────────────────────────────────────────────────────

/** Uniforms propres à l'oiseau et aux FX, partagés entre leurs matériaux. */
export const birdUniforms = {
  uPaper: { value: lin('#F7F0E3') },
  uCrownGold: { value: lin(PALETTE.crownGold) },
  uBone: { value: lin(PALETTE.bone) },
  uCream: { value: lin('#FFFCF0') },
}

/**
 * Tous les uniforms dont les matériaux oiseau/FX ont besoin : ceux du cadre NPR
 * (mêmes objets, par référence) + les nôtres. À étaler dans `uniforms: { ... }`.
 */
export const nprUniforms = { ...NPR, ...birdUniforms }

export type NprUniforms = typeof nprUniforms

// ─── Chunks GLSL ───────────────────────────────────────────────────────────

/** Préambule de fragment : sortie MRT, communs, OKLab, palette jour/nuit, nuit, ombre, brume, teinte. */
export const GLSL_PRELUDE =
  GLSL.mrt +
  GLSL.common +
  GLSL.oklab +
  GLSL.palette +
  GLSL.night +
  GLSL.shadow +
  GLSL.fog +
  GLSL.tint +
  /* glsl */ `
uniform vec3 uPaper, uCrownGold, uBone, uCream;
// Deux tons d'une couleur d'albédo quelconque, famille « oiseau » (ART_BIBLE §2.6).
vec3 birdLitOf(vec3 albedo, float n){ return oklab2lin(nprLitLab(lin2oklab(albedo), NPR_FAMILY_BIRD, n)); }
vec3 birdShadeOf(vec3 albedo, float n){
  vec3 a = lin2oklab(albedo);
  return oklab2lin(nprShadeLab(nprLitLab(a, NPR_FAMILY_BIRD, n), a, NPR_FAMILY_BIRD, n));
}
`

/** Préambule de vertex minimal (palette : uPx, uResolution, soleil…). */
export const GLSL_VERTEX_PRELUDE = GLSL.common + GLSL.palette

/** Front de nuit (nightDist), utilisable aussi dans un vertex shader. */
export const GLSL_NIGHT = GLSL.night

// ─── IDs d'encre (canal A du G-buffer, cf. npr/ids.ts) ─────────────────────

export const OUTLINE_ID = {
  /** + slot : corps de l'oiseau (= birdId). */
  birdBase: OBJ_ID.birdBase,
  /** + slot : bandes, cape, selle, fanion (= birdAccentId), cernés. */
  coloredBase: OBJ_ID.birdAccentBase,
  /** + slot : cavalier (cuir) et mât — plage 44..55, libre dans ids.ts. */
  riderBase: 44,
  /** Couronne du meneur (plage des FX encrés). */
  crown: OBJ_ID.fxBase + 1,
} as const

// ─── Casters de la height shadow map ───────────────────────────────────────

/**
 * Inscrit l'« âme » d'un oiseau (maillage skinné + cavalier) comme caster.
 * Le maillage doit être en mode « detached » à matrixWorld identité : les
 * positions skinnées sont alors directement en monde, pour le maillage visible
 * comme pour le proxy du caster (même squelette, même déformation).
 */
export function addBirdCaster(mesh: SkinnedMesh, slot: number): CasterHandle {
  return nprCasters.add(mesh, { owner: slot + 1, strength: 1 })
}

export type { CasterHandle }
