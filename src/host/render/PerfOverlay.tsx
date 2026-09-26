// Overlay de mesures (GPU par passe, CPU du pipeline, draw calls), visible SEULEMENT avec
// ?debug dans l'URL (aucun élément de debug en jeu sinon). Lit window.__timings /
// window.__nprInfo publiés par NprPipeline quand `measure` est actif.
import { useEffect, useState } from 'react'

export const DEBUG_RENDER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')

export function PerfOverlay() {
  const [text, setText] = useState('mesures…')
  useEffect(() => {
    const id = setInterval(() => {
      const t = window.__timings
      const info = window.__nprInfo
      if (!t) return
      const gpu = ['shadow', 'gbuffer', 'ink', 'smaa'].filter((k) => k in t).map((k) => `${k} ${t[k]!.toFixed(2)}`)
      setText(
        `GPU ${t.total?.toFixed(2)} ms  (${gpu.join(' · ')})\nCPU pipeline ${t.cpu?.toFixed(2) ?? '?'} ms` +
          (info ? `  ·  ${info.calls} draw calls · ${Math.round(info.triangles / 1000)} k tri · ${info.casters} casters` : ''),
      )
    }, 500)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        font: '12px/1.35 ui-monospace, monospace',
        color: '#2b1d23',
        background: 'rgba(247, 240, 227, .85)',
        border: '1px solid #2b1d23',
        padding: '4px 8px',
        whiteSpace: 'pre',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {text}
    </div>
  )
}
