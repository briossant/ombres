# Vérificateur antialiasing — « c'est fait exprès qu'il n'y ait pas d'antialiasing ? »

Date : 2026-09-27, 19 h 20 à 20 h 15. Port 8892 (serveur de dev arrêté par son PID à la fin ; prod sur 8893,
lancé et arrêté par `prod.mjs`). Vérifie `docs/polish/fix-antialiasing.md`.
Machine : Renoir / Vega (ANGLE GL). Un autre agent encodait des vidéos (ffmpeg, charge 17-25) de 19 h 19 à
19 h 26 : captures seulement pendant ce créneau ; toutes les mesures GPU ont été prises ensuite, au calme
(charge 0,6-3,4, GPU au repos hors de ma page).

## Verdict sur la netteté

Non, ce n'était pas voulu, et le correcteur a traité l'essentiel : les traits d'encre sont vraiment antialiasés
(bords lissés, continus, stables sous un glissement de caméra) et Medium n'est plus un 900p étiré et flou.
L'image n'est pas pour autant nette partout. Par preset, sur cette machine :

- **High** : net et propre. Silhouettes lisses, traits continus, hachures intactes. C'est le meilleur rendu
  à 60 i/s ici (p90 ≤ 9,9 ms à 12 oiseaux, au calme). Le banc ne le choisit presque jamais : son seuil est à
  8 ms de titre, et le titre en coûte 8,3 à 8,7 selon le correcteur. On peut le choisir à la main dans
  Réglages › Qualité.
- **Medium** (choisi par la qualité auto 8 fois sur 9, §4) : bien plus net qu'avant, sans flou, avec des traits
  continus. Mais ce n'est pas le rendu propre de High. En gros plan (l'oiseau du titre), les silhouettes en
  biais gardent des **dents de 1,2 px**. Et les traits très fins (cordes, montants des tours) portent des
  **points clairs qui changent d'une image à l'autre** quand la caméra glisse. Les deux défauts viennent de la
  reconstruction depuis le G-buffer 900p. Planches : `medium-vs-high-oiseau-titre-x3.jpg`,
  `glissement-subpixel-medium-x3.jpg`.
- **Ultra** : il était défectueux (traits 25 à 36 % trop fins, §3.1). C'est corrigé ; c'est maintenant le
  rendu le plus propre. Il coûte 34 à 37 ms ici, donc le banc ne le choisira jamais sur cette machine.
- **Ce qui reste crénelé dans tous les presets, et que le correcteur ne touchait pas** : les bords du
  territoire. Dans la vue de l'arène, c'est la plus grande surface de l'écran. On y voit les marches de la
  grille de la simulation (voulues : « l'affichage suit la grille », bible §4.4) et la couture d'un pixel entre
  deux propriétaires (fix3-world §1.4). Ultra les adoucit, sans les effacer. Si l'utilisateur regarde
  surtout l'arène, c'est probablement ce qu'il verra encore comme « pas d'antialiasing ».
- **Écran 4K** : Medium et High y restent un 1080p agrandi ×2 par le navigateur, donc flou. Seul Ultra est
  en 4K natif (`4k-medium-vs-ultra-grande-ombre-x2.jpg`).

## 1. Vérifications de base

- `npx tsc --noEmit -p tsconfig.json` : 0 erreur. `pnpm check:boundaries` : OK. `npx vitest run` : 32 fichiers,
  380 tests verts (377 + 3 nouveaux, `src/host/render/npr/InkEffect.test.ts`).
- Relu dans le code : les presets et les SMAA sont conformes au compte rendu (Low LOW, Medium aucun, High
  MEDIUM, Ultra HIGH ; Medium `gbufferScale` 900/1080, budget 8,5 ; Ultra `targetHeight` 2160,
  `supersample` 2). L'option Ultra est présente dans les réglages, en FR et en EN.

## 2. Regard neuf : vraies parties

Outil nouveau : `tools/polish/aa/verify-shots.mjs`. Il joue une vraie partie à 12 oiseaux, sans image
préparée : titre après le banc, salon, manche (midi, heure dorée, Grande Ombre), résultats, podium. Il fait une
image figée à chaque phase et une rafale en vol à vitesse réelle. Il a tourné en réglage **auto** et en
**Ultra**, en 1920×1080 et en 3840×2160. Console propre dans les 5 parties (auto 1080p et 4K ; Ultra 1080p avant et après le §3.1 ; Ultra 4K). Le banc choisit **Medium** en
1080p comme en 4K (le canevas de Medium en 4K reste en 1920×1080).
Comparaisons sur la même image figée, dans les mêmes conditions : `tools/polish/aa/shots.mjs` du correcteur
(variantes, `--pan`).

| Planche (`shots/verify-aa/`) | Ce qu'on y voit |
|---|---|
| `parcours-1080p-medium-ultra.jpg` | Les 7 écrans (titre → podium) en Medium (auto) et en Ultra corrigé : rien de cassé |
| `ultra-reel-grande-ombre-x3.jpg` | Ultra corrigé en vraie partie (Grande Ombre, heure dorée) : disque et Simoun cernés au bon poids, lisses |
| `auto-medium-grande-ombre-reel-x3.jpg` | Medium en jeu : disque et fût bien cernés ; marches du territoire (grille) et coutures d'un pixel |
| `rafale-en-vol-medium-heure-doree-x2.jpg` | Rafale en vol : la silhouette du disque reste continue d'une image à l'autre, sans pointillés |
| `glissement-subpixel-medium-x3.jpg` | Caméra qui glisse de 0,2 px par image : avant (900p étiré, flou mais stable), Medium du correcteur (net ; points clairs changeants sur les cordes), High (net et stable) |
| `medium-vs-high-oiseau-titre-x3.jpg` | Oiseau du titre : avant (flou), Medium (net, dents de 1,2 px sur le bec et le bord d'aile), High (lisse) |
| `hachures-medium-high-ultra-x4.jpg` | Hachures des dômes intactes avec SMAA MEDIUM et HIGH, pas floutées. Le SMAA éclaircit un peu les traits fins de High (comparer avec « sans SMAA ») |
| `ultra-epaisseur-traits-titre-x3.jpg`, `grande-ombre-high-vs-ultra-apres-x3.jpg` | §3.1 : Ultra avant / après, face à High |
| `4k-medium-vs-ultra-grande-ombre-x2.jpg` | Viewport 4K : Medium = 1080p agrandi (flou, marches) ; Ultra en 4K natif, net |

## 3. Défauts trouvés et corrections (Edits ciblés)

### 3.1 Ultra dessinait des traits trop fins — corrigé (`InkEffect.ts`, variante `INK_WIDE`)

- **Cause.** L'épaisseur suit la définition (`s = resolution.y / 1080`). À 2160p, une silhouette fait donc
  2,2 à 3,8 px et une bande de pli ou d'ID 1,4 à 2,6 px. Or la nouvelle détection s'arrête à 2 pas pour les
  silhouettes (`kr` ≤ 2) et à 1 pas pour les plis et les ID. Au-delà, rien n'est encré : les traits
  plafonnent à 2 px de 2160p, soit 1 px de 1080p. L'ancien shader, lui, espaçait ses lectures selon
  l'épaisseur.
- **Mesure** (encre seule, même image figée, masse d'encre = somme de 1 − gris) : Ultra / High = 0,75 sur
  l'image entière, 0,64 sur le Simoun, 0,74 sur un fût. La « référence SSAA » `__aa.ssaa()` du correcteur
  avait le même défaut. Ses écarts à la référence (§2 de son rapport) comparaient donc à des traits trop fins.
- **Correction**, compilée seulement si `targetHeight` > 1080 (Ultra) :
  - détection à `ceil(W max)` pas (4 au plus) ;
  - pour les pixels à j ≥ 1 pixel du bord, le premier anneau intermédiaire (2, puis 3) qui voit le fond donne
    la distance. Le pixel du bord garde sa couverture lissée, donc un bord extérieur antialiasé ;
  - pour les objets, un anneau de plis et d'ID à 2 pas.
- **Après** : Ultra / High = 1,12 sur l'image entière et 1,13 à 1,24 sur les recadrages. Ultra a 2 200
  cailloux contre 1 500 ; High perd aussi un peu d'encre au SMAA MEDIUM et à l'approximation de son 2e pixel.
  À l'œil, le poids des traits est celui de High, en plus lisse. Pas de faux plis sur l'oiseau en gros plan.
- **Coût** (A/B entrelacé, 12 oiseaux, Grande Ombre, 3840×2160, calme) : +0,11 ms sur 35,3 ms.
- **Low, Medium et High** : le code est identique après le préprocesseur. Le nouveau test
  `InkEffect.test.ts` vérifie qu'aucun d'eux ne compile `INK_WIDE`.

### 3.2 Medium : distance du repli à 2 pas — corrigé, effet faible

En Medium (`INK_SCALED`), le 2e texel du G-buffer couvre des pixels d'écran situés entre 1,2 et 2,4 px du
bord. Le repli leur donnait à tous 1,8 px (`band(1.5 / ks, W)`). Quand le tremblé épaissit le trait, il perdait
jusqu'à ½ px une fois tous les 5 texels. La distance est maintenant ramenée au centre du pixel d'écran, le long
de la normale de l'anneau. Résultat : +1,5 % d'encre et une épaisseur plus régulière (encre seule). En
revanche, ce n'est pas la cause des dents visibles du §2 : celles-là viennent de la couleur 900p. Coût :
+0,01 ms (A/B entrelacé, Medium, 12 oiseaux).

### 3.3 Essayé et retiré

- **Borne anti-ringing du Catmull-Rom** (couleur bornée par ses 5 lectures). Aucun effet visible : les points
  clairs sur les cordes sont des battements 900p → 1080p, pas du ringing.
- **Couleur du fond au-delà de la frontière lissée** (Medium). L'écart à la référence SSAA sur les bords de
  l'oiseau baisse de 11,77 à 11,45 / 255 (−2,7 %), mais c'est invisible à ×6, pour +0,08 ms. Pas rentable.

### 3.4 Outils : clé du banc

`presetSettings(page, réglages, banc)` (`tools/polish/tech/common.mjs`) et `benchscene.mjs` écrivaient ou
lisaient encore `ombres.qualityBench.v1`. Depuis le passage de la clé en `v2`, les scripts qui imposent un banc
(`bgtab.mjs` en auto, et sept scripts de `tools/polish/fix2-tech/`) relançaient le banc au lieu de le sauter. Passé en
`v2`.

## 4. GPU au calme, 12 oiseaux (`perfmatrix.mjs --n=12 --speed=2`, p50 / p90 de l'image entière)

| Preset (canevas) | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre | i/s |
|---|---|---|---|---|---|---|
| Low (1280×720) | 3,97 / 4,47 | 3,88 / 4,38 | 4,14 / 4,53 | 4,21 / 4,62 | 4,60 / 5,97 | 60,3 |
| **Medium** (1920×1080, auto) | 6,33 / 7,00 | 5,97 / 6,49 | 6,32 / 6,78 | 6,38 / 6,87 | 6,92 / 7,34 | 60,3 |
| High (1920×1080) | 8,98 / 9,39 | 8,27 / 8,64 | 8,85 / 9,37 | 9,26 / 9,63 | 9,46 / 9,91 | 60,3 |
| Ultra (3840×2160) | 36,7 / 40,3 | 33,7 / 35,2 | 36,1 / 37,0 | 35,7 / 37,1 | 34,7 / 35,9 | 22-24 |

Aucune image au-delà de 20 ms, sauf en Ultra. Les chiffres concordent avec ceux du correcteur (un peu plus bas).
- **Budgets** : Medium ≤ 8,5 ms tenu, avec de la marge (p90 ≤ 7,34). High ≤ 10 tenu à 12 oiseaux. Low : p90 5,97 à
  la Grande Ombre pour un budget de 6 ms ; le seuil de descente est 6,6 ms, donc c'est juste.
- Ce tableau a été mesuré avant mes corrections, qui sont mesurées à part (§3) : Medium +0,01 ms, Ultra
  +0,11 ms, High et Low inchangés (même shader).
- **Qualité auto** : 9 bancs sur des contextes neufs. En page normale, **Medium 6 fois sur 6** ; dans mes
  2 parties accélérées (×3), Medium aussi. `autoquality.mjs` (partie accélérée ×6, 3 manches) : le banc a
  choisi **High** une fois. La surveillance l'a descendu en Medium après la manche 1, comme prévu (entre deux
  manches seulement), puis Medium a tenu les manches 2 et 3. Cette descente signifie un p90 GPU au-dessus de
  11 ms (budget 10 × 1,1) sur cette manche accélérée : c'est encore sous les 16,7 ms d'une image à 60 i/s.
  Les 60 i/s tiennent donc dans tous les cas (Medium p90 ≤ 7,3 ms à 12 oiseaux). Réglé à la main sur High, le
  jeu reste en High : la surveillance n'agit qu'en réglage auto. Un joueur peut donc voir, rarement, High à la 1re manche puis
  Medium. C'est le fonctionnement voulu, mais c'est visible.

## 5. Parcours de bout en bout (code final)

| Scénario | Résultat |
|---|---|
| `tools/e2e/solo.mjs` (8892, 3 manches, résultats, fin de partie, revanche) | vert, « aucune erreur console » |
| `tools/e2e/flows.mjs` (8892 : crédits, manette, 2e clavier, pause, téléphone en pleine manche) | « tout est vert », aucune erreur console |
| `tools/e2e/qa/prod.mjs` (`pnpm build`, PROD_PORT=8893 : chargement 3,1 s, téléphone, coupure et retour du serveur) | « tout est vert », console propre |
| `tools/e2e/qa/autoquality.mjs` (8892) | voir §4 |
| `verify-shots.mjs` : 5 vraies parties (auto 1080p et 4K, Ultra 1080p avant et après le §3.1, Ultra 4K) | console propre |

## 6. Ce qui reste (par ordre d'effet visible)

1. **Territoire** : marches de la grille et couture d'un pixel entre propriétaires, dans tous les presets.
   C'est le matériau du sol, pas l'encre. Piste de fix3-world §1.4 : fondre les deux lavis sur la couture.
2. **Medium** : dents de 1,2 px sur les silhouettes en biais en gros plan, et points clairs changeants sur les
   traits très fins. C'est la limite du G-buffer 900p. Leviers : passer au 1080p natif (+1,3 à 1,5 ms, hors
   budget), ou choisir High à la main sur cette machine, qui tient 60 i/s.
3. **Écrans 4K** : Medium et High y sont un 1080p étiré. Le preset « High 4K » proposé par le correcteur
   (G-buffer 1080p, encre en 2160p, échelle entière 0,5) reste la bonne piste. Avec `INK_WIDE`, l'encre saurait
   désormais y tracer des traits de 3 px.
4. Le SMAA MEDIUM de High éclaircit un peu les traits fins (`hachures-…`, colonne « sans SMAA ») pour 1,8 ms.
   À réévaluer.
5. `docs/research/npr-techniques.md` §4.11 dit encore « SMAA en medium/high, rien en low » : c'est un document
   de recherche, je ne l'ai pas modifié.

## Fichiers

- Code : `src/host/render/npr/InkEffect.ts` (`INK_WIDE` ; repli Medium), `src/host/render/npr/InkEffect.test.ts`
  (nouveau).
- Outils : `tools/polish/aa/verify-shots.mjs`, `tools/polish/aa/verify-sheets.mjs` (nouveaux) ;
  `tools/polish/tech/common.mjs` et `benchscene.mjs` (clé `v2`).
- Notes : `docs/agent-notes/world.md` (section « Vérificateur antialiasing »).
- Planches : `shots/verify-aa/` (JPEG). Les PNG intermédiaires ont été supprimés.
