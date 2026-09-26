# Agent bots — notes d'intégration

État : **module complet** (`src/bots/**`, pur : ni DOM, ni three, ni React ; aléatoire à graine), tests `npx vitest run src/bots`, arène d'équilibrage `tools/bots-arena.ts`, rapport `docs/research/balance-report.md`.
Page de dev : `dev/bots.html` (vue de dessus, trajectoires, intentions). Captures : `shots/bots/`.

## 1. API d'intégration (phase 3)

```ts
import { createBot, defaultBots, demoTeam, createSubstituteBot, createLobbyDummy, BOT_PERSONALITIES, type Bot } from '../bots/index.ts'

// un bot par slot piloté par l'IA
const bot = createBot({ slot, personality: 'falcon', level: 1, seed })
// à chaque tick, AVANT sim.step() :
inputs[slot] = bot.think(sim.state, lastEvents)   // lastEvents = ce qu'a renvoyé le step() précédent
lastEvents = sim.step(inputs)
```

- **`think(state, events)`** renvoie un `BirdInput` (même couche d'entrée qu'un téléphone). **L'objet est réutilisé** d'un tick à l'autre : le runner doit le lire tout de suite (c'est ce que fait `sim.step`) ou le copier.
- **Aucun câblage** : tous les bots d'une même simulation partagent automatiquement un coordinateur (`coordinatorFor(state)`, rattaché au `SimState` par WeakMap) : perception retardée, carte de valeur, prévision des ombres, équité « 2 bots au plus par cible et par 10 s ». Une nouvelle simulation (manche suivante, `restoreSimulation` après rafraîchissement) en crée un neuf ; les bots s'y rattachent seuls au premier `think` (plan oublié, rien d'autre à faire). Garder le même objet `Bot` d'une manche à l'autre est permis.
- **Identifiants** : `BotPersonality = falcon | ploughman | magpie | nomad | lookout | fool | watchmaker`, `BotLevel = 0 | 1 | 2` (Oisillon, Voyageur, Seigneur des sables) — exactement ceux de `src/host/ui/viewModel.ts`. `bot.level` est le niveau **effectif** : un Horloger demandé en Oisillon joue Voyageur (GDD §14.2, « Voyageur et Seigneur seulement »).
- **`bot.intent`** (`{ kind, target, x, y, low, blunder }`) : ce que fait le bot (cercle du Faucon, sillons, raid, affût, erreur en cours…). Lecture seule, pour le debug et, si le lead le veut, le narrateur ou les étiquettes.
- **Compositions** : `defaultBots(humains, niveau = 1)` → `BotSpec[]` (GDD §14.3 : 1 humain → Faucon, Laboureur, Nomade ; 2 → Pie, Guetteur ; 3 → Faucon ; ≥ 4 → aucun). Couleurs : première libre (ART_BIBLE A5), au runner.
- **Écran titre** (`mode: 'demo'`) : `demoTeam(6, boucle)` → 6 caractères variés (Faucon et Nomade Seigneurs, Pie, Fou, Guetteur, Laboureur…), ordre mélangé par la graine. La démo reboucle d'elle-même (`territoryReset`) : les bots replanifient seuls.
- **Lobby** : `createLobbyDummy(slot)` = le mannequin (§15.2) : cercle lent au ras du sable, loin du parasol ; ne pique ni ne bat jamais des ailes. Le « Pique » du micro-objectif se lit sur `diveHit` avec `target === slotDuMannequin`. Les vrais bots ajoutés au salon peuvent aussi voler au lobby (`createBot` fonctionne en `mode: 'lobby'`).
- **Remplaçant** (§14.3) : au bout de `RULES.playerDropToBotSeconds` sans téléphone, `createSubstituteBot(slot, seed)` (Laboureur Voyageur, `substitute: true`) reprend l'oiseau là où il est (couleur, territoire). Pour rendre la main : cesser d'appeler son `think` et relire le téléphone. Remarque : les compteurs d'appuis du bot repartent de 0 ; au retour, le premier message du téléphone recale les compteurs (la sim ne compte que les augmentations).
- **Humains et aide au vol** : rien à déclarer. Un oiseau sans bot enregistré est un humain aux yeux des bots (le salon l'affiche) ; l'aide au vol se voit (icône plume, `BirdState.assist`).

## 2. Ce que « aucune triche » veut dire ici

- Les autres oiseaux sont vus **avec le retard du niveau** (`RULES.botReactionMs`) via un historique partagé (`perception.ts`) et **seulement par ce que l'écran montre** : position, altitude (taille et densité de l'ombre), cap, inclinaison (taux de virage), mouvement perçu (différence de deux positions vues), pose de piqué, vrille, plumes d'immunité, oiseau assombri (caché), couronne, bouts d'ailes blancs (coup d'aile prêt), plume d'aide au vol, chevron au-dessus d'un oiseau. Jamais leurs entrées ni leurs intentions.
- Le désert, les ombres des tours et la nuit sont lus tels qu'affichés. Prévoir où tombera l'ombre d'une tour dans 3,5 s (`shade.ts`) est permis : la course du soleil est publique (cadran du HUD), c'est ce que fait un joueur expérimenté.
- Le niveau d'un bot adverse est public (pastilles du salon) : un Seigneur s'en sert pour estimer l'esquive d'une cible.
- **Aucun élastique** : rien ne dépend du score, sauf la couronne (visible, règle du GDD).
- Le coordinateur ne transmet aucune information entre bots ; il ne fait qu'appliquer le quota anti-acharnement.

## 3. Architecture (src/bots)

| Fichier | Rôle |
|---|---|
| `types.ts` | contrat public (`Bot`, `BotOptions`, `BotIntent`, caractères, niveaux) |
| `levels.ts` | paramètres des niveaux : ceux du GDD viennent de `RULES.bot*`, plus les réglages d'IA propres (profondeur de décision, coût des virages, sprint, anticipation du clac…) |
| `traits.ts` | les 7 caractères : étage préféré, poids des cellules, goût du piqué, réaction à la menace, erreurs typiques |
| `brain.ts` | le cerveau commun : perception, couche menace (coup d'aile au clac), couche piqué, décision (erreurs, chevron, Grande Ombre, style), motricité → `BirdInput` |
| `styles.ts` | ce que décide chaque caractère (plans et signatures) |
| `evaluate.ts` | décision de cap par utilité (GDD §14.1, `bestHeading` de validate.mjs) |
| `valueMap.ts` | carte de valeur par blocs de 8 m, mise à jour incrémentale (22 lignes de grille par tick) |
| `shade.ts` | prévision des ombres des tours et de la nuit (scellage), cachettes |
| `perception.ts` | historique de ce que l'écran montre, lu avec retard |
| `coordinator.ts` | ce qui est partagé par simulation + équité |
| `roster.ts` | compositions par défaut, remplaçant, mannequin, équipe de démo |
| `random.ts` | PRNG à graine (mulberry32 de la sim) |

## 4. Les sept caractères : signature et erreurs

| Caractère | Ce qu'il fait (`styles.ts`) | Signature à l'écran | Erreurs crédibles |
|---|---|---|---|
| Faucon | rafle le neutre en haut jusqu'à 40 s, puis chasse les oiseaux bas (proie à coup d'aile en recharge de préférence, couronne), peint entre deux attaques | **cercle** au-dessus de la proie (≥ 0,8 s et ≥ 110° d'arc) avant chaque piqué | s'acharne sur sa proie, pique des cibles au coup d'aile prêt, oublie de peindre (file vers son propre sable) |
| Laboureur | parcelles de 5 sillons au ras du sable, près de chez lui ; en travers des ombres au couchant ; change de parcelle dès que le sillon suivant ne rapporte plus | **sillons parallèles** (10 m, puis la largeur de l'ombre au couchant), demi-tours de tracteur, rangs gardés dans le même sens | ne lève pas la tête : **fuit en ligne droite** quand un chevron apparaît ; l'Oisillon serre trop ses sillons |
| Pie | vise la couronne (sinon le plus gros territoire), file en ligne droite vers sa zone la plus riche, **coup d'aile à l'entrée**, pille 3-5 s | **lignes droites** vers la couleur du meneur | gourmande : reste bas sous les chasseurs, arrive sans coup d'aile |
| Nomade | lignes engagées 5-7 s, coût des virages doublé, repart en travers de l'arène quand il approche du bord ; haut avant l'heure dorée | **grandes lignes droites** qui traversent l'arène ; premier parti vers l'est (−5 s) | prolonge sa ligne jusque dans la tempête (ombre hors de l'arène), néglige la défense |
| Guetteur | affût dans une cachette (ombrelle d'une tour) seulement s'il passe du monde au ras du sable ; peint devant les éclipses entre deux affûts | **cercles serrés** dans l'ombre d'une tour, puis **sortie brusque** (remonte, coup d'aile vers la proie, piqué) | s'attarde dans sa cachette, en retard au couchant (cherche encore des refuges) |
| Fou | peinture myope, un cap sur deux au hasard, zigzags de ±50-80°, change d'étage sans raison, coups d'aile gratuits, pique tout ce qui bouge sans attendre | **zigzags**, **looping** de célébration après une touche | finit dans le Simoun (erreurs ×2), rate beaucoup, gagne parfois par hasard |
| Horloger | peint fort ce que les ombres des tours vont couvrir (scellage), file à l'est avant la nuit, pique le meneur au couchant s'il est tout près | peint juste devant les ombres qui avancent | trop méthodique : réagit 0,07 s plus lentement aux piqués entre 30 et 80 s |

Communs à tous : décision de cap par utilité (`evaluate.ts`), couche menace (coup d'aile au clac), couche piqué (verrouillage tenu, équité, géométrie, goût du caractère, espérance de gain pour le Seigneur), Grande Ombre (départ à l'heure du niveau), réaction au chevron (se cacher, remonter, fuir ou ignorer), erreurs volontaires (Poisson de moyenne `botErrorEverySeconds`).

## 5. Les trois niveaux

Valeurs du GDD (`RULES.bot*`) : réaction 550/300/160 ms, décision 1,0/0,6/0,35 s, bruit ±20/8/3°, compensation de l'ombre 50/85/100 %, verrouillage tenu 1,2/0,6/0,25 s, piqués mal engagés 30/10/0 %, coup d'aile au clac N(0,45 ; 0,15)/N(0,30 ; 0,05)/N(0,26 ; 0,03) avec 35/10/3 % d'oublis, feintes 0/15/35 %, pâle sur fort 40/10/0 %, Grande Ombre (au front)/95 s/90 s, une erreur toutes les 10/25/40 s.

Réglages d'IA ajoutés (`levels.ts`, ce ne sont pas des règles du jeu) et **pourquoi** : les valeurs du GDD seules ne séparaient presque pas les niveaux (Seigneur 36 % contre 3 Oisillons, cible ≥ 80 %), parce que la peinture par utilité est robuste au bruit.

| Réglage | Oisillon / Voyageur / Seigneur | Effet |
|---|---|---|
| coût d'un virage (valeur/rad) | 150 / 900 / 1 500 | **le levier principal** : le débutant vire au moindre frémissement et repasse sur sa traînée ; des lignes franches rapportent +4 points de part (A/B, rapport §4) |
| profondeur de décision | 8 caps, 2 horizons proches, 2 blocs / 16, 3, 4 / 16, 3, 4 | l'Oisillon est myope |
| « voler en travers des ombres » compris | 0 / 0,6 / 1 | la compétence du soir se découvre |
| changement d'étage | ≥ 6 s, penchant pour le haut ×0,7 / 1,2 s / 0,5 s | le débutant reste où il est |
| sprints (coup d'aile pour peindre plus vite, sans chasseur à 80/80/55 m) | 0 / 0,15 / 0,6 par s | +10 % de vitesse quand c'est sûr |
| anticipation du clac (lire la prise d'élan) | 0 / 35 % / 80 % | esquive mesurée ≈ 25 / 45 / 60-75 % (cibles GDD 15 / 45 / 75 %) |
| choix d'une destination | parmi les 6 / 2 / 1 meilleures | le débutant vise « à peu près » |
| sens du classement (voler au rival direct) | 0 / 0,5 / 1 | le Seigneur prend au meneur, pas au dernier |
| durée des erreurs | ×1,7 / ×1 / ×0,8, et 60 % d'erreurs de débutant pour l'Oisillon | tempête, hésitation, oubli de peindre |
| lecture des tours | ignore / évite le figé / scelle | GDD §14.3 |
| victimes | bots ou couronne, jamais l'aide au vol / couronne puis le plus proche / optimal (traînée, coup d'aile en recharge, esquive attendue selon le niveau affiché) | GDD §14.3 |

## 6. Décisions

1. **Personnalités = utilité + signature.** Chaque caractère repose sur la même décision de cap par utilité ; la signature est un plan (sillons, raid, ligne, affût, cercle) qui module cette utilité. Les signatures « pures » (lignes engagées de 16 s, parcelles de deux passes) coûtaient jusqu'à 25 points de victoires : elles ont été raccourcies jusqu'à rester lisibles sans ruiner le caractère.
2. **Coût des virages** (1 500/rad pour le Seigneur au lieu de 20 dans `bestHeading`) et **blocs lointains à 0,6×** les poids du GDD : mesuré en A/B à configuration égale (+4 à +5 points de part). Le `bestHeading` de validate.mjs zigzaguait entre des caps de valeur voisine.
3. **Anticipation du clac** : en partie réelle le contact arrive 0,40 s après le clac (médiane), pas 0,49 s ; au réflexe pur (0,26 s), le Seigneur n'esquivait que ~50 %. L'anticipation (lire la distance à la prise d'élan, GDD §8.5) ramène l'esquive vers la cible sans toucher aux règles.
4. **Pas d'acharnement** : en plus du quota 2 bots/cible/10 s, un bot laisse souffler 8 s une victime qui vient d'être touchée (la vrille se voit), sauf la couronne. Max de touches subies : 7 → 4-5 par manche.
5. **Équité** : poursuites et piqués comptent comme engagements ; le quota ne s'applique qu'aux bots (les humains font ce qu'ils veulent).
6. **Scellage** : le bonus pour le sable bientôt figé ne vaut qu'à partir de l'heure dorée (les ombres de midi repartent aussitôt) ; trop fort (×3,4), il enfermait l'Horloger sous les tours.
7. **Horloger en Oisillon** → joué en Voyageur (GDD §14.2).
8. **Aucune valeur de `rules.ts` modifiée** : les critères §18 sont tenus avec les règles actuelles (`diveHitRadius` 5,5 m compris).
9. **Correctif de simulation** (`simulation.ts`, `spawnAngle` et `placeOnRing`) : dans les petites arènes encombrées, un oiseau pouvait apparaître à 0,9 m d'un fût et traverser la tour pendant le compte à rebours (7 configurations sur 1 152) ; repli sur le point le plus dégagé de l'anneau et boucle à droite si la gauche frôle un fût. Test de régression : `src/sim/spawn.test.ts`. Les 65 tests de `src/sim` passent.

## 7. Mesures (détail : docs/research/balance-report.md)

- **Tests** : `npx vitest run src/bots` (12 tests : les 7 caractères × 3 niveaux sans NaN, joystick ≤ 1, compteurs monotones ; déterminisme par graine ; quota 2 bots/cible/10 s en partie ; coordinateur ; perception retardée ; mannequin ; compositions ; démo ; remplaçant en pleine manche). `npx vitest run src/sim` : 66 tests (dont la régression `spawn.test.ts`). `pnpm check:boundaries` vert.
- **Coût** (`npx tsx tools/bots-bench.ts --rounds=3 --level=mix`, 11 bots + 1 oiseau, machine partagée, charge 7-9) : **0,20 ms/tick en moyenne, p99 0,84-0,92 ms, max 2,1 ms** (Seigneurs sur Les Géantes : 0,20 / 0,84 / 1,7). Les calculs lourds sont partagés (coordinateur) et étalés : carte de valeur 22 lignes de grille par tick, prévision des ombres en 4 étapes toutes les 0,5 s, décisions à l'intervalle du niveau.
- **Arène** (70 manches par configuration, 50 à 12) : tous les critères du §18 tenus à 6 et moins (neutre 23 %, meneur à 98 s 53 %, changement après 90 s 77 %, touches 52 %, max 5 touches, bas 55 %, voisin 52 m, acquis avant 60 s 32 %) ; piqués 7,2 par manche à 6 bots (cible 8-15 formulée pour des humains) ; aucun caractère au-dessus de 28 % à 6 Voyageurs ; Seigneur contre 3 Oisillons 67-77 %, Oisillon contre 3 Seigneurs 6 % (voir §8).
- **Vues de dessus** : `shots/bots/sig-*.png` (une signature par caractère), `all7-t*.png`, `dev-*.jpg` (page de dev : 6 Voyageurs, lobby + mannequin, démo, Seigneur contre Oisillons).

## 8. Limites connues

- **Niveaux** : Seigneur contre 3 Oisillons 67-77 % (cible 80 %) et Oisillon contre 3 Seigneurs 6 % (cible 10 %) : cibles presque incompatibles (rapport §3), demande au lead dans REQUESTS.md. En mêlée à 6, Seigneur et Voyageur sont proches (26 / 21 % de victoires).
- **Faucon faible en mêlée** (2 % de victoires à 6 Voyageurs, 18 % à 4) et Nomade en retrait (7 %) : constat déjà fait par le GDD pour la politique « chasseur ». Le Faucon reste la bonne réponse à un joueur qui campe au ras du sable.
- **Joueur seul** : la composition par défaut (Faucon, Laboureur, Nomade) réunit les caractères les moins efficaces ; un joueur appliqué (proxy « mixed ») gagne 79 % des manches. Le réglage de niveau « Seigneur » durcit la partie. Si le lead veut un solo plus disputé : remplacer le Nomade par la Pie ou le Guetteur dans `defaultBots(1)` (une ligne).
- **Démo** : ≈ 3 piqués engagés par boucle de 40 s (bots plus joueurs en démo). Une démo plus « explosive » demanderait plus de Faucons, au détriment de la variété.
- **Humains non mesurés** : les critères sont mesurés bot contre bot. Un humain distrait sera plus souvent touché (contact 0,40 s après le clac en médiane).
- **Bots au lobby** : ils volent et peignent normalement (la couronne et la nuit n'existent pas au lobby) ; seul le mannequin a un comportement dédié.

## 9. Reste à faire côté intégration (phase 3)

- Runner : appeler `think` avant chaque `step` pour chaque slot piloté par un bot ; conserver `lastEvents` ; créer les bots avec une graine dérivée de la graine de partie et du slot (déterminisme des parties rejouées).
- Salon : `defaultBots(nombreHumains, niveauDeLaPartie)` ; couleurs = premières libres ; afficher « Jade · Faucon » (chaînes `host.bot.*` de l'UI) ; un Horloger en Oisillon s'affiche en Voyageur (demande UI dans REQUESTS.md).
- Déconnexion : `createSubstituteBot` après `RULES.playerDropToBotSeconds`, badge « (remplaçant) » (`bot.substitute`).
- Lobby : `createLobbyDummy(slot)` pour le mannequin ; micro-objectif « Pique » = `diveHit` sur son slot.
- Écran titre : `createSimulation({ mode: 'demo', … })` avec `demoTeam(6, boucle)`.
- Rafraîchissement du PC : recréer les bots (ou les garder) après `restoreSimulation` ; ils repartent d'un plan neuf, sans autre état à sauver.
