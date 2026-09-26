// Roster : attribution des couleurs (ART_BIBLE §3.2) — les humains avant les bots.
import { describe, expect, it } from 'vitest'
import { Roster, type Player } from './players.ts'

function add(r: Roster, slot: number, kind: Player['kind']): Player {
  return r.add({ slot, colorIndex: r.pickColor(null), name: '', kind, phoneId: kind === 'phone' ? `p${slot}` : null, group: kind === 'keyboard' ? 1 : null, bot: kind === 'bot' ? { personality: 'falcon', level: 1 } : null, assist: false, profileSet: true, ready: false, vote: null, pending: false, auto: kind === 'bot' })
}

describe('Roster — couleurs', () => {
  it('le premier humain reçoit Corail (0), même déjà inscrit avec sa couleur provisoire', () => {
    const r = new Roster()
    const p = add(r, 0, 'keyboard')
    expect(r.claimColor(p, r.humanColor(p))).toBe(true)
    expect(p.colorIndex).toBe(0)
  })
  it('un humain prend la couleur d’un bot, qui passe à la première libre', () => {
    const r = new Roster()
    const b = add(r, 0, 'bot') // Corail
    const p = add(r, 1, 'phone') // provisoire : Lagon
    r.claimColor(p, r.humanColor(p))
    expect(p.colorIndex).toBe(0)
    expect(b.colorIndex).toBe(1)
  })
  it('deux humains : Corail puis Lagon', () => {
    const r = new Roster()
    const a = add(r, 0, 'keyboard')
    r.claimColor(a, r.humanColor(a))
    const b = add(r, 1, 'phone')
    r.claimColor(b, r.humanColor(b))
    expect([a.colorIndex, b.colorIndex]).toEqual([0, 1])
  })
})
