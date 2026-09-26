// Page de lookdev des oiseaux et des FX : dev/birds.html
// Rendu complet par le cadre NPR de l'agent world (<WorldCanvas> : sol, territoire,
// ombres, tours, ciel, encre, SMAA) avec la VRAIE simulation (entrées scriptées).
//   ?view=closeup|states|flock|game|sheet   (défaut closeup)
//   ?state=glide|low|high|climb|descend|bank|bankR|dive|guided|windup|stun|miss|flap|immune|hidden|locked|crown|perch|tsk|steal
//   ?elev=50        élévation de palette (°) du gros plan — 80 zénith, 16 heure dorée, 3 coucher
//   ?t=40           secondes de soleil jouées avant l'affichage (vues flock/game), déterministe
//   ?n=6            nombre d'oiseaux (flock, game) ; ?map=parasols|aiguilles|geantes|cadran
//   ?turntable=1    rotation de la caméra (closeup) ; ?yaw=35 ?pitch=18 ?dist=16 (degrés, m)
//   ?pause=1        fige la simulation ; ?freeze=1 fige aussi l'animation (captures)
//   ?fx=0 ?cb=1 ?q=low|medium|high ?glory=slot ?labels=0 ?follow=slot ?debug=1
// window.__ready passe à true quand la scène est prête ; window.__dev expose le pilote.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Vector3, type PerspectiveCamera } from 'three'
import { RULES } from '../../sim/rules.ts'
import type { MapId } from '../../sim/types.ts'
import type { PolicyName } from '../../sim/harness.ts'
import { gameView } from '../../host/view.ts'
import { simEvents } from '../../host/bus.ts'
import { WorldCanvas } from '../../host/render/WorldCanvas.tsx'
import { worldView } from '../../host/render/worldView.ts'
import { Birds, type BirdsQuality } from '../../host/render/bird/Birds.tsx'
import type { BirdsController } from '../../host/render/bird/controller.ts'
import { birdAnimEvents } from '../../host/render/bird/anchors.ts'
import type { BirdMode } from '../../host/render/bird/animator.ts'
import { Fx } from '../../host/render/fx/Fx.tsx'
import type { FxSystem } from '../../host/render/fx/system.ts'
import { DevDriver, type PuppetSpec } from './driver.ts'

declare global {
  interface Window {
    __ready?: boolean
    __dev?: Record<string, unknown>
  }
}

const Q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (Q.has(k) ? Number(Q.get(k)) : d)
const VIEW = Q.get('view') ?? 'closeup'
const STATE = Q.get('state') ?? 'glide'
const ELEV = num('elev', 50)
const N = num('n', 6)
const PAUSE = Q.get('pause') === '1'
const FREEZE = Q.get('freeze') === '1'
const FX = Q.get('fx') !== '0'
const QUALITY = (Q.get('q') ?? 'high') as BirdsQuality
const LABELS = Q.get('labels') !== '0'
const DEBUG = Q.get('debug') === '1'
const PUPPET_VIEW = VIEW === 'closeup' || VIEW === 'states' || VIEW === 'sheet'
/** Temps de soleil (s) : gros plans et planches à un instant fixe, vues de jeu à ?t. */
const T_SUN = num('t', PUPPET_VIEW ? 2 : 40)
/** Secondes d'animation jouées avant la capture (ressorts, traînées, bouffées). */
const WARM = num('warm', PUPPET_VIEW ? 2.5 : 3)

// 12 oiseaux au plus (slots 0..11) : deux planches d'états (?set=2 pour la seconde).
const STATES_GRID =
  Q.get('set') === '2'
    ? ['windup', 'dive', 'threat', 'miss', 'crown', 'tsk', 'steal', 'bankR', 'high', 'guided', 'flap', 'immune']
    : ['glide', 'low', 'climb', 'descend', 'bank', 'dive', 'threat', 'flap', 'stun', 'immune', 'hidden', 'locked']

interface Setup {
  driver: DevDriver
  modes: (BirdMode | undefined)[]
  labels: string[]
}

function buildSetup(): Setup {
  const modes: (BirdMode | undefined)[] = []
  const labels: string[] = []
  const P = (slot: number, state: string, x: number, y: number, z: number, extra: Partial<PuppetSpec> = {}): PuppetSpec => ({
    slot,
    state,
    x,
    y,
    z,
    heading: Math.PI / 2,
    period: state === 'stun' || state === 'dive' ? 2.4 : state === 'miss' ? 1.8 : 1.6,
    ...extra,
  })
  const mapId = (Q.get('map') ?? 'parasols') as MapId
  if (VIEW === 'closeup') {
    const z = STATE === 'low' || STATE === 'stun' || STATE === 'miss' ? RULES.altLow : 18
    const driver = new DevDriver({ mapId, birds: 1, seed: 3, sunSeconds: 110, puppets: [P(0, STATE === 'perch' ? 'glide' : STATE, 0, -20, z)] })
    if (STATE === 'perch') modes[0] = 'perch'
    labels.push(STATE)
    return { driver, modes, labels }
  }
  if (VIEW === 'states') {
    const cols = 4
    const puppets = STATES_GRID.map((st, i) => {
      labels.push(st === 'threat' ? 'cible (!)' : st)
      // Grille décalée vers l'est : le parasol du lobby est en (−30, 10).
      const x = 24 + ((i % cols) - (cols - 1) / 2) * 20
      const y = 26 - Math.floor(i / cols) * 20
      const z = st === 'glide' || st === 'crown' ? 18 : 10
      return P(i, st === 'threat' ? 'low' : st, x, y, z, st === 'dive' ? { target: STATES_GRID.indexOf('threat') } : {})
    })
    const driver = new DevDriver({ mapId: 'lobby', birds: puppets.length, seed: 5, sunSeconds: 110, puppets })
    return { driver, modes, labels }
  }
  if (VIEW === 'sheet') {
    // Une marionnette par capture (angles variés) : la page est pilotée par ?yaw/?pitch.
    const driver = new DevDriver({ mapId: 'lobby', birds: 1, seed: 3, sunSeconds: 110, puppets: [P(0, STATE, 0, 0, 18)] })
    labels.push(STATE)
    return { driver, modes, labels }
  }
  const policies = Q.get('policies')?.split(',') as PolicyName[] | undefined
  const driver = new DevDriver({ mapId, birds: N, seed: num('seed', 7), sunSeconds: 110, puppets: [], policies })
  return { driver, modes, labels }
}

function Scene() {
  const { camera, size, gl } = useThree()
  const setup = useMemo(buildSetup, [])
  const { driver, modes, labels } = setup
  const ctl = useRef<BirdsController | null>(null)
  const fxCtl = useRef<FxSystem | null>(null)
  const lblRefs = useRef<(HTMLDivElement | null)[]>([])
  const cam = camera as PerspectiveCamera
  const tmp = useMemo(() => new Vector3(), [])
  const camTarget = useMemo(() => new Vector3(), [])
  const warmed = useRef(false)
  const clock = useRef(0)

  useEffect(() => {
    gameView.colorblind = Q.get('cb') === '1'
    gameView.timeScale = 1
    if (PUPPET_VIEW) {
      worldView.paletteElevOverride = ELEV
      worldView.sunOverride = { elevDeg: Math.max(ELEV, 9), azDeg: 235 }
    }
    cam.fov = 40
    cam.near = 1
    cam.far = 9000
    cam.updateProjectionMatrix()
    window.__dev = { driver, gameView, worldView, gl, simEvents, birdAnimEvents }
  }, [driver, cam, gl])

  const vh = () => size.height * gl.getPixelRatio()

  function placeCamera(T: number, dt: number, snap: boolean): void {
    const S = driver.display
    if (VIEW === 'closeup' || VIEW === 'sheet') {
      const b = S.birds[0]!
      camTarget.set(b.x, b.z + 0.6, -b.y)
      const yaw = (num('yaw', 35) + (Q.get('turntable') === '1' ? T * 20 : 0)) * (Math.PI / 180)
      const pitch = num('pitch', 18) * (Math.PI / 180)
      const dist = num('dist', 17)
      // L'oiseau regarde vers le nord (−z three) ; yaw 0 = caméra devant lui.
      cam.position.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, camTarget.y + Math.sin(pitch) * dist, camTarget.z - Math.cos(yaw) * Math.cos(pitch) * dist)
      cam.up.set(0, 1, 0)
      cam.lookAt(camTarget)
    } else if (VIEW === 'states') {
      const pitch = num('pitch', 58) * (Math.PI / 180)
      const dist = num('dist', 100)
      camTarget.set(24, 6, -8)
      cam.position.set(24, 6 + Math.sin(pitch) * dist, -8 + Math.cos(pitch) * dist)
      cam.lookAt(camTarget)
    } else {
      // Cadre les oiseaux et leurs ombres comme la caméra de jeu : lacet fixe vers le nord.
      // Suivi d'un oiseau (?follow=slot, ou window.__dev.follow posé par un script de capture).
      const dyn = window.__dev?.follow as number | undefined
      const follow = dyn !== undefined ? S.bySlot[dyn] : Q.has('follow') ? S.bySlot[num('follow', 0)] : undefined
      if (window.__dev?.snap) {
        snap = true
        window.__dev.snap = false
      }
      let minX = 1e9
      let maxX = -1e9
      let minY = 1e9
      let maxY = -1e9
      for (const b of follow ? [follow] : S.birds) {
        minX = Math.min(minX, b.x, b.shadow.cx)
        maxX = Math.max(maxX, b.x, b.shadow.cx)
        minY = Math.min(minY, b.y, b.shadow.cy)
        maxY = Math.max(maxY, b.y, b.shadow.cy)
      }
      const aspect = size.width / size.height
      const minW = VIEW === 'flock' ? num('width', 90) : RULES.camMinWidth
      const w = Math.max(minW, (maxX - minX) * 1.3, (maxY - minY) * 1.35 * aspect)
      const pitch = num('pitch', VIEW === 'flock' ? 40 : RULES.camPitchStartDeg - (RULES.camPitchStartDeg - RULES.camPitchEndDeg) * S.sun.u) * (Math.PI / 180)
      const hfov = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect)
      const dist = w / 2 / Math.tan(hfov / 2)
      tmp.set((minX + maxX) / 2, follow ? follow.z : 6, -(minY + maxY) / 2)
      camTarget.lerp(tmp, snap ? 1 : 1 - Math.exp(-dt * RULES.camPosOmega))
      cam.position.set(camTarget.x, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(pitch) * dist)
      cam.lookAt(camTarget)
    }
    cam.updateMatrixWorld()
  }

  // Priorité −5 : pilote de la sim et caméra, avant les oiseaux (−1) et les FX (0).
  useFrame((_, delta) => {
    let dt = Math.min(delta, 0.1)
    if (!warmed.current) {
      // Avance rapide déterministe : soleil jusqu'à T_SUN (sans événements), puis
      // WARM secondes d'animation (ressorts, traînées, particules).
      while (driver.sim.state.sun.t < T_SUN - 1e-6 && !driver.sim.state.over) driver.tick(false)
      const steps = Math.round(WARM * RULES.tickHz)
      for (let i = 0; i < steps; i++) {
        driver.tick(true)
        gameView.alpha = 1
        placeCamera(0, 1 / RULES.tickHz, true)
        ctl.current?.update(gameView, camera, 1 / RULES.tickHz, vh())
        fxCtl.current?.update(gameView, camera, 1 / RULES.tickHz, vh())
      }
      warmed.current = true
      dt = 0
    }
    if (FREEZE) dt = 0
    clock.current += dt
    if (PAUSE) driver.paused = true
    driver.update(dt)
    placeCamera(clock.current, dt, false)

    // Étiquettes (vue states).
    labels.forEach((_, i) => {
      const el = lblRefs.current[i]
      const b = driver.display.bySlot[i]
      if (!el || !b || VIEW !== 'states') return
      tmp.set(b.x, b.z, -b.y).project(cam)
      el.style.left = `${((tmp.x + 1) / 2) * size.width}px`
      el.style.top = `${((1 - tmp.y) / 2) * size.height + 44}px`
    })
    if (!window.__ready && warmed.current) requestAnimationFrame(() => requestAnimationFrame(() => (window.__ready = true)))
  }, -5)

  return (
    <>
      <Birds
        quality={QUALITY}
        modes={modes}
        onController={c => {
          ctl.current = c
          if (window.__dev) window.__dev.birds = c
        }}
      />
      {FX && (
        <Fx
          quality={QUALITY}
          glorySlot={Q.has('glory') ? num('glory', 0) : -1}
          onSystem={s => {
            fxCtl.current = s
            if (window.__dev) window.__dev.fx = s
          }}
        />
      )}
      {VIEW === 'states' && LABELS && <Labels labels={labels} refs={lblRefs} />}
    </>
  )
}

function Labels({ labels, refs }: { labels: string[]; refs: React.RefObject<(HTMLDivElement | null)[]> }) {
  useEffect(() => {
    const root = document.getElementById('labels')!
    root.innerHTML = ''
    labels.forEach((l, i) => {
      const d = document.createElement('div')
      d.className = 'lbl'
      d.textContent = l
      root.appendChild(d)
      refs.current[i] = d
    })
  }, [labels, refs])
  return null
}

function App() {
  return (
    <>
      <WorldCanvas quality={QUALITY} measure={DEBUG} style={{ position: 'absolute', inset: 0 }}>
        <Scene />
      </WorldCanvas>
      <div id="labels" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
