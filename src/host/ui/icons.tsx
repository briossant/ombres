// Icônes d'interface « encre » (ART_BIBLE §8.4) : grille de 24 px, trait de
// 1,8 px, extrémités rondes, un seul ton (currentColor). Les icônes pleines
// sont réservées aux glyphes des joueurs (glyphs.tsx).
import type { CSSProperties, ReactNode } from 'react'

function gearPath(): string {
  // Engrenage à 6 dents : dents trapézoïdales entre r = 7 et r = 9,6.
  const pts: string[] = []
  const rootR = 7
  const tipR = 9.6
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    const pairs: [number, number][] = [
      [a - 0.42, rootR],
      [a - 0.2, tipR],
      [a + 0.2, tipR],
      [a + 0.42, rootR],
    ]
    for (const [ang, r] of pairs) pts.push(`${(12 + Math.cos(ang) * r).toFixed(2)} ${(12 + Math.sin(ang) * r).toFixed(2)}`)
  }
  return 'M' + pts.join('L') + 'Z'
}

function sunRays(): string {
  let d = ''
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    d += `M${(12 + c * 6.8).toFixed(2)} ${(12 + s * 6.8).toFixed(2)}L${(12 + c * 9.4).toFixed(2)} ${(12 + s * 9.4).toFixed(2)}`
  }
  return d
}

/** Chemins (trait) ; les éléments pleins sont notés à part. */
const ICONS = {
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  resume: <path d="M8 5.2L18.6 12L8 18.8Z" />,
  settings: (
    <>
      <path d={gearPath()} />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  volume: <path d="M3.8 9.4h3.4L12 5.3v13.4l-4.8-4.1H3.8ZM15.4 9.2a4 4 0 0 1 0 5.6M18 6.6a7.6 7.6 0 0 1 0 10.8" />,
  music: (
    <>
      <path d="M9 17.2V6.4l10-2.2v10.8" />
      <circle cx="6.8" cy="17.3" r="2.2" />
      <circle cx="16.8" cy="15" r="2.2" />
    </>
  ),
  sfx: <path d="M2.5 12h2.3l2-4.6 3 10.4 3-13 3 13 2.2-6.2h3.5" />,
  voice: <path d="M5 5.8h14a1.6 1.6 0 0 1 1.6 1.6v7.1a1.6 1.6 0 0 1-1.6 1.6h-7.6l-4.2 3.5v-3.5H5a1.6 1.6 0 0 1-1.6-1.6V7.4A1.6 1.6 0 0 1 5 5.8ZM8 9.8h8M8 12.6h5" />,
  quality: <path d="M6 18.5v-4.2M12 18.5v-8M18 18.5V6.2" />,
  fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  colorblind: (
    <>
      <path d="M2.4 12s3.6-6.2 9.6-6.2 9.6 6.2 9.6 6.2-3.6 6.2-9.6 6.2S2.4 12 2.4 12Z" />
      <circle cx="12" cy="12" r="3.3" />
      <path d="M10.2 13.6l3.3-3.3M11.2 14.9l2.9-2.9" strokeWidth="1.3" />
    </>
  ),
  hidden: <path d="M2.4 12s3.6-6.2 9.6-6.2 9.6 6.2 9.6 6.2-3.6 6.2-9.6 6.2S2.4 12 2.4 12ZM4.5 19.5l15-15" />,
  gamepad: (
    <>
      <path d="M7.2 7.6h9.6a4.4 4.4 0 0 1 4.4 4.4v1.6a3.6 3.6 0 0 1-6.3 2.4l-.9-1h-4l-.9 1a3.6 3.6 0 0 1-6.3-2.4V12a4.4 4.4 0 0 1 4.4-4.4ZM7.6 10.3v3.4M5.9 12h3.4" />
      <circle cx="15.6" cy="11" r=".6" />
      <circle cx="17.6" cy="13" r=".6" />
    </>
  ),
  phone: <path d="M8.6 3h6.8A1.6 1.6 0 0 1 17 4.6v14.8a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 19.4V4.6A1.6 1.6 0 0 1 8.6 3ZM10.8 18h2.4" />,
  keyboard: <path d="M4.4 6.8h15.2a1.4 1.4 0 0 1 1.4 1.4v7.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 15.8V8.2a1.4 1.4 0 0 1 1.4-1.4ZM6.6 10h.1M9.6 10h.1M12.6 10h.1M15.6 10h.1M17.6 10h.1M8.2 13.8h7.6" />,
  bot: (
    <>
      {/* petit oiseau mécanique : corps, bec, aile, clé de remontage */}
      <path d="M3.6 14.4c1.4-3 4.4-4.5 7.8-4.2l3.2-2.6.2 3.3c2.4.8 4.3 2.4 5.6 4.3-3.9 1.8-10.4 2.5-16.8-.8Z" />
      <path d="M8.5 14.3c1.8-1 3.8-1.2 5.8-.6" />
      <path d="M11.2 10.2V6.6M9 4.2c1.4 1.4 3 1.4 4.4 0" />
      <path d="M8.8 17.2l-.8 2.6M13.4 17.4l.4 2.4" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" />,
  remove: <path d="M5 12h14" />,
  close: <path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" />,
  check: <path d="M4.8 12.6l4.6 4.6L19.4 7.2" />,
  crown: <path d="M4.2 17.2L3.4 7.6l4.8 4.3L12 5.2l3.8 6.7 4.8-4.3-.8 9.6ZM4.8 20h14.4" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.4" />
      <path d={sunRays()} />
    </>
  ),
  moon: <path d="M18.6 14.8A7.6 7.6 0 0 1 9.2 5.4a7.6 7.6 0 1 0 9.4 9.4Z" />,
  feather: <path d="M19.6 4.4C12.8 4.6 7.6 9 6.9 16.1c6.4.1 11.6-4.6 12.7-11.7ZM4.4 19.6 14.6 9.4M9.2 12.4h4.2M11.4 9.8h4" />,
  quill: <path d="M20 4c-6.4.4-11 4.6-11.6 11 5.8-.2 10.4-4.4 11.6-11ZM8.4 15l-3.2 3.2M4 21h9" />,
  qr: (
    <>
      <path d="M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4Z" />
      <path d="M14 14h2.5v2.5H14ZM18 18h2v2h-2ZM14 19h1M19 14h1" />
    </>
  ),
  reconnect: <path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1M19.4 4.2v3.6h-3.6" />,
  vibration: <path d="M9.2 4.6h5.6a1.4 1.4 0 0 1 1.4 1.4v12a1.4 1.4 0 0 1-1.4 1.4H9.2A1.4 1.4 0 0 1 7.8 18V6a1.4 1.4 0 0 1 1.4-1.4ZM4.6 9v6M19.4 9v6M2.2 10.6v2.8M21.8 10.6v2.8" />,
  headphones: <path d="M4 16.5V12a8 8 0 0 1 16 0v4.5M4 14.6h2.8v5.2H5.2A1.2 1.2 0 0 1 4 18.6ZM20 14.6h-2.8v5.2h1.6a1.2 1.2 0 0 0 1.2-1.2Z" />,
  rematch: <path d="M3.5 7.4h3.2c4.2 0 5.8 9.2 10.2 9.2h3.6M3.5 16.6h3.2c4.2 0 5.8-9.2 10.2-9.2h3.6M18.2 4.8l2.6 2.6-2.6 2.6M18.2 14l2.6 2.6-2.6 2.6" />,
  quit: <path d="M10.4 4.6H5.2v14.8h5.2M14.2 8.2l3.8 3.8-3.8 3.8M17.8 12H9" />,
  back: <path d="M10 6.4 4.4 12l5.6 5.6M4.8 12h14.8" />,
  arrowRight: <path d="M14 6.4l5.6 5.6-5.6 5.6M19.2 12H4.4" />,
  enter: <path d="M19 5.5v6.2a2 2 0 0 1-2 2H6.2M9.6 10l-3.8 3.7 3.8 3.7" />,
  lang: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.8 12h16.4M12 3.6c-4.4 4.6-4.4 12.2 0 16.8M12 3.6c4.4 4.6 4.4 12.2 0 16.8" />
    </>
  ),
  shake: <path d="M7.4 5.4h9.2v13.2H7.4ZM3.6 8.4 2 10l1.6 1.6L2 13.2l1.6 1.6M20.4 8.4 22 10l-1.6 1.6L22 13.2l-1.6 1.6" />,
  flash: <path d="M13.4 3 6 13.4h5l-1.4 7.6L18 10.2h-5.2Z" />,
  hint: <path d="M12 3.6a5.8 5.8 0 0 0-3.4 10.5c.7.5 1 1.3 1 2.1v.6h4.8v-.6c0-.8.3-1.6 1-2.1A5.8 5.8 0 0 0 12 3.6ZM9.8 19.8h4.4" />,
  wifiOff: <path d="M3.4 9.2a12.8 12.8 0 0 1 17.2 0M6.4 12.4a8.4 8.4 0 0 1 11.2 0M9.4 15.6a4 4 0 0 1 5.2 0M12 18.9h.1M4 4l16 16" />,
  flag: <path d="M6 21V4M6 4.6c3.8-1.8 7.4 1.8 12 0v8.2c-4.6 1.8-8.2-1.8-12 0" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 28, stroke = 1.8, className, style, title }: { name: IconName; size?: number; stroke?: number; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  )
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[]
