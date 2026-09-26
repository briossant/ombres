import type { StringTable } from './index.ts'

// Chaînes du domaine « hints ». Clés préfixées par « hints. ».
// Indications contextuelles (GDD §15.4), affichées en bulle près de l'oiseau (TV) et sur le téléphone.
// {dive} et {flap} : libellé des boutons (hints.btn.* par défaut, touche du clavier sinon) ;
// {color} : nom de couleur (nom propre nu, sans article).
export const hints: StringTable = {
  fr: {
    'hints.holdDive': 'Maintiens {dive} : ombre petite et forte.',
    'hints.releaseClimb': 'Relâche {dive} : tu remontes, ombre grande.',
    'hints.firstLock': '{color} est sous toi. {dive} pour piquer !',
    'hints.dodge': 'Au clac : {flap} !',
    'hints.paleOnStrong': 'Trop pâle pour ce sable. Descends.',
    'hints.towerShade': 'Ombre de tour : sable figé, et tu es invisible.',
    'hints.aimShadow': 'Vise avec ton ombre.',
    'hints.crown': 'La couronne : la piquer vole deux fois plus.',
    'hints.golden': 'Vole en travers des ombres pour balayer large.',
    'hints.greatShadow': 'La nuit fige le sable. File vers l’est →',
    'hints.btn.dive': 'PLONGER',
    'hints.btn.flap': 'COUP D’AILE',
  },
  en: {
    'hints.holdDive': 'Hold {dive}: small, strong shadow.',
    'hints.releaseClimb': 'Release {dive}: you climb, wide shadow.',
    'hints.firstLock': '{color} is below you. {dive} to strike!',
    'hints.dodge': 'On the snap: {flap}!',
    'hints.paleOnStrong': 'Too pale for this sand. Go low.',
    'hints.towerShade': 'Tower shade: sand frozen, and you’re hidden.',
    'hints.aimShadow': 'Aim with your shadow.',
    'hints.crown': 'The crown: diving on it steals double.',
    'hints.golden': 'Fly across the shadows to sweep wide.',
    'hints.greatShadow': 'Night freezes the sand. Head east →',
    'hints.btn.dive': 'DIVE',
    'hints.btn.flap': 'WINGBEAT',
  },
}
