// Annonces du HUD : compte à rebours « 3, 2, 1, Envol ! », « 5 4 3 2 1 » de
// fin (tampon), bannières de phase, sous-titres du narrateur (récitatif).
import { Fragment } from 'react'
import { getLang, t } from '../../../shared/i18n.ts'
import { colorName, PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { useSettings } from '../../settings.ts'
import { Glyph, glyphKeyForColor } from '../glyphs.tsx'
import { useHud, type BannerArrow, type BannerVM } from '../viewModel.ts'

export function Countdown() {
  const n = useHud(s => s.countdown)
  if (n === null) return null
  return (
    <div className="countdown" aria-live="assertive">
      {n > 0 ? (
        <span className="countdown__disc t-num stamp" key={n}>
          {n}
        </span>
      ) : (
        <span className="countdown__go t-title stamp" key="go">
          {t('host.countdown.go')}
        </span>
      )}
    </div>
  )
}

export function LastSeconds() {
  const n = useHud(s => s.lastSeconds)
  if (n === null) return null
  return (
    <div className="last-seconds" aria-live="assertive">
      <span className="last-seconds__disc t-num stamp" key={n}>
        {n}
      </span>
    </div>
  )
}

/**
 * Bannière de phase. `layout` : la case centrale (défaut) ou le bandeau fin sous
 * la bande de sable (Grande Ombre : hors de l'arène, la nuit reste le sujet).
 */
export function Banner({ layout = 'case' }: { layout?: NonNullable<BannerVM['layout']> }) {
  const b = useHud(s => s.banner)
  if (!b || (b.layout ?? 'case') !== layout) return null
  const cls = ['banner', b.tone === 'alert' ? 'banner--alert' : '', layout === 'strip' ? 'banner--strip' : '', 'wipe'].filter(Boolean).join(' ')
  return (
    <div className={layout === 'strip' ? 'banner-wrap banner-wrap--strip' : 'banner-wrap'} key={b.id}>
      <div className={cls}>
        <div className="banner__title t-title">{t(b.key, b.params)}</div>
        {b.subKey ? (
          <div className="banner__sub">
            {b.arrow ? <BannerArrowMark arrow={b.arrow} /> : null}
            <span>{t(b.subKey, b.params)}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Flèche d'indication de la bannière : ↕ (voler nord-sud, en travers des ombres) ou → (vers l'est). */
function BannerArrowMark({ arrow }: { arrow: BannerArrow }) {
  return (
    <svg className={`banner__arrow banner__arrow--${arrow}`} width={34} height={34} viewBox="0 0 34 34" aria-hidden>
      {arrow === 'northSouth' ? (
        <path d="M17 4V30M9.5 11.5L17 4L24.5 11.5M9.5 22.5L17 30L24.5 22.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M4 17H29M21 9L29 17L21 25" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

/**
 * Nom de couleur stylé : pastille de la teinte (glyphe en mode daltonien), nom
 * dans la variante « texte sur papier » de la couleur. `label` remplace le nom
 * de couleur (ex. nom choisi par le joueur).
 */
export function ColorName({ colorIndex, label }: { colorIndex: number; label?: string }) {
  const cb = useSettings(s => s.colorblind)
  const c = PLAYER_COLORS[colorIndex]
  if (!c) return null
  return (
    <span className="cname">
      <span className="cname__swatch" style={{ background: c.hex }}>
        {cb ? <Glyph glyph={glyphKeyForColor(colorIndex)} size={16} /> : null}
      </span>
      <span className="cname__text" style={{ color: c.text }}>
        {label ?? colorName(colorIndex, getLang())}
      </span>
    </span>
  )
}

/** Remplace `{color}` dans un texte par le nom stylé. */
export function withColor(text: string, colorIndex: number | null, label?: string) {
  if (colorIndex === null || !text.includes('{color}')) return text
  const parts = text.split('{color}')
  return parts.map((p, k) => (
    <Fragment key={k}>
      {p}
      {k < parts.length - 1 ? <ColorName colorIndex={colorIndex} label={label} /> : null}
    </Fragment>
  ))
}

/**
 * Sous-titre du narrateur. Changement de langue en cours de réplique : une réplique à clé est
 * retraduite (texte et nom de couleur basculent ensemble) ; un texte figé (réplique voisée) finit
 * dans sa langue, nom de couleur compris — jamais « Crimson, le désert retiendra cette couleur ».
 */
export function Subtitle() {
  const sub = useHud(s => s.subtitle)
  const mode = useSettings(s => s.narrator)
  if (!sub || mode === 'off') return null
  const raw = sub.key ? t(sub.key) : (sub.text ?? '')
  const pinned = !sub.key && sub.lang ? sub.lang : undefined
  const label = pinned && sub.colorIndex !== null ? colorName(sub.colorIndex, pinned) : undefined
  return (
    <div className="subtitle-wrap" key={sub.id}>
      <p className="recitatif wipe" style={{ fontSize: RULES.subtitlePx }} lang={pinned}>
        {withColor(raw, sub.colorIndex, label)}
      </p>
    </div>
  )
}
