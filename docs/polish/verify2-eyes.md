# Regard final, vague 2 : directeur artistique et joueur débutant

Date : 2026-09-26, 19 h 29 à 20 h 15. Serveur de dev sur le port 8863, arrêté à la fin par son PID. Toutes les pages
Playwright tournaient sans HMR (`tools/polish/staging/nohmr.mjs`). Un autre vérificateur (port 8861) mesurait le GPU
en même temps avec un script qui attend l'absence de tout Chrome étranger : ses mesures propres sont reprises au §3.5.
J'ai pollué son premier essai High (relancé par son script) ; ensuite, je n'ai lancé Chrome que dans ses creux. Les
cadences d'image de mes parties ne sont donc pas des mesures.

Scripts : `tools/polish/verify2-eyes/` (copies de `verify-eyes/` qui écrivent dans `shots/polish2/verify-eyes/`, plus
`fpsline.mjs` et `crownring.mjs`). Planches : `shots/polish2/verify-eyes/sheets/`.

## 1. Ce que j'ai joué et regardé

| Scénario | Contenu | Captures |
|---|---|---|
| Groupe FR, PC + iPhone 15 Pro + Pixel 7 + bots, 3 manches (manche 3 : Le Cadran) | chargement, titre (24 images), menu, réglages, crédits, salon vide / 1 / 2 téléphones / en vol, cartes, 21 instants par manche, 9 rafales de touche ou d'esquive, nuit, résultats, téléphones, podium (8 images), fins de partie, revanche, pause PC et téléphone | `group-fr/` (216 images) ; planches `g-*` |
| Solo au clavier, EN, High | titre, salon clavier, cartes EN, pause + réglages, 3 manches à 12 instants (Parasols, Géantes, Cadran), résultats, podium EN | `solo-en/` (65) ; `s-*` |
| 12 oiseaux (2 claviers + 10 bots), High | salon à 12, une manche toutes les 5 s, daltonien, Grande Ombre, nuit, résultats | `twelve/` (35) ; `twelve-a/b`, `twelve-x3-golden.jpg` ; après correctif : `twelve-after/` |
| Titre 3 min | 1 image par seconde (152), puis 90 s après mes correctifs (101 à 0,8 s) | `title-3min/`, `title-after/` ; `t-0..6`, `ta-0..3` |
| Podium rapide | 4 et 12 oiseaux, plan pur à 0,9 et 2 s, panneau à 5 et 8 s | `podium-{4,12}-1920/` ; `podium-fast.jpg` |
| Entrée de la Grande Ombre sur Le Cadran | `tools/polish/climax/shots.mjs`, graines 3 et 11 (non vues par climax), 4 et 6 oiseaux, 98,5 / 101 / 104 / 108 s | `shots/polish2/climax/verify2-cadran/` ; `cadran-gs.jpg` |
| Anneau de couronne au titre | 10 × « crown » émis sur tous les oiseaux de la démo | `crownring/` ; `crownring.jpg` |
| GPU High à 12 | `perfmatrix --q=high --n=12 --speed=1` (le mien, en partie contaminé), `fpsline.mjs`, et la mesure propre du vérificateur 8861 | §3.5 |

Console : aucune erreur ni avertissement sur le PC et les deux téléphones du groupe, en solo, à 12, au titre, au
podium ni pendant l'essai de l'anneau. `rawKeys` vide partout.

## 2. Corrections faites pendant la revue (4 Edits ciblés, notés dans `docs/agent-notes/REQUESTS.md`)

1. **Anneau d'encre seul dans le ciel au titre** (`src/host/render/fx/system.ts`, `drawCrownRing`). Le « petit cercle
   noir » signalé par title (`shots/polish2/title/final-menu/095`) est l'anneau de prise de couronne. Au titre, les
   oiseaux sont en gros plan : la couronne se pose sur la capuche (`controller.updateCrown`, envergure 170-230 px),
   mais l'anneau, dessiné pendant la bascule avant que la nouvelle couronne n'apparaisse, retombait sur sa place
   théorique, 3 m au-dessus du cavalier. Il flottait donc seul dans le ciel. Il suit maintenant la même règle que
   la couronne. Preuve : `sheets/crownring.jpg` et `crownring-00-crop.jpg`, où l'anneau se contracte autour du cavalier.
   En jeu (envergure < 170 px), rien ne change.
2. **Damier en losanges dans les aplats en gros plan** (`src/host/render/world/groundMaterial.ts`). La « bande de
   pigment » de world (vague 2) lit un champ de distance à 2,6 m par texel. En plongée proche au titre
   (≈ 0,05 m/px), ses marches de 25 à 50 px dessinaient un quadrillage en losanges dans les pâles (`title-3min/011`,
   rose ; recadrage dans le scratchpad). La bande est faite pour la distance de jeu : elle s'estompe maintenant sous
   ~0,2 m/px (`smoothstep(0.1, 0.22, du)`). En vue de jeu (≥ 0,3 m/px), rien ne change. Après :
   `sheets/ground-closeup-after.jpg` et `ground-closeup-after2.jpg`, aplats lisses en gros plan.
3. **Traits de rappel des étiquettes seuls à 12** (`src/host/ui/screens/hud.css`). L'étiquette entre en fondu
   (200 ms), mais le trait de rappel apparaissait plein d'emblée. À 12, on voyait donc des bâtons d'encre isolés,
   parfois en travers d'une autre étiquette (`twelve/026` : trait sur « Anis · Fou », fantôme « Laboureur »). Le
   trait a maintenant le même fondu. Vérification : `twelve-after/` (§3.3).
4. **Rattrapage d'un coup de la jumelle du titre** (`src/host/camera/demoFuture.ts`, signalé par tech). Quand le
   navigateur n'est jamais au repos, `requestIdleCallback` appelle par délai limite (`timeRemaining() = 0`) et la
   jumelle n'avançait pas. `begin()` rattrapait alors `HEAD_START` ticks à la bascule (16 à 36 ms sur machine
   saturée). Elle avance maintenant de 4 ticks (~2 ms) par appel de ce type. Tests caméra : 81 verts, dont la jumelle
   au tick près. Pas remesuré sous charge : la machine était calme et l'autre vérificateur mesurait.

Contrôles : `tsc --noEmit` 0 erreur ; `vitest src/host/camera src/host/render` 125 verts ; `check:boundaries` OK.

## 3. Les cinq écarts de la vague 1, vérifiés à l'image

Légende : ✔ corrigé à l'image ; ◐ nettement mieux mais pas fini ; ✘ non corrigé.

### 3.1 Ouverture de la Grande Ombre (S2 + S3 + W9) : ◐+ (de ✘/◐)

- **Taille des oiseaux : ✔.** À 4 oiseaux, les plans de 98,6 à 109,6 s sont serrés, avec des oiseaux de 100 à 190 px
  (`group-fr/088`, `139`, `184`, `188`, `189` ; `solo-en/027-030`, `043-044`, `057-058`). Le front de nuit est dans le
  cadre et la poussée part avant l'annonce. Avant, ils faisaient 40 à 50 px, avec l'arène entière. C'est le plus
  gros gain de la vague 2.
- **Voile moiré : ✔ disparu.** Plus aucun disque fantôme tramé sur 40 % du cadre.
- **Encore visible, par gravité :**
  1. **Parasol en premier plan à l'entrée** : `solo-en/041` (Géantes, 99 s) cadre bas, avec un parasol plein
     sur ~8 % de l'image au premier plan gauche et l'oiseau à ~60 px. C'est l'image la plus faible de toutes mes
     parties.
  2. **Coupe franche des parasols dissous** : `solo-en/028` (plein centre) et `group-fr/188`. Le disque est tranché
     net, avec une frange tramée, juste à côté de l'oiseau couronné. Cela se lit comme une vue en coupe
     volontaire, mais cela attire l'œil.
  3. **Le Cadran, graines 3 et 11** : max 16,4 % de tours peintes (graine 3, 4 oiseaux, 101-104 s), et un plan
     moyen à 108 s (278 m, 81 px). À 6 oiseaux, max 10,2 %. C'est conforme à la limite annoncée par climax.
  4. **Escaliers des cellules du territoire en plan serré rasant** (`sheets/gs-edges-139-x2.jpg`) : marches d'environ
     3 × 10 px, soulignées par le plomb du couchant. C'est un effet de bord du plan serré (cause au §5).

### 3.2 Titre (S4) : ✔ pour les ratés francs, ◐ pour le goût

- **253 images regardées (152 + 101)** : aucune tour devant le logo ou l'oiseau, aucune image vide, aucune tête sous le
  logo, pas de boucles de bouts d'aile géantes. Avant : 3 ratés francs sur 24 (~15 %).
- **Encore discutable (~5 %)** :
  - tranche de tour ou de parasol au bord du cadre (`title-3min/108`, `125-127`, `title-after/063`, `074`) ;
  - oiseau qui frôle le pied de page ou « Press any key » (`title-3min/146`, `148`, `149`, `title-after/043`, `094-095`) ;
  - forêt de fûts en travers (`title-after/086-087`).
- **Plongées sur la peinture du soir** (`title-3min/111-118`, `title-after/044-049`) : graphiques, mais « tapis » violet
  et carmin saturé. C'est la même limite que la matière (§3.4).
- **Plans du couchant et contre-jours** (`t-1` 033-043, `title-after/050-053`) : superbes, ce sont les images de
  la bande-annonce.

### 3.3 Lisibilité à 12 (B1, B5) : ◐+ (de ◐)

- `sheets/twelve-x3-golden.jpg` : à × 3, on identifie les six oiseaux recadrés à leur bande (blanc-jaune, lilas,
  vert, orange-rouge, bleu, turquoise). La bande est large et la couleur tient à l'heure dorée. À 1:1
  (`twelve/020`), la couleur se lit sur la plupart des oiseaux. Ils restent petits (60-65 px), parce que l'arène est
  cadrée entière à 12 : c'est un choix de mise en scène.
- Côté nuit de la Grande Ombre à 12 (`twelve/026-027`) : les oiseaux sont petits et sombres, et on s'y retrouve
  surtout par les étiquettes et les jetons.
- Traits de rappel orphelins : corrigés (§2.3). Dans `twelve-after/` (57 images, console propre), les traits
  arrivent avec leur étiquette, empilées et reliées (`sheets/twelve-after-labels.jpg`, `twelve-after/047`), sans
  bâton isolé.

### 3.4 Territoire du soir (W4, W4 bis) : ✔ pour la teinte, ◐ pour la densité

- Les ombres sur Safran et Corail sont violettes ou mauves (`group-fr/088`, `139`, `solo-en/039`), et non plus rouille.
  La moitié nuit passe en mauve et lie-de-vin (`group-fr/190`, `solo-en/044`). Les rayures d'ombre se lisent comme une
  seule couche. C'est franchement mieux qu'en vague 1.
- Reste le « tapis de Twister » au couchant, surtout à 12 (`twelve/023-024`) et au titre en plongée. L'aquarelle
  (bande de pigment) se voit en plan serré, peu en plan d'arène.

### 3.5 GPU (W3) : ◐ (de ✘)

Mesure propre du vérificateur 8861 (`perffree.sh`, aucun Chrome étranger pendant la passe, charge 1,9 à 3,6),
comparée au relevé calme de la critique tech en vague 1 (p90 en ms) :

| High, 12 oiseaux, vitesse 1 | Midi | Après-midi | Heure dorée | Couchant | Grande Ombre |
|---|---|---|---|---|---|
| Vague 1 (critique tech) | 10,3 | 10,6 | 11,1 | 11,0 | 11,4 (57 i/s, 6,6 % > 20 ms) |
| Vague 2 (8861, essai 2) | 10,7 | 9,7 | 10,6 | 10,7 | 10,7 (60 i/s, 0 % > 20 ms) |
| Vague 2 (le mien, phases non contaminées) | – | – | 10,5 | 10,7 | 10,8 (60 i/s) |

La cible de 9,5 ms n'est pas tenue, sauf l'après-midi. Le climax, lui, ne perd plus d'images à 60 i/s. En Medium à 12,
le p90 va de 7,1 à 8,6 ms à 60 i/s, et en Low de 4,1 à 4,7 ms. Mes deux premières phases (42 i/s) étaient en concurrence avec l'autre
vérificateur et sont écartées.

## 4. Non-régression des gains de la vague 1

| Gain | Verdict | Image |
|---|---|---|
| S1 cadrage utile | ✔ | aucun oiseau sous la bande de sable ; repères hors champ en bas (`solo-en/041`, `044`) |
| S5 / B3 / H6 podium | ✔ | pas de mât, couronne sur la tête, plan pur à 0,9-2 s puis UI (`g-podium`, `podium-fast`) |
| S6 punch-in | ✔ | touche serrée (`group-fr/116-119`) |
| W4 à W11 | ✔ | ombres nettes, nuit lisible, lèvre corail, rideau en aplat (`group-fr/190-191`), hachures des tours |
| W8 pâle contre sol | ✔ | pâles lisibles à midi (`group-fr/107-108`, `solo-en/018`) |
| B2 traînées fantômes | ✔ | comptes à rebours propres (`group-fr/101`, `152`) |
| B4 couronne en jeu, B7 esquive | ✔ | `solo-en/028`, rafales `group-fr/110-113` |
| H1 étiquettes | ✔ (+ correctif du trait) | aucune bulle superposée |
| H2, H3, H5, H7, H9, H10 | ✔ | salon, jetons à 12, bandeau fin de la Grande Ombre, cartes, touches, QR |
| Téléphones (P1, P3) | ✔ | profils, salon, manette, « RATÉ… », pause, fins de manche et de partie (`g-lobby`, `g-r3-b`, `g-podium`) |
| Narrateur | ✔ à l'image | sous-titres nets, nom de couleur à pastille (« chez ● Indigo, ce soir. », `sheets/sub-comma.jpg`). L'espace avant la virgule du journal vient d'`innerText`, pas de l'écran. |

Aucune régression vue.

## 5. Reste à faire, par impact

1. **Premier plan de la Grande Ombre sur Parasols et Géantes** (`solo-en/041`) et **coupe franche des parasols
   dissous** (`solo-en/028`). Il faut compter la couverture du chapeau du parasol au premier plan, pas seulement
   au-dessus de 4 m. Pour la coupe, élargir la bande tramée sur un disque, ou dissoudre le chapeau entier plutôt que
   la partie proche.
2. **W3** : 10,6 à 10,7 ms de p90 en High à 12, contre 9,5 visés. Pistes world : A/B au calme de la bande de pigment
   (+0,4 à 0,9 ms estimés) ; SMAA déjà en LOW.
3. **Escaliers du territoire en plan serré rasant** : `territory()` choisit la B-spline si
   `du = max(|dxz|, |dyz|) < 0,3` ; en vue rasante, `dyz` dépasse toujours ce seuil. `min(...)` lisserait ces plans,
   pour un coût à mesurer (demande notée dans REQUESTS, pour world).
4. **Densité du couchant** (tapis), à 12 et dans les plongées du titre : c'est une décision de DA, voir world §4.
5. **Titre** : environ 5 % d'images discutables (tour au bord, oiseau frôlant le pied de page).
6. **Non vérifié par moi** : le son, P2, P4, P7, les formats 4:3 et 21:9 au titre, l'à-coup de la bascule du titre
   sous forte charge après mon correctif (§2.4), et le retour du contexte WebGL (tech l'a scénarisé).

## 6. Verdict honnête

**Le saut depuis la vague 1 est réel, et le jeu tient maintenant l'« indé soigné » partout, pas seulement par
moments.** Les deux défauts qui se voyaient à chaque manche et à chaque lancement ont disparu à l'image :
- la Grande Ombre s'ouvre en plan serré, avec des oiseaux de 100 à 190 px et le mur de nuit dans le cadre ;
- le titre n'a plus de raté franc sur 253 images.

La matière du soir a enfin des ombres froides. Le climax tient 60 i/s sans perte d'image sur la machine de dev.
Deux parties complètes, une manche à 12 et 4 min 30 de titre se sont déroulées sans une erreur console.

**Est-ce qu'on serait bluffé que ce soit fait par une IA ?** Oui pour l'écran titre au couchant, le podium en
contre-jour, les plans serrés de la Grande Ombre et l'interface papier du PC au téléphone. Un œil exercé verrait
encore, par ordre d'impact :
- une ouverture de climax ratée de temps en temps (parasol au premier plan, parasol coupé net) ;
- le « tapis » saturé au couchant à 12 ;
- des marches de pixels sur les bords de territoire en plan rasant ;
- un GPU High à 12 un peu au-dessus de sa cible.

Aucun de ces défauts ne casse la lecture du jeu.
