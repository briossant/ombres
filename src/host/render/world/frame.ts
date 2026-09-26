// Pilotage par frame des uniforms du monde depuis gameView + worldView :
// soleil (repère three), palette (jour/nuit), brume, front de nuit, zones de la
// height map. Pas d'allocation.
import * as THREE from 'three'
import { RULES } from '../../../sim/rules.ts'
import type { SimState } from '../../../sim/types.ts'
import type { GameView } from '../../view.ts'
import { updateOwnerTables, updatePalette } from '../npr/palette.ts'
import { shadowAreas } from '../npr/shadowMap.ts'
import { NPR, setNightJag } from '../npr/uniforms.ts'
import type { WorldView } from '../worldView.ts'

const DEG = Math.PI / 180

/** Élévation minimale pour la projection des ombres (division par sin e). */
const MIN_PROJ_ELEV = 2 * DEG

/** Direction VERS le soleil en repère three pour (élévation, azimut depuis le nord, horaire). */
export function sunVector(elev: number, az: number, out: THREE.Vector3): THREE.Vector3 {
  // sim : (x est, y nord) = (sin az, cos az) ; three : (x, y, z) = (sim.x, haut, −sim.y)
  const ce = Math.cos(elev)
  return out.set(Math.sin(az) * ce, Math.sin(elev), -Math.cos(az) * ce)
}

let lastJag: Float32Array | null = null
const fwd = new THREE.Vector3()

export interface WorldFrameResult {
  /** Avancée de la Grande Ombre à travers l'arène (0..1). */
  nightProgress: number
  /** Élévation (rad) du soleil dessiné. */
  discElev: number
}

const result: WorldFrameResult = { nightProgress: 0, discElev: 0 }

const lastColors = new Int8Array(12).fill(-2)
/** Vrai si l'attribution des couleurs a changé depuis la dernière frame (sans allocation). */
function playersChanged(view: GameView): boolean {
  let changed = false
  for (let i = 0; i < 12; i++) {
    const c = view.players[i]?.colorIndex ?? -1
    if (lastColors[i] !== c) {
      lastColors[i] = c
      changed = true
    }
  }
  return changed
}

/** Progression de la Grande Ombre (0 au début, 1 quand le front a passé l'arène). */
function greatShadowProgress(sim: SimState): number {
  const k = sim.sun.T / RULES.roundSunSeconds
  const t0 = RULES.greatShadowAt * k
  if (sim.sun.phase === 'night' || sim.sun.phase === 'over') return 1
  if (sim.sun.phase !== 'greatShadow') return 0
  return Math.min(1, Math.max(0, (sim.sun.t - t0) / (sim.sun.T - t0)))
}

export function applyWorldFrame(view: GameView, wv: WorldView, camera: THREE.Camera): WorldFrameResult {
  const sim = view.sim
  // ── soleil ──
  let elev = 60 * DEG
  let az = 250 * DEG
  let pe = 50
  if (sim) {
    elev = sim.sun.elevation
    az = sim.sun.azimuth
    pe = sim.sun.paletteElevDeg
  }
  if (wv.sunOverride) {
    elev = wv.sunOverride.elevDeg * DEG
    az = wv.sunOverride.azDeg * DEG
  }
  if (wv.paletteElevOverride !== null) pe = wv.paletteElevOverride

  const progress = sim ? greatShadowProgress(sim) : 0
  const autoNightAll = sim && (sim.sun.phase === 'night' || sim.sun.phase === 'over') ? 1 : 0
  const nightAll = wv.nightAll ?? autoNightAll
  sunVector(Math.max(elev, MIN_PROJ_ELEV), az, NPR.uSunDir.value)
  // le soleil dessiné plonge derrière la Falaise pendant la Grande Ombre
  const discElev = elev - progress * 7 * DEG - nightAll * 4 * DEG
  sunVector(discElev, az, NPR.uSunDiscDir.value)
  NPR.uShadowDir.value.set(-Math.sin(az), Math.cos(az)).normalize()

  updatePalette({ paletteElevDeg: pe, nightFade: wv.resultsFade, nightAll })

  if (playersChanged(view)) updateOwnerTables(view.players)
  NPR.uColorblind.value = view.colorblind ? 1 : 0

  // ── front de nuit ──
  const night = sim?.night
  if (night && night.active) {
    NPR.uNightOn.value = 1
    NPR.uNightDir.value.set(night.dirX, -night.dirY)
    NPR.uNightPerp.value.set(-night.dirY, -night.dirX)
    NPR.uNightS.value = night.s
    NPR.uNightSpan.value = night.jagSpan
    if (night.jag !== lastJag) {
      lastJag = night.jag
      setNightJag(night.jag)
    }
  } else {
    NPR.uNightOn.value = 0
  }

  // ── arène : zones de la height map, brume ≤ 0,15 dans l'arène ──
  const a = sim?.arena.a ?? 165
  const b = sim?.arena.b ?? 114
  shadowAreas.cx = 0
  shadowAreas.cz = 0
  shadowAreas.half = Math.max(a, b) + 90
  shadowAreas.halfFar = 1100
  // au-dessus de ~40°, la plus haute tour (120 m) ne projette pas au-delà de la zone proche
  shadowAreas.farOn = elev < 40 * DEG || camera.position.y < 90
  // cascade focus : seulement pour une caméra basse (plans de mise en scène)
  camera.getWorldDirection(fwd)
  const low = camera.position.y < 90
  shadowAreas.focusOn = low
  if (low) {
    const hx = fwd.x
    const hz = fwd.z
    const hl = Math.hypot(hx, hz) || 1
    shadowAreas.fx = camera.position.x + (hx / hl) * 75
    shadowAreas.fz = camera.position.z + (hz / hl) * 75
    shadowAreas.focusHalf = 90
  }
  const cx = camera.position.x
  const cz = camera.position.z
  const d = Math.hypot(cx, cz)
  let farX = 0
  let farZ = 0
  if (d > 1e-3) {
    const ux = -cx / d
    const uz = -cz / d
    const r = 1 / Math.sqrt((ux / a) ** 2 + (uz / b) ** 2)
    farX = ux * r
    farZ = uz * r
  } else {
    farX = a
  }
  const farDist = Math.hypot(cx - farX, camera.position.y, cz - farZ)
  NPR.uFogStart.value = Math.max(0, farDist + 12 + Math.log(0.85) / NPR.uFogK.value)

  result.nightProgress = Math.max(progress, nightAll)
  result.discElev = discElev
  return result
}
