// Les 3 cartes des règles (GDD §2 « La règle en 3 images »), animées en boucle, en ligne claire :
// 1. l'ombre peint ; 2. bas = fort, haut = grand, le fort gagne ; 3. piquer d'en haut, puis la nuit.
// Vue de dessus, sable clair, ombres lavande, lavis des joueurs : le joueur dans SA couleur (il peint,
// il gagne au bas, il pique), face à un rival contrasté (Lagon, ou Corail pour les teintes froides).
// Animations SMIL : trajectoires le long de chemins et traînées synchronisées dans chaque carte.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { RULE_BIRD, RULE_BIRD_MIRROR, ruleBirdShapes } from '../../shared/ruleBird.ts'
import { sentenceLines, useT } from '../format.tsx'
import { displayedColor, usePhone } from '../store.ts'

const SAND = '#F1DABE'
const SHADOW = '#A18EA1'
const INK = '#2B1D23'

/**
 * Lavis de territoire par joueur (ART_BIBLE §3.3) : « fort » à la keyframe KF16 (sable des cartes),
 * « pâle » à KF80 (bien distinct du fort à la taille d'une vignette). Index = PLAYER_COLORS.
 */
const WASH: readonly (readonly [strong: string, pale: string])[] = [
  ['#E27F5C', '#FCC6B4'], // Corail
  ['#4DC4C0', '#ACE0DD'], // Lagon
  ['#7686D7', '#C7D2FE'], // Indigo
  ['#D1AA3C', '#E6D3A3'], // Safran
  ['#68B0E9', '#B6D9F7'], // Azur
  ['#CC6474', '#FDC3C9'], // Carmin
  ['#B882C1', '#E6C9EA'], // Prune
  ['#8EC167', '#C3DEB2'], // Anis
  ['#1FA4B6', '#ABDFE7'], // Sarcelle
  ['#E991AB', '#F5C6D2'], // Rose
  ['#AEA0FD', '#D3CEFE'], // Lilas
  ['#5AA370', '#BBDFC3'], // Jade
]
const CORAIL = 0
const LAGON = 1

/** Couleurs d'une carte : le joueur (identité, lavis fort) et son rival (identité, fort, pâle). */
export interface RulePalette {
  me: string
  meStrong: string
  rival: string
  rivalStrong: string
  rivalPale: string
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Palette des cartes pour la couleur du joueur (null = Corail, comme avant le profil). */
export function rulePalette(color: number | null): RulePalette {
  const me = color !== null && PLAYER_COLORS[color] ? color : CORAIL
  // Rival : celui de Corail / Lagon dont la teinte est la plus éloignée de celle du joueur.
  const h = PLAYER_COLORS[me]!.oklch[2]
  const rival = me === CORAIL ? LAGON : me === LAGON ? CORAIL : hueGap(h, PLAYER_COLORS[CORAIL]!.oklch[2]) > hueGap(h, PLAYER_COLORS[LAGON]!.oklch[2]) ? CORAIL : LAGON
  return {
    me: PLAYER_COLORS[me]!.hex,
    meStrong: WASH[me]![0],
    rival: PLAYER_COLORS[rival]!.hex,
    rivalStrong: WASH[rival]![0],
    rivalPale: WASH[rival]![1],
  }
}
const NIGHT = '#554C70'

/** Durées de boucle (s) : 2,5 s (GDD §2) ; la carte 3 enchaîne piqué puis nuit, un peu plus longue. */
const DUR = [2.5, 2.5, 3.6] as const

/**
 * Oiseau vu de dessus, tête vers +x, couleur du joueur sur les bandes d'ailes : le pictogramme
 * partagé avec la TV (src/shared/ruleBird.ts, édit ciblé hostui H8), ramené à ≈ 23 d'envergure.
 */
const BIRD_K = 0.242
function Bird({ color, scale = 1, folded = false }: { color: string; scale?: number; folded?: boolean }) {
  const id = useId()
  const clip = (mirror?: boolean) => `${id}${mirror ? 'b' : 't'}`
  return (
    <g transform={`scale(${scale * BIRD_K}) translate(-50 -50)`} stroke={INK} strokeWidth={1.1 / BIRD_K} strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <clipPath id={clip()}>
          <path d={RULE_BIRD.wing} />
        </clipPath>
        <clipPath id={clip(true)}>
          <path d={RULE_BIRD.wing} transform={RULE_BIRD_MIRROR} />
        </clipPath>
      </defs>
      {ruleBirdShapes(folded).map((sh, k) =>
        sh.role === 'band' ? (
          <g key={k} clipPath={`url(#${clip(sh.mirror)})`}>
            <path d={sh.d} transform={sh.mirror ? RULE_BIRD_MIRROR : undefined} fill={color} stroke="none" />
          </g>
        ) : sh.circle ? (
          <circle key={k} {...sh.circle} fill={sh.role === 'eye' ? INK : color} stroke={sh.role === 'eye' ? 'none' : undefined} />
        ) : (
          <path key={k} d={sh.d} transform={sh.mirror ? RULE_BIRD_MIRROR : undefined} fill="#EDEDDF" />
        ),
      )}
      {folded ? null : (
        <g fill="none">
          <path d={RULE_BIRD.wing} />
          <path d={RULE_BIRD.wing} transform={RULE_BIRD_MIRROR} />
        </g>
      )}
    </g>
  )
}

/** Mouvement le long d'un chemin (points clés en fraction de longueur). */
function Motion({ path, dur, keyTimes, keyPoints, rotate = 'auto' }: { path: string; dur: number; keyTimes: string; keyPoints: string; rotate?: string }) {
  return <animateMotion path={path} dur={`${dur}s`} repeatCount="indefinite" keyTimes={keyTimes} keyPoints={keyPoints} calcMode="linear" rotate={rotate} />
}

/** Trait qui se dessine (stroke-dashoffset 100 → 0), pathLength = 100. */
function Draw({ dur, values, keyTimes }: { dur: number; values: string; keyTimes: string }) {
  return <animate attributeName="stroke-dashoffset" dur={`${dur}s`} repeatCount="indefinite" values={values} keyTimes={keyTimes} />
}

function Fade({ dur, values, keyTimes, discrete = false }: { dur: number; values: string; keyTimes: string; discrete?: boolean }) {
  return <animate attributeName="opacity" dur={`${dur}s`} repeatCount="indefinite" values={values} keyTimes={keyTimes} calcMode={discrete ? 'discrete' : 'linear'} />
}

function Frame({ children, label, dur }: { children: ReactNode; label: string; dur: number }) {
  return (
    <svg className="rule-card__art" viewBox="0 0 160 90" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="90" fill={SAND} />
      <g fill={INK} opacity="0.13">
        <circle cx="21" cy="13" r="0.6" />
        <circle cx="64" cy="81" r="0.6" />
        <circle cx="118" cy="11" r="0.6" />
        <circle cx="147" cy="76" r="0.6" />
        <circle cx="87" cy="30" r="0.5" />
        <circle cx="35" cy="80" r="0.5" />
        <circle cx="150" cy="30" r="0.5" />
      </g>
      <g>
        {/* fondu de fin de boucle : le recommencement ne saute pas */}
        <Fade dur={dur} values="1;1;0" keyTimes="0;0.93;1" />
        {children}
      </g>
    </svg>
  )
}

/** Carte 1 : un oiseau passe, son ombre laisse derrière elle une bande à sa couleur. */
export function Card1({ label, pal }: { label: string; pal: RulePalette }) {
  const dur = DUR[0]
  const trail = 'M10 52 C38 44 66 60 96 52 S136 42 154 48'
  const kt = '0;0.78;1'
  const kp = '0;1;1'
  return (
    <Frame label={label} dur={dur}>
      <path d={trail} stroke={pal.meStrong} strokeWidth="16" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset="100">
        <Draw dur={dur} values="100;0;0" keyTimes={kt} />
      </path>
      {/* l'ombre (qui peint) suit la bande ; l'oiseau vole au-dessus, décalé vers le soleil */}
      <ellipse rx="8.5" ry="6.5" fill={SHADOW} opacity="0.85">
        <Motion path={trail} dur={dur} keyTimes={kt} keyPoints={kp} />
      </ellipse>
      <g transform="translate(-4 -15)">
        <g>
          <Motion path={trail} dur={dur} keyTimes={kt} keyPoints={kp} />
          <Bird color={pal.me} />
        </g>
      </g>
    </Frame>
  )
}

/** Carte 2 : le bas (petite ombre forte) mord sur le pâle ; le haut (grande ombre pâle) glisse sur le fort sans l'entamer. */
export function Card2({ label, pal }: { label: string; pal: RulePalette }) {
  const dur = DUR[1]
  const low = 'M10 50 L72 50'
  const high = 'M94 50 L150 50'
  const kt = '0;0.72;1'
  const kp = '0;1;1'
  // Les ✕ apparaissent au passage de l'ombre pâle.
  const spark = (x: number) => {
    const t = ((x - 94) / (150 - 94)) * 0.72
    return `0;${t.toFixed(3)};${(t + 0.001).toFixed(3)};0.9;1`
  }
  return (
    <Frame label={label} dur={dur}>
      <path d="M5 22 C22 13 58 15 76 23 L78 74 C58 82 20 80 7 72 Z" fill={pal.rivalPale} />
      <path d="M84 22 C104 13 140 15 156 23 L156 74 C136 82 100 80 84 72 Z" fill={pal.meStrong} />
      <path d={low} stroke={pal.meStrong} strokeWidth="11" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset="100">
        <Draw dur={dur} values="100;0;0" keyTimes={kt} />
      </path>
      {/* bas : petite ombre dense juste sous l'oiseau */}
      <ellipse rx="6" ry="4.6" fill={SHADOW} opacity="0.9">
        <Motion path={low} dur={dur} keyTimes={kt} keyPoints={kp} rotate="0" />
      </ellipse>
      <g transform="translate(-2 -6)">
        <g>
          <Motion path={low} dur={dur} keyTimes={kt} keyPoints={kp} rotate="0" />
          <Bird color={pal.me} scale={0.78} />
        </g>
      </g>
      {/* haut : grande ombre pâle au liseré pointillé, oiseau loin au-dessus */}
      <ellipse rx="15" ry="11" fill={SHADOW} opacity="0.42" stroke={pal.rival} strokeWidth="1.2" strokeDasharray="2.4 2">
        <Motion path={high} dur={dur} keyTimes={kt} keyPoints={kp} rotate="0" />
      </ellipse>
      <g transform="translate(-9 -30)">
        <g>
          <Motion path={high} dur={dur} keyTimes={kt} keyPoints={kp} rotate="0" />
          <Bird color={pal.rival} scale={1.3} />
        </g>
      </g>
      <g stroke={INK} strokeWidth="1.5" strokeLinecap="round">
        {[104, 119, 134].map((x, i) => (
          <path key={x} d={`M${x} ${48 + (i % 2) * 5} l4 4 m0 -4 l-4 4`} opacity="0">
            <Fade dur={dur} values="0;0;1;1;0" keyTimes={spark(x)} />
          </path>
        ))}
      </g>
    </Frame>
  )
}

/** Carte 3 : un oiseau haut replie ses ailes et fond sur un oiseau bas ; la traînée change de couleur. Puis la nuit. */
export function Card3({ label, pal }: { label: string; pal: RulePalette }) {
  const dur = DUR[2]
  const victim = 'M8 64 L98 64'
  const hunter = 'M12 12 L48 14 L94 58 L122 40'
  const hit = 0.4
  return (
    <Frame label={label} dur={dur}>
      <path d={victim} stroke={pal.rivalStrong} strokeWidth="12" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset="100">
        <Draw dur={dur} values="100;0;0" keyTimes={`0;${hit};1`} />
      </path>
      {/* vol de traînée : la vague de couleur remonte la traînée depuis l'impact */}
      <path d="M98 64 L8 64" stroke={pal.meStrong} strokeWidth="12.6" fill="none" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset="100">
        <Draw dur={dur} values="100;100;0;0" keyTimes={`0;${hit + 0.03};${hit + 0.2};1`} />
      </path>
      {/* victime : peint bas, puis décroche (vrille) */}
      <ellipse rx="6" ry="4.6" fill={SHADOW} opacity="0.9">
        <Motion path={victim} dur={dur} keyTimes={`0;${hit};1`} keyPoints="0;1;1" rotate="0" />
      </ellipse>
      <g transform="translate(-2 -5)">
        <g>
          <Motion path={victim} dur={dur} keyTimes={`0;${hit};1`} keyPoints="0;1;1" rotate="0" />
          <g>
            <animateTransform attributeName="transform" type="rotate" dur={`${dur}s`} repeatCount="indefinite" values="0;0;540;540" keyTimes={`0;${hit};${hit + 0.18};1`} />
            <Bird color={pal.rival} scale={0.78} />
          </g>
        </g>
      </g>
      {/* chasseur : plane, replie les ailes, fond sur la cible, rebondit */}
      <g>
        <Motion path={hunter} dur={dur} keyTimes={`0;0.18;${hit};${hit + 0.12};1`} keyPoints="0;0.28;0.76;1;1" />
        <g>
          <Fade dur={dur} values="1;0;1" keyTimes={`0;0.18;${hit}`} discrete />
          <Bird color={pal.me} scale={1.3} />
        </g>
        <g opacity="0">
          <Fade dur={dur} values="0;1;0" keyTimes={`0;0.18;${hit}`} discrete />
          <Bird color={pal.me} scale={1.3} folded />
        </g>
      </g>
      {/* éclaboussure d'encre à l'impact */}
      <g transform="translate(98 60)">
        <path d="M0 -12 L2.6 -3.2 L11 -6.5 L4.2 0 L12 5.5 L2.6 3.6 L0 12 L-2.6 3.6 L-11 6.5 L-4.2 0 L-12 -5.5 L-2.6 -3.2 Z" fill={INK} opacity="0">
          <Fade dur={dur} values="0;0;1;1;0;0" keyTimes={`0;${hit};${hit + 0.01};${hit + 0.12};${hit + 0.2};1`} />
          <animateTransform attributeName="transform" type="scale" dur={`${dur}s`} repeatCount="indefinite" values="0.3;0.3;1.2;1;1" keyTimes={`0;${hit};${hit + 0.04};${hit + 0.1};1`} />
        </path>
      </g>
      {/* la nuit balaie le désert d'ouest en est */}
      <g>
        <animateTransform attributeName="transform" type="translate" dur={`${dur}s`} repeatCount="indefinite" values="-12 0;-12 0;178 0;178 0" keyTimes="0;0.64;0.9;1" />
        <rect x="-176" y="0" width="176" height="90" fill={NIGHT} opacity="0.74" />
        <path d="M0 0 L3.5 12 L-1.5 25 L4.5 38 L0 52 L5 66 L-1 78 L2.5 90 L0 90 Z" fill={NIGHT} opacity="0.74" />
        <path d="M3.5 12 L-1.5 25 L4.5 38 L0 52 L5 66 L-1 78" stroke="#FFF2C3" strokeWidth="1.2" fill="none" opacity="0.9" />
        <circle cx="-130" cy="16" r="1.1" fill="#FFF2C3" />
        <circle cx="-72" cy="28" r="0.9" fill="#FFF2C3" />
        <circle cx="-34" cy="11" r="1.1" fill="#FFF2C3" />
        <circle cx="-104" cy="44" r="0.8" fill="#FFF2C3" />
      </g>
    </Frame>
  )
}

const CARDS = [Card1, Card2, Card3]

export function RuleCard({ index }: { index: number }) {
  const t = useT()
  const color = usePhone(displayedColor)
  const Art = CARDS[index] ?? Card1
  const text = t(`phone.card.${index + 1}`)
  // Une phrase par ligne (« Pique d'en haut. » / « À la nuit, on compte. »), jamais « À la / nuit ».
  const lines = sentenceLines(text)
  return (
    <figure className="rule-card" style={{ margin: 0 }}>
      <Art label={text} pal={rulePalette(color)} />
      <figcaption className="rule-card__text">
        {lines.map((line, j) => (
          <span key={j} className="rule-card__line">
            {j === 0 && <span className="rule-card__num">{index + 1}.</span>} {line}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/** Les trois cartes tour à tour, avec points de pagination (deux boucles d'animation par carte). */
export function RulesCarousel({ interactive = false }: { interactive?: boolean }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setI(v => (v + 1) % 3), DUR[i % 3]! * 2000)
    return () => clearTimeout(id)
  }, [i])
  return (
    <div className="lobby-cards" onPointerDown={interactive ? () => setI(v => (v + 1) % 3) : undefined} style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      <RuleCard key={i} index={i} />
      <div className="carousel-dots" aria-hidden="true">
        {[0, 1, 2].map(k => (
          <i key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
    </div>
  )
}
