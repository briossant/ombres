// Instrumentation GPU par passe (EXT_disjoint_timer_query_webgl2), active
// seulement avec ?debug (ou dans les pages de dev). Les requêtes sont lues de
// manière asynchrone (quelques frames plus tard) : aucune attente GPU.
export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private readonly pending: Array<[string, WebGLQuery]> = []
  private readonly history = new Map<string, Float32Array>()
  private readonly cursor = new Map<string, number>()
  private readonly count = new Map<string, number>()
  private active = false

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly window = 120,
  ) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer['ext']
  }

  get supported(): boolean {
    return this.ext !== null
  }

  /** Mesure `fn` sous le nom `name`. Pas d'imbrication (une requête active à la fois). */
  time<T>(name: string, fn: () => T): T {
    if (!this.ext || this.active) return fn()
    const q = this.gl.createQuery()
    if (!q) return fn()
    this.active = true
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q)
    try {
      return fn()
    } finally {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
      this.active = false
      this.pending.push([name, q])
    }
  }

  /** Relève les requêtes terminées (à appeler une fois par frame). */
  poll(): void {
    if (!this.ext) return
    const gl = this.gl
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean
    for (let i = 0; i < this.pending.length; ) {
      const [name, q] = this.pending[i]!
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        i++
        continue
      }
      if (!disjoint) this.record(name, (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6)
      gl.deleteQuery(q)
      this.pending.splice(i, 1)
    }
  }

  private record(name: string, ms: number): void {
    let h = this.history.get(name)
    if (!h) {
      h = new Float32Array(this.window)
      this.history.set(name, h)
      this.cursor.set(name, 0)
      this.count.set(name, 0)
    }
    const c = this.cursor.get(name)!
    h[c] = ms
    this.cursor.set(name, (c + 1) % this.window)
    this.count.set(name, Math.min(this.window, this.count.get(name)! + 1))
  }

  /** Médianes par passe (ms) sur la fenêtre glissante. */
  medians(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [name, h] of this.history) {
      const n = this.count.get(name)!
      const s = Array.from(h.subarray(0, n)).sort((a, b) => a - b)
      out[name] = +(s[Math.floor(s.length / 2)] ?? 0).toFixed(3)
    }
    return out
  }

  /** Nombre d'échantillons de la passe la moins mesurée. */
  get samples(): number {
    let m = Infinity
    for (const n of this.count.values()) m = Math.min(m, n)
    return m === Infinity ? 0 : m
  }

  reset(): void {
    this.history.clear()
    this.cursor.clear()
    this.count.clear()
  }
}
