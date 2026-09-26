# Polish vague 2 — correcteur title (cinématique de l'écran titre)

Port 8852. Captures : `shots/polish2/title/`. Ordres traités : verify-eyes §4.2 et §5.2, ORDERS S4
(resté partiel en vague 1). Fichiers : `src/host/camera/cine.ts` (réécrit), `src/host/camera/demoFuture.ts`
(nouveau), `src/host/camera/cine.test.ts` (nouveau), `src/host/camera/director.ts` (parties titre,
chargement et crédits). Hors périmètre : 4 lignes dans `src/host/runner/runner.ts` (voir §5).

## 1. Résultat

**Aucune image ratée mesurée, en banc comme en jeu.**

| Mesure | Avant | Après |
|---|---|---|
| Banc headless, même juge strict pour les deux caméras (`compare.ts`, 3 graines × 4 cartes, 5 400 images) | 4 201 ratées (77,8 %) | 9 (0,2 %, 8 « aucun oiseau entièrement hors de l'UI » en mode plan large, 1 tour) |
| Banc headless, juge avec sujet (`bench.ts --boot=3.3`, 7 graines × 4 cartes = 28 boucles, 20,5 min de titre, 12 501 images) | — | **0** |
| Jeu réel, une capture par seconde pendant 3 min (`every.mjs`), menu fermé | 39/181 signalées par la caméra de la vague 1 (son détecteur, moins strict) ; à l'œil, environ 20 ratées sur les 48 premières | **0/181** signalée, 0 ratée à l'œil (181 regardées) |
| Idem, menu ouvert (`--menu=1`) | — | **0/181** signalée ; 3 planches regardées, aucun oiseau sous le menu |
| `art/title.mjs`, 3 lancements (3 graines), ~50 images chacun | — | 0 ratée (planches `sheet-art-{a,b,c}-{1,2}.jpg`, toutes regardées) |
| `qa/titlecut.mjs`, 3 lancements (raccord chargement → titre) | — | 24/24 composées, aucune vide (`sheet-titlecut-final.jpg`) |

Critères de « ratée » (juge `frameFault`, `cine.ts`) : tour à moins de 63 m de plus de 12 % de la
largeur, ou de plus de 7 % au milieu de l'image ; tour de plus de 12 % jusqu'au sujet (18 % au-delà) ;
grand fût coupé par le haut au milieu ; sujet collé à une tour ; tour derrière le logo ou le pitch ;
sujet sous une case de l'UI (cœur jamais, boîte ≤ 10 %), coupé, caché, trop petit (< 4 % de la largeur) ;
autre oiseau net en partie caché par une case ; oiseau sur l'objectif (> 45 %) ; Simoun en gros plan ;
plan large sans oiseau net. Le menu reste réservé même fermé.

Rythme (banc, 28 boucles) : prise moyenne 2,7 à 2,9 s, soit ~16 coupes par boucle de 44 s ; 16 prises de
moins de 0,8 s en 20 min (~1 toutes les 80 s). Coût caméra par image : 0,27 ms en moyenne, p99 3,1 ms,
p99,9 ≈ 8 ms (machine chargée à 15-20 de charge moyenne) ; la jumelle double le coût de la sim de la
démo (~0,5 ms par tick).

## 2. Comment

1. **Avenir exact de la démo** (`demoFuture.ts`). La démo est une boucle fermée : sim pure, bots à
   graine. Une jumelle (même configuration, bots neufs aux mêmes graines, même `InputRouter`) tourne
   jusqu'à 8 s en avance. Vérifié : identique au tick près sur 1 250 ticks et sur les 4 cartes. Chaque tick
   de la vraie démo est comparé à la jumelle ; au moindre écart, repli sur l'extrapolation (jamais observé).
   La démo suivante est construite pendant un temps mort (travail du correcteur tech) ; sa jumelle prend
   alors son avance au repos du navigateur. La première prise de chaque boucle a donc, elle aussi, 8 s
   d'avenir exact.
2. **Prises validées avant la coupe.** Chaque candidate est *simulée* sur toute la durée du plan
   (ressorts, cadreur, visée, garde-fous du réalisateur compris). Le tri se fait au pas de 0,2 s, puis
   une vérification fine au pas de 0,05 s. Elle n'est montrée que propre ; au premier défaut prévu,
   coupe franche 0,25 s avant, sur une prise cherchée d'avance. Au choix, le juge est plus strict (cases
   élargies, seuils −7 %, cœur des oiseaux balayé sur ± 0,07 s) : l'écart simulation / rendu ne franchit
   jamais un seuil à l'image. La prise rendue est resimulée toutes les 0,5 s depuis son état réel.
3. **Plan de repli toujours disponible** : `sky`, une poursuite libre (lacet choisi autour de l'oiseau,
   face au soleil d'abord), en contre-plongée légère (−6°, silhouette sur l'horizon, contre-jour),
   contre-plongée franche (−20°), plongée franche (+40° : l'oiseau et son ombre sur le sable peint) et
   plan zénithal (+62°, dernier recours au milieu des tours). Replis par plan voulu, puis choix par
   beauté : parmi les prises qui tiennent 2 s (belles) ou 3 s, la plus belle (`rankOf`), sinon la plus
   longue.
4. **Le réalisateur prépare le plan suivant** sur un second `CineShot`, pendant les 2,4 dernières
   secondes, par tranches de 64 jugements et de 1,6 ms au plus par frame. Aucun à-coup à la coupe. Même
   chose pour la première prise de la démo suivante, pour la prise d'ouverture pendant l'écran de
   chargement et pour le plan suivant des crédits. Une prise qui finit moins de 1,2 s avant la coupe
   prévue passe la main au plan suivant plus tôt.
5. **Cadreur** : le sujet ne garde que 35 % de sa dérive (virages, retard des ressorts). Il ne glisse plus
   sous le logo ni sous le menu.
6. **Horloge des plans = temps de la démo** (`dt × gameView.timeScale`). Le ralenti ×0,5 de la dernière
   seconde avant la nuit décalait l'horloge de 1 s : c'était l'origine du dernier raté vu en jeu
   (`final-menu`, première passe, 43,6 s : tour derrière le pitch).
7. **Séquence** : track 0 → crane 0,14 → group 0,3 → track 0,44 → group 0,58 → sunset 0,72 → sunset 0,9,
   puis jusqu'au rebouclage. Le dernier plan dure jusqu'au rebouclage réel (T + 4 s), plus au-delà. La vue
   large qui tourne (`orbit`) est retirée : l'action tombait sous le pied de page, avec une moitié d'image
   de sable vide (`v1/sheet-01`, 022-026). L'entrée dans le titre est toujours une coupe (le fondu depuis
   les crédits passait par des poses non vérifiées).
8. **Bugs trouvés au banc et corrigés** :
   - l'extrapolation ramenait vers l'intérieur un oiseau au bord de l'arène, même à l'image présente (le
     cadreur visait à 4,5 m du vrai oiseau) ;
   - la marge élargissait les cases de l'UI, donc divisait la couverture et rendait le juge *moins*
     strict ;
   - un oiseau entièrement caché par une case comptait comme « à moitié caché » ;
   - un dernier plan finissait à 1,13 u : prises inutiles de 0,1 s juste avant le rebouclage.

## 3. Preuves (à regarder)

- Avant : `shots/polish2/title/base/sheet-00..07.jpg`. Tours au premier plan, vue large sous le pied
  de page, image vide au rebouclage (`base/046`).
- Après : `final-a/sheet-00..07.jpg` (3 min), `final-menu/sheet-00..07.jpg` (menu ouvert), puis
  `sheet-art-{a,b,c}-{1,2}.jpg` et `sheet-titlecut-final.jpg`. Étapes intermédiaires : `v1`, `v2`, `v3`.
- Banc : `npx tsx tools/polish/title2/bench.ts --seeds=1,2,3 --boot=3.3` (ajouter `--log --plans` pour
  le journal des choix) ; avant / après : `npx tsx tools/polish/title2/compare.ts [--old]` (la caméra
  d'avant est figée dans `tools/polish/title2/_old/`).
- Tests : `npx vitest run src/host/camera` : 81 tests verts, dont les 5 nouveaux de `cine.test.ts` (cases
  de l'UI, juge, jumelle au tick près, 20 s de démo filmée sans image ratée). `vitest src/host src/shared` :
  158 tests verts. `tsc --noEmit` : 0 erreur. `check:boundaries` OK. Console propre sur toutes les captures.

## 4. Limites et non fait

- **Goût** : au milieu des tours (surtout en fin de journée, Parasols et Cadran), la seule prise propre
  est souvent la plongée sur le sable peint (15 à 20 % des images). Elle est graphique et dit « l'ombre peint
  le désert », mais les aplats saturés du soir font « tapis » (même remarque que verify-eyes §5.4, côté
  monde). J'ai essayé une plongée douce à +18° : les plongées franches passaient de 15 % à 0,4 %, mais le
  rythme devenait plus haché (38 prises courtes contre 16) et 8 images ratées apparaissaient au
  rebouclage. Essai retiré.
- **Contre-jour pur (`sunset`)** : rarement valide tel quel, car le soleil est souvent derrière une
  forêt de tours. Le repli « sky −6° face au soleil » donne le même contre-jour et prend presque toujours
  la place (environ un tiers des images).
- **Rythme** : une coupe toutes les 2,7 s en moyenne, rythme de bande-annonce. Il reste environ une prise
  de moins de 0,8 s toutes les 80 s, quand aucune candidate ne tient.
- Une image **entièrement crème** (canvas vide, UI seule) a été vue une fois dans une rafale `titlecut`
  (`shots/qa/title2-cut/006`), sans suite dans 11 autres rafales ni dans plus de 1 000 captures. Aucune pose non finie au
  banc. Hypothèse : perte momentanée du contexte WebGL, GPU partagé par 6 Chrome. Garde-fou ajouté quand
  même : une pose non finie n'est jamais affichée.
- Autres aspects d'écran : 4:3 et 21:9 vérifiés au banc seulement (0 raté), pas en capture.
- Observé, pas à moi : un petit cercle noir flotte parfois près d'un oiseau au titre (`final-menu/095`,
  `v3/015`). Probablement un effet d'oiseau (repère de verrouillage ?), à signaler à birds.

## 5. Modifications hors de mes fichiers (Edits ciblés)

- `src/host/runner/runner.ts`, 4 lignes (noté dans `docs/agent-notes/REQUESTS.md`) : import de
  `demoFuture`, `demoFuture.prebuild(...)` dans `buildDemo`, `demoFuture.begin(...)` dans `startDemo`,
  `demoFuture.follow(st)` après `sim.step` dans `tick()` pour la démo. Le correcteur tech réécrivait
  `startDemo` en même temps : ces lignes s'appuient sur son `buildDemo`.
- `docs/agent-notes/staging.md` : nouveau §10 (titre, vague 2), renvoi dans §2.

Outils ajoutés : `tools/polish/title2/` : `bench.ts`, `compare.ts` (+ `_old/`), `every.mjs`,
`blank.mjs`.
