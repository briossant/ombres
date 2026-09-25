# Ombres : règles du jeu (proposition « party game / accessibilité »)

Agent : design-party. Statut : proposition chiffrée, à consolider par le lead dans DECISIONS.md.
Entrées : `docs/BRIEF.md`, notes de faisabilité du lead, simulation numpy (scripts et figures dans `docs/research/design-party-assets/`).

---

## 0. En bref

1. Deux étages de vol, pas d'altitude à doser : HAUT (16 m) et BAS (4 m). Le bouton ▲ monte, le bouton ▼ pique.
2. HAUT : grande ombre pâle (rayon 12 m), oiseau rapide (22 m/s), intouchable, et c'est d'en haut qu'on pique. BAS : petite ombre forte (rayon 5 m), oiseau lent (16 m/s), et on peut se faire piquer.
3. Une seule règle de peinture : ton ombre recouvre le sable à ta couleur, sauf qu'une ombre pâle ne recouvre pas une couleur forte.
4. Piqué : ▼ depuis HAUT, 0,6 s, visée assistée sur un oiseau BAS proche. S'il est touché, il décroche 1,5 s (il ne peint plus), le sable sous lui éclabousse à ta couleur (disque fort de 10 m) et tu rebondis en HAUT.
5. Tours : là où tombe leur ombre, personne ne peint et le territoire est gelé. Couverture : 5 % de l'arène à midi, 33 % au coucher. C'est ce qui met du territoire « en banque » et empêche la dernière minute de tout effacer.
6. Soleil : élévation linéaire de 88° à 5° en 110 s (l'arc du soleil sert de chronomètre), puis 5 s de nuit qui traverse l'arène d'ouest en est et fige tout. Les 35 dernières secondes de soleil portent 60 % du potentiel de peinture.
7. Arène : ellipse bornée par un mur de tempête, dimensionnée pour tenir entière à l'écran (330 × 224 m pour 5-6 oiseaux).
8. Score : points de manche = nombre d'oiseaux devancés. 3 manches, la dernière compte double. Le meneur porte une couronne ; le piquer donne une tache deux fois plus grande.
9. Huit règles au total, toutes visibles à l'écran. Ni bonus, ni vent, ni objets.

---

## 1. Pitch et « règle en 3 images »

Phrase affichée sous le titre et pendant le chargement :

> Ton ombre peint le désert. À la nuit, le plus grand territoire gagne.

La règle en 3 images. Chaque vignette est animée en boucle de 2,5 s, avec une phrase de 12 mots au plus. Elles passent sur la télé pendant l'attente avant la première manche et restent affichées sur les téléphones pendant le lobby.

| # | Vignette animée | Texte |
|---|---|---|
| 1 | Un oiseau passe, son ombre laisse une bande colorée sur le sable. | Ton ombre peint le sable à ta couleur. |
| 2 | Un oiseau HAUT à grande ombre pâle ; un oiseau BAS à petite ombre foncée ; le HAUT pique sur le BAS, qui roule dans le sable ; tache de couleur. | ▲ Haut : grande ombre pâle. ▼ Bas : ombre forte, mais gare aux piqués. |
| 3 | Accéléré : le soleil descend, les ombres s'étirent sur des centaines de mètres, la nuit balaye tout. | Le soleil se couche. À la nuit, le plus grand désert gagne. |

### Les règles complètes (il n'y en a pas d'autres)

Cette liste est accessible depuis la pause (« Règles ») et sur le téléphone (icône « ? »).

1. Ton ombre peint le sable à ta couleur.
2. En haut, ton ombre est grande et pâle. En bas, elle est petite et forte. Une ombre pâle ne recouvre pas une couleur forte.
3. ▼ en haut : tu piques. Si tu touches un oiseau d'en bas, il décroche et le sable autour de lui prend ta couleur.
4. ▼ en bas : coup d'élan (accélération brève).
5. Dans l'ombre d'une tour, on ne peint pas. Si ton ombre y disparaît en entier, personne ne peut te piquer.
6. Le soleil se couche et les ombres s'allongent. La nuit arrive de l'ouest et fige tout.
7. À la nuit, le plus grand territoire gagne la manche. Tu marques un point par oiseau devancé. La dernière manche compte double.
8. Le meneur porte une couronne. Le piquer fait une tache plus grande.

---

## 2. Arène

### Forme et taille

- Ellipse, grand axe est-ouest. Les ombres s'étirent vers l'est et la caméra regarde vers le nord : elles s'allongent vers la droite de l'écran, l'axe le plus large. Avec un tangage caméra d'environ 55°, une ellipse de rapport 1,47 apparaît à l'écran avec un rapport proche de 16:9.
- L'arène entière tient à l'écran au dézoom maximal. Personne ne sort jamais du cadre, et les repères hors écran ne servent qu'en zoom serré.
- La taille dépend du nombre d'oiseaux N (bots compris) :

| N | Demi-axes a × b (m) | Surface (m²) | m² par oiseau (N max) | Largeur de vue au dézoom max | Oiseau (9 m d'envergure) à 1080p | Tours dans l'arène |
|---|---|---|---|---|---|---|
| 1-3 | 125 × 85 | 33 400 | 11 100 | 280 m | 62 px | 5 |
| 4 | 145 × 98 | 44 600 | 11 200 | 325 m | 53 px | 6 |
| 5-6 | 165 × 112 | 58 100 | 9 700 | 370 m | 47 px | 7 |
| 7-9 | 185 × 126 | 73 200 | 8 100 | 414 m | 42 px | 8 |
| 10-12 | 205 × 140 | 90 200 | 7 500 | 459 m | 38 px | 10 |

La densité augmente un peu avec N : à 12 oiseaux, c'est volontairement plus chaotique. En dessous de 38 px, les oiseaux deviendraient illisibles, d'où le plafond de 205 m.

- Grille de territoire : 512 × 352 cellules calées sur le rectangle englobant (≈ 0,65 m pour a = 165). On ne compte que les cellules dans l'ellipse. Si le lead préfère 512 × 512 carré, les lignes hors ellipse sont simplement ignorées.

### Bord : le mur de sable

- Bande de 12 m à l'intérieur du bord de l'ellipse : le vent y pousse vers le centre (30 m/s²) et réoriente le cap vers l'intérieur à 90°/s. On ne peut pas sortir. Pas de dégât ni d'étourdissement.
- Visuel : un rideau de sable en mouvement (ocre sombre, hachures animées), jamais une barrière invisible.
- Les ombres qui tombent au-delà du bord ne peignent pas : le sable hors arène est déjà de la tempête.

### Tours : plan « A » (5-6 oiseaux, validé en simulation)

Coordonnées en mètres, x vers l'est, y vers le nord, origine au centre. Les profils sont des empilements de segments de révolution (lathe) : fût (z0, r0 → z1, r1), disque, bulbe (sphère).

| Tour | Position | Profil | Rôle |
|---|---|---|---|
| T1 Grande Aiguille | (−70, 12) | fût r 7→5 de 0 à 50 m ; disque r 16 (50-53 m) ; flèche r 3→2 jusqu'à 80 m ; bulbe r 5 à 80 m | repère visuel ; son disque glisse d'ouest en est pendant la manche |
| T2 Parasol ouest | (−118, −48) | fût r 3,5 (0-26) ; disque r 15 (26-28) | refuge de midi, puis tache d'ombre mobile |
| T3 Parasol nord | (30, 62) | fût r 3,5 (0-24) ; disque r 14 (24-26) | idem |
| T4 Aiguille est | (70, −42) | fût r 3→2 (0-55) ; bulbe r 6 à 55 | longue ligne fine au coucher |
| T5 Bulbe sud | (−25, −70) | fût r 5→3 (0-42) ; bulbe r 10 centré à 30 m | ellipse d'ombre épaisse |
| T6 Colonne est | (112, 30) | fût r 9 (0-30) ; dôme r 9 | grosse bande près du bord est |
| T7 Aiguille nord-ouest | (−128, 60) | fût r 4→2,5 (0-46) ; bulbe r 5 | ligne qui traverse le nord |
| G1 Géante (hors arène) | (−240, −35) | fût r 10→7 (0-105) ; bulbe r 12 | son ombre entre dans l'arène à t ≈ 48 s et atteint le bord est à t ≈ 97 s |
| G2 Géante (hors arène) | (−235, 70) | fût r 9→6 (0-85) ; bulbe r 10 | entre à t ≈ 65 s, bord est à t ≈ 101 s |

Tous les fûts dépassent le plafond de vol (16 m) : ce sont des obstacles aux deux étages. Les disques des parasols, à 24 m et plus, restent au-dessus des oiseaux, qui passent dessous. Les deux Géantes se dressent dans la tempête, à l'ouest : on les voit à l'horizon dès le départ, et leurs ombres sont les « doigts de la nuit » qui annoncent la fin.

Mise à l'échelle pour les autres tailles : positions multipliées par (a/165, b/112), hauteurs inchangées. On retire T7 pour N = 4, puis T6 pour N ≤ 3 ; on ajoute une aiguille pour N = 7-9, puis un parasol et une aiguille de plus pour N = 10-12, toujours en respectant les couvertures cibles ci-dessous.

Couverture cible des ombres de tours (fraction de l'arène), à vérifier à chaque nouveau plan :

| t (s) | 0 | 30 | 60 | 80 | 90 | 100-110 |
|---|---|---|---|---|---|---|
| Plan A mesuré | 5,0 % | 6,5 % | 11 % | 19 % | 26 % | 32,5 % |
| Fourchette acceptable | 4-7 % | 5-9 % | 9-14 % | 16-22 % | 22-30 % | 30-38 % |

Variété : trois plans tournent d'une manche à l'autre, une partie de 3 manches les voit tous.

- A « Les Parasols » (ci-dessus) : beaucoup de refuges à midi, des taches d'ombre mobiles.
- B « Les Aiguilles » : 9 aiguilles fines en quinconce. Peu de refuges ; au coucher, elles découpent le désert en couloirs, comme un zèbre.
- C « La Cathédrale » : une tour centrale de 110 m à trois disques étagés (r 12/16/20 m), entourée de 4 petits bulbes. Au coucher, son ombre coupe l'arène en deux.

Espacement minimal entre fûts : 45 m (un oiseau BAS vire dans un rayon de 6,5 m ; il faut pouvoir slalomer à deux).

### Ce qui garde les joueurs proches (mécaniques explicites et visibles)

1. L'arène tient à l'écran : 330 m de large pour 5-6 oiseaux, traversée en 15 s en HAUT.
2. Le sable neutre s'épuise vite. En simulation avec 6 bots médiocres, 60 % de l'arène est prise à 20 s et 75 % à 40 s. Ensuite, gagner du terrain veut dire en voler, donc aller là où sont les autres.
3. La couronne : le meneur est affiché, et le piquer rapporte le double. Tout le monde a une raison de converger vers lui.
4. Au coucher, la zone éclairée rétrécit : les bandes d'ombre des tours et des Géantes, puis la nuit, gèlent 30 à 50 % de l'arène. Les oiseaux se retrouvent dans les mêmes couloirs de lumière.
5. Apparition sur un anneau à 45 % du rayon, cap tangent (sens anti-horaire) : premiers contacts dans les 10 premières secondes.

Pas d'arène qui rétrécit façon battle royale : elle effacerait ou rendrait inutile le territoire du bord, et c'est une règle de plus à expliquer.

---

## 3. Oiseau

| Paramètre | BAS | HAUT | Remarques |
|---|---|---|---|
| Altitude | 4 m | 16 m | seuil de niveau de peinture : 10 m |
| Vitesse de croisière | 16 m/s | 22 m/s | vitesse constante, on ne s'arrête jamais (planeur) |
| Virage max | 140°/s (rayon ≈ 6,5 m) | 110°/s (rayon ≈ 11,5 m) | accélération de lacet 720°/s² |
| Inertie de vitesse | τ = 0,25 s | τ = 0,25 s | lissage exponentiel vers la vitesse cible |
| Montée BAS → HAUT (▲) | 1,0 s (passe 10 m à 0,5 s) | | vitesse interpolée 16 → 22 m/s |
| Piqué HAUT → BAS (▼) | | 0,6 s, 34 m/s horizontal | voir § 6 |
| Coup d'élan (▼ en BAS) | 28 m/s pendant 0,6 s, virage 90°/s, recharge 4 s | | esquive et accélération de peinture |

- Direction : le joystick indique la direction voulue à l'écran (mode « absolu »). L'oiseau tourne vers ce cap à sa vitesse de virage max. Dans la zone morte (20 % du rayon), il garde son cap. L'amplitude du joystick ne change pas la vitesse : un enfant qui pousse à fond ou à moitié obtient le même oiseau.
- La caméra ne pivote pas en lacet pendant une manche (±10° de dérive lente au plus, pour cadrer le soleil au coucher). Sinon la direction « haut de l'écran » bougerait sous les pouces.
- Collisions entre oiseaux du même étage : sphères de 3,5 m, séparation élastique (impulsion 6 m/s), bouffée de plumes, petite vibration. Ni étourdissement ni effet sur la peinture. Deux oiseaux d'étages différents se croisent sans se toucher, sauf en piqué.
- Collision avec une tour (rayon du fût à l'altitude de l'oiseau + 3 m) : glissement tangent, −30 % de vitesse pendant 0,3 s, pas d'étourdissement. Une aide de trajectoire dévie le cap de 15° au plus si l'impact est prévu dans moins de 0,5 s (30° avec l'aide au vol, § 10).
- Lisibilité de l'étage, sans lire l'ombre : un oiseau BAS soulève une traînée de sable, un oiseau HAUT laisse deux filets d'air blancs au bout des ailes et le rendu l'agrandit de 10 % (la perspective seule, 12 m plus près d'une caméra à 300 m, ne se voit pas).
- Animation procédurale (brief) : ailes repliées en piqué, battements forts pendant la montée, inclinaison proportionnelle au taux de virage (max 50°), roulé-boulé dans le sable quand l'oiseau décroche.

---

## 4. Ombre et peinture

### Forme de l'ombre (identique au rendu et au gameplay)

Pour un oiseau au point P (altitude h), avec un soleil d'élévation e et d'azimut az, u étant la direction horizontale opposée au soleil :

- rayon : r(h) = 5 + 7 × (h − 4) / 12 m, soit 5 m en BAS et 12 m en HAUT (interpolé pendant les transitions) ;
- centre : C = projection au sol de P + u × h / tan(e) ;
- forme : ellipse de demi-axe r / sin(e) le long de u et r en travers ;
- niveau : fort si h < 10 m, pâle sinon.

Note pour le lead : un oiseau aux ailes à plat est un disque horizontal, et son ombre garde la même taille quelle que soit l'élévation (translation pure). Pour que les ombres d'oiseaux s'allongent comme l'exige le brief, on calcule l'ombre d'une sphère de rayon r(h), centrée sur l'oiseau. La croissance de r avec h joue le rôle de la pénombre stylisée. Rendu et gameplay utilisent la même ellipse, au pixel près.

Rendu : aplat d'encre d'opacité 0,85 (fort) ou 0,40 (pâle), bord adouci de ±0,75 m autour du contour exact (la ligne à 50 % est le contour qui peint), liseré de 1,5 px à la couleur du joueur. En BAS, la silhouette de l'oiseau se devine dans l'aplat. En HAUT, c'est une tache floue. À partir de l'heure dorée (e < 32°), un « fil d'ombre » pointillé à la couleur du joueur relie l'oiseau au centre de son ombre, qui peut alors tomber à 180 m de lui.

### Règle de peinture (à chaque tick de 30 Hz)

Une cellule compte si son centre est dans l'ellipse, dans l'arène, hors ombre de tour et hors nuit.

| Cellule avant | Ombre forte (BAS) | Ombre pâle (HAUT) |
|---|---|---|
| neutre | à toi, forte | à toi, pâle |
| à toi, pâle | à toi, forte | inchangée |
| à toi, forte | inchangée | inchangée (on ne s'affaiblit jamais soi-même) |
| adverse, pâle | à toi, forte | à toi, pâle |
| adverse, forte | à toi, forte | aucun effet : le liseré de l'ombre crépite, petit son « tink » |

- Deux ombres sur la même cellule au même tick : la forte gagne. À niveau égal, gagne l'ombre dont le centre est le plus proche. En cas d'égalité exacte, un tirage déterministe (hash tick × cellule).
- Pas d'usure : un territoire ne s'efface que si quelqu'un le repeint.
- Pour le score, pâle et fort comptent pareil (1 cellule = 1). Le niveau ne sert qu'à la défense.
- Rendu du territoire (lien avec le style Moebius) : fort = couleur saturée et hachures croisées serrées ; pâle = teinte à 45 % et hachures simples espacées. On lit « fort » ou « pâle » d'un coup d'œil, et le mode daltonien ajoute à la couleur un motif de hachure propre à chaque joueur (§ 14).
- Tache de départ : disque fort de 8 m sous chaque oiseau à l'apparition, pour que chacun repère sa couleur dès la première seconde.

Pourquoi deux niveaux et pas une intensité continue : « foncé bat clair » se lit instantanément avec deux valeurs, alors qu'avec une intensité continue il faudrait comparer 0,62 et 0,58 sur un écran partagé. La profondeur vient du choix d'étage (sûreté, vitesse et surface contre force et exposition), pas de la finesse du dosage.

### Ordres de grandeur (calculés, `tables.py`)

Débit de peinture = largeur balayée × vitesse. En volant nord-sud (perpendiculairement aux ombres), la largeur balayée est la longueur de l'ellipse.

| t (s) | e | Étirement 1/sin e | Décalage BAS / HAUT | Longueur d'ombre BAS / HAUT | m²/s BAS (fort) | m²/s HAUT (pâle) | % d'arène 5-6 par s (BAS / HAUT) |
|---|---|---|---|---|---|---|---|
| 0 | 88° | 1,00 | 0 / 0,6 m | 10 / 24 m | 160 | 528 | 0,28 / 0,91 |
| 30 | 65° | 1,10 | 1,8 / 7 m | 11 / 26 m | 176 | 581 | 0,30 / 1,0 |
| 60 | 43° | 1,47 | 4,3 / 17 m | 15 / 35 m | 236 | 778 | 0,41 / 1,3 |
| 80 | 28° | 2,16 | 7,6 / 31 m | 22 / 52 m | 345 | 1 138 | 0,59 / 2,0 |
| 90 | 20° | 2,91 | 11 / 44 m | 29 / 70 m | 466 | 1 537 | 0,80 / 2,6 |
| 100 | 12,5° | 4,60 | 18 / 72 m | 46 / 110 m | 737 | 2 431 | 1,3 / 4,2 |
| 105 | 8,8° | 6,56 | 26 / 104 m | 66 / 157 m | 1 049 | 3 462 | 1,8 / 6,0 |
| 110 | 5° | 11,5 | 46 / 183 m | 115 / 275 m | 1 836 | 6 058 | 3,2 / 10,4 |

- Au zénith, un oiseau BAS peint 160 m²/s, soit 6 minutes pour couvrir seul une arène de 5-6 joueurs. Au coucher, 1 840 m²/s, onze fois plus.
- En volant est-ouest (le long des ombres), le débit reste celui du zénith (160 / 528 m²/s) : voler perpendiculairement aux ombres est la compétence de fin de manche. Elle se découvre en jouant, parce qu'on voit la bande peinte s'élargir.
- Même à cap et altitude constants, l'ombre glisse toute seule vers l'est au coucher, à 7 m/s en BAS et 28 m/s en HAUT à e = 5°. Les ombres balayent le sable d'elles-mêmes.
- Un piqué au coucher fait passer le décalage de 183 m à 46 m en 0,6 s : l'ombre fouette le sable sur 140 m. C'est cohérent avec la géométrie, visible, et les experts s'en serviront (« le coup de fouet »).
- Potentiel de peinture par phase (intégrale de l'étirement, vol nord-sud) : Midi 15,5 %, Après-midi 24 %, Heure dorée 27 %, Coucher 34 %. La fin pèse le plus sans rendre le début inutile.

---

## 5. Soleil, durée et phases

- Élévation : e(t) = 88° − 83° × t / 110, linéaire de t = 0 à 110 s. La linéarité fait avancer le disque à vitesse constante sur l'arc du HUD, qui devient un chronomètre lisible ; le 1/sin(e) produit à lui seul l'accélération finale (figure `sim-courbes.png`).
- Azimut : az(t) = 270° − 30° × (1 − t/110)². Le soleil part du sud-ouest (240°) et se couche plein ouest. Les ombres pointent d'abord vers l'est-nord-est puis, dès l'heure dorée, franchement vers l'est (à droite de l'écran). Elles tournent quand elles sont courtes et que ça ne compte pas, et deviennent prévisibles quand elles comptent.
- Durée : 3 s de compte à rebours, 110 s de soleil, 5 s de nuit, 6 s de décompte. Environ 2 minutes par manche. Réglage « Durée » : Courte (80 + 4 s), Normale (110 + 5 s), Longue (150 + 6 s). Toutes les phases sont mises à l'échelle.

| Phase (bandeau à l'écran) | t (s) | e | Étirement | Ce qui se passe | Musique |
|---|---|---|---|---|---|
| Envol | −3 → 0 | 88° | 1 | oiseaux en pilote automatique, pas de peinture, « 3, 2, 1, Envol ! » | nappe |
| Midi | 0 → 35 | 88° → 62° | 1,00 → 1,13 | ruée sur le sable neutre ; ombres sous les oiseaux ; les parasols sont des refuges ronds | calme, percussions légères |
| Après-midi | 35 → 75 | 62° → 31° | → 1,92 | les vols commencent ; les fûts tracent des lignes ; la Géante sud entre à 48 s | pulsation |
| Heure dorée | 75 → 98 | 31° → 14° | → 4,1 | lumière chaude ; fil d'ombre affiché ; bandes d'ombre à travers l'arène | montée |
| Coucher | 98 → 110 | 14° → 5° | → 11,5 | ombres gigantesques ; « 10 secondes » à t = 105 | sommet |
| Nuit | 110 → 115 | 5° (figé) | 11,5 | un front de nuit balaye l'arène d'ouest en est (2a / 5 s, soit 66 m/s pour a = 165). Derrière lui, plus rien ne bouge ; devant, on peint encore | decrescendo |
| Décompte | 115 → 121 | | | caméra large, léger ralenti, la barre de territoire se fige, le gagnant s'illumine | silence, puis thème de victoire |

- À l'horizon : pendant la nuit, le disque solaire s'enfonce derrière la ligne des dunes ouest, et l'élévation des ombres d'oiseaux reste figée à 5° pour éviter l'explosion du 1/tan(e). Le front est une ligne nette, un peu dentelée (crête de dunes), visible de tous.
- Pourquoi un front et pas une extinction d'un coup : le front est un compte à rebours spatial que tout le monde comprend sans lire de chiffre. Il crée aussi une dernière course vers l'est, courte (5 s), lisible et spectaculaire. Si les playtests la trouvent confuse, repli : extinction uniforme en 2 s à t = 110.

---

## 6. Le piqué

### Déclenchement

- ▼ quand on est HAUT et que la recharge est prête. Pas de temps de préparation côté attaquant (réactivité ; la latence réseau coûte déjà 20 à 80 ms).
- Cible : parmi les oiseaux sous 10 m, non cachés, non invulnérables et non décrochés, dans un cône de ±45° autour du cap et à 30 m au plus à l'horizontale, on retient celui qui minimise distance × (1 + écart angulaire / 45°).
- Signal permanent : tant qu'un oiseau HAUT a une cible valide, un petit chevron à la couleur du chasseur flotte au-dessus de la cible. La cible voit donc qu'on la vise. Son téléphone fait « tic-tic » (au plus une fois toutes les 2 s) et le bouton ▼ du chasseur s'allume (« CIBLE »).
- Sans cible, ▼ fait simplement descendre en piqué (c'est aussi la seule façon de descendre).

### Déroulé et conditions de touche

- Durée 0,6 s ; l'altitude passe linéairement de 16 à 4 m ; vitesse horizontale de 34 m/s (environ 20 m parcourus) ; guidage vers la cible à 120°/s au plus.
- Touche : distance 3D entre les centres ≤ 5 m, à n'importe quel moment où l'attaquant est sous 10 m (les 0,3 dernières secondes).
- La touche est annulée si la cible passe au-dessus de 10 m (elle a monté à temps), si son ombre disparaît dans celle d'une tour, ou si un autre chasseur l'a touchée juste avant (elle est alors invulnérable).
- Arbitrage sur le PC (autorité) à 30 Hz.

### Effets

| | Touché | Raté |
|---|---|---|
| Victime | Décroche : 1,5 s sans contrôle ni peinture, roulé-boulé, glisse à 6 m/s dans l'axe du piqué. Reprend en BAS, puis 3 s d'invulnérabilité aux piqués (plumes hérissées, scintillement). Elle ne perd pas de territoire directement, seulement ce que couvre la tache. | Rien. |
| Sable | Tache forte à la couleur de l'attaquant, disque de 10 m (314 m²) centré sous la victime, 14 m (616 m²) si la victime porte la couronne. Hors ombres de tours et hors nuit. | Rien. |
| Attaquant | Rebond : remonte en HAUT en 0,8 s, pas de nouveau piqué pendant 2,5 s. Vibration sèche. | Reste BAS, freiné à 60 % de sa vitesse pendant 0,5 s, pas de nouveau piqué pendant 3 s. Il devient une proie. |

Ordres de grandeur. À midi, une touche vaut environ 2 s de peinture BAS (la tache) plus environ 240 m² que la victime ne peint pas. Au coucher, la tache pèse peu, mais la victime perd 1,5 s × 1 800 m²/s ≈ 2 700 m² de balayage, soit 4,6 % de l'arène. Tôt dans la manche, le piqué sert à voler du terrain ; à la fin, il sert à priver l'adversaire du sien. Cette évolution n'a pas besoin d'être expliquée : le soleil s'en charge.

### Contre-jeu (tout est visible)

1. Voir venir : le chevron au-dessus de soi, le « tic-tic » du téléphone, puis le cri et les ailes repliées. Une fois le piqué lancé, il reste environ 0,6 s pour réagir, assez pour un adulte et souvent pour un enfant attentif.
2. Crochet latéral : un virage serré à 140°/s fait perdre sa cible à un guidage de 120°/s si on le déclenche avant la moitié du piqué.
3. Coup d'élan (▼ en BAS) : 28 m/s pendant 0,6 s, souvent suffisant pour sortir du rayon de 5 m.
4. Remonter tôt (▲) : on passe 10 m en 0,5 s, donc il faut anticiper. Quand un chasseur tourne au-dessus de soi, remonter est le bon réflexe, au prix d'une ombre pâle.
5. Se cacher : mettre son ombre entière dans l'ombre d'une tour.

Anti-frustration : 3 s d'invulnérabilité après avoir décroché ; on ne peut jamais enchaîner deux fois la même victime en moins de 4,5 s. Et il existe toujours un choix sûr : rester en HAUT.

---

## 7. Les ombres des tours : « cachent et bloquent »

Sens exact :

1. Elles bloquent la peinture. Là où tombe l'ombre d'une tour, le sable n'est pas au soleil, donc l'ombre d'un oiseau n'y existe pas et ne peint pas. C'est la physique, et on la voit : ton ombre disparaît en y entrant.
2. Elles cachent le territoire. Les cellules sous une ombre de tour sont gelées : personne ne peut les repeindre tant que l'ombre est là. Le territoire y reste lisible (couleurs assombries, hachures visibles).
3. Elles cachent l'oiseau. Quand ton ombre est couverte à 90 % ou plus par l'ombre d'une tour, tu es caché : on ne peut ni te cibler ni te toucher. Ton oiseau prend une teinte sombre et son étiquette de nom s'estompe. La règle tient en une phrase : si on ne voit plus ton ombre, on ne te voit plus.

Évolution pendant la manche :

- Midi : ombres rondes au pied des tours. Les disques des parasols (rayon 14-16 m) forment des refuges où un oiseau BAS (ombre de 5 m) peut tourner en rond, caché mais improductif.
- Après-midi : les fûts tracent des lignes et les disques se détachent de leur tour. Ils glissent vers l'est à 0,5 à 3 m/s, et un oiseau qui veut rester caché doit les suivre en tournant.
- Heure dorée et coucher : les fûts deviennent des bandes de 5 à 20 m de large qui traversent l'arène, et les ombres des Géantes entrent par l'ouest. Les disques filent à 10, puis 45 m/s, et quittent l'arène. Le désert se découpe en couloirs de lumière. Une ombre d'oiseau de 115 m de long ne tient plus dans une bande de 10 m : se cacher devient presque impossible au moment où tout se joue, ce qui garde une fin ouverte.
- En chiffres (plan A) : 5 % de l'arène couverte à midi, 11 % à 60 s, 26 % à 90 s, 33 % de 100 à 110 s.

Effet stratégique : les tours mettent en banque. Un territoire qui passe sous une grande ombre au coucher est gelé jusqu'au décompte. Les bons joueurs apprennent que peindre fort à l'est des tours pendant l'après-midi protège ce terrain. C'est de la profondeur sans règle cachée, puisque les ombres s'allongent toujours du même côté, sous les yeux de tous.

Effet mesuré (simulation, 30 manches à 6 bots) : avec les tours, le meneur à t = 100 s gagne la manche 50 % du temps, contre 20 % sans tours ; la part du territoire qui change de main après t = 95 s tombe de 12,9 % à 8,2 %. Sans les tours, les 15 dernières secondes décident de presque tout ; avec elles, la fin reste tendue mais le début compte.

---

## 8. Éléments optionnels : aucun en v1

Aucun objet à ramasser, ni vent, ni thermique, ni événement aléatoire. Chaque élément ajouté doit être lu par un débutant sur un écran partagé, et le jeu a déjà trois sources de dynamique visibles : le soleil (escalade), les tours (géographie mouvante) et les autres oiseaux (conflit).

- Les objets ajoutent des règles et du bruit visuel au-dessus d'un sol déjà très coloré. Ils diluent aussi la lecture « foncé contre clair ».
- Vent et thermiques sont des forces invisibles ; les montrer (particules) encombre, et ne pas les montrer revient à une règle cachée.
- Les événements aléatoires (éclipse, tempête) volent au coucher de soleil son rôle de climax.

La couronne n'est pas un objet : c'est un marqueur d'état, affiché en permanence.

Variantes possibles après la v1, comme options de lobby désactivées par défaut : « Soleil pressé » (manche de 60 s), « Éclipse » (un disque d'ombre géant traverse l'arène à mi-manche), « Nuées » (nuages qui projettent des ombres mobiles). À n'envisager qu'une fois le cœur du jeu validé.

---

## 9. Score, manche, partie

### Manche

- Classement au décompte : nombre de cellules possédées (pâle = fort = 1). Affichage en % de l'arène, à une décimale.
- Points de manche = nombre d'oiseaux devancés (N − rang). À 4 : 3/2/1/0. À 12 : de 11 à 0. Des ex æquo prennent tous les deux le meilleur rang.
- Dernière manche ×2, annoncée par un bandeau avant la manche et par le narrateur.
- Pourquoi des rangs et non des surfaces : une victoire écrasante et une victoire serrée rapportent autant, ce qui limite l'effet boule de neige d'une manche à l'autre. Et « tu as battu 3 oiseaux » se comprend tout de suite.

### Partie

- 3 manches par défaut (réglable : 1, 3 ou 5). Le désert est remis à zéro et le plan de tours change à chaque manche.
- Vainqueur : total de points. Départage : manches gagnées, puis surface cumulée, puis victoire partagée (« Le désert refuse de choisir »).
- Couronne : le meneur de la manche en cours (surface) la porte, avec une hystérésis de 3 s pour éviter le clignotement. Seul effet : la tache d'un piqué sur lui passe à 14 m de rayon.
- Rattrapage, sans injustice cachée : (1) points au rang ; (2) dernière manche ×2 ; (3) couronne-cible ; (4) le coucher de soleil, qui permet à un deuxième bien placé de passer devant. Aucun bonus secret pour le dernier : il serait perçu comme de la triche par les adultes et incompris par les enfants.

### Entre les manches (10 s, passables quand tous les téléphones appuient sur « Prêt »)

La barre de territoire s'anime, les points s'ajoutent, puis un fait marquant de la manche (« Plus gros vol : Jade, 9 % en 3 s »). Le téléphone affiche les statistiques personnelles.

### Titres de fin de partie (chaque joueur en reçoit exactement un)

Attribution gloutonne : on calcule pour chaque paire (joueur, titre) l'écart de la statistique à la moyenne du groupe (z-score), on attribue la paire la plus forte, puis on retire ce joueur et ce titre, et on recommence. Un titre dont la statistique vaut 0 n'est pas attribué. Chaque titre s'affiche avec son chiffre.

| Titre | Statistique |
|---|---|
| Le Rapace | piqués réussis |
| Le Casse-croûte | fois où l'on a décroché |
| Le Pilleur | surface volée aux autres (sable adverse repeint) |
| Le Rase-Dunes | % du temps en BAS |
| Le Nuage | % du temps en HAUT |
| L'Horloger | surface gelée sous les ombres de tours au décompte |
| La Vague du Soir | surface peinte pendant Coucher + Nuit |
| Le Revenant | places gagnées dans les 20 dernières secondes d'une manche |
| Le Timide | temps passé caché |
| Le Bélier | collisions avec d'autres oiseaux |
| Le Kamikaze | piqués ratés |
| Roi d'un soir | temps passé avec la couronne sans gagner la manche |
| Le Bâtisseur | part du territoire peint avant 60 s encore détenue au décompte |
| Le Grand Voyageur | distance parcourue |

### Revanche

Écran final avec deux choix sur chaque téléphone : « Revanche » ou « Changer ». La revanche démarre quand tous les humains l'ont votée, ou après 20 s si une majorité l'a votée. On garde joueurs, couleurs, bots et réglages, et l'ordre des plans de tours est retiré au sort. « Changer » renvoie au lobby.

---

## 10. Contrôles

### Téléphone (paysage, écran toujours allumé)

- Moitié gauche : joystick flottant, qui apparaît sous le pouce (rayon 60 px CSS, zone morte 20 %).
- Droite : deux gros boutons superposés, l'ordre suivant le sens.
  - ▲ MONTER (en haut, 110 px). Grisé quand on est déjà HAUT.
  - ▼ PIQUER (en bas, 130 px, le plus gros car c'est l'action principale). Son libellé change selon le contexte : « PIQUER » en HAUT (« CIBLE ! » avec halo quand une cible est verrouillée), « ÉLAN » en BAS. Un anneau se remplit pendant la recharge.
- Les boutons se déclenchent à l'appui (pas au relâché), avec un tampon de 0,3 s pour un appui pendant une transition.
- Bandeau supérieur : couleur du joueur en fond, rang, % de territoire, couronne éventuelle, mini-arc du soleil.
- Réglage « Type de contrôle » :
  - Absolu (défaut) : le joystick donne la direction à l'écran.
  - Relatif : l'axe X du joystick tourne à gauche ou à droite, comme un volant.
  - Inclinaison : incliner le téléphone donne la direction (tangage vers Y, roulis vers X), à partir de la position enregistrée au « Prêt » (bouton « Recalibrer »). Zone morte 6°, amplitude max à 20°. Les boutons restent identiques.
- Aide au vol (par joueur, activable depuis son téléphone, icône plume visible à côté du nom) : cône de piqué ±60° et portée 40 m, évitement automatique des tours et du mur (30°), invulnérabilité de 5 s après avoir décroché. Pour les enfants et les débutants. Elle est affichée, donc ce n'est pas une règle cachée.

### Clavier (PC)

Touches lues par `KeyboardEvent.code` (position physique) : WASD devient ZQSD sur un clavier AZERTY sans configuration. Les libellés affichés passent par `navigator.keyboard.getLayoutMap()` quand il est disponible.

| Joueur | Direction | ▲ Monter | ▼ Piquer |
|---|---|---|---|
| Solo / dev | WASD ou flèches | Espace ou E | Maj gauche ou Q |
| Clavier 1 (côté gauche) | W A S D | E | Q |
| Clavier 2 (côté droit) | I J K L | O | U |
| Clavier 3 (optionnel) | Flèches | Maj droite | Ctrl droit |

Q et E encadrent la touche « haut », tout comme U et O : la même logique des deux côtés. Au-delà de deux joueurs sur un même clavier, le ghosting des claviers bon marché devient probable (le signaler dans le lobby). Manette (Gamepad API, en bonus) : stick gauche ; bouton nord (Y/△) pour monter, bouton sud (A/✕) ou gâchette droite pour piquer. Nord monte, sud descend.

On rejoint au clavier en appuyant sur la touche ▲ de son groupe dans le lobby.

### Vibrations (navigator.vibrate ; iOS Safari ne les gère pas, un flash visuel de l'écran du téléphone les remplace)

| Événement | Motif (ms) |
|---|---|
| Changement d'étage | 10 |
| Verrouillé par un chasseur | 30, 40, 30 (au plus une fois toutes les 2 s) |
| Piqué réussi (attaquant) | 40 |
| On décroche (victime) | 100, 50, 150 |
| Couronne gagnée | 20, 30, 20, 30, 60 |
| Collision oiseau ou tour | 15 |
| 10 dernières secondes | 15 à chaque seconde |
| Victoire de manche | 60, 40, 60, 40, 200 |

---

## 11. Bots

Les bots passent par la même couche d'entrée que les joueurs : ils produisent un vecteur de joystick et des appuis de boutons à 30 Hz, avec un temps de réaction et une vitesse de pouce limités. Ils ne trichent pas et ne bénéficient d'aucun élastique caché.

### Intentions (moteur d'utilité, réévalué à chaque replanification)

Chaque intention a une signature de vol reconnaissable à l'écran :

| Intention | Étage | Signature visible |
|---|---|---|
| Prendre du neutre | HAUT | grandes boucles paresseuses |
| Fortifier | BAS | sillons parallèles espacés de 10 m (labour) |
| Piller | BAS | ligne droite vers une grosse zone adverse ou vers le meneur, coup d'élan à l'entrée |
| Chasser | HAUT | spirale qui se resserre au-dessus de la proie pendant au moins 0,8 s avant le piqué |
| Se cacher | BAS | tourne en rond sous un parasol ou dans une bande d'ombre |
| Balayer (heure dorée et coucher) | BAS ou HAUT | lignes droites nord-sud, perpendiculaires aux ombres |
| Fuir | vers HAUT | crochet brusque puis montée |

### Personnalités

Chacune a un nom affiché (« Jade · Faucon ») et une icône dans le lobby.

| Bot | Poids dominants | Ce qu'on lit | Erreurs crédibles |
|---|---|---|---|
| Le Faucon | Chasser 50 %, Prendre du neutre 25 % ; préfère le meneur | tourne au-dessus des oiseaux BAS | pique de trop loin ; perd sa proie sous un parasol ; oublie de peindre (petit territoire) |
| La Fourmi | Fortifier 60 % | sillons nets et saturés dans « son » quartier | ne regarde jamais le ciel ; se fait piquer souvent ; ignore le coucher |
| Le Grand Voilier | Prendre du neutre 45 %, Balayer 30 % | immenses boucles pâles, balayages nord-sud impeccables au coucher | ses terres pâles se font dévorer ; frôle le mur de sable dans les grands virages |
| La Pie | Piller 50 % ; cible le meneur | fonce droit sur la couleur dominante | trop gourmande, s'aventure sous les chasseurs |
| Le Chat | Se cacher 30 %, Fortifier 40 % près des tours | reste près des tours, sort en raids courts | trop prudent ; se cache même sans menace ; panique quand il est verrouillé |
| Le Tourbillon | aléatoire pondéré, change d'intention toutes les 1 à 3 s | zigzags, loopings, bouscule volontairement | beaucoup ; pique sur n'importe qui ; réussit parfois un coup génial par hasard |
| L'Horloger (Normal et Difficile seulement) | Fortifier à l'est des tours avant 75 s, Balayer puis Piller au coucher | peint des zones qui seront sous les ombres des tours | trop méthodique ; lent à réagir aux piqués au milieu de la manche |

### Niveaux de difficulté (réglables par bot ou pour tous)

| Paramètre | Oisillon (facile) | Voyageur (normal) | Seigneur des sables (difficile) |
|---|---|---|---|
| Temps de réaction | 550 ms | 300 ms | 150 ms |
| Replanification | toutes les 1,5 s | 0,8 s | 0,4 s |
| Bruit de direction | ±20° | ±8° | ±2° |
| Verrouillage minimal avant de piquer | 1,5 s | 0,8 s | 0,3 s |
| Piqués lancés hors de la zone idéale | 30 % | 10 % | 0 % |
| Esquive quand il est verrouillé | 10 % | 45 % | 80 % |
| Conscience du soleil | aucune | balaye nord-sud quand e < 25° | anticipe le gel par les tours, se place à l'ouest avant la nuit, pique pour priver l'adversaire au coucher |
| Choix des victimes | 70 % bots ou meneur ; évite le dernier humain | meneur puis le plus proche | optimal |
| Accidents | heurte une tour environ une fois par minute, entre dans la tempête | rares | aucun |

Préférence du facile pour d'autres bots : c'est un comportement de bot, pas une règle du jeu, et il reste observable. Il évite qu'un enfant se fasse chasser par trois bots.

Composition par défaut : un joueur seul reçoit 3 bots Voyageur (Faucon, Fourmi, Voilier). Deux humains en reçoivent 2 (Pie, Chat). À partir de 4 humains, aucun bot n'est ajouté par défaut. Un joueur qui se déconnecte est remplacé par un bot Voyageur de personnalité « Fourmi », avec la mention « (remplaçant) », et reprend la main dès sa reconnexion.

---

## 12. Onboarding sans explication orale

1. Écran titre : des bots jouent une manche en fond, en accéléré (le coucher de soleil dure 40 s). On comprend le concept avant même de rejoindre.
2. Lobby jouable. Dès qu'un joueur a scanné le QR, son oiseau vole au-dessus d'une petite arène (90 × 60 m, un parasol, soleil fixe à 60°, territoire remis à zéro toutes les 30 s). Le téléphone propose trois micro-objectifs à cocher dans l'ordre : « Vole (joystick) », « Monte ▲ », « Pique ▼ » (sur un bot mannequin en BAS). Une coche apparaît sur le slot du lobby quand les trois sont faits. Personne n'a besoin qu'on lui explique quoi que ce soit.
3. Les 3 images passent avant la première manche de la session : 8 s d'écran, puis le compte à rebours. Les manches suivantes s'en passent.
4. Indications contextuelles pendant la première partie d'un téléphone (mémorisée en localStorage ; réactivables dans les réglages). Chaque indication apparaît en bulle près de l'oiseau concerné, à sa couleur, et en texte sur son téléphone. Au plus une toutes les 8 s par joueur, et deux fois par session au maximum.

| Déclencheur | Indication |
|---|---|
| Jamais monté après 12 s | ▲ Monte : ton ombre grandit. |
| Jamais descendu après 20 s | ▼ Descends : ton ombre devient forte. |
| Ombre pâle au-dessus de sable fort adverse pendant 2 s | Trop pâle ! Descends pour prendre cette couleur. |
| HAUT avec une cible verrouillée depuis 1,5 s sans piquer | ▼ Pique ! |
| Premier décrochage | Tu as décroché. En bas, surveille le ciel. |
| Ombre qui entre pour la première fois dans une ombre de tour | Ici, pas de peinture… mais tu es caché. |
| Début de l'heure dorée (pour tous, bandeau) | Les ombres s'allongent. Vole en travers ! (avec une flèche nord-sud animée) |
| Début de la nuit (bandeau) | La nuit arrive de l'ouest ! |
| Premier meneur de la partie | La couronne : pique-la pour une grosse tache. |

5. Le narrateur, sous-titré, renforce les mêmes idées aux mêmes moments.

---

## 13. Narrateur

### Règles de parole

- Voix calme et grave, conteur du désert. Sous-titre toujours affiché (bas centre, 3 s), voix désactivable.
- Au moins 10 s entre deux répliques, sauf « Dix secondes » et « Nuit » qui passent en priorité (4 s d'écart minimum). Jamais pendant le compte à rebours.
- 8 répliques par manche au plus. Chaque type d'événement parle au plus une fois par manche, sauf changement de meneur (3 fois, à 20 s d'écart au moins) et piqués (2 fois).
- File de priorité : si un événement plus prioritaire survient dans les 2 s, le moins prioritaire est abandonné, pas différé.
- Chaque réplique a 2 ou 3 variantes, et on ne rejoue jamais la même variante dans une partie.
- Les joueurs sont désignés par le nom de leur couleur ({C} l'acteur, {V} la victime). Les noms de couleur servent de noms propres (« Jade », « Corail »…), et les répliques sont écrites pour ne jamais accorder d'adjectif au genre du joueur. Les voix sont pré-générées phrase entière pour chaque couleur (environ 25 répliques × 12 couleurs × 2 langues ≈ 600 clips courts), parce que recoller un nom de couleur au milieu d'une phrase casse la prosodie.

### Événements, priorités et répliques

| Événement (priorité) | Condition | Réplique |
|---|---|---|
| Début de partie (1) | manche 1, t = 0 | Midi. Le sable n'appartient à personne. Ça ne va pas durer. |
| Début de manche suivante (2) | t = 0 | Le sable a tout oublié. Pas vous. |
| Annonce de la dernière manche (1) | avant le compte à rebours | Dernier coucher de soleil. Il compte double, et il le sait. |
| Heure dorée (3) | t = 75 s | Le soleil penche. Les ombres prennent leurs aises. |
| Coucher (2) | t = 98 s | Le soleil touche les dunes. Vos ombres sont plus grandes que vous, maintenant. |
| Dix secondes (1) | t = 105 s | Dix secondes. Le désert retient son souffle. |
| Nuit (1) | t = 110 s | La nuit arrive par l'ouest. Elle ne ralentit pour personne. |
| Changement de meneur (2) | nouveau meneur depuis 3 s | {C} prend la tête. Le vent change souvent d'avis. |
| | variante | {C} passe devant. Le soleil, lui, s'en doutait. |
| | variante | Le désert change de main. Il est à {C}, pour l'instant. |
| Gros vol (2) | ≥ 4 % de l'arène pris à un même joueur en 3 s | {C} vient d'emporter un morceau de désert. Un gros. |
| | variante (dite du point de vue de la victime) | Une ombre passe. Là-bas, {V} n'a plus rien. |
| Premier piqué réussi de la partie (3) | | {C} tombe du ciel. Sur {V}, précisément. |
| Piqué réussi (3) | au plus 2 par manche | {V} décroche. {C} ne s'excuse pas. |
| Meneur piqué (2) | la victime porte la couronne | Même les couronnes tombent, {V}. |
| Série de chasse (3) | 3 touches en 20 s par le même oiseau | {C} chasse. Les autres regardent le ciel plus souvent. |
| Caché longtemps (4) | caché ≥ 10 s d'affilée | {C} reste à l'ombre d'une tour. Prudence, ou sieste. |
| Mur de sable (4) | contact avec la tempête pendant ≥ 1,5 s | {C} a voulu traverser la tempête. Elle a dit non. |
| Remontée (2) | dernier à t − 30 s, sur le podium à la nuit | Tout à l'heure, {C} fermait la marche. Le sable a la mémoire courte. |
| Arrivée serrée (1) | écart entre les deux premiers < 1 % | Une poignée de sable d'écart. Les dunes en parleront longtemps. |
| Victoire de manche (1) | | Cette nuit, le désert est à {C}. Demain est un autre midi. |
| Victoire écrasante (1) | écart ≥ 12 points de % | {C} a tout repeint. Le désert n'a pas eu son mot à dire. |
| Égalité (1) | | Égalité. Le désert refuse de choisir. |
| Vainqueur de la partie (1) | | {C}. Le désert retiendra cette couleur. |
| Revanche lancée (2) | | Le soleil revient toujours. Vous aussi, apparemment. |

En pratique : 5 à 8 répliques par manche, toutes de moins de 3 s.

---

## 14. Risques de design et parades

| Risque | Pourquoi il est réel | Parade dans cette proposition |
|---|---|---|
| La fin efface tout, le début ne compte pas | l'étirement × 11 rend le coucher 11 fois plus productif que midi | le gel par les tours (33 % de l'arène en banque), les couleurs fortes que les ombres pâles ne touchent pas, les points au rang. En simulation, le meneur à 100 s gagne 50 % du temps au lieu de 20 % sans tours. |
| Fin illisible : ombres à 180 m de leur oiseau, qui se chevauchent | la géométrie de 1/tan(e) | plafond à 16 m, liseré de couleur sur chaque ombre, fil d'ombre pointillé, caméra qui cadre les oiseaux et le centre de leurs ombres, arène entière à l'écran |
| Enfant piqué en boucle | les adultes chassent mieux | 3 s d'invulnérabilité (5 s avec l'aide au vol), HAUT toujours sûr, décrochage court (1,5 s), bots faciles qui visent d'autres cibles |
| Tout le monde reste HAUT, sans interaction | c'est sûr et rapide | le pâle est repeint par n'importe quel passage BAS ; seul BAS prend le fort ; à partir de 40 s, gagner veut dire voler |
| Tout le monde reste BAS | l'ombre forte est la plus puissante | les chasseurs punissent ; HAUT peint 3,3 fois plus de surface par seconde ; HAUT est 37 % plus rapide |
| Camper dans l'ombre des tours | on y est intouchable | on n'y peint rien ; les refuges bougent et rétrécissent en fin de manche ; réplique moqueuse du narrateur |
| Chacun peint son coin, sans contact | l'arène est grande | 75 % du sable est pris à 40 s ; couronne ; couloirs de lumière au coucher ; apparition en anneau |
| Boule de neige sur la partie | un expert gagne tout | points au rang, dernière manche ×2, couronne |
| Débutant perdu | trop de choses à lire | 2 boutons, libellés contextuels, lobby jouable, 3 images, 8 règles, indications déclenchées par les situations |
| Chaos illisible à 12 | écran unique | arène adaptée à N, oiseaux de 38 px au moins, une teinte par joueur plus un motif en mode daltonien, étiquettes de nom affichées seulement au départ et lors des événements |
| Piqué injuste à cause de la latence | 20 à 80 ms | arbitrage sur le PC ; piqué de 0,6 s, soit plus de 7 fois la latence ; rayon de touche généreux (5 m) ; cible verrouillée visible avant le piqué |
| Ombres d'oiseaux physiquement fausses | un disque plat ne s'allonge pas | ombre de sphère assumée (§ 4), identique au rendu et au gameplay |
| Nuit injuste pour les joueurs de l'ouest | ils sont gelés 5 s plus tôt | tout le monde voit le front arriver et sait où il commence ; sinon repli sur une extinction uniforme |
| Daltonisme | 12 couleurs | mode daltonien : chaque joueur a son motif de hachure (6 angles × traits ou points) sur le territoire, le liseré d'ombre et l'écharpe de l'oiseau |
| Égalités fréquentes | rares avec 140 000 cellules | partage du meilleur rang, départage de partie défini |

---

## 15. Validation : simulation et critères de playtest

Simulation (`docs/research/design-party-assets/sim.py`, grille de 1,3 m, 10 Hz, bots heuristiques assez faibles, 30 manches par configuration, 6 oiseaux sauf mention contraire) :

| Configuration | Sable neutre restant (fin) | Meneur à 60 s gagnant | Meneur à 90 s gagnant | Meneur à 100 s gagnant | Territoire qui change de main après 95 s | Écart médian 1er-2e | Couverture des tours à 110 s |
|---|---|---|---|---|---|---|---|
| Base (plan A, nuit) | 13 % | 13 % | 47 % | 50 % | 8,2 % | 1,9 pt | 32,5 % |
| Sans front de nuit | 13 % | 20 % | 47 % | 50 % | 8,2 % | 2,0 pts | 33 % |
| Élévation finale 8° au lieu de 5° | 13 % | 20 % | 40 % | 47 % | 9,0 % | 2,4 pts | 32 % |
| Sans tours | 9 % | 20 % | 37 % | 20 % | 12,9 % | 2,6 pts | 0 % |
| 4 oiseaux, arène 150 × 100 | 17 % | 40 % | 40 % | 50 % | 6,7 % | 2,3 pts | 36 % |

Lecture : des bots de même niveau donnent des manches serrées (environ 2 points d'écart), ce qui est souhaitable. Les tours stabilisent nettement la fin. Descendre à 5° plutôt que 8° ne rend pas le jeu plus aléatoire. Le piqué a été mal modélisé dans cette simulation (bots trop peu chasseurs) : ses chiffres viennent du raisonnement du § 6 et devront être réglés en jeu. Les figures `sim-snapshots.png` (état de l'arène à 20, 60, 90, 104 et 112 s) et `sim-courbes.png` sont dans le même dossier.

Critères à mesurer dans les parties complètes de bots Voyageur (à automatiser, cf. brief « fais jouer des parties entières aux bots ») :

- sable neutre < 25 % à t = 45 s (N = 6) ;
- couverture des tours dans les fourchettes du § 2 ;
- meneur à t = 100 s gagnant entre 45 et 65 % ; territoire changeant de main après 95 s entre 6 et 14 % ;
- 8 à 15 piqués tentés par manche à 6 oiseaux, 35 à 55 % de réussite ; aucun oiseau touché plus de 5 fois dans une manche (médiane ≤ 2) ;
- part du temps en BAS entre 30 et 60 % (tous bots confondus) : si l'un des deux étages domine, rééquilibrer par les vitesses ;
- au moins 1 changement de meneur après t = 90 s dans 50 % des manches ;
- Difficile contre 3 Faciles : gagne au moins 80 % des manches. Facile contre 3 Difficiles : gagne au moins 1 manche sur 10 (sinon, ajuster les erreurs volontaires).

---

## 16. Constantes (point de départ du réglage)

```ts
export const RULES = {
  tickHz: 30,
  round: { countdown: 3, sunSeconds: 110, nightSeconds: 5, tallySeconds: 6,
           elevStartDeg: 88, elevEndDeg: 5, azStartDeg: 240, azEndDeg: 270,
           phases: { midi: 0, apresMidi: 35, heureDoree: 75, coucher: 98, nuit: 110 },
           lengthPresets: { courte: 80, normale: 110, longue: 150 } },
  layers: { lowAlt: 4, highAlt: 16, tierSplitAlt: 10, climbTime: 1.0, diveTime: 0.6 },
  shadow: { rLow: 5, rHigh: 12, opacityStrong: 0.85, opacityPale: 0.40, softEdge: 0.75,
            threadMaxElevDeg: 32 },
  flight: { speedLow: 16, speedHigh: 22, speedTau: 0.25, turnLowDeg: 140, turnHighDeg: 110,
            yawAccelDeg: 720, deadzone: 0.2 },
  sprint: { speed: 28, time: 0.6, cooldown: 4, turnDeg: 90 },
  dive: { speed: 34, range: 30, coneDeg: 45, homingDeg: 120, hitRadius: 5, hitMaxAlt: 10,
          stun: 1.5, stunDriftSpeed: 6, invuln: 3, splashR: 10, splashRLeader: 14,
          cooldownHit: 2.5, cooldownMiss: 3, missSlowFactor: 0.6, missSlowTime: 0.5, rebound: 0.8 },
  assist: { coneDeg: 60, range: 40, invuln: 5, towerAvoidDeg: 30 },
  bump: { radius: 3.5, impulse: 6 },
  tower: { collisionMargin: 3, slideSlow: 0.3, slideTime: 0.3, avoidDeg: 15, avoidLookahead: 0.5,
           hideCoveredFrac: 0.9 },
  arena: { sizes: [ { maxBirds: 3, a: 125, b: 85, towers: 5 }, { maxBirds: 4, a: 145, b: 98, towers: 6 },
                    { maxBirds: 6, a: 165, b: 112, towers: 7 }, { maxBirds: 9, a: 185, b: 126, towers: 8 },
                    { maxBirds: 12, a: 205, b: 140, towers: 10 } ],
           stormBand: 12, stormAccel: 30, stormTurnDeg: 90, spawnRing: 0.45, spawnPatchR: 8,
           grid: [512, 352] },
  score: { defaultRounds: 3, lastRoundMultiplier: 2, leaderHysteresis: 3 },
  narrator: { minGap: 10, urgentGap: 4, maxPerRound: 8 },
  hints: { minGap: 8, maxRepeatsPerSession: 2 },
} as const;
```

---

## 17. Décisions proposées

1. Deux étages discrets (BAS 4 m, HAUT 16 m), transitions de 1,0 s en montée et 0,6 s en piqué. Pas d'altitude continue.
2. Deux boutons : ▲ Monter ; ▼ Piquer (en HAUT) ou Élan (en BAS). Joystick en direction absolue à l'écran, vitesse constante.
3. Peinture à deux niveaux (fort / pâle). Seule exception : une ombre pâle ne recouvre pas une couleur forte. Pas d'usure. Score = cellules possédées.
4. Ombre d'oiseau = ombre d'une sphère de rayon r(h) = 5 → 12 m : ellipse r × r/sin(e), décalée de h/tan(e). Même formule pour le rendu et la peinture.
5. Soleil : élévation linéaire de 88° à 5° en 110 s ; azimut de 240° à 270° (formule quadratique) ; puis front de nuit ouest → est en 5 s. Manche d'environ 2 minutes, préréglages 80 / 110 / 150 s.
6. Arène elliptique entièrement visible à l'écran, taille selon le nombre d'oiseaux (de 250 × 170 m à 410 × 280 m), mur de sable de 12 m.
7. Ombres de tours : pas de peinture, territoire gelé, oiseau caché si son ombre est couverte à 90 % ou plus. Couverture cible : 5 % à midi, 30-38 % au coucher. Deux tours Géantes hors arène à l'ouest.
8. Trois plans de tours (Parasols, Aiguilles, Cathédrale) en rotation d'une manche à l'autre.
9. Piqué : cône de ±45° sur 30 m, 0,6 s, touche à 5 m ; décrochage de 1,5 s, invulnérabilité de 3 s, tache de 10 m (14 m sur le meneur), rebond ; un raté laisse l'attaquant en BAS, freiné, avec 3 s de recharge.
10. Aucun objet, vent, thermique ni événement aléatoire en v1.
11. Points de manche = oiseaux devancés ; 3 manches ; dernière ×2 ; couronne du meneur ; 14 titres, un par joueur.
12. Six personnalités de bots plus l'Horloger, trois niveaux ; les bots passent par la couche d'entrée commune, sans élastique caché.
13. Onboarding : lobby jouable avec trois micro-objectifs, règle en 3 images, indications contextuelles à la première partie, aide au vol visible par joueur.
14. Narrateur : au moins 10 s entre répliques, 8 par manche au plus, répliques pré-générées phrase entière par couleur, sous-titres toujours affichés.
15. Clavier par position physique (`code`) : jusqu'à 3 joueurs (WASD+Q/E, IJKL+U/O, flèches+Maj/Ctrl droits).
16. Caméra sans rotation en lacet pendant la manche ; soleil couchant à gauche, ombres vers la droite de l'écran.
