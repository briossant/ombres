# Agent net-phone — session réseau, client téléphone, app manette

Fichiers : `src/net/**`, `src/phone/**`, `src/shared/messages.ts`, `src/shared/strings/phone.ts`,
`tools/mock-host.ts`, `tools/phone-e2e.mjs`, `dev/phone.html`, `src/dev/phone/**`.

## 1. Vue d'ensemble

```
téléphone (play.html)                         PC (index.html, runner de phase 3)
src/phone  ── store zustand ── link.ts         PhoneHub (src/net/phoneHub.ts)
      │                                          │  entrées → BirdInput, vues diffées, statuts,
src/net/phoneClient.ts ◄──── ws /ws ────►  src/net/hostSession.ts  ◄─ relais server/ (inchangé)
```

- `HostSession` : WebSocket du PC. Crée / reprend la salle (code + jeton en `sessionStorage`), se reconnecte seule (0,5 → 4 s, ±20 % de gigue), recrée la salle au **même code** après un redémarrage du serveur, ping 5 s (RTT + proxy), chien de garde 12,5 s, délai de connexion 8 s, statut `replaced` si un onglet dupliqué a repris la salle (`takeOver()`).
- `PhoneHub` : tout ce qui est « téléphone » côté PC — ne décide rien du jeu.
- `PhoneClient` : WebSocket du téléphone (id persistant `localStorage`), reconnexion silencieuse, patience 60 s si la salle déjà rejointe a disparu (redeploy), 6 s pour une salle jamais vue, entrées 30 Hz au changement + boutons immédiats + battement 1 Hz, ping 2 s, RTT médian remonté au PC.
- App `src/phone` : React 19 + zustand, sans three.js (133 ko JS / 42 ko gz).

## 2. Intégration (phase 3) — ce que le runner doit faire

```ts
import { HostSession } from '../net/hostSession.ts'
import { PhoneHub } from '../net/phoneHub.ts'
import { LobbyGoalTracker } from '../net/lobbyGoals.ts'

const session = new HostSession()            // URL du relais déduite de location
const hub = new PhoneHub(session)            // restaure ses téléphones (sessionStorage) au rafraîchissement
session.start()

hub.on('session', r => lobby.set({ roomCode: r.room, joinUrl: r.joinUrl }))   // QR = r.joinUrl (…/play?r=CODE)
hub.on('status', s => lobby.set({ connection: s }))                           // idle|connecting|online|reconnecting|replaced
hub.on('join', ({ phone, known }) => {
  // nouveau (known=false) : créer le joueur. phone.hello = { name, color, scheme, assist, lang, caps, seenHints }
  //   couleur = phone.hello.color si libre, sinon première libre (ART_BIBLE §3.2) ; profileSet = false
  // retour (known=true) : rendre la main (le bot remplaçant s'efface), rien d'autre
  hub.bindSlot(phone.id, slot)
})
hub.on('leave', ({ phone }) => {/* armer le remplacement par un bot : hub.offlineSeconds(id) > RULES.playerDropToBotSeconds */})
hub.on('profile', ({ phone, name, color }) => {/* nom déjà nettoyé ; color null = garder / attribuer ; profileSet = true */})
hub.on('ready',   ({ phone, ready }) => {/* cartes des règles (intro), entre les manches */})
hub.on('action',  ({ phone, action }) => {/* start (meneur) | rematch | toLobby | pause | resume */})
hub.on('scheme',  ({ phone, scheme }) => {/* rien : hub.input() convertit déjà */})
hub.on('assist',  ({ phone, on }) => sim.setAssist(slot, on))

// À chaque tick de simulation :
for (const slot of phoneSlots) {
  inputs[slot] = hub.inputForSlot(slot, sim.state.bySlot[slot]?.heading ?? 0, scratch[slot]) ?? undefined
  sim.setLatencyGrace(slot, hub.latencyGraceSeconds(hub.phoneForSlot(slot)!.id))   // min(0,1 s, RTT/2)
}
const events = sim.step(inputs)
hub.updateFromSim(sim.state, events, slot => players[slot].colorIndex)            // vibrations + bandeau
// Salon : goals.update(slot, inputs[slot], 1 / RULES.tickHz) ; goals.onSimEvent(e) → vue + coche TV
// Nouvelle manche : hub.resetRound()

// Quand l'écran change (ou ≤ 10 Hz, le hub diffère et ne renvoie que ce qui change) :
hub.setViews(phone => viewFor(phone))     // PhoneViewInput, voir src/shared/messages.ts (PhoneView sans k/v)
```

- **Vues** (`PhoneView`) : `screen` (`lobby | intro | play | roundEnd | matchEnd | spectate`), `lang` (celle du PC : le téléphone la suit), `you` (`slot, name, color, leader, profileSet, ready, assist, scheme`), `paused` (surcouche, `{ by: {name,color}|null, canResume }`), `colorblind`, puis la charge de l'écran : `lobby` (`taken`, `goals`, `canStart`, `leaderName`, …), `intro` (`round, rounds, map, double, ok, total, deadlineIn`), `play`, `roundEnd` (rang, part, soleils, stats perso, `readyCount/readyTotal`, `deadlineIn`), `matchEnd` (rang, soleils, vainqueurs, `title {key, value, label}`, podium, vote), `spectate`. Les échéances sont des **secondes restantes à l'envoi** (`deadlineIn`) : le téléphone décompte seul, la vue n'a pas besoin d'être renvoyée chaque seconde.
- **Profil** : tant que `you.profileSet` est faux, le téléphone affiche l'écran nom + couleur. `you.leader` = premier humain : bouton « Lancer la partie » dans son bandeau (action `start`).
- **Titres** : `title.key` = `titles.<id>.name` (chaînes de l'agent ui), `value` = chiffre déjà formaté dans la langue du PC, `label` = nom traduit de repli.
- **Statut vivant** : `hub.updateFromSim` le calcule (`statusFromSim`) : rang, part, couronne, soleil `u`, compte à rebours, bas/haut, **cible** (PIQUER à la couleur de la cible, seulement si `lockTarget ≥ 0 && dive === 'none' && diveCooldown === 0`), chasseur, piqué en cours, caché, nuit, décrochage, immunité, recharge du COUP D'AILE. Envoi immédiat des champs urgents, le reste ≤ 4 Hz.
- **Retours (cues)** : `CueRouter` traduit les `SimEvent` (GDD §12.3) : `altitude, locked (≤ 1 / 2 s), windup (bordure rouge), clac (flash + « COUP D'AILE ! »), hit, stunned, dodge, planted, flap, flapReady, crown, bump (oiseau, tour, tempête), greatShadow, tick (5 dernières s), roundWin, countdown n, go`. Motifs de vibration dans `CUE_HAPTICS` (messages.ts). Envoi direct possible : `hub.cue(id, cue)`, `hub.cueSlot(slot, cue)`, `hub.cueAll(cue)`, `hub.haptic(id, pattern)`.
- **Messages courts** : `hub.toast(id, key, params, tone)` / `toastSlot`. Les indications du directeur partent en `hub.toastSlot(slot, 'hints.<id>', { color: colorIndex }, 'hint')` : un paramètre numérique `color` (ou `…Color`) est affiché comme nom de couleur ; `{dive}` / `{flap}` prennent par défaut les libellés des boutons du téléphone. Le téléphone mémorise les `hints.*` affichés et les renvoie dans `hello.seenHints` (demande director).
- **Déconnexion** : `leave` puis `hub.offlineSeconds(id)` ; `hub.isAway(id)` vaut aussi vrai si le téléphone est connecté mais muet depuis 2,5 s (page suspendue). `hub.input()` d'un téléphone hors ligne = stick neutre, PLONGER relâché.
- **Rafraîchissement du PC** : la session reprend la salle (`resumed: true`, `peers`), le hub restaure ses téléphones (slots, préférences, compteurs d'appuis) depuis `sessionStorage`, émet `join(known)` pour ceux qui sont là et leur redemande `hello`. Le runner restaure sa partie (snapshot) et renvoie les vues. Avant de quitter : `hub.persistNow()` (pagehide) pour garder les compteurs exacts.
- **Kick** : `hub.kick(id)` (écran « retiré », le joueur peut revenir). `hub.forget(id)` oublie sans déconnecter.
- **Salon** : `LobbyGoalTracker` (pur) coche Vole (stick ≥ zone morte, `RULES.lobbyGoalFlySeconds` cumulées), Plonge (PLONGER tenu `lobbyGoalDiveHoldSeconds` d'affilée), Pique (premier `diveHit` du slot). Le téléphone coche aussi Vole/Plonge localement pour un retour instantané.

## 3. Contrat réseau (src/shared/messages.ts, `PROTOCOL_VERSION = 2`)

- Téléphone → PC : `in {seq, x, y, b, d, f}` (x, y repère écran, y > 0 = haut ; en Relatif, seul x compte ; en Inclinaison, déjà converti ; `b` bitmask `BTN_DIVE=1`, `BTN_FLAP=2` ; `d`, `f` compteurs d'appuis) ; `hello` ; `profile {name, color}` ; `ready` ; `scheme` ; `assist` ; `action` ; `net {rtt}`.
- PC → téléphone : `view`, `st` (statut), `cue`, `haptic`, `toast`, `who` (redemande le hello).
- Un téléphone qui reçoit une vue d'une autre version recharge sa page une fois (même salle, même id) : un redéploiement ne laisse pas de manettes périmées.
- Conversion en `BirdInput` (`src/net/phoneInput.ts`) : Absolu/Inclinaison → direction écran = direction monde (haut = nord) ; Relatif → cap courant ± 25° à 90° selon |x| (au-delà de la zone morte), recalculé à chaque tick = virage continu.

## 4. App téléphone (src/phone)

Écrans : rejoindre (code `?r=CODE` ou saisie), connexion, attente de l'écran, profil (nom tiré au hasard + dé, 12 jetons à glyphes, prises barrées, couleur proposée), salon (manette active + 3 micro-objectifs + cartes des règles animées + « Lancer » dans le bandeau du meneur), cartes avant la manche (OK + compte des prêts + échéance), manette, entre les manches (stats perso + Prêt), fin de partie (titre, podium, Revanche / Salon + votes), arrivé en cours de partie, erreurs (introuvable, pleine, retiré, ouverte ailleurs). Surcouches : pause (appui long 1 s sur le bouton du bandeau), « Le vent t'a emporté… » (coupure du téléphone, après 0,9 s), « L'écran se reconnecte… » (PC hors ligne), réglages (profil, Absolu / Relatif / Inclinaison avec autorisation iOS et Recalibrer, aide au vol, vibrations, règles), messages, effets.

Manette : joystick flottant (moitié gauche, rayon `RULES.joystickRadiusPx`, zone morte pointillée, le socle suit le pouce), PLONGER (38 % de la hauteur, icône oiseau + ombre qui descend localement à la vitesse de descente → « bas : petite ombre dense »), PIQUER (couleur de la cible, étoile d'encre), COUP D'AILE (28 %, anneau de recharge prédit localement puis corrigé par le PC), bandeau (jeton + nom, rang, part, couronne, caché, mini-arc du soleil, pause), fond = lavis de la couleur du joueur (+ trame en mode daltonien, glyphe en grand). Portrait de secours : boutons empilés à droite, joystick en bas à gauche, rang / part / soleil en grand en haut. Multi-touch : un pointeur par commande (Pointer Events + capture). Wake Lock (+ vidéo muette 1,5 ko en repli), plein écran et paysage au premier appui (Android), gestes du navigateur bloqués, zones sûres. Vibrations GDD §12.3 ; sans `navigator.vibrate` (iOS), flash du bandeau.

## 5. Vérifications

- `npx vitest run src/net src/phone` : 31 tests (backoff, RTT, codes, noms, conversion d'entrée, statut, cues, objectifs, inclinaison, et **intégration** avec le vrai serveur : salle, hello, entrées et compteurs, vues diffées, reconnexion, redémarrage du serveur au même code, rafraîchissement du PC, kick, salle inconnue, manette ouverte deux fois).
- `npx tsx tools/phone-e2e.mjs` (port 8803 libre) : build de production de la manette seule (`tools/phone-vite.config.mjs`, dans `node_modules/.cache/`) servi par le relais en mode production, comme en déploiement (`--dev` pour Vite). **64 vérifications** : parcours complet sur iPhone 15 Pro paysage — profil, Wake Lock / plein écran au premier appui, gestes bloqués, multi-touch CDP joystick + PLONGER simultanés, objectifs, réglages (Relatif, aide au vol, nom + couleur), lancement, cartes, compte à rebours, PIQUER, bordure rouge + vibration [120], flash du bandeau sans `navigator.vibrate` (iOS), recharge prédite, pause par appui long (l'appui court ne pause pas), coupure du socket, surcouche de reconnexion, PC hors ligne puis rafraîchi (même salle), **redémarrage du serveur** (même code, compteurs monotones), entre manches, revanche, retiré, introuvable → saisie du code, « Rejoindre », salle pleine (12 manettes Node + navigateur), aucune erreur JS ; puis galerie en FR et EN (locale du navigateur assortie) sur iPhone 15 Pro et Pixel 7, paysage et portrait, avec un contrôle multi-touch par combinaison : rejoindre, profil, salon, cartes, PIQUER, décroché, entre manches, fin de partie, arrivé en cours, réglages, pause, reconnexion, salle introuvable (`shots/net-phone/e2e-*.jpg`). En mode Vite (`--dev`), le rechargement HMR des pages au redémarrage du serveur rendait l'étape « redémarrage » sensible au temps de compilation : d'où le build de production par défaut.
- `npx tsx tools/mock-host.ts [--demo] [--lang=en]` : faux PC interactif (commandes `lobby | intro | play | roundEnd | matchEnd | pause | resume | cue <nom> | kick <n> | cb | quit`), journal des entrées.
- Page de dev : `http://localhost:8803/dev/phone.html` (vignettes de tous les scénarios), `?s=<scénario>&lang=en&color=5&cb=1&scheme=tilt`.

## 6. Décisions

- **La pause est une surcouche** (`paused`), pas un écran : l'écran sous-jacent reste en place et reprend sans remontage.
- **« Lancer la partie » dans le bandeau** : loin du joystick, pas de lancement accidentel pendant l'entraînement.
- **Libellés des boutons en Patrick Hand SC** (bible : boutons) et non en Julius : lisibles à bout de bras. Chiffres toujours en Averia (`useTn` compose les paramètres numériques des phrases en Averia).
- **Glyphes** : géométrie reprise des SVG de l'agent ui (`public/ui/glyphs`) pour être identiques à la TV ; papier sur les trois couleurs sombres (Indigo, Carmin, Sarcelle) pour rester lisibles.
- **Bordure rouge** à la prise d'élan (GDD, mission) : seule entorse à « jamais de rouge » ; elle pulse et s'accompagne d'un « ! » et du COUP D'AILE qui clignote.
- **Clac** : éclair blanc sur les bords + « COUP D'AILE ! » près du bouton (un flash plein écran masquait l'instruction).
- **Prédiction locale** : appui (vibration 6-12 ms + enfoncement), icône d'altitude, recharge du coup d'aile, objectifs Vole/Plonge. Le PC corrige (recharge réelle `flapCd`, coches).
- **Réseau** : une coupure < 0,9 s ne montre rien. Salle introuvable : patience 60 s si déjà rejointe (redeploy 31 s + reconnexion du PC), 6 s sinon. Node (undici) n'émet parfois que `error` sur un refus de connexion : `close` et `error` mènent au même traitement idempotent.
- **Le téléphone suit la langue du PC** dès la première vue (termes identiques à la TV : PLONGER, COUP D'AILE) ; avant, celle du navigateur.
- **Mode Relatif** : écart de cap 25° → 90° (constantes locales `RELATIVE_MIN_DEG/MAX_DEG`, à déplacer dans RULES : demande).
- **Inclinaison** : vecteur « haut du monde » reconstruit depuis beta/gamma (continu, pas de saut à la verticale), rotation minimale depuis la pose calibrée, repère de l'écran selon `screen.orientation.angle` ; zone morte 5°, plein effet 20°, intensité ≥ 0,25 au-delà de la zone morte. Recalibrage au « Compris » des cartes et par bouton.

## 7. Limites connues, reste à faire

- Le runner (phase 3) doit construire les vues ; `tools/mock-host.ts` (`viewFor`) est un exemple complet de chaque charge d'écran.
- iOS réel non testé (pas d'appareil) : Wake Lock natif ≥ 16.4, repli vidéo ; pas de plein écran sur iPhone ; paysage non verrouillable hors plein écran → mise en page portrait prévue. Inclinaison iOS : autorisation demandée depuis « Activer l'inclinaison » ou le choix du mode dans les réglages.
- `RULES` ne contient pas encore les constantes du mode Relatif (demande).
- Le téléphone n'affiche pas la liste des joueurs du salon (la TV le fait).

## 8. Polish vague 1 (correcteur phone) — détail : docs/polish/fix-phone.md

- **API** : `PhoneView.reduceFlashes?: boolean` (réglage « Réduire les flashs » du PC, rempli par `phoneView()` dans `src/host/runner/views.ts`). Optionnel : pas de changement de `PROTOCOL_VERSION`. Le téléphone pose `.reduce-flash` sur `.app` : ni éclair du clac, ni flash de bordure / de bandeau (remplaçants iOS), bordure rouge tenue sans pulsation, anneau de COUP D'AILE fixe, gloire de fin immobile.
- **Géométrie des commandes** sur `.app` (`App.tsx` : `--stick-r`, `--dive-frac`, `--flap-frac` ; `phone.css` : `--dive`, `--flap`, `--flap-reserve`) : la manette et les cases du salon partagent les mêmes réserves. `Controller` ne pose plus ces variables.
- **Salon** : colonne flex (`.ctl-overlay`) : objectifs bornés avant l'anneau de COUP D'AILE ; carte des règles dans `.lobby-mid` (colonne centrale entre le socle au repos et COUP D'AILE, taille selon la hauteur, `container-type: size`) ; carte à opacité 0 tant qu'un pouce est posé. Message « qui lance » dans le bandeau (`.band__wait`) en paysage, sous la carte en portrait. Socle au repos à 60 % de la hauteur au salon, « Pouce ici » à cheval sur le bas du socle.
- **Messages** (`.toasts`) posés sur le bandeau, au-dessus de tout ; entrée / sortie par essuyage (pas de fondu). **Tampons** (`.fx__stamp`) sous le bandeau, au centre de la zone libre (44 %), sortie par essuyage.
- **PIQUER** : rayons dans le disque (38 → 47 % du diamètre, tournés de 22,5°), battement au lieu de rotation.
- **Petits paysages (≤ 360 px de haut)** : bandeau 50 px, boutons d'interface et textes resserrés ; les disques gardent les fractions RULES. Cartes avant la manche : « Compris » toujours visible, la grille cède / défile.
- **Textes** : `NumText` / `splitNumbers` (chiffres en Averia dans un texte déjà formaté), `pluralOne` (« 0 soleil »), `sentenceLines` (copie de la règle TV) dans `src/phone/format.tsx` ; glossaire EN (strike / DIVE) dans `phone.ts`.
- **Cartes des règles** : `rulePalette(color)` (RulesCards.tsx) peint la règle à la couleur du joueur (lavis fort KF16 / pâle KF80, bible §3.3) face à un rival contrasté.
- **Fin de partie** (`src/phone/ui/Celebrate.tsx`) : `WinnerFlood` (lavis du vainqueur en 1,5 s, front mouillé), `InkGlory`, `DRUM_ROLL` (vibration) ; les autres voient leurs chiffres s'écrire à la plume (`.ink-write`).
- **Page de dev** : scénarios `play-hit`, `play-toast`, `lobby-toast` ; `rf=1` = réduire les flashs. Outils : `tools/polish/phone/{gallery,phonegallery,one,frames}.mjs`.
