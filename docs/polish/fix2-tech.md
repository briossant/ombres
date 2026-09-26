# Polish vague 2 : correcteur **tech** (robustesse)

Date : 2026-09-26. Serveur de dev sur le port 8855, arrêté à la fin. Toutes les pages Playwright tournaient
avec `tools/polish/staging/nohmr.mjs`, pour que les modifications des autres correcteurs ne les rechargent
pas. Le GPU était partagé : `gpu_busy` entre 53 et 100 % pendant presque toute la séance, charge système de
8 à 18. Je ne tire donc aucune conclusion des cadences d'image absolues. Les chiffres de performance ci-dessous
sont des comparaisons avant/après dans les mêmes conditions, et des longues tâches (≥ 50 ms de CPU), qui ne
dépendent pas de la charge du GPU.

Captures : `shots/polish2/tech/`. Scripts : `tools/polish/fix2-tech/` (tous lisent `PORT`).

## Bilan

| Ordre | Statut | Preuve |
|---|---|---|
| 1. Perte du contexte WebGL | fait | `ctxloss.mjs` FR et EN : 11/11 contrôles verts à chaque passage |
| 2. Onglet dupliqué | fait (+ son coupé dans l'onglet remplacé) | `duptab.mjs` FR et EN : 13/13 verts, 6 passages |
| 3. À-coup du titre au changement de carte | fait | longues tâches à la bascule : 7 sur 8 (51 à 77 ms) → 0 sur 8 |
| 4. Réplique et changement de langue | fait | `sublang.mjs` : 6/6 verts |
| 5. Fuites | une fuite trouvée et corrigée (audio) ; objets GPU stables | `leaks.mjs --cycles=2`, `detached.mjs` |
| Non-régression | vert | `tools/e2e/resilience.mjs` et `flows.mjs` « tout est vert », aucune erreur console |

## 1. Perte du contexte WebGL

**Avant** (critique tech, n° 12) : la manche continuait à l'aveugle, et une perte définitive laissait un fond
papier avec le HUD, sans message.

**Maintenant** :

- `src/host/runner/DisplayGuard.tsx` (nouveau, monté dans le `<Canvas>` par `App.tsx`) écoute
  `webglcontextlost` et `webglcontextrestored` sur le canvas du jeu. three.js appelle déjà `preventDefault()` à la
  perte : le navigateur peut donc rendre le contexte.
- `runner.onDisplayLost()` met la manche en pause « depuis l'écran » (`displayPause`) : le téléphone affiche
  « Mise en pause depuis l'écran », sans bouton « Reprendre ». `resume()` est refusé tant que l'image manque. La
  sauvegarde est écrite tout de suite. Une manche qui démarre pendant la perte, par exemple quand l'entracte se
  termine, est mise en pause dès la première image.
- Surcouche `src/host/ui/screens/DisplayLost.tsx` : papier opaque, case dessinée à la main, titre « L'image
  s'est interrompue ». Pendant l'attente : « La carte graphique reprend son souffle. La partie attend : rien
  n'est perdu. », avec un soleil qui respire. Au bout de 3 s sans retour : « L'image ne revient pas. Recharge : la
  partie reprendra où elle en était. » et un bouton « Recharger » qui prend le focus.
- Si le contexte revient, la surcouche disparaît et la manche repart en « 3, 2, 1 ». Le code de reprise
  (`resumeWithCount`) est partagé avec le retour d'un onglet passé en arrière-plan.
- « Recharger » sauvegarde puis recharge la page. La pause due à la perte n'est pas sauvegardée : la page
  rechargée reprend au même instant, en « 3, 2, 1 », sans pause à lever.
- Edit ciblé dans `src/host/render/npr/perf.ts` (`GpuTimer`) : après un retour du contexte, l'extension de
  minuterie de l'ancien contexte déclenchait un `INVALID_ENUM` à chaque image (169 avertissements pendant le
  premier essai). Le minuteur reprend maintenant l'extension du nouveau contexte. Console propre ensuite.

**Vérifié** (`ctxloss.mjs`, 1 téléphone iPhone 15 Pro + 3 bots, FR puis EN) :

- perte : temps de soleil figé (25,63 → 25,63 s sur 1,1 s) ;
- téléphone sans « Reprendre » (`ctx-fr-1-lost-phone.jpg`) ;
- surcouche d'attente (`ctx-fr-1-lost-wait.jpg`) ;
- retour : « 3 » puis la manche repart, territoire et encre intacts (`ctx-fr-2-restored-count.jpg`) ;
- perte définitive : « Recharger » à 3 s (`ctx-en-4-lost-stuck.jpg`) ;
- clic : même instant de manche (28,3 → 28,3 s), « 3, 2, 1 », image présente (`ctx-fr-5-reloaded-count.jpg`) ;
- console : seulement l'avertissement volontaire « contexte WebGL perdu ».

## 2. Onglet PC dupliqué

**Avant** : l'ancien onglet affichait « Connexion perdue. Vérifie le réseau : on réessaie sans cesse. », ce qui
était faux, et il restait bloqué.

**Maintenant** :

- `HostLink` vaut `'replaced'`, et non plus `'lost'`, qui ne servait qu'à ce cas.
- `Reconnect.tsx` affiche « Ombres est ouvert dans un autre onglet. Les téléphones jouent maintenant avec l'autre
  onglet. Pour continuer ici, reprends la main. » et un bouton « Reprendre ici » qui a le focus : Entrée suffit.
- Le bouton appelle `runner.takeOver()`, puis `HostSession.takeOver()`. Cet onglet reprend la salle, l'autre
  passe à son tour en « ouvert dans un autre onglet », et la manche repart en « 3, 2, 1 ».
- **Ajout** : l'onglet remplacé se tait (fondu de `engine.masterIn` vers 0). Sans cela, deux musiques jouaient
  l'une sur l'autre, car Chrome ne coupe pas le son d'un onglet en arrière-plan. Le son revient à « Reprendre ici ».
- `dropStalePhones` ne retire plus les téléphones du salon quand le PC n'est pas en ligne, qu'il soit remplacé
  ou en reconnexion. Sinon, après 60 s, « Reprendre ici » aurait retrouvé un salon vide.
- Chaînes FR/EN : `host.reconnect.replaced.title`, `.body`, `host.reconnect.takeOver`. `host.reconnect.lost` est
  retirée.

**Vérifié** (`duptab.mjs`, 1 téléphone Pixel 7 + 3 bots) :

- A remplacé, manche figée, gain 0, B joue avec le téléphone (`dup-fr-1-tabA-replaced.jpg`) ;
- Entrée sur A : A en ligne, « 3 », la manche repart, téléphone reconnecté, gain 1 (`dup-fr-2-tabA-takeover-count.jpg`) ;
- B remplacé et muet (`dup-en-2-tabB-replaced.jpg`) ;
- fermeture de B : A reste en ligne.

Sur 7 passages, deux erreurs console sont apparues une seule fois chacune, sans être reproduites ensuite :

- `WebSocket is already in CLOSING or CLOSED state` ;
- 20 × `Cannot read properties of undefined (reading '0')` dans A, sans pile capturée.

La seconde est probablement due au fichier d'un autre correcteur chargé en cours d'édition : `tsc` signalait
alors des erreurs dans `src/host/camera/framingRig.ts`. Les 5 passages suivants, avec capture de la pile, ont
une console propre.

## 3. À-coup de l'écran titre au changement de carte

**Mesure** (`titleprofile.mjs`, profil CPU de la seule image de bascule ; `buildcost.mjs`, coûts mesurés dans la
page, machine chargée) :

- `startDemo()` coûtait 3 à 7 ms (simulation et bots) ;
- l'essentiel était dans le rendu de l'image suivante :
  - géométrie du sol reconstruite à l'identique : 20 à 50 ms ;
  - géométries des tours : 17 à 30 ms ;
  - recompilation du programme des cailloux, dont les matériaux étaient recréés à chaque carte : 10 à 20 ms.

**Corrections** :

- Runner (`startDemo`, `buildDemo`, `scheduleDemoPrep`) : la démo de la carte suivante (simulation et 6 bots) est
  construite au premier temps mort (`requestIdleCallback`). La bascule ne fait plus qu'échanger les pointeurs.
- `src/host/render/world/prebuild.ts` (nouveau) : `prepareTowers(towers)` construit les tours de la carte
  suivante tour par tour pendant les temps morts, par tranches de 4 ms au plus. `Towers.tsx` les prend avec
  `takeTowers(towers)` (même tableau), sinon il les construit comme avant. `towerGeometry.ts` gagne
  `buildTowerGeometriesSteps` (générateur), et `buildTowerGeometries` passe par lui. Test
  `prebuild.test.ts` : géométrie identique octet pour octet.
- `World.tsx` : même objet `arena` quand (a, b) ne change pas. La démo garde la même arène sur ses 4 cartes :
  sol, rideau et cailloux ne reconstruisent plus rien d'identique.
- `Pebbles.tsx` : matériaux gardés d'une carte à l'autre, donc plus de recompilation.

**Résultat** (`titlecost.mjs --n=8`, High, 8 bascules forcées, GPU occupé à 96 % par les autres pages) :

| | Longues tâches à la bascule | Pire image (médiane / max) | `startDemo` |
|---|---|---|---|
| Avant | 7 sur 8 : 51, 55, 55, 58, 60, 77 ms… | 70 / 105 ms | 2,6 à 6,6 ms |
| Après | **0 sur 8** | 27 / 35 ms (image normale sous cette charge : environ 20 ms) | 0,1 ms |

Sur un titre naturel de 60 s (`tools/polish/tech/titlehitch.mjs`), le changement de carte à 41,7 s ne produit
aucune longue tâche. Ces mesures datent d'avant le branchement de la jumelle de la démo (staging) sur cette
préparation : voir « À signaler ».

**Hors ordre, non traité** : pendant la première seconde du titre, une ou deux longues tâches de 55 à 180 ms
apparaissent. Leur durée varie d'un lancement à l'autre ; le profil désigne des programmes GPU qu'on attend à
leur première utilisation. Dans un autre lancement, `firstuse.mjs` montre les 21 programmes créés et utilisés
avant l'arrivée du titre : ce n'est donc pas systématique. Quand la machine est chargée, la chauffe du
chargement, qui a un délai limite de 6 s, se termine probablement avant la fin des compilations. Piste : `renderer.compileAsync` dans `loader.ts` (périmètre game).

## 4. Réplique du narrateur et changement de langue

**Avant** : le sous-titre gardait la phrase dans l'ancienne langue mais écrivait le nom de couleur dans la
nouvelle, par exemple « Saffron ouvre les hostilités. ».

**Maintenant** (runner, `viewModel.ts` `SubtitleVM.lang`, `Announce.tsx`) :

- **Réplique sans voix** (narrateur « texte », ou clip absent) : le sous-titre passe par sa clé du catalogue et
  bascule entier dans la nouvelle langue : « Safran en voit de toutes les couleurs. » devient « Saffron gets a
  taste of sand. ».
- **Réplique voisée** : le sous-titre suit la voix. Il finit dans sa langue, nom de couleur compris, avec
  l'attribut `lang` sur le paragraphe. La réplique suivante est dans la nouvelle langue.

**Vérifié** (`sublang.mjs`, en pause pendant une manche, comme on change de langue en vrai) :

- `sublang-1-voice-after-switch.jpg` : pause en anglais, sous-titre « Safran ouvre les hostilités. » en entier ;
- `sublang-2-voice-next-en.jpg` : réplique suivante « Saffron opens the hunt. » ;
- `sublang-3-text-after-switch.jpg` : texte seul retraduit.

## 5. Fuites

**Session mesurée** (`leaks.mjs --cycles=2`) : 12 oiseaux, dont 1 clavier. Chaque cycle comprend 3 parties de 3
manches enchaînées par des revanches, puis le salon, le titre, les crédits, le titre et le salon. Le son est
déverrouillé : musiques, voix et bruitages tournent vraiment.

**Objets GPU**, identiques du début à la fin et d'un cycle à l'autre :

- `renderer.info` : 20 géométries, 22 textures au titre et 28 au salon, 21 programmes ;
- objets WebGL vivants : 103 buffers, 26 à 32 textures, 10 framebuffers.

**Fuite trouvée** : `detached.mjs` compare deux instantanés du tas, pris après un cycle puis après deux.

- Les seuls nœuds détachés qui s'accumulaient étaient les `<audio>` des musiques : 16 → 30, soit 2 par piste jouée.
- Les `MediaElementAudioSourceNode` suivaient la même courbe, 16 → 30.
- Chrome garde en vie une `MediaElementAudioSourceNode` et son élément tant que le contexte audio existe, même
  débranchée. Les débrancher ne suffisait pas : je l'ai essayé et mesuré, toujours 16 → 30.

**Correction** (Edit ciblé, `src/host/audio/music/tracks.ts`) : les lecteurs de flux, c'est-à-dire l'`<audio>`,
sa source et son gain, viennent d'une réserve par moteur audio et y retournent à l'arrêt de la piste.

**Après correction** :

- `MediaElementAudioSourceNode` 4 → 4, nœuds détachés 66 → 66 entre les deux instantanés ;
- 4 `<audio>` créés pour toute une session (`musiccheck.mjs`), au lieu de 2 par piste ;
- la musique du titre, des crédits et du podium joue et avance à chaque écran, avec la bonne piste.

**Tas JS après GC** : la mesure de la session complète après correction est dans le tableau ci-dessous. Avant la
correction, le tas passait de 38,5 à 39,1 Mo entre la fin du cycle 1 et la fin du cycle 2 (+0,6 Mo). La hausse
du premier cycle (+6 Mo) correspond au remplissage des caches : voix décodées, sons chargés à la demande.

Session complète après correction (`leaks.mjs --cycles=2`, sortie dans le journal du script) :

| Point de contrôle | Tas JS après GC | Géométries | Textures | Programmes | Buffers GL | FBO | Nœuds DOM | Écouteurs |
|---|---|---|---|---|---|---|---|---|
| Titre (début) | 34,2 Mo | 20 | 22 | 21 | 103 | 10 | 145 | 238 |
| Salon (début) | 37,4 | 20 | 28 | 21 | 103 | 10 | 1 049 | 320 |
| Cycle 1, podium 3 | 37,1 | 20 | 28 | 21 | 103 | 10 | 710 | 220 |
| Cycle 1, titre (fin) | 37,1 | 20 | 22 | 21 | 103 | 10 | 562 | 230 |
| Cycle 1, salon (fin) | 40,1 | 20 | 28 | 21 | 103 | 10 | 989 | 316 |
| Cycle 2, podium 3 | 38,5 | 20 | 28 | 21 | 103 | 10 | 718 | 369 |
| Cycle 2, titre (fin) | 37,4 | 20 | 22 | 21 | 103 | 10 | 562 | 232 |
| Cycle 2, salon (fin) | 42,8 | 20 | 28 | 21 | 103 | 10 | 989 | 322 |

- **Objets GPU et DOM** : identiques d'un cycle à l'autre. Nœuds DOM : 989 → 989 au salon et 562 → 562 au
  titre, contre +60 par cycle avant la correction : ce sont les `<audio>` et leur arbre interne.
- **Tas JS** : d'un cycle à l'autre, +0,3 Mo (titre) à +2,7 Mo (salon), soit ≈ +1,3 Mo en moyenne, comme avant la
  correction. La mesure varie de ±2 Mo selon l'instant, par exemple 39,1 puis 42,8 Mo à deux salons séparés de
  15 s. `heapdiff.mjs` compare les deux instantanés par constructeur : la hausse vient du code compilé à la
  volée (+0,9 Mo) et des nombres (+95 Ko). Aucune collection du jeu ne grossit, et la taille propre totale
  baisse (111 → 99 Mo). Seul `BirdSet` augmente (+150), mais c'est un cache borné à 256 dans `camera/cine.ts`.
  Reste 9 objets natifs `blink::MediaPlayer` de plus (0,8 Ko), un par chargement de source : négligeable.
- **Console** : seulement les `ERR_ABORTED` des musiques coupées en plein téléchargement, attendus.

## Fichiers

- **Mes fichiers** :
  - `src/host/runner/runner.ts` ;
  - `src/host/runner/DisplayGuard.tsx` (nouveau) ;
  - `src/host/App.tsx` ;
  - `src/host/ui/viewModel.ts`, `UiRoot.tsx` ;
  - `src/host/ui/screens/Reconnect.tsx`, `DisplayLost.tsx` (nouveau), `overlays.css` ;
  - `src/host/ui/hud/Announce.tsx`.
- **Edits ciblés ailleurs**, tous indispensables à un ordre :
  - `src/shared/strings/host.ts` : 6 clés FR/EN, 1 retirée ;
  - `src/host/render/World.tsx`, `world/Towers.tsx`, `world/Pebbles.tsx`, `world/towerGeometry.ts` (ordre 3) ;
  - `src/host/render/world/prebuild.ts` et `prebuild.test.ts` (nouveaux, ordre 3) ;
  - `src/host/render/npr/perf.ts` (ordre 1) ;
  - `src/host/audio/music/tracks.ts` (ordre 5).
- **Notes** : `docs/agent-notes/runner.md` §12, `ui.md`, `world.md`, `audio.md` (sections « vague 2 »).
- **Scripts** (`tools/polish/fix2-tech/`) :
  - `ctxloss.mjs`, `duptab.mjs`, `sublang.mjs` ;
  - `titlecost.mjs`, `titleprofile.mjs`, `titlehitch.mjs`, `buildcost.mjs` ;
  - `titlestart.mjs`, `titleprograms.mjs`, `firstuse.mjs` ;
  - `leaks.mjs`, `detached.mjs` (instantanés hors du dépôt), `musiccheck.mjs`.

## Contrôles

- `npx vitest run src/host/ui src/net src/host/runner src/host/render/world src/host/audio src/director` :
  **148 tests verts**, 10 fichiers, dont le nouveau `prebuild.test.ts`.
- `npx tsc --noEmit` : **0 erreur sur mes chemins** et sur les fichiers touchés par Edit ciblé. Les erreurs
  restantes du dépôt sont dans des fichiers d'autres correcteurs en cours d'édition :
  `tools/polish/title2/bench.ts`, et plus tôt `src/host/camera/framingRig.ts`.
- `pnpm check:boundaries` : OK.
- `tools/e2e/resilience.mjs` : « tout est vert », lancé deux fois (avant et après les derniers Edits) :
  - remplaçant, reprise en main, rafraîchissement du PC en manche, reprise en « 3, 2, 1 » ;
  - aucune erreur console.
- `tools/e2e/flows.mjs` : « tout est vert ».
  - Un passage lancé en même temps que deux autres navigateurs, avec une charge de 16, a manqué l'appui de 150 ms
    sur la manette émulée. Relancé seul : 16/16.
- `tools/e2e/solo.mjs` (partie de fumée) : 3 manches, podium, revanche, « aucune erreur console ».
- Serveur de dev du port 8855 arrêté par son PID, port libre.

## À signaler (hors de mes fichiers)

- **Jumelle de la démo du titre** (`camera/demoFuture.ts`, correcteur staging) : elle s'est branchée sur ma
  préparation (`buildDemo`, `startDemo`). Sur une machine saturée (charge de 17), `startDemo` recoûte 16 à 36 ms
  sur 5 bascules sur 8 : `begin()` rattrape `HEAD_START` ticks de manière synchrone. En cause, la préparation au
  repos de `prebuild()` ne fait rien quand l'appel vient du délai limite : `timeRemaining()` vaut alors 0, et
  `didTimeout` n'est pas pris en compte. Quand le navigateur a des temps morts, la bascule reste à 0 à 3 ms sans
  longue tâche (3 dernières bascules de la même mesure). Piste : faire au moins quelques ticks par passage quand
  `d.didTimeout` est vrai, comme `world/prebuild.ts`.
- **Première seconde du titre** : voir la fin du §3, piste pour `loader.ts`.
