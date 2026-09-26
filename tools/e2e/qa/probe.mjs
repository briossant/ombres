// Sondes installées dans la page du PC : journal des textes visibles (récitatif, bannières,
// bulles, toasts, écrans) et mesure des images (rAF) par fenêtre.
export async function installProbe(pc) {
  await pc.evaluate(() => {
    const o = window.__ombres
    const L = (window.__qaLog = [])
    const t0 = performance.now()
    const at = () => ((performance.now() - t0) / 1000).toFixed(1)
    let prev = {}
    const txt = sel => [...document.querySelectorAll(sel)].map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)
    o.useUi.subscribe(s => {
      if (s.screen !== prev.screen) L.push(`${at()} screen ${s.screen}`)
      if (s.paused !== prev.paused) L.push(`${at()} paused ${s.paused}`)
      if (s.hostLink !== prev.hostLink) L.push(`${at()} hostLink ${s.hostLink}`)
      prev = { ...prev, screen: s.screen, paused: s.paused, hostLink: s.hostLink }
    })
    let seen = new Set()
    setInterval(() => {
      for (const [k, sel] of [
        ['sub', '.subtitle-wrap .recitatif'],
        ['banner', '.banner'],
        ['hint', '.hint__text'],
        ['toast', '.toast'],
      ]) {
        for (const t of txt(sel)) {
          const key = `${k}:${t}`
          if (!seen.has(key)) {
            seen.add(key)
            L.push(`${at()} ${k} « ${t} »`)
          }
        }
      }
    }, 200)
    // images
    const F = (window.__qaFrames = { dts: [], last: 0 })
    const loop = t => {
      if (F.last) F.dts.push(t - F.last)
      F.last = t
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
}

export async function drainLog(pc) {
  return pc.evaluate(() => window.__qaLog.splice(0))
}

/** Statistiques d'images depuis le dernier appel : moyenne, p95, p99, fps, images > 20 ms. */
export async function frameStats(pc) {
  return pc.evaluate(() => {
    const d = window.__qaFrames.dts.splice(0).sort((a, b) => a - b)
    if (!d.length) return null
    const q = p => d[Math.min(d.length - 1, Math.floor(p * d.length))]
    const avg = d.reduce((a, b) => a + b, 0) / d.length
    return { n: d.length, avg: +avg.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +d[d.length - 1].toFixed(1), fps: +(1000 / avg).toFixed(1), over20: d.filter(x => x > 20).length }
  })
}
