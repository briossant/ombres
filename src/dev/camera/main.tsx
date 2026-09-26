// Page de dev de la mise en scène : dev/camera.html
// Vraie simulation + vrais bots + <GameCamera/>, <HudProjector/>, <PodiumStage/>, oiseaux, FX,
// et (option) la vraie UI par-dessus pour juger la composition.
//   ?mode=title|lobby|rules|round|roundResults|podium|credits|loading   (défaut round)
//   ?t=<s>        instant de soleil de départ (manche) ; roundResults part de T − 3 s
//   ?n=6 ?map=parasols|aiguilles|geantes|cadran ?seed=7 ?speed=1 ?q=low|medium|high
//   ?auto=1       nuit → résultats automatiques (défaut en roundResults) ; ?chain=1 → puis podium
//   ?ui=1         UI réelle par-dessus (HUD, titre, salon, résultats, podium, crédits)
//   ?anchors=1    points des ancres hudAnchors (vérification de la projection)
//   ?shake=0      réglage « tremblement » coupé ;  ?debug  texte d'état
// window.__ready quand la scène tourne ; window.__cam : runner, cue, état, speed(v), jump(t), fireDive().
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { useSettings } from '../../host/settings.ts'
import { WorldCanvas } from '../../host/render/WorldCanvas.tsx'
import type { QualityLevel } from '../../host/render/quality.ts'
import { Birds } from '../../host/render/bird/Birds.tsx'
import { Fx } from '../../host/render/fx/Fx.tsx'
import type { FxSystem } from '../../host/render/fx/system.ts'
import { gameView } from '../../host/view.ts'
import { GameCamera } from '../../host/camera/GameCamera.tsx'
import { HudProjector } from '../../host/camera/HudProjector.tsx'
import { PodiumStage, stageModes } from '../../host/camera/PodiumStage.tsx'
import { cameraBeats, cameraCue, cameraState, cueCamera, type CameraMode } from '../../host/camera/cue.ts'
import type { CameraDirector } from '../../host/camera/director.ts'
import { UiRoot } from '../../host/ui/UiRoot.tsx'
import { preloadUiFonts } from '../../host/ui/fonts.ts'
import { connectHudEvents, hudAnchors, hudFromSim, resetHud, useMatchResults, useUi, type ScreenId } from '../../host/ui/viewModel.ts'
import { fillLobby, fillMatchResults, fillRoster, fillRoundResults, fillRulesCards } from '../ui/fixtures.ts'
import { RULES } from '../../sim/rules.ts'
import type { MapId } from '../../sim/types.ts'
import { DevRunner } from './runner.ts'

declare global {
  interface Window {
    __ready?: boolean
    __cam?: Record<string, unknown>
  }
}

const Q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (Q.has(k) ? Number(Q.get(k)) : d)
const MODE = (Q.get('mode') ?? 'round') as CameraMode
const N = Math.max(1, Math.min(12, num('n', 6)))
const UI = Q.get('ui') === '1'
const ANCHORS = Q.get('anchors') === '1'
const DEBUG = Q.has('debug')
const QUALITY = (Q.get('q') ?? undefined) as QualityLevel | undefined
if (Q.get('shake') === '0') useSettings.getState().set('screenShake', false)
if (Q.has('lang')) useSettings.getState().set('lang', Q.get('lang') === 'en' ? 'en' : 'fr')

const runner = new DevRunner({
  n: N,
  mapId: (Q.get('map') ?? 'parasols') as MapId,
  seed: num('seed', 7),
  auto: Q.has('auto') ? Q.get('auto') === '1' : MODE === 'roundResults' || Q.get('chain') === '1',
  chain: Q.get('chain') === '1',
})
runner.speed = num('speed', 1)

const SCREEN_OF: Record<CameraMode, ScreenId> = {
  loading: 'loading',
  title: 'title',
  lobby: 'lobby',
  rules: 'rules',
  round: 'game',
  roundResults: 'game',
  podium: 'matchResults',
  credits: 'credits',
}

/** Remplit les stores de l'UI comme le ferait le runner (données factices pour les panneaux). */
function uiFor(mode: CameraMode): void {
  if (!UI) return
  if (mode === 'lobby') fillLobby(Math.min(8, N), 'http://192.168.1.16:8812/play?r=KX4P')
  else if (mode === 'rules') {
    fillRoster(N)
    fillRulesCards(N)
  } else if (mode === 'round') {
    fillRoster(N)
    resetHud(1, 3, false)
  } else if (mode === 'podium') {
    fillMatchResults(N)
  } else fillRoster(N)
  if (mode === 'title') useUi.setState({ titleMenuOpen: true })
  useUi.setState({ screen: SCREEN_OF[mode], overlay: null })
}

runner.onModeChange = (mode) => uiFor(mode)
if (UI) {
  connectHudEvents()
  cameraBeats.on((b) => {
    if (b.type === 'mapReady') {
      fillRoundResults(N)
      useUi.setState({ screen: 'roundResults' })
    }
  })
}

let startT = num('t', 0)
if (MODE === 'roundResults' && !Q.has('t')) startT = RULES.roundSunSeconds - 3
if (MODE === 'podium') startT = RULES.roundSunSeconds + RULES.nightHoldSeconds + 0.2
runner.start(MODE, startT)
if (MODE === 'podium' && UI) {
  // plaques de l'UI : le classement des fixtures pilote les oiseaux perchés
  fillMatchResults(N)
  const rows = useMatchResults.getState().rows
  cueCamera('podium', { podium: rows.slice(0, 3).map((r) => r.slot), winnerSlot: rows[0]?.slot ?? -1 })
}
uiFor(cameraCue.mode)

function Driver() {
  const frames = useRef(0)
  useFrame((_, delta) => {
    // la sim attend que la page soit prête (le compte à rebours se capture en entier)
    runner.update(frames.current < 30 ? 0 : Math.min(delta, 0.1))
    if (UI && runner.sim && cameraCue.mode === 'round') hudFromSim(runner.sim.state)
    frames.current++
    if (frames.current === 30) requestAnimationFrame(() => (window.__ready = true))
  }, -10)
  return null
}

function AnchorDots() {
  const els = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      for (let i = 0; i < 12; i++) {
        const el = els.current[i]
        const a = hudAnchors.birds[i]!
        if (!el) continue
        el.style.display = a.active ? 'block' : 'none'
        el.style.transform = `translate(${a.x - 5}px, ${a.y - 5}px)`
        el.style.background = a.behind ? '#c00' : a.hidden ? '#888' : '#2b1d23'
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="dot" ref={(el) => void (els.current[i] = el)}>
          <span>{i}</span>
        </div>
      ))}
    </>
  )
}

function DebugText() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = setInterval(() => {
      const s = gameView.sim
      const f = cameraState.frame
      if (ref.current)
        ref.current.textContent = `${cameraState.mode} · ${cameraState.shot} · t ${s ? s.sun.t.toFixed(1) : '-'} s · ${s?.sun.phase ?? ''} · cadre ${(f.halfWidth * 2).toFixed(0)}×${(f.halfHeight * 2).toFixed(0)} m · rise ${cameraState.rise.toFixed(2)} · ts ${gameView.timeScale.toFixed(2)}`
    }, 200)
    return () => clearInterval(id)
  }, [])
  return <div id="dbg" ref={ref} />
}

function App() {
  const directorRef = useRef<CameraDirector | null>(null)
  useMemo(() => {
    window.__cam = {
      runner,
      cue: cueCamera,
      cameraCue,
      state: cameraState,
      gameView,
      speed: (v: number) => (runner.speed = v),
      jump: (t: number) => runner.jump(t),
      fireDive: () => runner.fireDive(),
      start: (m: CameraMode, t = 0) => runner.start(m, t),
      director: () => directorRef.current,
      anchors: () => hudAnchors.birds,
    }
  }, [])
  return (
    <>
      <WorldCanvas quality={QUALITY} style={{ position: 'absolute', inset: 0 }}>
        <Driver />
        <PodiumStage />
        <GameCamera onDirector={(d) => (directorRef.current = d)} />
        <HudProjector audio={false} />
        <Birds quality={QUALITY ?? 'high'} modes={stageModes} />
        <GloryFx />
      </WorldCanvas>
      {UI && <UiRoot />}
      {ANCHORS && <AnchorDots />}
      {DEBUG && <DebugText />}
    </>
  )
}

/** FX ; la gloire du vainqueur suit le mode (podium) sans re-rendu React. */
function GloryFx() {
  const sys = useRef<FxSystem | null>(null)
  useFrame(() => sys.current?.setGlory(cameraCue.mode === 'podium' ? cameraCue.winnerSlot : -1), 0.5)
  return <Fx quality={QUALITY ?? 'high'} onSystem={(s) => (sys.current = s)} />
}

void preloadUiFonts()
const container = document.getElementById('root')! as HTMLElement & { __root?: ReturnType<typeof createRoot> }
container.__root ??= createRoot(container)
container.__root.render(<App />)
