// Annonces du HUD : compte à rebours « 3, 2, 1, Envol ! », « 5 4 3 2 1 » de
// fin (tampon), bannières de phase, sous-titres du narrateur (récitatif).
import { Fragment } from 'react'
import { getLang, t } from '../../../shared/i18n.ts'
import { colorName, PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { useSettings } from '../../settings.ts'
import { Glyph, glyphKeyForColor } from '../glyphs.tsx'
import { useHud } from '../viewModel.ts'

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

export function Banner() {
  const b = useHud(s => s.banner)
  if (!b) return null
  return (
    <div className="banner-wrap" key={b.id}>
      <div className={b.tone === 'alert' ? 'banner banner--alert wipe' : 'banner wipe'}>
        <div className="banner__title t-title">{t(b.key, b.params)}</div>
        {b.subKey ? <div className="banner__sub">{t(b.subKey, b.params)}</div> : null}
      </div>
    </div>
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

export function Subtitle() {
  const sub = useHud(s => s.subtitle)
  const mode = useSettings(s => s.narrator)
  if (!sub || mode === 'off') return null
  const raw = sub.key ? t(sub.key) : (sub.text ?? '')
  return (
    <div className="subtitle-wrap" key={sub.id}>
      <p className="recitatif wipe" style={{ fontSize: RULES.subtitlePx }}>
        {withColor(raw, sub.colorIndex)}
      </p>
    </div>
  )
}
