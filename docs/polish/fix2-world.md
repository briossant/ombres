# Polish vague 2 — correcteur world (matière de fin de journée, budget GPU)

Périmètre : `src/host/render/**` sauf `bird/`, `fx/`, `world/towerMaterial.ts`, `world/birdScreen.ts`. Port 8854.
Captures : `shots/polish2/world/`. Aucun fichier du jeu hors périmètre modifié. Outils et portes touchés (ce
sont ceux du module world) : `tools/polish/world/cap.mjs` (`--out`, `--before`), nouveau
`tools/polish/world/abperf.mjs` (A/B de coût entrelacé), `docs/art/tools/game.mjs` et `final.mjs` (formules en
jeu, nouvelle porte), `tools/polish/art/pale-vs-ground.mjs` (nouveau plafond de chroma). Notes d'API :
`docs/agent-notes/world.md`, section « Polish vague 2 ».

Méthode d'image : `cap.mjs --before` fige une vraie manche (Math.random à graine, sim à l'arrêt, caméra vivante)
et capture la même scène deux fois, avec le rendu courant puis avec `worldView.lookPolish2 = false` (le rendu
d'avant : ombre W4, pas de plafond au couchant, pas de densité ni de bande, pas de cibles par couleur). Les
paires avant / après sont donc la même partie, le même instant, à 250 ms de caméra près.

## Bilan

| Objectif | Statut | Preuve principale |
|---|---|---|
| 1 · Ombres froides sur les peintures chaudes | fait | Safran à l'ombre `#87522a` (L 0,49, C 0,090, h 56°) → `#916485` (L 0,56, C 0,074, h 337°) ; porte `gameNoRustShadow` : 10 ombres rouille → 0 |
| 1 · Saturation du couchant maîtrisée | fait | chroma des lavis clairs (néons) ≤ 0,12 de KF5 à KF1 (avant : jusqu'à 0,155) ; fort / fort ≥ 0,0889 |
| 1 · Rayures d'ombre = un événement graphique | fait | glacis violet commun (30 % vers l'ombre neutre) : une même couche violette traverse la mosaïque |
| 1 · Aquarelle lisible à distance de jeu | fait | densité de pigment, bande de pigment de ~5 m au bord (champ de distance), plomb de vitrail au couchant |
| 1 · Ne rien casser | fait | toutes les portes `final.mjs` vertes ; pâle / sol ≥ 0,060 (Corail KF10 0,060, KF3 0,088) ; high-key inchangé (§1.5) |
| 2 · High 12 oiseaux p90 ≤ 9,5 ms | leviers faits, **cible NON vérifiée** | aucune fenêtre calme en 2 h 30 (TTS de l'audio : charge 13-22 sur 12 fils, GPU à 99 %) ; A/B entrelacé relatif seulement (§2.2) |
| 3 · Allocations par frame du rendu du monde | fait (ce qui est à moi) | `GpuTimer` sans tuple ni `splice` ; champ de distance envoyé sans `initTexture` ; le reste est dans three et les oiseaux (mesuré) |

## 1. La matière du territoire en fin de journée (W4 bis)

### 1.1 Diagnostic
- Ombres sur Safran : W4 tournait la teinte de 35° (89° → 54°) en gardant L au ratio de l'ombre : L 0,49, h 54°,
  c'est-à-dire de la terre de Sienne, « rouille » à l'heure dorée et au couchant (`before-4/pe16.png`,
  disques et bandes brun rouille). Corail : brique (h 16°).
- Les bandes d'ombre prenaient une couleur différente sur chaque lavis (brun sur Safran, vert sombre sur Anis,
  marine sur Indigo) : la rayure se fragmentait avec la mosaïque, d'où le « tapis de Twister ».
- Couchant : aucun plafond de chroma sous KF5 (0,155 pour les couleurs à cs 1,15) ; à 12 joueurs, un tapis de
  couleurs vives et plates (`before-12/pe3_5.png`).
- Aquarelle : liseré de 3 px, grain de ± 2 % de L : invisible à la distance de jeu (0,35 à 0,45 m/px).

### 1.2 Ce qui change (`groundMaterial.ts`, `npr/palette.ts`, `npr/uniforms.ts`, `world/territoryTexture.ts`)
- **Glacis violet** (`NPR.uShadowCool`, 0 à 40° de l'horloge de palette → 1 à 22°) : sur le lavis, l'ombre
  tourne vers 300° de 0,45 × l'écart côté rouge (au plus 90°), garde sa chroma, puis va à 30 % vers l'ombre
  neutre. Les teintes sont calculées **par couleur sur le CPU** (`updateOwnerShade`, `NPR.uOwnerShade[13]`),
  ce qui supprime aussi l'atan / cos / sin par pixel.
- Pourquoi 30 % et pas plus : recherche systématique (scratchpad `arttools/opt*.mjs`) sur 12 joueurs × toutes
  les keyframes : au-delà d'un glacis de 0,3, Rose / Lilas et Sarcelle / Jade gelés passent sous ΔE 0,059
  (0,040 à 0,5). La marge vient d'un seul levier sûr : sous l'ombre, un lavis plus sombre que le sol l'est
  × 1,5 (écart apparié Sarcelle / Jade). Un lavis plus clair que le sol garde le ratio (sinon, au couchant,
  les ombres sur Safran tournaient au rose clair).
- **Safran** a sa cible propre : mauve 340°, C × 0,75, L × 1,16 (sinon framboise, voisin du Rose).
  ΔE Safran / autres gelés ≥ 0,082.
- **Côté nuit** de la Grande Ombre (`NPR.uOwnerNight[13]`) : même principe. Safran éteint en mauve 325°
  (L + 0,06), Corail en lie-de-vin 0° (L + 0,04), au lieu de l'ocre brun et du brun marron qui couvraient la
  moitié gelée de l'arène. `gameNightPair` inchangé (0,052), écart jour / nuit d'un même joueur ≥ 0,12 en L.
- **Couchant** : `PAINT_C_SUNSET_MAX` = 0,12 de KF5 à KF1, pour les **lavis clairs seulement**
  (`NPR.uPaintCapDark` : plafond pondéré par smoothstep(0,60 ; 0,68 ; L du fort)) : Safran, Anis, Lagon, Rose,
  Lilas, les « néons » sur le sol gris, passent de 0,145-0,155 à 0,12 ; Corail, Carmin, Indigo, Prune,
  Sarcelle, Jade gardent leur chroma (un premier essai plafonnait tout le monde : à L 0,59, le Corail plafonné
  virait au brun). 0,125 à l'heure dorée inchangé (0,12 y casserait `gameFrozenPair`).
  Vitrail : le liseré devient un plomb (L − 0,035, C × 1,12) quand `uWarm` > 0,85.
- **Aquarelle à distance** : densité de pigment (écart au papier en L et en C, teinte intacte) modulée par le
  lavis inégal (± 13 %), le grain (± 8 %, 3-5 px en vue de jeu) et une ligne de marée d'un pixel sur le fort
  (« fleurs » rares, seuil 0,69). **Bande de pigment** de ~5 m au bord de chaque lavis (+ 8 % pâle,
  + 16 % fort) et intérieur des grands aplats forts − 7 %, grâce à un **champ de distance aux bords**
  (`TerritoryTexture.edgeTexture` : R8 filtrée, 1 texel = 4 × 4 cellules, chanfrein 10/14, recalculé ≤ 10 Hz,
  ~11 000 texels, envoyé par `copyTextureToTexture`, test ajouté). Le pâle n'est jamais rapproché du sol
  (densité ≥ 1 : la garde pâle / sol W8 tient partout).
- Premier essai rejeté à l'image : lignes de marée à 0,35 de densité et seuil 0,64 : courbes de niveau sur tout
  le territoire, effet « carte topographique » (`a1-4/pe16.png`).

### 1.3 Preuves à l'image (avant / après, même scène)
Planches : `shots/polish2/world/sheets/planche-final-4.jpg` et `planche-final-12.jpg` (KF25, KF16, KF10, KF3,
Grande Ombre à 103 s, KF1 à 1,3°), paires une à une dans `sheets/final-{4,12}-*.jpg`, images pleines dans
`final-4/`, `final-12/` (`<t>.png` après, `<t>-avant.png` avant).
- KF25 / KF16 / KF10 (4 oiseaux) : disques et bandes d'ombre sur Safran brun rouille → mauve ; sur Corail
  brique → prune ; les rayures se lisent comme une seule couche violette.
- KF3 / Grande Ombre : bandes rouille sur le Safran → lilas ; empreinte d'oiseau sur Safran orange → lilas ;
  moitié nuit : ocre et brun → mauve et lie-de-vin.
- 12 oiseaux : même traitement, couleurs du couchant un peu moins criardes ; la mosaïque reste dense (§4).
- Mesure (`sample-oklch`, `final-4/pe16`) : ombre de tour sur Safran avant `#87522a` L 0,491 C 0,090 h 56 ;
  après `#916485` L 0,561 C 0,074 h 337.

### 1.4 Portes (`docs/art/tools/final.mjs`, formules en jeu dans `game.mjs`)
Toutes vertes : fort / fort 0,0889 (≥ 0,085) ; pâle / sol 0,060 ; pâle / fort 0,024 (valeur de la bible) ;
gelés 0,0595 (≥ 0,059, Sarcelle / Jade KF10) ; gelé / libre 0,149 ; nuit 0,052 (≥ 0,05) ; aucune ombre olive ;
**nouvelle porte `gameNoRustShadow`** (aucune ombre sur peinture 25° < h < 110°, L < 0,62, C > 0,045 de KF25 à
KF1) : 0 (avec les formules d'avant : 10) ; `gameShadowChroma` abaissée de 0,08 à 0,06 (le glacis retire de la
chroma aux verts : Jade 0,064 ; c'est le prix d'une ombre violette commune).
`node tools/polish/art/pale-vs-ground.mjs` : minimum 0,060 ; Corail pâle KF10 0,060, KF3 0,088.

### 1.5 High-key (`docs/art/tools/highkey.mjs`, page de lookdev, `tools/world-shots.mjs --set=keys`)
Mesuré sur les captures finales (`shots/polish2/world/set/`) ; entre parenthèses, la vague 1 :

| Keyframe | L > 0,6 | médiane | seuil |
|---|---|---|---|
| KF80 | 98,9 % | 0,894 (0,894) | jour : ≥ 60 % et ≥ 0,70 |
| KF50 | 98,1 % | 0,830 (0,831) | idem |
| KF25 | 91,6 % | 0,777 (0,778) | idem |
| KF16 | 88,6 % | 0,757 (0,758) | idem |
| KF10 | 85,4 % | 0,706 (0,706) | idem |
| KF3 | 45,0 % | 0,584 (0,584) | couchant : ≥ 0,50 |
| KF1 | 3,7 % | 0,473 (0,469) | exception déjà acceptée (image du gel) |
| Grande Ombre | 30,6 % | 0,498 (0,497) | couchant : ≥ 0,50 — même écart qu'en vague 1 (côté nuit W6), un peu réduit |
| Résultats | 6,5 % | 0,569 (0,569) | |

L < 0,3 : ≤ 0,54 % partout. Rien ne se dégrade : le glacis et la densité ne déplacent pas la médiane.

## 2. Budget GPU High à 12 oiseaux (W3)

### 2.1 Ce qui a été fait (coût à pixel égal, sans changement d'image)
- **Sol, bande du Simoun** : la branche du voile de sable ne tourne plus que sur la bande utile (du feston à
  − 6 m jusqu'à + 25 m du bord, ρ ≈ 0,96-1,18) au lieu de ρ 0,9-1,8 ; à 12 oiseaux, l'ancienne garde faisait
  tourner atan, sinus et `lin2oklab` sur ~25 % du cadre pour un voile nul.
- **Sol, taches de piqué** : sortie immédiate hors d'un disque de 20 m autour de chaque tache (avant : atan,
  2 sinus et 8 gouttelettes par tache sur TOUT le sol pendant 0,75 s à chaque piqué, soit presque en
  permanence à 12 oiseaux) ; `lin2oklab` final seulement si une tache a touché le pixel.
- **Sol, transitions du lavis** (encre fraîche, montée pâle → fort, front mouillé, éclair de vol) calculées
  seulement sur les cellules changées depuis moins de 1,2 s ; illumination des résultats et côté nuit dans des
  branches uniformes ou limitées à la nuit.
- **Sol, teintes d'ombre et de nuit par couleur sur le CPU** : plus d'atan / cos / sin par pixel ombré ni par
  pixel du côté nuit (toute la moitié gelée de l'arène pendant la Grande Ombre).
- **Sol, lectures de bruit** : grain / warp fin et front mouillé / lavis inégal lus seulement dans l'arène
  (`textureGrad`, gradients explicites) : deux lectures trilinéaires en moins sur les 30-50 % du cadre hors
  arène.
- **Rideau du Simoun** : voile `mixLab(sandShade, haze)` calculé sur le CPU (`NPR.uStormVeil`) au lieu de
  deux `lin2oklab` et un `oklab2lin` par pixel.
- **SMAA LOW en Medium et High** (seuil 0,15 au lieu de 0,1, 4 pas de recherche au lieu de 8) : les traits
  d'encre (contraste > 0,3) restent lissés ; le grain, les liserés du lavis et les bords d'ombre, déjà
  antialiasés dans le shader, ne passent plus dans la passe de poids. Recadrages × 3 au couchant, même scène,
  8 pas contre 4 : identiques (`shots/polish2/world/smaa3/cmp.png`). Écart à la bible §7.4 (High : « SMAA
  high ») : déjà MEDIUM depuis W3 ; `QualityPreset.smaaThreshold` / `smaaLuma` permettent d'affiner.
- Coûts ajoutés par l'objectif 1 : une lecture de texture 128 × 88 R8 filtrée et ~30 opérations dans la branche
  peinture ; CPU : champ de distance ≤ 10 Hz (≈ 11 000 texels, deux passes) et table d'ombre (12 couleurs).
- Leviers de mesure ajoutés (`?debug`) : `NPR.uShadowSmoothPx` (texel d'ombre en px au-delà duquel la B-spline
  remplace les 4 taps, 1 = W5), `NPR.uTerrSmoothDu` (m/px sous lesquels le territoire est en B-spline, 0,3),
  `window.__npr.smaa()`, `tools/polish/world/abperf.mjs`.

### 2.2 Mesures : ce qui a pu l'être
- **Avant** (code de la vague 1, 14 h 25, seul moment calme de la session : charge 2,5, GPU pour ma seule
  page), `perfmatrix.mjs --q=high --n=12 --speed=1` : midi p50 9,47 / **p90 9,83 ms** ; après-midi 9,63 /
  **10,01 ms** ; ensuite d'autres correcteurs ont démarré (charge 6,7 à 9,5) : heure dorée p90 13,9, couchant
  12,1, Grande Ombre 16,0, chiffres contaminés.
- **Après** : impossible au calme. De 14 h 30 à 16 h 50, le GPU est resté à 99-100 % (deux ou trois autres pages
  de test) et la charge CPU à 13-22 sur 12 fils (génération TTS du correcteur audio, 4 processus Python à
  150-200 %). Sous cette charge, la requête TIME_ELAPSED gonfle même quand le GPU est libre (à l'heure dorée :
  GPU occupé à 28 %, « temps GPU » 31-45 ms : le processus GPU de Chrome, affamé, envoie les commandes au
  compte-gouttes). Le dernier `perfmatrix` (16 h 50, charge 17) donne 14 à 68 ms : inutilisable, gardé au
  scratchpad pour mémoire. Un script d'attente de calme (`calm.sh` : GPU < 12 % sur 6 s et charge < 4,5) a
  tourné 50 min sans se déclencher.
- **A/B entrelacé** (`abperf.mjs`, Grande Ombre à 12 oiseaux figée, 9 tours de 10 configurations alternées ;
  base p10 min 14,6 ms sous contention, soit ~1,3 × le coût au calme) — écarts appariés de p10 (médiane,
  médiane des tours les plus calmes), en ms :

  | Configuration (par rapport à la base) | Δ p10 | Δ p10 tours calmes |
  |---|---|---|
  | SMAA LOW au lieu de MEDIUM | −0,57 | −0,57 |
  | seuil SMAA 0,15 | −0,10 | +0,17 |
  | sans les ajouts de l'objectif 1 (densité, bande, plomb) | −0,91 | −0,44 |
  | sans toute la branche peinture | −1,02 | −0,71 |
  | ombres : B-spline seulement au-delà de 1,6 px par texel | −0,26 | −0,51 |
  | territoire : B-spline seulement sous 0,2 m/px | −0,46 | +0,18 |
  | ancienne bande du Simoun + taches sans sortie rapide | +0,09 | +0,87 |

  Lecture honnête : le bruit est de l'ordre de ± 0,5 ms. Deux signaux se répètent : SMAA LOW (≈ −0,5 ms,
  adopté) et le coût des ajouts d'aquarelle (≈ +0,4 à +0,9 ms, soit la moitié de la branche peinture :
  à confirmer au calme ; si c'est vrai, la bande de pigment est le premier poste à alléger). Les deux
  seuils B-spline ne sont pas adoptés : le gain n'est pas sûr et la B-spline du territoire à 0,2 m/px
  laisse voir des marches de cellules de 3 px (`shots/polish2/world/seuils/cmp.png`, × 2).
- Bilan probable : SMAA LOW (−0,5) et les sorties de branches (Simoun, taches de piqué, transitions, bruits,
  plus d'atan côté nuit) compensent à peu près les ajouts d'aquarelle ; **le p90 ≤ 9,5 ms à la Grande Ombre
  n'est vraisemblablement pas atteint** (vague 1 au calme selon la critique tech : 11,4 ms). À mesurer dès que
  la machine est calme : `PORT=… node --import ./tools/polish/world/nohmr.mjs tools/polish/tech/perfmatrix.mjs
  --q=high --n=12 --speed=1` (vérifier `gpu_busy_percent` < 20 % ET `uptime` < 3).
- **Qualité auto** : inchangée (banc High ≤ 8,5 ms, rétrogradation si p90 > 11 ms aux résultats). Si la Grande
  Ombre reste à ~11 ms au calme, un joueur en High sur la machine cible passera en Medium après sa première
  manche : c'est le filet de sécurité voulu par W2, pas une marge.

### 2.3 Pistes suivantes (non faites)
- Bande de pigment : lire le champ de distance une fois par cellule (la mettre dans le canal A du territoire en
  remplaçant l'ancien propriétaire, lu seulement pendant 0,35 s de vol) ou ne l'appliquer qu'en Medium / High
  sous 0,3 m/px.
- Tours (`towerMaterial.ts`, pas mon périmètre) : ≈ 1,4 ms à 12 oiseaux par masquage (sous contention).
- À 12 oiseaux, l'arène est à 0,15-0,3 m/px : territoire et ombres sont classés en B-spline 3 × 3 presque
  partout. C'est le vrai poste « bords de territoire de près » ; gardé pour l'image (voir ci-dessus).

## 3. Allocations par frame
- `npr/perf.ts` (`GpuTimer`, actif à chaque frame de l'heure dorée à la Grande Ombre pour la qualité auto) :
  plus de tuple `[nom, requête]` ni de `splice` (tableau alloué) par mesure : deux tableaux parallèles et un
  retrait en place.
- Champ de distance : envoyé par `copyTextureToTexture` depuis un transit (pas de `needsUpdate`, donc ni
  `initTexture` ni clé de cache `join`).
- Mesuré dans la page (compteurs WebGL, manche à 12) : 22 `uniform3f` par frame en tout (direction du soleil,
  caméra, oiseaux), le même nombre quand la palette est repoussée à chaque frame : le `setValueV3f` signalé par
  la critique tech vient de three et de vecteurs qui changent vraiment ; aucun uniform `number[]` dans le monde
  (un essai de repousser la palette par pas de 0,04° n'a rien changé : retiré). Les 9 `texSubImage2D`
  12 × 12 float par frame (`initTexture` → `join`, 480 ko / 8 s) sont les textures d'os des oiseaux (skinning,
  `bird/`, pas mon périmètre : signalé).

## 4. Reste à faire / limites
- **La mosaïque à 12 joueurs reste dense au couchant.** Douze teintes vives sur un sol gris ne deviennent pas
  « calmes » : les rayures sont maintenant une couche violette commune et les néons sont baissés, mais un
  joueur exigeant verra toujours un patchwork. Aller plus loin demanderait de baisser la chroma de tout le
  monde, et la porte fort / fort (0,0889 pour 0,085) n'a plus de marge.
- **Corail pâle au couchant** reste brun par construction de la bible (dL − 0,053 : son fort est à la
  luminosité du sol, la garde pâle / sol pousse le pâle plus sombre : `#A76C57` dans la bible §3.3).
  Le rendre plus clair que le sol inverserait la lecture fort / pâle pour cette seule couleur ; décision de DA
  à prendre avec la bible.
- **Glacis plus fort** : impossible à 12 joueurs sans descendre sous ΔE 0,059 entre gelés (mesuré : 0,040 à
  un glacis de 0,5). Si le lead accepte 0,05 pour les gelés comme pour la nuit, un glacis de 0,45 rendrait les
  bandes encore plus uniformes (`arttools/sw-C.png` du scratchpad : l'aperçu le plus « Moebius »).
- **Ombres d'après-midi** (KF50 et au-dessus) : rotation W4 inchangée (disques courts, et la porte gelés est
  la plus serrée à KF50) ; sur Safran, un petit disque reste orangé à 15 h.
- Pour birds (hors périmètre) : 9 envois de textures d'os 12 × 12 float par frame à 12 oiseaux
  (`needsUpdate` du skinning), source des allocations `initTexture` → `join` de la critique tech.

## Vérifications
- `npx tsc --noEmit -p tsconfig.json` : 0 erreur dans le dépôt.
- `npx vitest run src/host/render/world src/host/render/quality.test.ts` : 27 tests verts (dont le nouveau test
  du champ de distance aux bords).
- `pnpm check:boundaries` : frontières OK.
- `PORT=8854 node tools/e2e/solo.mjs` (3 manches, résultats, revanche) : aucune erreur console (deux fois, dont
  une sur le code final).
- `docs/art/tools/final.mjs` (copie avec culori 4.0.2 au scratchpad) : toutes les portes vertes.
- `node tools/polish/art/pale-vs-ground.mjs` : porte OK (minimum 0,060).
- Presets Low / Medium / High rendus et regardés (lookdev KF16) ; mode daltonien regardé (`set/daltonien-kf3.jpg`).
- Serveur de dev arrêté par PID (arbre pnpm → tsx → node), port 8854 libre.
