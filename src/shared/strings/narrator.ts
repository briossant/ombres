import type { StringTable } from './index.ts'

// Chaînes du domaine « narrator ». Clés préfixées par « narrator. ».
// Répliques du narrateur (GDD §16.4, réécrites pour la voix — docs/agent-notes/director.md).
// Chaque texte est aussi ce que dit la voix : toute modification doit être suivie de
// `pnpm tsx tools/tts/narrator-lines.ts` puis d'une régénération (tools/tts/README.md).
//
// Règles d'écriture (GDD §16.2, docs/research/tts.md §6) :
// - {color} est un nom propre nu : jamais d'article, d'adjectif, de participe avec « être »
//   ni de pronom qui s'y rapporte ; jamais « de {color} » ni « que {color} » ;
// - une seule couleur, jamais en dernier mot (le TTS avale le mot final) ;
// - moins de 3 s à l'oral : deux phrases courtes au plus.
export const narrator: StringTable = {
  fr: {
    // Structure de partie
    'narrator.matchOpen': 'Midi. Le sable n’est encore à personne.',
    'narrator.roundOpen1': 'Le sable a tout oublié. Pas vous.',
    'narrator.roundOpen2': 'Encore midi. Le vent a fait le ménage.',
    'narrator.roundOpen3': 'Le désert est neuf. Vos ombres, non.',
    'narrator.lastRound': 'Le dernier soleil vaut double. Il le sait.',

    // Piqués
    'narrator.firstHit': '{color} ouvre les hostilités.',
    'narrator.hitHunter': '{color} tombe du ciel. Quelqu’un a mal.',
    'narrator.hitVictim': '{color} en voit de toutes les couleurs.',
    'narrator.doubleHit': 'Deux d’un coup. {color} a de l’appétit.',
    'narrator.huntStreak': '{color} chasse encore. Surveillez le ciel.',
    'narrator.dodge': '{color} esquive. Le chasseur n’attrape que du vent.',
    'narrator.miss': '{color} finit dans le sable. On n’a rien vu.',

    // Couronne et meneur
    'narrator.firstCrown': 'La couronne est à {color}. Elle se voit de loin.',
    'narrator.leaderChange1': '{color} prend la tête. Le désert oublie vite.',
    'narrator.leaderChange2': '{color} passe devant. Le soleil s’en doutait.',
    'narrator.leaderChange3': 'Le désert passe à {color}. Pour l’instant.',
    'narrator.leaderChange4': '{color} mène la danse. Les dunes suivent.',
    'narrator.crownDown': 'Même les rois tombent. {color} vous le dira.',

    // Territoire
    'narrator.bigSteal': '{color} vient d’avaler un morceau de désert.',
    'narrator.bigStealVictim': 'Une ombre passe, et {color} perd du terrain.',
    'narrator.trailSteal': 'Toute une traînée passe à {color}, sans discuter.',
    'narrator.hugeSweep': 'Une ombre, et tout le désert change d’avis.',
    'narrator.runaway': '{color} s’installe. Quelqu’un va réagir ?',

    // Comportements
    'narrator.hiddenLong': '{color} reste à l’abri. C’est plus prudent.',
    'narrator.storm': '{color} défie la tempête. Mauvaise idée.',
    'narrator.idle': '{color} admire la vue. Une stratégie.',

    // Horloge solaire
    'narrator.golden1': 'C’est l’heure dorée. Les ombres voient grand.',
    'narrator.golden2': 'Le soleil descend. Vos ombres grandissent.',
    'narrator.golden3': 'Le soleil fatigue. Les ombres, jamais.',
    'narrator.sunset1': 'Les ombres s’étirent. Visez avec elles.',
    'narrator.sunset2': 'Le couchant. Les ombres traversent le désert.',
    'narrator.sunset3': 'Le soleil baisse. Les ombres s’allongent.',
    'narrator.greatShadow1': 'La nuit tombe de la falaise. Elle glace tout.',
    'narrator.greatShadow2': 'La nuit avance. Elle ne rend rien.',
    'narrator.greatShadow3': 'La falaise lâche son ombre. Dépêchez-vous.',
    'narrator.tenSeconds1': 'Dix secondes. Ensuite, plus rien ne bouge.',
    'narrator.tenSeconds2': 'Dix secondes. Le désert retient son souffle.',
    'narrator.tenSeconds3': 'Dix secondes. Tout peut encore basculer.',
    'narrator.photoFinish1': 'Très serré. Tout se joue au dernier rayon.',
    'narrator.photoFinish2': 'Coude à coude. La nuit départagera.',

    // Résultats de manche
    'narrator.tie': 'Égalité. Le désert refuse de choisir.',
    'narrator.landslide': '{color} a tout pris. Le désert s’incline.',
    'narrator.closeFinish1': 'Une poignée d’écart. Les dunes en parleront.',
    'narrator.closeFinish2': 'Un grain de sable a tout décidé.',
    'narrator.lastRay': '{color} a volé la dernière lumière.',
    'narrator.comeback': '{color} revient de loin. Un classique.',
    'narrator.mirage': '{color} menait au couchant. Méfiez-vous des mirages.',
    'narrator.roundWin1': 'La nuit est tombée. {color} garde le désert.',
    'narrator.roundWin2': 'Le désert s’endort chez {color}, ce soir.',
    'narrator.roundWin3': '{color} a le dernier mot. Et le désert.',

    // Fin de partie
    'narrator.matchWin': '{color}, le désert retiendra cette couleur.',
    'narrator.matchTie': 'Le désert refuse de choisir. Partagez-le.',
    'narrator.rematch': 'Le soleil revient toujours. Vous aussi.',
  },
  en: {
    'narrator.matchOpen': 'Noon. The sand is still nobody’s.',
    'narrator.roundOpen1': 'The sand forgot it all. You didn’t.',
    'narrator.roundOpen2': 'Noon again. The wind tidied up.',
    'narrator.roundOpen3': 'Fresh desert. Same old shadows.',
    'narrator.lastRound': 'The last sun counts double. It knows.',

    'narrator.firstHit': '{color} opens the hunt.',
    'narrator.hitHunter': '{color} falls from the sky, right on someone.',
    'narrator.hitVictim': '{color} gets a taste of sand.',
    'narrator.doubleHit': 'Two birds, one strike. {color} is hungry.',
    'narrator.huntStreak': '{color} is hunting. Look up.',
    'narrator.dodge': '{color} dodges. Talons close on air.',
    'narrator.miss': '{color} eats sand. We saw nothing.',

    'narrator.firstCrown': '{color} wears the crown. Mind the talons.',
    'narrator.leaderChange1': '{color} takes the lead. Sand forgets.',
    'narrator.leaderChange2': '{color} moves ahead. The sun saw it coming.',
    'narrator.leaderChange3': 'The desert is {color}’s. For now.',
    'narrator.leaderChange4': '{color} leads. The dunes take note.',
    'narrator.crownDown': 'Even crowns fall. {color} can tell you.',

    'narrator.bigSteal': '{color} just swallowed a piece of the desert.',
    'narrator.bigStealVictim': 'A shadow passed. {color} has little left.',
    'narrator.trailSteal': 'A whole trail turns {color}, just like that.',
    'narrator.hugeSweep': 'One shadow, and the desert changed its mind.',
    'narrator.runaway': '{color} is getting comfortable. Anyone?',

    'narrator.hiddenLong': '{color} is napping. Or pretending.',
    'narrator.storm': '{color} teases the storm. Bad idea.',
    'narrator.idle': '{color} admires the view. It’s a strategy.',

    'narrator.golden1': 'Golden hour. The shadows are getting ambitious.',
    'narrator.golden2': 'The sun leans. Your shadows grow.',
    'narrator.golden3': 'The sun grows tired. The shadows never do.',
    'narrator.sunset1': 'Your shadows drift away. Aim with them.',
    'narrator.sunset2': 'Sunset. The shadows cross the whole desert.',
    'narrator.sunset3': 'The sun sinks. Shadows run ahead of you.',
    'narrator.greatShadow1': 'Night spills off the cliff. Everything stops.',
    'narrator.greatShadow2': 'Night is coming. It gives nothing back.',
    'narrator.greatShadow3': 'The cliff drops its shadow. Better hurry.',
    'narrator.tenSeconds1': 'Ten seconds. Then nothing moves.',
    'narrator.tenSeconds2': 'Ten seconds. The desert holds its breath.',
    'narrator.tenSeconds3': 'Ten seconds. Anything can still happen.',
    'narrator.photoFinish1': 'It’s close. The last ray decides.',
    'narrator.photoFinish2': 'Neck and neck. The night will decide.',

    'narrator.tie': 'A tie. The desert refuses to choose.',
    'narrator.landslide': '{color} repainted it all. No objections.',
    'narrator.closeFinish1': 'By a handful of sand. The dunes will talk.',
    'narrator.closeFinish2': 'It came down to a single grain of sand.',
    'narrator.lastRay': '{color} stole the last of the light.',
    'narrator.comeback': '{color} came from nowhere. Deserts love that.',
    'narrator.mirage': '{color} led at sunset. Mirages happen.',
    'narrator.roundWin1': 'Night falls. {color} keeps the desert.',
    'narrator.roundWin2': 'The desert sleeps at {color}’s tonight.',
    'narrator.roundWin3': 'Last word to {color}. And the desert.',

    'narrator.matchWin': '{color} wins. Remember that colour.',
    'narrator.matchTie': 'The desert refuses to choose. Share it.',
    'narrator.rematch': 'The sun comes back. So do you, apparently.',
  },
}
