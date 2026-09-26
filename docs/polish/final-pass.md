# Passe finale avant sortie : joueur exigeant et directeur artistique

Date : 2026-09-26 23 h 14 → 2026-09-27 00 h 20. Serveur de dev sur le port 8873, arrêté à la fin par son PID
(`pnpm dev` → `tsx watch` → `node server`, les trois PID tués, port libre). Build de production servi par
`tools/e2e/qa/prod.mjs` sur 8874 (serveur lancé et arrêté par le script, port libre). Toutes les pages Playwright
tournaient sans HMR (`tools/polish/staging/nohmr.mjs`). Aucun autre agent ne jouait sur la machine : l'agent des voix
travaille sur Kaggle, et je n'ai touché ni `public/audio/narrator` ni `tools/tts`.

Scripts (nouveaux) : `tools/polish/final/` (`group.mjs`, `solo-phone.mjs`, `twelve.mjs`, `podium.mjs`, `checkui.mjs`),
dérivés de `verify2-eyes/`. Captures : `shots/polish3/final/` (75 Mo). Planches : `shots/polish3/final/sheets/`.

## 0. Verdict

**Le jeu est prêt à sortir.** Trois parties complètes, une manche à 12, cinq scénarios de bout en bout et le build de
production se sont déroulés sans une erreur ni un avertissement console, sur le PC comme sur les téléphones.

Les écrans qu'un joueur voit d'abord sont soignés, en FR comme en EN :
- le chargement et le titre, dont 60 s regardées sans une image ratée ;
- le salon, les cartes, les résultats et le podium, qui s'ouvre sur un plan pur en contre-jour.

J'ai corrigé 8 défauts petits et sûrs (§2). Ce qui reste (§4) relève de la mise en scène de la Grande Ombre, de la
densité du couchant à 12, et de deux chevauchements d'interface que j'ai jugés trop gros pour un Edit ciblé.

## 1. Ce que j'ai joué et regardé

| Scénario | Contenu | Captures (toutes regardées) |
|---|---|---|
| **Groupe FR**, vitesse 1, High : PC 1920 × 1080 + iPhone 15 Pro + Pixel 7 + 1 joueur clavier + 1 bot Faucon, 3 manches (Parasols, Aiguilles, Cadran ×2) | chargement (5 images), titre 60 s (40 images), menu, réglages, crédits, salon vide / 1 téléphone / 2 téléphones + clavier / en vol, cartes, 21 instants par manche, rafales de piqués, nuit, résultats (PC + téléphones), podium (8 images), fins de partie, revanche votée, pause PC | `group-fr/` (215 images) ; planches `g-*` |
| **Solo EN**, un iPhone contre 3 bots, High | titre, menu, réglages, crédits, salon, cartes, 3 manches, résultats, podium, revanche, pause PC puis **pause depuis le téléphone** (appui long) et reprise | `solo-phone-en/` (163) ; planches `s-*` |
| **12 oiseaux** (2 claviers + 10 bots), FR, High | salon à 12, une manche toutes les 5 s, daltonien à 60 s, Grande Ombre, nuit, résultats | `twelve/` (35) ; `t12-a`, `t12-b` |
| **Podium rapide**, 4 oiseaux | plan pur à 0,9 et 2 s, panneau à 5 et 8 s | `podium-4-1920/` ; `podium-fast.jpg` |
| **Contrôle des correctifs** | réglages (ordre des flèches), salon, surcouche de reconnexion du téléphone FR et EN | `checkui/` ; `checkui-lobby.jpg` |

- Console : propre partout (PC, iPhone, Pixel), `rawKeys` vide partout.
- Cadences : 57,7 à 60 i/s en partie, avec au plus 235 images au-delà de 20 ms dans une manche. Ce ne sont pas des
  mesures : trois navigateurs tournaient sur le même iGPU, en dev.

**Ce que le joueur exigeant retient**
- Le titre au couchant, les ombres du logo et le plan du podium en contre-jour sont de vraies images de bande-annonce.
- Le salon se comprend sans explication (objectifs Vole / Plonge / Pique, mannequin), et le téléphone reste lisible à
  1 m (gros boutons, états PIQUER / « Striking! »).
- La fin de manche raconte quelque chose : carte d'arène sur papier, compte des soleils et fait marquant (« Remontée »,
  « Plus gros vol », « Photo-finish »), puis un titre par joueur au podium.
- Le narrateur est juste et bref, en FR comme en EN.

## 2. Corrections faites (Edits ciblés, notées dans `docs/agent-notes/REQUESTS.md`)

1. **Téléphone, écart en points** (`src/host/runner/views.ts`). Pour le même fait de fin de manche, le PC affichait
   « Photo-finish : 0,3 pt d'écart » et le téléphone « 0,3 % d'écart » (`group-fr/170-A-r2-results.jpg`, contre
   `167-r2-results-1500.jpg`). Le photo-finish et le raz-de-marée passent en points sur le téléphone, avec les mêmes
   clés que le PC (`host.fact.pt` / `pts`).
2. **Glossaire FR** (`src/shared/strings/hints.ts`). L'indication d'esquive disait « Il **plonge** sur toi : COUP
   D'AILE ! ». Or PLONGER désigne le vol bas, et l'attaque se dit *piquer* (ORDERS §9). Elle dit maintenant « Il pique
   sur toi ».
3. **EN, orthographe britannique cohérente** (`src/shared/strings/phone.ts`). Le PC écrit *colour*, *favourite* et
   *licence*, mais le téléphone écrivait « Your color », « More colors », « Fewer colors » et « Change name or color ».
   Les quatre chaînes passent en *colour*. `tools/polish/firsttime/group.mjs` suit (« More colours »).
4. **EN, fin de partie** (`phone.ts`). Le téléphone affichait « Game over / wins the game » là où le PC affiche « Match
   over / wins the match ». « Game over » sonnait en plus comme une défaite pour le vainqueur. Le téléphone reprend les
   termes du PC (`solo-phone-en/181-A-matchEnd.jpg`, après correctif).
5. **EN, même verbe pour la même chose** (`src/shared/strings/titles.ts`). Le Gibier disait « Knocked **down** {n}
   times » alors que le téléphone dit « Knocked out! » et « Times knocked out ». Le titre dit maintenant « Knocked out
   {n} times ».
6. **Réglages, touches** (`src/host/ui/screens/Settings.tsx`). Les flèches s'affichaient ← ↑ ↓ → sous W A S D : la
   flèche gauche tombait sous W (haut). Elles suivent maintenant l'ordre de W A S D, ↑ ← ↓ →
   (`checkui/settings-fr.jpg`).
7. **Salon, mannequin** (`src/host/ui/hud/WorldLayer.tsx`). L'anneau pointillé du mannequin, rendu après les étiquettes,
   masquait celle du joueur clavier (`group-fr/062-lobby-before-start.jpg` : « Corail » sous l'anneau). Le mannequin est
   maintenant rendu en premier, donc son anneau passe sous les étiquettes. Seul l'ordre du DOM change, et aucune règle
   CSS ne dépend de cet ordre.
8. **Téléphone, surcouche de reconnexion** (`src/phone/screens/Overlays.tsx`). En EN, le titre laissait « OFF… » seul
   sur sa ligne (`shots/qa/prod/007-A-server-down.jpg`). Il est maintenant centré et équilibré : « THE WIND / CARRIED YOU
   OFF… » (`checkui/phone-reconnect-en.jpg`).

## 3. Preuves

- `npx tsc --noEmit -p tsconfig.json` : 0 erreur. `pnpm check:boundaries` : OK. `npx vitest run` : **30 fichiers,
  361 tests verts**, avant et après mes correctifs. Le seul bruit est `THREE_CJS_DEPRECATED`, côté dépendance.
- Scénarios de bout en bout (dev 8873, après tous les correctifs sauf le n° 8 ; `resilience` et `phones` ont été
  rejoués après le n° 8) :

| Scénario | Résultat |
|---|---|
| `tools/e2e/solo.mjs` | 3 manches, fin de partie, revanche, aucune erreur console |
| `tools/e2e/phones.mjs` (deux passes) | 11/11, revanche votée, console PC et téléphones propre |
| `tools/e2e/flows.mjs` | 16/16 : crédits, manette, 2e clavier, pause PC et téléphone, arrivée en cours de partie, retour au salon |
| `tools/e2e/resilience.mjs` (deux passes) | 17/17 : remplaçant à 3,2 s, soleil 24,20 → 24,43, désert à 0,7 % près, reprise en « 3, 2, 1 » |
| `tools/e2e/qa/prod.mjs` (`PROD_PORT=8874`, `pnpm build` refait après le dernier correctif) | tout vert, deux passes : titre en 2,8 s, 6,84 Mo, rien de debug sans `?debug`, serveur coupé puis relancé en pleine manche (même salle, aucun remplaçant), revanche, console propre |

## 4. Liste résiduelle honnête, par impact

1. **Grande Ombre, premier plan et petits oiseaux (DA / climax).** C'est ce que les vagues 2 et 3 ont annoncé, et je
   le vois encore sur une manche sur trois :
   - Le Cadran à 104 s : grand disque bleu à gauche (~10 % du cadre) et parasol coupé par le bas
     (`group-fr/209-r3-t104.0-greatShadow.jpg`).
   - Les Aiguilles à 106-109 s : oiseaux de 40 à 60 px, porteur de la couronne tout au bord, dans le rideau de nuit
     (`group-fr/160`).
   - Les autres plans serrés sont bons (`group-fr/103`, `solo-phone-en/158`).
   - Décision de DA toujours ouverte : `GS_CROWN_MAX_W` (235 m).
2. **« Tapis » saturé du couchant à 12 (DA).** Il est toujours là (`twelve/026-greatShadow-t104.jpg`). World a montré
   qu'on ne le calme qu'en desserrant la porte de lisibilité à 0,059. C'est au lead de trancher.
3. **Téléphone, messages sur le bandeau (phone, moyen).** En paysage étroit (iPhone 15 Pro, 659 px), une indication
   longue (474 px) cache pendant 2,5 s le nom (tronqué en « Brie »), le rang et la jauge
   (`group-fr/094-A-r1-t55.6.jpg`, `solo-phone-en/054`). C'est l'emplacement choisi par phone. Il faudrait poser les
   messages sous le bandeau en paysage étroit : je ne l'ai pas fait, ce n'est pas un Edit sûr.
4. **Traits de rappel au travers des étiquettes (ui, moyen).** Au salon et à 12, le trait d'une étiquette passe sur une
   autre (`group-fr/060` : trait de « Lagon · Faucon » sur « Brieuc » ; `twelve/001` : « Safran · Guetteur » à travers
   « Carmin · Laboureur »). Chaque ancre a son propre contexte d'empilement (`will-change: transform`). Aucun z-index ne
   suffit donc : il faut une couche séparée pour les traits.
5. **Correctif n° 7 non revu dans le cas exact.** Le recouvrement du mannequin dépend du vol. Je ne l'ai pas reproduit
   après le correctif (`checkui/lobby-0.jpg` montre le salon intact). L'ordre du DOM le garantit, mais je ne l'ai pas
   vu à l'image.
6. **Crédits (texte, faible).** « Voix du conteur » en titre, puis « Voix du narrateur synthétisée… » juste dessous :
   deux mots pour la même voix. Je n'y ai pas touché, car l'agent des voix peut devoir réécrire ce bloc.
7. **Performance (world).** High à 12 tient la cible avec peu de marge (fix3-world). La manche 2 de la qualité auto n'a
   pas été revérifiée, et je n'ai fait aucune mesure GPU.
8. **Debug seulement.** En `?debug=fast`, le « 5 » du compte à rebours chevauche la bannière de la Grande Ombre. Ce
   défaut est connu et n'arrive pas à vitesse réelle.
9. **Non vérifié par moi** :
   - le son (aucune écoute ; tous les événements de simulation ont un son dans `sfx.ts`, sauf `unlock`, `stunEnd`,
     `immuneEnd` et `over`, qui n'en ont pas par choix) ;
   - les formats 4:3 et 21:9 ;
   - de vrais téléphones (émulation seulement) et une vraie manette ;
   - la lisibilité d'un salon plein de joueurs téléphone.

Artefacts de mes scripts, sans défaut du jeu :
- la première tentative de pause depuis le téléphone du groupe a échoué, parce que le pilote tactile touchait encore
  l'écran (script corrigé, pause vérifiée en solo) ;
- `checkui` montre « Manches 5 », parce qu'un Entrée de trop a été reçu par la ligne focalisée ;
- le podium du groupe a été capturé tard, alors que le plan pur à 0,9-2 s est bien là au podium rapide.

## 5. Fichiers

**Jeu** (Edits ciblés) :
- `src/shared/strings/phone.ts`, `src/shared/strings/titles.ts`, `src/shared/strings/hints.ts` ;
- `src/host/runner/views.ts` ;
- `src/host/ui/screens/Settings.tsx`, `src/host/ui/hud/WorldLayer.tsx` ;
- `src/phone/screens/Overlays.tsx`.

**Outils** : `tools/polish/final/*.mjs` (nouveaux) ; `tools/polish/firsttime/group.mjs` (1 locator).

**Docs** : ce fichier ; 3 lignes dans `docs/agent-notes/REQUESTS.md`.

**Build** : `dist/` et `dist-server/` reconstruits (`pnpm build`) à l'état final.
