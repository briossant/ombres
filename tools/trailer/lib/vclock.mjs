// Horloge virtuelle injectée dans la page (page.addInitScript) : la capture image par image de la
// bande-annonce avance le temps de la page d'un pas fixe par image, quel que soit le temps réel qu'il
// faut pour rendre et capturer cette image. Tout le jeu suit : simulation (runner.frame(dt) du
// useFrame), ressorts de la caméra, animation des oiseaux, FX, minuteries, animations CSS de l'UI.
//
// - Mode « passthrough » (au chargement) : le temps est réel ; une pompe requestAnimationFrame réelle
//   vide la file des callbacks rAF de la page.
// - Mode « manuel » (window.__vt.manual(true)) : le temps est figé ; seul window.__vt.step(dtMs) le fait
//   avancer : minuteries échues, puis callbacks rAF (une image R3F), puis animations CSS/Web Animations
//   recalées sur le temps virtuel (mises en pause et pilotées par currentTime).
//
// Les minuteries créées en mode manuel sont virtuelles ; celles créées avant restent réelles.

/** Script d'initialisation (sérialisé par Playwright : aucune dépendance extérieure). */
export function VCLOCK() {
  if (window.__vt) return
  const realNow = performance.now.bind(performance)
  const realDateNow = Date.now.bind(Date)
  const realRaf = window.requestAnimationFrame.bind(window)
  const realSetTimeout = window.setTimeout.bind(window)
  const realClearTimeout = window.clearTimeout.bind(window)
  const realSetInterval = window.setInterval.bind(window)
  const realClearInterval = window.clearInterval.bind(window)
  const RealDate = Date

  let manual = false
  let vnow = 0 // ms, horloge performance.now virtuelle
  let passOffset = 0 // temps réel − temps de la page en mode passthrough (après un passage en manuel)
  let dateBase = 0 // Date.now() = dateBase + vnow en mode manuel
  let rafQ = new Map() // id -> cb
  let nextRaf = 1
  const timers = new Map() // id -> { due, fn, args, every }
  let nextTimer = 1e6 // ids distincts des minuteries réelles
  const realTimerIds = new Set()
  const anims = new WeakMap() // Animation -> base (ms virtuelles)
  let frames = 0

  performance.now = () => (manual ? vnow : realNow() - passOffset)
  Date.now = () => (manual ? Math.round(dateBase + vnow) : realDateNow() - passOffset)
  // new Date() sans argument suit l'horloge virtuelle
  function VDate(...a) {
    if (!new.target) return new RealDate(Date.now()).toString()
    return a.length ? new RealDate(...a) : new RealDate(Date.now())
  }
  VDate.prototype = RealDate.prototype
  VDate.now = Date.now
  VDate.parse = RealDate.parse
  VDate.UTC = RealDate.UTC
  window.Date = VDate

  window.requestAnimationFrame = cb => {
    const id = nextRaf++
    rafQ.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = id => {
    rafQ.delete(id)
  }
  const flushRaf = t => {
    const q = rafQ
    rafQ = new Map()
    for (const cb of q.values()) {
      try {
        cb(t)
      } catch (e) {
        console.error('[vclock] rAF', e)
      }
    }
  }
  let tookOver = false // des animations CSS sont passées sous contrôle (elles restent pilotées ensuite)
  const pump = t => {
    if (!manual) {
      flushRaf(t - passOffset)
      if (tookOver) syncAnimations(realNow() - passOffset)
    }
    realRaf(pump)
  }
  realRaf(pump)

  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!manual) {
      const id = realSetTimeout(fn, ms, ...args)
      realTimerIds.add(id)
      return id
    }
    const id = nextTimer++
    timers.set(id, { due: vnow + Math.max(0, Number(ms) || 0), fn, args, every: 0 })
    return id
  }
  window.setInterval = (fn, ms = 0, ...args) => {
    if (!manual) {
      const id = realSetInterval(fn, ms, ...args)
      realTimerIds.add(id)
      return id
    }
    const id = nextTimer++
    const every = Math.max(1, Number(ms) || 0)
    timers.set(id, { due: vnow + every, fn, args, every })
    return id
  }
  window.clearTimeout = id => {
    if (timers.delete(id)) return
    realClearTimeout(id)
  }
  window.clearInterval = id => {
    if (timers.delete(id)) return
    realClearInterval(id)
  }
  const runTimers = () => {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null
      let bestId = 0
      for (const [id, t] of timers) if (t.due <= vnow && (!best || t.due < best.due)) ((best = t), (bestId = id))
      if (!best) return
      if (best.every) best.due += best.every
      else timers.delete(bestId)
      try {
        if (typeof best.fn === 'function') best.fn(...best.args)
      } catch (e) {
        console.error('[vclock] timer', e)
      }
    }
  }
  function syncAnimations(now = vnow) {
    for (const a of document.getAnimations()) {
      let base = anims.get(a)
      if (base === undefined) {
        base = now - (Number(a.currentTime) || 0)
        anims.set(a, base)
        tookOver = true
        try {
          a.pause()
        } catch {}
      }
      try {
        a.currentTime = (now - base) * (a.playbackRate || 1)
      } catch {}
    }
  }
  const macrotask = () => new Promise(r => realSetTimeout(r, 0))

  window.__vt = {
    get manual() {
      return manual
    },
    get now() {
      return vnow
    },
    get frames() {
      return frames
    },
    /** Passe en temps manuel (true) ou revient au temps réel (false). */
    setManual(on) {
      if (on && !manual) {
        vnow = realNow() - passOffset
        dateBase = realDateNow() - realNow()
        manual = true
      } else if (!on && manual) {
        // le temps de la page reprend au temps réel, sans saut, à partir de là où il en était
        passOffset = realNow() - vnow
        manual = false
      }
    },
    /** Avance de dtMs : minuteries, une image rAF, animations CSS. Résout quand le DOM est à jour. */
    async step(dtMs, settleTasks = 2) {
      if (!manual) this.setManual(true)
      vnow += dtMs
      runTimers()
      flushRaf(vnow)
      frames++
      for (let i = 0; i < settleTasks; i++) {
        await macrotask()
        runTimers()
      }
      syncAnimations()
      return vnow
    },
    /** Avance de plusieurs pas sans rien capturer (mise en place d'un plan). */
    async advance(totalMs, dtMs = 1000 / 60) {
      let left = totalMs
      while (left > 1e-6) {
        const d = Math.min(dtMs, left)
        await this.step(d, 0)
        left -= d
      }
      await macrotask()
      syncAnimations()
      return vnow
    },
    syncAnimations: () => syncAnimations(),
    pendingTimers: () => timers.size,
  }
}

/** Graine fixe pour Math.random (captures reproductibles). */
export function SEEDED_RANDOM(seed) {
  let s = seed >>> 0 || 1
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
