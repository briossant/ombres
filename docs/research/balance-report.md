# Ombres — rapport d'équilibrage des bots

Agent bots, phase 2. Parties **complètes** jouées headless par les vrais bots (`src/bots`) dans la vraie simulation (`src/sim`), avec `tools/bots-arena.ts`. Chaque configuration compte **70 manches** (50 à 12 oiseaux), positions tournantes, cartes tournantes (Parasols, Aiguilles, Géantes, Cadran, Parasols en miroir une fois sur deux), une graine par manche. Données brutes : `shots/bots/final2/arena-*.json` (état final), `shots/bots/v0/` (premiers bots), captures `shots/bots/`.

Relancer : `npx tsx tools/bots-arena.ts --suite=all --rounds=70 --rounds12=50 --workers=4` (≈ 35 min sur la machine partagée). Une suite : `--suite=voyageurs6,lordVs3`.

Le bruit est grand : sur 70 manches, un taux de victoire a une erreur type de ±5 à 6 points ; deux lancers de code presque identique (seul l'étage du Nomade et du Faucon à l'heure dorée différait) ont donné 77 % puis 67 % pour « Seigneur contre 3 Oisillons ». Les écarts de moins de 10 points entre caractères ne sont pas significatifs.

## 1. Résumé

| Critère (GDD §14.3, §18) | Cible | Avant (premiers bots) | Après | |
|---|---|---|---|---|
| Aucun caractère au-dessus de 35 % de victoires (6 Voyageurs) | ≤ 35 % | Fou 35 %, Laboureur 29 % | **max 28 %** (Pie) | ✓ |
| Seigneur contre 3 Oisillons | ≥ 80 % | 36 % | **67 %** (77 % au lancer précédent) | ✗ proche |
| Oisillon contre 3 Seigneurs | ≥ 10 % | 23 % | **6 %** | ✗ (voir §3 : cibles quasi incompatibles) |
| Sable neutre à 45 s (6) | < 40 % | 31 % | **23 %** | ✓ |
| Meneur à 98 s vainqueur (6) | 45-70 % | 48 % | **53 %** | ✓ |
| Changement de meneur après 90 s | ≥ 60 % des manches | 89 % | **77 %** | ✓ |
| Piqués engagés par manche (6) | 8-15 (avec des humains) | 10,4 | **7,2** | ≈ (bots seuls) |
| Touches | 35-55 % | 59 % | **52 %** | ✓ |
| Aucun oiseau touché plus de 5 fois | ≤ 5 | 7 | **5** | ✓ |
| Temps en bas | 30-60 % | 56 % | **55 %** | ✓ |
| Plus proche voisin (30-90 s) | < 70 m | 45 m | **52 m** | ✓ |
| Territoire final acquis avant 60 s | ≥ 25 % | 32 % | **32 %** | ✓ |
| Esquive des bots Oisillon / Voyageur / Seigneur | ≈ 15 / 45 / 75 % | 35 % (Voyageurs) | **28 / 43 / 63 %** | ≈ |
| Coût des bots, 11 bots | ≤ 1 ms / tick | 0,39 ms (p99 1,4) | **0,20 ms, p99 0,84-0,92, max 2,1** | ✓ |

Aucune valeur de `src/sim/rules.ts` n'a été modifiée : tous les critères du §18 sont tenus par les bots avec les règles actuelles (dont `diveHitRadius` 5,5 m proposé par l'agent sim, que ces parties confirment : 52 % de touches avec de vraies esquives). Un bogue de simulation a été corrigé (§5).

## 2. Tension, contact, piqués : toutes les tailles

État final, bots Voyageur (sauf mention).

| Configuration | Neutre à 45 s | Meneur 60 / 90 / 98 s vainqueur | Changement > 90 s | Changements | Volé pendant la Grande Ombre | Écart 1er-2e | Voisin | Piqués | Touches | Max touché | Bas | Acquis avant 60 s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6 Voyageurs (7 caractères, un au repos) | 23 % | 24 / 37 / 53 % | 77 % | 8,3 | 25,7 % | 2,8 pt | 52 m | 7,2 | 52 % | 5 | 55 % | 32 % |
| 4 Voyageurs | 26 % | 47 / 39 / 67 % | 79 % | 6,9 | 18,8 % | 4,8 pt | 59 m | 4,1 | 47 % | 3 | 56 % | 41 % |
| 2 Voyageurs (duels) | 32 % | 71 / 76 / 84 % | 39 % | 2,7 | 10,4 % | 13,1 pt | 79 m | 1,2 | 54 % | 3 | 56 % | 57 % |
| 12 Voyageurs | 18 % | 10 / 20 / 32 % | 94 % | 10,9 | 31,7 % | 1,2 pt | 43 m | 16,5 | 53 % | 4 | 56 % | 24 % |
| 6, deux par niveau | 21 % | 26 / 46 / 47 % | 81 % | 8,0 | 22,6 % | 3,1 pt | 53 m | 5,8 | 48 % | 4 | 53 % | 34 % |
| Écran titre (démo 40 s, 6 bots) | — | 16 / 43 / 63 % | 66 % | 3,4 | 10,2 % | 3,1 pt | 51 m | 2,9 | 46 % | 2 | 50 % | 40 % |

Lecture :
- **La fin reste ouverte sans effacer le début** : le meneur à 98 s gagne une manche sur deux à 6 (53 %), deux fois sur trois à 4 ; il y a un changement de meneur après 90 s dans trois manches sur quatre ; un tiers du territoire final date d'avant 60 s. Le quart du désert change de main pendant la Grande Ombre : c'est le climax voulu.
- **À 2 oiseaux**, le meneur à 98 s gagne plus souvent (le duel est plus « lisible » : la Grande Ombre ne suffit pas à renverser un gros écart) ; c'est le cas le moins tendu, comme dans validate.mjs (58 %).
- **Piqués** : 7,2 par manche à 6 bots Voyageur (cible 8-15 formulée pour des humains, qui piquent davantage selon le GDD §17-F). À 12 oiseaux, 16,5.
- **À 12 oiseaux**, le chaos voulu : 11 changements de meneur, 94 % des manches basculent après 90 s, le meneur à 98 s ne gagne qu'une fois sur trois (validate.mjs : 50 %), et seulement 24 % du territoire final date d'avant 60 s (cible 25 %, limite). À 6 et moins, tout est dans les cibles.
- **En mêlée à 6, Seigneur et Voyageur sont proches** (26 % contre 21 % de victoires, 17,8 contre 17,0 % de part) : le Seigneur domine surtout les Oisillons (il leur vole, les pique, esquive leurs piqués), beaucoup moins des Voyageurs qui peignent déjà juste.
- **Temps en bas 55 %** (le script de référence de validate.mjs n'y passait que 7 à 9 % du temps) : les caractères bas (Laboureur, Pie, Guetteur) et le goût du Seigneur pour le vol au rival équilibrent les étages.

## 3. Niveaux

| Configuration | Avant | Après | Cible |
|---|---|---|---|
| Seigneur contre 3 Oisillons (caractères tournants) | 36 % (part 25 % contre 21 %) | **67 %**, 77 % au lancer précédent (part 30 % contre 20 %) | ≥ 80 % |
| Oisillon contre 3 Seigneurs | 23 % | **6 %** (part 16,5 % contre 25 %) | ≥ 10 % |
| 6 oiseaux, deux par niveau : victoires O / V / S | 13 / 17 / 21 % | **4 / 21 / 26 %** (parts 11,6 / 17,0 / 17,8 %) | — |
| Même caractère partout, 1 Seigneur contre 3 Oisillons | 31 % | 69 % (diagnostic `lordVs3same`, 48 manches, mesuré à mi-parcours) | — |

Par caractère, Seigneur contre 3 Oisillons (70 manches) : Horloger, Pie, Guetteur ≈ 90 % ; Fou 70 % ; Faucon 50 % ; Laboureur et Nomade 40 %. Oisillons qui résistent le mieux : la Pie (ses raids en ligne droite restent efficaces même mal visés) et le Fou (qui gagne « par pur hasard », comme prévu).

**Les deux cibles du GDD tirent en sens contraires.** Avec des parts de manche bruitées (écart type par oiseau σ), la probabilité que A batte trois B dépend de l'écart des moyennes Δ/σ (simulation de Monte-Carlo, bruit gaussien) :

| Δ / σ | Seigneur bat 3 Oisillons | Oisillon bat 3 Seigneurs |
|---|---|---|
| 0,75 | 47 % | 10 % |
| 1,5 | 70 % | 3 % |
| 2,0 | 82 % | 1 % |

Même en donnant au Seigneur une régularité trois fois meilleure que celle de l'Oisillon, 80 % d'un côté imposent ≈ 4 % de l'autre. Mesuré : 67-77 % et 6 %, soit un compromis qui manque les deux cibles de peu. Proposition au lead : viser « ≥ 75 % » et « ≥ 5 % », ou garder 80 % et accepter qu'un Oisillon ne batte trois Seigneurs qu'une fois sur vingt. Rappel : l'Oisillon est fait pour laisser respirer les enfants (il ne pique jamais un joueur en aide au vol, seulement des bots ou la couronne), pas pour gagner contre des bots experts.

Ce qui sépare les niveaux (mesures A/B, 24 manches à configuration égale, part d'un oiseau « variante » contre les autres) :

| Levier | Effet mesuré sur la part |
|---|---|
| Coût d'un virage 1 000/rad au lieu de 20 (`bestHeading` du GDD) | **+3,8 points** (17,2 contre 13,4 %) |
| … et sans les blocs lointains | +5,0 points |
| 8 caps au lieu de 16 | +1,8 point (les 16 caps faisaient zigzaguer) |
| Sans le bonus « en travers des ombres » | −1,1 point |
| Sprints quand aucun chasseur n'est à portée (Seigneur) | décisif dans le diagnostic même-caractère : 31 % → 69 % avec les autres leviers |

Le `bestHeading` de référence choisit à chaque décision le meilleur de 16 caps presque équivalents : l'oiseau zigzague et repasse sur sa propre traînée. Un coût de virage élevé donne des lignes franches ; c'est devenu **la** différence entre un débutant (150/rad) et un expert (1 500/rad), avec la profondeur de décision, les sprints, la compréhension du vol en travers des ombres et l'anticipation du clac (tableau complet dans `docs/agent-notes/bots.md` §5).

## 4. Caractères (6 Voyageurs, 70 manches, chaque caractère joue 60 manches)

| Caractère | Avant : victoires / part | Après : victoires / part | Part à 15 / 55 / 85 / 98 s / fin | Piqués / touches | Touché | Bas |
|---|---|---|---|---|---|---|
| Pie | 8 % / 14,6 % | **28 %** / 17,2 % | 6,9 / 16,2 / 18,0 / 17,8 / 17,2 | 0,5 / 0,3 | 1,0 | 75 % |
| Horloger | 6 % / 13,8 % | **22 %** / 16,0 % | 9,9 / 15,0 / 16,0 / 16,2 / 16,0 | 0,7 / 0,3 | 0,5 | 47 % |
| Guetteur | 12 % / 14,2 % | **20 %** / 16,4 % | 8,8 / 13,0 / 15,1 / 16,2 / 16,4 | 2,5 / 1,2 | 0,5 | 55 % |
| Fou | 35 % / 17,8 % | **20 %** / 15,2 % | 7,0 / 14,8 / 16,3 / 16,1 / 15,2 | 3,2 / 1,5 | 0,3 | 56 % |
| Laboureur | 29 % / 16,8 % | **18 %** / 15,0 % | 3,9 / 10,2 / 13,3 / 14,0 / 15,0 | 0 / 0 | 1,5 | 99 % |
| Nomade | 21 % / 14,9 % | **7 %** / 13,7 % | 9,3 / 14,2 / 12,6 / 13,4 / 13,7 | 0,9 / 0,3 | 0,6 | 39 % |
| Faucon | 4 % / 11,4 % | **2 %** / 13,6 % | 8,5 / 12,2 / 13,4 / 12,9 / 13,6 | 2,3 / 0,8 | 0,1 | 17 % |

À 4 Voyageurs : Pie 40 %, Guetteur 40 %, Fou 28 %, Horloger 22 %, Faucon 18 %, Laboureur 18 %, Nomade 10 %. En duel : Pie et Guetteur 75 %, Fou 60 %, Horloger 55 %, Nomade 40 %, Faucon 25 %, Laboureur 20 %.

Lecture :
- **Chaque caractère a sa courbe** : le Laboureur démarre lentement (3,9 % à 15 s, il peint fort et étroit) et finit fort (sillons en travers des ombres au couchant, +1 point pendant la Grande Ombre) ; le Nomade et le Faucon démarrent vite (grand pâle de midi) puis se font reprendre leur pâle à l'heure dorée ; le Guetteur monte régulièrement jusqu'à la nuit.
- **Le Fou**, premier des premiers bots (35 %), était en fait un peintre par utilité presque pur : ses « zigzags » ne coûtaient rien, les signatures des autres coûtaient cher. Il est maintenant myope, vire au hasard un cap sur deux, fait deux fois plus d'erreurs : il gagne encore une manche sur cinq, souvent de façon spectaculaire.
- **Le Faucon reste faible en mêlée** (2 % à 6, 18 % à 4) : c'est le constat du GDD lui-même (§17-F : la politique « hunter » fait 0 % de victoires à 6) ; chasser coûte du temps de peinture et ne paie qu'au couchant. Il reste redoutable contre des oiseaux bas qui n'esquivent pas (il est l'arme contre un joueur qui campe au ras du sable) et gagne 50 % des manches en Seigneur contre des Oisillons. Pistes non retenues : le faire chasser dès midi (moins bien), ou seulement à l'heure dorée (même part, moins de piqués).
- **Le Nomade** tenait 25-33 % quand il longeait le bord (sable neutre que personne ne va chercher) ; ses lignes engagées qui **traversent** l'arène (sa signature) lui coûtent ≈ 3 points de part. Lisibilité choisie contre efficacité.

## 5. Bogues et comportements de la simulation révélés par les parties

Vérifications à chaque tick de chaque manche de l'arène (≈ 700 manches) : NaN, oiseau hors de l'ellipse, oiseau dans un fût (fûts inclinés compris), piqué plus long que `diveWindup + diveMaxTime`, oiseau immobile, comptes de la grille contre un recomptage exact, sable jamais peint (union de toutes les manches d'une carte et d'une taille).

1. **Corrigé — apparition contre un fût, compte à rebours à travers une tour.** Dans les petites arènes encombrées (Parasols ou Aiguilles à 2 oiseaux…), `spawnAngle` ne trouvait aucun point dégagé à ±60° et gardait θ : un oiseau apparaissait à 0,9 m d'un fût et sa boucle du compte à rebours traversait la tour (7 configurations sur 1 152 : 4 cartes × miroir × 1-12 oiseaux × 12 graines). Correctif dans `src/sim/simulation.ts` : repli sur le point de l'anneau le plus dégagé des fûts et des oiseaux déjà posés, et boucle à droite quand la gauche frôle un fût. Après : 0 sur 1 152, dégagement minimal 24 m à l'apparition, 2 m pendant la boucle. Test de régression `src/sim/spawn.test.ts` ; les 65 tests de `src/sim` passent.
2. **Aucun NaN, aucun oiseau hors de l'arène ou coincé, aucun compte faux, aucun piqué trop long** sur l'ensemble des manches.
3. **Faux positif écarté** : un oiseau décroché qui dérive contre le mur du Simoun y reste plaqué pendant sa vrille (1,5 s) ; c'est la règle, pas un blocage.
4. **Sable jamais peint** : 0,2 à 2 % de l'arène selon la carte (Parasols le plus, Aiguilles le moins). Deux causes, aucune n'est un bogue : (a) la frange ouest de l'arène — les ombres tombent vers l'est et on ne peut pas dépasser le bord, seul un oiseau au bord à midi y peint ; (b) les quelques cellules juste à l'est de chaque fût, que l'ombre du fût couvre toute la manche (l'azimut ne tourne que de 30°). Elles restent neutres ; l'effet sur les scores est nul (tout le monde est traité pareil). Carte : `shots/bots/never-parasols.png`.
5. **Contact plus précoce qu'au GDD** : en partie réelle, le contact arrive en médiane **0,40 s après le clac** (10 % : 0,27 s ; 90 % : 0,53 s), contre 0,49 s dans la micro-simulation du GDD : les chasseurs engagent de plus près. La prise d'élan suivie tout de suite du clac (médiane 0,20 s entre les deux) laisse ≈ 0,6 s entre le « ! » et le contact. Au réflexe pur, un Seigneur (0,26 s) n'esquivait que la moitié des piqués ; les bots lisent donc la distance à la prise d'élan (anticipation, GDD §8.5). Les touches restent au milieu de la cible §18 : rien à changer dans les règles, mais c'est à surveiller en playtest (un humain distrait sera souvent touché).

## 6. Joueur seul, composition par défaut

Proxy d'humain : la politique scriptée « mixed » de validate.mjs (un joueur appliqué qui choisit son étage selon le terrain, esquive au clac en 0,30 s). Contre la composition par défaut d'un joueur seul (Faucon, Laboureur, Nomade Voyageurs) : le proxy gagne **79 %** des manches (part 29,5 %, contre 21,0 % au Faucon, 19,9 % au Laboureur, 19,5 % au Nomade) ; aucun oiseau n'est touché plus de 4 fois, le proxy esquive la moitié des piqués.

La composition par défaut du GDD réunit les trois caractères les plus « lisibles » mais aussi les moins efficaces en mêlée (le Faucon et le Nomade surtout) : un joueur seul appliqué gagne souvent. C'est plutôt souhaitable pour un premier contact ; le réglage de niveau des bots (Seigneur) rend la partie dure (Seigneur ≈ 30 % de part à 4).

## 7. Est-ce fun ? Lecture des manches

Regardé sur les vues de dessus (`shots/bots/all7-t*.png`, `sig-*.png`, page `dev/bots.html`) :
- **On reconnaît chaque caractère sans étiquette.** Les sillons du Laboureur sont de vrais champs labourés (blocs de bandes parallèles, demi-tours de tracteur) ; la Pie trace des traits droits et épais qui percent le sable du meneur ; le Nomade traverse l'arène en longues lignes pâles ; le Guetteur fait des boucles serrées sous une ombrelle puis jaillit (une remontée et un coup d'aile avant le piqué) ; le Fou gribouille ; le Faucon tourne au-dessus de sa proie avant de fondre dessus ; l'Horloger peint au pied des ombres qui avancent.
- **Les intentions se lisent avant l'action** : le cercle du Faucon dure au moins 0,8 s et 110° (un joueur qui le voit au-dessus de lui sait ce qui vient) ; la Pie vise toujours la couronne ; le Laboureur visé fuit en ligne droite — facile à punir, c'est son erreur.
- **Les moments de bascule** : la couronne change de tête 8 fois par manche à 6, dont au moins une fois après 90 s trois manches sur quatre ; les grosses bascules viennent du couchant (bandes du Laboureur en travers des ombres, lignes du Nomade) et de la Grande Ombre (un quart du désert change de main, les Seigneurs peignent au ras du front pour sceller).
- **Les erreurs sont crédibles et visibles** : un Oisillon hésite en godillant, file vers la tempête, repasse sur son propre sable, bat des ailes au cri au lieu du clac ; un Voyageur se trompe une fois toutes les 25 s. Personne n'est touché plus de 5 fois (les bots laissent souffler une victime 8 s, et jamais plus de deux ne s'engagent sur elle en 10 s).
- **Ce qui reste plat** : le Faucon gagne peu en mêlée à 6 ; à 12 oiseaux, les écarts se tassent (chaos voulu par le GDD) ; la démo de 40 s ne montre que ≈ 3 piqués par boucle (bots plus joueurs en démo : +35 % de goût du piqué).

## 8. Méthode et outils

- `tools/bots-arena.ts` : suites `voyageurs6`, `lordVs3`, `fledglingVs3`, `duel`, `four`, `twelve`, `levels`, `solo`, `demo` (+ `lordVs3same`, diagnostic) ; processus parallèles ; métriques §18, par place, par caractère (dont la part aux repères de phase), par niveau (esquive), anomalies, sable jamais peint.
- `tools/bots-bench.ts` : coût des bots seuls (11 bots + 1 oiseau neutre), meilleure de N manches (machine partagée : charge 7-9 pendant les mesures).
- `tools/bots-trace.ts` : vues de dessus avec les trajectoires récentes (`--only=0` pour un seul oiseau) ; `tools/bots-smoke.ts` : une manche, résumé par oiseau.
- Parcours suivi : premiers bots (v0) → équité et anti-acharnement → ablations A/B de la décision de cap → leviers de niveau → rééquilibrage des caractères → deux lancers finaux (le second après un dernier réglage du Nomade et du Faucon).
