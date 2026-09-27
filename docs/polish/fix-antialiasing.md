# Correcteur antialiasing — « c'est fait exprès qu'il n'y ait pas d'antialiasing ? »

Date : 2026-09-27, 16 h 40 à 19 h. Port 8891 (serveur arrêté par son PID à la fin).
Périmètre : `src/host/render/**` ; Edits ciblés hors périmètre : `src/host/settings.ts` (type du réglage),
`src/host/ui/screens/Settings.tsx` (option Ultra), `src/shared/strings/host.ts` (FR + EN).
Captures : `shots/polish-aa/sheets/` (JPEG ; les PNG intermédiaires ont été supprimés).
Outils (nouveaux, `tools/polish/aa/`) :
- `shots.mjs` : image figée (sim ET caméra), variantes `__aa.before(q)` / `__aa.after(q)` (presets et encre
  d'avant / code courant, sans re-créer oiseaux ni FX), référence SSAA 4× `__aa.ssaa(q)` (canevas en 2× réduit
  par le compositeur), glissement sous-pixel de la caméra (`--pan`), cibles de recadrage calculées dans la page ;
- `crops.mjs` (`--auto --sheet`), `metric.mjs` (écart à la référence SSAA sur les bords) ;
- `abink.mjs` : A/B de coût GPU entrelacé dans une même page (avant / après, variantes du shader d'encre) ;
- `legacy-ink.glsl` : le shader d'encre d'avant, pour les A/B.

Machine partagée : un autre agent a enregistré des vidéos (ffmpeg + Chrome, charge 7 à 19) pendant une grande
partie de la session. Toutes les mesures retenues sont des **A/B entrelacés** (écart apparié, robuste à la
contention) pris dans les créneaux calmes (charge ≤ 3, GPU au repos hors de ma page), sauf mention.

## Bilan

| Objectif | Statut | Preuve |
|---|---|---|
| 1 · Traits d'encre antialiasés dans le shader | **fait** : couverture sous-pixel, largeur continue, plus de traits cassés | §2 ; `glissement-subpixel-*.jpg`, `traits-seuls-*.jpg`, planches `1080p-*` |
| 1 · Stables en mouvement | **fait** (glissement sous-pixel de la caméra : traits continus d'une image à l'autre ; avant : pointillés qui changent) | `glissement-subpixel-high-avant-haut-apres-bas-x4.jpg` |
| 2 · SMAA | Low : LOW (avant : rien) ; High : MEDIUM ; Ultra : HIGH ; **Medium : aucun** (coût 1,1-1,4 ms, gain à peine visible une fois les traits lissés) ; hachures non floutées | §3 ; `smaa-12oiseaux-couchant-100-x3.jpg` |
| 3 · Medium sans agrandissement flou | **fait** : canevas à la résolution de l'écran, G-buffer 900p, encre et couleur reconstruites en natif (Catmull-Rom) ; +0,25 à +0,45 ms | §4 ; `1080p-medium-*`, `medium-options-12-x3.jpg` |
| 4 · Preset Ultra | **fait** : natif jusqu'en 2160p, SSAA 4× sur un écran 1080p, SMAA HIGH ; banc en deux temps ; réglage FR / EN | §5 ; `4k-ultra-*`, `1080p-ultra-*`, `reglage-qualite-fr.jpg` |
| 4 · MSAA ×4 sur la passe MRT | **écarté** (pas faisable proprement en WebGL 2, et inutile pour l'encre) | §5.2 |
| 5 · Mesures GPU | Medium p50 6,3-7,5 / p90 7,0-8,7 ms (budget 8 → 8,5) ; High +0,5 à +0,7 ms ; Low +0,6 à +0,8 ms ; le banc choisit Medium ici (3 / 3) | §6 |

## 1. Diagnostic : pourquoi l'image était crénelée

1. **Medium (le preset que le banc choisit sur cette machine) rendait en 900p**, agrandi à 1080p par le
   navigateur (bilinéaire × 1,2) : flou ET marches de 1,2 px. C'était l'essentiel de la plainte.
2. **Les traits d'encre étaient binaires** : `step()` sur les ID, `smoothstep` sur un saut relatif de
   profondeur (qui vaut 1 dès que le saut est franc), épaisseur arrondie au texel (décalages 1,5 texel lus au
   plus proche : 2 d'un côté, 1 de l'autre). Et le tremblé R5 décalait le point de lecture de ±0,7 px :
   arrondi au texel, il faisait des **marches d'un pixel entier**. Résultat : silhouettes en escalier, traits
   fins cassés en pointillés qui scintillent quand la caméra bouge (planche de glissement, rangées du haut).
3. **Le SMAA ne rattrape pas des traits d'un pixel** : sa recherche de motifs voit deux bords rapprochés ; il
   lisse un peu les silhouettes épaisses et affadit les traits fins (planche `medium-options`, `smaa-*`).
4. Low : 720p sans AA. Aucun preset au-delà de 1080p, même sur un écran 4K / HiDPI.

## 2. Traits d'encre antialiasés (`src/host/render/npr/InkEffect.ts`)

**Principe.** Un tampon échantillonné au centre des pixels ne dit pas où passe le bord à l'intérieur d'un
pixel : il faut le reconstruire à partir du voisinage. Pour chaque pixel proche d'un bord :

1. **Masques 3×3** des voisins « de l'autre côté », par type de trait :
   - silhouette, côté objet proche : le voisin le plus loin de chaque paire opposée dont la dérivée seconde de
     1/z dépasse le seuil (même critère qu'avant : nul sur tout plan, donc toujours aucun faux trait sur le sable
     rasant) ;
   - silhouette, côté fond : le voisin le plus proche (le pixel de fond reçoit la part du trait qui déborde) ;
   - plis et ID : ID différent (objet vers tout voisin ; sol ou ciel vers un objet), pli > 40° entre objets
     (diagonales au double du seuil), jamais vers la trame de dissolution (ID 254).
2. **Frontière lissée** (`edgeFit`) : filtre boîte F (part du 3×3 de l'autre côté) et gradient du masque
   (normale n) ; pour une frontière droite à la distance d, F = 0,5 − d·L(n)/9 (L = corde du carré 3×3). Une
   frontière droite du tampon donne d = 0,5 ; un escalier donne une frontière qui glisse d'une marche à
   l'autre au lieu de sauter d'un pixel.
3. **Couverture** (`band`, `spill`) : part de l'empreinte du pixel (±0,5 px le long de n) couverte par le
   trait. Silhouette : bande [0 ; W] côté objet proche, **W continu** (épaisseur R2 × tremblé, plus d'arrondi au
   pixel) ; rampe linéaire de 1 px sur chaque bord. Sous 1 px, trait d'un pixel en opacité W (un trait
   plus fin qu'un pixel, lissé, s'étale en gris sur deux pixels selon sa phase : pointillés). Plis / ID : chaque
   objet pose sa bande de max(s, 1) px (2 px entre deux objets, 1 px contre le sol, comme avant).
4. Brume, encre de nuit et épaisseur du débord sur un pixel de fond : celles de l'objet voisin le plus proche.

**Coût.** Les pixels loin d'un bord ne paient que la détection (4 lectures de 1/z à 1 ou 2 pas, normale + ID
des 4 voisins : comme avant) ; le 3×3 complet et l'ajustement sont dans des branches. Itérations mesurées
(A/B entrelacé, High 1080p, 12 oiseaux, Grande Ombre figée ; écart apparié à l'encre d'avant) :

| Version | Δ p50 | Remarque |
|---|---|---|
| tableaux GLSL, 3×3 pour tous les pixels | +2,55 ms | pression de registres |
| vec4 empaquetés, 3×3 pour tous | +1,70 ms | |
| détection d'abord, 3×3 en branche | +0,75 ms | |
| + branches séparées (proche / fond / plis) | +0,53 ms | |
| + nuit et encre calculées sur les pixels encrés seulement (**retenue**) | **+0,39 ms** | |

Essais écartés : trait centré sur la frontière (lissé mais gris : 0,75 / 0,75 sur les tracés droits, « baveux »,
`medium-options`) ; tremblé en décalage latéral continu (demande de détecter les bords à 3 pas : coût).

**Tremblé R5 réinterprété.** Le trait garde son bord extérieur collé à la forme ; le bruit monde (mêmes
fréquences) module la **pression** (± 28 % de largeur à 0,7). Le décalage de lecture d'avant produisait les
marches et les pointillés décrits au §1. Bible §7.3 mise à jour.

**Preuves.**
- `glissement-subpixel-high-avant-haut-apres-bas-x4.jpg` : 8 images, la caméra (sim gelée) glissant de
  0,15 px par image. Avant (2 rangées du haut) : la silhouette du disque est un pointillé qui change à chaque
  image (scintillement). Après : trait continu, stable.
- `traits-seuls-1080p-high-12-x3.jpg` : l'encre seule (mode debug 1), avant / après / SSAA 4×. Écart moyen à la
  référence SSAA sur les traits (`metric.mjs`) : 20,7 → 18,2 / 255 (−12 %). Sur l'image entière autour des
  bords : 6,83 → 6,46 (midi), 5,25 → 5,05 (couchant) ; le reste de l'écart vient de ce qui change avec la
  définition (lavis, FX animés), pas de l'encre.
- Planches `1080p-<preset>-<12|92>-x3.jpg` et `-zoom-…-x4.jpg` (midi / couchant ; rangées : chapeau de tour,
  fût, oiseau, icônes au-dessus de l'oiseau, bord du Simoun) et `4k-<preset>-…-x2.jpg` (viewport 3840×2160).
  Même image figée pour avant et après (pose des oiseaux comprise, sauf `*-ultra` : changement de niveau). Quand
  un oiseau passe sous un chapeau, la tour est coupée (dissolution du correcteur climax) : la rangée « chapeau »
  montre alors le fût coupé ; les disques entiers sont dans `medium-options` et `smaa-*`.
- Limite : sur les bords presque horizontaux, un escalier à longues marches (> 3 px) garde une ondulation
  (le 3×3 étale chaque marche sur ~3 px ; la référence SSAA est plus lisse). Levier suivant : fenêtre de 5
  colonnes le long du bord (6 lectures de plus, dans la branche).

## 3. SMAA

**Coût mesuré** (A/B entrelacé, 1080p, 12 oiseaux, Grande Ombre) : aucun → LOW **1,49 ms** ; LOW → MEDIUM
+0,28 ms ; LOW → HIGH +0,62 ms (soit 1,8 et 2,1 ms). C'est 18 à 26 % du budget de Medium.

**Apport une fois les traits lissés** : faible. `smaa-12oiseaux-couchant-100-x3.jpg` (12 oiseaux, couchant ;
sans / LOW / MEDIUM / HIGH / SSAA) : coutures de territoire et silhouettes quasi identiques de sans à HIGH ; la
référence SSAA reste plus lisse que toutes. Sur les traits fins, le SMAA en retire même un peu (planche
`medium-options` : « scaled » = SMAA LOW, « scaled0 » = sans).

**Hachures** : inchangées à l'œil de sans à HIGH (`hachures-smaa-high-40-x4.jpg`, fûts hachurés ; les tirets
autour de l'oiseau y sont des FX animés, pas le SMAA). Pas de flou (c'était le défaut du FXAA).

**Choix** : Low LOW (demandé ; 720p agrandi, c'est lui qui lisse le plus) ; Medium **aucun** (budget) ;
High MEDIUM ; Ultra HIGH.

## 4. Medium : plus d'agrandissement flou

| Variante (A/B entrelacé, 12 oiseaux, Grande Ombre) | p50 | p90 | Image |
|---|---|---|---|
| avant : canevas 900p agrandi par le navigateur, SMAA LOW, encre binaire | 7,19 | 7,97 | floue, marches de 1,2 px |
| 1080p natif, SMAA LOW | 9,81 | 10,34 | la plus nette |
| 1080p natif, sans SMAA | ≈ 8,1 | ≈ 9,0 | ≈ natif |
| **G-buffer 900p, encre + couleur Catmull-Rom en 1080p, sans SMAA (retenue)** | 7,42 | 8,12 | nette ; rares battements de phase sur les traits très fins, escaliers 900p ×1,2 sur les fines géométries sans trait (tringles) |
| même chose avec SMAA LOW | 8,43 | 8,96 | idem, traits fins un peu affadis |

(Ces cinq lignes : même page, sous la contention du moment ; `medium-options-12-x3.jpg` : « avant », « scaled »
= G-buffer 900p + SMAA LOW, « scaled0 » = retenue, « native0 » = 1080p natif sans SMAA, « ref » = SSAA 4×.)

Au calme, écart apparié au Medium d'avant : **+0,44 ms** à la Grande Ombre (6,66 / 7,24 ms), +0,31 ms à midi
(5,82 / 6,29 ms). Le 1080p natif coûtait +1,3 à +2,6 ms (p90 11,4 ms au climax à 4 oiseaux, en plans serrés) :
la surveillance l'aurait fait descendre en Low après une manche.

Implémentation : `QualityPreset.gbufferScale` (Medium 900 / 1080) ; `GBufferPass` rend à cette échelle ;
`NPR.uPx` / `uResolution` suivent la taille du G-buffer (les matériaux dessinent à cette taille) ; l'InkEffect
(variante `INK_SCALED`, compilée à part : High et Ultra ne paient rien) lit le texel du G-buffer, ramène la
distance au bord au centre du pixel d'ÉCRAN (décalage sous-texel, échelle) et reconstruit la couleur en
Catmull-Rom (5 lectures bilinéaires). Preuves : `1080p-medium-*` (avant / après / natif) ;
`medium-options-12-x3.jpg`.

## 5. Ultra

- `targetHeight: 2160`, `supersample: 2` : dpr natif jusqu'en 2160p (TV 4K, écran HiDPI) ; sur un écran 1080p à
  dpr 1, canevas 2160p réduit par le compositeur (moyenne 2×2 exacte) = **SSAA 4×**. SMAA HIGH, 2 200 cailloux.
  `presetDpr` accepte `supersample`. Oiseaux et FX : `ultra` = détail `high`.
- **Banc en deux temps** : le titre en High coûte ≤ 3 ms (`BENCH_ULTRA_TRY_MS`) → 2e banc en Ultra (50 images de
  chauffe), Ultra retenu si ≤ 8,5 ms, sinon High. High ≤ 8 ms (8,5 avant), Medium ≤ 11 ms (12 avant ; Medium ≈
  0,74 × High au titre). Clé du banc passée en `ombres.qualityBench.v2` (le banc repasse une fois). La
  surveillance descend Ultra → High comme les autres crans.
- Réglage « Qualité » : Auto / Basse / Moyenne / Haute / **Ultra** (FR et EN), `reglage-qualite-fr.jpg`.
- Coût sur CETTE machine (contention forte, indicatif) : ≈ 40 ms (SSAA en 1080p) et ≈ 37 ms (4K natif) : le banc
  ne le choisira pas ici (titre High ≈ 8,5-9,5 ms). Preuves : `4k-ultra-*` (High = 1080p agrandi ×2 contre 4K natif),
  `1080p-ultra-*`.

### 5.2 MSAA ×4 sur la passe MRT : écarté (après analyse, non implémenté)

three 0.186 sait créer une cible MRT multiéchantillonnée et la résoudre par `blitFramebuffer`
(`WebGLRenderTarget({ count: 2, samples: 4 })`, compatible avec le composer de postprocessing 6.39), mais :
1. WebGL 2 ne lit pas les échantillons (pas de `sampler2DMS`, ni `gl_SampleMaskIn`) : l'encre ne voit que le
   résultat résolu ;
2. la résolution **moyenne** l'attache normale + ID : au bord de deux objets, l'ID devient une valeur
   intermédiaire (souvent l'ID d'un autre objet, ou un non-ID), d'où de faux traits et des coutures doublées ;
   en RGBA8 la fraction est de toute façon arrondie ;
3. la profondeur est résolue sur UN échantillon (au choix du pilote) : même escalier qu'avant ;
4. le seul gain, les aplats antialiasés SOUS les traits, ne se voit pas (le trait couvre le bord) ;
5. coût : 4 × la bande passante de trois attaches + trois résolutions à chaque image.
Le SSAA d'Ultra (rendu 2× réduit par le compositeur) antialiase tout, correctement, sans ces pièges.

## 6. Mesures GPU (Renoir / Vega, ANGLE GL, 1920×1080, requête TIME_ELAPSED sur l'image entière)

A/B entrelacé dans une même page (5 tours de 1,8 s par configuration, écart apparié médian), créneaux calmes :

| Preset | Scène | Avant p50 / p90 (ms) | Après p50 / p90 (ms) | Δ p50 apparié |
|---|---|---|---|---|
| Medium | 12 oiseaux, Grande Ombre | 6,23 / 6,72 | 6,66 / 7,24 | +0,44 |
| Medium | 12 oiseaux, midi | 5,55 / 5,82 | 5,82 / 6,29 | +0,31 |
| Medium | 4 oiseaux, Grande Ombre | 6,58 / 7,34 | 6,87 / 7,40 | +0,25 (1080p natif : 8,19 / 8,89, +1,36) |
| High | 12 oiseaux, Grande Ombre | 8,59 / 9,19 | 9,18 / 9,57 | +0,71 |
| High | 12 oiseaux, midi | 7,42 / 7,82 | 7,93 / 8,33 | +0,48 |
| High | 4 oiseaux, Grande Ombre | 9,63 / 10,19 | 10,05 / 10,61 | +0,57 |
| Low | 12 oiseaux, Grande Ombre | 3,39 / 3,82 | 4,11 / 4,50 | +0,71 |
| Low | 12 oiseaux, midi | 3,12 / 3,53 | 3,93 / 4,35 | +0,81 |
| Low | 4 oiseaux, Grande Ombre | 3,90 / 4,54 | 4,52 / 5,43 | +0,62 |

(High : encre +0,4, SMAA MEDIUM +0,3 ; Low : SMAA LOW +0,6 à 720p, encre +0,15.)

Manche entière au calme (`perfmatrix.mjs --speed=2`, après ; p50 / p90 GPU de l'image par phase, 60 i/s tenus) :

| Preset | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre | Avant (fix3-world, p90) |
|---|---|---|---|---|---|---|
| Medium, 12 oiseaux | 6,52 / 7,47 | 6,26 / 7,34 | 7,51 / 8,71 | 7,21 / 8,20 | 7,40 / 8,63 | 6,83-8,02 |
| Medium, 4 oiseaux | 6,73 / 6,98 | 6,74 / 6,99 | 6,90 / 7,24 | 7,23 / 8,69 | 7,05 / 7,50 | — |
| Low, 12 oiseaux | 3,96 / 4,47 | 4,02 / 4,58 | 4,38 / 4,74 | 4,39 / 4,89 | 4,44 / 5,05 | 3,43-4,78 |

High : les passes de manche entière ont été contaminées par l'autre agent (images > 20 ms) ; propres :
couchant 12 oiseaux 9,18 / 9,65, couchant 4 oiseaux 9,71 / 10,12 ; voir les A/B ci-dessus.

Budgets :
- **Medium** : p50 6,3-7,5 ms (≤ 8 ms), p90 7,0-8,7 ms : dépasse 8 ms de ≤ 0,7 ms au p90 à l'heure dorée et à la
  Grande Ombre. `budgetMs` 8 → 8,5 (sinon la surveillance, p90 > 8,8 ms, aurait fait descendre en Low au moindre
  à-coup du CPU).
- **High** : ≤ 10 ms tenu à 12 oiseaux (p90 9,6 ms à la Grande Ombre) ; dépassé à 4 oiseaux en plans serrés
  (10,6 ms), comme avant (10,2 ms).
- **Low** : ≤ 5,4 ms (budget 5 → 6 : +SMAA LOW).
- **Banc** : le titre en High mesure 8,3-8,7 ms au banc (High retenu 2 fois sur 3 avec le seuil de 8,5 ms, pour
  un p90 de 9,6-10,6 ms au climax) ; seuil abaissé à 8 ms (High coûte ~0,6 ms de plus) : **Medium 3 fois sur 3**
  ici (production, sans `?debug`), canevas 1920×1080, 60 i/s avec ≥ 48 % de marge.

## Vérifications

- `npx tsc --noEmit -p tsconfig.json` : 0 erreur. `npx vitest run` : 31 fichiers, 377 tests verts.
  `pnpm check:boundaries` : OK.
- Manche complète (6 oiseaux, réglage auto) en passant à chaud Low → Medium → High → Ultra → Medium → Low → High :
  canevas 1280×720 / 1920×1080 / 1920×1080 / 3840×2160 (SSAA), aucune erreur ni avertissement de console.
- `quality.test.ts` : banc en deux temps (Ultra retenu / refusé / pas de 2e banc), `presetDpr` d'Ultra
  (4K natif, HiDPI, SSAA sur 1080p, 1440p), surveillance Medium et Ultra.
- Console propre sur toutes les captures (shots.mjs relève les erreurs de page) ; réglage Ultra FR / EN affiché.

## Reste à faire

1. Escaliers à longues marches sur les traits presque horizontaux (§2, limite) : fenêtre de 5 colonnes.
2. Coutures de territoire : l'aliasing d'un pixel de fix3-world §1.4 reste (matériau du sol, pas l'encre).
3. Un preset « High 4K » intermédiaire (G-buffer 1080p, encre en 2160p : même mécanique que Medium, échelle
   entière 0,5 sans battements) pour les écrans 4K avec un GPU moyen.
