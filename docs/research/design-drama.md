# Ombres : proposition de règles complète (angle spectacle, dramaturgie, lisibilité écran)

Auteur : agent `design-drama` (game design senior). Statut : proposition chiffrée, calibrée par simulation (section 16). Rien ici n'est écrit dans `DECISIONS.md` : voir « Décisions proposées » en fin de document.

Conventions : repère monde `x` = est, `y` = nord, `z` = altitude, en mètres. Azimut mesuré depuis le nord, sens horaire. `t` = temps de manche en secondes, `T` = durée du coucher (110 s par défaut), `u = t / T`. `e` = élévation du soleil. `S = 1 / sin(e)` = facteur d'étirement des ombres. Tous les chiffres sont des valeurs de départ pour le playtest, regroupées dans un fichier de config unique (`rules.ts`), jamais en dur.

---

## 0. Les règles entières, en 5 lignes

C'est tout ce qu'un joueur doit savoir. Chacune de ces règles se voit à l'écran ; il n'y en a pas d'autre.

1. **Ton ombre peint le sable.** À la nuit, celui qui possède le plus de sable gagne la manche.
2. **Bas = petite ombre foncée. Haut = grande ombre pâle.** Une ombre ne peut recouvrir que du sable plus pâle qu'elle.
3. **Plonge sur un oiseau plus bas que toi** pour le faire décrocher : tu éclabousses sa zone de ta couleur.
4. **L'ombre des tours fige le sable** et cache les oiseaux qui s'y trouvent.
5. **Le soleil se couche** : les ombres s'allongent, puis la nuit descend de la falaise et fige tout, d'ouest en est.

---

## 1. Pitch et « règle en 3 images »

### Pitch affichable (écran titre, lobby, chargement)

> **Peins le désert avec ton ombre : à la nuit, le plus grand territoire gagne.**

Sous-titre possible pour la bande-annonce : « Le soleil se couche. Les ombres grandissent. Tout peut encore changer. »

### La règle en 3 images (cartes illustrées, style ligne claire, 1 phrase chacune)

Affichées en boucle dans le lobby (6 s par carte) et une fois avant la première manche de la session (4 s au total, passables).

| Carte | Image (brief pour l'illustration) | Texte (≤ 8 mots) |
|---|---|---|
| 1 | Un oiseau vu de trois quarts, son ombre juste dessous, une traînée de sa couleur derrière l'ombre. | « Ton ombre peint le sable. » |
| 2 | Deux oiseaux de couleurs différentes : un bas avec une petite ombre très foncée, un haut avec une grande ombre pâle. Une flèche montre la petite ombre foncée qui mord sur la zone pâle ; un petit « ✕ » là où la grande ombre pâle glisse sur une zone foncée sans l'entamer. | « Bas : foncé. Haut : grand. Le foncé gagne. » |
| 3 | Le même désert au couchant : soleil bas à gauche, ombres très longues, falaise noire qui avance, compteur de territoire. | « À la nuit, le plus de sable gagne. » |

Le piqué, le coup d'aile et les tours ne figurent pas sur les cartes : ils s'apprennent par indications contextuelles (section 12), au moment où ils deviennent utiles.

---

## 2. L'arène

### 2.1 Forme et taille

Une **ellipse** allongée est-ouest, parce que les ombres du couchant s'étirent vers l'est (la largeur de l'écran 16:9) et qu'une caméra inclinée à ~55° voit le sol avec un rapport d'environ 1,45:1.

| Preset (choisi automatiquement selon le nombre total d'oiseaux, bots compris) | Oiseaux | Demi-axes a × b | Dimensions | Surface peignable | Tours | Cellule de grille (512 colonnes) |
|---|---|---|---|---|---|---|
| Petite | 2 à 4 | 140 × 100 m | 280 × 200 m | ≈ 44 000 m² | 5 | 0,55 m |
| Moyenne | 5 à 8 | 180 × 125 m | 360 × 250 m | ≈ 70 700 m² | 7 | 0,70 m |
| Grande | 9 à 12 | 220 × 150 m | 440 × 300 m | ≈ 103 700 m² | 9 | 0,86 m |

Grille de territoire : 512 colonnes sur le grand axe, 368 lignes (texture RG8 512×384 : R = propriétaire 0..12, G = encre 0..255). Les cellules hors ellipse et sous le pied des tours n'existent pas pour le score.

Densité visée : 8 000 à 22 000 m² par oiseau. En simulation (4 oiseaux, arène moyenne), 63 % du sable est peint à 50 s et ≈ 82 % à la fin : le sable neutre s'épuise à mi-manche, ensuite la manche devient une guerre de vols. C'est voulu.

### 2.2 Bordure : le Simoun

Une muraille de tempête de sable tourne autour de l'ellipse (rideau de hachures animées, grondement sourd). Règle visible et unique : **on ne peut pas sortir**.

- Au-delà de 92 % du rayon elliptique (`hypot(x/a, y/b) > 0.92`), l'oiseau est tourné vers le centre à 115°/s en plus de son pilotage, avec secousses visuelles des ailes.
- À 100 %, la position est ramenée sur le bord (mur dur).
- Une ombre qui déborde de l'ellipse ne peint rien dehors : voler près du bord gaspille son ombre, ce qui pousse naturellement vers l'intérieur.

### 2.3 Ce qui garde les joueurs proches (mécaniques explicites)

1. **Taille d'arène liée au nombre d'oiseaux** (tableau ci-dessus) : au zoom maximal, toute l'arène tient à l'écran. Au pire cas (grande arène, 440 m de large), un oiseau de 12 m d'envergure fait ≈ 52 px sur un écran 1080p ; le rendu peut grossir les oiseaux jusqu'à +30 % au zoom maximal (cosmétique, jamais les ombres ni les hitbox).
2. **Le Simoun** (bord infranchissable, visible).
3. **Le territoire attire le conflit** : une fois le neutre épuisé (≈ 50-60 s), on ne gagne plus qu'en volant du sable là où les autres ont peint. Les piqués demandent d'être à moins de 22 m.
4. **La Grande Ombre** (section 5.4) : pendant les 12 dernières secondes, la zone jouable se réduit d'ouest en est jusqu'à zéro. Tout le monde finit entassé dans le dernier tiers est de l'arène, c'est-à-dire au moment où la tension est maximale.
5. **Levier de réglage (désactivé par défaut)** : si les playtests montrent de l'éparpillement (distance moyenne au plus proche voisin > 70 m entre 30 et 90 s ; la simulation mesure 46 m à 6 oiseaux, 63 m à 4), activer le **resserrement du Simoun** : le rayon passe de 100 % à 85 % entre 40 s et 98 s. Le sable avalé garde sa couleur et devient figé.

### 2.4 Disposition des tours (preset moyen, carte « Les Parasols »)

Règles de placement valables pour toutes les cartes :

- Tours hautes à l'ouest, basses à l'est : les ombres des couronnes doivent traverser l'arène pendant l'heure dorée au lieu de sortir de la carte trop tôt. Condition : `x_tour + z_couronne × 5,2 ≤ a` pour que la couronne soit encore dans l'arène à 98 s.
- Espacement minimal 45 m entre axes ; décalage nord-sud d'au moins 25 m entre tours pour que les bandes d'ombre du couchant (quasi est-ouest) ne se superposent pas.
- Aucune tour à moins de 25 m d'un point d'apparition ; 30 m dégagés autour du centre pour l'ouverture.
- Aucune partie de tour entre 0 et 20 m d'altitude plus large que r = 4 m (les oiseaux volent entre 4 et 20 m) : fûts fins en bas, couronnes, disques et bulbes larges en haut, silhouettes typiquement Moebius.
- Cible : 5 % de l'arène sous ombre de tour au zénith, 10 % à 60 s, 12 à 18 % à 90 s.

| Tour | Archétype (profil lathe) | Position (x, y) | Hauteur | Pièces larges |
|---|---|---|---|---|
| T1 « Grand Parasol » | fût r 3 m + disque | (−60, 0) | 50 m | couronne r 20 m à 46-50 m |
| T2 | Parasol | (−130, 55) | 44 m | couronne r 13 m à 40-44 m |
| T3 | Fuseau (fût + bulbe) | (−110, −60) | 60 m | bulbe r 9 m à 46-54 m |
| T4 | Pile de disques | (−20, 80) | 36 m | disques r 10 m (28-30 m) et r 13 m (33-36 m) |
| T5 | Parasol | (−10, −85) | 34 m | couronne r 12 m à 30-34 m |
| T6 | Fuseau | (70, 60) | 40 m | bulbe r 8 m à 26-34 m |
| T7 | Pile de disques | (80, −30) | 30 m | disques r 9 m et r 12 m |

Petite arène : 5 tours (T1, T2, T3, T5, T7 mises à l'échelle 140/180). Grande : 9 tours (ajouter deux fuseaux de 55-65 m à l'ouest). Prévoir 4 cartes par preset avec un caractère distinct, tirées sans répétition d'une manche à l'autre :

- **Les Parasols** (ci-dessus) : grandes éclipses mobiles pendant l'heure dorée.
- **Les Aiguilles** : 9 à 11 fuseaux fins, peu de couronnes. Beaucoup de bandes étroites au couchant, un décor en « code-barres ».
- **La Colonnade** : fûts plus épais (r 4 m), alignés nord-sud. Au couchant, ils découpent le désert en couloirs de lumière.
- **Le Cadran** (dernière manche) : une tour centrale de 70 m dont l'ombre tourne comme une aiguille de cadran solaire pendant toute la manche.

---

## 3. L'oiseau

| Paramètre | Valeur | Commentaire |
|---|---|---|
| Envergure (visuel) | 12 m | corps 7 m |
| Rayon de touche (piqué) | 4,5 m (distance 3D entre centres) | |
| Altitude plancher / plafond | 4 m / 20 m | Au plancher, les pointes d'ailes frôlent le sable (gerbes de sable). |
| Altitude par défaut | 20 m (bouton PLONGER relâché) | Un débutant qui ne touche à rien vole haut et peint grand et pâle : il joue quand même. |
| Descente (PLONGER maintenu) | −22 m/s | 20 → 4 m en 0,75 s, ailes repliées |
| Montée (PLONGER relâché) | +6 m/s | 4 → 20 m en 2,7 s, gros battements. C'est la phase vulnérable. |
| Vitesse, stick relâché | 10 m/s (plané, cap conservé) | Ralentir sert à appuyer l'encre (voir 4.4). |
| Vitesse max, stick à fond | 16 m/s au plancher → 21 m/s au plafond (interpolation linéaire en altitude) | Voler bas est lent et lourd, voler haut est rapide. C'est le réglage qui équilibre haut et bas (section 16). |
| Bonus de descente | +6 m/s pendant la descente (plafond 26 m/s), redescend à 6 m/s² | Plonger, c'est accélérer. |
| Malus de montée | −3 m/s pendant la montée | |
| Accélération / freinage | 8 m/s² (14 en descente) / 6 m/s² | |
| Virage max | 140°/s à 10 m/s → 90°/s à 20 m/s | Rayon ≈ 8 m à 16 m/s, ≈ 13 m à 21 m/s. Inclinaison visuelle proportionnelle. |
| Coup d'aile (bouton 2) | impulsion +14 m/s dans la direction du stick (ou du cap), décroissance exponentielle τ = 0,35 s, ≈ 4,9 m de déplacement ; recharge 4 s | Pas d'invulnérabilité : l'esquive est purement géométrique. |
| Collision oiseau-oiseau | si |Δz| < 3 m et distance < 6 m : poussée latérale douce de 3 m/s, aucun effet de jeu | Aucune pénalité sans piqué : on ne se fait pas punir par hasard. |
| Collision avec une tour | glissement tangentiel, −30 % de vitesse, pas d'étourdissement | |

Mapping du pilotage : le stick donne un **cap absolu dans l'espace écran** (haut du stick = haut de l'écran = nord). La caméra ne tourne jamais en lacet pendant une manche : le mapping reste stable. L'amplitude du stick règle la vitesse entre 10 m/s et la vitesse max.

---

## 4. Ombre et peinture

### 4.1 Géométrie de l'ombre d'un oiseau (analytique, identique rendu et gameplay)

- Direction de l'ombre `d̂` = opposée à l'azimut du soleil (unitaire, au sol).
- Centre de l'ombre : `c = oiseau.xy + h × cot(e) × d̂`.
- Altitude normalisée : `α = (h − 4) / 16`, entre 0 (plancher) et 1 (plafond).
- Rayon au sol avant étirement : `r = 5 + 6α` (5 m en bas, 11 m en haut).
- Noirceur (pouvoir de peinture) : `p = 1,0 − 0,7α` (1,0 en bas, 0,3 en haut).
- Empreinte : ellipse de demi-axes `r` (en travers) et `r × S` (le long de `d̂`), avec `S = 1 / sin(e)`.
- Bord doux d'un mètre : la noirceur locale descend linéairement de `p` à 0 sur le dernier mètre. Les cellules où la noirceur locale est inférieure à 0,1 ne sont pas touchées, et l'ombre n'y est pas dessinée. **L'opacité affichée de l'ombre est exactement la noirceur `p` locale** : ce qu'on voit est ce qui peint.
- L'ombre porte un liseré de 0,5 m de la couleur du joueur (pour savoir à qui elle est) et un fin fil d'encre pointillé la relie à l'oiseau dès que le décalage dépasse 3 m.

### 4.2 Encre et propriété d'une cellule

Chaque cellule stocke `propriétaire` (aucun ou 0..11) et `encre q` ∈ [0, 1]. Une cellule compte pour le score si `q ≥ 0,1`. Sa couleur s'affiche avec une saturation `0,35 + 0,65 q` : le sable pâle se voit, le foncé se voit davantage.

À chaque tick (30 Hz, `dt = 1/30`), pour chaque oiseau qui peint (ni décroché, ni caché) et chaque cellule non figée sous son ombre, avec la noirceur locale `p` et `RATE = 2,0 /s` :

| Situation | Effet |
|---|---|
| Cellule à moi | si `q < p` : `q ← min(p, q + RATE·p·dt)`. On ne peut jamais pâlir son propre sable. |
| Cellule neutre | `propriétaire ← moi`, `q ← RATE·p·dt` |
| Cellule adverse, `p > q` | `q ← q − RATE·p·dt` ; si `q < 0` : `propriétaire ← moi`, `q ← min(p, −q)` |
| Cellule adverse, `p ≤ q` | **rien**. Retour visuel : petites étincelles d'encre et son « tsk » granuleux. Le joueur voit que son ombre est trop pâle. |

Ordre de traitement des oiseaux tiré au hasard à chaque tick (graine déterministe) pour qu'aucun slot ne soit avantagé. Le territoire ne s'efface jamais tout seul.

Ce que « pâle » et « fort » veulent dire, exactement :

- Une ombre de noirceur `p` amène le sable au plus à `q = p`, en 0,5 s d'exposition quelle que soit `p`.
- Une ombre ne peut entamer que du sable adverse plus pâle qu'elle (`q < p`). Le sable peint au plancher (`q ≈ 1`) est **immunisé** contre toute ombre plus haute ; seul un oiseau au plancher peut le reprendre.
- Temps pour retourner une cellule adverse foncée (`q = 1`) avec `p = 1` : 0,55 s (érosion 0,5 s + seuil de possession), 1,05 s pour la rendre pleinement foncée.

### 4.3 Ordres de grandeur (arène moyenne, 70 700 m²)

Aire balayée par seconde en vol perpendiculaire à l'ombre (la largeur utile est alors la longueur étirée `2rS`), stick à fond :

| Moment | e | S | Décalage ombre (h = 4 / 20 m) | Oiseau bas (16 m/s, p = 1) | Oiseau haut (21 m/s, p = 0,3) |
|---|---|---|---|---|---|
| 0 s (zénith) | 90° | 1,00 | 0 / 0 m | 160 m²/s (0,23 %/s) | 460 m²/s (0,65 %/s) |
| 55 s (heure dorée) | 34° | 1,79 | 6 / 30 m | 290 m²/s | 830 m²/s |
| 85 s (couchant) | 15,5° | 3,74 | 14 / 72 m | 600 m²/s | 1 730 m²/s |
| 98 s (Grande Ombre) | 10,9° | 5,30 | 21 / 104 m | 850 m²/s | 2 450 m²/s |
| 110 s (nuit) | 9° | 6,39 | 25 / 126 m | 1 020 m²/s (1,4 %/s) | 2 950 m²/s (4,2 %/s) |

Lecture : du zénith à la nuit, la puissance de balayage est multipliée par 6,4. Un oiseau haut qui traverse l'arène du nord au sud à la fin couvre une bande de 141 m de long, soit 4 % du désert par seconde. C'est le « balayer d'immenses zones en quelques secondes » du brief, mais en pâle : il ne mord que sur le neutre et le pâle. Pour renverser du foncé au couchant, il faut descendre, donc s'exposer aux piqués.

En vol **parallèle** à l'ombre, la largeur reste celle du zénith (10 m ou 22 m) mais le temps d'exposition d'une cellule est multiplié par `S` : au plancher à 16 m/s, 0,6 s au zénith contre 4 s à la nuit. Voler « dans l'axe du soleil » sert à renverser du foncé en profondeur ; voler « en travers » sert à rafler de la surface. Cette compétence se découvre seule, en regardant son ombre.

### 4.4 La profondeur qui en découle (sans règle supplémentaire)

- **Haut** : rapide (21 m/s), large (22 m), sûr (personne ne peut te piquer d'au-dessus) et menaçant pour ceux d'en dessous, mais ton sable (q ≤ 0,3) est fragile.
- **Bas** : lent (16 m/s), étroit (10 m), vulnérable, mais ton sable est immunisé contre les ombres hautes et tu peux reprendre n'importe quoi.
- **Ralentir** (stick relâché, 10 m/s) augmente l'exposition : c'est le moyen de « creuser » un bloc de sable adverse foncé au zénith.
- En simulation à 4 oiseaux, aucune stratégie pure ne domine : le bot « toujours haut » gagne 12-18 % des manches, le bot « toujours bas » 13-30 %, chacun des deux bots qui alternent 20-40 % (section 16). Avant le réglage des vitesses, « toujours bas » gagnait 75 % des manches.

---

## 5. Le soleil

### 5.1 Courbes

- Durée : `T = 110 s` (réglage de partie : Court 80 s, Normal 110 s, Long 150 s ; toutes les phases sont en fraction de `T`).
- Élévation : `e(t) = 9° + 81° × (1 − u)^1,7`. La courbe passe vite sur la zone sans intérêt (90° → 60° : ombres toutes sous les oiseaux) et ralentit là où les ombres grandissent.
- Azimut du soleil : `az(t) = 235° + 35° × u` (du sud-ouest à l'ouest). Les ombres pointent vers le nord-est au début, plein est à la fin : haut-droite puis droite de l'écran. Les ombres des tours tournent comme des aiguilles de cadran solaire.
- La caméra regarde le nord ; le soleil se couche hors champ à gauche. L'éclairage de la scène, le dégradé du ciel et le cadran du HUD le rendent lisible.

### 5.2 Phases de la manche

| Phase | Temps (T = 110) | e | Ce qui se passe | Musique / ambiance |
|---|---|---|---|---|
| Compte à rebours | −3 → 0 s | 90° | Oiseaux déjà en vol depuis leur point d'apparition, peinture désactivée. Gong à 0. | Vent seul, gong |
| **Midi** | 0 → 15 s | 90° → 72° | Ombres sous les oiseaux, nettes. Ruée sur le sable neutre. | Couche 1 : nappe + vent |
| **Après-midi** | 15 → 55 s | 72° → 34° | Les ombres se décalent (jusqu'à 30 m) et s'allongent (×1,8). Premiers vols, premiers piqués. Les couronnes des tours projettent des éclipses qui glissent vers l'est à 1-2 m/s. | Couche 2 : motif pincé |
| **Heure dorée** | 55 → 85 s | 34° → 15,5° | Ombres ×1,8 → ×3,7. Il faut viser avec son ombre, plus avec son oiseau. Étalonnage colorimétrique doré. | Couche 3 : percussions |
| **Couchant** | 85 → 98 s | 15,5° → 10,9° | Ombres ×3,7 → ×5,3, balayages énormes. Les fûts des tours tracent des bandes figées de 150 à 270 m ; les éclipses filent à 5-6 m/s. | Couche 4 : cordes en ostinato |
| **Grande Ombre** | 98 → 110 s | 10,9° → 9° | La nuit descend de la falaise et fige le désert d'ouest en est (5.4). | Tutti + tic-tac, pédale qui monte |
| **Nuit** | 110 s | (soleil caché par la falaise) | Tout est figé. Silence 1,5 s, étoiles, le territoire s'illumine. Résultats. | Coupure, puis gong grave |

### 5.3 Pourquoi 9° et pas 0°

À `e = 3°`, un oiseau à 20 m aurait son ombre à 380 m, hors de l'arène. On fixe donc la fin à 9°, où le décalage maximal est de 126 m, soit 35 % de la largeur de l'arène : lisible, cadrable. Le décor le justifie : le soleil disparaît derrière **la Falaise**, une mesa géante sur l'horizon ouest (≈ 320 m de haut à ≈ 1,7 km à l'ouest, visible dans la skybox et au plan final). Le soleil ne touche jamais l'horizon réel ; il « touche la falaise ».

### 5.4 La Grande Ombre (fin de manche)

- À `t = 0,89 T` (98 s), l'ombre de la Falaise entre par le bord ouest. Son front est une ligne perpendiculaire à l'azimut du soleil (quasi nord-sud), au profil dentelé fixe par carte (±6 m, la silhouette de la mesa). Il avance à vitesse constante (légère licence : l'ombre exacte d'une falaise accélérerait) et atteint le bord est à `t = T` : 30 m/s dans l'arène moyenne (360 m en 12 s), 23 m/s dans la petite, 37 m/s dans la grande. Les oiseaux ne peuvent pas le distancer.
- Derrière le front, le sable est **figé**, exactement comme sous une tour (même règle, même hachure).
- Un oiseau est dans la nuit si le centre de son ombre est derrière le front (c'est l'exact équivalent géométrique du rayon oiseau-soleil qui touche la falaise). Il ne peint plus et ne peut plus être ciblé. Conséquence élégante : un oiseau haut peut voler physiquement jusqu'à 126 m à l'intérieur de la nuit et peindre encore devant le front, parce que son ombre tombe là-bas. Les oiseaux bas doivent fuir plus tôt vers l'est.
- La zone jouable passe de 100 % à 0 % en 12 s, ce qui entasse tout le monde dans le dernier tiers est : piqués, vols, couleurs qui se renversent jusqu'au bout.
- Dernière seconde (109 → 110 s) jouée à 0,5× (2 s réelles). Au passage du front sur le bord est : gel, silence.

Mesures en simulation (bots, 4 à 6 oiseaux) : 10 à 13 % du désert change de mains pendant les 12 dernières secondes, pour un écart final moyen entre 1er et 2e de ≈ 3 %. Le leader à 98 s perd la manche dans 20 à 40 % des cas selon les séries ; le leader à 90 s, dans 25 à 45 % des cas. Tout peut basculer, sans que la fin rende le début inutile : ce qui a été figé plus tôt (bandes de tours, ouest de la carte) est acquis.

---

## 6. Le piqué

### 6.1 Déclenchement

Un seul bouton sert à tout : **PLONGER** (maintenu = descendre). Le piqué est ce qui arrive quand on plonge avec une cible sous soi.

Cible verrouillable (auto-visée), évaluée à chaque tick pour chaque oiseau :

- la cible est au moins **5 m plus bas** ;
- distance horizontale ≤ **22 m** ;
- dans un cône de **±75°** autour du cap (pas de cône en dessous de 3 m de distance) ;
- la cible n'est ni décrochée, ni immunisée, ni cachée (ombre de tour ou nuit).

La cible la plus proche est retenue. Elle reçoit un **réticule** à la couleur de l'attaquant : cercle d'encre et chevron vers le bas, visible par tous sur la TV. Sur le téléphone de l'attaquant, le bouton PLONGER devient « PIQUER » et prend la couleur de la cible. Pour limiter le bruit visuel, les réticules des bots ne s'affichent qu'au moment où ils engagent un piqué.

Appuyer sur PLONGER avec une cible verrouillée lance le piqué. Sans cible, c'est une descente normale.

### 6.2 Déroulé

1. **Prise d'élan : 0,2 s.** L'oiseau se cabre ailes grandes ouvertes, cri, le réticule devient plein. Pendant ce temps, la cible est avertie (vibration, bordure rouge sur son téléphone, point d'exclamation au-dessus de son oiseau).
2. **Chute guidée : jusqu'à 1,5 s.** Vitesse horizontale 24 m/s, virage limité à 110°/s. La vitesse verticale s'adapte (8 à 28 m/s) pour arriver sur la cible en ligne droite en 3D.
3. **Touche** si la distance 3D entre centres est ≤ 4,5 m et que l'attaquant n'est pas plus d'1 m sous la cible.
4. **Fin** au plancher, au bout de 1,5 s, ou si la cible devient cachée : piqué raté, l'attaquant finit au plancher.

Une descente sans verrouillage (vitesse verticale < −10 m/s) qui percute un oiseau plus bas compte aussi comme une touche : tomber sur quelqu'un, c'est le toucher. C'est rare, et logique.

### 6.3 Effets d'une touche

Sur la victime, le **décrochage** :

- 1,6 s sans contrôle : vrille, chute au plancher, dérive à 10 m/s.
- Pendant ce temps, son ombre est dessinée grise sans liseré de couleur : **elle ne peint pas**.
- Ensuite 2,0 s d'immunité (plumes ébouriffées) : on peut piloter et peindre, mais on ne peut pas être ciblé. Cela empêche l'acharnement.
- Aucune perte directe de territoire en dehors de la tache.

Pour l'attaquant, **la tache** : une ellipse de rayon 8 m étirée de `S` le long de `d̂`, centrée sur l'ombre de la victime, passe instantanément à la couleur de l'attaquant avec `q = 1`. C'est la seule exception à la règle « le foncé gagne », et elle se voit : éclaboussure d'encre, anneau d'onde. Les cellules figées ne sont pas touchées. Surface : 200 m² (0,3 % de l'arène moyenne) au zénith, 750 m² à 85 s, 1 290 m² (1,8 %) à la nuit. Plus on approche du couchant, plus un piqué rapporte.

### 6.4 Coût et risque pour l'attaquant

- Pas de cooldown caché. L'attaquant finit au plancher, lent (16 m/s une fois le bonus de descente dissipé), avec une petite ombre : il est à son tour la proie de tous ceux qui volent haut.
- Pour repiquer, il doit remonter d'au moins 5 m au-dessus de quelqu'un : 0,8 s si la cible rase le sol, jusqu'à 2,7 s si elle vole à mi-hauteur. C'est le cooldown naturel, visible.
- Piqué raté : il a perdu sa hauteur pour rien.

### 6.5 Contre-jeu

- **Coup d'aile** au bon moment : 4,9 m de déplacement latéral contre un attaquant qui ne tourne qu'à 110°/s. La bonne fenêtre est la dernière ~0,35 s. Trop tôt, l'attaquant recorrige.
- **Se cacher** : entrer dans l'ombre d'une tour ou dans la nuit casse le verrouillage, et le piqué est raté.
- **Rester haut** : on ne peut être piqué que par plus haut que soi. Au plafond, on est intouchable, mais on peint pâle.
- L'attaquant peut lui aussi utiliser son coup d'aile pendant la chute pour corriger. Les deux ayant une recharge de 4 s, cela crée un jeu de lecture : qui le brûle en premier ?

Cibles de réglage : 30 à 45 % des piqués réussis entre humains ; en simulation avec les valeurs ci-dessus, 32 % (bots crédibles, esquive dans environ un quart des cas).

---

## 7. Les ombres des tours : « cachent et bloquent »

### 7.1 Géométrie

Une tour est un empilement de segments de révolution. L'ombre au sol d'un segment `(r0 à z0, r1 à z1)` est l'enveloppe convexe de deux cercles : rayon `r0` centré en `base + z0·cot(e)·d̂`, rayon `r1` centré en `base + z1·cot(e)·d̂`. Pour un cylindre, c'est exactement une capsule. L'ombre de la tour est l'union de ses segments. Calcul analytique, identique au pixel près entre rendu et règles. Rendu : aplat plus sombre, **hachures d'encre** à 45° et contour net, pour que « hachuré » se lise immédiatement comme « intouchable ».

### 7.2 Bloquent : le sable figé

Toute cellule sous l'ombre d'une tour est **figée** : elle garde son propriétaire et son encre, personne ne peut la peindre ni la voler. Le sable figé est légèrement désaturé (−20 %) sous les hachures. Quand l'ombre s'en va, la cellule redevient normale avec la même couleur.

### 7.3 Cachent : l'oiseau à l'abri

Un oiseau dont le rayon vers le soleil touche une tour est **caché** : rendu assombri, sans ombre propre (il ne peint pas), nom en contour seul. On ne peut ni le cibler ni le toucher. Test : on remonte depuis l'oiseau dans la direction du soleil et on vérifie, pour chaque segment, si la distance à l'axe à la hauteur correspondante est inférieure au rayon du profil.

Être caché, c'est être en sécurité mais inutile. C'est le refuge de celui qui est pourchassé, et la planque du Guetteur (section 11).

### 7.4 Évolution pendant la manche (mesures en simulation, carte Les Parasols)

| Temps | Part de l'arène figée par les tours | Allure |
|---|---|---|
| 0-20 s | 5-6 % | Disques sous les couronnes : des « ombrelles » immobiles au pied des tours. |
| 40-60 s | 7-10 % | Les couronnes se détachent et glissent vers l'est (1-2 m/s) : **éclipses mobiles**. On peut peindre juste devant une éclipse pour que son sable soit protégé pendant son passage, ou s'y réfugier. |
| 80-90 s | 13-14 % | Les fûts tracent de longues bandes figées, les éclipses accélèrent (5-6 m/s) puis sortent de l'arène par l'est. |
| 98-110 s | 11-12 % + la nuit | Rayures de lumière et d'ombre sur tout le désert (composition très Moebius). Les bandes servent de clôtures : une ombre d'oiseau qui les traverse s'y interrompt. |

---

## 8. Éléments optionnels : lesquels, et pourquoi presque aucun

Principe : chaque élément ajouté entre en concurrence avec la lecture des ombres. Un élément n'entre que s'il se voit, s'explique en une image et crée une décision qui n'existe pas déjà.

| Élément | Verdict | Raison |
|---|---|---|
| Bonus à ramasser | Non | Encombre l'écran, ajoute des règles à lire, détourne le regard du sol. Le piqué fait déjà office d'événement ponctuel. |
| Vent | Non | Force invisible, donc règle cachée. Tuerait la correspondance ombre affichée / ombre qui peint. |
| Thermiques (colonnes ascendantes) | Non en v1 ; piste éventuelle | Visibles (brume de chaleur) et intéressantes pour préparer un piqué, mais la montée est déjà une décision de risque. À tester plus tard, si les playtests trouvent le jeu trop plat verticalement. |
| Nuages (ombre mobile qui fige) | Non | Aléatoire, et fait doublon avec les éclipses des couronnes, qui sont prévisibles. |
| Événements aléatoires | Non | L'arc du soleil est l'événement. Toute surprise tirée au sort affaiblirait la sensation que la fin se mérite. |
| Resserrement du Simoun | Levier de réglage, désactivé par défaut | Voir 2.3. |
| Variété | Oui, par les cartes | 4 dispositions de tours par preset, chacune avec un caractère (éclipses, code-barres, couloirs, cadran). |

---

## 9. Score, manche, partie

### 9.1 Manche

- Score de manche : part du désert peignable possédée (`q ≥ 0,1`) à la nuit, affichée au dixième de pour cent. Égalité d'affichage départagée au nombre exact de cellules (annoncé « photo-finish »). Égalité exacte : même rang.
- **Soleils** (points de partie) : un soleil par oiseau battu, plus un soleil au vainqueur. À 4 oiseaux : 4 / 2 / 1 / 0. À 6 : 6 / 4 / 3 / 2 / 1 / 0. Tout le monde progresse, et gagner vaut nettement plus que finir deuxième.
- **Dernier couchant** : la dernière manche compte double (réglage, activé par défaut, annoncé dans le lobby, avant la manche et par le narrateur). Cela garde la partie ouverte jusqu'au bout.

### 9.2 Partie

- 5 manches par défaut (réglage 3 / 5 / 7). Durée d'une manche avec l'entracte ≈ 3 + 110 + 15 = 128 s. Une partie de 5 manches dure ≈ 11 min 30 avec le podium.
- Égalité de soleils : 1) somme des cellules sur toute la partie ; 2) nombre de manches gagnées ; 3) co-victoire (« Maîtres des ombres, ex æquo »).
- Chaque manche utilise une carte différente ; la dernière est toujours « Le Cadran ».

### 9.3 Entre les manches (≈ 15 s, passable si tous les téléphones appuient sur « Prêt »)

1. Nuit : 1,5 s de silence, étoiles, le territoire s'allume comme des braises.
2. La caméra monte à la verticale : vue « carte » du désert peint (très belle image à soigner), pourcentages qui défilent au compteur (3 s).
3. Vainqueur de manche + réplique du narrateur, soleils qui volent vers les noms (2 s).
4. Une mention de manche au plus (« Le plus gros vol : Corail, +6,2 % en 4 s »).
5. Compte à rebours de la manche suivante.

### 9.4 Titres de fin de partie

Chaque joueur reçoit au plus un titre. On en affiche 4 à 6, par ordre de priorité, et un titre n'est attribué que si son seuil est atteint.

| Titre | Critère | Seuil |
|---|---|---|
| Le Faucon | plus de piqués réussis | ≥ 3 |
| Le Pigeon | plus de décrochages subis | ≥ 3 |
| L'Anguille | plus d'esquives (coup d'aile qui fait rater un piqué) | ≥ 2 |
| La Pie | plus de sable volé aux autres (cellules adverses retournées) | ≥ 8 % de l'arène cumulé |
| Le Bâtisseur | plus de sable foncé (q ≥ 0,8) à la nuit, cumulé | — |
| Rase-Mottes | plus grande part du temps sous 8 m | ≥ 50 % |
| Tête dans les nuages | plus grande part du temps au-dessus de 16 m | ≥ 75 % |
| Dernier Rayon | plus de sable gagné pendant les Grandes Ombres | — |
| Le Lézard | plus de temps caché à l'ombre des tours | ≥ 20 s |
| Le Mirage | plus grosse avance perdue (1er à 98 s, pas vainqueur) | avance ≥ 2 % |
| Le Revenant | plus belle remontée (3e ou pire à 90 s, vainqueur) | — |
| Kamikaze | plus de piqués ratés | ≥ 5 |
| Le Pacifiste | aucun piqué tenté de toute la partie | 0 |

Écran de stats par joueur : territoire par manche (mini-histogramme), soleils, piqués (tentés / réussis), esquives, décrochages subis, sable volé, meilleur coup (plus gros gain en 4 s), temps haut / bas / caché.

### 9.5 Podium et revanche

- Podium : les oiseaux perchés sur les couronnes de trois tours, le champion sur la plus haute, silhouettes sur le ciel du couchant. Le narrateur annonce le champion, puis les cartes de titres (2 s chacune).
- Téléphones : boutons « Revanche » et « Salon ». Revanche lancée quand la majorité des humains a appuyé, ou après 15 s si au moins un a appuyé. Mêmes joueurs, mêmes couleurs, mêmes bots ; les cartes continuent leur rotation. Au clavier : `Entrée` = revanche.

---

## 10. Contrôles

### 10.1 Téléphone (paysage, fond d'écran à la couleur du joueur)

| Zone | Contrôle | Détail |
|---|---|---|
| Moitié gauche | Joystick flottant | Naît sous le pouce. Rayon 70 px CSS, zone morte 10 %, plein régime à 85 %. Direction = cap absolu à l'écran (haut = haut de la TV) ; amplitude = vitesse. Relâché : plané à 10 m/s, cap conservé. |
| Droite, grand rond (≈ 38 % de la hauteur) | **PLONGER** (maintenir) | Maintenu : descente. Relâché : montée. Avec une cible verrouillée, le libellé devient « PIQUER » et l'anneau prend la couleur de la cible. |
| Droite, rond plus petit, au-dessus | **COUP D'AILE** (appui) | Anneau de recharge 4 s qui se remplit ; petit « tic » haptique quand il est prêt. |
| Bandeau du haut | Infos | Nom, rang (« 2e »), part (« 23,4 % »), petite barre de soleil. Pas de carte : le regard doit rester sur la TV. |

Mode portrait de secours : joystick en bas à gauche, boutons en bas à droite.

**Inclinaison (option)** : le vecteur d'inclinaison du téléphone (tangage, roulis), mesuré par rapport à une position neutre calibrée à l'activation, remplace le joystick. Zone morte 4°, plein régime à 20°. Les boutons restent tactiles. Sur iOS, un bouton « Activer l'inclinaison » déclenche la demande d'autorisation `DeviceOrientationEvent.requestPermission`.

**Retours haptiques** (`navigator.vibrate`, Android ; sur iOS, repli visuel par un flash de la bordure) :

| Événement | Motif (ms) |
|---|---|
| Un piqué te vise (début de la prise d'élan) | [120] + bordure rouge 0,6 s |
| Ton piqué touche | [40] |
| Tu décroches | [200, 60, 200] |
| Esquive réussie | [20, 30, 20] |
| Coup d'aile rechargé | [10] |
| Ta cible se cache, piqué raté | [15, 40, 15] |
| Début de la Grande Ombre | [80, 80, 80] |
| Chacune des 5 dernières secondes | [25] |
| Victoire de manche | [100, 50, 100, 50, 300] |

### 10.2 Clavier (PC)

Utiliser `KeyboardEvent.code` (positions physiques : ZQSD sur AZERTY = WASD).

| Joueur | Déplacement | PLONGER (maintenir) | COUP D'AILE |
|---|---|---|---|
| Clavier 1 | `KeyW/A/S/D` | `Space` | `ShiftLeft` |
| Clavier 2 | flèches | `Enter` / `NumpadEnter` | `ShiftRight` |

Directions numériques (8 directions, amplitude pleine). Aucune touche : plané à 10 m/s. Système : `Escape` = pause, `F` = plein écran. Bonus peu coûteux, puisque la couche d'entrée est unique : manettes via l'API Gamepad (stick gauche, `A` ou gâchette droite = PLONGER, `X` ou `RB` = COUP D'AILE), jusqu'à 4.

---

## 11. Bots

Les bots passent par la même couche d'entrée que les joueurs (vecteur de stick + deux boutons), avec délai de réaction. Aucune triche : ni vitesse, ni information cachée au-delà de ce que l'écran montre. Chaque bot porte une couleur comme un joueur ; dans le lobby, son slot affiche son nom de personnalité et une icône.

### 11.1 Personnalités

| Personnalité | Comportement | Intention lisible à l'écran (« tell ») | Erreur crédible |
|---|---|---|---|
| **Le Laboureur** | Vole au plancher en passes parallèles serrées ; construit des blocs foncés ; revient défendre quand on mange son bloc. Pique rarement. | Allers-retours réguliers comme un tracteur ; au couchant, passes dans l'axe du soleil. | Vision tunnel : ne lève pas la tête et se fait piquer. Oublie de fuir la nuit. |
| **Le Rapace** | Reste au plafond, suit le leader, pique souvent ; peint pâle et large entre deux attaques. | Avant chaque piqué, fait un cercle complet au-dessus de sa cible (0,6-1 s), réticule visible. | Pique de trop loin sur des cibles qui ont leur coup d'aile ; se laisse ensuite piquer au plancher. |
| **La Pie** | Chasse le sable adverse foncé le plus récent et le retourne en descendant ; opportuniste. | Fonce en ligne droite vers le plus gros bloc adverse et plonge dessus. | Gourmandise : reste bas trop longtemps au milieu des autres. |
| **Le Nomade** | Balayages hauts, longs et rectilignes en travers du soleil ; s'occupe du neutre et du pâle ; part vers l'est avant tout le monde. | Grandes lignes droites qui traversent l'arène ; premier à fuir la nuit. | Néglige la défense ; se fait retourner son sable pâle par tout le monde. |
| **Le Guetteur** | Se tient caché sous les ombrelles et les éclipses ; peint devant les éclipses qui arrivent ; sort pour piquer les oiseaux bas qui passent près de lui. | Immobile (en cercle serré) dans l'ombre d'une tour, puis jaillit. | Trop passif ; en retard au couchant, quand les couronnes quittent l'arène. |
| **Le Fou** | Zigzags, coups d'aile gratuits, piqués sur tout ce qui bouge, looping de célébration après une touche. | Trajectoire chaotique, rires (cri spécifique). | Rate beaucoup, finit dans le Simoun, mais gagne parfois une manche par pur chaos. |

Règles d'équité : au plus 2 bots engagés sur le même oiseau par fenêtre de 10 s. Les bots choisissent leur cible par personnalité, avec un bonus de +50 % sur le leader actuel (humain ou bot, sans préférence pour les humains). Ce rattrapage reste visible : le narrateur peut le commenter.

### 11.2 Difficultés

| Paramètre | Novice | Confirmé | Maître |
|---|---|---|---|
| Temps de réaction | 550 ms | 320 ms | 180 ms |
| Bruit sur le cap | ±20° | ±10° | ±4° |
| Visée avec l'ombre | vise avec l'oiseau (ignore le décalage) 50 % du temps après 55 s | compense 85 % du décalage | compense 100 % et anticipe le mouvement du soleil |
| Distance de déclenchement du piqué | dès qu'une cible est verrouillée (≤ 22 m) | ≤ 16 m | ≤ 12 m, et seulement si le coup d'aile de la cible est en recharge |
| Probabilité d'esquive (au bon moment) | 15 % | 45 % | 75 % |
| Lecture foncé / pâle | 40 % du temps, vole haut au-dessus de sable foncé (sans effet) | rarement | jamais |
| Grande Ombre | réagit quand le front arrive (souvent rattrapé) | part vers l'est à 95 s | se place dès 90 s et peint juste devant le front |
| Ombres des tours | les ignore | évite de peindre dans les zones figées | exploite les éclipses (peindre devant, s'y cacher) |
| Erreurs de pilotage | 1 sortie vers le Simoun par manche, oublie de remonter | rares | aucune |

Cible de playtest : un humain débutant contre 3 bots Novice gagne 1 manche sur 2 dès sa deuxième partie ; un bon joueur contre 3 bots Maître gagne environ 1 manche sur 4.

---

## 12. Apprentissage intégré (aucune explication orale)

1. **Écran titre** : des bots jouent une vraie manche en fond, avec la caméra de jeu et le pitch à l'écran. On comprend « oiseaux, ombres, couleurs » avant de toucher quoi que ce soit.
2. **Salon jouable** : dès qu'un téléphone se connecte, son oiseau apparaît dans le désert du salon (midi permanent, peinture active, sans score). On apprend le joystick et PLONGER en attendant les autres. Les 3 cartes de règles tournent dans un coin.
3. **Première manche de la session** : les 3 cartes (4 s), puis des indications contextuelles. Réglage « Conseils » : Auto (première partie de la session seulement), Toujours, Jamais.
4. **Indications contextuelles** : bulle à la couleur du joueur près de son oiseau sur la TV, reprise sur son téléphone. Chacune ne s'affiche qu'une fois par joueur, au plus une toutes les 8 s.

| Déclencheur | Texte |
|---|---|
| 4 s sans avoir appuyé sur PLONGER | « Maintiens PLONGER : ombre plus foncée » |
| 6 s au plancher | « Relâche : tu remontes, ombre plus grande » |
| Première cible verrouillée | « Jade est sous toi : PIQUE ! » |
| Premier piqué subi (prise d'élan) | « COUP D'AILE pour esquiver ! » (le bouton clignote sur le téléphone) |
| 1 s d'ombre pâle sur du foncé adverse sans effet | « Trop pâle pour ce sable. Descends. » |
| Première entrée de son ombre dans une zone hachurée | « Ombre de tour : sable figé » |
| Premier décalage ombre / oiseau > 15 m | « Vise avec ton ombre » (le fil d'encre pulse) |
| Début de la Grande Ombre (tous) | « La nuit fige le sable. Fuis vers l'est → » |

---

## 13. Narrateur

Ton : conteur du désert, voix grave et posée, phrases courtes, un peu étrange, humour sec. Il ne commente jamais les contrôles.

### 13.1 Couleurs nommées

Le narrateur désigne les joueurs par leur couleur, utilisée comme un prénom. Noms proposés (les teintes exactes relèvent de la direction artistique, mais les **mots** doivent être figés tôt pour pré-générer les voix) : Carmin, Corail, Safran, Anis, Jade, Lagon, Azur, Indigo, Lilas, Prune, Rose, Ardoise.

Contrainte d'écriture : les répliques ne contiennent jamais d'accord en genre avec la couleur (« Jade décroche », jamais « Jade est tombée »), et jamais plus d'une couleur par réplique. Une réplique à variable coûte 12 fichiers audio ; ≈ 18 modèles à variable + ≈ 10 répliques neutres ≈ 230 fichiers.

### 13.2 Événements, priorités, fréquence

Règles globales : au moins 8 s entre deux répliques ; au plus 7 répliques par manche en plus de l'ouverture et de la fin ; une réplique non jouée dans les 2,5 s qui suivent son événement est abandonnée ; aucune réplique n'est répétée dans une même partie (2 ou 3 variantes par événement) ; la musique baisse de 6 dB pendant la voix ; sous-titres toujours affichés, le nom de couleur écrit dans sa couleur. Priorité 1 : passe toujours, même si elle doit attendre 2 s.

| Événement | Condition | Priorité | Cooldown |
|---|---|---|---|
| Ouverture de manche | t = 0 | 1 | — |
| Changement de leader | nouveau leader stable 2 s, t > 15 s | 2 | 20 s |
| Gros vol | ≥ 3 % de l'arène pris aux autres en 4 s glissantes | 2 | 20 s |
| Heure dorée | t = 0,5 T | 2 | une fois |
| Piqué réussi | premier de la manche, ou sur le leader | 3 | 25 s |
| Décrochage du leader | victime = leader | 3 | 25 s |
| Couchant | t = 0,77 T | 3 | une fois |
| Esquive | coup d'aile dans les 0,4 s avant l'impact | 4 | 40 s |
| Caché | même oiseau caché ≥ 6 s | 5 | une fois par manche |
| Simoun | oiseau dans la bande de tempête ≥ 3 s | 5 | une fois par manche |
| Grande Ombre | t = 0,89 T | 1 | une fois |
| Photo-finish | t = T − 6 s, deux premiers à ≤ 1,5 % | 2 | une fois |
| Fin de manche | nuit + 1,5 s | 1 | — |
| Remontée / Mirage | à l'écran de résultats | 2 | une fois |
| Champion, revanche | fin de partie | 1 | — |

### 13.3 Répliques (exemples, avec `{C}` = couleur)

Ouverture
1. « Midi. Le sable n'appartient encore à personne. »
2. « Le soleil est au plus haut. Les ombres se tiennent sous les ailes. »
3. (dernière manche) « Dernier couchant. Ce soir, le désert choisit. »

Changement de leader
4. « {C} prend la tête. Le sable a la mémoire courte. »
5. « {C} passe devant. Personne ne l'a vu venir, sauf {C}. »
6. « {C} mène. Pour l'instant, le soleil laisse faire. »

Gros vol
7. « {C} vient d'avaler un morceau de désert. »
8. « Un pan entier change de couleur. {C} ne s'excusera pas. »

Piqué et décrochage
9. « {C} plie les ailes et frappe. Proprement. »
10. « {C} tombe du ciel. Quelqu'un, en dessous, s'en souviendra. »
11. « {C} décroche. Le sable amortit à peine. »
12. « {C} goûte au sable. Ça restera entre nous. »

Esquive, cachette, tempête
13. « {C} esquive. La serre ne referme que du vent. »
14. « {C} s'abrite sous une tour. Sagesse, ou sieste. »
15. « {C} va voir la tempête de près. Elle ne rend jamais les visites. »

Le soleil
16. « L'heure dorée. Les ombres commencent à avoir de l'ambition. »
17. « Le soleil baisse. Vos ombres s'éloignent de vous. Visez avec elles. »
18. « La nuit descend de la falaise. Ce qu'elle touche ne bouge plus. »
19. « C'est serré. Le dernier rayon tranchera. »

Résultats
20. « La nuit est tombée. Le désert est à {C}. »
21. « {C} gagne la manche. Les autres ont surtout vu du pays. »
22. « Égalité. Le désert refuse de choisir. Il est comme ça. »
23. « {C} partait de loin. Le désert adore ces histoires. »
24. « {C} menait au couchant. Il faut toujours se méfier des mirages. »

Fin de partie
25. « Le désert appartient à {C}. Qu'on lui garde la plus haute tour. »
26. « Le soleil se relève. Il a toujours aimé les revanches. »

---

## 14. Mise en scène : arc de tension, caméra, ralentis, HUD, son

### 14.1 L'arc de tension d'une manche

Chaque moment de l'arc est porté par un changement visible, et non par un texte :

| Temps | Intensité (1-5) | Ce que voit la salle |
|---|---|---|
| 0-15 s | 2 | Ruée : des traînées de couleur jaillissent partout, ombres collées aux oiseaux. |
| 15-55 s | 2 → 3 | Mosaïque de couleurs, premiers piqués, les éclipses se détachent des tours. |
| 55-85 s | 3 → 4 | Lumière dorée, ombres qui s'étirent, les balayages deviennent des coups de pinceau géants. Changements de leader fréquents (≈ 4 à 5 par manche en simulation). |
| 85-98 s | 4 | Rayures de lumière, ombres démesurées, tout le monde vise avec des ombres lointaines. |
| 98-110 s | 5 | La nuit avance comme un rideau, tout le monde fuit vers l'est, derniers piqués, dernière seconde au ralenti. |
| Nuit | 1 (silence) | Gel, silence, étoiles, le territoire s'illumine. La salle respire, puis le résultat tombe. |

### 14.2 Caméra

- **Cadrage** : boîte englobante de tous les oiseaux actifs **et des centres de leurs ombres** (poids 1 pour les ombres, 0,7 pour les oiseaux), marges 12 % à gauche et à droite, 15 % en haut et en bas. Largeur cadrée minimale 110 m ; maximale = arène + 10 %. Ressort critique amorti (position ω = 1,8 rad/s, zoom ω = 1,2 rad/s) avec zone morte de 4 m pour éviter les micro-mouvements.
- **Lacet fixe** (nord en haut) pendant toute la manche. Seuls l'inclinaison, le zoom et la position bougent. C'est la condition d'un mapping de stick stable.
- **Inclinaison** : 58° au zénith, qui descend vers 42° à la fin. Plus de ciel et d'horizon entrent dans le champ, le couchant devient cinématographique.
- **Dramatisation** :
  - piqué engagé dans le champ : léger zoom (+8 %) vers la paire pendant 0,6 s ;
  - touche : ralenti (§14.3), tremblement de 0,15 m, deux images d'impact « encre » (lignes de vitesse, contraste inversé) ;
  - Grande Ombre : la caméra inclut le front et se décale légèrement vers l'est ;
  - nuit : montée à la verticale en 2,5 s pour la vue carte ;
  - vainqueur de manche : plan bas, face à l'ouest, oiseau en silhouette sur la lueur du couchant derrière la Falaise (le seul plan où le soleil se voit directement).
- **Hors-champ** : flèches au bord de l'écran à la couleur du joueur, pour un oiseau ou une ombre hors cadre. Cela ne devrait arriver que dans les transitions.

### 14.3 Ralentis

- Touche de piqué visible : temps de simulation × 0,35 pendant 0,35 s réelles, puis retour en 0,2 s. Au plus un toutes les 6 s. Aucun pendant les 3 dernières secondes, sauf le ralenti final.
- Dernière seconde : × 0,5.
- Les ralentis ralentissent toute la simulation (un seul écran, tout le monde est concerné). Les entrées continuent d'arriver normalement.

### 14.4 HUD (TV)

| Élément | Position | Détail |
|---|---|---|
| **Cadran solaire** (timer) | haut gauche, ≈ 18 % de la hauteur | Arc d'un quart de cercle du zénith (en haut) jusqu'à la silhouette de la Falaise (à gauche). Un disque solaire le parcourt. Graduations aux changements de phase, segment Grande Ombre hachuré. Le nom de la phase apparaît en petites capitales 3 s à chaque changement. Aucun chiffre sauf les 5 dernières secondes : « 5 4 3 2 1 » à l'encre, sous la bande de sable. |
| **Bande de sable** (territoire) | haut centre, 46 % de la largeur, 18 px de haut en 1080p | Barre empilée : un segment par oiseau, trié par rang (le leader à gauche), puis le sable neutre. Pourcentage écrit dans chaque segment ≥ 3 %. Petit soleil au-dessus du leader. Animation de 300 ms à chaque changement ; flash du segment du voleur quand il prend ≥ 3 %. |
| Sous-titres du narrateur | bas centre | Serif italique, 28 px en 1080p, couleur du nom dans sa teinte. |
| Dans le monde | — | Étiquette de nom sous chaque oiseau (18 px) ; fil d'encre oiseau → ombre ; réticules ; « +2,4 % » qui s'envolent à la couleur du gagnant après une tache ou un gros vol ; plumes ébouriffées pendant l'immunité ; oiseau assombri quand il est caché. |
| Pause | — | `Escape` sur le PC, ou appui long d'1 s sur l'icône pause d'un téléphone. |

Aucun élément de debug. Les pourcentages sont arrondis au dixième.

### 14.5 Son (intentions)

- Vent qui varie avec l'altitude et la vitesse ; sifflement en piqué ; gros battements en montée.
- Peinture : grain de sable doux sur le neutre, crissement plus sec quand on retourne du sable adverse, « tsk » quand l'ombre est trop pâle.
- Musique en couches ajoutées à chaque phase (§5.2), stingers sur changement de leader et sur touche, coupure nette à la nuit.

### 14.6 Option « instant décisif » (si le coût est faible)

Garder un tampon circulaire de 10 s (oiseaux à 30 Hz, grille toutes les 0,5 s, ≈ 7 Mo). Aux résultats, rejouer 4 s autour du plus gros basculement de la manche, au ralenti. Ce n'est pas indispensable, mais c'est un fort moment de partage dans la pièce.

---

## 15. Risques de design et parades

| Risque | Parade dans cette proposition |
|---|---|
| La fin décide de tout, le début ne sert à rien | Le sable foncé posé tôt résiste à toutes les ombres pâles. Ce qui passe sous les tours ou dans la nuit est acquis. En simulation, 10 à 13 % du désert change de mains dans les 12 dernières secondes : assez pour renverser un écart de 3 %, pas pour effacer une manche entière. |
| Rien ne se passe à la fin | Ombres ×6, taches ×6, zone jouable qui se réduit à zéro, tout le monde entassé à l'est. Le leader à 98 s perd 20 à 40 % des manches. |
| Une stratégie domine | Haut = rapide, large, sûr, fragile ; bas = lent, étroit, exposé, solide. En simulation, les bots à stratégie pure gagnent 12-30 % des manches, les bots qui alternent 20-40 % chacun. Les paramètres d'équilibrage sont `V_MAX(h)`, `r(h)`, `p(h)`. |
| Illisible : l'ombre loin de l'oiseau | Le décalage croît progressivement (0 m, puis 30 m à 55 s, 126 m à la fin), un fil d'encre relie l'oiseau à son ombre, un liseré de couleur signe chaque ombre, la caméra cadre les ombres, une indication contextuelle et une réplique du narrateur l'expliquent. |
| Illisible : qui est plus haut que qui ? | Le réticule montre qui peut piquer qui. Taille et pâleur de l'ombre, perspective, animation (ailes repliées en bas, battements en montée) font le reste. |
| Frustration : se faire piquer en boucle | Prise d'élan visible et vibrante, fenêtre d'esquive, refuges dans les ombres, 3,6 s d'immunité après une touche, au plus 2 bots sur la même cible. |
| Spam de piqués | Pas de cooldown caché, mais chaque piqué renvoie l'attaquant au plancher, exposé, et il doit remonter pour recommencer. |
| Camping dans les ombres | Être caché, c'est ne rien peindre. Les ombrelles bougent et disparaissent au couchant. |
| Règles cachées | Cinq règles, toutes visibles : opacité = pouvoir de peindre, saturation = résistance, hachures = figé, réticule = menace, front de nuit = fin. |
| 12 joueurs : chaos visuel | Grande arène, réticules des bots masqués hors engagement, bande de territoire triée, narrateur limité à 7 répliques. |
| Éparpillement | Arène dimensionnée, Simoun, vols nécessaires une fois le neutre épuisé, Grande Ombre ; resserrement du Simoun en réserve. |
| Latence 20-80 ms | La fenêtre d'esquive (~0,35 s) et la prise d'élan (0,2 s) sont grandes devant la latence. Aucune règle ne dépend d'une précision inférieure à 100 ms. |
| Les débutants ne trouvent pas PLONGER | Voler haut sans rien toucher reste amusant (on peint large). Indication après 4 s, salon jouable. |
| Mal au cœur ou confusion avec la caméra | Lacet fixe, ressorts amortis, zone morte, tremblements rares et courts. |

---

## 16. Validation par simulation

Un prototype de simulation headless (Node, sans dépendance) implémente les règles des sections 3 à 7 : soleil, ombres d'oiseaux et de tours analytiques, encre, gel, Grande Ombre, piqué avec prise d'élan et guidage 3D, coup d'aile, bots paramétrés (haut, bas, mixte, agressif, naïf). Il est copié dans `docs/research/design-drama-sim.mjs` (`node design-drama-sim.mjs batch 40 4`).

Résultats avec les valeurs proposées (bots grossiers, à prendre comme des ordres de grandeur) :

| Mesure | 4 oiseaux, arène moyenne | 6 oiseaux, arène moyenne |
|---|---|---|
| Désert peint à 50 s / à la fin | 63 % / 82 % | 74 % / 84 % |
| Changements de leader par manche | ≈ 4 | ≈ 5 |
| Écart final 1er-2e | ≈ 3 % | ≈ 3 % |
| Désert qui change de mains dans les 12 dernières secondes | ≈ 10 % | ≈ 13 % |
| Le leader à 90 s gagne | 55-70 % | ≈ 73 % |
| Le leader à 98 s gagne | 60-80 % | ≈ 83 % |
| Taux de réussite des piqués | ≈ 32 % | — |
| Surface moyenne d'une tache | ≈ 440 m² (0,6 %) | ≈ 490 m² |
| Distance au plus proche voisin (30-90 s) | ≈ 63 m | ≈ 46 m |
| Part figée par les tours à 10 / 60 / 90 s | 5 / 10 / 14 % | idem |

Constats qui ont fait évoluer les chiffres :

- Avec la même vitesse en haut et en bas, « toujours bas » gagnait 75 % des manches. Rendre le vol bas plus lent (16 m/s contre 21 m/s) a rééquilibré les stratégies.
- Un piqué qui descend à vitesse fixe manquait presque toujours les cibles éloignées. Le guidage 3D (vitesse verticale adaptée) est nécessaire.
- Au couchant, les couronnes sortent de l'arène par l'est : il faut placer les tours hautes à l'ouest pour garder des éclipses pendant l'heure dorée.
- En duel (2 oiseaux), le piqué pèse beaucoup plus lourd : l'équilibrage à 2 joueurs est à surveiller en priorité en playtest.

À refaire dès que le vrai moteur existe : faire jouer 50 manches de bots Confirmé par preset et vérifier ces mêmes indicateurs (cibles : leader à 98 s gagnant 60-75 %, piqués réussis 30-45 %, aucune personnalité au-dessus de 35 % de victoires à 6).

---

## Décisions proposées

1. **Règles** : les 5 règles de la section 0, et aucune autre. Pas de bonus, pas de vent, pas d'événements aléatoires.
2. **Arène** : ellipse est-ouest en 3 presets choisis selon le nombre d'oiseaux (280×200, 360×250, 440×300 m). Bordure « Simoun » infranchissable. Grille de 512 colonnes (texture RG8 512×384).
3. **Oiseau** : altitude 4-20 m, haut par défaut. PLONGER maintenu = descente à 22 m/s, relâché = montée à 6 m/s. Vitesse max 16 m/s en bas, 21 m/s en haut, 10 m/s en plané. Virage 140 → 90°/s. Coup d'aile de +14 m/s (τ 0,35 s), recharge 4 s.
4. **Ombre** : `r = 5 + 6α` m, `p = 1 − 0,7α`, étirement `1/sin(e)`, décalage `h·cot(e)`. L'opacité affichée égale le pouvoir de peinture.
5. **Encre** : `RATE = 2/s`. Une ombre ne recouvre que du sable plus pâle qu'elle. Une cellule compte à `q ≥ 0,1`. Pas d'effacement spontané.
6. **Soleil** : `T = 110 s`, `e = 9° + 81°(1−u)^1,7`, azimut de 235° à 270°. Phases Midi, Après-midi, Heure dorée, Couchant, Grande Ombre (dès 0,89 T), Nuit.
7. **Fin de manche** : la Grande Ombre (ombre de la Falaise) fige le désert d'ouest en est en 12 s. Dernière seconde à 0,5×.
8. **Piqué** : verrouillage (≥ 5 m plus bas, ≤ 22 m, ±75°, cible non cachée), prise d'élan 0,2 s, guidage 3D, touche à 4,5 m. Victime : 1,6 s de décrochage sans peinture puis 2 s d'immunité. Attaquant : tache de r 8 m × S en `q = 1`. Pas de cooldown explicite.
9. **Tours** : l'ombre fige le sable (hachures) et cache les oiseaux (non ciblables, ne peignent pas). Tours hautes à l'ouest. 4 cartes par preset, « Le Cadran » en dernière manche.
10. **Score** : soleils = oiseaux battus + 1 au vainqueur. 5 manches par défaut. Dernière manche double (réglable). Départage : cellules cumulées, puis manches gagnées.
11. **Titres** : les 13 titres de 9.4, un par joueur au maximum, 4 à 6 affichés. Revanche à la majorité des humains.
12. **Contrôles** : joystick flottant à cap absolu, PLONGER, COUP D'AILE, inclinaison en option. Deux joueurs au clavier (WASD + Espace + Maj gauche ; flèches + Entrée + Maj droite). Manettes en bonus.
13. **Bots** : 6 personnalités (Laboureur, Rapace, Pie, Nomade, Guetteur, Fou) × 3 difficultés (tableau 11.2), via la couche d'entrée commune, sans triche.
14. **Onboarding** : écran titre joué par des bots, salon jouable, 3 cartes de règles, 8 indications contextuelles.
15. **Narrateur** : 12 couleurs nommées, figées tôt (Carmin, Corail, Safran, Anis, Jade, Lagon, Azur, Indigo, Lilas, Prune, Rose, Ardoise). Répliques sans accord de genre, au plus une couleur par réplique, au plus 7 par manche, 8 s minimum entre deux.
16. **Caméra** : lacet fixe nord, cadrage oiseaux + ombres, inclinaison de 58° à 42°, ralenti de 0,35× sur les touches (au plus un toutes les 6 s).
17. **HUD** : cadran solaire en haut à gauche (le seul timer), bande de sable triée en haut au centre, sous-titres en bas.
18. **Tous les chiffres** dans un fichier de config unique. Revalidation par 50 manches de bots par preset dès que la simulation réelle tourne.
