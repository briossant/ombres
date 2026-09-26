# Ombres : QA technique (robustesse, performance)

Revue faite le 26/09/2026 par l'ingénieur technique / QA robustesse, en lecture seule du code. Les scripts de mesure sont dans `tools/polish/tech/` et les captures dans `shots/polish/tech/`. Le serveur de dev tournait sur le port 8824 et un build de production (`vite build` dans un dossier à part, puis `dist-server/server.mjs` avec `OMBRES_DIST`) sur le 8894. Toutes les mesures viennent de Chrome headless sur l'iGPU de la machine (Renoir, de la classe Vega visée).

**Réserve sur les mesures.** D'autres agents ont chargé le GPU et le CPU pendant presque toute la séance : la charge système a varié de 1 à 30 et `gpu_busy` a atteint 99 %. Pour contourner ce bruit :
- le temps GPU est mesuré par une requête `TIME_ELAPSED` autour de la frame entière, dans le rAF, et on retient les percentiles p10, p50 et p90 ;
- les chiffres « au calme » (charge 1,2 à 5, aucun autre processus GPU) sont signalés comme tels ;
- un i/s mesuré sous contention n'est jamais présenté comme une conclusion.

---

## 1. Synthèse

Le socle technique est sain :
- aucune fuite sur une session de trois parties avec revanches ;
- console propre ;
- le réseau encaisse 12 téléphones, les coupures, un téléphone muet et le redémarrage du serveur ;
- le CPU tient dans son budget ;
- les draw calls restent sous 150.

Les problèmes sérieux sont ailleurs :

1. **Le plafond de résolution des presets est perdu après le premier podium** (sévérité 4). Low, Medium et High sur un écran de plus de 1080 lignes, ou un dpr inférieur à 1, repassent à la résolution native pour le podium et toute la revanche. En 4K, le temps GPU passe de 9,8 à 35,6 ms, soit une revanche à environ 20-25 i/s. En Low 1080p, il double (3,0 → 6,2 ms).
2. **La qualité automatique ne garde aucune marge** (sévérité 4). Le banc tourne sur la scène du titre, qui coûte 9,8 ms pour un seuil de 10 ms, alors qu'une manche à 12 oiseaux coûte 10,6 à 11,1 ms. La surveillance ne regarde que les 2 dernières secondes avant le panneau de résultats (la montée de caméra), et en intervalles d'image calés sur la synchro.
3. **Pendant un rechargement du PC en pleine manche, les téléphones basculent sur l'écran du salon** (sévérité 3). On y voit les objectifs décochés, le carrousel des règles et « Lancer la partie », entre 1,5 s au calme et plus de 30 s sur une machine lente.
4. **Sans WebGL, ou en cas d'exception de rendu, la page est entièrement blanche** (sévérité 3). Il n'y a aucune ErrorBoundary, ni sur le PC ni sur le téléphone.

---

## 2. Mesures

### 2.1 GPU par preset et nombre d'oiseaux (frame entière, 1080p)

Conditions : `perfmatrix.mjs`, simulation × 2, fenêtre calme (charge 3 à 5), valeurs p50 [p90] en ms.

| Preset (canvas) | Oiseaux | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre |
|---|---|---|---|---|---|---|
| High (1920×1080) | 12 | 9,7 [10,2] | 10,2 [12,3] | **11,7 [13,7]** | 10,9 [11,2] | **11,6 [13,6]** |
| High | 6 | 10,3 [12,0] | 10,1 | 10,3 | 10,5 | 11,0 |
| High | 4 | 9,3 | 9,9 | 10,2 | 10,2 | 10,8 |
| Medium (1600×900) | 12 | 6,8 | 7,2 [8,6] | 8,2 [9,6] | 7,7 | 8,1 [9,6] |
| Medium | 6 | 6,5 | 6,9 | 7,0 | 7,1 | 7,5 |
| Medium | 4 | 6,5 | 6,8 | 7,2 | 7,5 | 7,7 |
| Low (1280×720) | 12 | 3,4 | 3,3 | 3,7 | 3,4 | 3,7 |
| Low | 6 | 3,0 | 3,1 | 3,2 | 3,3 | 3,5 |
| Low | 4 | 2,9 | 3,1 | 3,1 | 3,2 | 3,4 |

High à 12 oiseaux, à vitesse réelle et au calme (charge 1,8 à 2,5) :

| Phase | GPU p50 [p90] | i/s | Images > 20 ms | CPU rAF p50 / p95 |
|---|---|---|---|---|
| Midi | 9,7 [10,3] | 60 | 0 % | — |
| Après-midi | 10,3 [10,6] | 60 | 0 % | — |
| Heure dorée | 10,6 [11,1] | 58,4 | 3,4 % | — |
| Couchant | 10,7 [11,0] | 60 | 0,5 % | — |
| Grande Ombre | 11,1 [11,4] | 57 | 6,6 % | — |
| Toute la manche | — | — | — | 2,9-3,8 ms / 4,6-7,0 ms |

Low tient 60 i/s partout, avec un GPU occupé à 40-50 % seulement.

Autres chiffres :
- **Scène du banc de qualité** (titre, High) : 9,8 ms p50 [10,2] (`benchscene.mjs`). Le banc réel a choisi `high`.
- **Coût de l'UI DOM** : aucun, mesuré en A/B alterné UI visible / masquée (`uicost.mjs`) : 60 i/s dans les deux cas, GPU WebGL identique.
- **CPU (profil de 10 s, heure dorée, 12 oiseaux)** : thread principal occupé environ 35 %. Le budget de 6 ms par frame est tenu. Détail des fonctions coûteuses :
  - `updateMatrixWorld` (1,8 %) ;
  - React en mode dev ;
  - téléversement du territoire (0,7 %) ;
  - `sim.paint` (0,6 %) ;
  - la boucle de `WorldLayer` : 0,05 ms par frame, négligeable.
- **Sauvegarde de session à 12 oiseaux** : 3,2 ms en médiane (4,6 max), 154 ko, toutes les 2,5 s (`savecost.mjs`).
- **Draw calls** : 66 au salon, 70 au titre, 93 à 117 en manche à 12 oiseaux, soit moins que les 150 du budget. 21 programmes GL vivants, 166 000 à 226 000 triangles.

### 2.2 Session longue

Conditions : `longsession.mjs`, 3 parties de 3 manches avec revanches, 12 oiseaux, puis retour au salon, au titre, et 9 bascules de qualité et de langue.

| Point de contrôle | Tas JS après GC | Nœuds DOM | Écouteurs | Textures | Buffers | Framebuffers | Minuteries |
|---|---|---|---|---|---|---|---|
| Salon | 29,1 Mo | 526 | 315 | 31 | 102 | 10 | 5 intervalles |
| Podium, partie 1 | 32,5 | 611 | 217 | 31 | 102 | 10 | 5 |
| Podium, partie 2 | 33,6 | 627 | 226 | 31 | 102 | 10 | 5 |
| Podium, partie 3 | 33,8 | 643 | 214 | 31 | 102 | 10 | 5 |
| Titre, après les bascules | 33,6 | 167 | 212 | 25 | 116 | 10 | 5 |

Conclusions :
- **Pas de fuite** : objets GL stables, tas plat à partir de la partie 2, minuteries stables.
- Environ 16 nœuds DOM détachés de plus par partie. C'est négligeable.
- Les éléments `<audio>` des pistes arrêtées sont bien vidés (`src` retiré).
- **Console** : aucune erreur ni aucun avertissement du jeu dans aucun scénario, en dev comme en prod. On ne voit que les `ERR_ABORTED` de pistes musicales à la fermeture des pages et les refus de connexion WebSocket pendant la coupure volontaire du serveur.

### 2.3 Chargement et poids (build de production)

- **Premier lancement au calme** : titre affiché en 3,45 s, 99 requêtes, 5,6 Mo sur le fil au moment du titre, flux musical compris (`loadtrace.mjs`).
- JS de l'hôte : 1,67 Mo (520 ko gzip). Téléphone : 354 ko (112 ko gzip). `dist/` pèse 22 Mo, dont 19,3 Mo d'audio.
- **Rechargement** : 2,18 Mo téléchargés de nouveau (voir le problème n° 11).

### 2.4 Réseau

Conditions : `netstress.mjs` et `restart.mjs`, avec des téléphones simulés en Node qui parlent le protocole de `src/shared`.

- **12 téléphones au salon** : roster complet, « Complet » affiché (`shots/polish/tech/net-lobby-12phones.jpg`). Un 13e est refusé par le serveur (`room-full`), au salon comme en manche.
- **Débit PC → téléphone** : environ 6 messages/s et 1,1 ko/s par téléphone (4,8 statuts/s, 0,7 retour/s), 12,8 ko/s au total.
- **Téléphone muet 6 s** : remplaçant puis retour de la main, conforme.
- **Coupures de 4 s × 3** : toasts « remplaçant » puis « reprend la main », conforme.
- **Redémarrage du serveur de production en pleine manche** : manche gelée, lien PC rétabli 1,8 s après la relance, même code de salle, les 4 téléphones reviennent en `play`, aucun remplaçant.
- **Rafraîchissement du PC à chaque écran** (`refresh.mjs`) : titre, crédits, salon avec réglages ouverts, cartes, compte à rebours, manche (« 3, 2, 1 »), pause (reste en pause), résultats de manche, arrivée du podium et podium sont tous restaurés. Au podium, on repasse par l'arrivée cinématique avant le panneau, ce qui est acceptable.

---

## 3. Problèmes (du plus grave au moins grave)

### 1. Le plafond de résolution des presets est perdu après le premier podium [sévérité 4, world]

**Constat** (`dprcap.mjs`) :

| Situation | Titre / salon / manche | Podium et revanche | GPU |
|---|---|---|---|
| Low, 1920×1080 | canvas 1280×720 | canvas **1920×1080** | 3,0 → **6,2 ms** |
| High, 3840×2160 (dpr 1) | canvas 1920×1080 | canvas **3840×2160** | 9,8 → **35,6 ms**, environ 19 i/s en headless |

Voir aussi `aspect-3840x2160-podium` dans `shots/polish/tech/aspects.log`, où le canvas passe à 3840×2160 au podium.

**Cause** : `WorldCanvas` passe `dpr={1}` au `<Canvas>`, puis `NprPipeline` plafonne avec `setDpr(presetDpr(...))`, mais seulement quand `preset` ou `size.height` changent. Or R3F rappelle `configure()` à chaque rendu du `<Canvas>`, et `configure` remet `dpr` à la valeur de la prop dès qu'elle diffère (`events-*.esm.js:1522`). `App.tsx` se rend de nouveau quand `useStage.glorySlot` change, c'est-à-dire à l'arrivée du podium, et le plafond saute jusqu'au prochain changement de niveau. En mode « auto », la surveillance rétrograde ensuite d'un cran à tort.

**Qui est touché** : les machines faibles en Low ou Medium (coût doublé ou ×1,44 pendant toute la revanche), et les TV 4K sans mise à l'échelle (×4). Sur une TV 4K à 100 %, la gravité monte à 5.

**Correction** : calculer le dpr dans `WorldCanvas.tsx` et le passer en prop (`dpr={presetDpr(QUALITY_PRESETS[level], height, devicePixelRatio)}`, avec la hauteur suivie par un écouteur `resize`), puis retirer le `setDpr` de `NprPipeline.tsx`. Autre possibilité : sortir l'abonnement `glorySlot` d'`App` pour que `<Fx>` lise `useStage` lui-même et que le `<Canvas>` ne se rende plus de nouveau. Ajouter un test e2e qui vérifie la taille du canvas après une revanche.

### 2. Qualité auto : un banc sans marge et une surveillance aveugle au climax [sévérité 4, world]

**Constat** :
- Le banc (`QualityBench`, seuil médiane ≤ 10 ms) mesure l'écran titre à 9,8 ms et choisit `high`. La même machine coûte ensuite 10,6 à 11,1 ms en p50 dans une vraie manche à 12 oiseaux, avec 3 à 7 % d'images à 33 ms à l'heure dorée et à la Grande Ombre.
- `QualityMonitor` ne voit que 120 intervalles d'image (2 s). Ces intervalles sont calés sur la synchro, donc à 16,7 ms tant que le GPU tient sous 16 ms. Aucune marge n'est visible.
- `shouldDowngrade` n'est appelé qu'à `showRoundResults`, après la montée de caméra (`runner.ts:941`). La fenêtre mesurée est donc la cinématique de nuit, jamais le climax.
- Contre-preuve (`bgtab.mjs --nohide`) : au même instant de la même manche, la décision n'a dépendu que de la contention pendant la montée. Moyenne de 49,7 ms, rétrogradation High → Medium ; au calme, moyenne de 16,7 ms, High conservé.
- Détail : `qualityMonitor.push(delta)` reçoit le delta non borné de R3F. Au retour d'un onglet caché, une seule image de plusieurs secondes entre dans la moyenne.

**Correction** (`src/host/render/quality.ts`, `NprPipeline.tsx`, `runner.ts`) :
- Surveiller le temps GPU avec `benchTimer`, qui existe déjà : une requête par frame, résultats lus de façon asynchrone.
- Garder le p90 de la dernière manche, depuis l'heure dorée jusqu'à la Grande Ombre.
- Rétrograder à l'entracte si ce p90 dépasse `budgetMs` + 10 %.
- Exiger une marge au banc (High seulement si la médiane est ≤ 8,5 ms), ou faire tourner le banc sur un plan de jeu à 12 oiseaux.
- Borner à 100 ms le delta poussé dans le moniteur.

### 3. High à 12 oiseaux dépasse le budget GPU au climax [sévérité 3, world]

**Constat** : au calme et à vitesse réelle, High coûte 9,7 ms à midi puis 10,6 à 11,1 ms à l'heure dorée, au couchant et à la Grande Ombre (p90 jusqu'à 11,4 ms). À vitesse × 2, le p90 atteint 13,7 ms. Même à 4 oiseaux, High est à 10,2-10,8 ms. Le budget, dans `ARCHITECTURE.md` §8, est de 10 ms. Résultat : 57-58 i/s et 3,4 à 6,6 % d'images à 33 ms au moment le plus spectaculaire. C'est le constat du lead, précisé.

**Correction** (`quality.ts`, `npr/`, `world/groundMaterial.ts`) : SMAA MEDIUM en High (−0,3 ms, levier déjà prêt), rides du sol coupées au-delà d'une certaine distance, `pebbles` 2200 → 1500. Viser 9 ms en p90 à 12 oiseaux. Le vrai filet de sécurité reste le n° 2.

### 4. Pendant un rechargement du PC en manche, les téléphones affichent le salon [sévérité 3, game]

**Constat** : pendant le chargement du PC, le téléphone passe de `play` à la vue `lobby`. On y voit les objectifs Vole / Plonge / Pique décochés, le carrousel des règles et « Lancer la partie » dans le bandeau. Il revient ensuite à la manette.
- Captures : `shots/polish/tech/phonereload-01-lobby.jpg` (iPhone 15 Pro).
- Au calme, la bascule dure 1,5 s. Sous charge, elle a duré 4 à 33 s (`refresh.mjs`, chronologies « 4.0s:lobby 33.3s:play »).
- Même chose pendant les cartes, les résultats et le podium.

**Cause** : dans `src/host/runner/views.ts`, `phoneView()` traite `phase === 'boot'` comme le salon, alors que le roster est déjà restauré (`restoreEarly`) et que la partie ne l'est qu'après le chargement (`restoreGame`).

**Correction** : pendant le boot avec une sauvegarde en attente, envoyer l'écran sauvegardé avec une surcouche `paused: { by: null, canResume: false }` et un libellé « L'écran se recharge… ». On peut aussi mémoriser `snapshot.phase` dans `restoreEarly` et construire la vue de cet écran.

### 5. Sans WebGL ou sur exception de rendu : page blanche, aucune ErrorBoundary [sévérité 3, hostui]

**Constat** (`nowebgl.mjs`, avec `--disable-3d-apis`) :
- `#root` n'a aucun enfant et aucun texte n'est visible : l'utilisateur voit une page crème vide.
- La console affiche `Error creating WebGL context` puis « An error occurred in the <CanvasImpl> component. Consider adding an error boundary ».
- Le runner, lui, a déjà créé la salle : un téléphone peut rejoindre un PC blanc.
- Aucune `ErrorBoundary` n'existe dans `src/` (vérifié par recherche). Une seule exception dans un composant d'UI démonte tout l'écran, et c'est vrai aussi sur le téléphone en pleine manche.

**Correction** :
- Tester WebGL2 avant de monter `<App/>` dans `src/host/main.tsx` et afficher un écran « Ombres a besoin de WebGL 2 : active l'accélération matérielle ».
- Envelopper `<WorldCanvas>` et `<UiRoot>` dans une ErrorBoundary qui propose « Recharger » (la sauvegarde de session restaure la partie).
- Faire de même autour de `<PhoneApp/>`.

### 6. La carte des règles du téléphone chevauche COUP D'AILE au salon [sévérité 3, phone]

Constat du lead, confirmé : sur iPhone 15 Pro paysage, le bord droit de la carte (x ≈ 1205) passe sous le bouton COUP D'AILE (x ≈ 1195) (`shots/polish/tech/phonereload-01-lobby.jpg`).

**Correction** (`src/phone/phone.css`, `src/phone/ui/RulesCards.tsx`) : réserver la colonne des boutons dans la grille du salon ; masquer la carte tant qu'un pouce est posé.

### 7. À 12 joueurs, les bulles d'indication envahissent la TV [sévérité 3, hostui]

Constat du lead, confirmé et précisé avec 12 téléphones réels (`shots/polish/tech/net-round-12phones.jpg`) :
- **4 bulles** en même temps sur la TV ;
- deux sont identiques (« Trop pâle pour ce sable. Descends. ») ;
- l'une est coupée sous la bande de sable, en haut ;
- une autre masque l'étiquette d'un oiseau.

**Correction** (`src/host/runner/runner.ts` `showHints`, `src/host/ui/hud/WorldLayer.tsx`) :
- au plus 2 bulles TV à la fois, le téléphone recevant toujours son toast ;
- une même clé une seule fois à l'écran ;
- zone interdite sous `SandBar` : ancrer la bulle sous l'oiseau quand y < 160 px de conception.

### 8. Onglet dupliqué : l'ancien onglet affiche un faux « on réessaie sans cesse » et ne reprend jamais [sévérité 2, hostui]

**Constat** (`netstress.mjs`, `net-dup-tab1.jpg`) : dupliquer l'onglet copie le `sessionStorage`. Le nouvel onglet reprend la salle, et l'ancien passe à `hostLink: 'lost'`. Il affiche alors « Le vent a coupé la ligne. Connexion perdue. Vérifie le réseau : on réessaie sans cesse. », ce qui est faux : il ne réessaie pas (statut `replaced`). Une fois le nouvel onglet fermé, l'ancien reste bloqué, sa simulation figée, et les téléphones affichent « écran absent ».

**Correction** : dans `Reconnect.tsx`, pour le statut `replaced`, afficher un texte dédié (« Ombres est ouvert dans un autre onglet ») et un bouton « Reprendre ici » qui appelle `HostSession.takeOver()` (déjà implémenté). Nouvelle chaîne à ajouter dans `strings/host.ts`.

### 9. Toast « X a perdu la connexion » répété pour un téléphone au Wi-Fi instable [sévérité 2, game]

**Constat** : un téléphone coupé 0,7 s toutes les 1,5 s pendant 12 s produit 5 toasts `host.toast.left` (`netstress.mjs`). Le délai de 1,5 s n'est annulé que si le téléphone est revenu au moment du contrôle.

**Correction** (`runner.ts` `onPhoneLeave`) : au plus un toast par joueur toutes les 20 s ; au-delà, compter l'absence cumulée.

### 10. Onglet du PC en arrière-plan : la partie se fige sans pause visible [sévérité 2, game]

**Constat** (`bgtab.mjs`) : onglet masqué 8 s en pleine manche. Le rAF tombe à environ 1 Hz, avec des images de 1 033 ms, et la simulation n'avance que de 0,8 s. Le téléphone ne reçoit que 2 statuts et reste sur `play`, sans surcouche de pause : sa manette paraît vivante alors que rien ne bouge. La musique continue. Au retour, la partie repart sans « 3, 2, 1 ».

**Correction** : dans `runner.ts`, sur `visibilitychange` → `hidden` pendant une manche non terminée, appeler `this.pause(-1)`. Les téléphones affichent alors la pause et « Reprendre ». Reprise manuelle au retour, ou automatique avec « 3, 2, 1 » via `holdUntil`.

### 11. Serveur de production : aucun cache pour l'audio, les polices et l'UI, pas de requêtes Range [sévérité 2, other]

**Constat** :
- `/audio/**`, `/fonts/**` et `/ui/**` sont servis avec `cache-control: no-cache` sans ETag ni Last-Modified. Chaque rechargement télécharge donc tout de nouveau : 2,18 Mo avant le titre (`loadtrace.mjs`), puis les flux musicaux.
- `Range: bytes=0-99` renvoie `200` et le fichier entier (196 809 octets).
- Les `<audio>` de musique ne sont pas « seekables » : `seekable = [0,0]` au podium (`audioseek.mjs`). Le saut d'intro du podium (`currentTime = 4.6`) et les rebouclages ne marchent que parce que le fichier est déjà entièrement en tampon. Sur la VM déployée, derrière Internet, ce n'est plus garanti. En dev, Vite gère Range : le défaut n'apparaît qu'en prod.

**Correction** (`server/index.ts` `serveStatic`) :
- ETag `size-mtime` et réponse `304` sur `If-None-Match` ;
- `cache-control: public, max-age=604800` pour `/audio`, `/fonts` et `/ui`, ou noms de fichiers avec empreinte ;
- réponses `206 Partial Content` avec `Accept-Ranges: bytes`.

### 12. Perte du contexte WebGL : la manche continue à l'aveugle [sévérité 2, world]

**Constat** (`contextloss.mjs`) :
- Perte puis restauration après 2 s : l'image revient avec le territoire intact (`ctxloss-2-restored.jpg`), c'est bien.
- Mais la simulation avance pendant la perte (t 31 → 35,4 s).
- Une perte définitive (pilote réinitialisé) donne un fond papier vide avec le HUD, la manche continue, et aucun message n'apparaît (`ctxloss-4-lost-forever.jpg`).

**Correction** : écouter `webglcontextlost` et `webglcontextrestored` sur le canvas (`WorldCanvas.tsx` ou `runner`). Mettre la manche en pause pendant la perte. Si le contexte n'est pas restauré après 3 s, afficher une surcouche « L'image s'est interrompue » avec un bouton « Recharger » : la sauvegarde restaure la partie.

### 13. « Réduire les flashs » ne s'applique pas aux téléphones ; `prefers-reduced-motion` est ignoré sur le PC [sévérité 2, phone]

**Constat** : `PhoneView` ne transporte que `colorblind` (`src/shared/messages.ts:247`). Sur le téléphone restent donc actifs l'éclair blanc du clac, la bordure rouge pulsée de la prise d'élan et l'éclair du bandeau (`phone.css` : `flash-border`, `.band.is-flash`). Le PC n'initialise pas `reduceFlashes` depuis `prefers-reduced-motion` (`settings.ts` : valeur par défaut `false`).

**Correction** : ajouter `reduceFlashes?: boolean` à `PhoneView` (runner `views.ts`, puis `phone/App.tsx` qui pose une classe `.reduce-flash`), et initialiser le réglage du PC avec `matchMedia('(prefers-reduced-motion: reduce)').matches`.

### 14. Chargement bloqué à « 100 % » jusqu'à 20 s quand le rendu tombe sous 20 i/s [sévérité 2, hostui]

**Constat** (`loadtrace.mjs`, sous charge) : `shaders:100` à 16,15 s, puis `done` à 34,5 s. On attend 18,4 s sur « Mélange des couleurs… 100 % » (`net-dup-tab2.jpg`). `warmUp()` (`src/host/loading/loader.ts`) exige 8 images consécutives de moins de 50 ms, avec un délai limite de 20 s. En plus, au premier lancement, la chauffe se fait en High : aucun banc n'a encore tourné.

**Correction** : faire progresser la barre sur la stabilité (par exemple 95 % au bout de 30 images, puis 100 % quand c'est stable) ; ramener le délai limite à 6 s ; chauffer en Medium quand aucun banc n'est mémorisé.

### 15. Podium : titre coupé avec un séparateur pendant, sous-titre qui mord sur les cartes [sévérité 2, hostui]

**Constat** (`aspect-3840x2160-podium.jpg`, même mise en page qu'en 1080p puisque la conception est 1920×1080 zoomée) :
- « CARMIN · » / « GUETTEUR » passe sur deux lignes avec le « · » en fin de ligne ;
- « REMPORTE LA » / « PARTIE » est coupé aussi ;
- le récitatif (« Carmin, le désert retiendra cette couleur. ») chevauche le haut de la carte du 3e dans la grille des titres (6 joueurs).

**Correction** (`src/host/ui/screens/MatchResults.tsx`, `results.css`) : mettre le nom de couleur et le caractère sur deux lignes explicites, sans séparateur en fin de ligne, ou réduire le corps de police au-delà de N caractères ; `white-space: nowrap` sur « remporte la partie » ; décaler le récitatif au-dessus de `.titles` avec une marge.

### 16. PC sur un écran 4K : rendu 1080p agrandi ×2, lignes d'encre floues [sévérité 2, world]

**Constat** : sur un écran 4K à dpr 1, High rend en 1080p puis agrandit ×2 en bilinéaire. Les bords du territoire en escalier et les traits flous se voient à pleine résolution (`shots/polish/tech/aspect-4k-round-crop.jpg`). L'UI DOM, elle, est nette.

**Correction** : un preset « High+ » à 1440p proposé par le banc quand il reste de la marge ; sinon, l'encre au moins à la résolution native (`targetHeight` distinct pour la passe d'encre).

### 17. Allocations par frame : 5 à 10 Mo/s [sévérité 1, other]

**Constat** : profil de 10 s en dev, 12 oiseaux (`profile.mjs`), 96 Mo alloués en tout, soit 9,6 Mo/s. Sites principaux, hors React en mode dev (14,7 Mo) :

| Site | Volume sur 10 s |
|---|---|
| `setValueV3f` de three | 8,8 Mo |
| `drawTrail` (`fx/system.ts`) | 6,8 Mo |
| `rasterHull` (`sim/territory.ts`) | 4,1 Mo |
| `Math.hypot` | 4,0 Mo |
| `animator.update` et `frameFromStates` | 4,1 Mo |
| `updateHulls` | 1,7 Mo |
| `bots/styles.ts` | 1,6 Mo |

Le GC coûte 0,08 ms par frame en moyenne, donc pas d'à-coup mesuré, mais cela contredit `ARCHITECTURE.md` §8.

**Correction** :
- passer en `Float32Array` les uniforms vec3 déclarés en `number[]` (source de `setValueV3f`) ;
- remplacer `Math.hypot` par `Math.sqrt(x*x + y*y)` dans les boucles chaudes ;
- faire des pools pour les tableaux temporaires de `drawTrail` et de `rasterHull`.

### 18. Écran titre : longue tâche de 62 à 77 ms à chaque changement de carte de la démo [sévérité 1, staging]

**Constat** (`titlehitch.mjs`) : environ toutes les 45 s, `startDemo()` recrée la simulation et les tours. Elle est en partie masquée par la coupe de caméra.

**Correction** : préparer la carte suivante pendant un temps libre (`requestIdleCallback`), puis basculer à la coupe.

### 19. Serveur statique : contrôle de préfixe sans séparateur [sévérité 1, other]

**Constat** : `GET /..%2fdist-secret.txt` sert un fichier voisin de `dist/` (vérifié, réponse `200`). Sur la VM, `site.manifest.json`, `site.parts/` et `site.incoming/` sont donc lisibles. Il n'y a pas de secret dedans : le jeton est dans `/run/ombres`.

**Correction** : `file.startsWith(DIST + sep)` dans `server/index.ts`.

---

## 4. Risques non vérifiables en headless

- **Échap en plein écran** : en plein écran, Chrome et Firefox consomment Échap pour sortir du plein écran. Le premier appui ne met donc pas la partie en pause, contrairement à ce qu'annonce le libellé « Échap : pause ». Piste : `navigator.keyboard.lock(['Escape'])` quand on entre en plein écran (Chrome), avec un appui long sur Échap pour sortir.
- **Codes de salle devinables** : 4 lettres, soit 331 776 combinaisons, et aucune limite de débit sur `phone:hello` côté serveur. Une salle publique peut être énumérée. C'est un risque faible pour un party game, mais une limite de 10 hello par seconde et par IP dans `server/rooms.ts` suffirait.

## 5. Scripts (`tools/polish/tech/`)

| Script | Ce qu'il fait |
|---|---|
| `common.mjs` | Sonde : rAF chronométré, requête GPU de la frame entière, objets GL vivants, minuteries, longues tâches |
| `perfmatrix.mjs` | GPU, CPU et i/s par preset × nombre d'oiseaux × phase |
| `longsession.mjs` | Fuites sur 3 parties |
| `netstress.mjs`, `wsphone.mjs` | 12 téléphones Node, 13e, clignotement, muet, onglet dupliqué |
| `restart.mjs` | Redémarrage du serveur de prod |
| `refresh.mjs`, `phonereload.mjs` | Rafraîchissement à chaque écran, vu du téléphone |
| `aspects.mjs` | 720p, 1366×768, 4:3, 21:9, 4K, 1080p@2, redimensionnement à chaud |
| `dprcap.mjs` | Plafond de résolution |
| `bgtab.mjs` | Arrière-plan et qualité auto |
| `contextloss.mjs` | Perte de contexte |
| `nowebgl.mjs` | Navigateur sans WebGL |
| `loadtrace.mjs` | Chronologie et poids du chargement |
| `audioseek.mjs` | Range et saut d'intro |
| `uicost.mjs` | Coût de l'UI en A/B |
| `profile.mjs` | Profils CPU et allocations |
| `savecost.mjs` | Coût de la sauvegarde |
| `benchscene.mjs` | Coût de la scène du banc |
| `titlehitch.mjs` | À-coups de l'écran titre |
| `fullscreen.mjs` | Plein écran |

Tous lisent `PORT`. Les scripts de prod prennent `--origin`.
