// Page de dev de l'UI : dev/ui.html?screen=<écran>&lang=fr|en&n=<joueurs>
// Écrans : loading, title, title-menu, lobby, lobby-empty, rules, hud, pause,
// settings, round, match, credits, reconnect, icons.
// Options : phase=countdown|noon|afternoon|golden|sunset|great|last (hud),
// p=0..1 (chargement), cb=1 (daltonien), bg=<image de docs/art/img>|none, over=<écran sous les réglages>.
import { createRoot } from 'react-dom/client'
import { UiRoot } from '../../host/ui/UiRoot.tsx'
import { useSettings } from '../../host/settings.ts'
import { simEvents } from '../../host/bus.ts'
import {
  connectHudEvents,
  setUiActions,
  showBanner,
  showHint,
  showSubtitle,
  pushToast,
  useHud,
  useLobby,
  useUi,
  useRoster,
  type ScreenId,
} from '../../host/ui/viewModel.ts'
import * as vm from '../../host/ui/viewModel.ts'
import { preloadUiFonts } from '../../host/ui/fonts.ts'
import { fillHud, fillLobby, fillMatchResults, fillRoundResults, fillRulesCards, fillRoster, HUD_PHASES, placeAnchors } from './fixtures.ts'
import { IconSheet } from './IconSheet.tsx'

const q = new URLSearchParams(location.search)
const screenParam = q.get('screen') ?? 'title'
const n = Math.min(12, Math.max(1, Number(q.get('n') ?? 5)))
const lang = q.get('lang') === 'en' ? 'en' : 'fr'
useSettings.getState().set('lang', lang)
useSettings.getState().set('colorblind', q.get('cb') === '1')

const bgEl = document.getElementById('bg') as HTMLDivElement
function setBg(name: string | null, filter?: string): void {
  if (!name || name === 'none') {
    bgEl.style.backgroundImage = 'none'
    return
  }
  bgEl.style.backgroundImage = `url(/docs/art/img/${name}.jpg)`
  bgEl.style.filter = filter ?? ''
}

// Actions factices : la navigation marche, le reste se journalise.
setUiActions({
  startMatch: () => useUi.setState({ screen: 'rules' }),
  addBot: (p, level) => {
    const slots = useRoster.getState().slots
    if (slots.length >= 12) return
    const used = new Set(slots.map(s => s.colorIndex))
    const colorIndex = [...Array(12).keys()].find(i => !used.has(i)) ?? 0
    useRoster.setState({
      slots: [
        ...slots,
        {
          slot: slots.length,
          colorIndex,
          name: '',
          kind: 'bot',
          bot: { personality: p ?? vm.BOT_PERSONALITIES[slots.length % 7], level },
          connected: true,
          ready: true,
          goals: { fly: false, dive: false, strike: false },
          assist: false,
          substitute: false,
        },
      ],
    })
  },
  removeBot: slot => useRoster.setState(s => ({ slots: s.slots.filter(x => x.slot !== slot) })),
  setBotLevel: (slot, level) => useRoster.setState(s => ({ slots: s.slots.map(x => (x.slot === slot && x.bot ? { ...x, bot: { ...x.bot, level } } : x)) })),
  setBotPersonality: (slot, personality) => useRoster.setState(s => ({ slots: s.slots.map(x => (x.slot === slot && x.bot ? { ...x, bot: { ...x.bot, personality } } : x)) })),
  continueResults: () => useUi.setState({ screen: 'matchResults' }),
  rematch: () => useUi.setState({ screen: 'rules' }),
})

let screen: ScreenId = 'title'
const joinUrl = `http://192.168.1.16:8787/play?r=KX4P`

switch (screenParam) {
  case 'loading':
    screen = 'loading'
    useUi.setState({ loading: { progress: Number(q.get('p') ?? 0.64), labelKey: 'host.loading.sounds' } })
    setBg('none')
    break
  case 'title':
  case 'title-menu':
    screen = 'title'
    useUi.setState({ titleMenuOpen: screenParam === 'title-menu' })
    setBg('plan-bas-heure-doree')
    break
  case 'lobby':
  case 'lobby-empty':
    screen = 'lobby'
    fillLobby(screenParam === 'lobby-empty' ? 0 : n, joinUrl)
    if (screenParam === 'lobby-empty') useRoster.setState({ slots: [] })
    setBg('jeu-kf50-apresmidi')
    break
  case 'rules':
    screen = 'rules'
    fillRoster(n)
    fillRulesCards(n)
    setBg('jeu-kf50-apresmidi')
    break
  case 'hud':
  case 'pause':
  case 'reconnect': {
    screen = 'game'
    const fx = HUD_PHASES[q.get('phase') ?? 'golden'] ?? HUD_PHASES.golden
    fillHud(n, fx)
    setBg(fx.bg)
    if (screenParam === 'pause') useUi.setState({ paused: true, pausedBy: 0 })
    if (screenParam === 'reconnect') useUi.setState({ hostLink: 'reconnecting' })
    break
  }
  case 'settings':
    screen = (q.get('over') as ScreenId) ?? 'title'
    useUi.setState({ overlay: 'settings', titleMenuOpen: true })
    setBg('plan-bas-heure-doree')
    break
  case 'round':
    screen = 'roundResults'
    fillRoundResults(n)
    setBg('jeu-kf3-coucher', 'brightness(0.55) saturate(0.7) hue-rotate(-25deg)')
    break
  case 'match':
    screen = 'matchResults'
    fillMatchResults(n)
    setBg('plan-bas-coucher')
    break
  case 'credits':
    screen = 'credits'
    setBg('plan-bas-soleil-bas')
    break
  case 'icons':
    setBg('none')
    break
}

useUi.setState({ screen })
connectHudEvents()
window.addEventListener('resize', () => placeAnchors(n))

// Scénario HUD : ce qu'on voit à un instant donné de la phase demandée.
if (screenParam === 'hud') {
  const phase = q.get('phase') ?? 'golden'
  const colorOf = (slot: number) => useRoster.getState().slots[slot]?.colorIndex ?? 0
  if (phase === 'countdown') useHud.setState({ countdown: 2 })
  if (phase === 'golden') {
    showBanner('host.phase.golden', { subKey: 'host.phaseHint.golden', seconds: 600 })
    showHint(0, lang === 'fr' ? 'Maintiens PLONGER : ombre petite et forte.' : 'Hold DIVE: small, strong shadow.', undefined, 600)
    useHud.setState({ tagsUntil: Array.from({ length: 12 }, () => performance.now() + 600_000) })
  }
  if (phase === 'great') showBanner('host.phase.greatShadow', { subKey: 'host.phaseHint.greatShadow', tone: 'alert', seconds: 600 })
  if (phase === 'last') useHud.setState({ lastSeconds: 3 })
  if (phase === 'sunset' || phase === 'afternoon' || phase === 'last')
    showSubtitle({ text: lang === 'fr' ? '{color} prend la tête. Le sable a la mémoire courte.' : '{color} takes the lead. Sand has a short memory.', colorIndex: colorOf(1), seconds: 600 })
  if (phase === 'sunset') {
    useHud.setState({ flash: { slot: 2, id: 99 } })
    useHud.setState({ tagsUntil: Array.from({ length: 12 }, () => performance.now() + 600_000) })
    pushToast('host.toast.substitute', { params: { name: 'Anouk' }, slot: 3, tone: 'alert', seconds: 600 })
  }
  if (phase === 'noon') useHud.setState({ tagsUntil: Array.from({ length: 12 }, () => performance.now() + 600_000) })
}
if (screenParam === 'lobby') pushToast('host.toast.joined', { params: { name: 'Momo' }, slot: 2, seconds: 600 })

// Accès console / scripts de capture.
Object.assign(window, { __ui: { ...vm, useLobby, useHud, simEvents } })

const rootEl = document.getElementById('root') as HTMLDivElement
createRoot(rootEl).render(screenParam === 'icons' ? <IconSheet /> : <UiRoot />)

void preloadUiFonts().then(() => {
  setTimeout(() => {
    ;(window as unknown as { __ready: boolean }).__ready = true
  }, 400)
})
