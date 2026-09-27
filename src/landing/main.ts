// Page d'accueil des téléphones (/m) : textes FR/EN, bande-annonce (ou carrousel des captures
// si elle n'est pas encore publiée), copier / partager le lien, code de salle → /play?r=CODE.
// Aucune dépendance au jeu : ce module et sa CSS sont tout le JavaScript de la page.
import type { Lang } from '../shared/protocol.ts'
import { landing } from '../shared/strings/landing.ts'
import { PUBLIC_HOST, PUBLIC_URL, isCode, isPhone, makeT, normalizeCode, pickLang, playUrl } from './logic.ts'
import './landing.css'

const LANG_KEY = 'ombres.landing.lang'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

function stored(): string | null {
  try {
    return localStorage.getItem(LANG_KEY)
  } catch {
    return null
  }
}

let lang: Lang = pickLang(stored(), navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en'])
let t = makeT(landing, lang)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
const onPhone = isPhone(screen.width, screen.height, matchMedia('(pointer: coarse)').matches)

// ─── Textes ────────────────────────────────────────────────────────────────

/** Petits états qui changent le texte d'un bouton (copié, son) : réappliqués au changement de langue. */
const refreshers: Array<() => void> = []

function applyTexts(): void {
  document.documentElement.lang = lang
  document.title = t('landing.title')
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t ?? '')
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria ?? ''))
  // Corps de la case « grand écran » : l'adresse en gras, insécable aux points.
  const body = $('big-body')
  if (body) {
    const [before, after = ''] = t(onPhone ? 'landing.big.body' : 'landing.desk.body').split('{url}')
    const url = document.createElement('b')
    url.className = 'url'
    url.textContent = PUBLIC_HOST
    body.replaceChildren(before ?? '', ...(onPhone ? [url, after] : []))
  }
  if (!onPhone) {
    const title = $('big-title')
    if (title) title.textContent = t('landing.desk.title')
  }
  for (const r of refreshers) r()
}

// ─── Case « grand écran » : copier, partager (ou lancer le jeu si on est déjà sur un PC) ──

function setupBigScreen(): void {
  const copy = $<HTMLButtonElement>('btn-copy')
  const share = $<HTMLButtonElement>('btn-share')
  const desk = $<HTMLAnchorElement>('btn-desk')
  const status = $('copy-status')
  if (!onPhone) {
    // Ouvert sur un ordinateur ou une tablette (lien /m partagé) : on propose le jeu directement.
    copy?.setAttribute('hidden', '')
    if (desk) desk.hidden = false
    return
  }
  let copied = false
  let timer = 0
  const render = () => {
    if (copy) copy.textContent = t(copied ? 'landing.big.copied' : 'landing.big.copy')
    copy?.classList.toggle('is-done', copied)
  }
  refreshers.push(render)
  copy?.addEventListener('click', async () => {
    const ok = await copyText(PUBLIC_URL)
    if (status) status.textContent = ok ? t('landing.big.copied') : t('landing.big.copyFail')
    copied = ok
    render()
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      copied = false
      render()
      if (status) status.textContent = ''
    }, 2600)
  })
  if (share && typeof navigator.share === 'function') {
    share.hidden = false
    share.addEventListener('click', () => {
      navigator.share({ title: 'Ombres', text: t('landing.big.shareText'), url: PUBLIC_URL }).catch(() => {
        // partage annulé : rien à faire
      })
    })
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Repli (HTTP, anciens navigateurs) : sélection d'un champ temporaire.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.append(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

// ─── Code de salle ─────────────────────────────────────────────────────────

function setupCode(): void {
  const form = $<HTMLFormElement>('code-form')
  const input = $<HTMLInputElement>('code-input')
  const go = $<HTMLButtonElement>('code-go')
  if (!form || !input || !go) return
  const sync = () => {
    const code = normalizeCode(input.value)
    if (input.value !== code) input.value = code
    go.disabled = !isCode(code)
  }
  input.addEventListener('input', sync)
  form.addEventListener('submit', e => {
    e.preventDefault()
    const code = normalizeCode(input.value)
    if (isCode(code)) location.href = playUrl(code)
  })
  sync()
}

// ─── Bande-annonce, ou carrousel des captures ─────────────────────────────

const TRAILER = '/media/trailer-720.mp4'
const POSTER = '/media/trailer-poster.jpg'

/** La bande-annonce est-elle publiée ? (HEAD : rien n'est téléchargé ; une page HTML de secours ne compte pas) */
async function hasFile(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' })
    return res.ok && !/text\/html/.test(res.headers.get('content-type') ?? '')
  } catch {
    return false
  }
}

async function setupTrailer(): Promise<void> {
  const hero = $('hero')
  const video = $<HTMLVideoElement>('trailer')
  const play = $<HTMLButtonElement>('btn-play')
  const sound = $<HTMLButtonElement>('btn-sound')
  if (!hero || !video || !play || !sound) return
  let failed = false
  const fail = () => {
    if (failed) return
    failed = true
    useCarousel()
  }
  if (!video.canPlayType('video/mp4') || !(await hasFile(TRAILER))) return fail()
  video.addEventListener('error', fail)
  video.poster = POSTER
  video.preload = 'metadata'
  video.src = TRAILER

  // Lecture muette en boucle, sauf « réduire les animations » ou économie de données : bouton lecture.
  let wantPlay = !reducedMotion && !saveData
  let unmutedOnce = false
  const renderCtl = () => {
    const playing = !video.paused
    play.classList.toggle('is-playing', playing)
    play.setAttribute('aria-label', t(playing ? 'landing.media.pause' : 'landing.media.play'))
    sound.setAttribute('aria-pressed', String(!video.muted))
    sound.setAttribute('aria-label', t(video.muted ? 'landing.media.soundOn' : 'landing.media.soundOff'))
    sound.classList.toggle('is-on', !video.muted)
    hero.classList.toggle('is-paused', !playing)
  }
  refreshers.push(renderCtl)
  const tryPlay = () => {
    video.play().then(renderCtl, () => {
      // lecture automatique refusée (mode économie d'énergie iOS…) : le bouton lecture reste visible
      play.hidden = false
      renderCtl()
    })
  }
  if (!wantPlay) play.hidden = false
  play.addEventListener('click', () => {
    if (video.paused) {
      wantPlay = true
      tryPlay()
    } else {
      wantPlay = false
      video.pause()
    }
    renderCtl()
  })
  sound.addEventListener('click', () => {
    video.muted = !video.muted
    // Premier son : on reprend du début, la bande-annonce est montée avec sa musique.
    if (!video.muted && !unmutedOnce) {
      unmutedOnce = true
      video.currentTime = 0
    }
    if (!video.muted || wantPlay) {
      wantPlay = true
      tryPlay()
    }
    renderCtl()
  })
  video.addEventListener('play', renderCtl)
  video.addEventListener('pause', renderCtl)
  video.addEventListener('volumechange', renderCtl)
  // Hors écran : pause (batterie, données) ; de retour : reprise si elle jouait.
  new IntersectionObserver(
    entries => {
      const visible = entries.some(e => e.isIntersecting)
      if (visible && wantPlay && video.paused) tryPlay()
      else if (!visible && !video.paused) video.pause()
    },
    { threshold: 0.25 },
  ).observe(video)
  renderCtl()
}

/** Pas de bande-annonce : les quatre cases de la manche remontent à sa place et défilent seules. */
function useCarousel(): void {
  const media = $('media')
  const strip = $('strip')
  const list = $('strip-list')
  const dots = $('strip-dots')
  if (!media || !strip || !list || !dots) return
  $('hero')?.remove()
  strip.classList.add('strip--carousel')
  strip.removeAttribute('aria-labelledby')
  strip.dataset.tAria = 'landing.media.shots'
  strip.setAttribute('aria-label', t('landing.media.shots'))
  media.append(strip)
  for (const img of list.querySelectorAll('img')) img.loading = 'eager'
  // En tête de page, on ouvre sur le jeu lui-même (heure dorée, Grande Ombre), puis le salon et la manette.
  const panels = [...list.children]
  list.replaceChildren(...panels.slice(2), ...panels.slice(0, 2))
  list.scrollLeft = 0
  renderDots()
  let lastTouch = 0
  const touch = () => (lastTouch = performance.now())
  for (const ev of ['pointerdown', 'wheel', 'keydown'] as const) list.addEventListener(ev, touch, { passive: true })
  list.addEventListener('touchstart', touch, { passive: true })
  let inView = true
  new IntersectionObserver(entries => (inView = entries.some(e => e.isIntersecting)), { threshold: 0.3 }).observe(list)
  if (reducedMotion) return
  window.setInterval(() => {
    if (!inView || document.hidden || performance.now() - lastTouch < 9000) return
    const n = list.children.length
    const i = currentIndex(list)
    scrollToPanel(list, (i + 1) % n)
  }, 4500)
}

/** Case en tête de la bande (les cases s'alignent à gauche) ; la dernière quand on est au bout. */
function currentIndex(list: HTMLElement): number {
  const n = list.children.length
  if (n && list.scrollLeft >= list.scrollWidth - list.clientWidth - 2 && list.scrollLeft > 0) return n - 1
  const first = list.children[0] as HTMLElement | undefined
  const x0 = first?.offsetLeft ?? 0
  let best = 0
  let bestD = Infinity
  ;[...list.children].forEach((el, i) => {
    const d = Math.abs((el as HTMLElement).offsetLeft - x0 - list.scrollLeft)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function scrollToPanel(list: HTMLElement, i: number): void {
  const el = list.children[i] as HTMLElement | undefined
  const first = list.children[0] as HTMLElement | undefined
  if (el && first) list.scrollTo({ left: el.offsetLeft - first.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' })
}

/** Pastilles sous la bande de cases (une par case, celle en vue est pleine), dans l'ordre courant des cases. */
function renderDots(): void {
  const list = $('strip-list')
  const dots = $('strip-dots')
  if (!list || !dots) return
  const panels = [...list.children] as HTMLElement[]
  if (dots.childElementCount !== panels.length) {
    dots.replaceChildren(
      ...panels.map((_, i) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'dot'
        b.addEventListener('click', () => scrollToPanel(list, i))
        return b
      }),
    )
  }
  const best = currentIndex(list)
  ;[...dots.children].forEach((b, i) => {
    b.setAttribute('aria-label', t('landing.media.dot', { n: i + 1, total: panels.length }))
    if (i === best) b.setAttribute('aria-current', 'true')
    else b.removeAttribute('aria-current')
  })
}

function setupDots(): void {
  const list = $('strip-list')
  if (!list) return
  let raf = 0
  list.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(renderDots)
    },
    { passive: true },
  )
  refreshers.push(renderDots)
  renderDots()
}

// ─── Langue ────────────────────────────────────────────────────────────────

function setupLang(): void {
  $('btn-lang')?.addEventListener('click', () => {
    lang = lang === 'fr' ? 'en' : 'fr'
    t = makeT(landing, lang)
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // stockage indisponible : le choix vaut pour cette visite
    }
    applyTexts()
  })
}

setupBigScreen()
setupCode()
setupDots()
void setupTrailer()
setupLang()
applyTexts()
document.documentElement.classList.add('is-ready')
