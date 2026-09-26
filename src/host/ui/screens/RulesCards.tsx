// Les 3 cartes des règles (GDD §2, §15.3) : interstitiel de RULES.rulesCardsSeconds
// avant la première manche de la session, passable (Entrée, ou quand tous les
// téléphones ont tapé OK — décision du runner).
import { useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { RULES } from '../../../sim/rules.ts'
import { Btn, Case, Key, SandTimer } from '../components.tsx'
import { sentenceLines } from '../format.ts'
import { useNavScope } from '../nav.ts'
import { RuleArt } from '../RuleArt.tsx'
import { uiActions, useRulesCards } from '../viewModel.ts'
import './rules.css'

export function RulesCards() {
  const ref = useRef<HTMLDivElement>(null)
  const deadline = useRulesCards(s => s.deadline)
  const ok = useRulesCards(s => s.okCount)
  const humans = useRulesCards(s => s.humanCount)
  useNavScope(ref, { onBack: () => uiActions.skipRules(), onStart: () => uiActions.skipRules() })
  return (
    <div className="screen rules" ref={ref}>
      <div className="veil" />
      <h1 className="rules__title t-title enter">{t('host.rules.title')}</h1>
      <div className="rules__cards">
        {([1, 2, 3] as const).map(k => (
          <Case key={k} className="rules__card" variant="title" i={k * 2}>
            <span className="rules__num t-num">{k}</span>
            <div className="rules__art">
              <RuleArt card={k} />
            </div>
            <p className="rules__text">
              {sentenceLines(t(`host.rules.${k}`)).map((line, j) => (
                <span key={j}>{line}</span>
              ))}
            </p>
          </Case>
        ))}
      </div>
      <div className="rules__foot enter" style={{ ['--i' as string]: 8 }}>
        <div className="rules__timer">
          <SandTimer deadline={deadline} total={RULES.rulesCardsSeconds} />
          {humans > 0 ? <span className="rules__ok">{t('host.rules.phonesOk', { n: ok, total: humans })}</span> : null}
        </div>
        <Btn icon="arrowRight" isDefault onClick={() => uiActions.skipRules()} hint={<Key>{t('host.key.enter')}</Key>}>
          {t('host.rules.skip')}
        </Btn>
      </div>
    </div>
  )
}
