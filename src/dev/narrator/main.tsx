// Page de contrôle du narrateur : toutes les répliques (texte FR/EN, clip, durée, vérification
// ASR), une manche synthétique jouée par le vrai directeur (frise + sous-titres), et les
// indications contextuelles. http://localhost:<port>/dev/narrator.html
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RULES } from '../../sim/rules.ts'
import { setLang } from '../../shared/i18n.ts'
import { PLAYER_COLORS, colorName } from '../../shared/players.ts'
import type { Lang } from '../../shared/protocol.ts'
import { KIND_SPECS, LINES_BY_KIND, lineHasColor, type NarratorKind } from '../../director/lines.ts'
import { HINT_DEFS, HINT_IDS, type HintId } from '../../director/hints.ts'
import { indexNarratorManifest, type NarratorClipIndex, type NarratorManifest } from '../../director/manifest.ts'
import { hintTextParts, narratorClipId, narratorTextParts, type TextPart } from '../../director/text.ts'
import type { NarratorCue } from '../../director/narrator.ts'
import { simulateRound, type SimulatedRound } from './simulate.ts'
import './narrator.css'

const BASE = '/audio/narrator'

interface QaLine {
  id: string
  lang: Lang
  file: string
  duration_s: number
  utmos?: number | null
  asr_ok?: boolean
  asr_text?: string
  asr_cer?: number
  /** Durée parlée (s), première à dernière syllabe. */
  speech_s?: number
}

/** Règle GDD §16.1 : moins de 3 s à l'oral (durée parlée ; à défaut, durée du fichier moins les silences). */
const tooLong = (q: QaLine) => (q.speech_s ?? q.duration_s - 0.3) > 3.0

declare global {
  interface Window {
    __ready?: boolean
  }
}

const KIND_LABEL: Record<NarratorKind, string> = {
  matchOpen: 'Ouverture de partie',
  roundOpen: 'Ouverture de manche',
  lastRound: 'Dernière manche',
  firstHit: 'Premier piqué',
  hit: 'Piqué réussi',
  doubleHit: 'Doublé',
  huntStreak: 'Série de chasse',
  dodge: 'Esquive',
  miss: 'Piqué raté',
  firstCrown: 'Première couronne',
  leaderChange: 'Changement de meneur',
  crownDown: 'Couronne abattue',
  bigSteal: 'Gros vol',
  trailSteal: 'Traînée volée',
  hugeSweep: 'Balayage géant',
  runaway: 'Écart énorme',
  hiddenLong: 'Caché longtemps',
  storm: 'Tempête',
  idle: 'Immobile',
  golden: 'Heure dorée',
  sunset: 'Couchant',
  greatShadow: 'Grande Ombre',
  tenSeconds: 'Dix secondes',
  photoFinish: 'Photo-finish',
  tie: 'Égalité',
  landslide: 'Victoire écrasante',
  closeFinish: 'Arrivée serrée',
  lastRay: 'Dernier rayon',
  comeback: 'Remontée',
  mirage: 'Mirage',
  roundWin: 'Victoire de manche',
  matchWin: 'Vainqueur de la partie',
  matchTie: 'Co-victoire',
  rematch: 'Revanche',
}

function Parts({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.colorIndex === undefined ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} className="name" style={{ color: PLAYER_COLORS[p.colorIndex].text }}>
            <i className="dot" style={{ background: PLAYER_COLORS[p.colorIndex].hex }} />
            {p.text}
          </span>
        ),
      )}
    </>
  )
}

let current: HTMLAudioElement | null = null
function play(path: string): Promise<void> {
  current?.pause()
  const a = new Audio(path)
  current = a
  return new Promise(resolve => {
    a.onended = () => resolve()
    a.onerror = () => resolve()
    a.play().catch(() => resolve())
  })
}

function useManifest(): { index: NarratorClipIndex | null; qa: Map<string, QaLine>; total: number; bytes: number | null } {
  const [state, setState] = useState<{ index: NarratorClipIndex | null; qa: Map<string, QaLine>; total: number; bytes: number | null }>({
    index: null,
    qa: new Map(),
    total: 0,
    bytes: null,
  })
  useEffect(() => {
    // Manifest complet (notes de prise, ASR) servi par Vite en dev ; sinon le manifest réduit du jeu.
    const get = (url: string) =>
      fetch(url, { cache: 'no-store' }).then(r =>
        r.ok ? (r.json() as Promise<NarratorManifest & { lines: QaLine[] }>) : Promise.reject(new Error(`${r.status} ${url}`)),
      )
    get('/tools/tts/narrator.manifest.json')
      .catch(() => get(`${BASE}/manifest.json`))
      .then(m => {
        const qa = new Map(m.lines.map(l => [`${l.lang}/${l.id}`, l]))
        setState({ index: indexNarratorManifest(m), qa, total: m.total_duration_s, bytes: null })
      })
      .catch(() => setState(s => ({ ...s, index: indexNarratorManifest({ generator: '', format: { codec: '', sample_rate: 0, channels: 1 }, total_duration_s: 0, lines: [] }) })))
      .finally(() => {
        window.__ready = true
      })
  }, [])
  return state
}

function Status({ q }: { q: QaLine | undefined }) {
  if (!q) return <span className="badge missing">manquant</span>
  if (q.asr_ok === false) return <span className="badge warn" title={q.asr_text}>ASR ⚠</span>
  return (
    <span className={`badge ${tooLong(q) ? 'warn' : 'ok'}`} title={`fichier ${q.duration_s.toFixed(2)} s`}>
      {(q.speech_s ?? q.duration_s).toFixed(2)} s
    </span>
  )
}

/** Écoute d'un modèle dans les 12 couleurs, à la suite (contrôle des noms). */
async function playAllColors(lineId: string, lang: Lang, qa: Map<string, QaLine>) {
  for (const c of PLAYER_COLORS) {
    const q = qa.get(`${lang}/${narratorClipId(lineId, c.index)}`)
    if (q) await play(`${BASE}/${q.file}`)
    await new Promise(r => setTimeout(r, 250))
  }
}

function LinesPanel({ lang, color, qa, onlyProblems }: { lang: Lang; color: number; qa: Map<string, QaLine>; onlyProblems: boolean }) {
  const kinds = Object.keys(KIND_SPECS) as NarratorKind[]
  return (
    <div className="lines">
      {kinds.map(kind => {
        const spec = KIND_SPECS[kind]
        const rows = LINES_BY_KIND[kind]
          .map(line => {
            const ci = lineHasColor(line) ? color : undefined
            const id = narratorClipId(line.id, ci)
            return { line, ci, q: qa.get(`${lang}/${id}`) }
          })
          .filter(r => !onlyProblems || !r.q || r.q.asr_ok === false || tooLong(r.q))
        if (!rows.length) return null
        return (
          <section key={kind} className="kind">
            <h3>
              {KIND_LABEL[kind]}
              <span className="meta">
                P{spec.priority}
                {spec.capPerRound !== undefined ? ` · ${spec.capPerRound}/manche` : ''}
                {spec.capPerMatch !== undefined ? ` · ${spec.capPerMatch}/partie` : ''}
                {spec.groupGap !== undefined ? ` · ${spec.groupGap} s` : ''}
              </span>
            </h3>
            {rows.map(({ line, ci, q }) => (
              <div key={line.id} className="row">
                <button className="play" disabled={!q} onClick={() => q && play(`${BASE}/${q.file}`)} aria-label="écouter">
                  ▶
                </button>
                <div className="txt">
                  <Parts parts={narratorTextParts({ key: `narrator.${line.id}`, colorIndex: ci }, lang)} />
                  {q?.asr_text ? <div className="asr">« {q.asr_text} »{q.utmos ? ` · MOS ${q.utmos}` : ''}</div> : null}
                </div>
                <code className="id">
                  {line.id}
                  {ci !== undefined ? (
                    <button className="all" title="écouter les 12 couleurs" onClick={() => void playAllColors(line.id, lang, qa)}>
                      ×12
                    </button>
                  ) : null}
                </code>
                <Status q={q} />
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function Recitatif({ cue, lang }: { cue: NarratorCue | null; lang: Lang }) {
  if (!cue) return <div className="recitatif empty">—</div>
  return (
    <div className="recitatif" key={`${cue.lineId}.${cue.colorIndex}`}>
      <Parts parts={narratorTextParts(cue, lang)} />
    </div>
  )
}

function Timeline({ sim, lang, onPick, picked }: { sim: SimulatedRound; lang: Lang; onPick: (i: number) => void; picked: number }) {
  const T = RULES.roundSunSeconds
  const x = (t: number) => `${((t + RULES.countdownSeconds) / (T + RULES.countdownSeconds + 6)) * 100}%`
  const marks = [
    { t: 0, l: 'midi' },
    { t: RULES.phaseAfternoonAt, l: 'après-midi' },
    { t: RULES.phaseGoldenAt, l: 'heure dorée' },
    { t: RULES.phaseSunsetAt, l: 'couchant' },
    { t: RULES.greatShadowAt, l: 'Grande Ombre' },
    { t: T, l: 'nuit' },
  ]
  return (
    <div className="timeline">
      <div className="band">
        <div className="quiet" style={{ left: x(RULES.narratorQuietFrom), width: `calc(${x(T + RULES.nightHoldSeconds)} - ${x(RULES.narratorQuietFrom)})` }} />
        {marks.map(m => (
          <div key={m.l} className="mark" style={{ left: x(m.t) }}>
            <span>{m.l}</span>
          </div>
        ))}
        {sim.events.map((e, i) => (
          <div key={i} className="ev" style={{ left: x(e.t) }} title={`${e.t.toFixed(1)} s · ${e.label}`} />
        ))}
        {sim.cues.map((c, i) => (
          <button
            key={i}
            className={`cue p${Math.min(5, c.cue.priority)} ${picked === i ? 'on' : ''}`}
            style={{ left: x(c.t), width: `calc(${x(c.t + c.cue.duration)} - ${x(c.t)})` }}
            onClick={() => onPick(i)}
            title={`${c.t.toFixed(1)} s`}
          />
        ))}
      </div>
      <ol className="cuelist">
        {sim.cues.map((c, i) => (
          <li key={i} className={picked === i ? 'on' : ''} onClick={() => onPick(i)}>
            <span className="t">{c.t < 0 ? 'avant' : `${c.t.toFixed(1)} s`}</span>
            <span className={`prio p${Math.min(5, c.cue.priority)}`}>P{c.cue.priority}</span>
            <span className="k">{KIND_LABEL[c.cue.kind]}</span>
            <span className="s">
              <Parts parts={narratorTextParts(c.cue, lang)} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SimPanel({ lang, index }: { lang: Lang; index: NarratorClipIndex | null }) {
  const [seed, setSeed] = useState(3)
  const [birds, setBirds] = useState(6)
  const [humans, setHumans] = useState(2)
  const [round, setRound] = useState(1)
  const [picked, setPicked] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const stop = useRef(false)
  const sim = useMemo(() => {
    // Les manches précédentes de la partie passent par le même directeur (variantes déjà dites).
    let director
    let last: SimulatedRound | null = null
    for (let r = 1; r <= round; r++) {
      const res = simulateRound({
        seed,
        birds,
        humans,
        round: r,
        rounds: 3,
        director,
        offset: (r - 1) * 200,
        durationOf: (id, ci) => index?.duration(lang, id, ci),
      })
      director = res.director
      last = res.round
    }
    return last!
  }, [seed, birds, humans, round, index, lang])
  const cue = picked >= 0 ? sim.cues[picked]?.cue ?? null : null

  const listen = async () => {
    stop.current = false
    setPlaying(true)
    for (let i = 0; i < sim.cues.length && !stop.current; i++) {
      setPicked(i)
      const c = sim.cues[i].cue
      const f = index?.file(lang, c.lineId, c.colorIndex)
      if (f) await play(`${BASE}/${f}`)
      else await new Promise(r => setTimeout(r, c.duration * 1000))
      await new Promise(r => setTimeout(r, 700))
    }
    setPlaying(false)
  }

  return (
    <section className="case sim">
      <header>
        <h2>Manche synthétique</h2>
        <label>
          graine <input type="number" value={seed} min={1} onChange={e => setSeed(+e.target.value || 1)} />
        </label>
        <label>
          oiseaux <input type="number" value={birds} min={2} max={12} onChange={e => setBirds(Math.max(2, Math.min(12, +e.target.value)))} />
        </label>
        <label>
          humains <input type="number" value={humans} min={0} max={birds} onChange={e => setHumans(Math.max(0, Math.min(birds, +e.target.value)))} />
        </label>
        <label>
          manche{' '}
          <select value={round} onChange={e => setRound(+e.target.value)}>
            <option value={1}>1 / 3</option>
            <option value={2}>2 / 3</option>
            <option value={3}>3 / 3 (double)</option>
          </select>
        </label>
        <button onClick={() => (playing ? (stop.current = true) : void listen())}>{playing ? '■ arrêter' : '▶ écouter la manche'}</button>
      </header>
      <p className="legend">
        {sim.cues.length} répliques · en manche (hors ouverture/résultats) :{' '}
        {sim.cues.filter(c => ['round', 'clock'].includes(KIND_SPECS[c.cue.kind].scope)).length} / {RULES.narratorMaxPerRound} · zone hachurée : silence
        (≥ {RULES.narratorQuietFrom} s)
      </p>
      <Timeline sim={sim} lang={lang} onPick={setPicked} picked={picked} />
      <div className="stage">
        <Recitatif cue={cue} lang={lang} />
      </div>
    </section>
  )
}

function HintsPanel({ lang }: { lang: Lang }) {
  const bubble = (id: HintId, i: number) => {
    const color = i % 12
    const def = HINT_DEFS[id]
    const parts = hintTextParts({ key: `hints.${id}`, colorIndex: id === 'firstLock' ? (color + 4) % 12 : undefined }, lang)
    return (
      <div key={id} className={`hint hint--${def.display}`}>
        <div className="bubble" style={{ ['--pc' as string]: PLAYER_COLORS[color].hex }}>
          <Parts parts={parts} />
          {def.effect ? <span className="fx">{def.effect}</span> : null}
        </div>
        <code>
          {id} · {def.audience === 'all' ? 'tous' : colorName(color, lang)}
        </code>
      </div>
    )
  }
  return (
    <section className="case hints">
      <h2>Indications contextuelles</h2>
      <div className="hintgrid">{HINT_IDS.map(bubble)}</div>
    </section>
  )
}

function App() {
  const [lang, setL] = useState<Lang>(() => (new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fr'))
  const [color, setColor] = useState(() => +(new URLSearchParams(location.search).get('color') ?? 0) % 12)
  const [onlyProblems, setOnlyProblems] = useState(new URLSearchParams(location.search).has('problems'))
  const { index, qa, total } = useManifest()
  useEffect(() => setLang(lang), [lang])

  const stats = useMemo(() => {
    let expected = 0
    let present = 0
    let asrBad = 0
    let long = 0
    let maxDur = 0
    for (const l of (Object.values(LINES_BY_KIND) as (typeof LINES_BY_KIND)[NarratorKind][]).flat()) {
      for (const lg of ['fr', 'en'] as Lang[]) {
        const ids = lineHasColor(l) ? PLAYER_COLORS.map(c => narratorClipId(l.id, c.index)) : [l.id]
        for (const id of ids) {
          expected++
          const q = qa.get(`${lg}/${id}`)
          if (!q) continue
          present++
          if (q.asr_ok === false) asrBad++
          if (tooLong(q)) long++
          maxDur = Math.max(maxDur, q.speech_s ?? q.duration_s)
        }
      }
    }
    return { expected, present, asrBad, long, maxDur }
  }, [qa])

  return (
    <main>
      <header className="case top">
        <h1>Narrateur</h1>
        <div className="toggles">
          {(['fr', 'en'] as Lang[]).map(l => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setL(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="swatches">
          {PLAYER_COLORS.map(c => (
            <button
              key={c.index}
              className={color === c.index ? 'on' : ''}
              style={{ background: c.hex }}
              title={c.name[lang]}
              onClick={() => setColor(c.index)}
            />
          ))}
          <span className="cname" style={{ color: PLAYER_COLORS[color].text }}>
            {colorName(color, lang)}
          </span>
        </div>
        <label className="chk">
          <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> problèmes seulement
        </label>
        <div className="stats">
          <b>
            {stats.present}/{stats.expected}
          </b>{' '}
          clips · {total.toFixed(0)} s · ASR ⚠ <b className={stats.asrBad ? 'bad' : ''}>{stats.asrBad}</b> · parlé &gt; 3 s{' '}
          <b className={stats.long ? 'bad' : ''}>{stats.long}</b> · max {stats.maxDur.toFixed(2)} s
        </div>
      </header>
      <div className="cols">
        <section className="case">
          <h2>Répliques</h2>
          <LinesPanel lang={lang} color={color} qa={qa} onlyProblems={onlyProblems} />
        </section>
        <div className="right">
          <SimPanel lang={lang} index={index} />
          <HintsPanel lang={lang} />
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
