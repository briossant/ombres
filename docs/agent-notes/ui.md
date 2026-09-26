# Agent ui — interface du PC (écrans + HUD)

Propriété : `src/host/ui/**`, `src/shared/strings/host.ts`, `src/shared/strings/titles.ts`,
`public/fonts/**`, `public/ui/**`, `dev/ui.html`, `src/dev/ui/**`.

DOM/React au-dessus du canvas 3D, papier + encre (ART_BIBLE §8), lisible à 3 m.
Page de dev : `http://localhost:8805/dev/ui.html?screen=<écran>&lang=fr|en&n=<joueurs>` (détails en bas).

---

## 1. Intégration en 3 lignes (phase 3)

```tsx
// src/host/App.tsx
import { UiRoot } from './ui/UiRoot.tsx'
export const App = () => (<><Canvas …/><UiRoot /></>)   // UiRoot une seule fois, après le canvas
```

```ts
// runner : au démarrage
import { setUiActions, connectHudEvents, hudFromSim, useUi, … } from './ui/viewModel.ts'
setUiActions({ play, startMatch, addBot, removeBot, setBotLevel, setBotPersonality, setMatchSetting,
               joinKeyboard, skipRules, pause, resume, quitToLobby, continueResults, rematch })
connectHudEvents()            // le HUD s'abonne à simEvents (compte à rebours, bannières, 5-4-3-2-1, flash, « +x % », étiquettes)
// à chaque tick de manche :
hudFromSim(sim.state)         // throttlé à 10 Hz : soleil, phase, palette, parts, couronne
// à chaque frame (après la caméra) : positions écran des oiseaux
hudAnchors.birds[slot] = { active, x, y, behind, hidden }   // px CSS du viewport, sous l'oiseau
```

`UiRoot` gère : échelle (zoom = hauteur / 1080, largeur mini 1600), écran courant avec
transitions, HUD, pause, réglages, toasts, surcouche de reconnexion, navigation clavier /
souris / manette, touche F (plein écran). Aucun élément de debug.

Polices : `preloadUiFonts(onProgress)` (`src/host/ui/fonts.ts`) à mettre dans le
manifeste de chargement (les @font-face sont en `font-display: block`).

---

## 2. Le modèle de vue — `src/host/ui/viewModel.ts` (le contrat)

Stores zustand écrits par le runner (≤ 10 Hz). Tout est typé et commenté dans le fichier.

| Store | Contenu | Qui écrit |
|---|---|---|
| `useUi` | `screen` (`loading · title · lobby · rules · game · roundResults · matchResults · credits`), `overlay` (`settings`/null), `loading {progress 0..1, labelKey}`, `titleMenuOpen`, `paused`, `pausedBy` (slot, −1 = PC), `hostLink` (`ok · reconnecting · lost`) | runner (l'UI change `overlay`, `titleMenuOpen` et les écrans « menu » par défaut) |
| `useRoster` | `slots: SlotVM[]` — `{slot, colorIndex, name, kind: phone·keyboard·bot, bot?: {personality, level}, connected, ready, goals {fly, dive, strike}, assist, substitute, keyboardGroup?, host?}` | runner (salon, HUD et résultats lisent tous ce store) |
| `useLobby` | `roomCode`, `joinUrl` (URL complète du QR), `connection` (`connecting · online · offline`), `match {rounds 1/3/5, length short/normal/long, botLevel 0/1/2, lastRoundDouble}`, `keyboardJoined` | runner (net pour code/URL) |
| `useRulesCards` | `deadline` (performance.now ms), `okCount`, `humanCount` | runner |
| `useHud` | `round, rounds, doubleRound, phase, sunU, paletteElevDeg, countdown, lastSeconds, shares[{slot, cells}], arenaCells, crownSlot, flash, banner, subtitle, hints[], toasts[], gains[], tagsUntil[]` | `hudFromSim` + `connectHudEvents` + aides ci-dessous |
| `hudAnchors` (objet mutable) | `birds[12] = {active, x, y, behind, hidden}` | runner, **chaque frame** (lu en rAF, sans React) |
| `useRoundResults` | `round, rounds, double, mapId, nextMapId (null = dernière), rows[{slot, share, cells, rank, suns, totalSuns}] triées, tie, fact {kind, slot, value}, deadline, readyCount, humanCount` | runner à la nuit |
| `useMatchResults` | `rows[{slot, rank, suns, totalShare, title {id, value} \| null, stats {hits, gotHit, dodges, misses, stolenFrac, lowFrac, hiddenSeconds, roundsWon}, votedRematch}]` triées, `coWinners`, `rematch {votes, humans, deadline}` | runner au podium |

Réglages : l'écran Réglages lit/écrit directement `useSettings` (`src/host/settings.ts`, persisté).
Le plein écran passe par `uiActions.toggleFullscreen()` (défaut : API Fullscreen).

### Aides d'écriture (appelables par le runner, le directeur, l'audio)

| Fonction | Effet |
|---|---|
| `setLoading(progress, labelKey?)` | barre de chargement ; clés `host.loading.{fonts,textures,models,sounds,voices,shaders,world,done}` |
| `setScreenState(screen)` | change d'écran (ferme la surcouche) |
| `resetHud(round, rounds, double)` | au début de chaque manche |
| `showBanner(key, {subKey, params, tone: 'phase'\|'alert', seconds})` | bannière centrale (ex. dernière manche : `showBanner('host.banner.lastRound', {subKey: 'host.banner.lastRoundSub', tone: 'alert'})`) |
| `showSubtitle({key \| text, colorIndex, seconds})` | récitatif du narrateur ; `{color}` dans la réplique est remplacé par le nom stylé (pastille, variante texte, glyphe en daltonien). Passer la durée du clip. Masqué si réglage narrateur = « off » |
| `showHint(slot, key, params, seconds)` | bulle d'indication à la couleur du joueur, au-dessus de son oiseau (montre aussi son étiquette) |
| `pushToast(key, {params, slot, tone: 'info'\|'alert', seconds})` | toasts de session (`host.toast.joined/left/substitute/back/keyboard/full/paused`) |
| `popGain(slot, frac, x?, y?)` | « +2,4 % » qui s'envole (déjà fait pour `bigSteal` et `diveHit`) |
| `showTag(slot, s)`, `showAllTags(s)` | étiquettes de nom (déjà fait : 5 s au départ, puis aux événements) |

`connectHudEvents()` traite : `countdown` (3-2-1-Envol, étiquettes), `phase` (bannières golden/sunset/afternoon/Grande Ombre avec leurs lignes « à tous »), `lastSeconds`, `bigSteal` (flash du segment + « +x % » + étiquette), `diveHit` (« +x % » de la traînée, étiquettes chasseur/victime), `diveMiss`, `crown`, `night`.
→ Le directeur n'a **pas** à envoyer en bulle les indications « à tous » de l'heure dorée et de la Grande Ombre : elles sont dans les bannières (`host.phaseHint.*`).

### Actions — `UiActions` (le runner les implémente avec `setUiActions`)

`play()` titre → salon · `openSettings()/closeSettings()` · `openCredits()` · `back()` (Échap contextuel) ·
`startMatch()` · `addBot(personality|null, level)` (null = première personnalité absente) · `removeBot(slot)` ·
`setBotLevel(slot, level)` · `setBotPersonality(slot, p)` · `setMatchSetting(key, value)` · `joinKeyboard()` ·
`skipRules()` · `pause()` · `resume()` · `quitToLobby()` · `continueResults()` · `rematch()` · `toggleFullscreen()`.
Les défauts : navigation pure UI pour play/settings/credits/back/skipRules/pause/resume/quitToLobby ; journal sinon.
L'UI appelle toujours `uiActions.x()` : `setUiActions` peut être rappelé à tout moment.

Enumérations : `BotPersonality = falcon · ploughman · magpie · nomad · lookout · fool · watchmaker` ; `BotLevel = 0|1|2` ;
`TitleId = rapace · gibier · anguille · kamikaze · pilleur · raseMottes · nuage · batisseur · notaire · dernierRayon · lezard · revenant` (unités : `TITLE_UNITS`) ; `RoundFactKind = bigSteal · lastRay · comeback · mirage · hunter · dodger · photoFinish · landslide` (value = fraction d'arène, sauf hunter/dodger = compte).

---

## 3. Écrans (src/host/ui/screens)

| Écran | Points clés |
|---|---|
| Chargement | soleil sur un arc + ombre de tour qui s'allonge sur une bande de sable (palette KF80 → KF16), progression réelle lissée, libellé + % |
| Titre | logo « OMBRES » (`Logo.tsx`, SVG : case de BD avec ciel de papier et bande de désert ; lettres Julius épaissies papier/encre dressées sur l'horizon ; leurs ombres plates s'allongent et tournent en 12 s pendant que le petit soleil de la case descend ; boil 8 i/s), pitch en case, « appuie sur une touche » puis menu Jouer/Réglages/Crédits en cases à droite, rappel « F plein écran » ; la scène 3D reste visible |
| Salon | à gauche : QR (encre sur papier, marge 4 modules, 320 px), code en tuiles Averia 62, URL courte ; règles qui tournent (5 s/carte, illustration animée) ; en bas au centre : réglages de partie ; à droite : les oiseaux (jeton, nom, type, micro-objectifs Vole/Plonge/Pique → coche, aide au vol, remplaçant, hors ligne ; bots : caractère au clic/Entrée, niveau ←/→ ou clic, ✕) + « Ajouter un bot » + rappel clavier (Espace, puis AltGr pour J2) ; Lancer (Entrée). Au-delà de 8 oiseaux, une ligne par oiseau. Centre haut libre pour le désert du salon |
| Cartes des règles | 3 cases avec illustrations SVG animées (boucle 2,5 s) + légendes GDD §2, sablier de 8 s, « n/m téléphones prêts », Passer (Entrée) |
| HUD | cadran solaire (seul chrono : quart d'arc zénith → Falaise, vignette de ciel de la keyframe, graduations, segment de nuit hachuré, « Manche n/N ×2 », nom de phase 3 s) ; bande de sable triée (glyphes, % Averia, couronne sur le meneur, flash) ; 3-2-1-Envol ; 5 4 3 2 1 tamponnés ; bannières ; récitatif ; étiquettes, jetons daltoniens, flèches hors champ (bord à 3 %), bulles, « +x % » |
| Pause | case tremblée, qui l'a demandée, Reprendre / Réglages / Retour au salon (confirmation en deux temps) |
| Réglages | 4 volumes, qualité, plein écran, flashs, tremblement ; langue, daltonien, narrateur voix/texte/muet, conseils ; référence des touches (disposition réelle via `navigator.keyboard.getLayoutMap`, repli AZERTY/QWERTY selon la langue) |
| Résultats de manche | case à droite (la carte illuminée à gauche : **cadrer la carte dans les 2/3 gauches**) : décompte 3 s, vainqueur tamponné, soleils qui volent vers les totaux (du dernier au premier), fait marquant, manche suivante + sablier + prêts, Continuer |
| Résultats de partie | champion, Revanche (Entrée) / Salon (Échap), votes avec jetons + sablier ; plaques du podium à `PODIUM_X = [0.30, 0.50, 0.70]` de la largeur, vers 37 % de la hauteur (25 % au-delà de 6 joueurs) : **placer les tours du podium 3D au-dessus** ; cartes de titres (titre, chiffre, description, stats) |
| Crédits | défilement auto (↑/↓, molette), depuis `docs/CREDITS-sources.md` (import `?raw`, regroupé par type, attributions « … » reprises telles quelles), bibliothèques, remerciements, « Conçu et réalisé par Claude (Anthropic) » |
| Reconnexion | surcouche en inversion encre/papier, avale les touches de menu |

Transitions : entrée des panneaux (12 px + fondu, 220 ms, cascade de 45 ms), sortie 160 ms, essuyage d'encre des récitatifs et bannières, tampons 120 ms. « Réduire les flashs » coupe les glissements et le flash de la bande.

## 4. Navigation (src/host/ui/nav.ts)

- Portées (`useNavScope`) empilées par couche : écrans 0, pause 10, réglages 20, reconnexion 30.
- Flèches : focus spatial ; `data-nav-own="x"` (curseurs, sélecteurs, bots) garde ←/→.
- Entrée / A : active ; Échap / B : retour ; Start : pause (manche) ou action principale.
- La souris focalise au survol (un seul surlignage soleil). **Espace n'active jamais un bouton** (c'est PLONGER).
- Salon : si `useLobby.keyboardJoined`, les flèches pilotent l'oiseau, l'UI les ignore (Entrée lance toujours).
- Manche : l'UI écoute seulement Échap / Start (pause). **L'input de phase 3 ne doit pas mapper Échap à la pause lui-même** (sinon double bascule).

## 5. Glyphes, icônes, polices

- `glyphShapes.ts` (pur) : 12 glyphes (`GLYPH_KEYS`, ordre = index de couleur), `glyphSvg(key, {size, color})`. `glyphs.tsx` : `<Glyph>`, `<Token colorIndex size variant="color"|"paper">`.
- Fichiers servis : `public/ui/glyphs/<clé>.svg` (currentColor), `public/ui/glyphs-atlas.png` (12 × 64 px, blanc sur transparent, pour les sprites 3D) — régénérer : `npx tsx src/dev/ui/exportGlyphs.ts`.
- `icons.tsx` : ~40 icônes encre (grille 24, trait 1,8) — planche : `dev/ui.html?screen=icons`.
- Polices : `public/fonts/` Julius Sans One, Patrick Hand SC (latin + latin-ext), Averia Sans Libre 700 (latin) + textes OFL.

## 6. Décisions

- **Échelle par `zoom`** sur la racine (px de conception 1080p partout, comme la bible) plutôt que `rem`/`transform` : texte net, pas d'effet sur le DOM des autres modules.
- **Bande de sable à 38 px** (bible) et non 18 (RULES) : le % doit se lire à 3 m (demande au lead).
- **Positions 60 Hz hors React** (`hudAnchors` + rAF) ; tout le reste ≤ 10 Hz via zustand.
- **Pas de bannières doublées par des bulles** : les indications « à tous » (heure dorée, Grande Ombre) sont la ligne secondaire de la bannière.
- **Jeton daltonien en DOM** au point d'ancrage (sous l'oiseau) quand l'étiquette est cachée : pas de sprite 3D à faire côté birds.
- **Noms** : bots « Jade · Faucon » (salon, étiquettes, HUD) ; cartes étroites (podium, titres) : caractère seul, le jeton porte la couleur.
- **Crédits lus du Markdown** au build (`?raw`) : ils suivent automatiquement les ajouts des autres agents.
- **Cadre tremblé** (HandFrame) pour les grands panneaux, tracé en SVG à la taille réelle (graine fixe), traits qui débordent aux coins comme en BD ; petites cases en CSS pur.
- Couleur de joueur uniquement pour désigner un joueur ; focus = fond soleil `#FFF2C3` + bord 3 px ; alertes = inversion (jamais de rouge).

## 7. Vérifications faites

- Captures de chaque écran en 1920×1080 et 1280×720, FR et EN (`node src/dev/ui/capture.mjs all` → `shots/ui/`), relues une à une ; animations figées à des instants choisis (`--at=`).
- `node src/dev/ui/navtest.mjs` : 30 vérifications fonctionnelles (menu, réglages, changement de langue en direct, salon/bots, Espace, flèches clavier, lancement, cartes, pause, événements HUD, manette simulée) : vert.
- `npx vitest run src/host/ui` : mise en forme, chaînes FR/EN symétriques, parseur de crédits, glyphes, HUD dérivé des événements : vert.
- QR du salon décodé par `zbarimg` sur les captures 1080p et 720p (`http://…/play?r=KX4P`).
- Typecheck filtré sur mes chemins : 0 erreur ; `pnpm check:boundaries` : OK.

## 8. Limites connues / reste à faire (phase 3)

- Brancher les actions et remplir les stores (runner) ; appeler `hudFromSim` et écrire `hudAnchors` chaque frame (projection du point sous l'oiseau ; `behind` si derrière la caméra).
- Caméra : résultats de manche → carte dans les 2/3 gauches ; podium → tours sous les plaques (`PODIUM_X`).
- Les libellés de touches suivent la disposition réelle quand le navigateur l'expose (Chrome) ; sinon repli selon la langue.
- Les crédits sont en français (texte du Markdown) même en anglais, hors titres de sections.
- Le glyphe partagé avec le téléphone attend le déplacement vers `src/shared` (REQUESTS.md).

## Page de dev

`dev/ui.html?screen=loading|title|title-menu|lobby|lobby-empty|rules|hud|pause|settings|round|match|credits|reconnect|icons`
`&lang=fr|en&n=1..12` ; HUD : `&phase=countdown|noon|afternoon|golden|sunset|great|last` ; `&cb=1` (daltonien) ; `&p=0..1` (chargement).
Fond : captures de `docs/art/img`. `window.__ui` expose stores, aides et `simEvents` pour les scripts.

---

## Polish vague 1 (correcteur hostui, ordres H1-H15 de docs/polish/ORDERS.md)

Compte rendu détaillé et preuves : `docs/polish/fix-hostui.md`. Changements d'API (tous compatibles) :

| Où | Changement |
|---|---|
| `viewModel.ts` `HintVM` | + `slots: number[]` (joueurs concernés, `slot` = celui qui porte la bulle), `at`, `until` (performance.now). |
| `showHint(slot, key, params, s)` | une bulle par joueur ; même texte (clé + params) affiché, ou apparu il y a < `HINT_MERGE_MS` (2 s) → le joueur rejoint la bulle (jetons) ; au plus `HINT_MAX_BUBBLES` (2) : la plus ancienne cède sa place si elle a vécu 1,2 s, sinon la nouvelle ne va qu'au téléphone. Expiration par balayage unique (`until`). |
| `dismissHint(slot, key?)` (nouveau) | retire un joueur d'une bulle. `connectHudEvents` retire `hints.dodge` de la cible sur `diveHit`, `diveMiss`, `diveCancel`. |
| `pulseTag(slot, s)` + `HudState.tagPulseUntil[]` | étiquette qui pulse ; `connectHudEvents` : COUP D'AILE (`flap`) dans les `FLAP_FIND_MS` (5 s) après « Envol ! ». |
| `BannerVM` / `showBanner` | + `layout: 'case' \| 'strip'` (bandeau fin sous la bande de sable) et `arrow: 'northSouth' \| 'east'` (effet `HintEffect` du directeur). Heure dorée : flèche ↕ ; Grande Ombre : bandeau, flèche →, 2,5 s. |
| `nav.ts` `NavSound` | + `'count'` (value 0..1) et `'sun'` (value = rang, 0 = premier) : `RoundResults` les joue (le runner les route vers `playUi`). |
| `hud/WorldLayer.tsx` | prop `mode: 'round' \| 'lobby'`. Passe d'évitement (voir en tête du fichier), bulles hors des ancres (`.bubble` > `.hint`), étiquettes décalées avec trait de rappel, jeton humain 18 px au-delà de 6 oiseaux (`.world--crowded`), mannequin du salon (oiseau actif hors roster) : anneau-cible + étiquette. Au salon : pas de « +x % ». |
| `components.tsx` | + `SlotName` (bot « Lagon · Faucon », caractère en petit ; `stacked` : sur deux lignes) ; `rng`, `wobblySide` exportés. |
| `keys.ts` | `keyLabel` : ponctuation en toutes lettres (« Point-virgule »), touches nommées (`AltRight` → « AltGr » en AZERTY, « Alt droit » sinon), `isAzerty()`. |
| `credits.ts` | + kind `'samples'` (« Instruments échantillonnés », une ligne par instrument), `normalizeLicense` (« CC BY 4.0 », « CC0 1.0 »), `localizeCreditLine` (voix du narrateur traduite). |
| `src/shared/ruleBird.ts` (nouveau, pur) | pictogramme du ptérosaure des cartes de règles (TV `RuleArt.tsx` et téléphone `RulesCards.tsx`). |
| `screens/MapPlate.tsx` (nouveau) | planche imprimée autour de la carte des résultats ; géométrie tirée de `resultsMapRect` (camera/director.ts) et de `gameView.sim.arena`. |
| `MatchResults.tsx` | 2,5 s de plan pur (`--intro-ms`, drapeau `data-podium-intro` sur `.ui-root` qui masque aussi le récitatif), `--titles-h` mesurée pour poser le récitatif au-dessus des titres, ligne de départage. |
| `format.ts` `sentenceLines` | une seule phrase longue se coupe après les deux-points. |

Décisions : bulles et étiquettes n'ont plus de transition de position (une étiquette qui glisse chevauche celle qui prend sa place) ; les étiquettes masquées sortent de la mise en page (`display: none`, fondu d'entrée par `@starting-style`). `.veil` = papier calque (#F7F0E3 à 55 %). `font-variant-ligatures: no-common-ligatures` sur `.ui-root` (Patrick Hand SC dessine « fi », « ffl » en bas de casse).

## Polish vague 2 (correcteur tech) — détail : docs/polish/fix2-tech.md

| Où | Changement |
|---|---|
| `viewModel.ts` `HostLink` | `'ok' \| 'reconnecting' \| 'replaced'` (`'lost'` n'existait que pour l'onglet remplacé). |
| `viewModel.ts` `UiState.display` | `'ok' \| 'lost'` : contexte WebGL perdu → surcouche `screens/DisplayLost.tsx` (papier opaque, couche de navigation 40 ; « Recharger » après 3 s). |
| `UiActions` | + `takeOver()` (« Reprendre ici »), `reloadPage()` (sauvegarde puis rechargement). |
| `SubtitleVM.lang` / `showSubtitle({ lang })` | texte figé dans une langue : `Subtitle` écrit le nom de couleur dans cette langue (pas de « Saffron ouvre les hostilités » après un passage en anglais). Sans `lang`, `key` est retraduite. |
| `screens/Reconnect.tsx` | cas `'replaced'` : « Ombres est ouvert dans un autre onglet » + bouton « Reprendre ici » (focus, Entrée) ; monté aussi pendant le chargement ; `key={hostLink}` dans `UiRoot`. |
| Chaînes (`host.ts`) | `host.reconnect.replaced.title/body`, `host.reconnect.takeOver`, `host.display.title/wait/stuck` (FR/EN) ; `host.reconnect.lost` retirée. |
