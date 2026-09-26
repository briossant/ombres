// Logotype « OMBRES » (ART_BIBLE §8.1) : capitales larges d'après Julius Sans
// One, épaissies (trait papier bordé de 3 px d'encre), dressées sur l'horizon
// d'une case de BD (ciel de papier, bande de désert) ; chaque lettre projette
// une ombre plate `castShadow` qui s'allonge et tourne avec un soleil fictif
// (dessiné dans la case) en 12 s. Boil du trait à 8 images/s.
import { useEffect, useRef } from 'react'

const WORD = 'OMBRES'
const FONT_SIZE = 168
/** Largeur approximative du mot (px de conception), ligne de base. */
const W = 880
const BASE = 196
/** Hauteur de la bande de sable sous les lettres. */
const BAND = 86
const CYCLE_S = 12
const BOIL_FPS = 8

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Projection plate de l'ombre sur le sol, vers le spectateur et la droite :
 * (x, y) → (x + kx·(B − y), B + ky·(B − y)), ancrée sur la ligne de base B.
 */
/** Soleil fictif à l'instant t : élévation entre 8° et 24° (ombres toujours longues), azimut qui balance. */
const ELEV_MIN = 8
const ELEV_SPAN = 16
function sunAt(t: number): { elevDeg: number; az: number } {
  const ph = (2 * Math.PI * t) / CYCLE_S
  return { elevDeg: ELEV_MIN + (ELEV_SPAN / 2) * (1 - Math.cos(ph)), az: 0.95 + 0.25 * Math.sin(ph) }
}

function shadowMatrix(t: number): string {
  const { elevDeg, az } = sunAt(t)
  const cot = 1 / Math.tan((elevDeg * Math.PI) / 180)
  const kx = cot * Math.cos(az) * 0.5
  const ky = cot * Math.sin(az) * 0.3
  // matrix(a b c d e f) : x' = a x + c y + e ; y' = b x + d y + f
  return `matrix(1 0 ${(-kx).toFixed(4)} ${(-ky).toFixed(4)} ${(kx * BASE).toFixed(2)} ${(BASE * (1 + ky)).toFixed(2)})`
}

/** Hauteur du disque dans le ciel de la case : il touche presque l'horizon quand le soleil est au plus bas. */
const sunY = (t: number) => {
  const k = (sunAt(t).elevDeg - ELEV_MIN) / ELEV_SPAN
  return (BASE - 26 - (BASE - 26 - 6) * k).toFixed(1)
}

export function Logo({ animate = true, className }: { animate?: boolean; className?: string }) {
  const shadowRef = useRef<SVGGElement>(null)
  const lettersRef = useRef<SVGGElement>(null)
  const sunRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const shadow = shadowRef.current
    const letters = lettersRef.current
    const sun = sunRef.current
    if (!shadow || !letters || !sun) return
    const texts = [...letters.querySelectorAll('text'), ...shadow.querySelectorAll('text')]
    const t0 = performance.now() - 2000
    shadow.setAttribute('transform', shadowMatrix(2))
    sun.setAttribute('cy', sunY(2))
    if (!animate) return
    let raf = 0
    let lastBoil = -1
    const rnd = rng(11)
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const t = (now - t0) / 1000
      shadow.setAttribute('transform', shadowMatrix(t))
      sun.setAttribute('cy', sunY(t))
      const frame = Math.floor(t * BOIL_FPS)
      if (frame !== lastBoil) {
        lastBoil = frame
        // Boil : micro-rotations par lettre, identiques pour toutes les couches.
        const rot: string[] = []
        for (let i = 0; i < WORD.length; i++) rot.push(((rnd() - 0.5) * 1.1).toFixed(2))
        const r = rot.join(' ')
        for (const el of texts) el.setAttribute('rotate', r)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animate])

  const textProps = {
    x: 0,
    y: BASE,
    fontFamily: 'Julius Sans One',
    fontSize: FONT_SIZE,
    textLength: W,
    lengthAdjust: 'spacing' as const,
  }
  // Case de BD : ciel de papier, bande de désert sous l'horizon (le « sol » des lettres).
  const L = -64
  const R = W + 64
  const TOP = -36
  const BOTTOM = BASE + BAND
  const frame = `M${L} ${TOP}L${R} ${TOP}L${R} ${BOTTOM}L${L} ${BOTTOM}Z`
  const ground = `M${L} ${BASE}L${R} ${BASE}L${R} ${BOTTOM}L${L} ${BOTTOM}Z`

  return (
    <svg className={className ? `logo ${className}` : 'logo'} viewBox={`${L - 6} ${TOP - 6} ${R - L + 20} ${BOTTOM - TOP + 22}`} width={R - L + 20} height={BOTTOM - TOP + 22} role="img" aria-label="Ombres">
      <defs>
        <clipPath id="logo-ground">
          <path d={ground} />
        </clipPath>
      </defs>
      {/* Case : ombre décalée pleine, papier, désert */}
      <path d={frame} transform="translate(8 8)" fill="var(--drop)" />
      <path d={frame} fill="var(--paper)" />
      <path d={ground} fill="#EFD5AE" />
      {/* Soleil fictif : il descend quand les ombres s'allongent */}
      <circle ref={sunRef} cx={L + 34} cy={40} r={15} fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.4} />
      {/* Ombres portées des lettres, plates, sans flou, sur le sable seulement */}
      <g clipPath="url(#logo-ground)">
        <g ref={shadowRef}>
          <text {...textProps} fill="#9C88A0" stroke="#9C88A0" strokeWidth={22} strokeLinejoin="round">
            {WORD}
          </text>
        </g>
        {/* Cailloux, pour l'échelle */}
        <path d={`M${W * 0.2} ${BASE + BAND * 0.72}q5 -6 11 0z`} fill="#C9A98E" stroke="var(--ink)" strokeWidth={1.6} />
        <path d={`M${W * 0.83} ${BASE + BAND * 0.58}q4 -5 9 0z`} fill="#C9A98E" stroke="var(--ink)" strokeWidth={1.5} />
      </g>
      {/* Horizon et bord de case tracés à la main (débords aux coins) */}
      <path d={`M${L - 4} ${BASE + 0.8}L${R + 3} ${BASE - 0.6}`} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" fill="none" />
      <g stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" fill="none">
        <path d={`M${L - 6} ${TOP + 0.5}L${R + 5} ${TOP - 0.5}`} />
        <path d={`M${R + 0.5} ${TOP - 5}L${R - 0.5} ${BOTTOM + 4}`} />
        <path d={`M${R + 4} ${BOTTOM + 0.5}L${L - 5} ${BOTTOM - 0.4}`} />
        <path d={`M${L - 0.4} ${BOTTOM + 5}L${L + 0.5} ${TOP - 4}`} />
      </g>
      {/* Lettres : encre (bord) puis papier (corps) */}
      <g ref={lettersRef}>
        <text {...textProps} fill="var(--ink)" stroke="var(--ink)" strokeWidth={23} strokeLinejoin="round">
          {WORD}
        </text>
        <text {...textProps} fill="var(--paper)" stroke="var(--paper)" strokeWidth={16} strokeLinejoin="round">
          {WORD}
        </text>
        <text {...textProps} fill="none" stroke="var(--ink)" strokeWidth={1.2} opacity={0.3}>
          {WORD}
        </text>
      </g>
    </svg>
  )
}
