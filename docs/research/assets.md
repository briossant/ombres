# Assets gratuits pour « Ombres » : inventaire, évaluation, recommandations

Agent : assets. Date : 2026-09-25. Tout ce qui est cité est **téléchargé** dans `assets-staging/` (103 Mo, 429 fichiers). Chaque licence a été **lue sur la page source**, avec URL, auteur et attribution dans [`assets-staging/LICENSES.md`](../../assets-staging/LICENSES.md).

---

## 0. TL;DR

| Catégorie | Verdict | Quoi utiliser |
|---|---|---|
| **Oiseau** | Aucun modèle libre ne ressemble à l'oiseau-ptérosaure blanc d'Arzach. **Générer l'oiseau procéduralement** (maillage loft + 17 os) : prototype fonctionnel livré. | `models/procedural_bird_proto/proceduralBird.js` (SkinnedMesh + `pose({phase, amp, fold, bank, pitch, neck})`). Secours : `hawk_rigged_sherkiz.glb` (CC-BY, 58 os, rémiges articulées). |
| **Cavalier** | Il fait 10 à 25 px à l'écran : c'est sa silhouette qui compte. **Procédural** (cape-cône + capuche + écharpe verlet à la couleur du joueur). | Secours CC0 riggé : `hooded_adventurer_quaternius.glb`. |
| **Textures** | ambientCG (CC0) pour sable et papier, bruit bleu CC0, **hachures TAM générées par nous** (raccordables, 6 niveaux emboîtés). | `textures/sand/Ground097*` (normales de rides), `paper/paper_grain_512_seamless.png`, `noise/bluenoise_128_L.png`, `hatching/hatch_tam_levels_{1-3,4-6}_rgb.png`. |
| **SFX** | 91 fichiers Freesound **CC0 vérifiés** (85 SFX + 6 échantillons d'instruments) + packs Kenney CC0. **91 fichiers « prêts pour le jeu »** en OGG : découpés, normalisés, boucles sans couture vérifiées au spectrogramme. | `sfx/_ready/*.ogg` (8,1 Mo), régénérables avec `build_ready.py`. Table événement → fichier au § 5. |
| **Musique** | Pistes CC0/CC-BY pour les écrans hors jeu. **Pendant la manche : musique générative Tone.js** pilotée par l'élévation du soleil, jouée avec de vrais échantillons CC0 (tongue drum pentatonique, oud, duduk, tanpura). | Titre : `zhelanov_futuristic_ambient_1` (CC-BY, style Tangerine Dream). Lobby : `isaiah658_ambient_relaxing_loop`. Résultats : `cynicmusic_calm_ambient_1_synthwave4k`. Échantillons : `music/samples/`. |
| **Polices** | OFL, woff2 auto-hébergés avec un `fonts.css` prêt. | **Space Grotesk** pour l'UI et le HUD (chiffres tabulaires, lisible sur TV), **Syne 800** pour le logo, **Julius Sans One** pour les titres d'écran, **Patrick Hand SC** pour les récitatifs du narrateur, **Atkinson Hyperlegible** en option « texte lisible ». |

Attributions **obligatoires** dans les crédits : Alexandr Zhelanov (CC-BY 4.0), Tri-Tachyon (CC-BY 4.0), elerya (CC-BY 3.0), et Sherkiz et Thomas DR (CC-BY 3.0) si leurs modèles sont gardés, plus le texte OFL des polices. Tout le reste est CC0.

---

## 1. Méthode, sources retenues et écartées

**Vérification de licence.** Freesound : pour chaque son, on a lu la page et vérifié que le seul lien de licence est `creativecommons.org/publicdomain/zero/1.0/` (91/91 CC0). OpenGameArt : champ « License(s) » de la page. Poly Pizza : champ `Licence` et lien Creative Commons de la page modèle. Kenney : `License.txt` du zip. ambientCG : page licence. Polices : `OFL.txt` et `METADATA.pb` du dépôt `google/fonts`.

**Évaluation sans écoute.** On ne peut pas écouter. On a combiné titre, description et tags de l'auteur, note et nombre de téléchargements Freesound, durée et niveaux (`sox --i`, `sox stat` : crête, RMS, fréquence approximative), **spectrogrammes** (`sox spectrogram`, regardés) et une **détection d'événements** par enveloppe RMS (script `seg.py`) pour isoler chaque battement d'aile et chaque cri. Les modèles ont été rendus en vignettes three.js dans Chrome headless et inspectés (os, animations, triangles).

| Source | Statut | Raison |
|---|---|---|
| Freesound (filtre `license:"Creative Commons 0"`) | ✅ principale SFX | Les previews HQ mp3 (~128 kbps, 44,1/48 kHz) sont publiques ; l'original complet exige un compte. Suffisant pour un jeu web. |
| Kenney.nl | ✅ UI, impacts, cuir/tissu | CC0, qualité régulière. Les jingles (8-bit, sax, pizzicato) détonnent avec le style : non retenus. |
| OpenGameArt | ✅ musique | Filtrer page par page : beaucoup de GPL et de CC-BY-SA. |
| Poly Pizza | ✅ modèles | Téléchargement GLB direct sans compte (`static.poly.pizza/<uuid>.glb`). |
| ambientCG, bruit bleu de C. Peters | ✅ textures | CC0. |
| Google Fonts | ✅ polices | OFL. |
| **Sketchfab** | ❌ | Téléchargement impossible sans compte, même en CC0/CC-BY (API : « Downloading models requires users to be authenticated »). |
| **Sonniss GDC Bundle** | ❌ | Licence maison : usage commercial libre mais pas de redistribution des fichiers seuls (or un jeu web sert ses fichiers en clair), usage IA interdit, archives de plusieurs Go. Zone grise inutile vu la couverture CC0. |
| Pixabay Music/SFX | ❌ | Licence maison, pas CC : exclue par la règle « pas de licence floue ». |
| Smithsonian 3D (CC0) | ❌ | Scans photogrammétriques lourds, non riggés, sans rapport avec le style. |
| Meshy / « free AI models » | ❌ | Contenu généré par IA, statut juridique flou. |
| OGA « Yoiyami » (*Sunset Plains*…) | ❌ (téléchargé puis écarté) | Mises en ligne de fin 2025, descriptions typiques d'une génération IA : CC0 déclaré mais douteux. |
| Quaternius (site) | ➖ | Ses packs passent par itch.io ; ses modèles sont aussi, un par un, sur Poly Pizza (même licence CC0) : on s'est servi là. |

---

## 2. Arborescence livrée

```
assets-staging/                                  103 Mo
├── LICENSES.md                 source, auteur, licence et attribution pour CHAQUE fichier
├── models/            3,0 Mo   birds/ (hawk CC-BY, dragon CC0) · riders/ (hooded CC0, cloaked CC-BY)
│   ├── procedural_bird_proto/  proceduralBird.js + preview.html (prototype, notre code)
│   └── _previews/              vignettes PNG (dont procedural_bird_proto.png)
├── textures/          12 Mo    sand/ (3 matériaux 1K : Color, NormalGL, Displacement) · paper/ · noise/ · hatching/ (+ generator/)
├── sfx/               49 Mo    wind/ wings/ whoosh/ impact/ birds/ chimes/ sand/ riser/ ui/  = originaux Freesound (mp3, *__fs<ID>.mp3)
│   ├── _ready/        8,1 Mo   91 OGG prêts pour le jeu + build_ready.py (régénération idempotente)
│   └── kenney/        1,4 Mo   interface/ ui/ impact/ rpg/ (OGG CC0)
├── music/             40 Mo    18 pistes OGG (CC0 / CC-BY)
│   └── samples/       2,4 Mo   tongue drum ×9 notes, oud ×3, duduk, tanpura (génératif)
└── fonts/             0,5 Mo   woff2 latin + latin-ext, fonts.css, OFL-*.txt, _preview_*.png
```

**À embarquer réellement dans le build** (estimation) : `sfx/_ready` (8 Mo), la sélection Kenney UI (~0,3 Mo), 3 ou 4 pistes (~12 Mo), `music/samples` hors mp3 sources (~1,5 Mo), textures (~4 Mo après conversion JPG q85 / KTX2), polices (~0,2 Mo), soit **~25 Mo**. Charger les pistes de musique en *streaming* (`<audio>` + `MediaElementSource`) plutôt qu'en `decodeAudioData` : une piste de 4 min décodée pèse ~85 Mo en RAM (PCM float 48 kHz stéréo).

---

## 3. Oiseaux et cavalier

### 3.1 Ce qui existe (testé : rendu, os, pose repliée)

| Modèle (licence) | Tris / os / anims | Verdict |
|---|---|---|
| **Hawk Lp Rigged**, Sherkiz (CC-BY 3.0) `models/birds/hawk_rigged_sherkiz.glb` | 9 956 tris, 58 os (épaule, coude, poignet + **4 os de rémiges par aile**, 2 os de rectrices, pattes, bec), 1 anim « Fly » 1,29 s, texture albedo 1K | **Meilleur trouvé.** Squelette propre, skinning correct en pose repliée (testé), rémiges articulées qui permettent d'écarter les plumes. Mais c'est un **rapace réaliste brun** : il faut le recolorer (blanc os #EDEDDF) et accepter une silhouette d'aigle, pas de ptérosaure. Bon plan B. |
| **Dragon**, Quaternius (CC0) `models/birds/dragon_quaternius.glb` | 1 344 tris, 27 os (Wing1-4.L/R, queue 4 os), anims Flying/Attack/Hit/Death | Ailes membranes riggées et gratuites, mais **cartoon trapu** (grosse tête, pattes) : hors style. Placeholder de dev uniquement. |
| Dragon Evolved, Pigeon, Birb (Quaternius CC0) | 2-7k tris | Mascottes rondes : non. |
| Gull, Turkey vulture, Pelican (Google Poly, CC-BY) | 400-1 600 tris, statiques | Non riggés, low-poly réaliste : non. |
| Pterablocktyls (CC-BY) | 45k tris, 56 meshes | Voxel : non. |
| Sketchfab (nombreux ptérosaures CC-BY) | — | Inaccessibles sans compte (voir § 1). |

Vignettes : `models/_previews/*.png`.

### 3.2 Recommandation : **oiseau procédural** (prototype livré)

Pourquoi, par ordre d'importance :

1. **Silhouette = style.** La recherche style (§ 3.8 de `moebius-style.md`) décrit l'oiseau d'Arzach : blanc os, long bec, crête, cou en S, longues ailes étroites et rigides, **presque aucune ligne interne**. Tout se joue sur le contour encre. Un maillage généré permet de régler exactement ce contour (envergure, corde, festons de membrane, longueur du bec) ; aucun modèle trouvé ne s'en approche.
2. **Animation procédurale imposée par le brief.** Replier en piqué, incliner en virage, battre selon la montée : il faut des os aux bons axes. En générant les os avec le maillage, les axes sont connus (+X envergure, +Z avant) et les poids sont calculés analytiquement. Pas de retargeting.
3. **Variété à coût nul.** Un paramètre `seed` peut faire varier l'envergure (±8 %), la crête et la longueur du cou pour les 12 oiseaux et les bots, sans 12 assets.
4. **Pas une « primitive géométrique ».** C'est un loft à profils sculptés (courbes de rayon lissées), pas un assemblage de capsules. Le brief interdit les primitives, pas la génération.
5. **Budget** : le prototype fait 3 876 triangles et 2 126 sommets. Douze oiseaux avec coque inversée font environ 93k triangles, négligeable.

**Prototype** : `models/procedural_bird_proto/proceduralBird.js` (123 lignes, three.js pur, notre code) et `preview.html` (importmap CDN). Rendu : `models/_previews/procedural_bird_proto.png` (vue de dessus, 3/4, piqué, virage incliné, repli complet, demi-repli).

- **Squelette (17 os)** : `root → spine → neck1 → neck2 → head` ; `root → tail1 → tail2` ; par côté `spine → shoulder → elbow → wrist → tip` et `root → leg`.
- **Maillage** : un loft corps+queue (40×14), un loft cou en S (24×10), un loft tête+bec de 1,25 m (22×10), une lame de crête vers l'arrière, des ailes-membranes double face (36 pas d'envergure × 5 pas de corde, bord d'attaque épaissi, bord de fuite festonné, cambrure), deux pattes repliées vers l'arrière.
- **Poids des ailes** : segment k → os k, **mélange symétrique 50/50 sur ±0,07 d'envergure** autour du coude et du poignet. Une première version sans ce mélange se déchirait aux articulations (corrigé).
- **Pose** : `pose({ phase, amp, fold, bank, pitch, neck })`.
  - Battement : rotation Z de l'épaule `amp·0,65·sin(φ)`, du coude `amp·0,35·sin(φ−0,7)`, du poignet `amp·0,3·sin(φ−1,3)`. Le déphasage fait courir une onde vers la pointe, ce qui évite l'aile en planche.
  - Piqué `fold ∈ [0,1]` : balayage arrière (Y) de 0,55 / 0,75 / 0,6 rad (épaule / coude / poignet), qui donne une silhouette en flèche, et le cou se baisse.
  - Virage `bank` : roulis du `root` plus dièdre asymétrique (aile intérieure basse).
- **Réglages pour le gameplay** (brief et `design-party.md` § 3) : `amp` et fréquence de battement ∝ taux de montée (plané `amp=0,15`, 0,5 Hz ; montée forte `amp=0,8`, 1,6 Hz). `fold` suit l'état de piqué (0 → 1 en 0,15 s, retour en 0,4 s). `bank = clamp(tauxDeVirage × k, ±50°)`. Roulé-boulé au décrochage : `pitch` qui tourne sur 2π en 0,8 s avec `fold=0,6`.
- **Limites connues, à reprendre par l'implémenteur** :
  - La coque inversée ne dessine pas de contour sur les membranes (trop fines) ; utiliser le contour post-process depth/normales/ID de `npr-techniques.md` § 4.1, ou épaissir le bord d'attaque.
  - Les ailes sont un peu étroites vues de dessus : augmenter la corde (1,05 → 1,4) pour une ombre plus lisible.
  - Le repli complet vu de 3/4 crée des chevauchements : plafonner `fold` à 0,85.

**Cavalier** : le rendre aussi en procédural. Un cône de cape (lathe, 12 segments), une capuche, un buste, une **écharpe-banderole** en chaîne verlet (8 segments) à la couleur du joueur. Cette écharpe identifie le joueur en vol et rend le vent visible, comme les capes jaunes de Moebius (r14). Environ 300 triangles. Secours riggé CC0 : `models/riders/hooded_adventurer_quaternius.glb` (7 276 tris, squelette Quaternius 62 os, 24 anims ; asseoir en tournant `UpperLeg.* ≈ −80°` et `LowerLeg.* ≈ +80°` ; épée = mesh séparé à masquer). Secours statique : `cloaked_assassin_thomasdr.glb` (CC-BY, 981 tris, belle cape noire à facettes, arme à retirer).

---

## 4. Textures

| Fichier | Contenu | Usage recommandé |
|---|---|---|
| `sand/Ground097_1K-JPG_NormalGL.jpg` (+ Color, Displacement) | Rides de sable régulières et ondulées (vu) | **Normale de rides** : perturbe `N·L` du sol, et l'orientation des hachures peut suivre les rides. Répéter tous les 8 à 12 m. |
| `sand/Ground098_*` | Rides plus marquées, lignes sombres nettes | Variante, ou crêtes de dunes proches. |
| `sand/Ground093C_*` | Sable granuleux, rides irrégulières | Macro-variation, mélangée par bruit à basse fréquence. |
| `paper/paper_grain_512_seamless.png` | Grain de papier à grain moyen, **gris, 512², raccordable** (dérivé de Paper001, rendu raccordable par *roll + blend*, vérifié en mosaïque 2×2) ; moyenne 0,63, écart-type 0,08 | Overlay écran : `col *= 1.0 + (grain - 0.63) * 0.35`, UV = `gl_FragCoord.xy / 512`, sans filtrage mip (garde le grain net). |
| `paper/Paper001/003/006_Color.jpg` | Papier blanc, papier froissé, papier kraft beige | Fonds des panneaux UI (cases BD), écran de chargement. |
| `noise/bluenoise_{64,128,256}_L.png`, `bluenoise_128_RGBA.png` | Bruit bleu (Christoph Peters, CC0) | Dithering du dégradé de ciel (anti-banding), jitter du bord des hachures, seuil de pointillés (stippling). |
| `hatching/hatch_tam_levels_1-3_rgb.png`, `hatch_tam_levels_4-6_rgb.png` | **Tonal Art Map** « ligne claire » 512², 6 niveaux emboîtés (chaque niveau contient les traits du précédent, principe de Praun et al. 2001) : niveaux 1-3 traits parallèles à ~27° (pente 1/2), en tirets tremblés et effilés ; 4-5 contre-hachures (pente −2) ; 6 troisième direction horizontale. Couverture mesurée : 5 / 8 / 15 / 20 / 28 / 45 %. **Raccordable** (vérifié en 2×2). Les niveaux sont empaquetés dans R, G, B (blanc = papier) | Shader : `t = (1 - lum) * 6` ; mélanger les deux niveaux encadrants lus dans le bon canal. Aperçu : `hatching/_preview_levels_1-6.png` ; niveaux seuls : `hatch_level_N.png`. |
| `hatching/generator/hatch_tam_generator.html` | Générateur (canvas, graine fixe) | Régénérer avec un autre angle, espacement ou épaisseur (constantes en tête de fichier). |

Choix : **pas de texture de hachure téléchargée**. Les TAM libres trouvées sont photographiques ou trop « crayon », alors qu'un générateur réglable colle mieux à la ligne claire. Si l'équipe NPR hachure analytiquement en shader (lignes en espace écran), ces textures servent de référence visuelle ou de repli.

---

## 5. Effets sonores : quoi jouer, quand

Tous les fichiers ci-dessous sont dans `sfx/_ready/` : OGG Vorbis q4, 44,1 kHz. One-shots **mono** (pour `PannerNode`, spatialisés sur l'écran), normalisés à −1 dBFS crête, avec fondus. Boucles **stéréo**, normalisées à −3 dBFS, avec un crossfade equal-power de 2 à 4 s à la couture. La continuité a été **vérifiée au spectrogramme** : une première version avait un creux de −6 dB, parce que `sox -m` divise par 2 par défaut, et des artefacts de filtre dus au rééchantillonnage 48→44,1 kHz fait par morceau. Les deux sont corrigés dans `build_ready.py`.

Comme toutes les sources sont normalisées à la même crête, **les gains relatifs sont à régler au mixage**. Les valeurs proposées, en dB relatifs au bus SFX, sont un point de départ.

### 5.1 Ambiance (bus AMB, toujours actif en jeu)

| Couche | Fichier | Source et caractère | Pilotage |
|---|---|---|---|
| Vent de base | `amb_wind_base_loop.ogg` (38 s) | dhallcomposer : souffle aérien, réverbe d'extérieur, « vide, solitaire », sans insectes ni oiseaux. Conçu pour boucler. | −6 dB constant. |
| Vent d'altitude | `amb_wind_high_loop.ogg` (16 s) | lextrack : vent fort grave (~340 Hz), rugissant | Gain ∝ vitesse moyenne et altitude de la caméra (0 → −8 dB). |
| Vent chantant | `amb_wind_eerie_loop.ogg` (60 s) | felix.blume : vent dans des épines de cactus, désert d'Atacama. Sifflements tonaux, étrange (note 4,9/5, 11 700 téléchargements). | Monte avec le coucher : −30 dB à midi → −8 dB à l'heure dorée. |
| Hurlement final | `amb_wind_howl_loop.ogg` (30 s) | swiftoid : vent hurlant « spooky » | Coucher et nuit : 0 → −6 dB de t = 98 à 110 s. |
| Sombre / nuit | `amb_wind_dark_loop.ogg` (50 s), `amb_wind_night_crickets_loop.ogg` (60 s) | DarkShroom, grondement grave ; felix.blume, vent de montagne et grillons | Nuit, résultats, écran titre nocturne. |
| Carillons | `amb_chimes_loop.ogg` (60 s), `amb_crystal_chimes_loop.ogg` (55 s) | giddster, carillon à vent réel ; newlocknew, texture cristalline atonale | Lobby et menus (−18 dB) ; cristal à l'heure dorée (−20 dB). |
| Rafales | `wind_gust_01.ogg` (7,7 s), `wind_gust_02.ogg` (18 s) | synthé soufflé ; porte qui siffle | Aléatoire toutes les 12 à 25 s, pan aléatoire, −10 dB. |

### 5.2 Oiseaux (bus SFX, spatialisé)

| Événement | Fichier(s) | Notes |
|---|---|---|
| Battement d'aile (déclenché à chaque passage de `sin(φ)` à 0 vers le bas dans l'animation procédurale) | `wing_flap_01..07` (Cultureshock007, « Large Wings / Superhero Cape Foley », 0,5-1,1 s), `wing_flap_heavy_01..04` (Cerise_Virtuelle, « Large flying creature »), `wing_flap_foley_01..04` (tothrec2, « Large Wings Flapping ») | Choisir au hasard sans répéter le dernier, `playbackRate` 0,85-1,1, gain ∝ `amp`. **12 oiseaux = trop de voix** : 6 battements simultanés au plus, priorité aux plus proches du centre de l'écran et au joueur qui vient d'agir. `heavy` en montée forte. |
| Boucle de vol (bots lointains, écran titre) | `wings_flapping_loop.ogg` (4,25 s, 4 battements réguliers à ~1,07 s) | Mono, sans couture. |
| Repli / déploiement des ailes | `wing_fold_flutter.ogg` (2,4 s), `kenney/rpg/cloth1-4.ogg` | Au début du piqué et au redressement. |
| Piqué (descente) | `dive_nighthawk_01/02.ogg` (1,4-2 s) | **Vrai son** : le « boom » des plumes de l'engoulevent en piqué (Danjocross). Source très basse (crête 0,12), normalisée. Superposer `dive_whoosh_big_01/02.ogg` (AudioPapkin, 4,5-5,3 s, whoosh cinématique) sur un piqué long. |
| Frôlement, passage près de la caméra | `whoosh_pass_01.ogg` (2 s), `whoosh_pass_02.ogg` (0,5 s), `whoosh_long.ogg` (4 s) | Déclenchés par la vitesse relative au point d'écoute ; en Doppler, `playbackRate` de 1,15 → 0,9. |
| **Touche en piqué** (couche 3 sons) | `impact_punch.ogg` (craquement sec) + `impact_hit_heavy.ogg` (chute lourde sur terre) + `feather_burst_01..03.ogg` (oreiller de plumes) + cri `bird_squawk_0N` sur la victime | 0 / +30 ms / +60 ms. Sur un grand vol de territoire, ajouter `sub_drop.ogg`. Pendant le ralenti, faire descendre `playbackRate` de tout le bus à 0,8. |
| Collision entre oiseaux du même étage | `kenney/impact/impactSoft_heavy_00N.ogg` + `feather_burst` à −8 dB | Doux : pas d'étourdissement selon les règles. |
| Collision avec une tour | `kenney/impact/impactSoft_medium_00N.ogg` + `whoosh_pass_02.ogg` | Glissement le long du fût : pas de choc métallique. |
| Décrochage, roulé-boulé dans le sable | `bird_ptero_squawk.ogg` (0,7 s, cri de ptérodactyle) ou `bird_vulture_hiss.ogg` + `sandfall.ogg` | |
| Cri d'oiseau géant (taunt, meneur, écran titre) | `bird_hawk_scream_01..03.ogg` : **le cri de buse à queue rousse** (le cri de rapace « de cinéma », enregistrement TRP isolé à l'EQ) ; variantes **`*_giant.ogg` pitchées de −5 demi-tons** (plus grand, plus lointain) ; `bird_eagle_cry_01..03.ogg` (GreenW03, 2,2-2,4 s) ; `bird_griffin_cry.ogg` (5,3 s, créature fantastique) ; `bird_kee_ah_01..03.ogg` (buse à épaulettes, courts) ; `bird_squawk_01..04.ogg` (aigle, courts) | Pour des oiseaux géants, jouer plutôt les `_giant` ou `playbackRate` 0,7-0,8 avec une réverbe longue. Pas plus d'un cri toutes les 6 s au total. |

### 5.3 Territoire, sable, soleil

| Événement | Fichier | Notes |
|---|---|---|
| Peinture continue (ombre qui peint) | `sand_paint_rainstick_loop.ogg` (30 s, bâton de pluie : grains qui coulent) | Une seule instance globale, gain ∝ m²/s peints par tous (lissé 300 ms), `playbackRate` 0,9-1,2 selon l'intensité. Le design prévoit 160 m²/s à midi et 1 840 m²/s au coucher : c'est lui qui fait « entendre » l'accélération. |
| Gros vol de territoire | `sub_drop.ogg` + `sandfall.ogg` (4,5 s, sable qui tombe) | |
| Contact d'ombres adverses (le « tink » de `design-party.md`) | `kenney/interface/glass_002.ogg` (0,13 s) ou `pluck_001.ogg` | −14 dB, limité à 8/s. |
| Changement de phase du soleil (bandeau) | `chime_transition.ogg` (4,8 s, carillons « mystiques ») | Midi → Après-midi → Heure dorée → Coucher. |
| Soleil qui touche l'horizon / début de la nuit | `gong_big.ogg` (Paiste 32", 25 s, centroïde ~180 Hz, très grave) | Un seul coup, il couvre tout le décrochage musical. |
| Front de nuit qui balaye | `deep_tremor.ogg` (8 s, grondement grave) + `amb_wind_howl_loop` | |

### 5.4 Rythme de manche, tension, fin

| Événement | Fichier | Notes |
|---|---|---|
| Début de manche « Envol ! » | `horn_conch.ogg` (conque, 7,1 s) ou `horn_alpen.ogg` (5,3 s) | Cor de désert « tribal » ; le cor de brume `horn_fog_distant.ogg` sert aux Géantes à l'horizon. |
| « 3, 2, 1 » | `tick_rods.ogg` (bâtons de bois, 0,4 s), `tick_wood_soft.ogg` (0,55 s), `tick_woodblock.ogg` | 3 ticks, puis `bell_tibetan.ogg` sur « Envol ». |
| 10 dernières secondes | `tick_wood_soft.ogg` chaque seconde + `heartbeat_01.ogg` (0,6 s, « lub-dub ») de 1 Hz → 2 Hz | + `riser_long.ogg` (15 s) lancé à t = 97 s, qui culmine au gong. |
| Changement de meneur | `bell_harmony.ogg` (14 s) ou `bowl_hit.ogg` (bol tibétain, 12 s) à −10 dB | + narrateur. |
| Dernière manche ×2 | `riser_hit.ogg` (6,5 s) | |
| Fin de manche / décompte | silence (vent seul), puis `harp_gliss_up_01.ogg` + `bells_harmony_chord.ogg` sur le gagnant | |
| Victoire de partie | `harp_gliss_up_02.ogg` + `gong_short.ogg` + cri `bird_hawk_scream_01_giant` | |
| Pause | `harp_gliss_down.ogg` (entrée), musique passe-bas 400 Hz | |

### 5.5 Interface (PC et téléphones)

| Action | Fichier (Kenney CC0 sauf mention) |
|---|---|
| Survol / focus | `kenney/ui/rollover2.ogg`, `kenney/interface/select_001.ogg` (0,04 s) |
| Clic / valider | `kenney/interface/click_001.ogg` (0,10 s), `confirmation_001.ogg` (0,29 s) |
| Retour / annuler | `kenney/interface/back_002.ogg` (0,07 s) |
| Erreur | `kenney/interface/error_004.ogg` (0,10 s) |
| Bascule (réglage on/off) | `kenney/interface/toggle_002.ogg` |
| Ouverture / fermeture de panneau | `kenney/interface/maximize_003.ogg` / `minimize_003.ogg` |
| **Rejoindre la partie** | `music/samples/tongue_drum_NN_<note>.ogg` : **une note par slot de joueur** dans la gamme pentatonique de la mineur (A3 C4 D4 E4 G4 A4 C5 D5 E5, puis G5 A5 C6 obtenues par `playbackRate = 2^(n/12)` depuis D5/E5). Chaque joueur « a sa note », réutilisée pour son changement de meneur et sa victoire. Repli : `join_kalimba_c.ogg`, `join_handpan_csharp.ogg`. |
| Ajout / retrait de bot | `kenney/interface/drop_002.ogg` / `back_004.ogg` |
| Téléphone : manette | pas de son sur le téléphone en jeu (le son vient du PC) ; `navigator.vibrate` selon `design-party.md` |

---

## 6. Musique

### 6.1 Pistes livrées (`music/`)

Caractère déduit de la description de l'auteur et des spectrogrammes (tous regardés).

| Fichier | Durée | Licence | Caractère | Usage proposé |
|---|---|---|---|---|
| `zhelanov_futuristic_ambient_1.ogg` | 4:20 | **CC-BY 4.0** | « Tangerine Dream style, atmosphère des films apocalyptiques des années 80 », bouclable. Nappes tenues et arpèges de séquenceur. Seule piste trouvée qui sonne comme la SF de l'époque de Moebius. | **Chargement + écran titre** |
| `zhelanov_futuristic_ambient_2.ogg`, `_3.ogg` | 3:50, 3:27 | CC-BY 4.0 | Même série, 3 plus calme au début | Crédits ; repli en jeu (§ 6.3) |
| `zhelanov_electron.ogg` | 1:24 | CC-BY 4.0 | Séquenceur pulsé continu, dense (RMS 0,17), fondu sur les 10 dernières s | Repli en jeu « coucher » ; boucler avant le fondu (0-72 s) |
| `isaiah658_ambient_relaxing_loop.ogg` | 0:24 | CC0 | Nappe chaude (ZynAddSubFX, façon Spyro 2), **boucle sans couture** | **Lobby** (avec vent et carillons) |
| `yd_desert_theme_caravan.ogg` | 1:38 | CC0 | « Minimaliste, désert », pulsation régulière d'un bout à l'autre, **très bas niveau** (crête 0,15 : +12 dB) | Lobby, alternative |
| `cynicmusic_calm_ambient_1_synthwave4k.ogg` | 2:38 | CC0 | Nappes calmes, accords apaisants | **Résultats / podium** |
| `cynicmusic_calm_ambient_3_lifewave2k.ogg` | 3:07 | CC0 | Nappes + piano qui s'élève | Résultats de fin de partie |
| `tinyworlds_space_graveyard.ogg` | 5:13 | CC0 | Drone de tension, grave (centroïde ~1,9 kHz), épars, « boucle sans couture » | Couche de tension, écran de pause |
| `joth_contemplation.ogg` | 2:00 | CC0 | Ambiance sans mélodie, très douce (crête 0,26) | Tutoriel, écran d'attente |
| `haeldb_egyptian_meditation.ogg` | 2:04 | CC0 | Arpèges doux façon harpe, « temple » | Crédits |
| `tritachyon_dust_ambient_guitar.ogg` | 3:30 | **CC-BY 4.0** | Paysage de guitare ambiante, régulier, poussiéreux | Crédits, alternative aux résultats |
| `dizzycrow_frozen_desert.ogg` | 1:12 | CC0 | Mélodie orientalisante + taikos, énergique | Alternative d'action |
| `dizzycrow_negev_desert_intro/loop.ogg`, `..._negev_fight_loop.ogg` | 7 s / 42 s / 37 s | CC0 | Orchestral, paire calme/combat sur le même matériau… qui cite **Hava Nagila** (air connu) | ⚠️ Déconseillé : cliché reconnaissable, hors ton |
| `polygondan_desert_mystic2.ogg` | 0:56 | CC0 | « Égypte dynastique », dense et fort | Déconseillé (cliché) |
| `elerya_nomads.ogg` | 0:42 | CC-BY 3.0 | Cordes arabisantes en boucle, fort | Déconseillé (cliché) |

**Remarque de ton** : les pistes « désert oriental » (Negev, Mystic, Nomads, Frozen Desert) tirent vers le cliché Aladdin. Moebius, c'est un désert **étrange et SF, pas exotique**. Nappes synthétiques années 70-80, drones, percussions boisées et quelques timbres acoustiques non folkloriques (tongue drum, duduk très doux) sont plus justes.

### 6.2 Recommandation pour la manche : **génératif, piloté par le soleil**

Pourquoi pas une piste pré-enregistrée pendant la manche :
1. La manche dure 110 s (80 ou 150 selon le réglage) et le **climax doit tomber exactement** sur le coucher (t ≈ 98-110 s). Aucune piste ne s'y cale, et un fondu entre deux pistes pour « monter » sonne comme un changement de disque.
2. Les événements (meneur, gros vol, 10 dernières secondes) doivent pouvoir **ponctuer en rythme**, sur le temps.
3. Pas de piste CC0/CC-BY trouvée **en stems** superposables.

**Approche** : **Tone.js 15** (MIT, `tone@15.1.22` sur npm le 25/09/2026). Il fournit Transport, `Sampler` (repitch automatique depuis l'échantillon le plus proche), synthés, `Reverb` (IR générée), `FeedbackDelay` et `Filter`. Il joue de **vrais échantillons CC0** (`music/samples/`) plus des nappes synthétisées : la chaleur acoustique évite l'effet « bip WebAudio ». Démarrage après le premier geste utilisateur (`Tone.start()`), déjà nécessaire pour l'AudioContext. Coût CPU négligeable (au plus une douzaine de voix).

**Paramètre unique** : `I = clamp((88° − e) / 83°, 0, 1)^1.2`, l'intensité tirée de l'élévation `e` du soleil (courbe de `design-party.md` § 5), plus des flags d'événements. **Tonalité** la mineur pentatonique (A C D E G), la gamme du tongue drum, donc toutes les notes aléatoires sont consonantes. **Tempo** fixe 84 BPM (1 mesure ≈ 2,86 s). L'intensité monte par **subdivision** et par **couches**, pas par le tempo. Changements de couche quantifiés à la mesure.

| Phase (`design-party`) | t (s) | Couches actives | Détail |
|---|---|---|---|
| Envol | −3 → 0 | nappe qui gonfle, `chime_transition` | Nappe : `PolySynth` (2 dents de scie désaccordées de ±7 cents, passe-bas 700 Hz, attaque 2 s), A2-E3-A3 |
| Midi | 0 → 35 | L0 drone + L1 nappe + L2 mélodie éparse + tick bois | Drone : `tanpura_drone_E` en boucle −18 dB (**vérifier sa hauteur** : le pic FFT mesuré est à ~280 Hz, alors que le titre annonce E ; recaler par `playbackRate`). Nappe : Am(add9) → Fmaj7 → G6 → Em7, 2 mesures chacune. Mélodie : Sampler tongue drum, marche aléatoire ±2 degrés, probabilité 0,25 par croche, vélocité 0,4-0,7. Tick : `tick_wood_soft` sur les temps 1 et 3, −24 dB. |
| Après-midi | 35 → 75 | + L3 pulsation | Ostinato d'oud en croches (échantillon `oud_a2`, repitché A2/E3/G2), frame drum synthétique (bruit filtré 200 Hz + sinus 70 Hz, décroissance 120 ms) sur 1 et le « et » de 2. Mélodie à 0,4. |
| Heure dorée | 75 → 98 | + L4 lamento + shaker | Duduk (échantillon `duduk_C3` repitché) en notes longues, motif E4 → D4 → C4 → A3 toutes les 4 mesures ; shaker en doubles croches (bruit passe-haut 6 kHz, enveloppe 30 ms) ; passe-bas de la nappe 700 → 3 000 Hz ; `amb_crystal_chimes_loop` −20 dB. Mélodie à 0,6. |
| Coucher | 98 → 110 | tout, plus la tension | `riser_long` lancé à 97 s ; « 10 secondes » à 105 s : `tick_wood_soft` chaque seconde + `heartbeat_01` de 1 Hz → 2 Hz ; mélodie en doubles croches arpégées (probabilité 0,8). |
| Nuit | 110 → 115 | effondrement | `gong_big` à 110 s, coupure des percussions à la mesure, passe-bas général 3 000 → 300 Hz en 3 s, `amb_wind_howl_loop` au premier plan. |
| Décompte | 115 → 121 | silence (vent), puis stinger | Arpège montant du gagnant sur **sa** note (tongue drum), `harp_gliss_up_01`, `bells_harmony_chord`, puis fondu vers la musique des résultats. |

Ponctuations en rythme : **changement de meneur**, arpège de 3 notes de la note du nouveau meneur, quantifié à la croche suivante. **Gros vol**, `sub_drop` sur le temps suivant et coupe de la nappe pendant 1 temps (le « trou » rend l'impact lisible). **Narrateur**, ducking de −6 dB sur les bus MUS et AMB (rampe 80 ms, relâche 400 ms).

Squelette de code (indicatif) :

```ts
import * as Tone from 'tone';
const verb = new Tone.Reverb({ decay: 4.5, wet: 0.35 }).toDestination();
const drum = new Tone.Sampler({ urls: { A3:'tongue_drum_01_A3.ogg', C4:'tongue_drum_02_C4.ogg', D4:'tongue_drum_03_D4.ogg',
  E4:'tongue_drum_04_E4.ogg', G4:'tongue_drum_05_G4.ogg', A4:'tongue_drum_06_A4.ogg', C5:'tongue_drum_07_C5.ogg',
  D5:'tongue_drum_08_D5.ogg', E5:'tongue_drum_09_E5.ogg' }, baseUrl: '/audio/samples/', release: 1.5 }).connect(verb);
const SCALE = ['A3','C4','D4','E4','G4','A4','C5','D5','E5'];
let deg = 4, I = 0;                        // I mis à jour chaque frame depuis la simulation (élévation du soleil)
Tone.getTransport().bpm.value = 84;
new Tone.Loop(time => {                    // croches
  const p = I < 0.4 ? 0.25 : I < 0.7 ? 0.4 : 0.6;
  if (Math.random() < p) { deg = Math.max(0, Math.min(8, deg + Math.round((Math.random() - 0.5) * 4)));
    drum.triggerAttackRelease(SCALE[deg], '8n', time, 0.4 + Math.random() * 0.3); }
}, '8n').start(0);
```

**Repli si le génératif sonne mal en test** : `zhelanov_futuristic_ambient_3` (Midi → Après-midi) puis `zhelanov_electron` (Heure dorée → Coucher, boucle 0-72 s), en crossfade de 4 s déclenché à la mesure, plus les riser, heartbeat et gong ci-dessus, qui portent à eux seuls une bonne partie de la montée.

**Pré-rendu (option intermédiaire)** : générer les couches hors ligne avec `Tone.Offline` (même code) en 5 stems de 32 mesures, exportés en OGG et joués synchronisés avec des gains pilotés par `I`. Qualité déterministe, mais on perd les ponctuations en rythme. À réserver au cas où le CPU du PC hôte serait un souci (improbable).

### 6.3 Écrans hors jeu

| Écran | Musique | Ambiance |
|---|---|---|
| Chargement → Titre (bots en fond) | `zhelanov_futuristic_ambient_1` (fondu d'entrée 3 s, pas de coupure au passage chargement → titre) | `amb_wind_base_loop` −12 dB, cri `bird_hawk_scream_0N_giant` lointain toutes les 20 à 40 s |
| Lobby | `isaiah658_ambient_relaxing_loop` | `amb_wind_base_loop` + `amb_chimes_loop` −18 dB ; notes de « join » dans la même gamme (la mineur pentatonique, voir la remarque ci-dessous) |
| Entre deux manches | génératif réduit (drone + nappe) pour garder la continuité | |
| Résultats de manche / partie | `cynicmusic_calm_ambient_1_synthwave4k` / `_3_lifewave2k` | `amb_wind_night_crickets_loop` −20 dB |
| Pause | musique courante, passe-bas 400 Hz, −8 dB | |
| Crédits | `tritachyon_dust_ambient_guitar` ou `zhelanov_futuristic_ambient_2` | |

Tonalités : le lobby est en boucle libre ; les notes de « join » du tongue drum peuvent frotter avec la nappe d'isaiah658 (tonalité non mesurée). Si c'est le cas, les jouer avec la réverbe longue et à −6 dB, ou baisser la musique du lobby pendant 1 s.

---

## 7. Polices

Testées en rendu sur fond sable (`fonts/_preview_title.png`, `fonts/_preview_pairings.png`, avec une version réduite au tiers pour simuler la distance TV). Mesure des **chiffres tabulaires** (`font-variant-numeric: tabular-nums`) dans Chrome : **Space Grotesk, Syne et Atkinson** les ont (largeur de « 1111 » = « 0000 ») ; **Julius Sans One et Patrick Hand SC non**, et leurs chiffres feraient trembler un chronomètre ou un pourcentage.

| Rôle | Police | Fichiers | Pourquoi |
|---|---|---|---|
| **Logo « OMBRES »** | **Syne 800** (variable 400-800 : la graisse élargit aussi la chasse) | `syne-400-800-latin{,-ext}.woff2` | Capitales très larges et massives, affiche SF française des années 70 (Bonjour Monde, fonderie française). Base d'un logotype SVG dessiné (contour encre et ombre portée qui s'allonge), comme le préconise `moebius-style.md` § 7. |
| **Titres d'écran** (« Réglages », « Manche 2 ») | **Julius Sans One** | `julius-sans-one-400-*.woff2` | Accord avec la recherche style : capitales fines et larges, monolinéaires, l'élégance de la ligne claire. Réservée aux grandes tailles (≥ 40 px). |
| **UI, HUD, chiffres** | **Space Grotesk 500-700** | `space-grotesk-300-700-*.woff2` | Lisible au tiers de sa taille, chiffres tabulaires, léger caractère rétro-SF (dérivée de Space Mono). Remplace Patrick Hand SC pour tout ce qui doit se lire vite. |
| **Récitatifs du narrateur, bulles du tutoriel** | **Patrick Hand SC** | `patrick-hand-sc-400-*.woff2` | Lettrage de bulle BD en petites capitales, excellent en cartouche (voir l'aperçu) ; jamais pour des chiffres. |
| Option « texte très lisible » (réglage accessibilité, petits textes du téléphone) | **Atkinson Hyperlegible 400/700** | `atkinson-hyperlegible-*.woff2` | Conçue pour les malvoyants (Braille Institute). |
| Réserve (probablement inutilisées) | Megrim, Architects Daughter | `megrim-*`, `architects-daughter-*` | Megrim : déco années 70 étrange mais « gadget » ; Architects Daughter : alternative manuscrite. |

`fonts/fonts.css` contient les `@font-face` prêts, avec `unicode-range` latin et latin-ext, pour les 7 familles (16 `@font-face`, testés en local). Licence : texte OFL à inclure dans les crédits ou un fichier `LICENSES` du build. Julius déclare un « Reserved Font Name » : ne pas **modifier ni sous-ensembler nous-mêmes** en gardant le nom (servir les woff2 tels quels est permis).

---

## 8. Intégration technique

- **Formats** : OGG Vorbis pour tout ce que joue le **PC** (Chrome, Firefox et Edge le décodent ; l'hôte est un PC). Si un son doit être joué **sur un iPhone** (UI du téléphone), fournir aussi un MP3 ou un AAC (Safari iOS ne garantit pas Vorbis) : `sox in.ogg -C 128 out.mp3`. Recommandation : **aucun son sur le téléphone en jeu** (vibration ou flash), seulement quelques clics UI en MP3.
- **Chargement** : `sfx/_ready` + Kenney + samples, soit ~10 Mo décodés via `decodeAudioData` au chargement, en comptant dans la barre de progression réelle. Musiques : streaming (`HTMLAudioElement` → `MediaElementAudioSourceNode`), la suivante préchargée pendant l'écran courant.
- **Bus** : `master ← [MUS, AMB, SFX, UI, VOX]`, chacun avec son `GainNode` relié aux réglages (volumes séparés du brief), puis un `DynamicsCompressor` doux sur le master (seuil −12 dB, ratio 3). Réverbe partagée en *send* (`ConvolverNode` avec IR générée en code : bruit stéréo à décroissance exponentielle de 2,5 s, soit zéro asset).
- **Spatialisation** : `PannerNode` en `equalpower` sur X écran seulement (pan −0,8..0,8 selon la position horizontale de l'oiseau à l'écran), atténuation par distance à la caméra. Pas de HRTF (inutile sur des enceintes de TV).
- **Chemins** : copier `assets-staging/sfx/_ready/` → `public/audio/sfx/`, `music/*.ogg` retenus → `public/audio/music/`, `music/samples/*.ogg` → `public/audio/samples/`, `fonts/*.woff2 + fonts.css` → `public/fonts/`, textures → `public/textures/`. Mettre à jour `LICENSES.md` au passage (ou le déplacer dans `public/`).
- **Régénération** : `cd assets-staging/sfx/_ready && python3 build_ready.py` (sox seul). Modifier les points de découpe en tête de fichier.

---

## 9. Limites et risques

1. **Rien n'a été écouté.** Les choix reposent sur métadonnées, spectrogrammes, niveaux et segmentation. Un passage d'écoute de 20 min est indispensable avant de figer le mixage, en priorité sur les cris d'oiseaux (bruit de fond dans l'enregistrement TRP : RMS bas), le vent chantant et les battements d'ailes.
2. **Previews à 128 kbps** : assez pour un jeu web, mais on entend les artefacts MP3 sur les sons très aigus (carillons). Si besoin, télécharger les originaux WAV avec un compte Freesound gratuit ; les ID sont dans les noms de fichiers (`__fs<ID>`).
3. **Hauteurs estimées par FFT** (résolution ~11 Hz) : tongue drum à ±20 cents ; hauteur du tanpura incertaine (voir § 6.2).
4. **Oiseau procédural** : prototype de faisabilité, pas un asset final (§ 3.2, limites).
5. **Attribution CC-BY** : ne pas l'oublier dans l'écran Crédits (liste prête en tête de `LICENSES.md`).

---

## Décisions proposées

1. **Oiseau généré procéduralement** (loft + 17 os, poids analytiques, `pose()` paramétrique) à partir de `models/procedural_bird_proto/proceduralBird.js`. Plan B : `hawk_rigged_sherkiz.glb` recoloré blanc os (CC-BY, à créditer).
2. **Cavalier procédural** (~300 tris) avec **écharpe verlet à la couleur du joueur**, porteuse de l'identification en vol. Plan B : `hooded_adventurer_quaternius.glb` (CC0).
3. **Textures** : normale de rides `Ground097` pour le sable, `paper_grain_512_seamless.png` en overlay écran, bruit bleu 128 pour le dithering, TAM `hatch_tam_levels_*` comme référence ou repli des hachures shader.
4. **SFX** : utiliser `sfx/_ready/` (OGG, mono pour les one-shots spatialisés) et la sélection Kenney pour l'UI, selon la table du § 5. Plafond de 6 battements d'ailes simultanés. Une seule boucle « peinture » globale (bâton de pluie) dont le gain suit les m²/s peints.
5. **Note de joueur** : chaque slot a une note de la mineur pentatonique (tongue drum), jouée au join, au changement de meneur et à la victoire. C'est l'identité sonore des 12 couleurs.
6. **Musique en manche : générative (Tone.js 15, MIT)**, pilotée par `I = f(élévation du soleil)`, en la mineur pentatonique à 84 BPM, avec montée par couches et subdivisions calée sur les phases de `design-party.md`. Repli : Zhelanov *Futuristic ambient 3* → *Electron* en crossfade.
7. **Musique hors jeu** : Titre = Zhelanov *Futuristic ambient 1* (CC-BY) ; Lobby = isaiah658 (CC0) ; Résultats = cynicmusic *Synthwave 4k* (CC0) ; Crédits = Tri-Tachyon *Dust* (CC-BY). **Écarter** les pistes « orient de cliché » (Negev, Desert Mystic, Nomads).
8. **Polices** : logo Syne 800 (logotype SVG retravaillé), titres Julius Sans One, **UI et HUD Space Grotesk** (chiffres tabulaires), récitatifs Patrick Hand SC, option accessibilité Atkinson Hyperlegible. Tout en woff2 local via `fonts/fonts.css`.
9. **Formats** : OGG pour le PC, MP3 seulement pour les rares sons joués sur téléphone ; musiques en streaming ; budget embarqué ≈ 25 Mo.
10. **Crédits obligatoires** : Zhelanov, Tri-Tachyon, elerya (si gardé), Sherkiz et Thomas DR (si gardés), plus les textes OFL ; remerciements CC0 facultatifs (Freesound, Kenney, ambientCG, C. Peters).
