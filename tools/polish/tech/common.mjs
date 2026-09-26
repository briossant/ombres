// Aides communes des scénarios de QA technique (polish) : sondes de frame, compteurs d'objets GL,
// charge GPU, démarrage d'une partie à N oiseaux. PORT dans l'environnement (défaut 8824).
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const PORT = Number(process.env.PORT ?? 8824)
export const ORIGIN = `http://localhost:${PORT}`
export const SHOTS = join(import.meta.dirname, '../../../shots/polish/tech')
mkdirSync(SHOTS, { recursive: true })
export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function gpuBusy() {
  try {
    return Number(readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8'))
  } catch {
    return -1
  }
}
export async function gpuBusyAvg(n = 8, every = 100) {
  const g = []
  for (let i = 0; i < n; i++) {
    g.push(gpuBusy())
    await sleep(every)
  }
  return Math.round(g.reduce((a, b) => a + b, 0) / g.length)
}

/**
 * Script injecté avant le chargement : chronomètre chaque callback rAF (temps CPU du thread
 * principal par frame), intervalles entre frames, compteurs d'objets WebGL vivants
 * (textures, buffers, programmes, framebuffers, renderbuffers, VAO, requêtes), longues tâches.
 */
export const PROBE = () => {
  const P = (window.__probe = {
    frames: [], // [t, interval, cpu]
    gl: { texture: 0, buffer: 0, program: 0, shader: 0, framebuffer: 0, renderbuffer: 0, vertexArray: 0, query: 0 },
    glCreated: { texture: 0, buffer: 0, program: 0, framebuffer: 0, renderbuffer: 0, vertexArray: 0, query: 0 },
    texBytes: 0,
    longTasks: [],
    timers: { timeout: 0, interval: 0, live: 0 },
    contextLost: 0,
  })
  let last = 0
  let frameStart = -1
  let frameCpu = 0
  // temps GPU de la frame entière : requête TIME_ELAPSED autour du rAF qui rend (canvas WebGL2 du jeu),
  // SEULEMENT si window.__probeGpu est vrai (incompatible avec ?debug=perf et le banc de qualité)
  P.gpu = [] // [t, ms]
  let gl = null
  let ext = null
  const pending = []
  const gc = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = gc.call(this, type, ...a)
    if (type === 'webgl2' && c && !gl && this.isConnected !== false) {
      gl = c
      ext = c.getExtension('EXT_disjoint_timer_query_webgl2')
      P.glCtx = c
    }
    return c
  }
  const pollGpu = () => {
    if (!gl || !ext) return
    const dis = gl.getParameter(ext.GPU_DISJOINT_EXT)
    while (pending.length) {
      const [t, q] = pending[0]
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      if (!dis) P.gpu.push([t, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6])
      gl.deleteQuery(q)
      pending.shift()
    }
    if (P.gpu.length > 20000) P.gpu.splice(0, 10000)
  }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb =>
    raf(t => {
      const s = performance.now()
      let q = null
      if (window.__probeGpu && gl && ext && !gl.isContextLost()) {
        q = gl.createQuery()
        try {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
        } catch {
          q = null
        }
      }
      try {
        cb(t)
      } finally {
        if (q) {
          gl.endQuery(ext.TIME_ELAPSED_EXT)
          pending.push([t, q])
          pollGpu()
        }
        frameCpu += performance.now() - s
        if (frameStart !== t) {
          // nouveau tick d'affichage
          if (frameStart >= 0) {
            P.frames.push([frameStart, frameStart - last, frameCpuPrev])
            if (P.frames.length > 20000) P.frames.splice(0, 10000)
            last = frameStart
          }
          frameStart = t
          frameCpuPrev = frameCpu
          frameCpu = 0
        }
      }
    })
  let frameCpuPrev = 0
  const wrap = (proto, create, del, key) => {
    const c = proto[create]
    const d = proto[del]
    proto[create] = function (...a) {
      const o = c.apply(this, a)
      if (o) {
        P.gl[key]++
        if (P.glCreated[key] !== undefined) P.glCreated[key]++
      }
      return o
    }
    proto[del] = function (o) {
      if (o) P.gl[key]--
      return d.call(this, o)
    }
  }
  for (const proto of [WebGL2RenderingContext.prototype]) {
    wrap(proto, 'createTexture', 'deleteTexture', 'texture')
    wrap(proto, 'createBuffer', 'deleteBuffer', 'buffer')
    wrap(proto, 'createProgram', 'deleteProgram', 'program')
    wrap(proto, 'createShader', 'deleteShader', 'shader')
    wrap(proto, 'createFramebuffer', 'deleteFramebuffer', 'framebuffer')
    wrap(proto, 'createRenderbuffer', 'deleteRenderbuffer', 'renderbuffer')
    wrap(proto, 'createVertexArray', 'deleteVertexArray', 'vertexArray')
    wrap(proto, 'createQuery', 'deleteQuery', 'query')
  }
  // minuteries vivantes (setInterval jamais nettoyés, setTimeout en attente)
  const live = new Set()
  const st = window.setTimeout
  const ct = window.clearTimeout
  const si = window.setInterval
  const ci = window.clearInterval
  window.setTimeout = function (fn, ms, ...a) {
    P.timers.timeout++
    let id
    id = st.call(window, (...b) => {
      live.delete(id)
      if (typeof fn === 'function') fn(...b)
    }, ms, ...a)
    live.add(id)
    return id
  }
  window.clearTimeout = id => {
    live.delete(id)
    return ct.call(window, id)
  }
  const liveIv = new Set()
  window.setInterval = function (...a) {
    P.timers.interval++
    const id = si.apply(window, a)
    liveIv.add(id)
    return id
  }
  window.clearInterval = id => {
    liveIv.delete(id)
    return ci.call(window, id)
  }
  P.liveTimers = () => ({ timeouts: live.size, intervals: liveIv.size })
  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        P.longTasks.push([e.startTime, e.duration])
        if (P.longTasks.length > 2000) P.longTasks.shift()
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  document.addEventListener(
    'webglcontextlost',
    () => {
      P.contextLost++
    },
    true,
  )
}

/** Statistiques des frames depuis `since` (ms, horloge de la page). */
export async function frameStats(page, since = 0) {
  return page.evaluate(since => {
    const f = window.__probe.frames.filter(x => x[0] >= since)
    if (!f.length) return null
    const iv = f.map(x => x[1]).sort((a, b) => a - b)
    const cpu = f.map(x => x[2]).sort((a, b) => a - b)
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))]
    const dur = (f[f.length - 1][0] - f[0][0]) / 1000
    const byT = new Map()
    for (const [t, ms] of window.__probe.gpu) if (t >= since) byT.set(t, (byT.get(t) ?? 0) + ms)
    const g = [...byT.values()].filter(x => x > 0.05).sort((a, b) => a - b)
    return {
      gpuN: g.length,
      gpuP10: g.length ? +q(g, 0.1).toFixed(2) : null,
      gpuP50: g.length ? +q(g, 0.5).toFixed(2) : null,
      gpuP90: g.length ? +q(g, 0.9).toFixed(2) : null,
      gpuMin: g.length ? +g[0].toFixed(2) : null,
      n: f.length,
      fps: +(f.length / Math.max(dur, 1e-3)).toFixed(1),
      ivP50: +q(iv, 0.5).toFixed(1),
      ivP95: +q(iv, 0.95).toFixed(1),
      ivP99: +q(iv, 0.99).toFixed(1),
      ivMax: +iv[iv.length - 1].toFixed(1),
      over20: +((100 * iv.filter(x => x > 20).length) / iv.length).toFixed(1),
      over34: +((100 * iv.filter(x => x > 34).length) / iv.length).toFixed(1),
      cpuP50: +q(cpu, 0.5).toFixed(2),
      cpuP95: +q(cpu, 0.95).toFixed(2),
      cpuP99: +q(cpu, 0.99).toFixed(2),
      cpuMax: +cpu[cpu.length - 1].toFixed(1),
    }
  }, since)
}

export const pageNow = page => page.evaluate(() => performance.now())

export async function glCounts(page) {
  return page.evaluate(() => ({ ...window.__probe.gl, timers: window.__probe.liveTimers(), created: { ...window.__probe.glCreated } }))
}

export async function heap(page, cdp) {
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
    const h = await cdp.send('Runtime.getHeapUsage').catch(() => null)
    const d = await cdp.send('Memory.getDOMCounters').catch(() => null)
    return { usedMB: h ? +(h.usedSize / 1048576).toFixed(1) : null, totalMB: h ? +(h.totalSize / 1048576).toFixed(1) : null, dom: d }
  }
  return page.evaluate(() => ({ usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }))
}

export async function waitFor(page, fn, arg, timeout = 30000, label = '') {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 })
  } catch {
    throw new Error(`timeout (${timeout} ms) : ${label || fn.toString().slice(0, 120)}`)
  }
}

/** Réglages persistés du PC avant chargement. */
export async function presetSettings(page, patch, bench) {
  await page.addInitScript(
    ([p, bench]) => {
      try {
        const k = 'ombres.settings.v1'
        const s = JSON.parse(localStorage.getItem(k) ?? '{}')
        localStorage.setItem(k, JSON.stringify({ ...s, ...p }))
        if (bench) localStorage.setItem('ombres.qualityBench.v1', bench)
      } catch {}
    },
    [patch, bench ?? null],
  )
}

/** Titre → salon, un joueur clavier (groupe 1), N oiseaux au total (bots ajoutés / retirés). */
export async function lobbyWith(page, total, { rounds = 1, length = 'normal' } = {}) {
  await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  await page.evaluate(() => window.__ombres.runner.enterLobby())
  await sleep(500)
  await page.keyboard.press('Space')
  await sleep(400)
  await page.evaluate(
    ([total, rounds, length]) => {
      const r = window.__ombres.runner
      r.setMatchSetting('rounds', rounds)
      r.setMatchSetting('length', length)
      let guard = 20
      while (r.roster.size > total && guard--) {
        const b = r.roster.bots().at(-1)
        if (!b) break
        r.removeBot(b.slot)
      }
      while (r.roster.size < total && guard--) if (!r.addBot(null, 1)) break
    },
    [total, rounds, length],
  )
  await sleep(300)
  return page.evaluate(() => window.__ombres.runner.roster.size)
}

export async function startMatch(page) {
  await page.keyboard.press('Enter')
  await waitFor(page, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 8000, 'lancement')
  if ((await page.evaluate(() => window.__ombres.runner.phase)) === 'rules') {
    await sleep(300)
    await page.keyboard.press('Enter')
  }
  await waitFor(page, () => window.__ombres?.runner.phase === 'round', null, 15000, 'manche')
}

export const kbSlot = page => page.evaluate(() => window.__ombres.runner.roster.players.find(p => p.kind === 'keyboard')?.slot ?? 0)

export function collect(page, tag) {
  const logs = []
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${tag}] [${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', e => logs.push(`[${tag}] [pageerror] ${e.message}`))
  page.on('response', r => {
    if (r.status() >= 400) logs.push(`[${tag}] [http ${r.status()}] ${r.url()}`)
  })
  page.on('requestfailed', r => logs.push(`[${tag}] [reqfail] ${r.url()} ${r.failure()?.errorText}`))
  return logs
}
