# Agent sim — notes d'intégration

État : **simulation complète, testée** (`npx vitest run src/sim` : 65 tests, 6 fichiers), `maps.ts` stable depuis le début de la phase.
Code : `src/sim/**` (pur, sans DOM/three/React ; `pnpm check:boundaries` vert). Outils : `tools/sim-*.ts`.

## 1. API d'intégration (phase 3)

### Manche, lobby, écran titre

```ts
import { createSimulation, restoreSimulation } from '../sim/simulation.ts'
import { NEUTRAL_INPUT } from '../sim/types.ts'

const sim = createSimulation({
  mode: 'round',              // 'round' | 'lobby' | 'demo'
  seed, mapId, mirror,        // roundConfig(match) les fournit (voir Partie)
  birds: [{ slot, assist }],  // bots compris : la taille d'arène en dépend
  sunSeconds: 110,            // 80 / 110 / 150 ; démo : RULES.titleDemoSunSeconds (40)
  countdown: true,            // 3 s de pilote automatique avant le soleil
})
// à chaque tick (1/30 s ; le runner dose les ticks pour les ralentis) :
const events = sim.step(inputs)   // inputs[slot] : BirdInput | undefined (undefined = neutre)
simEvents… for (const e of events) simEvents.emit(e)
gameView.sim = sim.state          // lu par le rendu, jamais modifié par lui
```

- **Lobby** : `mode: 'lobby', mapId: 'lobby'` (arène 90 × 62, un parasol ; `arenaOverride` possible). Soleil fixe (60°, azimut 250°, palette KF50 = `paletteElevDeg` 50), territoire effacé toutes les `RULES.lobbyResetSeconds` (événement `territoryReset`), jamais de nuit ni de fin, pas de couronne. `sim.addBird({slot, assist})` / `sim.removeBird(slot)` à volonté (au lobby, le sable d'un oiseau retiré redevient neutre).
- **Démo** (écran titre) : `mode: 'demo', countdown: false, sunSeconds: 40`. Manche complète accélérée (phases × 40/110), nuit, puis 2 s de pause (`RULES.demoLoopPauseSeconds`) et la manche reboucle d'elle-même : `territoryReset` + `phase: 'noon'`. `over` reste faux.
- **Fin de manche** (`mode: 'round'`) : événement `night` à t = T (tout le sable est figé, statistiques de nuit remplies), puis `over` 2 s plus tard (`state.over = true`). On peut continuer d'appeler `step()` : les oiseaux planent, plus rien ne change.
- **Ralenti final** : `state.timeScaleHint` vaut 0,5 pendant la dernière seconde (à appliquer par le runner). Les ralentis de touche restent au runner (événements `diveHit`).
- **Aide au vol** : `sim.setAssist(slot, on)` (verrouillage 34 m/85°, évitement tours + Simoun 30°, immunité 4 s, coup d'aile automatique au clac une fois sur deux).
- **Latence** : `sim.setLatencyGrace(slot, rttSeconds / 2)` (borné à 0,1 s) pour chaque téléphone ; 0 pour clavier/bots. Voir §3.
- **Rafraîchissement du PC** : `const snap = sim.snapshot()` (JSON, ≈ 140 ko à 12 oiseaux : grille et masques en RLE+base64) → `sessionStorage` ; `restoreSimulation(JSON.parse(…))` reprend **à l'identique** (même hachage d'état, mêmes tirages). Seules les transitions cosmétiques (`prevOwner`, `changedAt`) repartent à zéro et `grid.dirty` couvre toute la grille.

### Entrées

`BirdInput` = `{ dirX, dirY, dive, divePresses, flapPresses }` : cap absolu dans le monde (x est, y nord ; zone morte 0,2), PLONGER maintenu, compteurs monotones d'appuis (un appui bref entre deux ticks n'est jamais perdu ; un appui pendant une recharge ou un décrochage reste en tampon 0,15 s). Un appui bref sur PLONGER compte comme « maintenu » pendant 0,15 s.

### Partie (GDD §11)

```ts
import { createMatch, roundConfig, finishRound, isMatchOver, matchStandings, matchWinners,
         matchTitles, matchPlayerSummaries, roundTitles, matchSnapshot, restoreMatch } from '../sim/match.ts'

const match = createMatch({ seed, rounds: 3, length: 'normal', lastDouble: true, birds })
const sim = createSimulation(roundConfig(match))          // carte, miroir, graine, durée de la manche courante
// à l'événement 'night' (ou quand state.over) :
const result = finishRound(match, sim.state)             // idempotent pour un même état
result.cells / shares / ranks / suns (par slot, longueur 12) · winners · tie · close · multiplier
result.highlight   // { kind, slot, value } : la mention (GDD §11.3), kinds = RoundFactKind de l'UI
if (isMatchOver(match)) { matchStandings(match); matchWinners(match); matchTitles(match); matchPlayerSummaries(match) }
```

- `MatchState` est du JSON pur (sauvegarde avec la simulation). `restoreMatch(data)` le valide.
- Ordre des cartes : 1 manche → Parasols ; 3 → Parasols, Aiguilles|Géantes (tirage sur la graine), Cadran ; 5 → Parasols, Aiguilles, Géantes, Parasols miroir, Cadran.
- Soleils : oiseaux devancés + 1 au vainqueur (ex æquo = meilleur rang, bonus pour tous les premiers), × 2 à la dernière manche si `lastDouble` (défaut). Classement : soleils, puis territoire cumulé, puis manches gagnées, puis co-victoire (`matchWinners` renvoie plusieurs slots).
- **Titres** : `matchTitles(match)` → `TitleAward[]` `{ slot, title: TitleId, value, unit, z }`. Les `TitleId` et unités (`count | frac | seconds | places`) sont **exactement** ceux de `src/host/ui/viewModel.ts` (réponse à la demande ui → sim). `roundTitles(result)` applique les mêmes règles à une seule manche si l'UI veut un titre de manche. `matchPlayerSummaries(match)` donne les champs de `MatchStatsVM`.

### Événements (SimEvent) : quand ils partent

| Événement | Moment |
|---|---|
| `countdown` n = 3, 2, 1, 0 | au début de chaque seconde du compte à rebours ; 0 = « Envol ! » à t = 0 |
| `phase` | à chaque changement (noon, afternoon, golden, sunset, greatShadow, night, over) ; démo : `noon` à chaque boucle |
| `tenSeconds`, `lastSeconds` 5..1 | t = 100 s (× T/110) ; T − 5 … T − 1 |
| `night`, `over` | t = T ; t = T + 2 s |
| `altitude` | passage FORT ↔ PÂLE (11 m) |
| `lock` / `unlock` | chevron d'un chasseur qui change de cible (et `unlock` à la fin d'un piqué) |
| `diveWindup` → `diveCommit` (clac) → `diveHit` / `diveMiss` / `diveCancel` | un piqué ; `diveCancel.reason` : `feint` (PLONGER relâché avant le clac), `hidden` (cible cachée ou dans la nuit), `immune` (cible décrochée/immunisée), `lost` (cible retirée, fin de manche, chasseur touché) |
| `diveHit` | après la grâce de latence éventuelle ; `x, y, z` = point de contact ; `stolenCells` = traînée volée ; `crown` = la victime portait la couronne |
| `diveMiss` | `dodged` = la cible a battu des ailes pendant le piqué ; `x, y` = où le chasseur plante |
| `flap`, `flapReady`, `stunEnd`, `immuneEnd` | au tick exact |
| `bump`, `towerBump` | début de contact (au plus un toutes les 0,6 s par paire / oiseau) |
| `paleOnStrong` | « tsk » : ombre pâle sur ≥ 4 cellules fortes adverses ; au plus un toutes les 0,35 s par oiseau ; `x, y` = centre des étincelles |
| `hidden` | entrée/sortie de cachette sous une tour (la nuit n'émet pas `hidden` : voir `inNight`) |
| `storm` | entrée/sortie de la bande du Simoun (hystérésis de 1 % du rayon) |
| `crown` | après 2 s de meneur stable ; `slot` −1 = personne (égalité en tête) |
| `bigSteal` | **une fois par épisode** : gain net ≥ 3 % de l'arène sur 3 s ; réarmé quand le gain retombe sous 2 % ; `victim` = le plus gros perdant sur la fenêtre, −1 si c'était du neutre |
| `territoryReset` | lobby (toutes les 30 s), démo (à chaque boucle) |

Réponse à la demande director → sim : les trois hypothèses sont exactes (couronne après hystérésis ; `bigSteal` par épisode, `frac` = gain net 3 s, `victim` = plus gros perdant ou −1 ; `diveHit.stolenCells` = cellules de traînée volées). Le tableau renvoyé par `step()` est neuf à chaque tick (on peut le garder). Les événements émis entre deux ticks (`removeBird`) sortent avec le tick suivant.

### Données lues par le rendu, l'UI, les bots

- `state.sun` : `t` (négatif pendant le compte à rebours), `u` (cadran du HUD), `elevation`, `azimuth`, `shadowDirX/Y`, `cotE`, `stretch`, `paletteElevDeg` (horloge de palette ART_BIBLE §2.4 : identité au-dessus de e(0,7 T) ≈ 20,5°, puis finit à 1° = KF1), `phase`.
- `state.grid` (512 × 352, ligne 0 = sud, `x0 = −a`, `y0 = −b`) : `owner`, `level`, `prevOwner`, `changedAt`, `frozen`, `inArena`, `counts`, `version`, **`dirty`** (rectangle sale en cellules depuis le dernier `clearDirty(grid)`, à appeler par le rendu après l'envoi de la texture), `frozenVersion`. Après un vol de traînée, `changedAt` des cellules volées est **dans le futur** (jusqu'à 0,4 s) : c'est la vague qui remonte la traînée (le rendu affiche `prevOwner` tant que `time < changedAt`).
- `state.night` : `active`, `dirX/Y`, `s` (front), `jag`/`jagSpan` (même profil que `map.cliff.jag`). Point dans la nuit : `isNightAt(night, x, y)`.
- `BirdState` : tout le contrat, plus (ajouts, optionnels dans le type, toujours remplis) `paintedCells` (cellules gagnées/renforcées ce tick : volume du grain de sable), `paleOnStrong` (durée continue du « tsk », indication à 1,5 s), `gain3s`, `stolen3s` (fractions d'arène sur 3 s : narrateur « gros vol », « balayage »), `flapDirX/Y`. `shadow.paints` = au moins une cellule peignable sous l'empreinte ce tick.
- `lockTarget` (chasseur → cible, gardé pendant son piqué) et `lockedBy` (cible → chasseur dont le chevron s'affiche : celui qui pique, sinon le plus proche). « PIQUER » sur le téléphone : `lockTarget >= 0 && dive === 'none' && diveCooldown === 0`.
- `hidden` (caché sous une tour, hors nuit) et `inNight` sont exclusifs ; non ciblable = `hidden || inNight`.
- `stats[slot]` : `BirdRoundStats` + `feints`, `keptFrom60`, `finalCells`.

### Fonctions de requête (`src/sim/query.ts`)

`birdFootprintAt(sun, x, y, z, out?)`, `footprintContains`, `towerShadowHulls(state)` (enveloppes exactes du tick, en cache), `towerShadowHullsFor(towers, sun)` (prévision : où sera l'ombre des tours à t + Δ, avec `sunAt(t, T)`), `isTowerShadeAt`, `isFrozenAt` (grille), `isNightPoint`, `shadowCoverage(state, fp)` (fractions tour/nuit/les deux sur les 13 points), `wouldBeHidden(state, x, y, z)`, `cellAt`, `cellCenter`, `worldToGrid`, `shareOf`, `rankOf`, `ranking`, `predictInterception(state, hunter, target)` (même prédiction que le piqué), plus les réexports utiles (`shadowRadius`, `cruiseSpeed`, `ellipticRadius`, `ellipseEdgeDistance`, `isNightAt`, `jagAt`, `frontSpeed`, `paletteElevDeg`, `phaseAt`, `trunkAt`, `hullRowInterval`, `clearDirty`, `HIDE_SAMPLES`).

### Banc d'essai pour les bots (`src/sim/harness.ts`)

```ts
import { runRound, runBatch, makePolicy, bestHeading, type Policy } from '../sim/harness.ts'
const policy: Policy = (state, slot) => input   // appelée à chaque tick
runBatch([myBotFactory, myBotFactory, 'mixed', 'hunter'], 12, { mapId: 'parasols', factories: true })
// factories: true → chaque fonction est une fabrique (slot, seed) => Policy (état propre par oiseau)
```

`RoundReport` / `BatchReport` donnent les critères du GDD §18 (neutre à 45 s, meneur à 60/90/98 s vainqueur, changements de meneur, > 90 s, vol pendant la Grande Ombre, écart, voisin le plus proche, piqués, touches, traînée par touche, max de touches subies, temps en bas, territoire final acquis avant 60 s, ms/tick). `makePolicy('low'|'high'|'mixed'|'hunter'|'adapt'|'idle', slot, seed)` : politiques scriptées de référence (portées de `validate.mjs`, avec un vrai coup d'aile au clac : réaction 0,30 ± 0,05 s, 10 % d'oublis). `bestHeading(state, slot, z)` : la décision de cap de référence du GDD §14.1.

## 2. maps.ts

```ts
import { getMap, arenaPresetFor, getCliffProfile, towerRadiusAt } from '../sim/maps.ts'
const map = getMap('parasols', birdCount, mirror)   // MapId : 'parasols' | 'aiguilles' | 'geantes' | 'cadran' | 'lobby'
map.arena   // { a, b } demi-axes (preset GDD §4.1 selon N, bots compris ; lobby : 90 × 62)
map.towers  // TowerDef[] (identiques à state.towers)
map.cliff   // { jag, jagSpan, crest, distance, height } : profil de la Falaise (front de nuit)
```

- **Segments** : troncs de cône `{z0, r0, z1, r1, ox?, oy?}`, **monotones en z** (le `z1` d'un segment est le `z0` du suivant ; `z0 === z1` = marche plate sous/sur un disque) : on tourne le profil entier d'un seul tenant (points `(r, z)` = `(segments[0].r0, 0)` puis `(s.r1, s.z1)`). Le dernier point a souvent `r = 0` (pointe, calotte). Bulbes = 4 troncs, dômes = 3, disques = cylindres courts biseautés.
- **Ombre exacte** = enveloppe convexe de deux cercles par segment (GDD §9.1) ; le rendu doit utiliser exactement ces segments (décors fins sans ombre de gameplay).
- **Gnomon** (Cadran) : mât incliné de 12° vers le sud (ART_BIBLE §6.6) : `ox/oy` = décalage du centre de chaque section (`oy = −z·tan 12°`, inversé en miroir). Sections horizontales. Collisions et ombres en tiennent compte.
- **Archétypes** (`TowerDef.archetype`, couleurs ART_BIBLE §6.6) : `parasol` (fût crème, disque ocre, lanterne), `aiguille` (terracotta, bulbe crème, flèche encre), `pile` (disques crème/ocre, dôme turquoise), `colonne` (ocre, dôme cobalt), `bulbe` (fût crème, oignon terracotta), `geante` (hors arène, `outside: true`, pas de collision), `gnomon`. `seed` : graine des détails décoratifs.
- **Règle** : rien de plus large que 5 m sous 24 m ; `trunkRadius` = rayon max sous 24 m (collision à `trunkRadius + 2,5 m`).
- **Mise à l'échelle** (GDD §9.3) : positions × (a/165, b/114), rayons > 5 m × √(a/165), hauteurs et fûts inchangés, puis une relaxation déterministe répare l'espacement (45 m), la marge au bord (15 m, distance euclidienne exacte à l'ellipse) et le centre dégagé (30 m, Parasols). Au preset 5-6, positions exactes du GDD.
- **Nombre de tours** : Parasols 5/5/6/7/8/9 (GDD §4.1) ; Aiguilles 7/7/8/9/10/11 ; Géantes 2 hors arène + 3/3/4/4/5/6 ; Cadran gnomon + 4 parasols, +1 (7-9), +2 (10-12). Tours ajoutées (grandes arènes) et ordre de retrait choisis pour garder les règles de placement.
- **Falaise** : `cliff.jag` (±6 m) = profil du front ; `cliff.crest` = même silhouette normalisée (−1..1, +1 = crête haute) pour dessiner la mesa ; `distance` 1 700 m, `height` 269 m (le soleil la touche à 9°).

Couverture mesurée (`npx tsx tools/sim-maps.ts`), preset 5-6, à 0/30/55/70/85/98 s : Parasols 4,7/6,4/9,4/12,1/15,6/15,4 % (GDD 4,7/6,6/9,8/12,6/16,1/15,6) ; Aiguilles 0,5/2,4/4,7/6,9/9,8/10,9 (GDD 0,5/2,3/4,6/6,9/9,7/10,7) ; Géantes 2,7/4,0/9,1/15,1/23,1/24,1 (GDD 2,7/4,1/9,3/15,3/23,3/24,4) ; Cadran 3,9/5,0/7,4/9,5/10,3/9,7 (GDD 3,9/5,2/7,7/10,1/10,8/9,9). Les écarts (< 0,5 pt) viennent des lanternes, flèches et biseaux ajoutés.

## 3. Décisions (et pourquoi)

1. **`diveHitRadius` 4,0 → 5,5 m (seule valeur existante de `rules.ts` modifiée).** La micro-simulation du GDD (§17-E) réorientait le coup d'aile perpendiculairement à l'approche *à chaque instant* ; dans le jeu, il part dans la direction du joystick, fixée à l'appui. Avec les valeurs du GDD, l'esquive devenait ≈ 0,1 s plus facile : réaction de 0,30 s → 2 % de touches au lieu de 52 %, 0,35 s → 11 % au lieu de 87 % (vérifié aussi en corrigeant la micro-simulation d'origine : 0 % et 0,7 %). Le piqué aurait perdu son sens contre un joueur attentif, et les bots Voyageur/Seigneur auraient esquivé 88-94 % au lieu de 45/75 %. Balayage de `diveCommitLead` (0,50-0,60), `diveHitRadius` (5-5,75) et `flapImpulse` : 5,5 m restitue le mieux la courbe visée (réaction 0,20 / 0,27 / 0,30 / 0,37 / 0,40 s → 3 / 21 / 45 / 97 / 97 % de touches ; GDD 2 / ≈ 25 / 52 / ≈ 90 / 96 %), en gardant le clac à 0,65 s et le coup d'aile de 6,6 m. Sans réaction : 97 % (GDD 96 %) ; clac → contact médiane 0,43 s (GDD 0,49). **À valider par le lead** (demande dans REQUESTS.md) ; revenir à 4,0 ne demande que ce chiffre.
2. **Compensation de latence (GDD §8.6)**, deux volets : (a) littéral : une touche sur un téléphone est résolue `grâce` s plus tard ; un coup d'aile arrivé pendant ce délai l'annule (esquive) ; (b) cohérence : sous un piqué, un coup d'aile de téléphone est appliqué à son horodatage client, c'est-à-dire décalé de `grâce` dans le temps (recalage de ≤ 2,2 m, même déplacement total). Sans (b), un appui arrivé juste *avant* le contact aurait échoué là où un appui plus tardif réussissait. La TV étant locale, seule la voie montante est à compenser : c'est exactement RTT/2.
3. **Balayage exact de l'empreinte** : forme convexe (ellipse balayée) rastérisée par lignes, sous-pas ≤ 1 m pour les extrémités de lignes : aucune cellule sautée même au coup de fouet (137 m/s), et coût proportionnel aux cellules couvertes.
4. **Priorités multi-ombres** par tampon de revendications par tick (niveau, puis distance au segment balayé du centre, puis hachage déterministe (tick, cellule, slot)), puis table de peinture appliquée une seule fois : l'ordre des oiseaux n'a aucune influence.
5. **Cachette** : 13 points testés contre les enveloppes **exactes** du tick (pas le masque à 10 Hz) ; `hidden` exclut la nuit (`inNight` à part) pour que le « caché longtemps » du narrateur et le titre du Lézard ne comptent pas la Grande Ombre. Une ombre cachée peint encore les cellules non figées (GDD §9.2 : « presque rien »).
6. **Grande Ombre** : direction figée à son début (d̂ à 98 s), front de −(ext + 6 m) à +(ext + 6 m) pour que la dentelure entre et sorte entièrement ; masque de nuit incrémental ligne par ligne. À t = T, tout est figé.
7. **Compte à rebours** : pilote automatique, chaque oiseau décrit une boucle à gauche de 10 m de rayon (vitesse haute, 3 s) qui le ramène sur son point d'apparition, cap tangent, à t = 0 ; sa tache forte est peinte dès la création (chacun voit sa couleur pendant « 3, 2, 1 ») et la boucle ne frôle aucun fût.
8. **Prise d'élan** : le chasseur se cabre face à sa cible à la moitié de sa vitesse (comme la micro-simulation) ; contact testé en continu entre deux ticks (segments de trajectoire), sinon un piqué à 50 m/s relatifs traverserait la sphère de touche.
9. **Feinte et tap** : PLONGER doit rester maintenu jusqu'au clac ; un appui bref compte 0,15 s (tampon) puis, relâché, annule (feinte). « Tomber sur quelqu'un » : PLONGER maintenu au tick où une cible devient verrouillable lance le piqué.
10. **Un raté** met le chasseur au sol 1 s, puis 1 s de recharge ; une esquive (`dodged`) = la cible a battu des ailes depuis la prise d'élan.
11. **Collisions** : glissade tangentielle, −30 % de vitesse au premier contact (puis 0,6 s sans nouveau ralentissement) ; aide d'évitement sur le cap voulu (15°, 30° en aide au vol) ; pas de collision de fût pendant un piqué. Poussées entre oiseaux : au moins 5 m/s d'écartement tant qu'ils se chevauchent, événement au début du contact.
12. **Couronne** : égalité exacte en tête → la couronne reste à son porteur s'il en fait partie, sinon personne après 2 s. Pas de couronne au lobby.
13. **1 manche** → Les Parasols (carte d'ouverture, la plus lisible), pas Le Cadran.
14. **Titres** : cumul sur la partie ; Notaire = moyenne par manche du figé sous les tours ; Revenant = meilleure remontée sur une manche ; Dernier Rayon = le plus gros gain cumulé de la Grande Ombre, s'il est positif.
15. **Lobby** : palette KF50 (ART_BIBLE §2.4) alors que l'élévation de gameplay est 60°.

Ajouts compatibles à `types.ts` : `TerritoryGrid.dirty?`, `frozenVersion?` ; `BirdState.paintedCells?`, `paleOnStrong?`, `gain3s?`, `stolen3s?`, `flapDirX?`, `flapDirY?` ; `BirdRoundStats.feints?`, `keptFrom60?`, `finalCells?` (optionnels pour ne pas casser les maquettes des autres agents ; la sim les remplit toujours).
Ajouts à `rules.ts` (section « Ajouts de l'agent sim ») : `lobbySunAzDeg`, `lobbyPaletteElevDeg`, `demoLoopPauseSeconds`, `openingCenterClear`, `cliffDistance`, `cliffJagSpacing`, `diveWindupSpeedFactor`, `diveMissBelow`, `assistAutoFlapDelay`, `paleOnStrongEventGap`, `paleOnStrongMinCells`, `bumpRepeatSeconds`, `towerBumpRepeatSeconds`, `bigStealRearmFrac`, `stormEventHysteresis`, `assistStormLookahead`. Valeur modifiée : `diveHitRadius` (décision 1).

## 4. Vérifications

- `npx vitest run src/sim` : soleil vs GDD §17-A (9 instants), empreinte, table de peinture (10 cas + « tsk » + priorités + coup de fouet sans trou), enveloppes vs force brute (< 0,2 % d'écart sur 6 000 points, bords inclus), cartes (placement pour les 6 presets × miroir), micro-simulation du piqué, feinte, verrouillage, vol de traînée (1,5 s / 3 s couronne, niveau conservé, vague), cachette, Grande Ombre, lobby, démo, déterminisme, snapshot/restauration JSON, soleils, classement, titres, partie complète de bots.
- Performance (`npx tsx tools/sim-bench.ts 12 3`, minimum par tick sur 3 répétitions, machine partagée) : **12 oiseaux, moyenne 0,36 ms / tick, couchant 0,53 ms, p99 0,76 ms** (max 2,5 ms sur un vol de traînée). Aucune allocation dans les boucles chaudes (tampons réutilisés ; seuls les objets d'événement et le tableau renvoyé par `step()` sont alloués).
- Vues de dessus : `npx tsx tools/sim-render.ts --n=6 --policy=mixed,mixed,mixed,mixed,mixed,hunter` → `shots/sim/*.png` (territoire, ombres de tours, empreintes, nuit, chevrons).
- Micro-simulation : `npx tsx tools/sim-dive.ts 600` (sans réaction 97 % de touches ; réaction au clac 0,20/0,27/0,30/0,37/0,40 s → 3/21/45/97/97 % ; grâce de latence 0,1 s et réaction 0,35 s → 4 %).
- **Page de dev** : `dev/sim.html` (vue de dessus en direct : territoire, ombres de tours, empreintes, chevrons, nuit ; bots scriptés ; slot 0 au clavier ZQSD/WASD + Espace + Maj ; modes manche/lobby/démo ; paramètres d'URL `?mode=&map=&n=&seed=&pol=&speed=&t=&human=&hulls=`, `window.__sim`, `window.__ready`). Captures : `shots/sim/dev-*.jpg`. (Sans port attribué, vérifiée via un bundle esbuild ouvert en `file://`.)
- Snapshot : ≈ 140 ko à 12 oiseaux, encodage 6-15 ms, restauration 15-40 ms (machine chargée) ; le runner peut le sauver toutes les 2-3 s ou aux changements de phase.

## 5. Métriques de manches complètes (GDD §18) et écarts avec results.md

`npx tsx tools/sim-run.ts --rounds=12` (tableau complet dans `shots/sim/sim-run-12.md`, ≈ 8 min) ; politiques scriptées de `harness.ts` (celles de validate.mjs, mais avec un vrai coup d'aile au clac au lieu d'une esquive tirée au sort).

**Équilibres de politiques** (12 manches par ligne) : identiques à validate.mjs. « La stratégie minoritaire gagne » : 3 high + 1 low → low 38,3 % (réf. 37,2), 100 % des victoires ; 3 low + 1 high → high 27,3 % (27,8), 67 % ; 3 low + 1 hunter → hunter 20,1 % (22,3), 58 % ; duels low/high 54,9/29,2 (55,5/28,5), low/mixed 27,5/48,3 (25,6/50,6), high/mixed 31,8/45,7 (34,5/43,9) ; mixed reste le meilleur à 4 et 6.

**Tension, contact, piqués** — 6 oiseaux (5 mixed + hunter), **48 manches** (`shots/sim/sim-run-48-6birds.json`), entre parenthèses la référence results.md :

| critère (GDD §18) | sim | réf. | cible §18 |
|---|---|---|---|
| neutre à 45 s | 34 % | 35 % | < 40 % ✓ |
| meneur à 60 / 90 / 98 s vainqueur | 10 / 29 / 42 % | 17 / 33 / 50 % | 45-70 % à 98 s (à la limite) |
| manches avec changement de meneur après 90 s | 83 % | 92 % | ≥ 60 % ✓ |
| changements de meneur / manche | 12,6 | 12,9 | — |
| volé pendant la Grande Ombre | 28,3 % | 28,9 % | — |
| écart 1er-2e | 3,3 pt | 3,7 pt | — |
| plus proche voisin (30-90 s) | 40 m | 40 m | < 70 m ✓ |
| piqués / manche | 5,1 | 6,1 | 8-15 (humains) |
| touches | 44 % | 60 % | 35-55 % ✓ |
| traînée volée / touche | 1 445 m² | 1 149 m² | — |
| max de touches subies par un oiseau | 2 | — | ≤ 5 ✓ |
| temps en bas | 7 % | ≈ 9 % | 30-60 % ✗ (bots) |
| territoire final acquis avant 60 s | 26,5 % | 27 % | ≥ 25 % ✓ |

Autres tailles (12 manches, bruit ±15 pts) : 4 oiseaux 37 % neutre à 45 s, 42/50/42 %, 2,8 piqués, 39 % de touches ; 2 oiseaux 50/75/83 %, écart 8,6 pt, voisin 57 m ; 12 oiseaux neutre 30 % (30), 8/25/33 % (8/25/50), voisin 34 m (35), 4,2 piqués ; Cadran 36 %, 8/58/67 % (17/50/67) ; « 3 low + hunter » (borne haute) 22,7 piqués (24,6), 53 % (65), 412 m² (311).

**Lecture des écarts.**
- Le moteur reproduit validate.mjs sur tout ce qui dépend de la peinture, du soleil, des tours et de la nuit (neutre, vol de la Grande Ombre, écart, changements, voisin, part acquise avant 60 s, équilibres).
- **Touches** plus rares (44 % contre 60 %) : les cibles battent vraiment des ailes au clac (réaction 0,30 ± 0,05 s, 10 % d'oublis → ≈ 50 % d'esquive avec `diveHitRadius` 5,5), là où validate tirait l'esquive au sort (35-45 %). C'est au milieu de la cible §18.
- **Piqués** un peu moins nombreux (5,1 contre 6,1) : les `mixed` scriptés descendent un peu moins (7 % du temps en bas) ; il y a donc moins de cibles.
- **Temps en bas** : 7 % pour ces politiques scriptées (validate ≈ 9 %), loin des 30-60 % visés. Ce n'est pas la simulation mais la décision des bots `mixed` (1,6 × valeur basse > valeur haute), qui ne choisit le bas que sur du fort adverse ou son propre pâle. **À surveiller avec les vrais bots** : si les humains aussi restent en haut, le GDD prévoit de rééquilibrer d'abord `speedLow` / `speedHigh`, puis `shadowRadiusHigh`.
- **Meneur à 98 s vainqueur** : 42 % (réf. 50 %, cible 45-70 %) ; la fin est très ouverte. Si les vrais bots confirment < 45 %, le premier levier du GDD §17-G est `sunElevEndDeg` (fin à 11-12°).
- **Traînée par touche** plus grande (1 445 contre 1 149 m²) : balayage continu de l'empreinte (aucun trou) et vague de 1,5 s complète.
- Coût : 0,5-1,2 ms/tick dans ces batchs (machine chargée ; voir la mesure au minimum §4).

## 6. Limites et reste à faire (intégration)

- Le runner doit : appeler `clearDirty(state.grid)` après chaque envoi de texture (rendu), `setLatencyGrace` par téléphone (RTT/2), appliquer `timeScaleHint`, sauver `sim.snapshot()` + `matchSnapshot(match)` régulièrement (toutes les 2-3 s ou aux changements de phase : l'encodage coûte ≈ 10 ms).
- En mode lobby, passer `mapId: 'lobby'` (sinon la carte demandée est posée telle quelle dans l'arène imposée).
- Les métriques §18 sont à refaire avec les vrais bots (`runBatch` accepte des fabriques de politiques) ; voir §5 pour le temps passé en bas.
- La simulation ne connaît pas les humains/bots : l'équité « 2 bots au plus par cible » est au module bots.
- Les micro-objectifs du lobby (« Vole », « Plonge », « Pique ») se déduisent des entrées et des événements (`diveHit` sur le mannequin) : au runner ou au director.

## 7. Polish vague 1 (correcteur game, ordres G4, G9, G10) — détail : docs/polish/fix-game.md

### G9 · Essai A/B « le piqué doit payer » : NON retenu (valeurs d'origine gardées)

Essai : `trailStealSeconds` 1,5 → 2,5 et `trailStealCrownSeconds` 3 → 4, avec les bots du polish G1-G2. Critère de maintien : profil « chasseur » à moins de 10 points du « mixte » (solo-sweep) et aucun caractère au-dessus de 35 % à 6 Voyageurs (bots-arena). Mesures (24 manches par case pour `tools/polish/feel/solo-sweep.ts`, 56 manches pour `tools/bots-arena.ts --suite=voyageurs6`) :

| mesure | 1,5 / 3 s (actuel) | 2,5 / 4 s (essai) |
|---|---|---|
| solo Oisillon : mixte / chasseur | 83 % / 25 % | 83 % / 33 % |
| solo Voyageur : mixte / chasseur | 50 % / 0 % | 58 % / 13 % |
| solo Seigneur : mixte / chasseur | 50 % / 21 % | 38 % / — |
| 6 Voyageurs : meilleur caractère | Pie 27 % | Guetteur 33 % |
| 6 Voyageurs : Faucon | 8 % | 2 % |
| 6 Voyageurs : touches, piqués / manche | 52 %, 8,1 | 52 %, 8,3 |

L'écart chasseur-mixte reste de 45 à 50 points (critère : < 10) et le Faucon perd encore du terrain (le vol profite aux bons peintres qui piquent par occasion, pas aux chasseurs) : essai rejeté, `rules.ts` revenu à 1,5 / 3 s. Le chasseur scripté perd surtout parce qu'il ne peint pas pendant qu'il chasse ; allonger le vol ne compense pas.

### Ajouts à `rules.ts` (compatibles)

- `plancheFlashMinStealFrac` 0,01, `plancheFlashMinGap` 6, `plancheFlashMaxPerRound` 4, `plancheFlashMinorMaxPerRound` 2, `plancheFlashMinorGap` 12, `dodgeSlowmoScale` 0,6, `dodgeSlowmoSeconds` 0,2 : hiérarchie des impacts (G4, lue par le runner).
- `titleRapaceDominance` 2 : le Rapace revient d'office à qui fait au moins 2 × la moyenne des touches (G10).

### G10 · Titres et faits marquants

- `assignTitles` : passes successives — Rapace au chasseur dominant, puis titres flatteurs (Rapace, Anguille, Pilleur, Bâtisseur, Notaire, Dernier Rayon, Lézard, Revenant), neutres (Rase-Mottes, Nuage), enfin moqueurs (Gibier, Kamikaze), jamais à qui domine leur domaine (meilleur chasseur ≠ Kamikaze, meilleure anguille ≠ Gibier). Le z-score départage toujours à l'intérieur d'une passe.
- Nouveau `TitleId` `souverain` (hors z-score) : `withSovereign(awards, winners)` donne « Le Souverain » (total de soleils) au vainqueur de la partie sans autre titre ; `matchTitles` l'applique. Clés `titles.souverain.*` (FR/EN) ajoutées dans `src/shared/strings/titles.ts`.
- `finishRound` : `highlight` = le premier fait dont le genre n'a pas déjà été le fait marquant d'une manche précédente de la partie (plus de « Raz-de-marée » trois fois).
- Tests : `src/sim/match.test.ts` (Kamikaze/Rapace, domaine du Gibier, Souverain, faits jamais répétés). `npx vitest run src/sim` vert.
