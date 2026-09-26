// Crédits défilants (depuis docs/CREDITS-sources.md) + remerciements.
// ↑/↓ ou molette : faire défiler à la main ; Échap : retour.
import { useEffect, useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Btn, HandFrame, Key } from '../components.tsx'
import { CREDIT_GROUPS, localizeCreditLine, TECH_CREDITS } from '../credits.ts'
import { Logo } from '../Logo.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions } from '../viewModel.ts'
import './credits.css'

const SPEED = 38 // px de conception par seconde
const HOLD_END_MS = 4000

export function Credits() {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const rollRef = useRef<HTMLDivElement>(null)
  useNavScope(ref, { onBack: () => uiActions.back(), arrows: false })

  useEffect(() => {
    const view = viewRef.current
    const roll = rollRef.current
    if (!view || !roll) return
    let offset = -view.clientHeight * 0.35
    let manualUntil = 0
    let endAt = 0
    let last = performance.now()
    let raf = 0
    const max = () => Math.max(0, roll.offsetHeight - view.clientHeight * 0.55)
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (now > manualUntil) offset += SPEED * dt
      if (offset >= max()) {
        offset = max()
        if (!endAt) endAt = now
        else if (now - endAt > HOLD_END_MS) {
          offset = -view.clientHeight * 0.35
          endAt = 0
        }
      }
      roll.style.transform = `translateY(${(-offset).toFixed(1)}px)`
    }
    const nudge = (d: number) => {
      offset = Math.min(max(), Math.max(-view.clientHeight * 0.35, offset + d))
      manualUntil = performance.now() + 2500
      endAt = 0
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') nudge(120)
      else if (e.code === 'ArrowUp') nudge(-120)
    }
    const onWheel = (e: WheelEvent) => nudge(e.deltaY)
    raf = requestAnimationFrame(loop)
    window.addEventListener('keydown', onKey)
    view.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      view.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div className="screen credits" ref={ref}>
      <div className="credits__back enter">
        <Btn icon="back" isDefault onClick={() => uiActions.back()} hint={<Key>{t('host.key.esc')}</Key>}>
          {t('host.back')}
        </Btn>
      </div>
      <HandFrame className="credits__panel enter" seed={31}>
        <div className="credits__view" ref={viewRef}>
          <div className="credits__roll" ref={rollRef}>
            <div className="credits__logo">
              <Logo />
            </div>
            <p className="credits__made t-title">{t('host.credits.made')}</p>
            <p className="credits__made-sub">{t('host.credits.madeSub')}</p>

            {CREDIT_GROUPS.map(g => (
              <section key={g.kind} className="credits__sec">
                <h3 className="credits__h t-title">{t(`host.credits.${g.kind}`)}</h3>
                {g.lines.map(l0 => localizeCreditLine(l0)).map((l, k) => (
                  <p key={k} className="credits__line">
                    <span className="credits__main">{l.main}</span>
                    {l.sub ? <span className="credits__sub">{l.sub}</span> : null}
                  </p>
                ))}
              </section>
            ))}

            <section className="credits__sec">
              <h3 className="credits__h t-title">{t('host.credits.tech')}</h3>
              {TECH_CREDITS.map(x => (
                <p key={x} className="credits__line">
                  <span className="credits__main">{x}</span>
                </p>
              ))}
            </section>

            <section className="credits__sec">
              <h3 className="credits__h t-title">{t('host.credits.thanks')}</h3>
              <p className="credits__line credits__line--prose">{t('host.credits.thanks.moebius')}</p>
              <p className="credits__line credits__line--prose">{t('host.credits.thanks.libre')}</p>
              <p className="credits__line credits__line--prose">{t('host.credits.thanks.you')}</p>
            </section>

            <p className="credits__end t-title">{t('host.credits.end')}</p>
          </div>
        </div>
      </HandFrame>
    </div>
  )
}
