// Nom + couleur : 12 jetons avec glyphes (les 6 premiers, les plus distincts, en haut),
// couleurs prises barrées, couleur proposée par défaut (première libre ou préférence),
// nom tiré au hasard et modifiable. Le fond prend tout de suite la couleur choisie.
import { useMemo, useState } from 'react'
import { NAME_MAX_LENGTH } from '../../shared/messages.ts'
import { PLAYER_COLORS, colorName } from '../../shared/players.ts'
import { sendProfile, setAssist } from '../link.ts'
import { playerVars, useLang, useT } from '../format.tsx'
import { displayedColor, usePhone } from '../store.ts'
import { Token } from '../ui/Glyph.tsx'
import { IconDice, IconFeather } from '../ui/Icons.tsx'
import { Wash } from '../ui/Wash.tsx'

export function randomName(list: string, avoid?: string): string {
  const names = list.split(',').map(s => s.trim()).filter(Boolean)
  const pool = names.filter(n => n !== avoid)
  return pool[Math.floor(Math.random() * pool.length)] ?? 'Mirage'
}

export function ProfileScreen({ asSheet = false, onDone }: { asSheet?: boolean; onDone?: () => void }) {
  const t = useT()
  const lang = useLang()
  const view = usePhone(s => s.view)
  const prefsName = usePhone(s => s.prefs.name)
  const assist = usePhone(s => s.prefs.assist)
  const initialColor = usePhone(displayedColor)
  const taken = useMemo(() => new Set(view?.lobby?.taken ?? []), [view?.lobby?.taken])
  const [name, setName] = useState(() => {
    if (view?.you.profileSet) return view.you.name
    return prefsName ?? randomName(t('phone.names'))
  })
  const firstFree = PLAYER_COLORS.find(c => !taken.has(c.index))?.index ?? 0
  const [color, setColor] = useState<number>(() => (initialColor !== null && !taken.has(initialColor) ? initialColor : firstFree))
  const chosen = taken.has(color) ? firstFree : color
  const valid = name.trim().length > 0

  const submit = () => {
    if (!valid) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    sendProfile(name, chosen)
    onDone?.()
  }

  return (
    <div className={asSheet ? 'sheet' : 'screen'} style={{ ...playerVars(chosen), padding: asSheet ? undefined : 0 }}>
      {!asSheet && <Wash color={chosen} />}
      <form
        className="case case--title panel profile scrollable"
        onSubmit={e => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="profile__col profile__main">
          <h1 className="t-title">{t('phone.profile.title')}</h1>
          <label className="profile__label" htmlFor="phone-name">
            {t('phone.profile.name')}
          </label>
          <div className="name-row">
            <input
              id="phone-name"
              className="name-input"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="nickname"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={e => setName(e.target.value)}
            />
            <button type="button" className="icon-btn icon-btn--square" aria-label={t('phone.profile.reroll')} onClick={() => setName(randomName(t('phone.names'), name))}>
              <IconDice size={26} />
            </button>
          </div>
        </div>
        <div className="profile__col profile__side">
          <div className="profile__label">{t('phone.profile.color')}</div>
          <div className="swatches" role="radiogroup" aria-label={t('phone.profile.color')}>
            {PLAYER_COLORS.map(c => {
              const isTaken = taken.has(c.index)
              return (
                <button
                  key={c.index}
                  type="button"
                  role="radio"
                  aria-checked={c.index === chosen}
                  aria-label={`${colorName(c.index, lang)}${isTaken ? ` (${t('phone.profile.taken')})` : ''}`}
                  className={`swatch ${c.index === chosen ? 'is-selected' : ''} ${isTaken ? 'is-taken' : ''}`}
                  disabled={isTaken}
                  onClick={() => setColor(c.index)}
                >
                  <Token index={c.index} size={48} />
                </button>
              )
            })}
          </div>
          {/* L'aide au vol se choisit dès l'arrivée (enfants, débutants) ; elle reste dans les réglages. */}
          <button type="button" role="switch" aria-checked={assist} className={`toggle toggle--compact ${assist ? 'is-on' : ''}`} onClick={() => setAssist(!assist)}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <IconFeather size={22} />
              {t('phone.settings.assist')}
            </span>
            <span className="toggle__sw" />
          </button>
          <p className="setting__desc">{t('phone.settings.assist.desc')}</p>
        </div>
        {/* Pied : après le choix de la couleur (en portrait, il passe sous les couleurs). */}
        <div className="profile__col profile__foot">
          <p className="profile__hint">
            {t('phone.profile.hint', { color: colorName(chosen, lang) })
              .split(colorName(chosen, lang))
              .flatMap((part, i) => (i === 0 ? [part] : [<b key={i} className="swatch-name">{colorName(chosen, lang)}</b>, part]))}
          </p>
          <button type="submit" className={`btn btn--primary profile__go ${valid ? '' : 'is-disabled'}`} disabled={!valid}>
            {asSheet ? t('phone.profile.save') : t('phone.profile.go')}
          </button>
        </div>
      </form>
    </div>
  )
}
