// Planche de contrôle : icônes, glyphes, jetons (dev/ui.html?screen=icons).
import { PLAYER_COLORS } from '../../shared/players.ts'
import { Glyph, GLYPH_KEYS, Token } from '../../host/ui/glyphs.tsx'
import { Icon, ICON_NAMES } from '../../host/ui/icons.tsx'
import '../../host/ui/styles/base.css'

export function IconSheet() {
  return (
    <div className="ui-root" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: 'var(--paper)', padding: 40, pointerEvents: 'auto' }}>
      <h2 className="t-title" style={{ margin: '0 0 20px', fontSize: 32 }}>
        Icônes (24 px ×2)
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {ICON_NAMES.map(n => (
          <div key={n} style={{ width: 110, textAlign: 'center', fontSize: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
              <Icon name={n} size={48} />
              <Icon name={n} size={24} />
            </div>
            {n}
          </div>
        ))}
      </div>
      <h2 className="t-title" style={{ margin: '30px 0 20px', fontSize: 32 }}>
        Glyphes et jetons
      </h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {GLYPH_KEYS.map((g, i) => (
          <div key={g} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 18 }}>
            <Glyph glyph={g} size={48} />
            <Token colorIndex={i} size={56} />
            <Token colorIndex={i} size={28} />
            <Token colorIndex={i} size={24} variant="paper" />
            <span>{PLAYER_COLORS[i].name.fr}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
