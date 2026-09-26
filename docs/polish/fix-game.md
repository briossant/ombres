# Polish vague 1 — correcteur **game** (ordres G1-G12)

Périmètre : `src/sim/**`, `src/bots/**`, `src/host/runner/**`, `src/input/**`, `src/director/**` (hors `narrator.ts`, `lines.ts`), `src/host/App.tsx`, `src/host/main.tsx`, `src/host/loading/**`.
Port 8836. Les vérifications en navigateur ont tourné sur un **build de production** servi sur 8836 (`NODE_ENV=production OMBRES_DIST=<scratch>/dist`) : le serveur de dev rechargeait la page (HMR) à chaque fichier modifié par un autre correcteur, ce qui cassait les longs scénarios.
Captures : `shots/polish/fix-game/`. Scripts de vérification : `tools/polish/fix-game/` (`fallbacks.mjs`, `bgtab.mjs`, `lobby-keys.mjs`, `impacts.mjs`, copies de `phonereload.mjs` / `refresh.mjs` qui écrivent dans ce dossier).

Bilan : tests `npx vitest run src/sim src/bots src/director src/input` : **163 verts** (12 fichiers) ; `npx tsc` propre sur mes fichiers ; `pnpm check:boundaries` OK.

---

## G1 · Solo : les bots mettent la pression dès l'après-midi — **fait** (un critère à la limite)

**Outil d'abord.** `tools/e2e/qa/pilot.mjs` : relâcher un doigt = `touchEnd` vide puis `touchStart` des doigts restants (joystick reposé à sa base, puis `touchMove` à sa position), pour PLONGER comme pour COUP D'AILE. `tools/polish/feel/pilot.mjs` est un pilote clavier (rien à changer). `tools/polish/feel/phones.mjs` et `steer()` de `lib.mjs` ont le même défaut : hors de mes Edits autorisés, signalé dans `REQUESTS.md`.

**Bots.**
- `defaultBots(1)` : Faucon, Laboureur, **Pie** (`roster.ts`, test mis à jour).
- Faucon (`styles.ts`) : chasse dès 15 s (5 s avant, il se rapproche d'une proie en peignant), appétit réduit jusqu'à 40 s (pauses de 6 à 9 s entre deux attaques), quête d'une proie jusqu'à 110 m, proie abandonnée au-delà de 60 m, approche franche (`goalGain` 1,0). Le cercle signature (0,8 s du GDD) demandait 110° ou 1,6 s : le Faucon passait au-dessus de sa proie et perdait le verrouillage avant d'avoir « le droit » de piquer (trace : verrouillage à 18,8 s, premier piqué à 34,8 s) → 80° ou 1,2 s, cercle un peu plus large.
- Oisillon : un humain que personne n'a piqué depuis 25 s (`coordinator.sinceDivedOn`) redevient une victime, recherchée plus loin et préférée ; piqué lancé quelle que soit la géométrie (1,2 s de chevron, mal engagé). Jamais un joueur en aide au vol.
- Voyageur / Seigneur : préférence pour une proie humaine (`levels.humanPreyBias` 1,5 / 1,2).
- Piqués « tombés dessus » non voulus : le bot relâche le temps d'un tick au lieu de lancer puis annuler (plus aucune alerte pour rien).

**Vérifié** (`npx tsx tools/polish/feel/bot-pressure.ts --rounds=12 --policy=low`) :

| niveau | piqués / manche | sur l'humain | 1er piqué de bot (médiane) | feintes < 0,2 s | manches sans piqué sur l'humain |
|---|---|---|---|---|---|
| Oisillon avant → après | 1,8 → 3,8 | 0,2 → **1,8** | 53 → 34 s | 0 → 0 | 83 → **0 %** |
| Voyageur avant → après | 4,1 → 6,1 | 1,3 → **2,8-3,3** | 40 → **22 s** | 4 → 0 | 8 → 0 % |
| Seigneur avant → après | 3,3 → 6,2 | 1,3 → 2,1-2,2 | 49 → 22 s | 19 → **0** | 33 → 0-8 % |

`solo-sweep.ts --rounds=24`, profil « appliqué (mixte) » : Oisillon 96 → 83 %, **Voyageur 75 → 50 %** (48 manches : 50 %, et 48 % avec `humanPreyBias` 1,3 : ce n'est pas la pression du Faucon qui pèse, c'est la Pie, 14 victoires sur 48), Seigneur 46 → 50 %. **Voyageur à la borne basse de la cible 50-75 %** : la Pie demandée par l'ordre est la meilleure peintre des Voyageurs (27 % à 6). Si le lead veut ~60 %, levier proposé : Pie en solo qui ne pille que la couronne (pas « le plus gros territoire »).

Pilotes réparés dans le jeu (`tools/e2e/qa/group.mjs`, 2 téléphones + clavier, build de prod) : voir « G1 — group.mjs » en fin de document.

## G2 · Des feintes lisibles — **fait**

`brain.ts` : la feinte est un **bluff** tiré par épisode de verrouillage (rythme tenu à `RULES.botFeintChance` des piqués du bot : ×1,8 quand il est en retard, ×0,6 en avance). Il n'est lancé que si le clac prévu laisse ≥ 0,3 s de chute guidée ; relâché 0,35 à 0,55 s après la prise d'élan ou juste avant le clac (`feintTick`, marge 2 ticks), jamais avant 0,3 s ; redressement franc (1,1 s sans PLONGER). Après une feinte, le chasseur garde sa proie et refait son cercle : si la cible a gaspillé son coup d'aile, la vraie attaque suit (GDD §8.5 « lire la feinte »).

**Vérifié** : `bot-pressure.ts` : feintes < 0,2 s **0 / 45, 0 / 73, 0 / 74** (avant : 0/21, 4/49, 19/40). Délais mesurés (diagnostic, 24 manches) : toutes les feintes entre 0,35 et 0,55 s après la prise d'élan, en chute guidée. Part de feintes parmi les piqués lancés : **Seigneur 36 % (politique low) / 34 % (mixed)**, Voyageur 14-16 % / 9 % (GDD 15 %). `npx vitest run src/bots` : 12 verts.

## G3 · Les indications arrivent au bon moment — **fait**

`src/director/hints.ts` : plus aucune bulle à partir de la Grande Ombre, ni dans les 1,5 s qui la précèdent (une bulle dure 2,5 à 6 s) ; les indications en attente tombent, le bandeau reste. « dodge » : mise en file à la prise d'élan, montrée au `diveCommit` du même chasseur, jamais marquée vue sur une feinte ; aucune autre bulle ne passe pendant qu'un piqué arrive sur le joueur.

**Vérifié** : 3 cas ajoutés à `hints.test.ts` (clac → bulle au clac ; feinte annulée puis vrai clac : bulle au clac, mémoire vierge avant ; rien pendant la Grande Ombre). Journal de deux manches à 12 oiseaux (`impacts.mjs`, sortie du directeur) : `… 84.8 s dodge, 98.0 s greatShadow | après 98 s : 0` et `… 89.6 s towerShade, 98.0 s greatShadow | après 98 s : 0` ; la bulle « dodge » tombe à l'instant du clac (51,0 s, touche à 51,0 s).

## G4 · Hiérarchie des impacts — **fait** (règle un peu plus stricte que l'ordre)

Runner (`maybeFlash`) : flash « planche » pour une touche de couronne ou un vol ≥ 1 % de l'arène (au plus un toutes les 6 s), ou une touche impliquant un humain. Première mesure avec exactement la règle de l'ordre : **5 flashs** à 12 oiseaux (pilote clavier très actif : 7 touches le concernant). Ajouté : une petite touche d'un humain (hors couronne, vol < 1 %) prend au plus 2 flashs par manche, 12 s après le précédent, et 4 flashs par manche au total (`RULES.plancheFlash*`). Esquive (`diveMiss` `dodged`) impliquant un humain : ralenti 0,6× pendant 0,2 s, soumis à `hitSlowmoMinGap`. « Réduire les flashs » respecté.

**Vérifié** (`impacts.mjs`, 12 oiseaux, 1 manche à vitesse réelle, `runner.impactLog`) : avant 11 flashs (critique feel) ; règle de l'ordre : 5 (`g34-twelve/journal.json`) ; règle finale : **3 flashs**, chacun justifié — `3.6 s vol 1.87 %`, `16.0 s humain vol 0.32 %`, `51.0 s humain vol 0.54 %`. Ralenti d'esquive : `dodgeSlowmo 67.9 s (h7→t0)`, `34.4 s (h8→t0)` ; capture `shots/polish/fix-game/g34-twelve/03-dodgeSlowmo-t34.jpg` (Corail esquive le Faucon, sous-titre « Prune esquive »). Visuels (B7) et son (A7) chez birds / audio.

## G5 · Rechargement du PC : les téléphones gardent leur écran — **fait**

`restoreEarly` mémorise l'écran sauvegardé (`bootView` : partie, manche, résultat, titres) ; pendant le chargement, `viewContext()` le rend aux téléphones avec `paused: { by: null, canResume: false }` (« Mise en pause depuis l'écran — La partie reprendra depuis l'écran »). Aucune clé de chaîne ajoutée (le texte existant suffit).

**Vérifié** : `tools/polish/fix-game/phonereload.mjs` : `play → play+overlay → play` (capture `phonereload-01-play+overlay.jpg`) ; `refresh.mjs` (copie robuste à l'annonce « dernière manche ») : cartes `intro → intro+pause → intro`, compte à rebours et manche `play → play+pause → play`, résultats `roundEnd → roundEnd+pause → roundEnd`, podium `matchEnd → matchEnd+pause → matchEnd` : **jamais le salon**. (Les « KO » du script sur `paused` / `roundResults` / `podium` viennent de son chronométrage en `?debug=fast` : la manche ou l'entracte finissent pendant le rechargement, et le podium rejoue son arrivée cinématique.)

## G6 · Plus jamais d'écran blanc — **fait**

`main.tsx` : test `getContext('webgl2')` ; sans WebGL 2, écran explicatif (`src/host/loading/Fallback.tsx`, clés `host.webgl.title|body`), `runner.start()` jamais appelé. `App.tsx` : `ErrorBoundary` autour de `<WorldCanvas>` et de `<UiRoot>` (sauvegarde immédiate, case « Recharger », clés `host.error.body|reload`) ; `?debug` : `window.__ombresCrash('ui' | 'world')`. `src/phone/main.tsx` : borne d'erreur autour de `<PhoneApp/>` (Edit ciblé, mêmes clés).

**Vérifié** (`tools/polish/fix-game/fallbacks.mjs`) : Chromium `--disable-3d-apis` → message visible (`g6-nowebgl.jpg`), **0 connexion WebSocket**, aucune erreur de page. Exception forcée dans l'UI puis dans le monde en pleine manche : bouton « Recharger » visible (`g6-crash-ui.jpg`), puis même manche, même instant (t = 5,6 s / 7,2 s), compte « 3 » de reprise (`g6-crash-world-reloaded.jpg`). Au passage : le passage en arrière-plan qui suit un rechargement posait une pause (G11) ; corrigé (`unloading`).

## G7 · Clavier au salon — **fait**

Runner (`lobbyBack`) : Échap retire d'abord le dernier joueur au clavier (toast « Clavier 1 quitte le désert ») ; avec des téléphones, un Échap arme la sortie (toast « Échap encore une fois : retour au titre », 2 s), le second ramène au titre ; Retour arrière ne quitte plus le salon. Hors du salon, `phoneView` ne désigne plus de meneur : le téléphone affiche « La partie se lance depuis l'écran » au lieu d'un « Lancer » inerte. `labels.ts` : `keyLabel` pour le joueur 2 (« AltGr » en AZERTY, « Alt droit » / « Right Alt » ailleurs ; « M » / « Point-virgule »), test ajouté.

**Vérifié** (`tools/polish/fix-game/lobby-keys.mjs`) : `après Retour arrière : écran lobby, joueurs keyboard` ; `après Échap (clavier + téléphone) : écran lobby, joueurs phone` ; `après Échap (téléphone seul) : écran lobby … runner.toast.escAgain` ; `après second Échap (< 2 s) : écran title` ; téléphone : « La partie se lance depuis l'écran », pas de bouton Lancer (`g7-esc2-armed.jpg`, `g7-phone-after-title.jpg`). `screens.mjs` / `firsttime/keyboard.mjs` non relancés (ils écrivent dans les dossiers des critiques) ; même séquence couverte ici.

## G8 · Des toasts de connexion justes — **fait**

Toast « X rejoint le désert » à la première validation du profil (nom et couleur définitifs), plus à la connexion ; « a perdu la connexion » (et son son) au plus une fois par téléphone toutes les 20 s.

**Vérifié** : voir « G8 — netstress / group » en fin de document.

## G9 · Le piqué doit payer (essai A/B) — **non retenu**

Essai `trailStealSeconds` 2,5, `trailStealCrownSeconds` 4 (avec les bots G1-G2) : chasseur-mixte en solo 83/25 → 83/33 (Oisillon), 50/0 → 58/13 (Voyageur) : écart de 45-50 points (critère < 10) ; à 6 Voyageurs le Guetteur monte à 33 % et le Faucon tombe de 8 à 2 %. Critère non tenu : `rules.ts` revenu à 1,5 / 3 s. Tableaux complets : `docs/agent-notes/sim.md` §7. `npx vitest run src/sim` vert.

## G10 · Titres et faits marquants — **fait**

`assignTitles` : Rapace d'office au chasseur dominant (≥ 2 × la moyenne des touches), puis titres flatteurs, neutres, moqueurs ; jamais Kamikaze au meilleur chasseur ni Gibier à la meilleure anguille. « Le Souverain » (total de soleils) pour le vainqueur sans titre (`withSovereign`, clés `titles.souverain.*` FR/EN par Edit ciblé). Un fait marquant ne revient jamais dans une partie (`finishRound`). Le miroir `TitleId` de l'UI ne connaît pas `souverain` : adaptateur `uiTitleId()` + demande hostui.

**Vérifié** : 3 cas dans `match.test.ts` (7 touches / 5 ratés → Rapace ; domaine du Gibier ; Souverain et co-vainqueurs) + partie complète de bots (faits jamais répétés, vainqueur toujours titré). Podium en jeu : voir « G1 — group.mjs ».

## G11 · Onglet du PC en arrière-plan : pause — **fait**

`visibilitychange` → caché pendant une manche non terminée : `pause(-1)`, téléphones en pause sans « Reprendre » (un « Reprendre » du téléphone est refusé tant que l'onglet est caché) ; au retour, reprise automatique avec « 3, 2, 1 ». Pas de pause au rechargement (`beforeunload` / `pagehide`).

**Vérifié** (`tools/polish/fix-game/bgtab.mjs` ; Chromium sans tête garde `visibilityState = visible` quand un autre onglet passe devant, l'API est donc émulée en plus du changement d'onglet) : masqué → `paused: true`, téléphone `pause {"by":null,"canResume":false}` ; 6 s plus tard, malgré le « Reprendre » du téléphone, `t` figé à 12,2 s ; retour → `jeu:3 → jeu:2 → jeu:1 → jeu:0 → jeu`, téléphone sans pause (`g11-return-countdown.jpg`).

## G12 · Chargement : un 100 % honnête — **fait**

`warmUp()` : les 30 premières images mènent la barre à 95 %, la stabilité (8 images < 50 ms) au reste ; 100 % seulement à la fin ; délai limite 6 s (au lieu de 20). Pause après 100 % : 450 → 250 ms.

**Vérifié** (`tools/polish/tech/loadtrace.mjs --at=title`, GPU à 100 % occupé) : `5.30 s shaders 75 % … 6.10 s shaders 94 % → 6.16 s 100 % → 7.11 s title` (100 % tenu 0,95 s avant la réduction du délai à 250 ms).

## Demandes d'autres correcteurs traitées

- phone P4 : `reduceFlashes` → `markViews()` dans `bindSettings`.
- audio A8 : sous-titre du narrateur retiré au `hide` du lecteur (fin réelle de la voix) ; la durée locale devient un filet de 4 s.
- hostui H9 : `localButtonLabels` passe par `keyLabel` (G7).

## Edits hors périmètre (tous autorisés, ciblés)

`tools/e2e/qa/pilot.mjs` (relâchement des doigts) ; `src/shared/strings/host.ts` (4 clés `host.webgl.*`, `host.error.*`) ; `src/phone/main.tsx` (borne d'erreur) ; `src/shared/strings/titles.ts` (clés `titles.souverain.name|desc|stat`, un seul titre). Ajouts dans mon domaine de chaînes `src/shared/strings/runner.ts` (`runner.toast.keyboardLeft`, `runner.toast.escAgain`). `views.ts` et `runner.ts` ne sont modifiés que par Edits ciblés (audio et phone y travaillent aussi).

---

## G1 — `tools/e2e/qa/group.mjs` avec les pilotes réparés (build de prod, 2 téléphones + clavier + Faucon)

- Podium (`shots/qa/fix-game-group/155-podium-panel.jpg`) : « En bas » **67 %, 15 %, 69 %, 66 %** (avant : 100 % / 99 % pour les pilotes téléphone) ; les pilotes esquivent enfin (esquives 2, 4, 10 ; `pilotes : A {"dives":55,"flaps":12} B {"dives":58,"flaps":10}`).
- Faucon (3 humains + Faucon) : 2e de la partie, manche 1 gagnée par Corail (clavier, `057-r1-results-c.jpg`), partie gagnée par Lou (téléphone) : il ne gagne pas 3 manches sur 3 → `defaultBots(3)` inchangé (Faucon).
- Titres au podium : le meilleur chasseur (Corail, 8 touches) est « Le Rapace », le vainqueur a un titre (Dernier Rayon). Partie solo (`tools/e2e/solo.mjs`, `shots/runner/solo/23-match-results-late.jpg`) : 4 titres flatteurs, dont Rapace au Faucon (3 touches). Consoles propres (PC et téléphones).

## G8 — journaux

- `group.mjs` : `7.0 toast « Brieuc joins the desert »`, `9.4 toast « Lou joins the desert »` (nom choisi, couleur Safran choisie ; avant : « Coral joins the desert » à la connexion, couleur provisoire).
- `tools/polish/tech/netstress.mjs`, section « clignotement court » (coupures de 0,7 s toutes les 1,5 s pendant 12 s) : **`toasts ["host.toast.left"]`**, 1 toast (avant : 5). Coupures longues (3 × 4 s) : un seul « a perdu la connexion » (les toasts remplaçant / reprise restent). Attention : ce script écrit ses captures dans `shots/polish/tech/` (celles de la critique tech ont été refaites avec le nouveau build).

## Fumée finale

`PORT=8836 node tools/e2e/solo.mjs` (build de prod à jour) : titre → salon → cartes → 3 manches → podium → revanche, **aucune erreur console**.
