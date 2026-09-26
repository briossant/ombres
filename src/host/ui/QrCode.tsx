// QR code « à l'encre sur papier » (ART_BIBLE §8.8) : modules #2B1D23 sur
// papier, marge de 4 modules, carrés nets (lisibilité du scan avant tout).
import { useMemo } from 'react'
import QRCode from 'qrcode'

export function QrCode({ text, size = 336, className }: { text: string; size?: number; className?: string }) {
  const { d, n } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
    const m = qr.modules
    const margin = 4
    let path = ''
    for (let y = 0; y < m.size; y++) {
      let x = 0
      while (x < m.size) {
        if (m.get(y, x)) {
          const x0 = x
          while (x < m.size && m.get(y, x)) x++
          path += `M${x0 + margin} ${y + margin}h${x - x0}v1h${x0 - x}z`
        } else x++
      }
    }
    return { d: path, n: m.size + margin * 2 }
  }, [text])
  return (
    <svg className={className ? `qr ${className}` : 'qr'} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={text}>
      <rect width={n} height={n} fill="var(--paper)" />
      <path d={d} fill="var(--ink)" />
    </svg>
  )
}
