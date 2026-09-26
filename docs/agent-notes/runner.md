# Agent runner — le jeu complet côté PC (orchestration, entrées, réseau, persistance)

Fichiers : `src/host/main.tsx`, `src/host/App.tsx`, `src/host/runner/**`, `src/input/**`, `src/host/loading/**`,
`tools/e2e/**`, `index.html`. Le jeu se lance à la racine (`http://localhost:<port>/`), la manette sur `/play`.

## 1. Vue d'ensemble

```
main.tsx : runner.start() → <App/> → bootGame()
  runner.start()   HostSession + PhoneHub (salle prête dès le chargement : QR prêt au titre),
                   clavier/manettes, actions de l'UI, réglages, sous-titres, beats caméra,
                   démo de l'écran titre (tourne derrière le chargement : rendu de chauffe)
  bootGame()       polices → textures → manifeste des voix → sons (octets réels) → chauffe
                   des shaders (N images stables) → runner.finishLoading() (reprise ou titre)
App.tsx          <WorldCanvas> : RunnerFrame (−10) · PodiumStage (−3) · GameCamera (−2) ·
                 HudProjector (−1,5) · Birds (−1, modes = stageModes) · Fx (0, gloire) ; <UiRoot/>
```

- `src/host/runner/runner.ts` — la classe `Runner` (singleton `runner`) : machine à états, boucle à pas fixe,
  joueurs, bots, directeurs, téléphones, sauvegarde. Aucune règle de jeu (tout est dans `src/sim`).
- `players.ts` (roster sérialisable : slot, couleur, nom, type, bot, aide, profil, prêt, vote, spectateur),
  `views.ts` (vues `PhoneView` par écran), `persist.ts` (sauvegarde sessionStorage), `debug.ts` (options
  `?debug`), `RunnerFrame.tsx` (useFrame −10), `stageStore.ts` (gloire du podium pour `<Fx/>`).
- `src/input/**` — couche d'entrée unique (voir §3).
- `src/host/loading/loader.ts` — manifeste de chargement.

## 2. Écrans (machine à états `runner.phase`)

| Phase | Écran UI | Caméra | Audio | Simulation | Téléphones |
|---|---|---|---|---|---|
| `boot` | loading | loading | — | démo (chauffe) | lobby |
| `title` | title | title | title | démo `demoTeam(6)`, change de carte à chaque boucle | lobby |
| `credits` | credits | credits | credits | démo | lobby |
| `lobby` | lobby | lobby | lobby | lobby (joueurs + bots + mannequin) | lobby (profil, objectifs, Lancer) |
| `rules` | rules | rules | intro | lobby (continue) | intro (Compris) |
| `round` | game | round → roundResults (à `night`) | round | manche | play |
| `roundResults` | roundResults (au beat `mapReady`) | roundResults | roundResults | manche finie | roundEnd (Prêt) |
| `matchResults` | matchResults (au beat `podiumReady`) | podium | gameResults | manche finie (podium de staging) | matchEnd (votes) |

- **Titre** : banc de qualité (`startQualityBench`) 2,5 s après l'arrivée si aucun résultat n'est mémorisé et le
  réglage vaut « auto ». Un téléphone qui rejoint pendant le titre ouvre le salon. « Appuie sur une touche »
  (UI) sert aussi de geste de déverrouillage de l'audio.
- **Salon** : `HostSession` + `PhoneHub` créés au démarrage. Chaque joueur connecté vole (sim `lobby`) ;
  mannequin (`createLobbyDummy`) sur le plus haut slot libre, dernière couleur libre, retiré si le salon est
  plein ; micro-objectifs (`LobbyGoalTracker`, coches TV + téléphone, sons). **Composition automatique** des
  bots (`defaultBots(humains, niveau)`) tenue à jour tant que l'utilisateur n'a rien changé (ajout, retrait,
  caractère, niveau) ; ensuite, la composition de l'utilisateur est gardée. **Couleurs** : un humain prend la
  première couleur qu'aucun humain ne porte ; si un bot la porte, le bot change (`Roster.claimColor`) — au
  téléphone, les couleurs des bots restent choisissables. Horloger jamais en Oisillon (joué Voyageur).
  Clavier : PLONGER du groupe (Espace / AltGr, pavé 0) = rejoindre ; manette : A. Lancement : Entrée (toujours,
  dès qu'un joueur clavier a rejoint), bouton Lancer, Start (manette), ou « Lancer » du téléphone du meneur
  (premier téléphone arrivé). Un téléphone hors ligne plus de 60 s quitte le salon.
- **Cartes des règles** : première partie de la session seulement, `RULES.rulesCardsSeconds`, passées quand
  tous les téléphones en ligne ont tapé « Compris », ou Entrée.
- **Manche** : `createSimulation(roundConfig(match, i, birds))` ; les arrivés en cours de partie (spectateurs)
  entrent à la manche suivante (ajoutés à `match.config.birds`). Bannière « Manche n » (ou « Dernier couchant »
  + stinger), `narrator.startRound`, `hints.startRound`, `hub.resetRound`, `resetHud`.
- **Nuit** (`night`) : `finishRound`, `cueCamera('roundResults', { winnerSlot })` ; le panneau apparaît au beat
  `mapReady` (secours 7 s). Au dévoilement (3,25 s, `RoundResults.tsx`) : `narrator.roundResults` + stinger
  `roundWin`. Échéance `RULES.interludeMaxSeconds`, passable quand tous les téléphones sont « Prêt », ou Entrée.
  Bascule de qualité automatique (`qualityMonitor.shouldDowngrade`) ici seulement.
- **Fin de partie** : `matchStandings / matchWinners / matchTitles / matchPlayerSummaries` → `useMatchResults` ;
  `cueCamera('podium', { winnerSlot, podium, coWinners })`, panneau au beat `podiumReady` ; gloire FX ;
  `narrator.matchResults` ; stinger `gameWin`. Votes des téléphones : majorité Revanche → revanche, majorité
  Salon → salon, sinon revanche 15 s après le premier vote Revanche. PC : Entrée = revanche, Échap = salon.
  Revanche = mêmes joueurs / couleurs / bots / réglages, sans les cartes, `narrator.rematch`.
- **Pause** : Échap / Start (UI) ou appui long du téléphone ; simulation gelée (`timeScale` 0), `setAudioPaused`,
  surcouche sur les téléphones (qui l'a demandée, Reprendre). Retour au salon depuis la pause (UI en deux temps).
- **Crédits** : depuis le menu du titre, Échap revient au titre.

## 3. Entrées (`src/input`)

- `KeyboardSource` : `KeyboardEvent.code`, écouteurs en phase de capture, **événements synthétiques ignorés**
  (la navigation manette de l'UI rejoue des flèches). Groupe 1 : WASD (+ flèches et Maj droite tant que le
  groupe 2 n'est pas là), Espace, Maj gauche. Groupe 2 : IJKL / pavé 8-4-5-6, AltRight / pavé 0, Semicolon /
  pavé Entrée. 8 secteurs, compteurs d'appuis sur front montant, AltGr → ControlLeft ignoré, `preventDefault`
  sur les touches de jeu (salon et manche), relâché sur perte de focus. Échap / Start non gérés (l'UI le fait).
- `GamepadSource` : manette k ↔ groupe k+1 (même joueur local que le clavier du groupe) ; stick gauche (zone
  morte radiale 0,18) ou croix, A / RT = PLONGER, B / RB = COUP D'AILE. `nav.ts` de l'UI reçoit
  `setGamepadClaim` : au salon (et en manche pour une manette qui pilote), A / B / stick ne naviguent pas.
- `InputRouter` : slot → source (`phone` | `local` | `bot` | `none`) ; `collect(state, lastEvents)` remplit un
  tableau réutilisé de `BirdInput`. **Compteurs d'appuis continus par slot** : changer de source (téléphone →
  remplaçant → téléphone) ne crée jamais d'appui fantôme ; remis à zéro à chaque nouvelle simulation
  (`reset()`) et à chaque nouvel oiseau (`resetSlot`). Aucune allocation par tick.
- Libellés des touches pour les indications (`localButtonLabels`, disposition réelle via `getLayoutMap`).

## 4. Boucle (runner.frame, useFrame −10)

Accumulateur × `timeScale` × `SIM_SPEED` (debug) ; au plus 5 ticks par frame (sinon on lâche du temps).
`timeScale` = 0 en pause / reprise « 3, 2, 1 » / PC coupé du serveur en manche ; ralenti de touche
(`hitSlowmo*` : 0,35 pendant 0,35 s réelles, rampe 0,2 s, écart 6 s de simulation, aucun dans les 3 dernières s) ;
`state.timeScaleHint` (dernière seconde). Avant chaque tick, copie des oiseaux dans un tableau `prevBirds` propre
au runner (pool, sans allocation) ; `gameView.sim/prevBirds` réécrits à chaque frame (le podium de staging les
substitue). Par tick : entrées → objectifs du salon → grâce de latence (1 fois/s) → `sim.step` →
`simEvents.emit` → `hub.updateFromSim` → narrateur → indications (bulle TV + toast téléphone) → `hudFromSim`
(10 Hz). Flash « planche » sur `diveHit` (sauf « réduire les flashs »). Sorties UI / téléphones regroupées
(`markRoster` / `markViews`, au plus toutes les 50 ms).

Mesuré (tools/e2e/perf.mjs, 6 oiseaux, manche réelle) : **0,48 ms / frame en moyenne, p95 1,4 ms, p99 2,5 ms**,
60 i/s ; sauvegarde complète 2,3 ms (82 ko).

## 5. Robustesse

- **Téléphone perdu** : absent depuis `RULES.playerDropToBotSeconds` (socket fermé, ou connecté mais muet
  > 2,5 s) → `createSubstituteBot` sur son slot (même couleur, même territoire), toast « Un bot garde la place
  de … », slot marqué « remplaçant » ; au retour du téléphone, la main lui revient (toast « … reprend la main »).
- **PC rafraîchi** : sauvegarde (`sessionStorage`, `ombres.runner.v1`) toutes les 2,5 s, à chaque changement
  d'écran et à `beforeunload` / `pagehide` : écran, roster, réglages de partie, partie (`MatchState`),
  simulation (`sim.snapshot()`), mémoire du narrateur, objectifs du salon, résultats affichés, votes, pause,
  échéances restantes. Au rechargement : roster restauré au démarrage (les téléphones se réannoncent dès que la
  salle est reprise), partie restaurée après le chargement ; en manche, reprise en « 3, 2, 1 » (sim gelée 3 s).
  La salle (code + jeton) et les téléphones sont restaurés par `HostSession` / `PhoneHub`.
- **Serveur redémarré** : `HostSession` recrée la salle au même code ; surcouche « reconnexion » côté PC
  seulement s'il y a des téléphones (manche gelée pendant ce temps).

## 6. Debug (uniquement derrière `?debug`)

`?debug` expose `window.__ombres` (runner, stores) ; `?debug=fast&speed=6` : manches courtes, simulation × 6,
entractes × 0,4 ; `?debug=nosave` : pas de sauvegarde ; `?debug=perf` : mesures GPU par passe (surimpression).
Rien de visible sans `?debug`.

## 7. Tests de bout en bout (`tools/e2e`, `PORT=8811`, captures dans `shots/runner/<scénario>/`)

- `solo.mjs` (a) : clavier seul contre les bots, titre → salon → cartes → 3 manches → podium → revanche.
- `phones.mjs` (b) : iPhone 15 Pro + Pixel 7 (touches CDP) + clavier : QR, profil, objectifs, lancement par le
  meneur, « Compris », manches, « Prêt », fin de partie, revanche votée. 
- `resilience.mjs` (c, d, e) : téléphone coupé → remplaçant à 3,1 s → reconnexion → reprise de la main ;
  PC rafraîchi en pleine manche → même salle, même manche, même désert, « 3, 2, 1 ».
- `flows.mjs` : crédits, manette émulée (rejoindre, stick), 2e joueur clavier, pause clavier et téléphone,
  arrivée en pleine manche (spectateur → manche suivante), retour au salon depuis la pause.
- `restart.mjs` : **redémarrage du serveur** en pleine manche, sur un build de production (le client Vite de dev
  rechargerait la page) : manche gelée + surcouche, salle recréée au même code, téléphone revenu, aucun
  remplaçant, manche reprise. `npx vite build --outDir <dist>` puis `node tools/e2e/restart.mjs --dist=<dist>`
  (port libre : arrêter le serveur de dev).
- `watch.mjs` : une manche à vitesse réelle, captures régulières + journal (piqués, répliques, indications).
- `podium.mjs` : transition dernière manche → podium. `perf.mjs` : coût CPU du runner. `smoke.mjs` : fumée.
- Unitaires : `npx vitest run src/input` (clavier : 8 secteurs, appuis, AltGr, synthétiques ; routeur :
  compteurs continus au changement de source).

## 8. Modifications hors périmètre (minimales)

- `src/host/ui/nav.ts` : `setGamepadClaim(fn)` — les manettes réservées au jeu ne naviguent plus (sinon, au
  salon, A = PLONGER cliquait le réglage focalisé ou lançait la partie).
- `src/host/ui/viewModel.ts` + `UiRoot.tsx` : écran `'cinematic'` (aucun panneau) pour la montée de nuit
  (beat `riseStart` → panneau des résultats à `mapReady`) et l'arrivée du podium (panneau à `podiumReady`) :
  plus de HUD sur la montée, plus de panneau de manche périmé pendant l'arrivée au podium.
- `src/host/ui/UiRoot.tsx` : `<Subtitle/>` aussi sur les résultats de manche (réplique du vainqueur).
- `src/host/ui/screens/Lobby.tsx` : quand le premier joueur arrive, « Lancer » prend le focus (Entrée lance
  la partie ; avant, Entrée cliquait le réglage « Manches » focalisé à l'ouverture du salon).
- `src/host/ui/hud/WorldLayer.tsx` + `screens/hud.css` : bulles d'indication centrées avec la propriété
  `translate` (l'animation `.enter` écrasait `transform` : la bulle partait à droite de l'oiseau) et gardées
  dans le cadre (`--hint-dx`, la pointe reste sur l'oiseau).
- `src/shared/strings/runner.ts` (nouveau domaine) + enregistrement dans `strings/index.ts` :
  `runner.audioUnlock` (« Appuie sur une touche pour le son »).
- `play.html` : favicon (évite un 404 en console sur les téléphones).
- Contrat caméra : `src/host/camera/cue.ts` créé par staging (non modifié ; ses ajouts `cut`, `coWinners`,
  `cameraBeats` sont utilisés).

## 9. Décisions (et pourquoi)

- **Humains avant bots pour les couleurs** : la composition automatique prend les premières couleurs dès le
  premier joueur ; sans cela le 2e humain aurait Azur au lieu de Lagon, et un téléphone ne pourrait pas choisir
  Safran. Le bot cède sa couleur (le téléphone ne voit comme « prises » que les couleurs des humains).
- **Composition automatique vivante** au salon (et pas seulement au lancement) : on voit contre qui on va jouer.
- **Reprise en « 3, 2, 1 »** après rafraîchissement (et pas reprise directe) : le temps que les téléphones se
  réannoncent et que les joueurs relèvent la tête ; pas de remplaçant pendant ce temps ni juste après le
  retour du serveur (les téléphones n'étaient pas partis).
- **Pas de pause après la nuit** (la manche est jouée ; la caméra monte vers les résultats).
- **« Volé » au podium = moyenne par manche** (le cumul brut, repeint compris, dépassait 100 % : « Volé 103 % »).
  Le Pilleur reste attribué sur le cumul (règle du GDD) mais son chiffre est affiché par manche aussi
  (« 95,5 % du désert pris aux autres » sur 3 manches se lisait mal) : `titleDisplayValue`.
- **Arrivé en cours de partie** : spectateur (écran « partie en cours »), il entre à la manche suivante
  (ajouté à `match.config.birds`) ; au podium, il joue la revanche.
- **Salon** : un téléphone hors ligne plus de 60 s libère sa place (sinon un joueur parti bloquait un slot).
- **Mesure de perf** : le runner coûte ≈ 0,5 ms / frame (sauvegarde 2,3 ms toutes les 2,5 s) : pas besoin de
  différer la sauvegarde en `requestIdleCallback`.

## 10. Limites connues

- Un joueur au clavier ne peut pas quitter le salon (aucune touche prévue) ; il reste dans la session.
- Après un rafraîchissement, le son reste bloqué par le navigateur jusqu'au premier geste sur le PC (toast
  `runner.audioUnlock` ; en partie, la voix et la musique reprennent au premier clic ou touche).
- Rafraîchi pendant les cartes des règles : retour au salon (8 s à refaire).
- Avertissement console `THREE.Clock … deprecated` : émis par R3F 9.8 avec three 0.186 (bibliothèque).
- Étiquettes des oiseaux qui passent tout en haut du cadre : partiellement sous la bande de sable (cadrage).
- iOS réel non testé (émulation seulement) ; manette réelle non testée (Gamepad API émulée dans `flows.mjs`).
