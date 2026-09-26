# Agent qa — QA d'intégration (phase 3)

Mission : faire tourner le jeu complet comme un vrai groupe, trouver ce qui est cassé, confus, laid
ou incohérent dans les raccords entre modules, et le corriger. Serveur de dev : port 8813 ; build
de production : port 8814.

## 1. Outillage (tools/e2e/qa/**, captures dans shots/qa/<scénario>/)

| Script | Ce qu'il joue |
|---|---|
| `lib.mjs` | aides : téléphones émulés (touches CDP), rejoindre, réglages persistés, repérage des clés brutes `domaine.cle` dans le DOM |
| `pilot.mjs` | pilotes « humains » : `PhonePilot` (pouce sur le joystick, PLONGER / COUP D'AILE en multi-points CDP) et `KeyboardPilot` (groupe 1 ou 2). Ils lisent la sim sur la page du PC : errance dans l'arène, alternance haut / bas, PIQUER quand une cible est verrouillée, COUP D'AILE au clac quand on les pique, fuite vers l'est à la Grande Ombre |
| `probe.mjs` | sondes dans la page du PC : journal des textes visibles (récitatif, bannières, bulles, toasts, écrans) et temps d'image (rAF) |
| `boot.mjs` | chargement → titre (10 captures sur 35 s) → menu → réglages → crédits, à vitesse réelle |
| `titlecut.mjs` | rafale sur les premières images du titre (raccord chargement → titre) |
| `group.mjs` | **le scénario principal**, à vitesse réelle : PC + iPhone 15 Pro + Pixel 7 + un joueur au clavier ; salon (QR, profils, objectifs, bot ajouté puis retiré), cartes, 3 manches pilotées, entractes, podium, revanche votée, pause PC puis téléphone, retour au salon depuis la pause. `--speed=4` pour une passe rapide |
| `keyboard12.mjs` | 100 % clavier (WASD + IJKL) + 10 bots = 12 oiseaux, une manche à vitesse réelle ; en cours de manche : langue EN **par l'interface** (pause → Réglages), daltonien, qualité basse puis haute, narrateur texte puis muet ; temps d'image et charge GPU par segment |
| `resilience.mjs` | solo avec UN téléphone contre les bots ; le téléphone rejoint au titre ; PC rafraîchi au salon, aux cartes, en manche, aux résultats, au podium ; coupure réseau du téléphone → remplaçant → retour ; téléphone rafraîchi ; pause téléphone / reprise PC ; vote « Salon » |
| `podium12.mjs` | podium dense (1 clavier + 11 bots, 1 manche accélérée) |
| `prod.mjs` | build de production servi par `node dist-server/server.mjs` (8814) : chargement nu (temps, poids, console), puis PC + Pixel 7 ; **serveur arrêté et relancé en pleine manche** par le script |

Rejouer : `PORT=8813 pnpm dev` puis `node tools/e2e/qa/<script>.mjs` ; `pnpm build && node tools/e2e/qa/prod.mjs`.
Régression du runner sur le même port : `PORT=8813 node tools/e2e/{solo,phones,flows}.mjs` (verts).

## 2. État du jeu (vérifié en images et en comportement)

Joué de bout en bout, sans erreur ni avertissement console (PC, iPhone, Pixel), sur le serveur de dev et
sur le build de production :

- **Chargement → titre** : 3 s en local (prod), progression réelle ; titre en plan de grue serré sur un
  oiseau, 6 plans de démo en boucle, menu, réglages, crédits.
- **Salon** : QR + code, 2 téléphones (profil, couleur, objectifs Vole / Plonge ; Pique au clavier sur le
  mannequin), joueur clavier, bots par défaut tenus à jour, bot ajouté / retiré à la souris, 12 oiseaux
  (« Complet »).
- **Partie** : cartes (Compris), 3 manches pilotées par téléphones et clavier à vitesse réelle, narrateur
  (6 à 8 répliques par manche, horloge complète), indications TV + téléphone (libellés de touches au
  clavier), bannières, bande de sable, piqués / esquives / décrochages, nuit → montée → carte → résultats,
  soleils, faits marquants, podium avec titres, revanche votée, vote « Salon ».
- **Robustesse** : remplaçant à 3,1 s, main rendue 0,1 s après le retour ; PC rafraîchi au salon, pendant
  les cartes, en manche (« 3, 2, 1 », soleil ±0,4 s), aux résultats, au podium ; téléphone rafraîchi ;
  serveur de production arrêté puis relancé en pleine manche (manche gelée, surcouches PC et téléphone,
  même salle, aucun remplaçant, reprise).
- **Réglages en jeu** : langue EN par l'interface (pause → Réglages), daltonien (motifs + jetons), qualité
  basse / haute à chaud, narrateur texte puis muet (plus aucun récitatif), conseils.

## 3. Mesures

- **Temps d'image** (rAF, 1080p, iGPU Renoir = classe Vega 6 visée, un seul Chrome) : 4 oiseaux, manche
  réelle : 59,9-60 i/s, p99 16,8 ms (la 1re manche d'une session : p99 33 ms, compilations). 12 oiseaux en
  High : 57-60 i/s, 1 à 5 % d'images à 33 ms dans le couchant et la Grande Ombre.
- **GPU par passe à 12 oiseaux** (timer queries, `tools/e2e/qa/gpu12.mjs`) : High 10,0 (midi) → 11,3 ms
  (Grande Ombre) [ombres 0,1-0,35 · G-buffer 6,5-7,3 · encre 1,7 · SMAA 1,8-2,0] — au-dessus du budget de
  10 ms en fin de manche ; Medium 7,3-7,8 ms ; Low 3,6-4,0 ms. CPU du pipeline ≈ 2 ms. `gpu_busy` 70-92 %.
- **Poids servi** : `dist/` 22 Mo (audio 19,3 Mo : musique 7, narrateur 9,5, bruitages 2,8), sous les 40 Mo
  visés. Transféré jusqu'au titre (+2,5 s) : 4,0 à 6,9 Mo selon l'avance du flux musical (JS 0,58 Mo gz,
  bruitages 2,65, musique 0,7-3,6 en flux ; narrateur : manifeste seul, les voix des couleurs présentes au
  lancement de partie). Titre affiché en 2,8-3,0 s (local, build de production). Téléphone : 0,19 Mo.

## 4. Corrections faites (toutes vérifiées en capture ou par test)

| # | Problème constaté | Correction |
|---|---|---|
| 1 | **Le premier humain recevait Lagon au lieu de Corail** (et chaque humain la 2e couleur libre) : `humanColor()` comptait la couleur provisoire du joueur qu'on colorait | `Roster.humanColor(except)` ; test `src/host/runner/players.test.ts` |
| 2 | **Qualité « auto » : le preset descendait d'un cran à chaque entracte** (High → Medium → Low en trois manches) sur tout écran 60 Hz : la moyenne des intervalles d'image (16,7 ms, calés sur la synchro) était comparée à 15 ms | `QualityMonitor.limitMs()` : max(15 ms, 1,15 × intervalle d'affichage estimé, plafonné à 60 Hz) ; test `src/host/render/quality.test.ts` ; vérifié sur 3 manches (`autoquality.mjs`) : reste en High |
| 3 | **Première image du titre = un mur brun** (0,5 s) : la caméra glissait 2 s depuis le plan fixe du chargement, logé dans le fût d'une tour des Parasols | coupe franche au passage chargement → titre (`runner.enterTitle`) ; en plus, un suivi de la cinématique qui démarre caché par une tour essaie l'autre côté puis un autre oiseau avant sa première image (`cine.ts`, `freshCheck`) |
| 4 | **Bande de sable : la croix de Corail se lisait « + 33,1 % »** (un gain), et « couronne + » au-dessus | glyphes de la bande dans une pastille papier, jeton de couleur à côté de la couronne (`SandBar.tsx`, `hud.css`) |
| 5 | **Réplique du champion non sous-titrée au podium** (le récitatif n'était monté qu'en manche et aux résultats) ; muette donc en mode « texte » | `<Subtitle/>` aussi sur `matchResults`, placé au-dessus de la grille des titres (`UiRoot.tsx`, `hud.css`) |
| 6 | **Podium à plus de 6 joueurs** (demande staging → ui) : plaques montées à 25 %, oiseaux perchés cachés, grille des titres sur la moitié de l'écran | cartes de titres resserrées en mode dense (ni description ni statistiques), plaques à 37 % comme en mode normal ; `PLATE_TOP_DENSE` = 0,37 côté caméra (`results.css`, `camera/podium.ts`) |
| 7 | **Fin de partie sur iPhone** (659 × 393 px visibles) : le bas des deux cases sortait de l'écran | règles « paysage court » (`phone.css`, `@media (max-height: 430px)`) |
| 8 | **Aucun son d'interface** hors actions du runner : survol / focus, sélecteurs, curseurs de volume muets ; pause et reprise sans stinger | `setNavSound` / `uiSound` dans `nav.ts` (branché sur `playUi` par le runner), appelés par `Segmented` et `Slider` ; `playStinger('pause' / 'resume')`, `playUi('back')` au retour au salon, `confirm` en passant les cartes |
| 9 | **Remplaçant au bout de 5,5 s** au lieu de 3 s (GDD §14.3) pour un téléphone muet : l'absence comptait depuis le constat de silence (2,5 s) | l'absence compte depuis le dernier message (battement 1 Hz) : remplaçant à 3,1 s mesurés |
| 10 | **PC rafraîchi pendant les cartes des règles → retour au salon**, partie perdue | reprise sur les cartes (même partie, mémoire du narrateur) |
| 11 | Toast « X a perdu la connexion » pour un téléphone qui recharge sa page (absent 0,5 s) | toast différé de 1,5 s, annulé si le téléphone est revenu |
| 12 | Après la fermeture des Réglages, le focus revenait sur « Jouer » (Échap puis ↓ rouvrait les Réglages) | le focus revient à l'élément qui avait ouvert la surcouche (`nav.ts`) |
| 13 | Avertissement console `THREE.Clock … deprecated` à chaque lancement (R3F 9.8 instancie Clock ; versions figées D18) | `src/host/threeConsole.ts` : `setConsoleFunction` (API de three) écarte ce seul message, le reste passe |
| 14 | Crédits : la musique commençait par « Tongue A3, Tongue C4… » (9 lignes pour un seul lot), titres tirés des noms de fichiers (« Results cynicmusic synthwave4k »), police en double | fichiers d'une même source regroupés, titre de la source pour les morceaux (« Calm Ambient 1 (Synthwave 4k) ») (`credits.ts`) |
| 15 | EN : « Licence » | « License » (`strings/host.ts`) |

## 5. Modifications hors périmètre (minimales, notées dans les fichiers)

`src/host/runner/runner.ts` (1, 3, 8-11, `useSettings`/`useRenderQuality` exposés sous `?debug`),
`src/host/runner/players.ts` (1), `src/host/render/quality.ts` (2), `src/host/camera/cine.ts` (3),
`src/host/camera/podium.ts` (6), `src/host/ui/hud/SandBar.tsx` + `screens/hud.css` (4, 5),
`src/host/ui/UiRoot.tsx` (5), `src/host/ui/screens/results.css` (6), `src/phone/phone.css` (7),
`src/host/ui/nav.ts` + `components.tsx` (8, 12), `src/host/main.tsx` + `src/host/threeConsole.ts` (13),
`src/host/ui/credits.ts` (14), `src/shared/strings/host.ts` (15). Tests ajoutés : `players.test.ts`,
`quality.test.ts`. Aucun fichier de `src/sim` ni `src/bots` touché.

## 6. Vérifications de cohérence

- **Signes (GDD §2)** : chaque règle a son signe TV (empreinte forte / pâle, étincelles « tsk », chevron,
  « ! » + bordure rouge sur le téléphone, clac, tache, gerbe, plumes, bouts d'ailes, lavande figée, œil
  barré, couronne, rideau de sable) et son son (table `sfx.ts` : les 25 événements de la sim ont un son).
- **Textes** : 0 clé brute vue à l'écran (balayage du DOM à chaque étape, FR et EN, PC et téléphones) ;
  tables FR / EN symétriques ; 9 chaînes identiques FR = EN, toutes légitimes sauf « Licence » (corrigée).
- **Couleurs** : même couleur, nom et glyphe sur l'oiseau, le territoire, l'étiquette, la bande, le salon,
  le bandeau du téléphone, les résultats et le narrateur (« Safran » pour Brieuc à 3 endroits vérifiés).
- **Console** : propre partout après correction 13 (seules les erreurs de connexion pendant la coupure
  volontaire du serveur).

## 7. Limites connues (non corrigées)

- Un joueur au clavier ne peut pas quitter le salon (aucune touche prévue).
- Changer de langue pendant une réplique : la réplique en cours finit dans l'ancienne langue, seul le nom
  de couleur change (« Anise défie la tempête »).
- Libellé de touche du J2 en QWERTY : « Au clac : ; ! » (en AZERTY : « M »).
- Le son n'a pas été écouté (headless) : il est vérifié par l'absence d'erreur et par les appels ; une
  écoute humaine reste à faire. iOS et manette réels non testés (émulation).
- `tools/e2e/phones.mjs` (runner) échoue parfois quand on enchaîne les scénarios : en `?debug=fast` les
  cartes ne durent que 3,2 s et le script tape « Compris » après ses captures (course du script, pas du
  jeu) ; vert en passe isolée (3 fois).

## 8. Chantiers pour la phase de polish (priorisés)

1. **Playtest humain à 2-6 joueurs, puis équilibrage.** Contre mes pilotes scriptés, le Faucon par défaut
   gagne les 3 manches avec 33-36 % (écart « écrasant » à chaque fois) ; les bots n'ont été mesurés que
   contre des bots (bots.md §8). C'est la première inconnue du fun : faire jouer de vrais débutants au
   solo (1 téléphone + Faucon/Laboureur/Nomade) et à 4 humains, et régler `defaultBots(1)` (bots.md
   propose déjà Pie ou Guetteur à la place du Nomade) et le niveau par défaut.
2. **Écoute humaine du mixage.** Tout le son est vérifié par la mesure, jamais par l'oreille (audio.md
   §4) ; les sons d'interface viennent d'être branchés (survol, sélecteurs, curseurs, pause). Écouter une
   partie complète : fréquence du « tsk » (≈ 400 par manche), cris, clac, ducking sous le narrateur,
   volume relatif des 722 répliques. Un seul défaut d'oreille se remarque plus qu'un défaut d'image.
3. **Lisibilité à 9-12 oiseaux.** Le cadrage dézoome sur l'arène entière (preset 12) : oiseaux ≈ 30 px,
   étiquettes seulement aux événements. À 3 m d'une TV, on perd son oiseau. Pistes : étiquette permanente
   discrète (glyphe seul) au-delà de 8 oiseaux, envergure minimale à l'écran plus haute
   (`birdRenderScaleMax`), halo de sa couleur sous l'oiseau du joueur quand il n'a pas bougé depuis 3 s.
4. **Budget GPU en High à 12 oiseaux** (11,3 ms en Grande Ombre sur Vega-classe, budget 10) : 1 à 5 %
   d'images à 33 ms au climax. Le banc du titre (6 oiseaux de démo) choisit High ; pistes : banc qui
   exige 20 % de marge, ou preset « auto » qui passe en Medium au lancement d'une partie à 9+ oiseaux,
   ou SMAA medium en High (−0,3 ms, levier déjà prêt côté world).
5. **Podium : les oiseaux perchés, en contre-jour, se lisent comme des silhouettes grises à ailes
   levées** ; la couronne flotte loin au-dessus du champion, souvent derrière la case du titre. C'est le
   dernier plan de la partie : un rim-light de la couleur du joueur ou un léger remplissage de face, et
   une couronne posée sur la tête.
6. **Cinématique du titre** : certains plans gardent une grosse tour au premier plan ou un oiseau qui
   traverse le logo (staging.md §6). Une passe de réglage sur `CLUTTER_MAX` et sur la zone du logo, avec
   la rafale `tools/e2e/qa/titlecut.mjs` sur plusieurs graines.
7. **Superpositions du HUD** : bulles d'indication et étiquettes peuvent passer sous la bande de sable ou
   sur une bannière de phase (vu : « Ombre de tour… » contre « COUCHANT ») ; deux bulles identiques pour
   deux joueurs au même instant. Une règle d'évitement simple (bande haute interdite, décalage vertical
   de la seconde bulle) suffirait.
8. **Téléphone au salon** : le joystick flottant se dessine par-dessus la carte des règles qui tourne au
   centre ; le toast d'indication défile coupé pendant l'essuyage. Déplacer la carte vers le haut ou la
   masquer tant qu'un pouce est posé.
9. **Petits trous de parcours** : un joueur au clavier ne peut pas quitter le salon ; mixage de langue
   d'une réplique en cours ; libellé « ; » du J2 en QWERTY dans les indications (afficher la touche en
   cartouche plutôt que le caractère nu).
