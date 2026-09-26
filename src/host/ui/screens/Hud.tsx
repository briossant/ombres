// HUD de manche (GDD §13.3, ART_BIBLE §8.5). Aucun élément de debug.
// Échap / Start : pause. Tout le reste est piloté par le store useHud.
import { useRef } from 'react'
import { RULES } from '../../../sim/rules.ts'
import { Banner, Countdown, LastSeconds, Subtitle } from '../hud/Announce.tsx'
import { SandBar } from '../hud/SandBar.tsx'
import { SunDial } from '../hud/SunDial.tsx'
import { WorldLayer } from '../hud/WorldLayer.tsx'
import { useNavScope } from '../nav.ts'
import { currentScale } from '../scale.ts'
import { uiActions, useUi } from '../viewModel.ts'
import './hud.css'

export function Hud() {
  const ref = useRef<HTMLDivElement>(null)
  useNavScope(ref, {
    onBack: () => (useUi.getState().paused ? uiActions.resume() : uiActions.pause()),
    onStart: () => (useUi.getState().paused ? uiActions.resume() : uiActions.pause()),
    arrows: false,
    autoFocus: false,
  })
  const barWidth = Math.round(currentScale.width * RULES.hudBarWidthFrac)
  return (
    <div className="screen hud" ref={ref}>
      <WorldLayer />
      <div className="hud__dial enter">
        <SunDial />
      </div>
      <div className="hud__bar enter" style={{ ['--i' as string]: 1 }}>
        <SandBar width={barWidth} />
      </div>
      <Banner layout="strip" />
      <div className="hud__center">
        <LastSeconds />
        <Banner />
      </div>
      <Countdown />
      <Subtitle />
    </div>
  )
}
