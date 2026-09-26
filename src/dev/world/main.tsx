// Page de lookdev du monde : dev/world.html
//
// Paramètres d'URL :
//   ?sun=<élévation°>   élévation de gameplay (la sim avance jusqu'à l'instant correspondant)
//   ?kf=<paletteElev>   horloge de palette (KF80, KF50, KF25, KF16, KF10, KF3 = 3.5, KF1 = 1)
//   ?t=<s>              instant de soleil (s) ; défaut 40
//   ?night=<0..1>       avancée de la Grande Ombre (t = 98 + 12 × night, à l'échelle de T)
//   ?results=<0..1>     fin de manche + fondu des résultats KF-4 → KF-15 (caméra conseillée : top)
//   ?map=parasols|aiguilles|geantes|cadran|lobby   ?np=<oiseaux 1..12>   ?seed=<n>
//   ?cam=game|low|lowe|top|orbit|close             ?pitch=<°>  ?dist=<m>
//   ?cb=1               mode daltonien             ?q=low|medium|high
//   ?live=1             la sim continue en temps réel (sinon image figée)
//   ?nobirds=1          sans marqueurs d'oiseaux   ?ink=<0..4> debug de l'encre
//   ?illum=<délai s>    illumination des résultats (vague + ré-impression du gagnant, slot 0)
//   ?splash=1           tache de piqué factice toutes les 2 s sous l'oiseau du slot 0
//   ?pal=<paletteElev>  palette imposée (worldView.paletteElevOverride : titre 16, lobby 50)
//   ?debug              mesures GPU par passe (window.__timings) + HUD
// window.__ready = true quand la frame est prête (tools/shot.mjs --ready).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { gameElevForPalette } from '../../host/render/npr/palette.ts'
import { useRenderQuality, type QualityLevel } from '../../host/render/quality.ts'
import { WorldCanvas } from '../../host/render/WorldCanvas.tsx'
import { illuminateTerritory, worldView } from '../../host/render/worldView.ts'
import { simEvents } from '../../host/bus.ts'
import { gameView } from '../../host/view.ts'
import { RULES } from '../../sim/rules.ts'
import type { MapId } from '../../sim/types.ts'
import { BirdMarkers } from './BirdMarkers.tsx'
import { DevSim } from './devSim.ts'
import { LookdevCamera, type CamMode } from './LookdevCamera.tsx'

declare global {
  interface Window {
    __ready?: boolean
    __devSim?: DevSim
    __scene?: unknown
    __gl?: unknown
    __setQuality?: (level: QualityLevel) => void
  }
}

const Q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (Q.has(k) ? Number(Q.get(k)) : d)
const T = RULES.roundSunSeconds

/** Instant de soleil pour une élévation de gameplay e (inverse de e(u), GDD §7). */
function tForElev(e: number): number {
  const k = Math.max(0, (e - RULES.sunElevEndDeg) / (RULES.sunElevStartDeg - RULES.sunElevEndDeg))
  return (1 - Math.pow(k, 1 / RULES.sunElevGamma)) * T
}

function requestedT(): number {
  if (Q.has('results')) return T + RULES.nightHoldSeconds + 0.5
  if (Q.has('night')) return RULES.greatShadowAt + (T - RULES.greatShadowAt) * Math.min(1, Math.max(0, num('night', 0)))
  if (Q.has('kf')) return tForElev(gameElevForPalette(num('kf', 50)))
  if (Q.has('sun')) return tForElev(num('sun', 60))
  return num('t', 40)
}

const debug = Q.has('debug')
// ?q=… impose le preset ; sans ?q, le store useRenderQuality décide (bascule à chaud testable
// via window.__setQuality('low'|'medium'|'high'))
const quality = (Q.get('q') ?? undefined) as QualityLevel | undefined
const cam = (Q.get('cam') ?? 'game') as CamMode

function SimClock({ dev }: { dev: DevSim }) {
  const [frames, setFrames] = useState(0)
  useFrame((_, dt) => {
    dev.update(Math.min(dt, 0.1))
    if (frames < 40) setFrames((f) => f + 1)
    else if (!window.__ready) window.__ready = true
  })
  return null
}

/** Expose la scène pour les sondes Playwright (tools/, page de dev seulement). */
function ExposeScene() {
  const scene = useThree((st) => st.scene)
  const gl = useThree((st) => st.gl)
  useEffect(() => {
    window.__scene = scene
    window.__gl = gl
  }, [scene, gl])
  return null
}

function Hud() {
  const [text, setText] = useState('')
  useEffect(() => {
    const id = setInterval(() => {
      const s = gameView.sim
      setText(s ? `t ${s.sun.t.toFixed(1)} s · e ${((s.sun.elevation * 180) / Math.PI).toFixed(1)}° · palette ${s.sun.paletteElevDeg.toFixed(1)} · ${s.sun.phase}` : '')
    }, 500)
    return () => clearInterval(id)
  }, [])
  return <div id="hud">{text}</div>
}

function App() {
  const dev = useMemo(() => {
    const d = new DevSim({
      mapId: (Q.get('map') ?? 'parasols') as MapId,
      birds: Math.max(1, Math.min(12, num('np', 6))),
      seed: num('seed', 7),
      t: requestedT(),
      sunSeconds: T,
    })
    d.frozen = !Q.has('live')
    window.__devSim = d
    return d
  }, [])
  useMemo(() => {
    gameView.colorblind = Q.get('cb') === '1'
    if (Q.has('pal')) worldView.paletteElevOverride = num('pal', 16)
    if (Q.has('results')) {
      worldView.resultsFade = Math.min(1, Math.max(0, num('results', 1)))
    }
    // ?illum=<délai s> : la vague part `délai` secondes après le chargement (gagnant : slot 0)
    if (Q.has('illum')) illuminateTerritory(0, num('illum', 0))
  }, [])
  useEffect(() => {
    if (!Q.has('splash')) return
    const fire = () => {
      const b = gameView.sim?.bySlot[0]
      if (b) simEvents.emit({ type: 'diveHit', hunter: 0, target: 1, x: b.shadow.cx, y: b.shadow.cy, z: 0, stolenCells: 0, crown: false })
    }
    fire()
    const id = setInterval(fire, 2000)
    return () => clearInterval(id)
  }, [])
  return (
    <>
      <WorldCanvas quality={quality} measure={debug} inkDebug={num('ink', 0)} style={{ position: 'absolute', inset: 0 }}>
        <SimClock dev={dev} />
        <ExposeScene />
        <LookdevCamera
          mode={cam}
          pitchDeg={Q.has('pitch') ? num('pitch', 50) : undefined}
          dist={Q.has('dist') ? num('dist', 280) : undefined}
        />
        {!Q.has('nobirds') && <BirdMarkers />}
      </WorldCanvas>
      {debug && <Hud />}
    </>
  )
}

window.__setQuality = (level) => useRenderQuality.getState().setLevel(level)

// HMR : la page peut être réévaluée ; on réutilise la racine React existante
const container = document.getElementById('root')! as HTMLElement & { __root?: ReturnType<typeof createRoot> }
container.__root ??= createRoot(container)
container.__root.render(<App />)
