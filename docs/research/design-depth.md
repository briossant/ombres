# Ombres : règles complètes, angle « profondeur / compétitif »

Auteur : agent game design (profondeur). Statut : proposition chiffrée, à consolider par le lead.
Toutes les valeurs numériques ont été vérifiées par calcul ou par simulation (scripts dans
`docs/research/design-depth-sim/`, voir §14). Les noms en `code` sont des clés de réglage proposées
pour `tuning.ts` (récapitulatif complet en §16).

---

## 0. L'essentiel en une page

Le jeu repose sur une seule ressource : **l'altitude**. Elle décide de la forme de ton ombre (donc
de ce que tu peins), de ta place dans la chaîne alimentaire (qui peut piquer sur qui) et de ce que
le soleil couchant fera de toi. Tout le reste découle de la géométrie de la lumière, affichée au
pixel près.

| Élément | Valeur retenue |
|---|---|
| Manche | 150 s de soleil (85° → 8°) + 5 s de « Grande Ombre » + 2 s de nuit. 3 manches par partie, la dernière compte double |
| Arène | Cuvette circulaire, rayon 90 m (2 oiseaux) à 166 m (12 oiseaux), bordée d'un Mur de sable |
| Altitude | 3 m (ras du sable) à 22 m (plafond), 30 m possible seulement dans un thermique |
| Ombre | ellipse 10 × 5 m au ras du sable, ×2,6 au plafond ; teinte `d = 1/k` de 1,0 à 0,38 ; étirée de `min(1/sin e, 6)` le long du soleil ; décalée de `h / tan e` |
| Peinture | chaque passage dépose ~0,6 d'encre ; une cellule ne peut pas être plus foncée que l'ombre qui la peint ; la plus sombre des ombres superposées gagne |
| Piqué | cible 5 à 12 m plus bas ; mire visible ; touche = la victime décroche 1,5 s et **sa traînée des 1,5 dernières secondes passe à ta couleur** ; raté = c'est toi qui décroches 1,2 s |
| Esquive | le « grand battement » (appui sur MONTER) entre 0,4 et 0,1 s avant l'impact |
| Tours | leur ombre fige le sable (ni peinture ni vol) et cache les oiseaux (impossible de les piquer, mais ils ne peignent pas) |
| Garder les joueurs proches | arène bornée et dimensionnée par joueur, thermique mobile au centre, zone éclairée qui rétrécit au crépuscule, Grande Ombre finale |
| Équilibrage (simulation) | aucune stratégie d'altitude pure ne domine : la stratégie minoritaire gagne (équilibre mixte), parts de 21 à 24 % à 4 oiseaux |

---

## 1. Pitch et règle en 3 images

**Phrase affichée à l'écran titre et au lobby :**

> Ton ombre peint le sable. Au coucher du soleil, le plus grand désert gagne.

Variante affiche / bande-annonce : « Vole. Ton ombre peint le sable. Au coucher du soleil, on compte. »

**La règle en 3 images** (carte plein écran avant la première manche d'une session, 6 s, passée dès que
tous les téléphones ont tapé « OK ») :

| Image | Dessin | Légende (max 10 mots) |
|---|---|---|
| 1. TON OMBRE PEINT | Un oiseau vu de 3/4, sa traînée de couleur derrière lui sur le sable | « Ton ombre peint le sable à ta couleur. » |
| 2. HAUT OU BAS | Deux oiseaux côte à côte : l'un haut avec une grande ombre pâle, l'autre bas avec une petite ombre foncée. Une flèche montre la petite ombre foncée qui recouvre la pâle | « Haut : grand et pâle. Bas : petit et fort. » |
| 3. PIQUE | Un oiseau replie ses ailes et fond sur un oiseau plus bas ; la traînée de la victime change de couleur | « Fonds sur un oiseau plus bas : vole sa traînée. » |

Bandeau commun sous les trois images : « Au coucher du soleil, le plus grand désert gagne. »
Les ombres des tours, l'esquive et la Grande Ombre s'apprennent en jeu, par indications contextuelles (§12).

---

## 2. Arène

### 2.1 Forme et taille

La **Cuvette** : un cratère circulaire plat, fermé par le **Mur de sable** (rideau de sable tournoyant,
bien visible, ~12 m d'épaisseur). À l'horizon, côté couchant, une ligne de **mesas** qui culmine à 8° :
c'est derrière elles que le soleil disparaît (§5).

Rayon selon le nombre total d'oiseaux N (humains + bots) :

| N | 1-2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rayon R (m) | 90 | 100 | 110 | 120 | 130 | 136 | 142 | 148 | 154 | 160 | 166 |
| Aire (k m²) | 25,4 | 31,4 | 38,0 | 45,2 | 53,1 | 58,1 | 63,3 | 68,8 | 74,5 | 80,4 | 86,6 |
| m² par oiseau | 12,7k | 10,5k | 9,5k | 9,0k | 8,8k | 8,3k | 7,9k | 7,6k | 7,5k | 7,3k | 7,2k |
| Cellule (grille 512²) | 0,38 m | 0,42 | 0,46 | 0,50 | 0,54 | 0,56 | 0,59 | 0,61 | 0,63 | 0,66 | 0,68 |

Formule : `R = 90` si N ≤ 2, `90 + 10(N-2)` jusqu'à 6, puis `130 + 6(N-6)`. La grille 512×512 couvre
le carré `[-(R+8), R+8]²` ; seules les cellules du disque de rayon R comptent.

Pourquoi ces tailles : la simulation montre que l'équilibre entre « peindre large et pâle » et « peindre
petit et fort » dépend de la pression de contestation. Avec 12,7k m² par joueur en duel, les trois
styles d'altitude forment un cycle (§14) ; à 19k m² (R = 110 en duel), voler haut dominait. La
densité baisse doucement avec N parce qu'à 8-12 joueurs le chaos est de toute façon la règle et
que la caméra doit rester lisible.

### 2.2 Le Mur de sable

- À partir de `R - 6 m`, un vent visible (stries de sable) pousse l'oiseau vers le centre :
  accélération radiale de 25 m/s² × (pénétration / 12 m).
- Au-delà de R : l'oiseau ne peint plus (le sable hors arène n'existe pas pour le score), il est
  secoué, et son cap est ramené vers le centre à 60°/s.
- Limite dure à `R + 6 m`.
- Une ombre qui tombe hors de l'arène (fréquent au crépuscule, voir §4.5) s'affiche grisée sur le mur :
  le joueur voit tout de suite qu'elle ne peint rien.

### 2.3 Tours

Trois archétypes façon Moebius, tous des empilements de segments de révolution (profils « lathe »),
ce qui rend leurs ombres calculables exactement (capsules + cercles). Tous les éléments larges
(disques, chapeaux, bulbes) sont **au-dessus de 26 m**, donc au-dessus du plafond de vol normal :
en vol, l'obstacle se réduit au fût.

| Archétype | Hauteur | Fût (rayon) | Éléments larges | Rôle de jeu |
|---|---|---|---|---|
| Grande Flèche (centre) | 72 m | 6 m | disque r 16 m à 58 m, disque r 10 m à 36 m | repère central, parasol large à midi, immense règle d'ombre au couchant |
| Champignon | 46 m | 4,5 m | chapeau r 13 m à 42 m | parasols mobiles l'après-midi (cachettes, zones scellées) |
| Aiguille | 34 m | 3,5 m | bulbe r 7 m à 27 m | petites ombres nettes, bandes fines au couchant |

Disposition (graine aléatoire par manche, rotation de l'ensemble ±180°, gigue angulaire ±10°) :

| Rayon d'arène | Grandes Flèches | Champignons (anneau 0,45 R) | Aiguilles (anneau 0,78 R, décalées) | Total |
|---|---|---|---|---|
| 90-100 m | 1 | 2 | 3 | 6 |
| 110-130 m | 1 | 3 | 4 | 8 |
| 136-166 m | 1 (2 si N ≥ 10, à ±0,2 R du centre) | 4 | 5 | 10-11 |

Contraintes : 40 m minimum entre deux fûts (l'oiseau vire sur un rayon de 11,5 m), 15 m minimum
entre un fût et le Mur de sable, thermique jamais à moins de 25 m d'un fût.

Collision avec un fût : l'oiseau glisse le long du fût, perd 30 % de vitesse, 0,3 s de flottement,
pas de décrochage.

### 2.4 Ce qui garde les joueurs proches (explicite et visible)

1. **Arène bornée et dimensionnée par joueur** (tableau ci-dessus) : dans le pire cas, deux oiseaux
   aux antipodes sont à 180-330 m, ce que la caméra cadre encore.
2. **Le thermique** (§8) : colonne de sable tournoyante qui erre dans le disque central (r < 0,45 R).
   C'est le seul moyen de dépasser le plafond, donc le seul moyen de piquer sur ceux qui campent en
   haut. Il attire chasseurs et proies.
3. **La lumière rétrécit** : au crépuscule, les ombres des tours figent 14 à 16 % de l'arène en longues
   bandes, puis la Grande Ombre avale le désert d'un bord à l'autre en 5 s. Les dernières secondes se
   disputent sur une bande éclairée de plus en plus étroite.
4. **Le piqué récompense la proximité** : on ne peut frapper qu'un oiseau à 15-45 m devant soi.
5. **Le sable vierge s'épuise** : 36 % de neutre à 40 s, 20 % à 80 s, 9 % à la fin (simulation, 4
   oiseaux) ; passé la première minute, marquer des points veut dire aller chez les autres.

### 2.5 Caméra (contraintes de design)

- Inclinaison 55° : à midi, l'ombre (juste sous l'oiseau) apparaît sous lui à l'écran au lieu
  d'être masquée par son corps.
- Cadre = boîte englobante des oiseaux **et des centres de leurs ombres** + 15 % de marge, largeur
  minimale 90 m, maximale = arène + 10 %. Au crépuscule, les ombres s'éloignent des oiseaux et la
  caméra recule naturellement vers le plan large.
- Le soleil se couche **à gauche ou à droite de l'écran** (tiré au sort, alterné d'une manche à l'autre) :
  les grandes ombres du soir s'allongent dans le sens de la largeur 16:9, et la Grande Ombre traverse
  l'écran comme un rideau latéral.

---

## 3. Oiseau

### 3.1 Cinématique

| Paramètre | Valeur | Commentaire |
|---|---|---|
| Envergure (visuel) | 10 m | taille de l'ombre au ras du sable |
| Altitude min | 3 m | « ras du sable », les pointes d'ailes frôlent les dunes |
| Plafond | 22 m | MONTER n'a plus d'effet au-dessus |
| Plafond thermique | 30 m | au-dessus de 22 m hors thermique : descente de 3 m/s |
| Vitesse de croisière (plané) | 20 m/s | vitesse constante, le joystick ne règle que le cap |
| MONTER maintenu | +7 m/s vertical, 14 m/s horizontal | de 3 à 22 m en 2,7 s |
| Rien appuyé | descente douce 1,2 m/s | de 22 à 3 m en 16 s : rester haut demande de battre ~15 % du temps |
| Taux de virage | 100°/s en plané (rayon 11,5 m) ; 130°/s en montée (rayon 6,2 m) ; 75°/s en piqué libre | battre des ailes permet de virer serré |
| Inertie | accélération 12 m/s², décélération 10 m/s² ; le cap rejoint le joystick au taux max | |
| Survitesse après piqué | décroît vers 20 m/s avec τ = 1,5 s | |
| Grand battement (appui sur MONTER) | impulsion 18 m/s dans la direction du joystick (cap si neutre) pendant 0,3 s, +6 m/s vers le haut ; recharge 2,5 s | c'est l'esquive (§6) ; recharge visible (pointes d'ailes blanches quand prêt) |
| Collision entre oiseaux | si l'écart d'altitude est inférieur à 2,5 m et la distance à 6 m : poussée latérale de 6 m/s chacun, pas de décrochage | pas d'empilement, pas de dégâts |
| Tick de simulation | 30 Hz fixe (peinture comprise), rendu interpolé à 60 fps | |

### 3.2 Pourquoi l'altitude est une vraie ressource

- Monter coûte du temps et de la vitesse (14 m/s au lieu de 20) ; rester haut coûte ~5 % de vitesse
  moyenne (battements réguliers).
- Descendre est gratuit mais irréversible sans remonter : chaque piqué consomme l'altitude accumulée.
- L'altitude fixe la **couche** où tu vis : au ras du sable tu es une proie pour les oiseaux à 8-15 m ;
  à mi-hauteur tu chasses le bas et tu es chassé par le haut ; au plafond tu es intouchable sauf depuis
  un thermique (§6.2, §8).

---

## 4. Ombre et peinture

### 4.1 Géométrie de l'ombre (identique en gameplay et en rendu)

Notations : soleil d'élévation `e` et d'azimut `α`, `u = (cos α, sin α)` = direction horizontale **vers**
le soleil. Oiseau en `(x, y)`, altitude `h`, cap `θ`.

```
k(h)  = 1 + 1.6 × (min(h,22) − 3) / 19          // 1.0 au ras du sable → 2.6 au plafond
d(h)  = 1 / k(h)                                  // teinte : 1.00 → 0.38
ellipse locale : demi-axes a = 5·k (envergure, ⟂ au cap), b = 2.5·k (le long du cap), orientée par θ
σ(e)  = min(1 / sin e, 6)                         // étirement le long de u
centre = (x, y) − h · cot(e) · u                  // décalage vers l'opposé du soleil
empreinte au sol = ellipse locale, puis étirée de σ le long de u, puis translatée au centre
```

L'image affine d'une ellipse est une ellipse : test d'appartenance d'une cellule = une transformation
inverse et un produit scalaire. Le shader du sol dessine **exactement** cette ellipse (contour à l'encre
de la couleur du joueur) : ce qui est affiché est ce qui peint. L'étirement est plafonné à 6 pour les
oiseaux (un oiseau n'est pas une sphère, c'est un modèle de jeu) ; les tours, elles, utilisent la
géométrie exacte sans plafond.

Au-dessus de 22 m (thermique), l'ombre ne grandit plus (`k` plafonné à 2,6).

### 4.2 Règles de peinture (par cellule, à chaque tick, dt = 1/30 s)

1. Les cellules **figées** (ombre d'une tour, Grande Ombre) ne changent jamais.
2. Parmi les empreintes qui couvrent une cellule éclairée, **la plus sombre gagne** (plus grand `d`).
   Si les deux plus sombres appartiennent à deux joueurs différents et diffèrent de 0,04 ou moins :
   personne ne peint cette cellule ce tick-ci (« choc d'encre », petites éclaboussures visibles).
3. Pression déposée : `q = 2.4 × d × dt`.
4. Selon le propriétaire actuel :
   - toi : `I ← min(I + q, d)` si `I < d` ; ton ombre ne fait jamais **baisser** ta propre cellule ;
   - personne : la cellule devient tienne, `I ← min(q, d)` ;
   - un adversaire : `I ← I − q` ; si `I < 0`, la cellule devient tienne avec `I ← min(−I, d)`.
5. Un oiseau caché (ombre de tour, §7), décroché (§6) ou dont l'ombre est dans la Grande Ombre ne peint pas.

Score = nombre de cellules possédées / cellules de l'arène, quelle que soit leur intensité.

### 4.3 Ce que « pâle » et « fort » veulent dire exactement

Le temps de passage d'une ombre sur une cellule vaut `longueur / vitesse = 5k / 20 = 0,25·k` s.
La pression d'un passage vaut donc `2,4 × (1/k) × 0,25·k = 0,6` au centre de l'ombre (0,47 en moyenne
sur la largeur) **quelle que soit l'altitude**. Toute la différence tient dans le plafond de teinte :

| Altitude | k | Teinte max d | Ombre (m) | Rendu du territoire | Pour le prendre, il faut… |
|---|---|---|---|---|---|
| 3 m | 1,00 | 1,00 | 10 × 5 | **Encre** : aplat saturé + hachure croisée | 2 passages de n'importe qui (1 seul le long du soleil après ~95 s) |
| 7 m | 1,34 | 0,75 | 13 × 7 | Encre (seuil bas) | 2 passages |
| 12 m | 1,76 | 0,57 | 18 × 9 | **Trait** : aplat + hachure simple | 1 passage au centre, 2 sur les bords |
| 17,6 m | 2,23 | 0,45 | 22 × 11 | Trait / voile | 1 passage |
| 22 m | 2,60 | 0,38 | 26 × 13 | **Voile** : aplat pastel à ~40 %, sans hachure | 1 passage de n'importe qui |

Seuils de rendu proposés : voile < 0,45 ≤ trait < 0,75 ≤ encre. Une cellule en cours d'érosion garde
la couleur de son propriétaire mais pâlit : on voit le vol arriver.

Règle à dire aux joueurs : « Haut : grand et pâle, facile à voler. Bas : petit et fort, il faut
repasser pour le prendre. »

### 4.4 Ordres de grandeur

Aire balayée par un oiseau (m²/s), vol « en travers » du soleil (ailes alignées sur les rayons) :

| Altitude | Zénith (e = 85°) | Heure dorée (e = 12°, σ = 4,8) | Dernier rayon (e ≤ 9,6°, σ = 6) | Facteur |
|---|---|---|---|---|
| 3 m | 200 | 960 | 1 200 | ×6 |
| 12 m | 350 | 1 690 | 2 110 | ×6 |
| 22 m | 520 | 2 500 | 3 120 | ×6 |

À 4 oiseaux (arène de 38 000 m²), un oiseau au plafond qui balaie en travers du soleil dans les 15
dernières secondes couvre **8 % de l'arène par seconde**. C'est le « balayer d'immenses zones en
quelques secondes » du brief, obtenu sans règle spéciale.

### 4.5 Deux façons de voler au couchant (profondeur émergente)

L'étirement se fait le long des rayons. L'orientation du vol change donc la nature de la peinture :

| Vol | Largeur de bande | Pression par passage (centre) | Usage |
|---|---|---|---|
| **En travers** du soleil | ×σ (jusqu'à 60 m au ras du sable, 156 m au plafond) | 0,6 (inchangée) | balayer le neutre et le pâle |
| **Le long** du soleil | inchangée (10 à 26 m) | 0,6 × σ (2,9 à e = 12°, 3,6 à la fin) | **creuser** : un seul passage prend même l'encre |

Autres effets émergents de la géométrie, tous visibles :

- **Le décalage** : au couchant, l'ombre d'un oiseau au plafond tombe 100 à 157 m derrière lui (à
  l'opposé du soleil). On pilote alors son ombre à distance ; un fil de lumière pointillé (couleur du
  joueur) relie l'oiseau à son ombre dès que le décalage dépasse 15 m.
- **Le coup de fouet** : monter ou descendre déplace l'ombre le long des rayons à `vitesse verticale ×
  cot e`. Un piqué libre (−14 m/s) à e = 9° la fait glisser à ~85 m/s : une longue bande peinte en une
  seconde.
- **Le côté soleil** : au couchant, un oiseau haut doit se placer côté soleil pour que son ombre reste
  dans l'arène. Les hauts migrent vers le couchant, les bas restent où ils peignent.

---

## 5. Soleil

### 5.1 Courbe d'élévation

Interpolation linéaire entre images-clés (vitesse angulaire différente par phase, lisible et réglable) :

| t (s) | 0 | 20 | 40 | 60 | 80 | 95 | 110 | 120 | 130 | 135 | 140 | 145 | 150 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| e (°) | 85 | 73,5 | 62 | 49,6 | 37,3 | 28 | 22 | 18 | 14 | 12 | 10,7 | 9,3 | 8 |
| σ = 1/sin e (plafonné 6) | 1,00 | 1,04 | 1,13 | 1,31 | 1,65 | 2,13 | 2,67 | 3,24 | 4,13 | 4,81 | 5,40 | 6 | 6 |
| Décalage ombre h = 3 / 12 / 22 m | 0/1/2 | 1/4/7 | 2/6/12 | 3/10/19 | 4/16/29 | 6/23/41 | 7/30/54 | 9/37/68 | 12/48/88 | 14/56/104 | 16/64/117 | 18/73/134 | 21/85/157 |
| Ombre de la Grande Flèche (72 m) | 6 m | 21 | 38 | 61 | 95 | 135 | 178 | 222 | 289 | 339 | 382 | 438 | 512 |

Clés : `[[0,85],[40,62],[95,28],[135,12],[150,8]]`. On commence à 85° et pas 90° pour que les ombres
aient une direction dès la première seconde (le joueur apprend tout de suite où elles vont s'allonger).
La pointe de l'ombre de la Grande Flèche avance à ~1 m/s à midi, ~8 m/s à l'heure dorée, ~13 m/s à la fin.

### 5.2 Azimut

`α(t) = α_coucher − 60° × (1 − t/150)`. Le soleil commence « derrière » la scène (haut de l'écran, ombres
courtes pointant vers le bas) et pivote de 60° jusqu'à se coucher sur le côté (gauche ou droite de l'écran,
±20°). Les ombres des tours tournent comme des aiguilles pendant qu'elles s'allongent : ~0,4°/s, soit
1,4 m/s au bout d'une ombre de 200 m. Lent, prévisible, visible.

### 5.3 L'horizon et la Grande Ombre

À t = 150 s, le soleil passe derrière la ligne des mesas (8°). Leur ombre traverse la Cuvette **en 5 s**
depuis le bord côté soleil jusqu'au bord opposé (vitesse `2R/5`, de 36 à 66 m/s selon l'arène). Visuellement,
un mur bleu-violet balaie le désert ; le soleil continue de 8° à 6° derrière les mesas.

- Toute cellule recouverte est figée.
- Un oiseau est « dans la Grande Ombre » quand **le centre de son ombre** l'est (équivalent physique exact :
  le rayon qui l'éclairait passe sous la crête). Il ne peint plus et ne peut plus être piqué.
- Conséquence visible : les ombres décalées loin du soleil (oiseaux hauts) sont prises en dernier. La
  dernière seconde appartient à qui a placé son ombre sur le bord opposé au couchant.
- 2 s de nuit immobile, puis décompte.

La simulation confirme que la fin reste ouverte sans rendre le début inutile : le leader à t = 120 s
gagne la manche dans 33 à 46 % des cas à 4 oiseaux de même niveau (25 % serait le hasard pur, 100 %
un jeu joué d'avance), et le dernier changement de leader survient en moyenne à t = 133-145 s.

### 5.4 Phases de la manche

| Phase | Temps | e | Ce qui change en jeu | Musique | Narrateur / téléphone |
|---|---|---|---|---|---|
| Envol | −3 à 0 s | 85° | les oiseaux tournent en attente (pilote auto), peinture coupée | intro | « 3, 2, 1 » ; vibration courte à 0 |
| Zénith | 0-40 s | 85→62° | ombres sous les oiseaux ; ruée sur le sable vierge (neutre 79 % → 36 %) ; parasols des tours autour des fûts | calme, vent | réplique d'ouverture |
| Après-midi | 40-95 s | 62→28° | les ombres se décalent et s'allongent (σ 1,1→2,1) ; les parasols dérivent loin des tours ; premières bandes figées | percussions légères | (événements) |
| Heure dorée | 95-135 s | 28→12° | σ 2,1→4,8 : creuser le long du soleil devient possible, les balayages en travers s'élargissent | couche 2 (cordes, pulsation) | « Les ombres s'allongent… » |
| Dernier rayon | 135-150 s | 12→8° | σ = 6 ; décalages de 100 m+ ; ombres des tours au maximum | couche 3, pleine intensité | « Le soleil touche les mesas » ; battement de cœur haptique les 10 dernières s |
| Grande Ombre | 150-155 s | 8→6° | le rideau d'ombre fige le désert en 5 s | montée puis coupure | « La nuit traverse le désert » |
| Nuit | 155-157 s | | tout figé ; puis décompte animé | silence, puis thème des résultats | vainqueur de la manche |

HUD : un cadran solaire en arc en haut de l'écran, avec le soleil qui avance **linéairement en temps**
(la courbe d'élévation n'est pas linéaire, le cadran si), graduations aux changements de phase, arc
doré à l'heure dorée et orangé au dernier rayon.

---

## 6. Piqué

### 6.1 Déroulé

1. **Mire.** Dès qu'un adversaire remplit les conditions de verrouillage (6.2), un petit anneau à la couleur
   de l'attaquant s'affiche autour de la cible sur l'écran, et le bouton PIQUER du téléphone de l'attaquant
   s'allume à la couleur de la cible. La mire est publique : la future victime la voit aussi.
2. **Verrouillage.** L'attaquant maintient PIQUER : il replie les ailes et fond sur la cible (guidage
   automatique). La victime reçoit l'alerte : chevron rouge au-dessus d'elle, sifflement qui monte, double
   vibration.
3. **Engagement** à 0,5 s de l'impact : ailes claquées contre le corps (son sec « clac », traînée blanche),
   trajectoire désormais balistique, plus de correction. Vibration courte « maintenant » chez la victime.
4. **Résolution** : touche (distance 3D ≤ 4 m, attaquant au-dessus) ou esquive.

Avant l'engagement, relâcher PIQUER **annule** le piqué sans pénalité (feinte), au prix de l'altitude déjà
perdue. Sans mire, PIQUER maintenu est un **piqué libre** : −14 m/s vertical, vitesse portée à 30 m/s,
utile pour descendre vite peindre fort, fuir ou fouetter son ombre au couchant. Une cible qui devient
valide pendant un piqué libre est verrouillée automatiquement.

### 6.2 Conditions de la mire (toutes visibles par ses effets)

| Condition | Valeur | Justification |
|---|---|---|
| Écart d'altitude | la cible est 5 à 12 m plus bas | 5 m minimum : il faut de l'élan. 12 m maximum : de trop haut on ne vise plus. C'est ce plafond qui empêche le camping au plafond (§14) |
| Direction | cible dans ±80° du cap | on pique devant soi |
| Distance | interception prévue entre 0,6 et 1,5 s (≈ 15 à 45 m) | 0,6 s garantit un temps de réaction à la victime |
| Faisabilité | la mire n'apparaît que si le piqué **toucherait une cible qui ne réagit pas** (le serveur simule le piqué, ≤ 45 pas de 1/30 s, contre une cible en ligne droite) | un piqué raté l'est toujours à cause de la victime, jamais du hasard |
| Cible | pas cachée à l'ombre d'une tour, pas dans la Grande Ombre, pas décrochée, pas invulnérable | |
| Attaquant | pas décroché, recharge de piqué terminée (1 s après la fin du précédent) | |

Guidage pendant le piqué : vitesse horizontale portée à 32 m/s (accélération 30 m/s²), taux de virage
110°/s vers le point d'interception prévu, vitesse verticale adaptée pour arriver à l'altitude de la cible
(entre 4 et 22 m/s). Si la cible entre dans l'ombre d'une tour avant l'engagement, la mire tombe et
l'attaquant se redresse sans pénalité.

### 6.3 Effets

**Touche.** La victime **décroche** : 1,5 s sans contrôle, chute à −12 m/s jusqu'au ras du sable, vitesse
réduite à 8 m/s, elle ne peint plus (ombre grisée). **Toutes les cellules qu'elle a peintes pendant les
1,5 s avant l'impact et qui lui appartiennent encore (non figées) passent à la couleur de l'attaquant**, en
gardant leur intensité : on voit le ruban de sa traînée changer de couleur d'un coup, de l'impact vers
l'arrière. L'attaquant rebondit de +5 m et garde sa survitesse (enchaîner sur une deuxième cible est
possible : le « doublé »). À la fin du décrochage, la victime a 1,5 s de « plumes hérissées » :
impossible à verrouiller, et son grand battement est rechargé.

Implémentation du vol de traînée : chaque oiseau garde un tampon circulaire de ses 45 dernières empreintes
(1,5 s à 30 Hz) ; à l'impact, on re-rastérise ces empreintes et on convertit les cellules dont le
propriétaire est la victime.

Ordres de grandeur du vol de traînée : 300 m² à midi pour une proie au ras du sable (0,8 % d'une arène à
4), 1 800 m² au couchant (5 %), jusqu'à 4 500 m² pour un balayeur au plafond pris en fin de manche
(12 %). Les proies les plus rentables sont les gros balayeurs du soir : c'est leur contre-poids.

**Raté.** Si la victime esquive après l'engagement, l'attaquant plante dans le sable (gerbe de sable) et
**décroche 1,2 s**, sans invulnérabilité ensuite. Règle à dire : « Piqué réussi, il décroche. Piqué raté,
c'est toi qui décroches. »

### 6.4 Esquive et fenêtre de timing (micro-simulation)

L'esquive est le grand battement (appui sur MONTER, joystick vers le côté) au bon moment. Probabilité de
touche selon le moment de l'appui (engagement à 0,5 s, battement 18 m/s pendant 0,3 s, rayon de touche
4 m ; 6 000 piqués simulés) :

| Appui X s avant l'impact | 0-0,1 | 0,1-0,2 | 0,2-0,3 | 0,3-0,4 | 0,4-0,5 | > 0,5 (avant l'engagement) |
|---|---|---|---|---|---|---|
| P(touche) | 90 % | 36 % | **2 %** | 15 % | 66 % | 95-98 % |

Trop tôt, le guidage corrige ; trop tard, on est touché ; la fenêtre utile fait ~0,3 s. En réagissant au
« clac » de l'engagement : réaction de 0,2 s → 8 % de touche, 0,3 s → 16 %, 0,4 s → 65 %, 0,5 s → 94 %.
Un joueur attentif esquive donc la plupart des piqués, un joueur distrait non. C'est voulu.

Compensation de latence (invisible, pour l'équité uniquement) : l'engagement d'un piqué contre un joueur
téléphone est avancé de `min(0,1 s, RTT/2)` mesuré pour ce téléphone.

### 6.5 Coûts et contre-jeu

| Action | Coût / risque | Contre-jeu |
|---|---|---|
| Piquer | l'altitude dépensée (5 à 15 m) ; 1,2 s de décrochage si esquivé ; on finit bas, donc proie | grand battement au dernier moment ; se glisser à l'ombre d'une tour (mire perdue) ; ne pas rester 5-12 m sous un chasseur ; voler au plafond |
| Feinter (relâcher avant l'engagement) | altitude perdue, recharge de 1 s | ne pas griller son battement avant le « clac » ; regarder les pointes d'ailes de l'attaquant |
| Esquiver | grand battement en recharge 2,5 s (visible : pointes d'ailes grises) | feinte puis second piqué pendant la recharge |
| Camper à l'ombre d'une tour | on ne peint pas | peindre ailleurs, attendre que l'ombre tourne |

Recharges : piqué 1,0 s après la fin du précédent ; grand battement 2,5 s ; invulnérabilité 1,5 s après
un décrochage subi. Pas d'autre recharge : l'altitude est la vraie recharge du piqué.

---

## 7. Ombres des tours : « elles cachent et elles bloquent »

### 7.1 Règles

1. **Elles bloquent** : une cellule dans l'ombre d'une tour est **figée**. Personne ne peut la peindre ni
   la voler, pas même par vol de traînée. Elle compte toujours pour son propriétaire.
2. **Elles cachent** : un oiseau dont le corps est dans l'ombre d'une tour ne peut pas être verrouillé, et
   un verrouillage en cours tombe. Il est rendu assombri. Il peut piquer depuis l'ombre (embuscade).
3. **Le prix de la cachette** : un oiseau caché ne peint pas. Ce n'est pas une règle ajoutée : le rayon
   qui passerait par l'oiseau est déjà arrêté par la tour, donc son ombre tombe dans celle de la tour.

Test « oiseau caché » (exact, analytique) : projeter sur le plan horizontal à l'altitude h de l'oiseau les
seuls éléments de la tour situés au-dessus de h (fût : capsule de la base de la section à h jusqu'à
`(H − h)·cot e` ; disque à z > h : cercle de même rayon décalé de `(z − h)·cot e`), puis tester le point.

### 7.2 Évolution avec le soleil (simulation, arène de 110 m, 8 tours)

| Moment | Part de l'arène figée | Forme |
|---|---|---|
| Zénith | 8 % | disques d'ombre (« parasols ») de 7 à 16 m de rayon autour des fûts : refuges et coffres-forts |
| Après-midi | 10-13 % | les parasols se détachent des tours et dérivent (un disque à 42 m s'éloigne de son fût de 22 à 79 m entre 40 et 95 s) ; les fûts tracent des bandes |
| Heure dorée | 14 % | longues règles d'ombre de 100 à 340 m qui traversent l'arène et tournent lentement |
| Dernier rayon | 16 % | bandes maximales, puis Grande Ombre (100 %) |

Conséquences jouables :
- **Sceller** : peindre fort une zone juste avant que l'ombre d'une tour ne la recouvre la met à l'abri
  jusqu'à ce que l'ombre reparte. La pointe avance de 1 à 13 m/s selon l'heure : c'est une course visible.
- **Désceller** : quand l'ombre tourne, elle relâche une bande de l'autre côté. Ce qui y dormait redevient
  prenable.
- **Refuges mobiles** : les parasols de midi deviennent des cachettes qui dérivent ; pour rester caché il
  faut les suivre.

---

## 8. Éléments optionnels

### 8.1 Retenu : le thermique

| Paramètre | Valeur |
|---|---|
| Nombre | 1 (N ≤ 6), 2 (N ≥ 7) |
| Apparition | t = 10 s, dure toute la manche |
| Taille | colonne de 10 m de rayon, tourbillon de sable visible de loin, anneau au sol |
| Effet | tout oiseau à l'intérieur monte à +8 m/s **sans perdre de vitesse**, jusqu'à 30 m |
| Déplacement | 4 m/s, trajectoire lissée (Lissajous lente) dans r < 0,45 R, à plus de 25 m de tout fût |
| Sortie au-dessus de 22 m | descente à 3 m/s jusqu'au plafond (environ 2,5 s d'avantage) |

Pourquoi il mérite sa place : c'est le **seul** moyen de passer au-dessus du plafond, donc le seul moyen
de piquer sur un oiseau qui campe à 22 m (depuis 30 m, l'écart de 8 m est dans la fenêtre 5-12 m). Il crée
un point chaud mobile au centre, il gêne les peintres au ras du sable qui le traversent (ils se font
soulever et pâlissent), et il se lit d'un coup d'œil. Aucune règle cachée : on voit la colonne, on voit
les oiseaux y monter en spirale. Désactivable dans les réglages de partie.

### 8.2 Écartés, et pourquoi

- **Vent** : une force invisible qui dérive l'oiseau rend la visée de l'ombre (déjà décalée au couchant)
  frustrante, et ajoute une variable que le joueur ne contrôle pas. Le Mur de sable suffit comme vent visible.
- **Bonus à ramasser** : ils détournent le regard de l'ombre, ajoutent des règles à apprendre et un
  facteur chance. Toute la profondeur vient déjà de l'altitude, du soleil et des tours.
- **Événements aléatoires** (éclipse, tempête) : le soleil est déjà l'événement, et il est prévisible,
  ce qui permet d'anticiper. L'aléatoire casserait la lecture de l'avenir, qui est une des compétences
  du jeu (§14.2).
- **Réglages de partie qui restent simples** : nombre de manches (1/3/5), durée de manche (120/150/180 s,
  images-clés mises à l'échelle), thermiques oui/non, difficulté des bots.

---

## 9. Score, manches, partie

### 9.1 Manche

Score = part du désert possédée au moment où la nuit tombe (toutes les cellules sont figées). Affichage
en pourcentage à une décimale. Deux joueurs à 0,2 point ou moins sont ex aequo.

### 9.2 Partie

- **3 manches** par défaut (1/3/5 au choix).
- Chaque manche rapporte **un soleil par joueur battu** (joueurs avec une part strictement inférieure) ;
  les ex aequo marquent autant. À 4 oiseaux : 3/2/1/0.
- **Le dernier soleil compte double**, annoncé dès le début de la partie et rappelé avant la dernière
  manche. À 2 joueurs, un 2-0 après deux manches peut encore finir 2-2 : la dernière manche compte toujours.
- Égalité en fin de partie : somme des parts de désert sur toutes les manches ; si égalité encore, victoire
  partagée (« Le désert est partagé »).
- Nouvelle disposition des tours et nouveau côté de couchant à chaque manche.

### 9.3 Écran de fin de manche (~12 s)

Décompte animé (le ruban de territoire se remplit dans l'ordre), soleils gagnés, 2-3 titres de la manche,
passage automatique à la manche suivante après 10 s (ou appui du premier joueur humain).

### 9.4 Titres (12)

Chaque titre exige un seuil minimal pour être décerné. En fin de manche : les 3 titres les plus marquants.
En fin de partie : **un titre par joueur** (celui où il se distingue le plus, en écart à la moyenne), pour
que chacun reparte avec quelque chose.

| Titre | Statistique | Seuil |
|---|---|---|
| Rapace | piqués réussis | ≥ 2 |
| Anguille | piqués esquivés (l'attaquant a planté) | ≥ 2 |
| Kamikaze | piqués ratés | ≥ 3 |
| Gibier | décrochages subis | ≥ 3 |
| Tête dans les nuages | part du temps au-dessus de 17 m | ≥ 40 % |
| Rase-mottes | part du temps sous 7 m | ≥ 40 % |
| Pilleur de traînées | sable pris par vol de traînée | ≥ 2 % de l'arène |
| Dernier rayon | gain net pendant les 15 dernières s + Grande Ombre | le plus haut, > 0 |
| Notaire | sable scellé : cellules que tu as peintes moins de 1 s avant qu'une ombre ne les fige | ≥ 1 % de l'arène |
| Ermite | temps caché à l'ombre d'une tour | ≥ 15 s |
| Maçon | part de ton territoire final en encre (I ≥ 0,75) | ≥ 50 % |
| Revenant | remontée entre le pire rang après 60 s et le rang final | ≥ 2 places |

### 9.5 Revanche

Écran de fin de partie : « Revanche » (mêmes joueurs, mêmes bots, nouvelle graine) ou « Lobby ». Sur les
téléphones, un bouton « Encore ! » ; la revanche part quand le premier joueur humain valide, ou
automatiquement si la moitié des humains ont appuyé dans les 15 s.

---

## 10. Contrôles

### 10.1 Téléphone (paysage, écran toujours allumé via Wake Lock)

| Zone | Contrôle | Détail |
|---|---|---|
| Moitié gauche | joystick flottant | apparaît sous le pouce ; rayon 70 px ; zone morte 15 % ; **direction absolue relative à l'écran du PC** (pousser vers le haut = voler vers le haut de l'écran) ; sous la zone morte, l'oiseau garde son cap |
| Droite, en bas | **MONTER** (grand rond, ~38 % de la hauteur) | maintenu = monter ; chaque appui = grand battement ; anneau de recharge 2,5 s autour du bouton |
| Droite, au-dessus à gauche de MONTER | **PIQUER** (rond plus petit, ~28 %) | maintenu = piquer ; terne sans mire, allumé à la couleur de la cible avec une pulsation quand une mire est disponible |
| Bord droit | jauge d'altitude verticale | trois bandes (ras du sable / mi-hauteur / haut) avec l'icône de l'ombre qui grandit |
| Haut | pastille de couleur, rang, part | « 2e · 24 % » |
| Bordure de l'écran | alertes | rouge pulsé quand un piqué te vise ; flash blanc au « clac » de l'engagement |

Bits du protocole existant : `BTN_A` = MONTER, `BTN_B` = PIQUER ; les compteurs `pa`/`pb` garantissent
qu'aucun appui bref (grand battement) n'est perdu.

**Inclinaison (option)** : téléphone en paysage tenu à deux mains. Le roulis pilote un **virage relatif**
(pencher à gauche = virer à gauche, comme un oiseau qui s'incline) : zone morte ±4°, virage maximal
(100°/s) à ±30°, calibration du neutre au « 3, 2, 1 ». Les boutons deviennent deux grandes moitiés
d'écran : pouce gauche = PIQUER, pouce droit = MONTER.

### 10.2 Clavier (codes physiques `KeyboardEvent.code`, donc AZERTY et QWERTY)

| Joueur | Direction | MONTER | PIQUER | Pause |
|---|---|---|---|---|
| Clavier solo | WASD (ZQSD en AZERTY) ou flèches | Espace | Maj (gauche ou droite) | Échap |
| J1 (clavier partagé) | WASD / ZQSD | Espace (pouce) | Maj gauche (auriculaire) | Échap |
| J2 (clavier partagé, pavé numérique) | 8 / 4 / 5 / 6 du pavé | 0 du pavé (pouce) | Entrée du pavé | |
| J2 (portable sans pavé) | I / J / K / L | Alt droite | touche `Semicolon` (M en AZERTY) | |

Directions en 8 secteurs ; aucune touche = garder le cap. Réassignation dans les réglages.
Manette (Gamepad API, bonus peu coûteux) : stick gauche, A/Croix = MONTER, B/Rond ou gâchette droite = PIQUER.

### 10.3 Haptique (`navigator.vibrate`, Android ; sur iOS, flash d'écran équivalent)

| Événement | Motif (ms) |
|---|---|
| Une mire s'ouvre pour toi | `[8]` (une fois par nouvelle cible) |
| Tu es verrouillé | `[0, 60, 50, 60]` |
| Engagement (« maintenant ») | `[35]` |
| Ton piqué touche | `[20, 30, 90]` |
| Tu décroches | `[250]` |
| Tu esquives (l'attaquant plante) | `[15, 20, 15, 20, 15]` |
| Ton piqué est raté | `[120, 40, 120]` |
| Grand battement | `[10]` |
| Entrée à l'ombre d'une tour | `[6]` |
| Tu passes en tête | `[30, 60, 30]` |
| Début de l'heure dorée | `[40]` |
| 10 dernières secondes | `[30, 120, 30]` chaque seconde |
| Fin de manche / manche gagnée | `[200]` / `[60, 60, 60, 60, 200]` |

---

## 11. Bots

### 11.1 Architecture commune

- Même couche d'entrée que les humains (joystick + 2 boutons), même physique, **aucune triche**. Ils lisent
  l'état du jeu (tout y est visible), avec un délai de perception propre au niveau.
- Décision par utilité, à intervalle fixe : on tire ~28 points candidats (8 dans le cône avant, 20 dans
  l'arène), on évalue la valeur de peinture autour de chacun (neutre 1 ; adverse prenable en un passage
  1,15 ; adverse fort 0,45 ; à soi faible 0,25 ; figé 0), divisée par `1 + distance/60` et pénalisée par
  l'angle à tourner. Le bot vise la position **de son ombre**, pas la sienne (il corrige le décalage).
- Couche d'altitude (personnalité), couche piqué (mire disponible → décider), couche menace (verrouillé →
  battement au bon moment selon le niveau, ou fuite vers l'ombre d'une tour).
- Chaque bot a des **tics lisibles** (ci-dessous) : un humain qui regarde 20 s devine ce qu'il fait.

### 11.2 Six personnalités

| Nom (lobby) | Altitude | Intentions | Tic visible (lecture) | Erreurs crédibles |
|---|---|---|---|---|
| **La Buse** (chasseuse) | 14-20 m, monte au thermique | cherche les proies 5-12 m plus bas, surtout les gros balayeurs du soir | tourne en cercle 1 à 2 fois au-dessus d'une proie avant de piquer | s'acharne sur la même proie ; pique sur des joueurs attentifs et plante |
| **Le Jardinier** (bâtisseur) | 3-7 m | peint fort près de chez lui, repasse pour faire de l'encre, scelle avant les ombres des tours | allers-retours serrés en tondeuse | reste bas trop tard au couchant ; fuit en ligne droite quand on le vise |
| **Le Pillard** (voleur) | 7-12 m | va chez le leader ; au couchant, creuse le long du soleil à travers l'encre adverse | trajectoires droites vers la couleur du leader, bandes parallèles aux rayons | vision tunnel : ne lève jamais les yeux vers les chasseurs |
| **Le Rêveur** (planeur) | 17-22 m | grands balayages pâles en travers du soleil, adore le thermique, pique depuis 30 m sur ceux qui campent au plafond | longues courbes paresseuses, spirales dans le thermique | frôle le Mur de sable, laisse son ombre sortir de l'arène au couchant, traîne dans le thermique |
| **La Sentinelle** (gardienne) | variable | défend son territoire : un intrus à moins de 40 m de sa couleur, elle monte au-dessus et pique ; guette depuis l'ombre des tours | boucles de patrouille autour de sa zone ; monte dès qu'on entre chez elle | trop défensive, peint peu ; attend trop longtemps en embuscade |
| **Le Charognard** (opportuniste) | copie l'altitude du leader ± 5 m | suit les combats, vole les traînées fraîches, vise les oiseaux qui viennent de piquer (ils sont bas) | suit un autre oiseau à ~30 m | arrive trop tard ; se fait prendre dans les doublés |

Un joueur qui se déconnecte est remplacé par un bot « Remplaçant » (mélange équilibré, niveau Serre) qui
garde sa couleur et son territoire.

### 11.3 Trois niveaux

| Paramètre | Plume (facile) | Serre (normal) | Rapace (difficile) |
|---|---|---|---|
| Réaction au « clac » | 0,55 ± 0,15 s, 35 % d'oubli | 0,40 ± 0,08 s, 10 % d'oubli | 0,30 ± 0,05 s, 3 % d'oubli |
| Esquive résultante (simulation) | ~10 % | ~40 % | ~75 % |
| Intervalle de décision | 1,0 s | 0,6 s | 0,35 s |
| Bruit sur le cap | ±18° | ±8° | ±3° |
| Piqué | dès qu'une mire s'ouvre, jamais de feinte | évite les cibles dont le battement est prêt ; 25 % de feintes | feintes 40 %, relance pendant la recharge adverse, cherche les doublés |
| Soleil et tours | ignore | se cache quand il est visé ; scelle avant les ombres | anticipe les ombres 5 s à l'avance ; choisit balayer ou creuser selon le terrain ; se place côté soleil et vise le bord opposé pour la Grande Ombre |
| Altitude | fixée par la personnalité | ±1 couche selon le terrain | contre-sélectionne (redescend si trois oiseaux campent en haut, etc.) |
| Erreurs volontaires | fréquentes (1 toutes les 10 s : Mur de sable, hésitation, piqué inutile) | occasionnelles (1 toutes les 25 s) | rares mais présentes (1 toutes les 40 s) |

Pas d'élastique caché : un bot en tête ne ralentit pas. L'équilibre vient des niveaux et des personnalités
choisis au lobby.

---

## 12. Apprentissage intégré

1. **Le lobby est un bac à sable.** Dès qu'un téléphone rejoint la salle, son oiseau apparaît et vole sur
   une petite zone de désert derrière les slots. La peinture et le piqué y marchent déjà (sans score). On
   apprend en attendant les autres.
2. **Carte « règle en 3 images »** avant la première manche d'une session (§1).
3. **Indications contextuelles**, une fois par joueur et par session (mémorisées côté téléphone), au plus une
   toutes les 8 s par joueur, affichées près de l'oiseau sur l'écran et en texte court sur le téléphone :

| Déclencheur | Indication |
|---|---|
| t = 2 s | flèche vers l'ombre : « Ton ombre peint » |
| n'a pas encore monté à t = 12 s | « Maintiens MONTER » |
| premier passage au-dessus de 17 m | « Haut : grand mais pâle » |
| première mire | PIQUER pulse : « Pique ! » |
| premier verrouillage subi | « Au clac : MONTER ! » |
| première entrée à l'ombre d'une tour | « Caché, mais tu ne peins pas » |
| première cellule à soi figée par une tour | « L'ombre des tours fige le sable » |
| début de l'heure dorée (pour tous, une fois) | bandeau : « Vole en travers du soleil pour balayer large » |
| dernier rayon (pour tous, une fois) | bandeau : « La nuit arrive : tout va se figer » |

4. Pas de mode tutoriel séparé, pas de texte long, pas de menu : la première manche est le tutoriel.

---

## 13. Narrateur

### 13.1 Événements et fréquence

Règles globales : 8 s minimum entre deux répliques ; au plus 10 répliques par manche dont 4 de phase ;
chaque type d'événement au plus 2 fois par manche (3 pour le changement de leader) ; une réplique n'est
jamais rejouée dans la même partie ; file de priorité, une réplique vieille de plus de 2 s est abandonnée ;
silence pendant les 5 dernières secondes avant la Grande Ombre, sauf « Dix secondes ».

| Événement | Condition | Priorité |
|---|---|---|
| Ouverture | début de manche (variante dernière manche) | phase |
| Premier piqué réussi | premier de la manche | moyenne |
| Changement de leader | le nouveau leader tient 2 s, l'ancien avait tenu ≥ 8 s | haute |
| Gros vol | vol de traînée ≥ 4 % de l'arène, ou gain ≥ 6 % en 3 s | haute |
| Esquive | piqué planté contre un joueur | basse |
| Doublé | deux touches du même oiseau en moins de 4 s | haute |
| Heure dorée | t = 95 s | phase |
| Dernier rayon | t = 135 s | phase |
| Dix secondes | t = 140 s | phase |
| Grande Ombre | t = 150 s | phase |
| Leader abattu | le leader décroche et perd la tête | haute |
| Écart énorme | leader ≥ 1,8 × le deuxième après 60 s | basse |
| Remontée | un oiseau passe de dernier à premier | haute |
| Ermite | ≥ 8 s caché à l'ombre d'une tour | basse |
| Mur de sable | 2e contact avec le mur en 10 s | basse |
| Immobile | un humain sans entrée depuis 10 s | basse |
| Thermique | apparition du thermique | basse |
| Résultats | fin de manche, égalité, fin de partie | phase |

### 13.2 Répliques (ton : conteur du désert, calme, étrange, humour sec)

Les couleurs sont nommées par des **noms masculins** pour que tous les accords restent au masculin
(proposition à caler sur la palette finale : le Vermillon, le Safran, le Turquoise, l'Indigo, le Corail,
le Jade, le Lilas, le Cobalt, le Grenat, le Céladon, le Prune, le Pétrole). Jetons : `{X}` = « le Vermillon »
/ « l'Indigo », `{X^}` = même chose avec majuscule, `{au X}` = « au Vermillon » / « à l'Indigo ».

1. Ouverture : « Midi. Le désert n'appartient encore à personne. »
2. Ouverture (manches suivantes) : « Le soleil est au plus haut. Les ombres tiennent sous les ailes. »
3. Dernière manche : « Dernier soleil de la partie. Il compte double, et il le sait. »
4. Premier piqué : « {X^} a ouvert la chasse. »
5. Changement de leader : « Le désert penche vers {X}. »
6. Changement de leader : « {X^} passe devant. Seule son ombre l'avait vu venir. »
7. Gros vol : « {X^} vient d'emporter une traînée entière. »
8. Gros vol (sans couleur) : « Ce sable avait une autre couleur il y a une seconde. »
9. Esquive : « {X^} a esquivé. Quelqu'un vient de goûter le sable. »
10. Doublé : « Deux oiseaux en une seule descente. {X^} a de l'appétit. »
11. Heure dorée : « Les ombres s'allongent. Tout ce qui est pâle va changer de mains. »
12. Dernier rayon : « Le soleil touche les mesas. Quinze secondes de lumière. »
13. Dix secondes : « Dix secondes. Le sable retient son souffle. »
14. Grande Ombre : « La nuit traverse le désert. Elle ne s'arrête pour personne. »
15. Leader abattu : « {X^} est tombé. Le premier rang aussi. »
16. Écart énorme : « {X^} prend ses aises. Quelqu'un devrait s'en occuper. »
17. Remontée : « {X^} était dernier il y a une minute. Le désert adore ce genre d'histoire. »
18. Ermite : « {X^} se repose à l'ombre d'une tour. Le désert, non. »
19. Mur de sable : « {X^} a voulu traverser la tempête. La tempête a refusé. »
20. Immobile : « {X^} contemple l'horizon. C'est une stratégie. »
21. Thermique : « Un tourbillon se lève. Ceux qui y entrent montent plus haut que les autres. »
22. Balayage géant au couchant (gain ≥ 6 % en 3 s) : « Une seule ombre est passée, et le désert a changé d'avis. »
23. Fin de manche : « Le soleil est couché. Ce soir, le désert est {au X}. »
24. Égalité : « Égalité. Le désert refuse de choisir. »
25. Fin de partie : « {X^} remporte la partie. Les dunes oublieront. Nous, un peu moins. »

Voix pré-générées (Piper, déjà dans le dépôt) : 17 répliques avec couleur × 12 couleurs + 8 sans couleur
≈ 212 fichiers par langue, chacun < 3 s. Sous-titre toujours affiché ; désactivable.

---

## 14. Profondeur : pourquoi il n'y a pas de stratégie dominante

### 14.1 Matrice de contre-jeu

| Si l'adversaire… | …tu peux | …mais ça te coûte |
|---|---|---|
| peint bas et fort (encre) | piquer depuis 8-15 m ; lui faire barrage (même teinte = choc d'encre) ; le laisser et prendre ailleurs | l'altitude ; le risque de planter |
| peint haut et pâle | repasser dessus à n'importe quelle altitude (1 passage suffit) ; le chasser depuis le thermique | ta propre peinture est petite si tu es bas |
| campe au plafond (intouchable) | lui voler son voile ; monter au thermique et piquer depuis 30 m | le thermique est contesté et temporaire |
| pique sur toi | battement au « clac » ; filer à l'ombre d'une tour ; ne pas rester 5-12 m sous lui | ton battement en recharge 2,5 s |
| feinte | garder ton battement pour le « clac » | tu dois lire ses ailes |
| se cache à l'ombre d'une tour | peindre ailleurs pendant qu'il ne peint pas ; attendre que l'ombre tourne | rien, c'est lui qui paie |
| scelle une zone avant l'ombre d'une tour | contester la zone avant l'arrivée de l'ombre ; piquer sur le scelleur (il vole bas et prévisible) | course contre la pointe d'ombre |
| balaie large au couchant | piquer : sa traînée de 1,5 s vaut jusqu'à 12 % de l'arène ; creuser le long du soleil dans son voile | il faut être 5-12 m au-dessus de lui |
| creuse le long du soleil | balayer ailleurs en travers (sa bande est étroite) | |
| vise la fin (Grande Ombre) | placer ton ombre plus loin du couchant que la sienne | monter pour allonger le décalage, donc pâlir |

### 14.2 Compétences qui séparent un bon joueur d'un débutant

1. **Gestion de l'altitude** : monter au bon moment (pas sous un chasseur), choisir sa couche selon ce que
   font les autres.
2. **Géométrie du soleil** : prévoir où seront les ombres des tours dans 10 s (sceller), choisir balayer ou
   creuser, piloter son ombre décalée, le coup de fouet, le placement pour la Grande Ombre.
3. **Duel** : lire la mire, le « clac », les ailes (battement prêt ou non), feinter, enchaîner un doublé,
   attirer un chasseur près d'une tour puis s'y glisser.
4. **Lecture de la partie** : repérer le leader, repérer les balayeurs dont la traînée vaut cher,
   contre-sélectionner sa couche (si tout le monde monte, redescendre).

### 14.3 Stratégies émergentes attendues

- **Le cycle** : monter, balayer pâle, piquer sur un peintre bas (on finit bas), peindre fort, remonter.
- **Le notaire** : suivre la pointe d'une ombre de tour et peindre juste devant elle.
- **Le parasol** : à midi, guetter depuis l'ombre d'un chapeau de Champignon et piquer sur ceux qui passent.
- **Le barrage** : deux oiseaux à la même altitude qui superposent leurs ombres s'annulent ; un défenseur
  peut « marquer » un voleur pour l'empêcher de peindre chez lui.
- **L'appât** : voler bas près d'une tour pour attirer un piqué, puis se glisser dans l'ombre (mire perdue,
  l'attaquant a dépensé son altitude pour rien).
- **La moisson du soir** : ignorer le sable et chasser le plus gros balayeur dans les 20 dernières secondes.
- **La ligne** : au couchant, traverser l'encre du leader le long des rayons, un passage suffit.
- **Le dernier rayon** : dans les 5 dernières secondes, monter côté soleil pour jeter son ombre sur le bord
  que la Grande Ombre atteindra en dernier.

### 14.4 Résultats de simulation

Simulateur : grille 1 m, 15 Hz, peinture, tours, Grande Ombre, piqués (issue tirée selon la table de
réaction de §6.4), oiseaux-bots à politique d'altitude fixe. Politiques : `low` 3 m, `mid` 12 m, `high`
22 m, `adapt` bas puis haut à 95 s, `hunter` 20 m, `context` altitude selon le terrain visé ; toutes
piquent quand une mire s'ouvre. 16 à 24 manches par ligne, positions tournantes. Parts moyennes finales :

| Composition (rayon) | Résultat |
|---|---|
| low / mid / high / adapt (110 m) | 23,5 / 20,9 / 23,8 / 21,0 % |
| context / high / low / mid (110 m) | 22,0 / 22,9 / 21,1 / 22,3 % |
| 3 × high + 1 low (110 m) | high 19,2 %, **low 32,0 %** |
| 3 × low + 1 high (110 m) | low 21,9 %, **high 25,0 %** |
| 3 × low + 1 mid (110 m) | low 20,5 %, **mid 28,3 %** |
| 3 × mid + 1 high (110 m) | mid 22,4 %, high 22,1 % |
| 6 oiseaux, une politique chacun (130 m) | 13,7 à 16,3 % |
| Duel high / low (90 m) | 40,1 / **47,7** % |
| Duel mid / low (90 m) | **51,9** / 35,3 % |
| Duel high / mid (90 m) | 43,1 / 44,3 % |

Lecture : aucune politique pure ne domine ; **la stratégie minoritaire gagne** (équilibre mixte), ce qui
récompense la lecture du terrain. En duel, les trois couches forment un quasi-cycle (bas bat haut, milieu
bat bas, haut et milieu à égalité).

Ce que la simulation a fait changer (versions écartées) :

| Version testée | Problème observé | Correction |
|---|---|---|
| teinte `d = k^-1.5` | voler bas dominait (27,8 % contre 16,4 % au plafond) | `d = 1/k` : même dépôt par passage à toute altitude, seul le plafond de teinte diffère |
| piqué possible quel que soit l'écart d'altitude | le plafond devenait un sanctuaire de chasseurs : « high » gagnait toutes les compositions (23 à 30 %) | fenêtre 5-12 m + thermique pour passer au-dessus du plafond |
| arène de 110 m en duel | voler haut dominait (47 % contre 38 %) | 90 m en duel |
| vol de traînée de 2 s | chasseurs légèrement trop forts | 1,5 s |
| guidage sans engagement final | l'esquive ne servait à rien (même taux de touche) | engagement balistique à 0,5 s de l'impact |
| battement de 12 m/s | déplacement (3,6 m) inférieur au rayon de touche : aucune esquive possible | 18 m/s, rayon de touche 4 m |

Indicateurs d'une manche type à 4 oiseaux : 27 à 34 piqués, 14 à 16 touches, 12 à 17 plantages ; 8 à 13
changements de leader ; écart médian entre 1er et 2e de 2 à 3 points.

Limites : bots simplistes (pas d'orientation balayer/creuser, pas de thermique, pas de collisions, esquive
modélisée statistiquement). À refaire avec les vrais bots du jeu (le brief demande de faire jouer des parties
entières) : les scripts sont réutilisables tels quels.

Scripts : `docs/research/design-depth-sim/balance-sim.mjs` (ex. `node balance-sim.mjs low,mid,high,adapt 24 110`)
et `docs/research/design-depth-sim/dive-sim.mjs`.

---

## 15. Risques de design et parades

| Risque | Pourquoi ça peut arriver | Parade dans cette proposition |
|---|---|---|
| Illisible au couchant | ombres à 100-157 m de leur oiseau | contour d'encre à la couleur du joueur ; fil de lumière oiseau-ombre au-delà de 15 m ; caméra qui cadre les ombres ; ombres hors arène grisées |
| Stratégie dominante | altitude mal équilibrée | `d = 1/k`, fenêtre de piqué 5-12 m, thermique, arène dimensionnée par joueur ; vérifié en simulation (§14.4) |
| Fin tirée au sort | les balayages du soir écrasent tout | l'encre résiste au voile ; le leader à 120 s gagne 33 à 46 % des manches à 4 (ni 25 % ni 100 %) ; le dernier soleil double est annoncé |
| Début sans enjeu | ombres minuscules à midi | ruée sur le sable vierge (près des deux tiers de l'arène peints en 40 s), parasols des tours, premiers piqués ; zénith court (40 s) |
| Boule de neige | un leader s'envole | points au rang et non à la surface ; dernière manche double ; les gros balayeurs sont les proies les plus rentables ; le narrateur désigne le leader |
| Piqués frustrants | se faire enchaîner | mire publique, alerte ≥ 0,6 s, esquive à fenêtre de 0,3 s, invulnérabilité 1,5 s, raté = l'attaquant décroche |
| Latence téléphone | 20-80 ms par trajet | fenêtre d'esquive de 0,3 s ; engagement avancé de min(0,1 s, RTT/2) ; tout est simulé sur le PC |
| Règles cachées | trop de sous-règles | chaque règle a un signe visible : mire (fenêtre de piqué), « clac » (engagement), pointes d'ailes (battement prêt), bleu des ombres (figé), oiseau assombri (caché), éclaboussures (choc d'encre), pâleur (plafond de teinte) |
| Chaos à 12 | trop d'oiseaux | arène plus grande, 2 thermiques, narrateur plafonné, mires discrètes |
| Joueurs éparpillés | un écran pour tous | arène bornée, thermique central, lumière qui rétrécit, cadrage borné à l'arène |
| Planque permanente | se cacher à l'ombre des tours | caché = ne peint pas ; les ombres bougent |
| Pâle/fort confus | deux notions sur le territoire | trois rendus nets (voile, trait, encre) ; seule la surface compte au score ; image 2 de la règle |
| Débutant perdu | beaucoup de géométrie | la règle tient en 3 phrases ; tout le reste (décalage, fouet, sceller) est un bonus émergent qu'on découvre en jouant |
| Daltonisme | 12 couleurs | mode daltonien : hachure à angle propre par joueur + symbole sur l'oiseau |

---

## 16. Constantes de réglage (proposition pour `tuning.ts`)

```ts
export const TUNING = {
  tickHz: 30,
  arena: {
    radius: (n: number) => (n <= 2 ? 90 : n <= 6 ? 90 + 10 * (n - 2) : 130 + 6 * (n - 6)),
    grid: 512, gridMargin: 8,
    stormPushFrom: -6, stormAccel: 25, stormHard: 6, stormTurn: 60,
  },
  bird: {
    hMin: 3, hMax: 22, hThermalMax: 30,
    vCruise: 20, vClimbH: 14, climbRate: 7, sinkRate: 1.2, sinkAboveCeiling: 3,
    turnRate: 100, turnRateClimb: 130, turnRateFreeDive: 75, // °/s
    accel: 12, decel: 10, overspeedTau: 1.5,
    dash: { impulse: 18, duration: 0.3, up: 6, cooldown: 2.5 },
    bump: { dz: 2.5, dist: 6, impulse: 6 },
    towerHit: { speedLoss: 0.3, wobble: 0.3 },
  },
  shadow: { W0: 10, L0: 5, kMax: 2.6, sigmaMax: 6, tieEps: 0.04, rayLineFrom: 15 },
  paint: { rate: 2.4, inkFrom: 0.75, lineFrom: 0.45 }, // d = 1/k
  sun: {
    keys: [[0, 85], [40, 62], [95, 28], [135, 12], [150, 8]] as [number, number][],
    azSweep: 60, horizon: 8, nightSweep: 5, nightHold: 2, eAfterSet: 6,
    phases: { afternoon: 40, golden: 95, lastLight: 135, tenSeconds: 140, night: 150 },
  },
  dive: {
    free: { vz: 14, vh: 30, ramp: 0.2 },
    guided: { vh: 32, accel: 30, vzMin: 4, vzMax: 22, turn: 110 },
    lock: { dhMin: 5, dhMax: 12, cone: 80, tgoMin: 0.6, tgoMax: 1.5, feasibilityCheck: true },
    commit: 0.5, hitRadius: 4, latencyCompMax: 0.1,
    onHit: { stun: 1.5, fallRate: 12, stunSpeed: 8, trailSteal: 1.5, rebound: 5, immune: 1.5 },
    onMiss: { stun: 1.2 },
    cooldown: 1.0,
  },
  thermal: { count: (n: number) => (n >= 7 ? 2 : 1), radius: 10, lift: 8, speed: 4, spawnAt: 10, maxR: 0.45, towerClearance: 25 },
  towers: {
    spire:    { H: 72, shaftR: 6,   discs: [{ z: 58, r: 16 }, { z: 36, r: 10 }] },
    mushroom: { H: 46, shaftR: 4.5, discs: [{ z: 42, r: 13 }], ring: 0.45 },
    needle:   { H: 34, shaftR: 3.5, discs: [{ z: 27, r: 7 }],  ring: 0.78 },
    minSpacing: 40, edgeMargin: 15,
  },
  match: { rounds: 3, lastRoundMultiplier: 2, tieShareEps: 0.002, roundEndSeconds: 12, rematchVoteSeconds: 15 },
  narrator: { minGap: 8, maxPerRound: 10, maxPerTypePerRound: 2, staleAfter: 2 },
}
```

---

## 17. Décisions proposées

1. **Altitude = ressource unique** : 3 à 22 m (30 m en thermique) ; monter 7 m/s en ralentissant à 14 m/s ;
   descente passive 1,2 m/s ; croisière 20 m/s, le joystick ne règle que le cap.
2. **Ombre analytique** : ellipse 10 × 5 m × `k(h)` (1 → 2,6), étirée de `min(1/sin e, 6)` le long du soleil,
   décalée de `h·cot e` ; rendu = gameplay au pixel près.
3. **Peinture** : `q = 2,4·d·dt`, `d = 1/k` ; plafond de teinte = `d` ; la plus sombre gagne, choc d'encre
   si égalité (≤ 0,04) ; score = surface possédée.
4. **Soleil** : images-clés `[[0,85],[40,62],[95,28],[135,12],[150,8]]`, azimut qui pivote de 60° vers un
   couchant latéral à l'écran ; Grande Ombre de 5 s depuis les mesas, puis 2 s de nuit.
5. **Piqué** : mire publique (cible 5-12 m plus bas, ±80°, interception 0,6-1,5 s, faisabilité vérifiée),
   engagement à 0,5 s, touche = décrochage 1,5 s + vol des 1,5 dernières secondes de traînée + rebond 5 m ;
   esquive au grand battement ; raté = l'attaquant décroche 1,2 s ; feinte permise avant l'engagement.
6. **Ombres des tours** : figent le sable et cachent les oiseaux (non verrouillables) qui, du coup, ne
   peignent pas ; trois archétypes, 6 à 11 tours selon l'arène.
7. **Arène** : cuvette circulaire de 90 à 166 m de rayon selon le nombre d'oiseaux, Mur de sable, grille 512².
8. **Thermique** : 1 (2 à partir de 7 oiseaux), seul moyen de dépasser le plafond ; pas de vent, pas de
   bonus, pas d'événement aléatoire.
9. **Partie** : 3 manches, un soleil par joueur battu, dernière manche double, départage à la surface
   cumulée ; 12 titres ; revanche en un appui.
10. **Contrôles** : joystick absolu + MONTER (maintien = monter, appui = grand battement) + PIQUER ;
    inclinaison en virage relatif ; clavier WASD/ZQSD + Espace + Maj, second joueur au pavé numérique.
11. **Bots** : six personnalités à tics lisibles, trois niveaux (Plume, Serre, Rapace), aucune triche,
    aucun élastique.
12. **Apprentissage** : lobby bac à sable, carte en 3 images, 9 indications contextuelles uniques ; la
    première manche sert de tutoriel.
13. **Narrateur** : 25 répliques, 8 s minimum entre deux, 10 par manche au plus, couleurs en noms masculins.
14. **Équilibrage** : garder les scripts `design-depth-sim/` et les relancer avec les vrais bots avant de
    figer les valeurs ; cibles : aucune politique d'altitude pure au-dessus de 26 % à 4 oiseaux, leader à
    120 s vainqueur dans 35 à 50 % des manches.
