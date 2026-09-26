// Page de dev de la manette : l'app réelle, branchée sur un faux PC qui rejoue un scénario.
//   /dev/phone.html                 → index des scénarios (vignettes)
//   /dev/phone.html?s=play-target&lang=en&color=5&cb=1&scheme=tilt
import { createRoot } from 'react-dom/client'
import type { PhoneClientEvents, PhoneConnState, PhoneFatal } from '../../net/phoneClient.ts'
import type { PhoneToHost } from '../../shared/messages.ts'
import type { Lang } from '../../shared/protocol.ts'
import { attachClient, type ClientLike } from '../../phone/link.ts'
import { pushToast, setPhoneLang, setPrefs, usePhone } from '../../phone/store.ts'
import { PhoneApp } from '../../phone/App.tsx'
import { fx } from '../../phone/fx.ts'
import { SCENARIO_NAMES, buildScenario } from './scenarios.ts'
import '../../phone/phone.css'

const params = new URLSearchParams(location.search)
const name = params.get('s')
const lang: Lang = params.get('lang') === 'en' ? 'en' : 'fr'
const color = Number(params.get('color') ?? 0)
const colorblind = params.get('cb') === '1'
/** « Réduire les flashs » du PC (rf=1). */
const reduceFlashes = params.get('rf') === '1'

/** Faux client : même interface que PhoneClient, journalise ce que la manette envoie. */
class FakeClient implements ClientLike {
  readonly id = 'dev-phone-0000000000000000'
  state: PhoneConnState = 'online'
  error: PhoneFatal | null = null
  hostOnline = true
  roomCode = 'KXBF'
  private handlers = new Map<string, Set<(p: never) => void>>()
  readonly sent: PhoneToHost[] = []
  stick = { x: 0, y: 0 }
  buttons = 0

  on<K extends keyof PhoneClientEvents>(event: K, handler: (payload: PhoneClientEvents[K]) => void): () => void {
    let set = this.handlers.get(event)
    if (!set) this.handlers.set(event, (set = new Set()))
    set.add(handler as (p: never) => void)
    return () => void set.delete(handler as (p: never) => void)
  }
  emit<K extends keyof PhoneClientEvents>(event: K, payload: PhoneClientEvents[K]): void {
    for (const h of this.handlers.get(event) ?? []) (h as (p: PhoneClientEvents[K]) => void)(payload)
  }
  start(): void {}
  retry(): void {
    this.state = 'online'
    this.error = null
    this.emit('state', { state: 'online', error: null })
  }
  setStick(x: number, y: number): void {
    this.stick = { x, y }
    report(this)
  }
  setButton(btn: number, down: boolean): void {
    this.buttons = down ? this.buttons | btn : this.buttons & ~btn
    report(this)
  }
  releaseAll(): void {
    this.stick = { x: 0, y: 0 }
    this.buttons = 0
  }
  send(m: PhoneToHost): boolean {
    this.sent.push(m)
    ;(window as unknown as { __sent: PhoneToHost[] }).__sent = this.sent
    return true
  }
  sendHello(): void {}
}

function report(c: FakeClient): void {
  const w = window as unknown as { __input?: unknown }
  w.__input = { x: c.stick.x, y: c.stick.y, b: c.buttons }
  const el = document.getElementById('dev-input')
  if (el) el.textContent = `x ${c.stick.x.toFixed(2)}  y ${c.stick.y.toFixed(2)}  b ${c.buttons}`
}

function mountIndex(): void {
  document.body.style.overflow = 'auto'
  document.body.style.position = 'static'
  document.body.style.touchAction = 'auto'
  const root = document.getElementById('root')!
  root.style.overflow = 'auto'
  root.style.height = 'auto'
  root.innerHTML = `<div style="padding:16px;font-family:'Patrick Hand SC',sans-serif">
    <h1 style="font-family:'Julius Sans One';letter-spacing:.06em">Ombres — manette : scénarios</h1>
    <div style="display:flex;flex-wrap:wrap;gap:16px">${SCENARIO_NAMES.map(
      s => `<figure style="margin:0"><iframe src="?s=${s}&lang=${lang}&color=${color}${colorblind ? '&cb=1' : ''}" width="659" height="393" style="border:2px solid #2B1D23;background:#fff"></iframe><figcaption><a href="?s=${s}&lang=${lang}">${s}</a></figcaption></figure>`,
    ).join('')}</div></div>`
}

function mountScenario(s: string): void {
  const sc = buildScenario(s, lang, color, colorblind)
  if (sc.view && reduceFlashes) sc.view.reduceFlashes = true
  const scheme = params.get('scheme')
  if (scheme === 'absolute' || scheme === 'relative' || scheme === 'tilt') setPrefs({ scheme })
  setPhoneLang(lang)
  const client = new FakeClient()
  client.state = sc.conn
  client.error = sc.error ?? null
  client.hostOnline = sc.hostOnline ?? true
  if (sc.room !== undefined) client.roomCode = sc.room
  attachClient(client)
  const now = performance.now()
  usePhone.setState({
    room: client.roomCode,
    conn: sc.conn,
    error: sc.error ?? null,
    hostOnline: client.hostOnline,
    everOnline: sc.everOnline ?? sc.conn !== 'connecting',
    troubleSince: sc.troubleAgoMs !== undefined ? now - sc.troubleAgoMs : null,
    view: sc.view ?? null,
    viewAt: now,
    status: sc.status ?? null,
    statusAt: now,
    sheet: sc.sheet ?? null,
    touchedStick: sc.touched ?? false,
    localGoals: sc.localGoals ?? { fly: false, dive: false },
  })
  for (const m of sc.toasts ?? []) setTimeout(() => pushToast(m.key, m.params, m.tone ?? 'info'), 300)
  for (const c of sc.cues ?? []) {
    const fire = () => fx.cue(c.cue, c.n)
    setTimeout(() => {
      fire()
      setInterval(fire, c.every)
    }, (c.delay ?? 0) + 300)
  }
  createRoot(document.getElementById('root')!).render(
    <>
      <PhoneApp onJoin={code => console.log('join', code)} />
      {params.get('debug') === '1' && (
        <div id="dev-input" style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 99, font: '14px monospace', background: '#fff', padding: 4 }} />
      )}
    </>,
  )
  ;(window as unknown as { __ready: boolean }).__ready = true
}

if (name) mountScenario(name)
else mountIndex()
