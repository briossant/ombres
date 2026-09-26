# Non-régression après le polish (vague 1)

Agent de non-régression, 2026-09-26, 13 h 30 → 14 h 35. Serveur de dev sur 8841, build de production
sur 8842, tous deux arrêtés à la fin. Tous les scénarios Playwright ont tourné avec
`tools/polish/verify/watch.mjs`, un préchargement qui coupe le HMR de Vite (comme `staging/nohmr.mjs`) et
journalise **toute** la console (avertissements compris) de toutes les pages, téléphones compris.

**Verdict :** le jeu passe tous les contrôles statiques et les sept scénarios de bout en bout, sans
erreur ni avertissement console. Je n'ai trouvé aucune régression de moteur ou de réseau. J'ai corrigé
deux régressions visibles, nées de la rencontre entre deux correcteurs, et quatre petits restes. En High,
le GPU coûte moins qu'avant le polish. La qualité « auto » tient 59 à 60 images/s à 12 oiseaux sur cette
machine.

## 1. Contrôles statiques

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 1 erreur au départ (`tools/polish/feel/bot-pressure.ts:35`, `'d.b' is possibly 'undefined'` : TS 7 ne rétrécit pas l'union par `'b' in d`), corrigée ; ensuite **0 erreur** |
| `pnpm check:boundaries` | Frontières OK |
| `npx vitest run` | **27 fichiers, 345 tests verts** (avant et après mes corrections). Seul bruit : l'avertissement Node `THREE_CJS_DEPRECATED` (`require("three")` dans une dépendance, côté test uniquement, rien dans le navigateur) |

## 2. Scénarios de bout en bout

| Scénario | Durée | Résultat | Console (PC + téléphones) |
|---|---|---|---|
| `tools/e2e/solo.mjs` (×2, avant et après les corrections) | 1 min 35 | 3 manches, fin de partie, revanche : vert | propre |
| `tools/e2e/phones.mjs` | 1 min 40 | 11/11 ✓, revanche votée | propre |
| `tools/e2e/resilience.mjs` | 1 min 20 | 17/17 ✓ ; remplaçant à 3,2 s ; reprise « 3, 2, 1 » ; soleil repris 23,93 → 24,47 | seules erreurs : les coupures réseau volontaires (`ws://localhost:9`) |
| `tools/e2e/flows.mjs` (×2) | 40 s | 15/15 ✓ | propre |
| `tools/e2e/qa/group.mjs` (vitesse réelle, 3 manches, PC + iPhone + Pixel + clavier) | 7 min 54 | tout le parcours, pause PC et téléphone, retour au salon | PC, A, B propres ; 0 clé brute |
| `tools/e2e/qa/keyboard12.mjs` (12 oiseaux, vitesse réelle, réglages à chaud) | 2 min 23 | EN, daltonien, Low ↔ High, narrateur texte puis muet : OK | propre |
| `tools/e2e/qa/prod.mjs` (build de production, `PROD_PORT=8842`) | 1 min 27 | 9/9 OK : **titre en 2,7 s**, 3,98 Mo transférés, téléphone 0,19 Mo, serveur coupé puis relancé en pleine manche (même salle, aucun remplaçant), revanche | propre, hors refus de connexion pendant la coupure volontaire |

Le build de production a été fait dans le scratchpad (`vite build --outDir …/vr-dist`) et servi par
`dist-server/server.mjs` avec `OMBRES_DIST`. Le serveur n'a pas changé depuis le dernier commit. Le
`dist/` du dépôt (build d'avant le polish, 09 h 28, référence A/B de world) est intact. Ce test couvre la
réserve de hostui (H13 : chargement jamais mesuré en production) et celle de game (G12 : `loadtrace` non
relancé).

J'ai regardé les images de chaque scénario (planches dans `shots/polish/verify/`).

## 3. Régressions et conflits corrigés

| # | Constat | Cause | Correction | Vérifié |
|---|---|---|---|---|
| 1 | **Podium à 4-6 joueurs : la couronne du vainqueur était cachée sous le bandeau du champion** (tête collée au bandeau, `solo/23-match-results-late.jpg`, `qa/group/151-podium-panel.jpg`) | Conflit S5 × B3 : S5 place les perchoirs à 72-84 px au-dessus des plaques, et B3 pose la couronne SUR la tête (`PERCH_CROWN_TOP_M` = 1,1 m). Avec le bandeau semi-transparent, le haut de la couronne était à y ≈ 172 px pour un bas de bandeau à 192 px (`podium/before-n4-1920x1080-ghost.jpg`) | `src/host/camera/podium.ts` : `PERCH_ABOVE_PLATE_PX` [84, 72, 84] → **[59, 47, 59]**, `towersDist` 46 → **48 m**. Couronne ≈ 10 px sous le bandeau ; le vainqueur reste le plus haut ; les oiseaux restent entiers au-dessus des plaques ; plaques de l'UI inchangées. Essai écarté : descendre les plaques de 37 à 40 %, car à 6 joueurs la plaque du 3e touchait le récitatif | `shots/polish/verify/podium/` : 4 joueurs en 1080p et en 4K (`crops-after.jpg`), 5, 6 et 12 joueurs (`v3-n5`, `v2-n6`, `v4-n12`), build de production (`qa/prod/010-podium.jpg`) ; test `director.test.ts` vert |
| 2 | **Cartes de titres à 5-6 joueurs : noms de bots tronqués** (« Carmin · … », « Azur · N… », `podium/after-n6-…-06500.jpg`) | H6 affiche « Couleur · Caractère » partout, mais l'empilement sur deux lignes n'était activé qu'au-delà de 6 joueurs ; hostui avait vérifié 4 et 12 joueurs, pas 5-6 | `MatchResults.tsx` : `stackName = cols >= 5` (le caractère passe sous la couleur dès 5 colonnes) ; prop `dense` retirée de `TitleCard`, où elle ne servait qu'à ça | `podium/v3-n5-…-09000.jpg` : « Safran / Pie », « Azur / Nomade » entiers |
| 3 | Titre « souverain » absent du miroir de l'UI | Demande G10 → hostui restée ouverte : `TITLE_UNITS['souverain']` était `undefined` à l'exécution, rattrapé par un cast | `viewModel.ts` : ajouté à `TitleId`, `TITLE_IDS`, `TITLE_UNITS` (`count`) ; commentaire de `uiTitleId` (`players.ts`) mis à jour | tsc, tests |
| 4 | Fin de manche sur le téléphone : « Biggest steal: …, +7.9% in 3 » puis « s » seul sur la ligne suivante (`runner/phones/10-phoneA-r1-roundEnd.jpg`) | espace simple entre le chiffre et l'unité | `host.fact.bigSteal` FR/EN : `3 s` | chaîne |
| 5 | Erreur tsc dans `tools/polish/feel/bot-pressure.ts` | union non rétrécie par TS 7 | `d.b ? d.b.think(…) : d.p!(…)` | tsc 0 erreur |
| 6 | `tools/e2e/qa/prod.mjs` : port 8814 écrit en dur | — | `PROD_PORT` (8814 par défaut) ; `OMBRES_DIST` passe déjà par l'environnement | prod vert sur 8842 |

## 4. Performance GPU à 12 oiseaux (iGPU Renoir, classe Vega 6)

Mesures faites GPU presque au calme : 0 % au repos, aucun autre Chrome headless, `gpu_busy` de 37 à 88 %
avec notre propre charge. Deux relevés :
`perfmatrix.mjs --q=low,medium,high --n=12 --speed=1` (requête TIME_ELAPSED sur toute l'image) et
`--passes --speed=2` (médianes par passe, `?debug=perf`).

| Preset (résolution) | Image entière p50 : midi → Grande Ombre | p90 au pire | Par passe au pire (ombres · G-buffer · encre · SMAA) | img/s |
|---|---|---|---|---|
| Low (1280×720) | 3,11 → 3,72 ms | 4,13 | 3,57 [0,23 · 2,55 · 0,80 · —] | 60,3 partout |
| Medium (1600×900) | 6,60 → 7,84 ms | 8,29 | 7,65 [0,27 · 5,07 · 1,12 · 1,19] | 60,3 partout |
| High (1920×1080) | 9,35 → 11,09 ms | 13,15 | 10,46 [0,27 · 7,06 · 1,53 · 1,61] | 57-60 (sonde active) |

Par rapport à la QA d'avant le polish (gpu12 : High 10,0 → 11,3 ms, Medium 7,3-7,8, Low 3,6-4,0), les
passes coûtent 0,8 à 1 ms de moins en High, autant en Medium et un peu moins en Low : **pas de régression
GPU**. High reste au-dessus du budget de 10 ms de l'heure dorée à la Grande Ombre (10,1-10,5 ms), mais sous
le seuil de descente de 11 ms. W3 reste donc partiel, comme world l'annonçait.

**Qualité « auto »** (`tools/polish/verify/auto12.mjs` : premier lancement sans banc mémorisé, 12 oiseaux,
2 manches à vitesse réelle, sans sonde GPU externe) :
- Le banc du titre choisit **High** : la scène du banc coûte p50 8,79 ms dans la sonde, pour un seuil de
  8,5 ms. **Ce choix est à la limite** : `autoquality.mjs` a obtenu Medium lors d'une autre passe, et les
  deux issues tiennent 60 images/s.
- Manches 1 et 2 en High : **59,1 à 60,1 images/s** à chaque phase ; au climax, p95 16,8 ms et 0,2 à 1,6 %
  d'images au-dessus de 20 ms. Avant le polish : 57-60 images/s et 1 à 5 % d'images à 33 ms. Le moniteur
  garde High aux entractes, sans oscillation.
- Avec Medium, 60,3 images/s et 0 % d'images au-dessus de 20 ms. `autoquality.mjs` (4 oiseaux, 3 manches) :
  le niveau reste stable, Medium → Medium → Medium.
- Dans `perfmatrix`, les 57 à 58 images/s en High viennent de la sonde (une requête TIME_ELAPSED par
  image). Sans sonde, `auto12` et `keyboard12` tiennent environ 60 images/s. Le passage de `keyboard12` à
  38-47 images/s en High date du moment où je lançais en parallèle des captures de podium en 4K : ce n'est
  pas une mesure propre.

## 5. Constats laissés tels quels (décision ou hors régression)

- **Téléphone :** en paysage sur iPhone, une indication posée sur le bandeau recouvre la pastille de rang
  pendant environ 2,8 s. C'est le choix assumé de P1 (« au-dessus de tout », capture
  `fix-phone/p1/play-toast-659x393.jpg`). Si la pastille doit rester lisible, il faut limiter la largeur de
  l'indication à l'espace entre le nom et la pastille.
- **`?debug=fast` uniquement :** le compte à rebours final « 5 » chevauche la bannière de la Grande Ombre,
  parce que la manche est raccourcie. À vitesse réelle, la Grande Ombre commence à 98 s et sa bannière dure
  2,5 s ; le « 5 » arrive à 105 s, donc 4,5 s plus tard (vérifié dans `group`).
- **`phones.mjs --rounds=2` :** la partie reste en 3 manches parce que `createMatch` n'accepte que 1, 3 ou 5
  manches (`RULES.roundsOptions`, déjà le cas avant le polish). Il faut utiliser `--rounds=1`. Ce n'est pas
  un bug du runner.
- **Demandes encore ouvertes dans REQUESTS.md :** `narrator.doubleHit` EN (« dive » → « strike », à
  régénérer avec son clip) ; `steer()` de `tools/e2e/qa/lib.mjs` (doigt collé), sans effet sur les
  scénarios rejoués ici.
- **Sans danger :** `framingRig.ts` réserve encore la place de la couronne avec `crownLift × scale`, ce qui
  surestime un peu.
- **Environnement :** pendant ma passe, un autre agent a modifié `src/shared/strings/phone.ts` (13 h 44 et
  13 h 46), et mon serveur de dev a été arrêté de l'extérieur vers 13 h 55 (relancé). Contrôles statiques et
  scénarios relancés ensuite : tout est vert.

## 6. Fichiers

- **Modifiés :** `src/host/camera/podium.ts`, `src/host/ui/screens/MatchResults.tsx`,
  `src/host/ui/viewModel.ts`, `src/host/runner/players.ts` (commentaire), `src/shared/strings/host.ts`
  (`bigSteal`), `tools/e2e/qa/prod.mjs`, `tools/polish/feel/bot-pressure.ts`.
  `src/host/ui/screens/results.css` a été modifié le temps de l'essai à 40 %, puis rétabli à l'identique.
- **Outils ajoutés** (`tools/polish/verify/`) :
  - `watch.mjs` : préchargement qui coupe le HMR et journalise la console ;
  - `podium.mjs` : podium à N joueurs, en 1080p et en 4K, avec une vue « bandeau fantôme » ;
  - `auto12.mjs` : qualité « auto » à 12 oiseaux, à vitesse réelle.
- **Captures :** `shots/polish/verify/` (planches solo, phones, group, prod ; `podium/` avant et après).
  Les scénarios rejoués ont aussi réécrit `shots/runner/{solo,phones,resilience,flows}` et
  `shots/qa/{group,keyboard12,prod}`.
