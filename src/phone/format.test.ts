import { describe, expect, it } from 'vitest'
import { pluralOne, sentenceLines, splitNumbers } from './format.tsx'

describe('mise en forme du téléphone', () => {
  it('ne compose en Averia que les nombres d’un texte formaté', () => {
    expect(splitNumbers('4 piqués réussis')).toEqual([
      { text: '4', num: true },
      { text: ' piqués réussis', num: false },
    ])
    expect(splitNumbers('+2 places dans la dernière ligne droite')[0]).toEqual({ text: '+2', num: true })
    expect(splitNumbers('12,3 % du désert pris').map(p => p.num)).toEqual([true, false])
    expect(splitNumbers('12,3 % du désert pris')[0]!.text).toBe('12,3 %')
    expect(splitNumbers('Le Rapace')).toEqual([{ text: 'Le Rapace', num: false }])
  })

  it('pluriel : 0 et 1 au singulier en français, seul 1 en anglais', () => {
    expect(pluralOne(0, 'fr')).toBe(true)
    expect(pluralOne(1, 'fr')).toBe(true)
    expect(pluralOne(2, 'fr')).toBe(false)
    expect(pluralOne(0, 'en')).toBe(false)
    expect(pluralOne(1, 'en')).toBe(true)
  })

  it('cartes des règles : coupure aux frontières de phrase', () => {
    expect(sentenceLines('Pique d’en haut. À la nuit, on compte.')).toEqual(['Pique d’en haut.', 'À la nuit, on compte.'])
    expect(sentenceLines('Bas : fort. Haut : grand. Le fort gagne.')).toEqual(['Bas : fort. Haut : grand.', 'Le fort gagne.'])
    expect(sentenceLines('Ton ombre peint le sable.')).toEqual(['Ton ombre peint le sable.'])
  })
})
