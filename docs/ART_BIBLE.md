# Ombres : bible artistique et technique de rendu

> **Statut** : référence de production pour tous les agents qui touchent à l'image (rendu, matériaux, FX, caméra, HUD, téléphone).
> **Sources** : `docs/research/moebius-style.md` (règles R1-R25, palettes K0-K5), `docs/research/npr-techniques.md` (pipeline N1-N15), `design-party.md` et `design-drama.md` (règles de jeu). Là où ces documents divergent, cette bible tranche, avec les arbitrages motivés en §9.
> **Compagnons machine** : `docs/art/palette.json` (keyframes, 12 joueurs, constantes) ; `docs/art/tools/` (scripts qui recalculent tous les chiffres de ce document : `pnpm i && node export.mjs && node final.mjs`) ; `docs/art/prototype/` (prototype NPR patché avec cette bible : palette finale, territoire, ombres-empreintes, motifs daltoniens) ; `docs/art/img/` (captures et planches de validation).
> **Convention** : « L », « C », « h » = OKLCH ; ΔE = distance euclidienne OKLab. Les px sont donnés pour 1080p et se multiplient par `uPx = hauteurDuBuffer / 1080`.

---

## 0. Les 15 règles à retenir

1. **High-key** : de jour, ≥ 60 % des pixels au-dessus de L 0,6 et une médiane ≥ 0,70. Au coucher, médiane ≥ 0,50. C'est mesuré automatiquement (§7.7).
2. **L'encre est brun-aubergine** (`#2B1D23` de jour, `#181322` la nuit), jamais `#000`. Le trait dessine les formes, la couleur porte la lumière.
3. **Deux tons par objet**, terminateur net. Les dégradés sont réservés au ciel et aux halos.
4. **L'arène est une toile** : sol plat, clair et vide. Le relief (dunes, mesas, Falaise) est **hors arène**.
5. **Le territoire est un lavis d'aquarelle** : pas d'encre, pas d'alpha, et aucune hachure hors mode daltonien. Le fort se distingue du pâle par sa valeur, son chroma, son liseré de pigment et sa granulation.
6. **Les ombres portées sont des aplats nets** mélangés en OKLab, sans contour d'encre ni hachure. L'ombre d'un oiseau a deux couches : l'**empreinte** (l'ellipse exacte de gameplay) et l'**âme** (la vraie silhouette).
7. **Le coucher se lit au sol** : sol gris-lavande, faces au soleil corail, ombres violettes, territoire qui s'allume. Le ciel n'entre dans le cadre qu'aux moments de mise en scène.
8. **La palette suit une horloge dédiée** (`paletteElev`) : quelle que soit la courbe du soleil retenue, la bascule heure dorée → coucher → crépuscule tombe dans les 30 derniers % de la manche.
9. **12 couleurs de joueurs** validées au ΔE, attribuées dans un ordre fixe. De 2 à 6 joueurs, elles restent distinctes pour les trois daltonismes.
10. **Mode daltonien** : un motif de trame par joueur sur son territoire, et un glyphe par joueur partout (HUD, téléphone, oiseau, centre de son ombre).
11. **L'oiseau est blanc os pour tous.** La couleur du joueur va sur les bandes d'ailes, la cape, la selle, le fanion et le ruban de traînée.
12. **Aucun effet photoréaliste** : ni bloom, ni glow additif, ni DOF, ni aberration chromatique, ni motion blur, ni lens flare. Les FX sont des formes plates et des traits d'encre.
13. **Tout le dessin se fait dans les matériaux** ; en post-process, une seule `InkEffect` puis SMAA. Pas plus de deux passes plein écran.
14. **Budget GPU ≤ 10 ms** en 1080p High sur iGPU de classe Vega 6, avec 40 % de marge.
15. **UI en cases de BD** : papier `#F7F0E3`, bordure d'encre de 2 px, ombre décalée sans flou. Titres en Julius Sans One, textes en Patrick Hand SC, chiffres en Averia Sans Libre Bold.

---

## 1. Intention visuelle

### 1.1 En cinq phrases

1. *Ombres* est une planche de Moebius qui s'anime : un désert clair et presque vide, dessiné d'un trait brun fin, où de minuscules cavaliers sur des oiseaux blancs tracent de la couleur avec leur ombre.
2. Le sable est une feuille de papier et le territoire un lavis d'aquarelle : chaque joueur « peint » littéralement, et l'arène se couvre au fil de la manche d'une mosaïque pastel qu'on a envie de photographier.
3. La lumière est l'horloge et le drame : midi blanc et calme, heure dorée chaude, puis un coucher où le sol bascule dans le gris-lavande pendant que les ombres, violettes et démesurées, balaient la toile.
4. Tout reste lisible d'un coup d'œil depuis le canapé : formes nettes, deux tons, ombres plates, couleurs de joueurs distinctes, aucune texture qui fourmille.
5. L'étrangeté vient du calme : grands vides, tours organiques aux dômes turquoise, silence du vent, et jamais un effet « jeu vidéo » (glow, bloom, particules brillantes) qui trahirait le papier.

### 1.2 Planches mentales

Captures du prototype patché dans `docs/art/img/` (caméra de jeu, soleil à l'ouest, 12 territoires, 6 oiseaux dont 3 HAUT et 3 BAS).

**Zénith (KF80, `jeu-kf80-zenith.jpg`)** — Une page presque blanche. Le sable crème `#F1DABE` occupe 60 % du cadre, et les premières traînées de lavis pastel partent des oiseaux comme des coups de pinceau mouillés. Les ombres sont de petites taches lavande collées sous les oiseaux et au pied des tours. Les parasols posent des disques d'ombre ronds. Les tours sont crème et ocre, avec des hachures verticales sur leur flanc à l'ombre. Pas de ciel, pas d'horizon : on regarde une carte dessinée. Humeur : matin de *40 days dans le désert B*, turquoise et crème. Rythme horizontal, calme.

**Heure dorée (KF16, `jeu-kf16-heure-doree.jpg`)** — Le sable se dore (`#EAB377`) et les ombres des fûts deviennent de longues lignes violettes (`#6F6089`) qui rayent la toile d'ouest en est. Les empreintes des oiseaux HAUT s'étirent en ellipses pâles bordées de pointillés. La mosaïque des territoires couvre la moitié de l'arène ; les couleurs y gagnent en saturation. Contraste complémentaire or/violet, celui de la couverture d'Arzach. Les diagonales apparaissent : la tension monte.

**Coucher (KF3 → KF1, `jeu-kf3-coucher.jpg`, `jeu-kf1-falaise.jpg`, `plan-bas-coucher.jpg`)** — Le sol plat bascule dans le gris-lavande (`#82788B` puis `#797286`). Seules les faces tournées vers le soleil restent corail : flancs ouest des tours, dessus des oiseaux, crêtes des dunes hors arène. Les ombres des tours forment des bandes violettes (`#554C70`) qui découpent le désert en couloirs de lumière. Les empreintes des oiseaux deviennent des rubans de 100 à 270 m. Sur ce fond froid, le territoire s'allume en couleurs de vitrail (chroma 0,13-0,15). Quand la caméra s'abaisse pour les plans de mise en scène, le ciel est un aplat orange sous un haut mauve, barré de strates. C'est **le** moment du jeu, chaque manche doit s'y terminer.

**Horizon (plans bas : titre, transitions, victoire ; `plan-bas-heure-doree.jpg`, `plan-bas-soleil-bas.jpg`)** — Horizon dans le tiers inférieur (contre-plongée) ou le tiers supérieur (plongée), jamais au centre. Trois plans de strates lointaines (mesas, Falaise, dunes) en aplats de plus en plus proches de la brume, avec des traits de plus en plus fins puis absents. Un disque solaire plat avec un seul halo, et un ou deux cumulus plats festonnés. Les oiseaux passent en silhouette blanche cernée. Aucun flare.

---

## 2. Palette maîtresse et keyframes du cycle solaire

### 2.1 Constantes (indépendantes de l'heure)

| Rôle | Hex | Notes |
|---|---|---|
| Encre de jour | `#2B1D23` | L 0,25 · C 0,024 · h 352. Varie par keyframe (§2.2). |
| Papier UI | `#F7F0E3` | Fond des cases, du téléphone, des cartouches. |
| Papier UI 2 | `#EFE4CF` | Fond secondaire, lignes de tableau. |
| Oiseau (os) | `#EDEDDF` | Albédo, teinté par la lumière (§2.6). |
| Oiseau ombre (jour) | `#C4C6BA` | Creux : `#ACADA3`. |
| Tour crème | `#EFE2C8` | Environ 50 % de la surface des tours. |
| Tour ocre | `#D9A45B` | Environ 25 %. |
| Tour terracotta | `#C8765A` | Environ 20 %. |
| Dôme turquoise | `#4FB3AE` | ≤ 5 % de la surface des tours, en accent. |
| Dôme cobalt | `#3C5FA8` | Idem. |
| Or de couronne | `#FFF2C3` | Couronne du meneur, sun-dial du HUD. Jamais une couleur joueur. |

### 2.2 Les 9 keyframes

L'index est `paletteElev`, en degrés (§2.4). Les cinq keyframes demandées sont en gras. K0, K2, K3, K4 et K5 de `moebius-palettes.json` sont conservées (sauf le `skyMid` de K2, §2.3) ; K1 (45°) est remplacée par **KF50** ; **KF50** et **KF25** sont des interpolations OKLab vérifiées ; **KF10** et **KF1** sont redessinées (§2.3). **`docs/art/palette.json` remplace `moebius-palettes.json`** comme source de vérité.

**Ciel, soleil, brume**

| Keyframe | Élév. | Ciel zénith `skyTop` | Ciel milieu `skyMid` (60 %) | Ciel horizon `skyHorizon` | Soleil `sun` | Brume `haze` |
|---|---|---|---|---|---|---|
| **KF80 Zénith** | 80° | `#8DD3D2` | `#B5E3D9` | `#E6F3E3` | `#FFFCF0` | `#EBE8DA` |
| **KF50 Après-midi** | 50° | `#57B8CD` | `#93D4DA` | `#CFEAE8` | `#FFF9E3` | `#E6DBC8` |
| **KF25 Fin d'après-midi** | 25° | `#6294C2` | `#8FCCD1` | `#EAE9BD` | `#FFF4CC` | `#EED2A7` |
| KF16 Heure dorée | 16° | `#6886BD` | `#B7DBCA`* | `#F7E9A7` | `#FFF2C3` | `#F2CE99` |
| **KF10 Soleil bas** | 10° | `#7570A3` | `#F4C7A3` | `#FBDE8C` | `#FFECB7` | `#EEBA90` |
| KF3 Coucher | 3,5° | `#795C87` | `#EC9C63` | `#FFD16B` | `#FFE6A9` | `#E8A587` |
| **KF1 Soleil sur la Falaise** | 1° | `#624D7A` | `#E7885D` | `#FFC669` | `#FFD7A0` | `#DA9982` |
| KF-4 Crépuscule (derrière la nuit) | −4° | `#272950` | `#775774` | `#D69F58` | `#F6B669` (lueur, pas de disque) | `#816C85` |
| KF-15 Nuit (résultats) | −15° | `#162C55` | `#294875` | `#5B678C` | `#E3F0FE` (lune) | `#69708F` |

\* Seule retouche d'une keyframe d'origine : le `skyMid` de K2 (`#90CACD`, aqua) passe au jade crème pâle `#B7DBCA` (§2.3).

**Sol, ombres, encre, hachures**

| Keyframe | Sable éclairé `sandLit` | Sol plat `groundFlat` | Sable ombré `sandShade` | Ombre portée `castShadow` | Encre `ink` | Hachures (couleur · opacité) | Chroma du lavis `paintC` |
|---|---|---|---|---|---|---|---|
| **KF80** | `#F1DABE` | `#F1DABE` | `#CCB0A7` | `#A18EA1` | `#2B1D23` | `#2B1D23` · 0,30 | 0,105 |
| **KF50** | `#EED1A9` | `#EED1A9` | `#C1A199` | `#8C7F98` | `#2B1D23` | `#2B1D23` · 0,35 | 0,105 |
| **KF25** | `#F2C284` | `#EBBC86` | `#B38887` | `#77698D` | `#2C1C22` | `#2F1F27` · 0,38 | 0,110 |
| KF16 | `#F4BC74` | `#EAB377` | `#AE7E80` | `#6F6089` | `#2D1C22` | `#33222B` · 0,40 | 0,115 |
| **KF10** | `#F2A96A` | `#D29E90` | `#977B86` | `#62567D` | `#2A1A22` | `#32222E` · 0,42 | 0,120 |
| KF3 | `#EF945F` | `#82788B` | `#7D768C` | `#554C70` | `#261721` | `#2F2130` · 0,42 | 0,130 |
| **KF1** | `#E57E5E` | `#797286` | `#726C82` | `#4E476A` | `#231521` | `#2D2132` · 0,40 | 0,135 |
| KF-4 | `#706C7F` | `#575568` | `#575568` | `#45455D` | `#181322` | `#252133` · 0,25 | 0,130 |
| KF-15 | `#9B94AB` | `#7B778D` | `#7B778D` | `#626079` | `#131423` | `#2C2D3F` · 0,20 | 0,120 |

Rôles :
- `groundFlat` est la couleur du **sol plat** : c'est elle qu'on voit sur 90 % de l'arène.
- `sandLit` et `sandShade` ne servent qu'aux pentes (dunes hors arène) et de référence aux objets.
- `castShadow` est l'ombre portée neutre (tours, cailloux) et la base des ombres teintées des joueurs.
- La couleur des hachures vaut `mix_OKLab(ink, castShadow, t)`, avec t = 0 de jour et 0,35 la nuit.

Les valeurs OKLCH et les couleurs dérivées (oiseau, hachures) sont dans `docs/art/palette.json`.

### 2.3 Pourquoi KF10 et KF1 sont redessinées (anti-boue)

L'interpolation OKLab directe entre K2 (heure dorée) et K3 (coucher) passe par des teintes complémentaires : or → lavande pour le sol, turquoise → orange pour le ciel. À 10°, elle produisait :
- un sol `#B79784` (C 0,047, h 52), taupe boueux, visible sur la capture `v3-game-sun10.jpg` du doc NPR ;
- un `skyMid` gris beige `#C3B69E` (C 0,036).

KF10 fait passer la transition **par le rose d'Arzach** (sol `#D29E90`, C 0,066, h 36) et **par l'abricot pâle** dans le ciel (`skyMid` `#F4C7A3`). L'aqua de KF16 est éclairci en jade crème (`#B7DBCA`, L 0,86), si bien que la bande médiane du ciel passe par un crème clair (C 0,036, h 96) et non par un gris : c'est la bande blanchâtre naturelle entre le bleu du zénith et l'or de l'horizon. Tous les segments de manche gardent au moins 82 % du chroma de leur extrémité la plus faible (contrôle automatique dans `final.mjs`). Capture : `jeu-kf10-soleil-bas.jpg`.

KF1 est le dernier état avant la nuit, donc **le plan que tout le monde verra à chaque fin de manche**. Le coucher y est poussé plus loin que dans K3 :
- lumière rasante plus rouge (`sandLit` `#E57E5E`) ;
- sol un peu plus sombre (L 0,57) ;
- ombres plus profondes (`#4E476A`) ;
- brume chaude `#DA9982`, qui fait rougeoyer le haut du cadre, là où le sol est loin ;
- lavis au chroma maximal (0,135).

Règle pour toute nouvelle keyframe : la chroma de `groundFlat`, `skyMid` et `skyHorizon` au milieu de chaque segment ne descend pas sous 60 % de la plus faible des deux extrémités. `node docs/art/tools/final.mjs` le vérifie (porte `midChroma`). Seule exception : le fondu des résultats KF-4 → KF-15, où l'horizon ocre → bleu passerait par le brun. Ce fondu-là interpole le **ciel en OKLCH**, avec la teinte par le chemin court (72° → 0° → 270°, via le mauve).

### 2.4 L'horloge de palette `paletteElev`

La palette ne suit pas l'élévation physique du soleil, mais une **élévation de palette** qui garantit le climax. Les deux propositions de design n'ont pas la même courbe : design-party va de 88° à 5° linéairement, design-drama de 90° à 9° avec un exposant 1,7. Dans les deux cas, on veut que la séquence KF16 → KF10 → KF3 → KF1 occupe les ~30 derniers % du soleil et que la manche finisse sur KF1.

```ts
// E_end = élévation de gameplay en fin de soleil (5° ou 9°). E_s = élévation de gameplay à t = 0,70·T.
function paletteElev(e: number, E_end: number, E_s: number): number {
  if (e >= E_s) return e;                                   // au-dessus : identité
  return 1 + (e - E_end) * (E_s - 1) / (E_s - E_end);       // [E_end, E_s] -> [1°, E_s]
}
// design-party (88->5 linéaire, T=110) : E_s = 29,9° ; design-drama (9 + 81(1-u)^1,7) : E_s = 19,5°
```

- **Soleil visible** : le disque solaire est dessiné à l'élévation **de gameplay**, qui gouverne aussi les ombres. L'horizon effectif est dimensionné pour que le disque la touche exactement à `E_end` : c'est la Falaise de design-drama, ou une ligne de mesas pour design-party. Pour `E_end = 9°`, la crête doit culminer à `atan(h/d) = 9°`, par exemple 270 m à 1,7 km. « Le soleil touche la Falaise » coïncide ainsi avec KF1.
- **Front de nuit** (« Grande Ombre » ou « Nuit ») : c'est une transition **spatiale**. Derrière le front, le sol et les objets utilisent KF-4 ; devant, KF1 (§4.6).
- **Résultats** : fondu KF-4 → KF-15 en 2,5 s pendant la montée de la caméra à la verticale.
- **Écran titre** : KF16 fixe en boucle, ou lent cycle KF50 → KF1 en 90 s (au choix de l'agent écran titre). **Lobby** : KF50 fixe (soleil de 60° dans design-party).

### 2.5 Interpolation

- **OKLab, sur le CPU, une fois par frame**, entre les deux keyframes voisines, linéaire en `paletteElev`. Jamais en sRGB, qui salit l'orange → violet. Pas de LUT texture.
- On ne pousse que des **uniforms partagés** (un seul objet `{ value }` référencé par tous les matériaux) : `uSkyTop`, `uSkyMid`, `uSkyHorizon`, `uSun`, `uHaze`, `uSandLit`, `uGroundFlat`, `uSandShade`, `uCastShadow`, `uInk`, `uHatchCol`, `uHatchOpacity`, `uPaintC`, `uShadowCols[13]`, `uBirdLit`, `uBirdShade`, `uTowerLit[k]`, `uTowerShade[k]`.
- Les couleurs dérivées (§2.6) sont recalculées au même endroit, sur le CPU.
- L'implémentation de référence d'OKLab est dans `docs/art/prototype/main.js` (`linToOklab`, `oklabToLin`).

### 2.6 Couleurs dérivées (formules)

Toutes en OKLab. `warm = clamp((60 − paletteElev)/56, 0, 1)` vaut 0 de jour et 1 au coucher.

| Couleur | Formule | Exemple KF80 → KF3 |
|---|---|---|
| Oiseau éclairé | `mix(os, mix(sun, sandLit, warm), 0.10 + 0.40·warm)` ; nuit : `mix(os, sandLit, 0.55)` | `#EFEEE1` → `#F1C1A0` (pêche) |
| Oiseau ombré | `mix(#C4C6BA, castShadow, 0.15 + 0.45·warm)` | `#BFBDB6` → `#7F7B8E` |
| Tour éclairée (albédo A) | `mix(A, sandLit, 0.12 + 0.48·warm)` ; nuit : `mix(A, sandLit, 0.6)` | crème `#EFE2C8` → corail pêche |
| Tour ombrée | `L = L(tourÉclairée)·(0.80 − 0.10·warm)`, `ab = mix(ab_éclairée, ab_castShadow, 0.55)` | ratio de L 0,80 → 0,70 (R7) |
| Ombre teintée du joueur i | `oklch(L(castShadow), 0.06, h_i)` | — |
| Hachures | `mix(ink, castShadow, t)` à l'opacité de la table | — |
| Brume à longue distance | `mix(haze, skyHorizon, smoothstep(0.5, 0.9, fog))` | Le lointain prend la couleur de l'horizon et raccorde le sol au ciel. |

Validé en capture : sans la teinte de lumière, les tours restaient crème au coucher (faux). Avec, leurs flancs ouest virent au corail (`jeu-kf3-coucher.jpg`, `plan-bas-coucher.jpg`).

---

## 3. Les 12 couleurs de joueurs

### 3.1 La palette

L'ordre du tableau est l'**ordre d'attribution**. Onze noms reprennent ceux de design-drama, figés tôt pour pré-générer les voix. **Ardoise est remplacée par Sarcelle** : un gris ardoise à faible chroma se confond par construction avec les ombres lavande (C < 0,06, h 280-340).

| # | FR | EN | Couleur (hex) | OKLCH (L · C · h) | Texte sur papier | Glyphe | Motif daltonien |
|---|---|---|---|---|---|---|---|
| 1 | **Corail** | Coral | `#E07148` | 0,67 · 0,150 · 40 | `#A0421D` | croix ✚ | lignes à 45° « / » |
| 2 | **Lagon** | Lagoon | `#6ADDD9` | 0,83 · 0,105 · 192 | `#007270` | vagues ≈ | lignes horizontales |
| 3 | **Indigo** | Indigo | `#414CAA` | 0,46 · 0,150 · 274 | `#424EA2` | croissant ☾ | points |
| 4 | **Safran** | Saffron | `#FBCF55` | 0,87 · 0,145 · 89 | `#7B5F00` | disque ● | lignes verticales |
| 5 | **Azur** | Azure | `#3C96D8` | 0,65 · 0,130 · 244 | `#1169A0` | triangle ▲ | lignes à 135° « \ » |
| 6 | **Carmin** | Carmine | `#A52E49` | 0,49 · 0,155 · 12 | `#9F364B` | carré ■ | quadrillage + |
| 7 | Prune | Plum | `#9B60A4` | 0,58 · 0,120 · 322 | `#7F4D87` | goutte | quadrillage × |
| 8 | Anis | Anise | `#8CC460` | 0,76 · 0,145 · 133 | `#447214` | étoile ★ (anis étoilé) | vagues |
| 9 | Sarcelle | Teal | `#006773` | 0,47 · 0,085 · 209 | `#106672` | chevron ^ (vol d'oiseau) | tirets horizontaux |
| 10 | Rose | Rose | `#F79BB6` | 0,79 · 0,115 · 1 | `#924860` | losange ◆ | anneaux |
| 11 | Lilas | Lilac | `#B0A4F5` | 0,76 · 0,115 · 290 | `#63589A` | anneau ◯ | zigzag |
| 12 | Jade | Jade | `#44975F` | 0,61 · 0,118 · 152 | `#2A7444` | éclair ϟ | tirets verticaux |

Planche : `docs/art/img/joueurs-identite.png` (jetons dans les quatre visions, motifs au zénith et au coucher, maquette d'aile).

**Utilisation** :
- La **couleur** sert à la cape, à la selle, aux bandes d'ailes, au fanion, au ruban de traînée, aux pastilles d'UI, aux liserés d'ombre et aux segments de la barre de territoire.
- La **variante texte** (L ≤ 0,50) sert **uniquement** quand un nom de couleur est écrit en couleur sur papier, par exemple le nom du joueur dans un sous-titre du narrateur. Sinon, les noms s'écrivent à l'encre (§8.3).
- **Le territoire n'utilise pas la couleur d'identité telle quelle**, mais un lavis dérivé (§3.3, §4).

**Choix de conception** :
- Les **luminosités sont volontairement étagées** de 0,46 (Indigo) à 0,87 (Safran). La luminosité est la seule dimension qui survit à tous les daltonismes.
- **La contrainte du doc style (L 0,60-0,75) s'applique au lavis**, pas à l'identité.
- **Chroma de 0,085 à 0,155** : des accents vifs mais pas fluo, à la manière de la cape jaune d'Arzach. Aucune couleur n'a de teinte comprise entre 45° et 85° avec un chroma inférieur à 0,12 (zone du sable), ni entre 280° et 340° avec un chroma inférieur à 0,10 (zone des ombres).

### 3.2 Ordre d'attribution et règles de lobby

- **Ordre** : Corail, Lagon, Indigo, Safran, Azur, Carmin, Prune, Anis, Sarcelle, Rose, Lilas, Jade. Il a été obtenu par sélection gloutonne du point le plus éloigné, sur `min(ΔE normal, 1,6·ΔE deutan, 1,6·ΔE protan, 1,3·ΔE tritan)`, en partant du couple Moebius « turquoise + corail ».
- **Bots et joueurs sans choix** : ils prennent la **première couleur libre dans cet ordre**.
- **Choix manuel** : un humain peut choisir n'importe quelle couleur libre. Le lobby affiche d'abord les 6 premières et signale d'un petit œil barré les paires peu distinctes en daltonisme (tableau §3.4), sans rien interdire.
- **Mode daltonien actif et au plus 6 joueurs** : l'attribution automatique **n'utilise que les slots 1-6**.

### 3.3 Paramètres du lavis de territoire (par joueur)

Le lavis garde la teinte d'identité. Sa luminosité suit le sol (§4.1) avec un décalage `dL` propre au joueur, et son chroma vaut `paintC(keyframe) × cs`. Ces paramètres ont été optimisés séparément de l'identité pour maximiser la distinction sur le sol à toutes les keyframes.

| # | Joueur | dL | cs | KF80 fort / pâle | KF16 fort / pâle | KF10 fort / pâle | KF3 fort / pâle | KF-4 fort / pâle |
|---|---|---|---|---|---|---|---|---|
| 1 | Corail | −0,053 | 1,15 | `#EE9271` / `#FCC6B4` | `#E27F5C` / `#DFA693` | `#DB7450` / `#CD937F` | `#C55830` / `#A76C57` | `#AF4419` / `#884F3B` |
| 2 | Lagon | +0,060 | 0,92 | `#7BE2DE` / `#ACE0DD` | `#4DC4C0` / `#8AC2BF` | `#39BCB8` / `#75AFAD` | `#0BB7B3` / `#5A9996` | `#00A19D` / `#3B7B78` |
| 3 | Indigo | −0,109 | 1,07 | `#8696E1` / `#C7D2FE` | `#7686D7` / `#A8B3E1` | `#6D7DD1` / `#95A0D0` | `#5664BD` / `#6872A3` | `#4550A7` / `#4C5684` |
| 4 | Safran | +0,056 | 1,15 | `#EECA6B` / `#E6D3A3` | `#D1AA3C` / `#C8B480` | `#C8A025` / `#B6A16B` | `#C29800` / `#A0894F` | `#AA8500` / `#816C31` |
| 5 | Azur | −0,019 | 0,96 | `#7EBFF4` / `#B6D9F7` | `#68B0E9` / `#95BBDA` | `#59A5E0` / `#81A8C8` | `#398ECD` / `#5D86A8` | `#207BB8` / `#416989` |
| 6 | Carmin | −0,120 | 1,15 | `#D87784` / `#FDC3C9` | `#CC6474` / `#E0A3A9` | `#C5596B` / `#CE8F96` | `#AE3C53` / `#9E5F67` | `#992741` / `#7F434B` |
| 7 | Prune | −0,070 | 0,94 | `#C593CD` / `#E6C9EA` | `#B882C1` / `#C8A9CC` | `#B078B9` / `#B696BA` | `#9A5EA3` / `#8E6E93` | `#864B8F` / `#705175` |
| 8 | Anis | +0,052 | 1,15 | `#AFDF8C` / `#C3DEB2` | `#8EC167` / `#A4C090` | `#82B759` / `#90AE7C` | `#77B047` / `#789662` | `#649C31` / `#5B7845` |
| 9 | Sarcelle | −0,091 | 0,94 | `#48B2C2` / `#ABDFE7` | `#1FA4B6` / `#89C1CA` | `#009BAD` / `#74AEB8` | `#008190` / `#43838D` | `#006D79` / `#236670` |
| 10 | Rose | +0,059 | 0,96 | `#FFB6CA` / `#F5C6D2` | `#E991AB` / `#D7A6B3` | `#E186A2` / `#C593A0` | `#DE7C9B` / `#B07B89` | `#C86987` / `#905E6C` |
| 11 | Lilas | +0,049 | 1,15 | `#CCC5FF` / `#D3CEFE` | `#AEA0FD` / `#B4AEE1` | `#A495F5` / `#A29BD0` | `#9C8AF2` / `#8A82BA` | `#8976DC` / `#6C659A` |
| 12 | Jade | −0,097 | 0,93 | `#6FB181` / `#BBDFC3` | `#5AA370` / `#9AC1A3` | `#4E9B66` / `#87AE90` | `#2C844C` / `#598364` | `#10713A` / `#3D6548` |

Ces hex sont calculés sur `groundFlat`, hors liseré et hors granulation. En jeu, le shader les recalcule à partir du sol local (§4.1).

### 3.4 Tableau de validation chiffré

Calculé par `docs/art/tools/final.mjs`, qui utilise culori 4.0.2 et les simulations de Machado (2009) à sévérité 1 (dichromatie complète : cas le plus dur).

**Couleurs d'identité, ΔE OKLab minimal entre toutes les paires des N premiers slots (et la pire paire)**

| N joueurs | Vision normale | Deutéranopie | Protanopie | Tritanopie |
|---|---|---|---|---|
| 2 | 0,294 (Corail/Lagon) | 0,202 (Corail/Lagon) | 0,289 (Corail/Lagon) | 0,348 (Corail/Lagon) |
| 3 | 0,294 | 0,202 | 0,247 (Corail/Indigo) | 0,348 |
| 4 | 0,202 (Lagon/Safran) | 0,202 | 0,158 (Lagon/Safran) | 0,190 (Corail/Safran) |
| 5 | 0,202 | 0,167 (Indigo/Azur) | 0,158 | 0,182 (Lagon/Azur) |
| **6** | **0,195** (Corail/Carmin) | **0,165** (Indigo/Carmin) | **0,158** | **0,180** (Corail/Carmin) |
| 7 | 0,149 (Carmin/Prune) | 0,083 (Azur/Prune) | 0,091 (Indigo/Prune) | 0,126 (Carmin/Prune) |
| 8 | 0,146 (Lagon/Anis) | 0,083 | 0,075 (Safran/Anis) | 0,114 (Azur/Anis) |
| 9 | 0,137 (Indigo/Sarcelle) | 0,083 | 0,075 | 0,072 (Indigo/Sarcelle) |
| 10 | 0,137 | 0,052 (Lagon/Rose) | 0,075 | 0,072 |
| 11 | 0,136 (Rose/Lilas) | 0,052 | 0,075 | 0,059 (Anis/Lilas) |
| **12** | **0,136** (Rose/Lilas) | **0,052** (Lagon/Rose) | **0,048** (Corail/Jade) | **0,059** (Anis/Lilas) |

Lecture :
- Pour mémoire, un ΔE OKLab de 0,02 est à peine perceptible sur de petites surfaces. **Cible du brief (> 0,08-0,10) : tenue à 12 joueurs en vision normale (0,136) et de 2 à 6 joueurs pour les trois daltonismes (≥ 0,158).**
- De 7 à 12 joueurs, quelques paires descendent à 0,05-0,08 pour une dichromatie complète. C'est là que les motifs et glyphes du mode daltonien prennent le relais (§3.5).
- Contraste avec l'os de l'oiseau (`#EDEDDF`), qui compte pour les bandes d'ailes : de 0,147 (Safran) à 0,511 (Indigo). Avec le papier UI : de 0,153 à 0,525. Safran et Lagon, les plus clairs, reçoivent un contour d'encre partout (bande, pastille).

**Lavis de territoire (fort), ΔE minimal entre joueurs, à chaque keyframe, et contre le sol nu ou l'ombre de tour**

| Keyframe | Normal (pire paire) | Deutan | Protan | Tritan | Lavis vs sol ou ombre (normal) |
|---|---|---|---|---|---|
| KF80 | 0,090 (Corail/Carmin) | 0,033 | 0,037 | 0,030 | 0,088 |
| KF50 | 0,090 (Safran/Anis) | 0,035 | 0,035 | 0,041 | 0,080 |
| KF25 | 0,089 (Corail/Carmin) | 0,035 | 0,032 | 0,040 | 0,072 |
| KF16 | 0,093 (Corail/Carmin) | 0,035 | 0,035 | 0,040 | 0,073 |
| KF10 | 0,094 (Corail/Carmin) | 0,039 | 0,035 | 0,041 | 0,075 |
| KF3 | 0,099 (Corail/Carmin) | 0,046 | 0,044 | 0,036 | 0,094 |
| KF1 | 0,100 (Corail/Carmin) | 0,044 | 0,043 | 0,034 | 0,099 |
| KF-4 | 0,097 (Corail/Carmin) | 0,035 | 0,040 | 0,027 | 0,091 |
| KF-15 | 0,095 (Corail/Carmin) | 0,044 | 0,040 | 0,039 | 0,086 |

- Territoire des **4 premiers joueurs**, pire cas sur toutes les keyframes : normal 0,123, deutan 0,095, protan 0,123, tritan 0,075.
- Territoire des **6 premiers** : normal 0,089, deutan 0,064, protan 0,081, tritan 0,042 (Lagon/Azur à l'heure dorée).
- **Médianes sur tous les joueurs et toutes les keyframes** : fort vs sol 0,164, pâle vs sol 0,092, pâle vs fort du même joueur 0,077. Les pires cas sont 0,072, 0,032 et 0,024 ; le liseré et la granulation compensent (§4.2).
- **Territoire gelé** (sous une ombre de tour, teinte tirée à 35 %) : ΔE minimal entre joueurs 0,059 ; entre le même joueur gelé et libre, ≥ 0,069.
- Planche : `docs/art/img/territoire-keyframes-cvd.png` (9 keyframes × 4 visions, fort, pâle, ombre de tour, ombres d'oiseau).

**Limites assumées** :
- 12 lavis pastel (chroma 0,10-0,15) ne peuvent pas tous être à ΔE > 0,10 : douze teintes à chroma 0,12 sur un cercle sont séparées de 0,062 au mieux. Les décalages de luminosité par joueur portent la marge à 0,09-0,10.
- En dichromatie, 12 couleurs dans un espace à deux dimensions (luminosité + axe bleu-jaune) ne peuvent pas rester au-dessus de 0,06. **Le mode daltonien n'est donc pas optionnel au-delà de 6 joueurs pour un joueur daltonien** : le lobby propose de l'activer dès qu'un joueur coche « daltonien » sur son téléphone.

### 3.5 Mode daltonien : motifs et glyphes

**Principe** : on ne change jamais les couleurs, qui sont aussi les noms dits par le narrateur. On **ajoute** une trame par joueur sur son territoire et un glyphe par joueur partout où il est identifié.

**Motifs de territoire** (`docs/art/img/mode-daltonien-motifs.png`, `jeu-daltonien-45.jpg`, `jeu-daltonien-coucher.jpg`) :
- Trames **ancrées dans le monde**, à densité écran constante : pas de 9 px, trait de 1,3 px, octaves imbriquées avec fondu (même principe que `hatchU`).
- Couleur : **le lavis du joueur assombri** (`L − 0,16`), pas l'encre. On garde ainsi un ton sur ton qui reste une couleur. Opacité 1 sur le fort, 0,55 sur le pâle.
- Les six premiers motifs sont les six plus distincts : 4 orientations de lignes, des points, un quadrillage. Les six suivants sont des variantes (quadrillage diagonal, vagues, tirets, anneaux, zigzag).
- En espace écran, la caméra ne tourne pas en lacet : « horizontal » veut dire x monde, « vertical » z monde.
- C'est la **seule** exception à R13 (pas de hachures sur le territoire). Elle est acceptable parce que c'est une option d'accessibilité.

```glsl
// q en unités de cellule (pas = 1), aa = unités de cellule par pixel. Référence complète : docs/art/prototype/main.js
float LN(float u, float lw, float aa){ return 1.0 - smoothstep(lw*0.5 - aa, lw*0.5 + aa, abs(fract(u + 0.5) - 0.5)); }
float cbCov(int k, vec2 q, float aa){ float lw = 0.15;
  if (k == 0) return LN((q.x + q.y) * 0.7071, lw, aa);                              // Corail  '/'
  if (k == 1) return LN(q.y, lw, aa);                                                 // Lagon   '—'
  if (k == 2) return 1.0 - smoothstep(0.16 - aa, 0.16 + aa, length(fract(q) - 0.5));  // Indigo  points
  if (k == 3) return LN(q.x, lw, aa);                                                 // Safran  '|'
  if (k == 4) return LN((q.x - q.y) * 0.7071, lw, aa);                              // Azur    '\'
  if (k == 5) return max(LN(q.x, lw, aa), LN(q.y, lw, aa));                           // Carmin  '+'
  if (k == 6) return max(LN((q.x+q.y)*0.7071, lw, aa), LN((q.x-q.y)*0.7071, lw, aa)); // Prune   '×'
  if (k == 7) return LN(q.y + 0.25 * sin(q.x * 3.1416), lw, aa * 1.3);                 // Anis    vagues
  if (k == 8) return LN(q.y, lw, aa) * step(fract(q.x * 0.8), 0.55);                  // Sarcelle tirets —
  if (k == 9) return 1.0 - smoothstep(0.07-aa, 0.07+aa, abs(length(fract(q*0.75)-0.5) - 0.28)); // Rose anneaux
  if (k == 10) return LN(q.x + 0.45 * abs(fract(q.y * 0.75) - 0.5) * 2.0, lw, aa * 1.3); // Lilas zigzag
  return LN(q.x, lw, aa) * step(fract(q.y * 0.8), 0.55);                              // Jade tirets |
}
float cbPattern(int k, vec2 xz, float du /*m par px*/, float px){
  float lod = log2(9.0 * px * du), l0 = floor(lod), t = lod - l0, s = exp2(l0);
  return mix(cbCov(k, xz / s, du / s), cbCov(k, xz / (2.0 * s), du / (2.0 * s)), t);
}
// usage : col = oklab2lin(vec3(L - 0.16 * cbPattern(pat, xz, du, uPx) * mix(0.55, 1.0, q), ab));
```

Coût mesuré : +0,2 ms sur la passe G-buffer (Vega 6, 1080p).

**Glyphes** (12 formes pleines, lisibles à 12 px) : croix, vagues, croissant, disque, triangle, carré, goutte, étoile, chevron, losange, anneau, éclair. Les six premiers n'ont **aucune paire obtenue par rotation**. La seule paire de ce type, carré/losange, n'apparaît qu'à partir de 10 joueurs.

| Où | Mode normal | Mode daltonien |
|---|---|---|
| HUD TV (barre de territoire, repères hors écran, classement) | glyphe à l'encre dans la pastille de couleur | idem |
| Téléphone (bandeau, écran de couleur) | glyphe dans la pastille | glyphe en grand (48 px) dans le bandeau |
| Sous-titres du narrateur | nom de couleur en variante texte | `[glyphe] Nom` |
| Au-dessus de l'oiseau | étiquette de nom au départ et aux événements (design) | jeton permanent de 18 px (papier, bord à la couleur, glyphe à l'encre) |
| Centre de l'empreinte d'ombre | rien | glyphe à l'encre à 60 % (14 px), si l'empreinte fait > 40 px à l'écran |
| Territoire | lavis | lavis + trame (motif) |
| Fanion de l'oiseau | couleur | couleur + glyphe à l'encre (gros plans seulement) |

Les glyphes sont des SVG monochromes (`currentColor`), tracés au trait de 1,5-2 px d'encre ou en aplats pleins. Un même fichier sert au DOM (HUD, téléphone) et à un atlas 12 × 64 px pour le monde 3D (sprites en `withGBuffer`, `gNormalId = 0`).

---

## 4. Rendu du territoire peint (le spectacle central)

### 4.1 Principe : un lavis sur papier

Le territoire **n'est pas un calque transparent**. C'est un pigment qui se dépose sur le sable : sa valeur suit la lumière locale, sa teinte est celle du joueur, et son bord accumule du pigment, comme une aquarelle. Il ne porte ni encre ni contour (R3, R12). Capture de référence : `jeu-kf80-zenith.jpg` pour le pastel de jour, `jeu-kf3-coucher.jpg` pour le vitrail du soir.

```glsl
// dans le matériau sol, après les 3 aplats du sol et avant les ombres portées
int o = int(owner);  vec3 lab = lin2oklab(col);  float Lg = lab.x;           // sol local (pentes et nuit comprises)
float q  = smoothstep(0.45, 0.65, strength);                                 // 0 = pâle, 1 = fort (canal G)
float Ls = 0.5 * Lg + 0.35 + uTerrDL[o];                                     // fort : suit le sol, décalage joueur
Ls = mix(Ls, min(Ls, Lg - 0.05), smoothstep(0.66, 0.80, Lg));                // de jour, un lavis n'éclaircit jamais le papier
float Lp = Lg < 0.66 ? mix(Lg, Ls, 0.45) : Lg - 0.03;                        // pâle : lavis dilué
float rim = 1.0 - smoothstep(3.0*uPx - 0.5, 3.0*uPx + 0.5, borderPx);         // liseré de pigment, 3 px
float gran = (texture2D(uNoise, xz / 7.0).a - 0.5) * 0.03 * q;               // granulation (fort seulement)
float L = mix(Lp - 0.04 * rim, Ls - 0.10 * rim, q) + gran;
vec2 ab = uPlayerDir[o] * uPaintC * uTerrCS[o] * mix(0.55, 1.0, q);          // uPlayerDir = (cos h, sin h)
col = oklab2lin(vec3(L, ab));
```

- **Jour** : le lavis est plus sombre que le sable et pastel (chroma 0,105-0,12). On obtient des traînées d'aquarelle sur papier crème, sans jamais faire sortir la médiane de L de la zone high-key (R20 mesuré : §7.7).
- **Coucher** : le sol plat tombe à L 0,57-0,59. La formule rend alors le lavis *plus clair* que le sol, avec un chroma de 0,13-0,15 : le territoire **s'allume** sur la toile grise. C'est la « couleur subjective » de Moebius, volontaire.
- **Nuit** (derrière le front, résultats) : même formule sur les sols KF-4 et KF-15. Le territoire reste la chose la plus colorée de l'écran.
- **Si design-drama est retenu** (encre continue q ∈ [0, 1]) : on écrit `q_rendu = smoothstep(0.1, 1.0, q)` dans le canal G. La formule ci-dessus s'applique telle quelle, avec un lavis qui se densifie continûment.

### 4.2 Fort et pâle : trois indices redondants

| Indice | Fort (BAS, sable « foncé ») | Pâle (HAUT) |
|---|---|---|
| Valeur et chroma | `Ls`, chroma × 1 | proche du sable, chroma × 0,55 |
| Liseré de pigment au bord | 3 px, L − 0,10 | 3 px, L − 0,04 (à peine) |
| Granulation (grain de pigment dans le papier) | ±1,5 % de L, bruit monde de 7 m | aucune |
| Trame du mode daltonien | opacité 1 | opacité 0,55 |

Pourquoi pas de hachures (contrairement à design-party §4) ? Elles couvriraient 80 % de l'écran d'une trame qui fourmille, en contradiction avec R13 et le high-key. Elles entreraient aussi en conflit avec les trames du mode daltonien, qui doivent rester libres pour identifier les joueurs. La règle de jeu « foncé bat clair » se lit directement dans la **valeur** : le fort est plus dense et plus foncé.

### 4.3 Bords et jonctions

- **Classification bilinéaire 4 taps** et domain warp de ±3 m (validé dans le doc NPR §4.6). La distance au bord `borderPx = m / fwidth(m)` est calculée hors branche.
- **Entre deux propriétaires** : chacun porte son liseré. La jonction est une couture sombre de 6 px (3 + 3), comme deux lavis mouillés qui se touchent. Aucune ligne d'encre.
- **Entre le fort et le pâle d'un même joueur** : pas de liseré, transition douce de 2 px (le `smoothstep` sur la force).
- **Grille** : une cellule doit mesurer ≥ 1,5 px dans la vue la plus large. Avec 512 colonnes sur 410 m, soit 0,8 m, et une vue de 460 m de large, soit 0,42 m/px, une cellule fait 1,9 px. OK.

### 4.4 Transitions quand le territoire change

Le canal B (âge, 10 Hz) et le canal A (ancien propriétaire) de la DataTexture pilotent tout dans le même shader, sans particule.

| Événement | Rendu | Durée |
|---|---|---|
| Peinture sur du neutre (« encre fraîche ») | Le lavis part de `L + 0,08` et `C × 1,4`, puis se pose. Le liseré passe de 6 à 3 px. | 0,4 s, ease-out |
| Pâle → fort (même joueur) | La granulation et le liseré « montent » sur 0,25 s. | 0,25 s |
| Vol de territoire (adverse → moi) | **Front mouillé** : la couleur A se dissout vers R selon un seuil de bruit monde (`noise(xz/3) < t`). Le liseré du nouveau propriétaire suit le front. Au démarrage, un bref éclaircissement (`L + 0,05`). | 0,35 s |
| Gros vol (≥ 3 % de l'arène en 3 s) | Même chose, plus un **coup de pinceau d'encre** : 3-4 traits courbes de 2 px le long de la trajectoire de l'ombre, qui s'effacent en 0,6 s. | 0,6 s |
| Tache de piqué (disque de 10 m) | Éclaboussure en 3 temps : (1) disque qui s'étend de 0 à r en 0,18 s (ease-out back) ; (2) 6-10 gouttelettes satellites de 0,5-1,5 m projetées dans l'axe du piqué ; (3) liseré épais de 6 px qui revient à 3 px en 0,5 s. Couleur de l'attaquant, pigment fort. | 0,7 s |
| Tentative pâle sur fort (« tsk ») | 3-5 petits tirets d'encre (2 × 6 px) qui jaillissent du bord de l'empreinte, et le liseré de l'empreinte clignote une fois. | 0,2 s |

L'**affichage suit la grille de la simulation**. L'écart dû au warp (≤ 1 cellule) est ramené à 0,5 cellule pendant le décompte, pour qu'aucune contestation visuelle ne soit possible.

### 4.5 Sous l'ombre d'une tour (territoire gelé)

On applique la même ombre portée que partout (§5.1), mais le mélange de teinte vers `castShadow` est limité à **35 %** sur la peinture, contre 100 % sur le sable nu. Le territoire gelé reste donc reconnaissable (ΔE ≥ 0,059 entre joueurs), simplement « à l'ombre ». **Pas de hachures** (arbitrage §9) : le gel se lit parce que c'est *de l'ombre*, et que les ombres d'oiseaux y disparaissent physiquement. Le tuto contextuel le dit une fois.

### 4.6 Le front de nuit (« Grande Ombre » ou « Nuit »)

- **Transition spatiale de palette** : le shader du sol et des objets reçoit une deuxième palette (KF-4) et un masque `night = step(frontDist(xz), 0)`. Derrière le front, tout est au crépuscule : sol ardoise `#575568`, encre `#181322`, lavis au chroma 0,13. Devant, KF1.
- **La ligne du front** n'est pas cernée d'encre. Elle porte un **liseré de dernière lumière** : 3 px de `sandLit` (KF1, corail) côté jour, avec un profil dentelé fixe par carte (±6 m, silhouette de la Falaise). Cette « lèvre dorée » qui avance est l'image la plus forte de la fin de manche.
- Derrière le front, des **étoiles** apparaissent dans le ciel (quand il est visible). Au sol, le territoire gelé par la nuit reçoit la même granulation que le fort, pour signifier que c'est « sec ».

### 4.7 Lisibilité à distance et décompte

- **Dans l'arène, la brume reste ≤ 0,15** ; au-delà, elle suit la formule normale (§6.4). Tout ce qui est jouable est net ; seul le décor hors arène s'efface à la manière de Sable.
- **Décompte / résultats** : pendant la montée verticale de la caméra, le territoire « s'illumine ». Une vague d'ouest en est (0,8 s) le fait passer à `C × 1,25` et `L + 0,04`, puis la couleur gagnante ré-imprime une fois son lavis (encre fraîche) sur toute sa surface. Pas de glow.

---

## 5. Rendu des ombres (oiseaux et tours)

### 5.1 Règles communes

- **Aplat plat, bord net** (AA de 1 px par `fwidth`), **sans contour d'encre ni hachure** (R9, R13).
- **Couleur** : mélange OKLab `L_résultat = L_dessous × L(ombre)/L(groundFlat)`. Côté teinte, `ab` va vers l'ombre à 100 % sur le sable nu (on retombe exactement sur `castShadow`) et à 35 % sur la peinture. **Jamais de multiplication par du noir** (R7).
- **Valeurs** : en journée, L(ombre de tour) vaut 0,67 à KF80 et 0,62 à KF50, soit un ratio de 0,74 et 0,70 avec le sable. Au coucher, 0,44 sur un sol à 0,59 (ratio 0,75).
- **Technique** : height shadow map en espace sol (doc NPR §4.5), 2048² sur ±(a + 60) m, soit 0,21 m/texel. Résolution identique à midi et au coucher, donc des bouts d'ombre nets même quand elles mesurent 270 m.

### 5.2 Ombres des tours

- Couleur `castShadow`, neutre (la palette `uShadowCols[0]`).
- **Au zénith** : disques ronds au pied des tours et sous les parasols. **L'après-midi** : lignes, puis éclipses des disques qui se détachent. **Au coucher** : bandes de 5 à 20 m de large, horizontales à l'écran (soleil à l'ouest, caméra vers le nord : les ombres filent vers la droite), qui rayent l'arène en « couloirs de lumière » (`jeu-kf3-coucher.jpg`).
- Les tours **hors arène** (Géantes, Falaise) projettent leurs ombres dans l'arène dès l'heure dorée : ce sont les « doigts de la nuit ». Elles passent par la même shadow map. Si l'ombre vient de plus de 220 m, on ajoute la cascade lointaine du preset High (1024², ±1 200 m).
- Pas de pénombre : une ombre de tour est un fait de jeu (gel), son bord doit être exact.

### 5.3 Ombres des oiseaux : empreinte + âme

L'ombre d'un oiseau a **deux couches** ; c'est la décision centrale de ce chapitre.

1. **L'empreinte** est la zone qui peint, exactement l'ellipse de gameplay : ombre d'une sphère de rayon r(h), de demi-axes r × r/sin(e), décalée de h·cot(e). Elle est rendue comme un **aplat teinté** (`castShadow` avec la teinte du joueur, C 0,06), à une **opacité de 0,70 (fort, BAS) ou 0,35 (pâle, HAUT)**, avec un **liseré à la couleur d'identité** : 2,5 px, **continu si fort, pointillé si pâle**. C'est la convention BD : le pointillé dit « léger, intangible ».
2. **L'âme** est la vraie silhouette de l'oiseau (ailes, cou, cavalier) projetée par la height map, à une opacité de **1,0 (BAS) ou 0,6 (HAUT)**. Elle se dessine par-dessus l'empreinte, en `max` et non en cumul. Elle rend l'ombre vivante (ailes qui battent, piqué qui replie les ailes) et, au coucher, elle s'étire en longues lames.

**Implémentation retenue (mesurée)** : l'empreinte est une **sphère-proxy invisible** de rayon r(h), placée sur l'oiseau et ajoutée aux casters de la height map avec une **hauteur factice de 0,5 m** et un flag dans le canal A. Elle n'ombre donc que le sable. La vraie silhouette de l'oiseau, plus haute, gagne le depth test là où elle existe, et les ombres de tours, plus hautes encore, effacent les empreintes : l'ombre de l'oiseau disparaît dans l'ombre d'une tour, comme le veut la règle. Coût : **+0,04 ms** sur la shadow map et **+0,25 ms** sur le G-buffer. L'alternative par boucle d'ellipses dans le shader du sol coûtait +2,5 ms pour 6 oiseaux : rejetée.

```glsl
// caster : vH = (uFakeH >= 0.0) ? uFakeH : wp.y ; frag = vec4(vH + 100.0, uId, uStrength, uFakeH >= 0.0 ? 2.0 : 1.0)
// sol :
shadow = coverage * (sh.y > 19.5 ? sh.z : 1.0);                        // opacité = force écrite par le caster
float edgePx = (sh.x - 0.5) / fs;                                     // distance au bord (px), côté intérieur
float dash = sh.z > 0.5 ? 1.0 : step(0.5, fract((dot(xz, uShDir) * 0.35 + dot(xz, uShPerp)) / 1.8)); // pointillé pâle, ~1,8 m
float rimFp = (1.0 - smoothstep(2.5*uPx - 0.5, 2.5*uPx + 0.5, edgePx)) * step(0.0, edgePx) * step(1.5, gShadowType) * dash;
col = mix(col, uPlayer[id], rimFp * (1.0 - towerShadow));             // liseré couleur joueur (pas encre)
```

**Pâle et forte en un coup d'œil** :

| | Ombre forte (BAS, 4 m) | Ombre pâle (HAUT, 16 m) |
|---|---|---|
| Taille (zénith) | r 5 m, collée à l'oiseau | r 12 m, décalée de 0,6 m |
| Empreinte | opacité 0,70 | opacité 0,35 |
| Âme (silhouette) | opacité 1,0, nette, presque aussi grande que l'empreinte | opacité 0,6, petite silhouette dans une grande tache claire |
| Liseré couleur joueur | continu, 2,5 px | pointillé (tirets de ~1,8 m) |
| Au coucher (e = 5°) | ruban de 115 m | ruban de 275 m, à 183 m de l'oiseau |

- **Fil d'ombre** (design, e < 32°) : pointillé à la **variante texte** de la couleur du joueur, points de 2 px tous les 8 px, opacité 0,8, de l'oiseau au centre de l'empreinte. Il s'estompe avec la brume. Ce n'est pas un trait d'encre, pour ne pas le confondre avec le décor.
- **Oiseau caché** (empreinte couverte à ≥ 90 % par une tour) : le corps et la couleur de l'oiseau se mélangent à 55 % vers `castShadow` (il est « dans l'ombre »), et son étiquette passe à 40 %.
- **Micro-ombres des cailloux** (R15) : leur longueur est plafonnée à **4 fois la taille du caillou**, et non 8 comme dans le prototype NPR. À moins de 10°, leur opacité passe de 0,7 à 0,5. Constaté : à 8×, avec des ombres orientées vers la caméra, 2 200 tirets parallèles donnent un effet « pluie ».

### 5.4 Comment elles s'allongent magnifiquement

- L'élongation est **physique** (1/sin e). On ne l'exagère pas, et on ne la floute jamais : un bord net à 270 m est le spectacle.
- Le plafond d'élévation des ombres (design-party : 5°, design-drama : 9°) évite l'explosion ; l'horloge de palette (§2.4) donne pourtant le coucher complet.
- La caméra doit **cadrer les centres d'empreinte** (design-drama §14.2) : les ombres sont le sujet, les oiseaux leurs pinceaux.
- Au coucher, on laisse les **longues diagonales** et les **bandes horizontales** composer l'image : le cadre, calme au zénith (horizontales), se tend (diagonales).

---

## 6. Ciel, soleil, horizon, brume, dunes, tours, oiseau, FX

### 6.1 Ciel

- **Où il se voit** : écran titre, lobby (plan bas), transitions de manche, plan du vainqueur, résultats de nuit et moments où la caméra s'abaisse (coucher, piqué spectaculaire). **En jeu, avec un tangage de 42-58°, le ciel est hors champ.** Avec un FOV vertical de 40°, l'horizon n'entre qu'en dessous de 20° de tangage. Le haut du cadre reprend la teinte de l'horizon grâce à la brume lointaine (§2.6).
- **Dôme analytique dessiné en dernier** (doc NPR §4.8) :
  - dégradé à 3 stops (`skyHorizon` → `skyMid` à 60 % → `skyTop`) ;
  - 2 bandes de strates ondulées (sinus en azimut, pas de bruit), avec un trait d'encre de 1 px à 50 % sur leur bord haut ;
  - 1 à 4 cumulus **plats festonnés à base coupée**, en deux tons : dessus `mix(skyHorizon, blanc, 0,35)`, dessous `mix(castShadow, skyHorizon, 0,55)`, contour d'encre de 1 px à 60 %. Ils dérivent à 0,3°/s.
- **Nuit (KF-15)** : 80-140 étoiles, points de 1-2 px et quelques croix à 4 branches de 5 px, toutes à l'encre claire `#E3F0FE` à 80 %. Pas de scintillement animé. Lune = disque `sun` avec un croissant d'ombre `skyMid`.

### 6.2 Soleil

- Disque plat de rayon 0,05 rad (≈ 3°, volontairement grand), à la couleur `sun` de la keyframe, cerclé d'encre à 50 % sur 1 px, avec **un seul** halo plat (rayon × 2, 35 %). Ni bloom, ni flare, ni god rays (R18).
- Au coucher, le disque **touche la Falaise** à l'élévation de gameplay `E_end`. La Falaise, rendue en profondeur, le coupe proprement.
- Dans le HUD, le soleil est un disque `#FFF2C3` cerclé d'encre qui parcourt l'arc du cadran.

### 6.3 Horizon

Trois plans en strates, du plus proche au plus lointain :
1. **Dunes hors arène** (400-900 m) : relief à trois aplats (`groundFlat` / `sandLit` / `sandShade`), lignes de crête d'encre fines. Au coucher, ce sont elles qui rougeoient en corail.
2. **Mesas et Géantes** (1-2 km) : aplats `mix(sandShade, haze, 0,5)` et `mix(castShadow, haze, 0,4)`, silhouette seule (traits internes coupés par R4), petits tirets verticaux de strates au sommet.
3. **La Falaise** (≈ 1,7 km, à l'ouest) : aplat `mix(castShadow, haze, 0,3)` avec 2-3 bandes horizontales de strates. C'est la seule masse sombre de l'horizon, et c'est derrière elle que le soleil se couche.

Composition : horizon dans le tiers bas (contre-plongée) ou haut (plongée), **jamais au centre** ; FOV 35-45° ; 50-70 % du cadre en aplat (R25).

### 6.4 Brume

```glsl
float fogAt(float d){ return 1.0 - exp(-max(d - uFogStart, 0.0) * uFogK); }   // uFogK = 0.0011
// uFogStart = distanceCaméra(bord lointain de l'arène) - 148 m  -> brume ≤ 0,15 dans l'arène (148 = -ln(0,85)/0,0011)
col = mix(col, mix(uHaze, uSkyHorizon, smoothstep(0.5, 0.9, fog)), fog);
```

Même fonction dans l'`InkEffect`, pour le fondu des lignes à la manière de Sable (R4) : opacité × `1 − smoothstep(0,35 ; 0,85 ; fog)`, traits internes coupés au-delà de fog 0,5, hachures entre 0,25 et 0,4.

### 6.5 Sol et dunes

- **Arène = toile plate.** Ondulations ≤ 0,6 m sans bascule d'aplat : toute l'arène est en `groundFlat`, à l'exception de 2 à 5 rides de vent près de la caméra (encre 35 %, 0,9 px, à moins de 160 m). Validé en capture : les pentes éclairées corail des dunes **se confondaient avec un territoire orange** à 10° et 3,5° (captures NPR v3). Dans l'arène plate, le problème disparaît.
- **Hors arène** (au-delà de 1,15 × le demi-axe) : dunes de 4-8 m d'amplitude, trois aplats relatifs au sol plat (doc NPR §4.3), lignes de crête d'encre de 1 px à 55 %.
- **Mur de tempête** (le « Simoun ») : rideau de 12 m au bord de l'ellipse. Aplat `mix(sandShade, haze, 0,3)` à 70 %, parcouru de **traits d'encre horizontaux animés** (les seules hachures animées du jeu) : lignes de 1 px à 40 %, qui défilent tangentiellement à 6 m/s. Côté arène, la base est festonnée comme un cumulus.
- **Cailloux et tirets** : 150-300 marques à l'écran (R15), plus denses vers le bord de l'arène et au-delà, **nulles sous les oiseaux** (zones focales).
- **Variété** (par carte, optionnelle) : une cuvette de sol craquelé (réseau polygonal d'encre à 30 %, 1 px) hors des zones de spawn.

### 6.6 Tours : 8 archétypes

Règles communes :
- **Profil de révolution** (lathe), silhouette lisible d'en haut ; conçue pour que **l'ombre allongée reste reconnaissable**.
- **Entre 0 et 20 m** (hauteur de vol), rien de plus large que r = 4 m, sauf pour le rôle d'obstacle-mur (design-drama §2.4). Les oiseaux passent sous les disques.
- **Rendu** : deux tons (§2.6), terminateur net ; **hachures verticales** sur le flanc à l'ombre (`hatchU`, couture `atan` tournée vers le soleil), croisées à 90° dans les creux (AO bakée < 0,35) ; **fenêtres = trous d'encre** (ellipses `ink`, 0,8 × 1,4 m) ; usure : jupe de sable `sandLit` au pied (0,5-1,5 m) et 2-3 fissures d'encre de 1 px.
- Les **antennes et haubans** (< 1,5 px à l'écran) ont une coque ou sont épaissis, sinon ils scintillent.
- Les **fanions** des tours sont en tons neutres (crème, ocre), **jamais** dans une couleur de joueur.

| Archétype | Profil (z en m : rayon r en m) | Couleurs | Signature d'ombre | Rôle |
|---|---|---|---|---|
| **1. Le Parasol** | fût 0→24-26 : r 3,5 ; disque 24-28 : r 13-16 (bord biseauté) ; lanterne 28-31 : r 2 | fût crème, disque ocre, dessous du disque ombré hachuré | Midi : disque rond, refuge. Coucher : éclipse elliptique qui file vers l'est, reliée au pied par une ligne fine | refuges mobiles |
| **2. L'Aiguille** (fuseau) | fût 0→55 : r 3→2 (conique) ; bulbe à 46-55 : r 6-9 ; flèche 55→62 : r 0,8→0,2 | terracotta, bulbe crème, flèche encre | Coucher : longue ligne fine terminée par une olive | couloirs, « code-barres » |
| **3. La Pile** | fût 0→36 : r 3 ; disques 28-30 : r 10 et 33-36 : r 13 ; petit dôme turquoise r 3 au sommet | crème et ocre alternés, dôme turquoise | Double éclipse emboîtée | variété d'ombres |
| **4. La Colonne à dôme** | fût 0→30 : r 5-9 (cannelures en lignes d'encre) ; dôme hémisphérique r = fût | ocre, dôme **cobalt** | Midi : cercle. Coucher : bande épaisse terminée en demi-lune | obstacle massif, bord d'arène |
| **5. Le Bulbe** (oignon) | fût étranglé 0→20 : r 3 ; oignon 20-42 : r max 10 à 30 m, pointe à 42 | crème, oignon terracotta à côtes d'encre (6 méridiens) | Ellipse épaisse « poire » | grande tache d'ombre |
| **6. La Géante** (hors arène) | fût 0→85-105 : r 10→6 ; bulbe r 10-12 ; haubans | aplats brumeux (plan 2), silhouette seule | Entre dans l'arène à l'heure dorée : « doigts de la nuit » | minuterie visuelle |
| **7. La Cathédrale** (centrale) | fût 0→110 : r 4 ; disques étagés à 40 (r 12), 65 (r 16), 90 (r 20) ; flèche | crème, disques ocre/terracotta/turquoise | Coucher : trois éclipses en chapelet qui coupent l'arène en deux | carte « Cathédrale » |
| **8. Le Gnomon** (cadran) | mât incliné de 12° vers le sud, 0→70 : r 3 → 1,5 ; anneau r 6 à 50 m | terracotta, anneau cobalt | Aiguille de cadran solaire qui tourne pendant la manche, avec l'anneau en ellipse-cible | carte « Le Cadran », dernière manche |

- **Variante « couronne ajourée »** (optionnelle, pour un Parasol) : disque percé de 5-7 trous de 2 m, qui projettent des **taches de lumière** dans l'ombre. C'est très Moebius, mais ça implique des trous dans l'ombre analytique de la simulation (cellules peignables). À valider avec le game design avant de modéliser.
- **Assets** : les tours se **génèrent procéduralement** (lathe à partir des profils ci-dessus, UV2 pour la direction des hachures, AO par sommet). C'est plus fidèle au style que des modèles importés, et ce ne sont pas des « primitives » au sens du brief.

### 6.7 Oiseau et cavalier

**Silhouette** (vue du dessus, c'est elle qui compte) :
- envergure 10-12 m ; corps 4,5 m ; ailes **longues, étroites et rigides** (allongement ≈ 8), bout d'aile effilé, légère flèche ;
- tête longue au bec droit (1,8 m), à la manière d'un ptérosaure, avec une crête arrière courte ;
- queue en éventail étroit.
- À l'écran, l'oiseau mesure **≥ 38 px d'envergure** à 1080p (design) ; le rendu le grossit de +10 % en HAUT.

**Rendu** :
- **Blanc os** `#EDEDDF` pour tous, en deux tons (§2.6), terminateur net.
- 3 à 6 plis internes au maximum (attache des ailes, cou), silhouette cernée à 2,5 px (coque inversée de 1,2 px + post-process).
- **Ventre hachuré** à l'ombre, le long de la corde (opacité 0,45).
- **Œil** : point d'encre, plus un reflet papier de 1 px en gros plan seulement.

**Où va la couleur du joueur** (≈ 12-15 % de la surface visible du dessus) :

| Élément | Taille | Visible |
|---|---|---|
| **Bande d'aile** (dessus, en travers de chaque aile) | 14 % de la demi-envergure, entre 55 et 70 % depuis l'emplanture, avec son propre ID (donc cernée) | toujours : c'est **l'identifiant principal en jeu** |
| **Cape du cavalier** | 0,9 × 1,4 m, flottante (tissu simplifié, 2 os) | plans moyens et gros plans |
| **Tapis de selle** | bande sous le cavalier, dépasse de chaque côté | toujours |
| **Fanion** | mât de 2 m dans le dos du cavalier, flamme fourchue de 1,8 × 0,35 m ; glyphe en mode daltonien | gros plans, écran titre |
| **Ruban de traînée** | 20 m, 0,35 m de large, qui s'effile ; couleur d'identité à 85 % | toujours, en vol ; coupé au piqué |

**Cavalier** : minuscule silhouette assise, cuir brun ocre `#8A5A3C` hachuré, visage invisible (capuche). La couleur du joueur n'est que sur la cape et la selle, jamais sur le corps.

**États** :

| État | Rendu |
|---|---|
| **BAS** | Traînée de sable (bouffées, §6.8), ailes à plat, battements lents (0,6 Hz). |
| **HAUT** | Deux filets d'air blanc cassé en bout d'ailes, taille × 1,10, battements rares. |
| **Montée** | Battements amples (2 Hz), cou tendu, poussière soulevée au départ. |
| **Piqué** | Ailes repliées en flèche, lignes de vitesse (§6.8), cape plaquée. |
| **Virage** | Inclinaison jusqu'à 50°, l'aile intérieure plus basse. Le terminateur net fait naturellement « tourner » la lumière. |
| **Décroché** | Roulé-boulé de 1,5 s, 6-10 plumes blanches cernées qui tournoient, étoiles d'encre (3 croix de 6 px) autour de la tête. |
| **Invulnérable** | Plumes hérissées : 8 petits traits d'encre radiaux autour du corps, qui clignotent à 4 Hz (on ne fait pas clignoter l'oiseau entier). |
| **Caché** | Mélange à 55 % vers `castShadow`, étiquette à 40 %. |
| **Couronne** (meneur) | Petite couronne à 3 pointes, 2,5 m, remplie de `#FFF2C3` et cernée d'encre à 1,5 px, qui flotte 3 m au-dessus du cavalier (balancement de 0,5 Hz). Visible à toutes les distances : taille écran ≥ 14 px. |

### 6.8 Particules, traînées, impacts : catalogue « encre »

**Règles** :
- **Aucun mélange additif, aucun glow, aucune HDR.**
- Tous les FX sont des **formes plates** (SDF dans le fragment, avec `fwidth` pour l'AA) et des **traits d'encre**.
- Ils disparaissent en **rétrécissant** ou par **dissolution en trame** (screen-door sur bruit monde) plutôt que par un fondu alpha, qui griserait l'aplat.
- Ils sont transparents dans la passe MRT avec `gNormalId = vec4(0)` (pas de contour post). Ceux qui ont besoin d'un contour le dessinent eux-mêmes (SDF).
- Instanciés : moins de 150 draw calls au total.

| FX | Déclencheur | Forme | Couleurs | Durée · nombre |
|---|---|---|---|---|
| Bouffées de sable | oiseau BAS, collisions | disque festonné (4-6 lobes), contour d'encre 1 px à 40 % | `mix(groundFlat, sandShade, 0,5)` | 0,8 s ; 3-5/s par oiseau BAS |
| Filets d'air | oiseau HAUT | 2 traits courbes de 1,5 px depuis les bouts d'ailes, longueur 6-10 m | `#FFFCF0` à 80 % | 0,3 s, continus |
| Ruban de traînée | vol | ruban effilé, 20 m | couleur d'identité 85 % | persistant |
| Lignes de vitesse | piqué | 5-7 traits d'encre de 1 px qui convergent vers l'oiseau, longueur 8-15 m | encre 60 % | durée du piqué |
| Étoile d'impact | touche de piqué | éclat de 10-14 rayons d'encre (2 px, 1,5-4 m), centre vide | encre | 0,25 s, rétrécit |
| Flash « planche » | touche de piqué, et un seul changement de meneur par manche | **2 frames** où la couleur passe à 70 % vers le papier `#F7F0E3` et où les traits restent : l'image redevient un crayonné. Fait dans l'`InkEffect` (`uFlash`). | — | 33 ms ; au plus 1 toutes les 2 s ; désactivé par « Réduire les flashs » |
| Plumes | décroché, collisions | forme de plume (SDF), blanc os, contour d'encre de 1 px | `#EDEDDF` | 1,2 s ; 6-10 |
| Tache d'encre | tache de piqué | voir §4.4 (dans le shader du sol) | couleur de l'attaquant | 0,7 s |
| Étincelles « tsk » | ombre pâle sur du fort | 3-5 tirets d'encre | encre | 0,2 s |
| Coup de pinceau | gros vol | 3-4 traits courbes d'encre le long de la trajectoire de l'ombre | encre 70 % | 0,6 s |
| Couronne gagnée | changement de meneur | anneau d'encre qui se contracte sur la couronne, et 6 rayons courts | encre, puis `#FFF2C3` | 0,5 s |
| Front de nuit | fin de manche | lèvre `sandLit` de 3 px et poussière de bouffées violettes le long du front | KF-4 | 5-12 s |
| Victoire | résultats | **gloire de BD** : 24 rayons d'encre de 1 px à 35 % derrière l'oiseau gagnant | encre | boucle lente (rotation de 6°/s) |

Pas de fumée volumétrique, pas d'étincelles lumineuses, pas de sprites photo.

---

## 7. Pipeline de rendu définitif

### 7.1 Ordre des passes (une frame)

```
CPU (sim 30 Hz interpolée -> transforms)       ─ palette.update(paletteElev) OKLab -> uniforms partagés (§2.5)
                                               ─ territoire : upload DataTexture si sale (≤ 20 Hz)
                                               ─ scene.updateMatrixWorld()
1. HeightShadowMap (RT 2048² HalfFloat)        casters : tours, Géantes, oiseaux (âme, anim partagée), sphères-empreintes
                                               (hauteur factice 0,5 m, flag A=2), gros props          0,1-0,35 ms
   (+ cascade 1024² ±1 200 m si High et paletteElev < 16°)
2. GBufferPass (MRT)                           opaques NPR : sol (aplats, territoire, ombres, rides, crêtes, cailloux)
   gColor sRGB8 | gNormalId RGBA8 | depth F32  -> tours -> oiseaux + coques -> cavaliers/props -> CIEL (renderOrder 1000)
                                               -> transparents (micro-ombres, cailloux, FX, rubans ; gNormalId = 0)   2,5-3,5 ms
3. EffectPass(InkEffect)                       contours (1/z, normales > 40°, IDs) + fondu brume + tremblé monde
                                               + grain papier 4 % + vignette ≤ 5 % + flash « planche »                1,3-1,7 ms
4. EffectPass(SMAA)   (medium/high)                                                                                  2,3-2,8 ms
5. HUD DOM/CSS par-dessus le canvas (glyphes SVG, cases BD)                                                          ~0 GPU
```

### 7.2 Matériau ou post-process ?

| Élément | Où | Détail |
|---|---|---|
| Aplats 2 tons, terminateur, teinte de lumière | matériau | uniforms de palette (§2.6) |
| Sol : aplat plat, 3 aplats hors arène, rides, crêtes | matériau sol | 3 aplats relatifs au plat (doc NPR §4.3) |
| Territoire (lavis, liseré, granulation, transitions, motifs daltoniens) | matériau sol | §4, §3.5 |
| Ombres portées (tours, âmes, empreintes, liseré d'empreinte) | matériau (lecture de la height map) | §5 |
| Front de nuit (deuxième palette, lèvre de lumière) | matériau (sol, tours, oiseaux) | §4.6 |
| Hachures, pointillés | matériau, espace objet/UV2 | jamais écran |
| Brume | matériau et encre | même `fogAt` (§6.4) |
| Ciel, soleil, strates, cumulus, étoiles | matériau du dôme, dessiné en dernier | analytique |
| Contours d'encre | post (`InkEffect`) | la seule vue globale |
| Grain papier, vignette, flash « planche » | post (même effet) | pas de passe en plus |
| AA | post (SMAA) | FXAA floute les hachures |
| HUD, étiquettes, glyphes hors monde | DOM | jamais encrés par le post |

### 7.3 Paramètres par défaut (1080p, preset High)

| Paramètre | Valeur | Source |
|---|---|---|
| Silhouette `uThick` | 1,5 (≈ 2 px) ; oiseau : + coque de 1,2 px, soit ≈ 2,5 px | R2, NPR §4.1-4.2 |
| Seuils de contour | `uDepthK` 0,025 · `uNormalK` 0,23 (pli > 40°) | NPR |
| Plage d'épaisseur | `uThickRange` (120 m, 900 m) : épaisseur × 1 → 0,5 | R2 |
| Tremblé | 0,7 px, bruit monde (1/37, 1/53) ; boil à 8 fps sur l'écran titre seulement | R5 |
| Papier | multiply 4 %, texture de bruit 256², statique | R21 |
| Vignette | ≤ 5 % (`1 − 0,1·r²`) | R22 |
| Terminateur objets | N·L = 0,05, AA `fwidth` | R6 |
| Aplats du sol hors arène | seuils de pente ±0,06 | NPR §4.3 |
| Brume | k 0,0011, `uFogStart` telle que la brume de l'arène reste ≤ 0,15 | §6.4 |
| Hachures | pas de 6 px, trait de 1 px, opacité selon la keyframe (0,20-0,42), croisées si AO < 0,35 | R12, §2.2 |
| Lavis | `paintC` par keyframe, `dL` et `cs` par joueur, liseré de 3 px, granulation de 3 % | §3.3, §4.1 |
| Empreinte d'oiseau | opacité 0,70 / 0,35 ; âme 1,0 / 0,6 ; liseré de 2,5 px (pointillé de 1,8 m si pâle) | §5.3 |
| Ombre teintée | `oklch(L_castShadow, 0.06, h_joueur)` | R9 |
| Cailloux | 1 500-2 200 instances ; ombre ≤ 4 × la taille ; 150-300 marques à l'écran | §5.3 |
| Height shadow map | 2048², demi-taille = a + 60 m, biais sol 0,2 · murs `0,6 + 1,5(1 − |N·L|)` · oiseaux 0,8 | NPR §4.5 |
| Composer | `multisampling 0`, `UnsignedByteType`, `depthBuffer false`, `renderPass` en `useCallback` | N1-N4 |
| Canvas | `flat`, `antialias: false`, `stencil: false`, `dpr` du preset, FOV 40° | NPR §5 |

### 7.4 Presets qualité

| | **Low** | **Medium** | **High** |
|---|---|---|---|
| Rendu (dpr plafonné) | 720p | 900p | 1080p (jamais plus, même en 4K) |
| AA | aucun | SMAA medium | SMAA high |
| Height shadow map | 1024² | 2048² | 2048² + cascade lointaine au coucher |
| Hachures, pointillé, granulation du lavis | non / non / non | oui | oui |
| Liseré de lavis, encre fraîche, transitions de territoire | oui | oui | oui |
| Empreintes + liserés d'ombre, fil d'ombre | **oui** (gameplay) | oui | oui |
| Motifs et glyphes du mode daltonien | **oui** (accessibilité) | oui | oui |
| Cailloux (micro-ombres) | 800 (sans ombre) | 1 500 | 2 200 |
| Rides de vent, crêtes | crêtes seules | oui | oui |
| Tremblé / papier | non / non | oui / oui | oui / oui |
| `uThick` | 1,0 | 1,25 | 1,5 |
| Coques des oiseaux | oui | oui | oui |
| Cumulus | 1 | 3 | 4 |
| Segments du sol | 128² | 200² | 200² |
| FX (plafond de particules) | 300 | 800 | 1 500 |
| Budget GPU cible (Vega 6) | ≤ 5 ms | ≤ 8 ms | ≤ 10 ms |

Bascule automatique : `PerformanceMonitor`, qui descend d'un cran si la frame moyenne dépasse 15 ms sur 2 s, **seulement entre deux manches**. Le preset par défaut est détecté au premier lancement par un banc de 2 s sur l'écran titre.

### 7.5 Budget de performance

- **Mesuré** sur le prototype patché (Vega 6, 1080p High, machine chargée à ~10 de load) : shadow map 0,13 ms, G-buffer 3,1 ms, encre 1,6 ms, SMAA 2,4 ms, **total ≈ 7,2 ms**.
- **Écarts mesurés** :

| Ajout | Coût |
|---|---|
| Empreintes en sphères-proxy | +0,25 ms (G-buffer) et +0,04 ms (shadow map) |
| Motifs daltoniens | +0,2 ms |
| Empreintes en boucle d'ellipses | +2,5 ms (**rejeté**) |

- **Cible du jeu complet** : shadow 0,3 + G-buffer 4,0 (12 oiseaux, 10 tours, FX) + encre 1,5 + SMAA 2,7 + réserve 1,5 ≈ **10 ms GPU**. **CPU ≤ 6 ms** par frame, rendu et simulation compris.
- **Règles** :
  - ≤ 2 passes plein écran ;
  - aucun bruit ALU par pixel (textures) ;
  - dérivées hors branches ;
  - ciel dessiné en dernier ;
  - matériaux et uniforms partagés ;
  - pas de HalfFloat dans le composer ;
  - < 150 draw calls ;
  - aucune boucle par oiseau dans le shader du sol.

### 7.6 Organisation du code

Chunks GLSL communs dans `src/render/npr/glsl/`, assemblés en `ShaderMaterial` maison :

| Chunk | Contenu |
|---|---|
| `common` | hash, IGN, `lineCov`, `hatchU`, `stipple` |
| `oklab` | conversions OKLab |
| `palette` | déclaration des uniforms de palette |
| `shadow` | `sampleShadow` + `gShadowType` |
| `fog` | `fogAt` |
| `territory` | classification bilinéaire + lavis + `cbPattern` |
| `mrt` | `layout(location = 1) out gNormalId` |
| `flight` | battement d'ailes, partagé entre le matériau visible et le caster |

Un module TS `palette.ts` lit `docs/art/palette.json` (copié dans `src/`), implémente `paletteElev` et l'interpolation OKLab, et pousse les uniforms.

### 7.7 QA visuelle automatisée

**Prototype de référence** : `docs/art/prototype/`, le prototype NPR patché avec cette bible (palette, territoire, empreintes, teinte de lumière, motifs daltoniens).

```bash
cd docs/art/prototype && pnpm i && python3 -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/?sun=3.5&az=180&view=game
#   az=180 : soleil à l'ouest (disposition du jeu)
#   cb=1   : motifs daltoniens
#   fp=loop|0 : empreinte en boucle (rejetée) ou absente
#   dunes=1 : dunes dans l'arène (contre-exemple)
#   np=6   : 6 territoires
node shot.mjs out.png "sun=10&az=182&view=game" 1   # capture + timings GPU par passe (PORT=… pour changer de port)
```

1. **Captures Playwright** à paletteElev 80 / 50 / 25 / 16 / 10 / 3,5 / 1 / −4 / −15, dans la vue de jeu et une vue basse, avec un état de partie figé (seed).
2. **High-key (R20)** : `node docs/art/tools/highkey.mjs capture.png` mesure la part de L > 0,6, la médiane, le 10ᵉ centile et la part de L < 0,3.
   - Mesures sur le prototype patché : KF80 99,6 % / 0,887 ; KF50 99,5 % / 0,849 ; KF25 99,3 % / 0,814 ; KF16 97,8 % / 0,792 ; KF10 89,6 % / 0,746 ; KF3 82,2 % / 0,642 ; KF1 71,7 % / 0,614.
   - **Seuils du test** :
     - de jour : L > 0,6 sur ≥ 60 % des pixels et médiane ≥ 0,70 ;
     - toujours : médiane ≤ 0,90 (pas délavé) et moins de 3 % des pixels sous L 0,3 ;
     - au coucher : médiane ≥ 0,50.
3. **Palette** : `node docs/art/tools/final.mjs` recalcule tous les ΔE du §3.4. Il sort en code d'erreur si l'une des trois portes échoue :
   - `first6` : le minimum des 6 premiers passe sous 0,15 (identité, quatre visions) ;
   - `terrNormal` : le lavis passe sous 0,085 en vision normale ;
   - `midChroma` : une keyframe fait de la boue (§2.3).

   État actuel : les trois portes passent.
4. **Revue humaine** : chaque capture est regardée. Liste de contrôle :
   - pas de noir ;
   - pas de hachures sur le sol, le ciel ou les ombres ;
   - pas de contour sur le territoire ou les ombres ;
   - pas d'effet « pluie » ;
   - ciel à 3 stops sans banding.

---

## 8. Guide UI

### 8.1 Typographie (OFL, via `@fontsource`, auto-hébergée)

| Usage | Police | Tailles TV (1080p) | Tailles téléphone (CSS px) |
|---|---|---|---|
| Titres, noms d'écran, en-têtes de case | **Julius Sans One** 400, capitales, interlettrage +0,06 em | 48-72 px (titre), 30-36 px (en-têtes) | 26-32 |
| Texte UI, boutons, sous-titres et répliques du narrateur, étiquettes | **Patrick Hand SC** 400 | 22-26 px (UI), **30 px** (sous-titres) | 18-22 (boutons 22) |
| **Chiffres** (%, compte à rebours, scores, timer) | **Averia Sans Libre** 700 | 28-40 px (barre), 96-140 px (5-4-3-2-1) | 20-28 |
| Alternative manuscrite | Architects Daughter | — | — |

- **Ne jamais composer de chiffres en Patrick Hand SC** : ses 4, 7 et 9 sont trop idiosyncratiques à distance. Julius Sans One est trop fin pour les chiffres en HUD (test : `docs/art/img/typo-chiffres-hud.png`).
- **Aucune des trois polices n'a de chiffres tabulaires.** Mesuré avec `tabular-nums` : en Averia 40 px, « 1111 » fait 71 px et « 0000 » en fait 95. Tout chiffre qui change (%, compte à rebours) se compose dans une boîte de largeur fixe par chiffre, centrée.
- **Logo « OMBRES »** : logotype dessiné en SVG. Capitales larges d'après Julius Sans One, épaissies à 3 px d'encre, remplissage papier. Chaque lettre projette une **ombre portée plate** `castShadow` qui s'allonge et tourne avec un soleil fictif en 12 s. L'ombre reste nette, sans flou. Boil du trait à 8 fps autorisé sur l'écran titre.
- Accents vérifiés en rendu (É À Ç È Ê Ô Û Œ ’) : les trois polices les couvrent.

### 8.2 Panneaux (« cases » de BD)

```css
:root { --paper:#F7F0E3; --paper-2:#EFE4CF; --ink:#2B1D23; --ink-60:rgb(43 29 35 / .6);
        --drop:rgb(161 142 161 / .6); --sun:#FFF2C3; --radius:3px; }
.case { background:var(--paper); border:2px solid var(--ink); border-radius:var(--radius);
        box-shadow:5px 5px 0 var(--drop); }                 /* ombre décalée, AUCUN flou */
.case--titre { border-width:3px; box-shadow:7px 7px 0 var(--drop); }
.recitatif { background:var(--paper); border:2px solid var(--ink); padding:.35em .8em; }   /* narrateur */
```

- **Bord « tremblé »** : les grands panneaux (écran titre, résultats, pause) utilisent une bordure SVG pré-tracée à la main (path légèrement irrégulier, 1 fichier par format). Les petits restent en CSS pur. **Pas de filtre SVG animé** (coûteux).
- **Interdits** : glassmorphism, `backdrop-filter`, ombres floues, dégradés sur les boutons, rayons ≥ 8 px.
- **Récitatif du narrateur** : cartouche rectangulaire en bas au centre, 1 à 2 lignes de Patrick Hand SC à 30 px, 3 s. Le nom de couleur y est écrit en variante texte (§3.1), précédé du glyphe en mode daltonien.

### 8.3 Couleurs de l'UI

- L'UI est **papier + encre**. Une couleur de joueur **n'apparaît que pour désigner ce joueur** (pastille, segment de barre, bandeau de téléphone).
- **Alertes** (déconnexion, pause, erreurs) : **inversion** encre/papier (texte papier sur fond encre). Jamais du rouge, qui se confondrait avec Carmin ou Corail.
- **Accent neutre** : `--sun` `#FFF2C3` pour le cadran solaire, la couronne et le focus clavier (contour de 3 px encre + fond `--sun`).
- **Désactivé** : encre à 35 %, et le bouton perd son ombre.

### 8.4 Iconographie

- Grille de 24 px, **trait d'encre de 1,5-2 px**, extrémités rondes, 2 tons au maximum (papier + encre, ou couleur du joueur). Les icônes pleines sont réservées aux glyphes de joueurs.
- **Jeu minimal** : pause, reprendre, réglages (engrenage à 6 dents), volume (général, musique, effets, voix), qualité (3 barres), plein écran, langue (FR/EN en lettres), daltonien (œil + trame), contrôles (manette/téléphone), bot (petit oiseau à vis), ajouter/retirer, couronne, soleil, lune, plume (aide au vol), QR, reconnexion (flèche en boucle), vibration, casque (son), crédits (plume d'écriture), revanche (flèches croisées), quitter.
- **Repères hors écran** : pointe de flèche d'encre de 28 px, remplie de la couleur du joueur, avec le glyphe du joueur en papier dedans. Elle est collée au bord du cadre avec une marge de 3 %.

### 8.5 HUD de l'écran PC

Zone de sécurité : 4 % sur chaque bord (surbalayage des téléviseurs).

| Élément | Position · taille (1080p) | Rendu |
|---|---|---|
| **Cadran solaire** (le seul chronomètre) | haut gauche, 180 × 180 px | Case papier contenant un quart d'arc à l'encre, du zénith à la Falaise, et un disque soleil `#FFF2C3` cerclé d'encre. Le fond de l'arc prend la couleur `skyTop` → `skyHorizon` de la keyframe courante, comme une vignette de ciel. Phases en graduations. Segment de nuit hachuré (des hachures d'UI, pas du monde). Nom de la phase en Patrick Hand SC 22 px pendant 3 s. |
| **Barre de territoire** | haut centre, 46 % de la largeur, 36 px de haut | Case, segments triés par rang aux couleurs d'identité, séparés par un trait d'encre de 2 px ; % en Averia 26 px dans les segments ≥ 4 %. Glyphe et couronne au-dessus du meneur. Animations de 300 ms. |
| **Compte à rebours final** | centre haut, sous la barre | Averia 120 px, encre, dans un disque papier. Il « tamponne » (scale 1,15 → 1, 120 ms) à chaque seconde. |
| **Sous-titres du narrateur** | bas centre | Récitatif (§8.2). |
| **Étiquettes monde** | sous chaque oiseau | Nom en Patrick Hand SC 18 px à l'encre, sur une pastille papier, avec la pastille de couleur et le glyphe à gauche. Affichées au départ et aux événements (design). |
| **« +2,4 % »** | au-dessus du point d'événement | Averia 28 px, couleur texte du joueur. Monte de 40 px en 0,9 s en rétrécissant. |

### 8.6 Animations d'UI

- Entrée des panneaux : glissement de 12 px et fondu, 220 ms, `cubic-bezier(.2,.8,.2,1)`. Sortie : 160 ms.
- **Bouton pressé** : l'ombre disparaît et le bouton descend de 3 px (80 ms). Au relâché, il remonte en 120 ms.
- Chiffres : roulement de 300 ms. Segments de barre : 300 ms `ease-out`.
- Récitatif : apparaît par un **essuyage d'encre** de gauche à droite (clip-path, 250 ms).
- Ni rebond élastique, ni parallaxe, ni particules d'UI. Le boil à 8 fps est réservé au logo et aux titres de l'écran titre.
- Le réglage « Réduire les animations » coupe les glissements (fondu seul) et le flash « planche ».

### 8.7 Téléphone (manette)

- **Paysage, écran toujours allumé.** Fond **papier**, avec un grand **lavis de la couleur du joueur** : la couleur d'identité à 30 % sur le papier, bord de lavis irrégulier, liseré de 3 px. Le téléphone ressemble ainsi au territoire du joueur.
- **Bandeau supérieur** (56 px) :
  - fond à la couleur d'identité pleine, cerclé d'encre ;
  - nom du joueur à l'encre (Patrick Hand SC 22) et glyphe à gauche ;
  - rang et % à droite (Averia 24) ;
  - couronne éventuelle ;
  - mini-arc du soleil.
- **Joystick** (moitié gauche) : cercle d'encre de 2 px, rayon de 60 px, zone morte en pointillés, pastille papier à ombre décalée. Il apparaît sous le pouce.
- **Boutons** (droite) :
  - ▲ MONTER, 110 px, et ▼ PIQUER, 130 px : disques papier à bord d'encre de 3 px, ombre décalée de 5 px, symbole à l'encre en Julius Sans One 36.
  - **« CIBLE ! »** : le bouton ▼ se remplit de la couleur d'identité et reçoit une étoile d'encre à 8 rayons.
  - **Recharge** : un arc d'encre qui se remplit autour du bouton.
  - **État grisé** : encre à 35 %, sans ombre.
- **Cibles tactiles ≥ 64 px CSS.** Les vibrations sont doublées d'un flash visuel : le bandeau s'inverse 80 ms (iOS).
- **Écrans** :
  - connexion, nom, couleur : grille des 12 jetons, les 6 premiers d'abord, les couleurs prises barrées d'un trait d'encre ;
  - attente, avec la règle en 3 images ;
  - entre manches, avec les stats du joueur ;
  - reconnexion : case centrale « Le vent t'a emporté… » et plume qui tourne.
- **Mode daltonien** : glyphe de 48 px dans le bandeau, et motif de trame du joueur sur le lavis de fond.

### 8.8 Écrans clés (direction)

- **Chargement** : un soleil qui parcourt un arc pendant que l'ombre d'une tour s'allonge sur une bande de sable. Progression réelle ; texte « Ton ombre peint le désert. »
- **Titre** : plan bas, heure dorée (KF16) ou cycle lent, bots en fond. Logo en haut à gauche dans le tiers supérieur, horizon dans le tiers bas. Menu en cases à droite.
- **Lobby** : KF50. QR code dans une case (modules à l'encre `#2B1D23` sur papier, marge de 4 modules, taille ≥ 320 px). Code de salle en Averia 64. Slots de joueurs en cases avec jeton, glyphe et nom.
- **Résultats** : nuit KF-15, vue carte verticale, territoire « illuminé » (§4.7). Podium en cases ; titres de fin de partie en récitatifs.

---

## 9. Décisions (pour DECISIONS.md)

**Arbitrages avec les autres documents** :
- **Territoire sans hachures** (contre design-party §4 : « fort = hachures croisées ») : les hachures sont réservées aux formes et au mode daltonien. Le fort se lit par valeur, chroma, liseré et granulation.
- **Ombres de tours sans hachures ni contour** (contre design-drama §7.1) : le gel se lit parce que c'est de l'ombre ; les hachures entreraient en conflit avec les trames du mode daltonien.
- **Ombres d'oiseaux jamais « encre »** (contre design-party : aplat d'encre à 0,85) : ce sont des ombres teintées high-key (R7), avec un bord net et non adouci de ±0,75 m.
- **« Ardoise » devient « Sarcelle »** ; les 11 autres noms de design-drama sont conservés.

**Décisions proposées** :

- **A1 — Palette** : 9 keyframes (KF80, KF50, KF25, KF16, KF10, KF3, KF1, KF-4, KF-15) de `docs/art/palette.json`, interpolées en OKLab sur le CPU. KF10 et KF1 sont redessinées (anti-boue, plan final).
- **A2 — Horloge de palette** : la palette suit `paletteElev(e)`, qui remappe `[E_end, E_s]` → `[1°, E_s]` avec `E_s = e(0,7·T)`. Chaque manche finit sur KF1 (« soleil sur la Falaise »), quelle que soit la courbe du soleil. Le disque solaire et les ombres restent à l'élévation de gameplay, et l'horizon (Falaise ou mesas) est dimensionné pour que le soleil le touche à `E_end`.
- **A3 — Arène plate** : l'arène est une toile plate (ondulations ≤ 0,6 m, aucun aplat de pente). Dunes, mesas, Géantes et Falaise sont hors arène. Motif : les pentes corail se confondaient avec un territoire orange.
- **A4 — Couleurs dérivées** : les objets (tours, oiseaux) prennent la teinte de lumière de la keyframe. Faces au soleil corail au coucher, ombre propre à `L × 0,80 → 0,70` et teinte tirée à 55 % vers `castShadow`.
- **A5 — 12 couleurs de joueurs, dans l'ordre d'attribution** : Corail `#E07148`, Lagon `#6ADDD9`, Indigo `#414CAA`, Safran `#FBCF55`, Azur `#3C96D8`, Carmin `#A52E49`, Prune `#9B60A4`, Anis `#8CC460`, Sarcelle `#006773`, Rose `#F79BB6`, Lilas `#B0A4F5`, Jade `#44975F`. ΔE OKLab minimal à 12 : 0,136. De 2 à 6 joueurs : ≥ 0,158 en deutéranopie, protanopie et tritanopie. Bots et joueurs sans choix prennent la première libre.
- **A6 — Glyphes et motifs** : un glyphe par joueur (croix, vagues, croissant, disque, triangle, carré, goutte, étoile, chevron, losange, anneau, éclair), affiché partout dans le HUD et le téléphone. Le mode daltonien ajoute une trame par joueur sur le territoire (motifs §3.5), un jeton au-dessus de l'oiseau et un glyphe au centre de l'empreinte. On ne change jamais les couleurs.
- **A7 — Lavis** : territoire en lavis OKLab (§4.1), avec `dL` et `cs` par joueur, liseré de pigment de 3 px, granulation sur le fort. Jamais d'encre ni de hachures (hors mode daltonien). De jour, il ne dépasse pas la luminosité du papier − 0,05 ; au coucher, il « s'allume » au-dessus du sol gris.
- **A8 — Transitions de territoire** dans le shader : encre fraîche 0,4 s, vol par front mouillé 0,35 s, tache de piqué en éclaboussure 0,7 s, « tsk » 0,2 s. Affichage calé sur la grille de simulation.
- **A9 — Ombres portées** : aplats nets en OKLab (100 % de teinte sur le sable, 35 % sur la peinture). Ni contour ni hachure. Height shadow map en espace sol.
- **A10 — Ombre d'oiseau en deux couches** : l'empreinte est l'ellipse exacte de gameplay (opacité 0,70 fort / 0,35 pâle), avec un liseré couleur joueur de 2,5 px, continu si fort, pointillé si pâle. L'âme est la vraie silhouette (1,0 / 0,6). L'empreinte est implémentée par sphère-proxy à hauteur factice dans la height map (+0,3 ms ; la boucle d'ellipses, à +2,5 ms, est rejetée).
- **A11 — Front de nuit** : transition spatiale de palette (KF-4 derrière, KF1 devant), lèvre de dernière lumière `sandLit` de 3 px, sans encre.
- **A12 — Brume** : ≤ 0,15 dans l'arène, normale au-delà. La brume lointaine tend vers `skyHorizon`, pour que le haut du cadre porte la couleur du coucher.
- **A13 — Tours** : 8 archétypes procéduraux en lathe (Parasol, Aiguille, Pile, Colonne à dôme, Bulbe, Géante, Cathédrale, Gnomon). Crème, ocre et terracotta, dômes turquoise ou cobalt ≤ 5 % de la surface. Hachures verticales côté ombre, fenêtres en trous d'encre. Jamais de couleur de joueur sur le décor.
- **A14 — Oiseau** : blanc os pour tous, envergure 10-12 m, ≥ 38 px à l'écran. La couleur du joueur va sur les bandes d'ailes (identifiant principal), la cape, la selle, le fanion et un ruban de traînée de 20 m. Couronne `#FFF2C3` cernée d'encre au-dessus du meneur.
- **A15 — FX « encre »** (catalogue §6.8) : formes plates et traits d'encre, sans additif ni glow. Flash « planche » de 2 frames sur les touches, désactivable.
- **A16 — Pipeline** : shadow map → G-buffer MRT (ciel en dernier) → `InkEffect` (contours, brume, papier, vignette, flash) → SMAA. Presets Low / Medium / High à 720p / 900p / 1080p. Budget ≤ 10 ms GPU en High sur Vega 6, CPU ≤ 6 ms. Empreintes, liserés et mode daltonien présents dans tous les presets.
- **A17 — QA** : captures Playwright aux 9 keyframes, test high-key (§7.7) et test de palette (`final.mjs`) en CI locale.
- **A18 — Typographie** : Julius Sans One (titres), Patrick Hand SC (UI et narrateur), **Averia Sans Libre Bold pour tous les chiffres**, logo « OMBRES » dessiné avec ombre portée animée.
- **A19 — UI** : cases de BD (papier `#F7F0E3`, encre de 2 px, ombre décalée sans flou, rayon de 3 px). L'UI est papier + encre ; une couleur de joueur n'y désigne que ce joueur ; les alertes passent par l'inversion encre/papier. Téléphone sur fond papier avec un lavis de la couleur du joueur.
- **A20 — Caméra** (à arbitrer avec l'agent caméra) : tangage de jeu 42-58°, donc pas de ciel en jeu. Plans bas (tangage < 15°, horizon dans le tiers) réservés au titre, aux transitions, à la victoire et à la nuit.
