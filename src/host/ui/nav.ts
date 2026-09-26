// Navigation au clavier, à la souris et à la manette pour les écrans du PC.
//
// - Chaque écran / surcouche déclare une « portée » (useNavScope) : la dernière
//   montée est active. Les éléments focalisables portent l'attribut `data-nav`.
// - Flèches : déplacement spatial du focus (le plus proche dans la direction).
//   Un élément `data-nav-own="x"` (curseur, sélecteur) garde ←/→ pour lui.
// - Entrée / A : active l'élément focalisé (ou `onEnter` de la portée).
// - Échap / B : `onBack` de la portée. Start : `onStart`.
// - La souris focalise au survol : un seul surlignage, comme sur console.
// - Espace n'active JAMAIS un bouton : c'est la touche PLONGER (rejoindre au clavier).
// - Une portée `arrows: false` ignore les flèches (salon avec un joueur au
//   clavier : elles pilotent son oiseau).
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export interface NavScopeOptions {
  onBack?: () => void
  onEnter?: () => void
  onStart?: () => void
  /** Défaut : true. */
  arrows?: boolean
  /** Focus initial : sélecteur relatif à la racine (défaut : [data-nav-default]). */
  autoFocus?: boolean
  /**
   * Couche : une portée de couche supérieure reste active même si un écran se
   * remonte dessous (changement de langue). 0 écrans, 10 pause, 20 réglages, 30 reconnexion.
   */
  layer?: number
}

interface Scope {
  root: RefObject<HTMLElement | null>
  opts: NavScopeOptions
}

const stack: Scope[] = []

/** Sons de navigation (ajout qa, phase 3) : le runner branche l'audio (`playUi`). Défaut : muet. */
export type NavSound = 'hover' | 'toggle' | 'slider'
let navSound: (name: NavSound, value?: number) => void = () => undefined
export function setNavSound(fn: (name: NavSound, value?: number) => void): void {
  navSound = fn
}
/** Joue un son d'interface (curseurs, sélecteurs) : voir setNavSound. */
export function uiSound(name: NavSound, value?: number): void {
  navSound(name, value)
}

function activeScope(): Scope | undefined {
  return stack[stack.length - 1]
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null)
}

function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return
  el.focus({ preventScroll: true })
}

export function focusDefault(root: HTMLElement | null): void {
  if (!root) return
  const els = focusables(root)
  focusEl(els.find(e => e.hasAttribute('data-nav-default')) ?? els[0])
}

type Dir = 'up' | 'down' | 'left' | 'right'

function moveFocus(dir: Dir): void {
  const scope = activeScope()
  const root = scope?.root.current
  if (!root) return
  const els = focusables(root)
  if (els.length === 0) return
  const cur = document.activeElement as HTMLElement | null
  if (!cur || !root.contains(cur) || !cur.hasAttribute('data-nav')) {
    focusDefault(root)
    return
  }
  const r = cur.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of els) {
    if (el === cur) continue
    const b = el.getBoundingClientRect()
    // Point de b le plus proche du centre courant, pour les éléments larges.
    const px = Math.min(Math.max(cx, b.left), b.right)
    const py = Math.min(Math.max(cy, b.top), b.bottom)
    const ex = (dx !== 0 ? b.left + b.width / 2 : px) - cx
    const ey = (dy !== 0 ? b.top + b.height / 2 : py) - cy
    const along = ex * dx + ey * dy
    if (along <= 2) continue
    const across = Math.abs(ex * dy) + Math.abs(ey * dx)
    const score = along + across * 2.2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (best) {
    focusEl(best)
    navSound('hover')
  }
}

function activate(): void {
  const scope = activeScope()
  const root = scope?.root.current
  const cur = document.activeElement as HTMLElement | null
  if (root && cur && root.contains(cur) && cur.hasAttribute('data-nav')) {
    cur.classList.add('is-pressed')
    setTimeout(() => cur.classList.remove('is-pressed'), 110)
    cur.click()
    return
  }
  scope?.opts.onEnter?.()
}

function onKeyDown(e: KeyboardEvent): void {
  const scope = activeScope()
  const target = e.target as HTMLElement | null
  // Espace = PLONGER : ne doit jamais cliquer le bouton focalisé.
  if (e.code === 'Space' && target instanceof HTMLButtonElement) e.preventDefault()
  if (!scope) return
  switch (e.code) {
    case 'Escape':
    case 'Backspace':
      if (scope.opts.onBack) {
        e.preventDefault()
        scope.opts.onBack()
      }
      return
    case 'Enter':
    case 'NumpadEnter':
      e.preventDefault()
      if (!e.repeat) activate()
      return
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (scope.opts.arrows === false) return
      const dir = e.code.slice(5).toLowerCase() as Dir
      const own = target?.getAttribute?.('data-nav-own')
      if (own === 'x' && (dir === 'left' || dir === 'right')) return // l'élément gère lui-même
      e.preventDefault()
      moveFocus(dir)
      return
    }
    default:
      return
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Space' && e.target instanceof HTMLButtonElement) e.preventDefault()
}

/** Survol = focus (un seul surlignage). */
function onPointerOver(e: PointerEvent): void {
  if (e.pointerType !== 'mouse') return
  const el = (e.target as HTMLElement | null)?.closest?.('[data-nav]') as HTMLElement | null
  if (el && document.activeElement !== el && !el.hasAttribute('disabled')) {
    const scope = activeScope()
    if (scope?.root.current?.contains(el)) {
      focusEl(el)
      navSound('hover')
    }
  }
}

function onFocusIn(e: FocusEvent): void {
  const el = e.target as HTMLElement
  if (el?.hasAttribute?.('data-nav')) el.classList.add('is-focus')
}
function onFocusOut(e: FocusEvent): void {
  const el = e.target as HTMLElement
  el?.classList?.remove('is-focus')
}

// ─── Manette (Gamepad API) ─────────────────────────────────────────────────

const PAD_REPEAT_DELAY = 380
const PAD_REPEAT_EVERY = 150
/**
 * Manettes réservées au jeu (ajout runner, phase 3) : une manette qui pilote un oiseau
 * (salon, manche) garde A / B / stick pour PLONGER, COUP D'AILE et le cap ; seul Start
 * reste à la navigation (pause, lancement). Défaut : aucune.
 */
let padClaimed: (index: number) => boolean = () => false
export function setGamepadClaim(fn: (index: number) => boolean): void {
  padClaimed = fn
}
let padRaf = 0
const padPrev = new Map<number, boolean[]>()
let padDir: Dir | null = null
let padDirSince = 0
let padDirLast = 0

function dispatchKey(code: string): void {
  // On rejoue le chemin clavier : les éléments data-nav-own reçoivent les flèches.
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }))
}

function pollPads(now: number): void {
  padRaf = requestAnimationFrame(pollPads)
  const pads = navigator.getGamepads?.() ?? []
  let dir: Dir | null = null
  for (const pad of pads) {
    if (!pad) continue
    const prev = padPrev.get(pad.index) ?? []
    const pressed = pad.buttons.map(b => b.pressed)
    const edge = (i: number) => pressed[i] && !prev[i]
    const claimed = padClaimed(pad.index)
    if (edge(0) && !claimed) dispatchKey('Enter')
    if (edge(1) && !claimed) dispatchKey('Escape')
    if (edge(9)) activeScope()?.opts.onStart?.()
    padPrev.set(pad.index, pressed)
    if (claimed) continue
    const ax = pad.axes[0] ?? 0
    const ay = pad.axes[1] ?? 0
    if (pressed[12] || ay < -0.6) dir = 'up'
    else if (pressed[13] || ay > 0.6) dir = 'down'
    else if (pressed[14] || ax < -0.6) dir = 'left'
    else if (pressed[15] || ax > 0.6) dir = 'right'
  }
  if (dir !== padDir) {
    padDir = dir
    padDirSince = now
    padDirLast = now
    if (dir) dispatchKey('Arrow' + dir[0].toUpperCase() + dir.slice(1))
  } else if (dir && now - padDirSince > PAD_REPEAT_DELAY && now - padDirLast > PAD_REPEAT_EVERY) {
    padDirLast = now
    dispatchKey('Arrow' + dir[0].toUpperCase() + dir.slice(1))
  }
}

let installed = 0

/** Installe les écouteurs globaux (une fois, par UiRoot). */
export function installNav(root: HTMLElement): () => void {
  installed++
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp, true)
  root.addEventListener('pointerover', onPointerOver)
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)
  if (installed === 1 && typeof navigator.getGamepads === 'function') padRaf = requestAnimationFrame(pollPads)
  return () => {
    installed--
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp, true)
    root.removeEventListener('pointerover', onPointerOver)
    root.removeEventListener('focusin', onFocusIn)
    root.removeEventListener('focusout', onFocusOut)
    if (installed === 0) cancelAnimationFrame(padRaf)
  }
}

/**
 * Déclare une portée de navigation (écran ou surcouche). Les options peuvent
 * changer à chaque rendu ; la portée reste à sa place dans la pile.
 */
export function useNavScope(root: RefObject<HTMLElement | null>, opts: NavScopeOptions = {}): void {
  const scopeRef = useRef<Scope>({ root, opts })
  scopeRef.current.opts = opts
  useLayoutEffect(() => {
    const scope = scopeRef.current
    // Insertion après toutes les portées de couche inférieure ou égale.
    const layer = scope.opts.layer ?? 0
    let at = stack.length
    while (at > 0 && (stack[at - 1].opts.layer ?? 0) > layer) at--
    stack.splice(at, 0, scope)
    // Élément qui avait le focus à l'ouverture (ajout qa) : il le retrouve à la fermeture
    // (Réglages fermés → le focus revient sur « Réglages », pas sur « Jouer »).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (opts.autoFocus !== false) {
      // Après l'animation d'entrée : sinon getBoundingClientRect est décalé.
      requestAnimationFrame(() => {
        const el = root.current
        if (el && activeScope() === scope && !el.contains(document.activeElement)) focusDefault(el)
      })
    }
    return () => {
      const i = stack.indexOf(scope)
      if (i >= 0) stack.splice(i, 1)
      const next = activeScope()
      const nextRoot = next?.root.current
      if (nextRoot && next?.opts.autoFocus !== false)
        requestAnimationFrame(() => {
          if (opener?.isConnected && opener.hasAttribute('data-nav') && nextRoot.contains(opener)) focusEl(opener)
          else focusDefault(nextRoot)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Refocalise l'élément par défaut quand `key` change (ex. contenu reconstruit). */
export function useRefocus(root: RefObject<HTMLElement | null>, key: unknown): void {
  useEffect(() => {
    const el = root.current
    if (el && !el.contains(document.activeElement)) focusDefault(el)
  }, [root, key])
}
