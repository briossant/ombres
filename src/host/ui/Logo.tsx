// Logotype « OMBRES » (ART_BIBLE §8.1) : capitales larges d'après Julius Sans
// One, épaissies (trait papier bordé de 3 px d'encre), dressées sur l'horizon
// d'une case de BD (ciel de papier, bande de désert) ; chaque lettre projette
// une ombre plate `castShadow` qui s'allonge et tourne avec un soleil fictif
// (dessiné dans la case) en 12 s. Boil du trait à 8 images/s.
// Logo vivant (polish H15) : quand une simulation tourne derrière (démo du titre),
// les ombres des lettres suivent SON soleil (élévation, azimut) à 10 Hz ; au coucher
// de la démo, elles s'allongent et virent au violet. Sans simulation, soleil fictif.
import { useEffect, useRef } from 'react'
import { worldView } from '../render/worldView.ts'
import { gameView } from '../view.ts'
import { mixHex } from './color.ts'

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

/** Soleil de la démo (ou imposé par la mise en scène), ramené à la plage lisible du logo ; null sans simulation. */
const LOGO_ELEV_MAX = 62
function liveSun(): { elevDeg: number; az: number; realElevDeg: number } | null {
  const o = worldView.sunOverride
  const sun = gameView.sim?.sun
  if (!o && !sun) return null
  const realElevDeg = o ? o.elevDeg : ((sun?.elevation ?? 0) * 180) / Math.PI
  const azRad = o ? (o.azDeg * Math.PI) / 180 : (sun?.azimuth ?? 0)
  // soleil haut : ombres courtes mais présentes ; soleil bas : longues lames (bornées à la case)
  const elevDeg = Math.max(ELEV_MIN - 2, Math.min(LOGO_ELEV_MAX, realElevDeg))
  return { elevDeg, az: 0.95 + 0.3 * Math.sin(azRad), realElevDeg }
}

/** Ombre des lettres : lavande le jour, violet profond au coucher (de 16° à 6° de soleil réel). */
const SHADOW_DAY = '#9C88A0'
const SHADOW_DUSK = '#4E3B7E'
const shadowColor = (realElevDeg: number) => mixHex(SHADOW_DAY, SHADOW_DUSK, Math.min(1, Math.max(0, (16 - realElevDeg) / 10)))

function shadowMatrix(t: number, sun = sunAt(t)): string {
  const { elevDeg, az } = sun
  const cot = 1 / Math.tan((elevDeg * Math.PI) / 180)
  const kx = cot * Math.cos(az) * 0.5
  const ky = cot * Math.sin(az) * 0.3
  // matrix(a b c d e f) : x' = a x + c y + e ; y' = b x + d y + f
  return `matrix(1 0 ${(-kx).toFixed(4)} ${(-ky).toFixed(4)} ${(kx * BASE).toFixed(2)} ${(BASE * (1 + ky)).toFixed(2)})`
}

/** Hauteur du disque dans le ciel de la case : il touche presque l'horizon quand le soleil est au plus bas. */
const sunY = (t: number, sun = sunAt(t)) => {
  const k = Math.min(1, Math.max(0, (sun.elevDeg - ELEV_MIN) / (LOGO_ELEV_MAX - ELEV_MIN)))
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
    let lastSun = -Infinity
    const shadowTexts = [...shadow.querySelectorAll('text')]
    const rnd = rng(11)
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const t = (now - t0) / 1000
      const live = liveSun()
      if (!live) {
        shadow.setAttribute('transform', shadowMatrix(t))
        sun.setAttribute('cy', sunY(t))
      } else if (now - lastSun >= 100) {
        // soleil de la démo : 10 Hz suffisent (il avance de moins d'un degré par seconde)
        lastSun = now
        shadow.setAttribute('transform', shadowMatrix(t, live))
        sun.setAttribute('cy', sunY(t, live))
        const c = shadowColor(live.realElevDeg)
        for (const el of shadowTexts) {
          el.setAttribute('fill', c)
          el.setAttribute('stroke', c)
        }
      }
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
