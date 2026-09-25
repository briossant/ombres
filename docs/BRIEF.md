# Ombres — brief original (verbatim)

Tu vas créer un jeu vidéo complet, de A à Z, en autonomie. Pas un prototype, pas une démo technique : un jeu fini, beau, fluide, qu'on a envie de relancer. Le niveau visé est celui d'un petit studio indé qui sort un jeu soigné. L'objectif est que quelqu'un qui lance le jeu soit bluffé qu'il ait été fait par une IA.

Tu as toute latitude sur les choix de game design, de rendu et d'implémentation. Quand tu hésites, tranche toi-même, note ta décision dans DECISIONS.md et avance. Ne t'arrête pas avant que le jeu soit complet, poli et déployé.

## Le concept

Party game en multijoueur local. Le jeu tourne sur un PC branché sur un écran, les joueurs sont dans la même pièce et contrôlent leur personnage avec leur téléphone. On ouvre le jeu sur le PC, chaque joueur scanne un QR code, ça l'ajoute à la partie.

Chaque joueur chevauche un oiseau géant au-dessus d'un immense désert parsemé de tours futuristes. L'ombre de ton oiseau peint le sable à ta couleur. À la fin de la manche, celui qui possède le plus de désert gagne.

Le cœur du jeu : le soleil se couche pendant la manche. Au début il est au zénith, les ombres sont petites et nettes. Plus il descend, plus les ombres s'allongent, jusqu'à balayer d'immenses zones en quelques secondes. La fin de manche doit être tendue et tout doit pouvoir basculer.

Mécaniques de départ (à affiner selon ce qui est fun) :
- Voler haut donne une ombre plus grande mais plus pâle, voler bas une ombre petite mais qui peint fort.
- On peut piquer sur un autre oiseau pour le faire décrocher.
- Les ombres des tours cachent et bloquent.
- Il faut que les règles gardent les joueurs assez proches les uns des autres pour que l'action soit lisible sur un seul écran.

Principe de design non négociable : simple à comprendre en quelques secondes, avec de la vraie profondeur. Contrôles minimaux sur le téléphone (un joystick et un ou deux boutons, inclinaison en option). Pas de règles cachées, pas de menus complexes.

Joueurs : de 1 à 12. Le jeu doit être excellent de 2 à 6. Des bots complètent la partie et doivent être fun : personnalités distinctes, intentions lisibles, erreurs crédibles, plusieurs niveaux. On doit pouvoir jouer seul contre des bots avec un seul téléphone, et le jeu doit aussi être entièrement jouable au clavier sur le PC pour le développement.

## Technique

- Vite, TypeScript strict, React Three Fiber et l'écosystème pmndrs.
- Simulation séparée du rendu, pas de logique de jeu dans les composants React. Le PC fait autorité sur l'état de la partie.
- Une couche d'input unique : téléphone, clavier ou bot, le jeu ne fait pas la différence.
- Serveur Node avec WebSocket pour relier le PC et les téléphones. Latence masquée proprement.
- Performance : 60 fps stables, presets de qualité graphique.
- Déploiement sur Magic Deploy via ton MCP. Configure la VM comme tu veux.
- Mon environnement est NixOS : fournis un flake.nix pour le dev.
- Aucun coût à l'usage : pas d'API payante appelée pendant le jeu.

## Direction artistique

Style inspiré de Moebius (Jean Giraud) : ligne claire, contours à l'encre, hachures, aplats, palettes pastel et désertiques, espaces immenses et vides, ambiance calme et étrange. Rendu stylisé, pas photoréaliste.

Avant d'écrire le moindre shader, fais de vraies recherches sur ce qui caractérise ce style et sur les techniques de rendu non photoréaliste pour le reproduire en 3D temps réel. C'est ce qui fera ou non la réussite visuelle du jeu, ne l'improvise pas.

Le coucher de soleil, les ombres qui s'allongent et le territoire peint sur le sable sont le spectacle central du jeu : ils doivent être magnifiques. Les couleurs des 12 joueurs doivent rester distinguables tout en restant harmonieuses avec la palette.

Caméra dynamique, toujours bien placée, qui cadre l'action et la dramatise, comme dans un bon jeu.

## Assets et son

Pas de modèles faits de primitives géométriques dans la version finale. Trouve des assets gratuits en ligne (modèles, textures, sons, musique) en respectant les licences, ou génère-les procéduralement quand c'est plus adapté au style. Pour les oiseaux, l'animation de vol doit être procédurale et réagir au gameplay (ailes repliées en piqué, inclinaison en virage, battement selon la montée).

Musique par écran, avec une montée d'intensité pendant le coucher de soleil. Bruitages pour chaque action et pour l'interface. Ambiance de vent.

Narrateur : une voix qui ponctue les moments forts (changement de leader, gros vol de territoire, soleil qui descend, dernières secondes, résultats). Répliques courtes et rares, bien écrites, désignant les joueurs par leur couleur. Pré-génère les voix pendant le dev avec un outil gratuit. Si tu n'en trouves pas de qualité suffisante, affiche les répliques en texte à l'écran. Désactivable dans les réglages.

## Ce que doit contenir le jeu fini

- Chargement avec progression réelle, écran titre animé avec des bots qui jouent en fond.
- Lobby : QR code, code de salle, slots de joueurs (nom, couleur), ajout et retrait de bots, réglages de partie, lancement.
- Interface téléphone complète : connexion, nom, couleur, attente, manette, écran entre les manches, reconnexion automatique, écran toujours allumé, vibrations quand c'est possible.
- Un joueur qui se déconnecte est remplacé par un bot. Rafraîchir le PC ne casse pas la partie.
- Apprentissage intégré : personne ne doit avoir besoin d'explications orales.
- HUD clair : territoire de chaque joueur, temps restant lisible via le soleil, repères des joueurs hors écran, événements.
- Game feel soigné : particules, traînées, impacts, ralentis, retours sonores.
- Fin de manche spectaculaire, résultats, stats et titres, partie en plusieurs manches, revanche.
- Pause, réglages (volumes séparés, qualité, plein écran, FR/EN, mode daltonien, type de contrôle), crédits.
- Aucun élément de debug visible en jeu.

## Méthode

- Vérifie visuellement ton travail : prends des captures d'écran avec Playwright et regarde-les pour juger le rendu, corrige, recommence. Ne te contente pas de ce que le code est censé afficher.
- Fais jouer des parties entières aux bots pour tester l'équilibrage et trouver les bugs.
- Joue-le comme un joueur exigeant : si un moment est ennuyeux, confus ou moche, corrige-le.
- À la fin : l'URL du jeu déployé, un README, et DECISIONS.md.
