# Agent director — narrateur et indications contextuelles

État : **terminé et vérifié**. Logique (narrateur, indications) testée (71 tests) ; textes FR/EN ; **voix : 722 clips générés et vérifiés** (0 refus ASR sur les MP3 finaux, durée parlée ≤ 2,96 s, 8,3 Mo) ; déjà branchée côté audio (`src/host/audio/narrator.ts` utilise `indexNarratorManifest`, `narratorTextParts`, `subtitleSeconds`).

| Fichier | Rôle |
|---|---|
| `src/director/narrator.ts` | `NarratorDirector` : détecte les situations, décide QUELLE réplique jouer et QUAND (GDD §16.3-16.4). Pur. |
| `src/director/hints.ts` | `HintsDirector` : les 10 indications contextuelles (GDD §15.4), mémoire injectée. Pur. |
| `src/director/lines.ts` | catalogue : 53 répliques, 34 types d'événement, priorités, plafonds, écarts. |
| `src/director/text.ts` | texte des sous-titres/bulles découpé autour du nom de couleur, chemins des clips, durées d'affichage. |
| `src/director/manifest.ts` | index du manifest audio : durées, fichiers, liste de préchargement par langue et couleurs présentes. |
| `src/director/index.ts` | réexporte l'API publique. |
| `src/director/testing.ts` | `FakeSim` : état de simulation factice (tests, page de dev). |
| `src/director/*.test.ts` | 71 tests vitest (flux d'événements synthétiques, invariants sur manches entières, coût par tick). |
| `src/shared/strings/narrator.ts`, `hints.ts` | textes FR/EN (`narrator.<lineId>`, `hints.<hintId>`). |
| `public/audio/narrator/<lang>/<lineId>[.<colorIndex>].mp3` + `manifest.json` (réduit) | voix (Pocket TTS). |
| `tools/tts/narrator.manifest.json` | manifest complet du lot (contrôle qualité : prise, UTMOS, transcription, durée parlée). |
| `tools/tts/narrator.sh`, `narrator-lines.ts`, `narrator-retry.ts`, `narrator.seeds.json` | génération reproductible des voix. |
| `dev/narrator.html` + `src/dev/narrator/` | page de contrôle : toutes les répliques (écoute, durée, transcription ASR), manche synthétique jouée par le vrai directeur, indications. `http://localhost:8806/dev/narrator.html` (`?lang=en`, `?color=5`, `?problems`). |

## 1. Intégration (phase 3)

### 1.1 Narrateur

```ts
import { NarratorDirector, indexNarratorManifest, narratorClipPath, narratorTextParts, subtitleSeconds } from '../director'

// Au chargement : manifest des voix (seule la langue active est à précharger).
const manifest = await (await fetch('audio/narrator/manifest.json')).json()
const clips = indexNarratorManifest(manifest)
const narrator = new NarratorDirector({
  durationOf: (lineId, colorIndex) => clips.duration(getLang(), lineId, colorIndex), // sinon estimation depuis le texte
})
// Préchargement : clips.preload(lang, colorIndicesPresents) → liste de fichiers (neutres + couleurs en jeu).

// Joueurs (à rappeler à chaque changement : remplaçant bot, reconnexion) :
narrator.setPlayers(players.map(p => ({ slot: p.slot, colorIndex: p.colorIndex, human: p.kind !== 'bot' })))

narrator.startMatch({ rounds, lastRoundDouble })   // nouvelle partie ET revanche
narrator.startRound(roundIndex1Based, now)          // à la présentation de la manche, AVANT le compte à rebours
// À chaque tick de simulation (mode 'round' ; ignoré en lobby/démo) :
const events = sim.step(inputs)
const cue = narrator.update(sim.state, events, now, inputs)   // inputs facultatif (réplique « immobile »)
// Entre deux manches / en pause : narrator.poll(now)
narrator.roundResults(sim.state, now)   // quand le vainqueur de la manche est révélé (GDD §11.3)
narrator.matchResults(winnerSlots, now) // podium (plusieurs slots = co-victoire)
narrator.rematch(now)                   // revanche lancée, puis startMatch(...)
```

- Chaque méthode peut retourner une `NarratorCue` **à lancer immédiatement** (ou `null`). Au plus une à la fois ; le directeur garantit l'écart et l'absence de chevauchement en supposant que la réplique dure `cue.duration`.
- `now` : **temps réel en secondes** (`performance.now() / 1000`), celui de l'audio. Les conditions de jeu (8 s caché, 2 s de couronne, instants de phase × T/110) sont lues en temps de simulation dans `SimState`.
- `NarratorCue` : `{ lineId, kind, colorIndex?, slot?, priority, key, duration }`.
  - **Voix** : `narratorClipPath(cue, lang)` → `audio/narrator/<lang>/<lineId>[.<colorIndex>].mp3`. Musique et ambiance à −6 dB pendant la voix (`RULES.narratorDuck*`).
  - **Sous-titre** (toujours, sauf réglage « Désactivé ») : `narratorTextParts(cue, lang)` → `[{ text }, { text: 'Corail', colorIndex: 0 }, { text }]` ; le morceau avec `colorIndex` s'écrit en variante texte de la couleur (`PLAYER_COLORS[i].text`), précédé de la pastille, et du glyphe en mode daltonien (ART_BIBLE §8.2). Durée : `subtitleSeconds(cue, voice)`.
  - Réglage `settings.narrator` : `voice` = clip + sous-titre ; `text` = sous-titre seul ; `off` = ne rien afficher (le directeur peut continuer à tourner). Si le MP3 manque ou si l'autoplay est bloqué : sous-titre seul.
- Rafraîchissement du PC : `exportMemory()` (JSON) dans la sauvegarde de partie, `importMemory()` à la reprise (variantes déjà dites, plafonds par partie).

### 1.2 Indications

```ts
import { HintsDirector, createKeyValueHintMemory, hintText, hintTextParts, hintDisplaySeconds } from '../director'

const hints = new HintsDirector({ memory: createKeyValueHintMemory(localStorage), mode: getSettings().hints })
useSettings.subscribe(s => hints.setMode(s.hints))
hints.setPlayers(players.map(p => ({ slot: p.slot, key: p.phoneId ?? `kb${p.slot}`, human: p.kind !== 'bot', colorIndex: p.colorIndex })))
hints.startMatch(); hints.startRound()           // aux mêmes moments que le narrateur
for (const cue of hints.update(sim.state, events, inputs)) {
  // TV : cue.display === 'bubble' → bulle à la couleur du joueur près de l'oiseau cue.anchorSlot
  //      cue.display === 'banner' → bandeau (une seule fois même si plusieurs destinataires : cue.broadcast)
  // Téléphone du joueur cue.slot : { k: 'toast', key: cue.key, params: hintParams(cue, lang) } (t(key, params) = texte complet)
  // cue.effect : 'pulseThread' (fil oiseau→ombre qui pulse), 'arrowNorthSouth', 'arrowEast' (flèches du bandeau)
}
```

- `hintText(cue, lang, { dive, flap })` / `hintTextParts(...)` (TV) et `hintParams(cue, lang, labels)` (téléphone) : pour un joueur au clavier, passer les libellés de touches (sinon « PLONGER » / « COUP D'AILE »).
- `update()` retourne un tableau figé vide quand il n'y a rien (appelé à 30 Hz, pas d'allocation) : ne pas le modifier.
- Durée d'affichage : `hintDisplaySeconds(texte)` (2,5 à 6 s, toujours sous l'écart de 8 s).
- Réglage « Conseils » : `auto` = jamais vues par ce joueur (mémoire), `always` = toutes une fois par partie, `never` = aucune.

### 1.3 Ce qui reste côté intégration

- **runner** : appeler les deux directeurs comme ci-dessus ; transmettre les indications aux téléphones.
- **audio** : jouer le clip, ducking −6 dB (attaque 80 ms, relâche 400 ms), volume « Voix », repli texte.
- **ui** : récitatif (bas centre, essuyage d'encre 250 ms), bulles d'indication près des oiseaux, bandeaux.
- **birds** : effet `pulseThread` pendant l'indication « Vise avec ton ombre ».

## 2. Règles implémentées (GDD §16.3)

- Écart de **8 s entre deux débuts** de réplique (3 s en priorité 1), **jamais de chevauchement** (+ 0,4 s de respiration après la fin).
- **8 répliques au plus par manche** hors ouverture et résultats ; les répliques d'horloge encore à venir (heure dorée, couchant, Grande Ombre, dix secondes) sont **réservées** dans ce budget, les événements ne peuvent pas les évincer. La priorité 1 passe toujours.
- **Péremption** 2,5 s (4 s en priorité 1) ; conditions durables (couronne, cachette, tempête, écart, immobile) : valables tant que la condition tient, au plus 8 s.
- **File de priorité** : priorité, puis spécificité (un doublé l'emporte sur une touche simple issue du même piqué), puis fraîcheur. **Un événement 100 % bots perd un niveau** ; la variante qui nomme un humain est préférée (piqué : chasseur ou victime).
- **Plafonds** par type et par manche/partie (tableau de `lines.ts`), écarts par groupe : piqués 25 s, meneur 20 s, gros vols 20 s.
- **Silence** pendant le compte à rebours et à partir de 107 s (× T/110).
- **Aucune variante rejouée dans une partie** ; exceptions structurelles (ouverture de manche, Grande Ombre, dix secondes, victoire de manche, vainqueur, revanche) : quand tout a servi (partie en 5 manches), la moins récente revient plutôt que le silence.
- Résultats : **une réplique** parmi égalité, écrasante, serrée, dernier rayon, remontée, mirage, puis victoire (GDD §16.4), la première applicable et inédite.

## 3. Décisions (et pourquoi)

1. **Répliques réécrites** (toutes < 3 s à l'oral, mesuré) : à ~11 caractères/s (voix posée, tempo 0,92), les répliques du GDD duraient 3,5 à 5 s. Deux phrases courtes au plus, humour sec conservé. Couleur toujours nom propre nu, jamais en dernier mot (Pocket avale le mot final : « Même les couronnes tombent. Demandez à {color}. » → « … {color} vous le dira. »), jamais « de/que {color} ». Vérifié automatiquement par `narrator-lines.ts --check`.
2. **Variantes ajoutées** pour tenir la règle « aucune variante rejouée » sur une partie de 3 manches : ouverture de manche ×3, heure dorée ×3, couchant ×3, Grande Ombre ×3, dix secondes ×3, photo-finish ×2, arrivée serrée ×2, victoire de manche ×3, changement de meneur ×4, + co-victoire de partie. 28 modèles à couleur, 25 neutres : 722 clips.
3. **Photo-finish en priorité 1** (GDD : 2) : à 104 s, après « Dix secondes » (≈ 101 s), l'écart de 8 s et le silence de 107 s le rendaient injouable.
4. **Dernière manche** : la réplique « dernier soleil » (avant le compte à rebours) remplace l'ouverture de cette manche (pas deux répliques en 5 s).
5. **Changement de meneur** lu sur l'événement `crown` (émis après l'hystérésis de 2 s) : le narrateur annonce le meneur que la couronne montre, jamais un autre. Première couronne de la partie : « {color} porte la couronne. Tout le monde la voit. »
6. **Gros vol / balayage** : un seul événement `bigSteal` produit deux candidats (balayage ≥ 6 % après 85 s, sinon gros vol ≥ 4 %) ; la variante « victime » nomme `bigSteal.victim`.
7. **Remontée** : « podium » = 3 premiers à partir de 4 oiseaux, sinon tous sauf le dernier ; rangs relevés par le directeur lui-même à 80 s et 98 s (× T/110), gain de Grande Ombre calculé depuis 98 s.
8. **Immobile** : comparé à l'entrée du dernier instant actif (un stick qui dérive lentement finit par compter) ; humains seulement, une fois par joueur et par partie.
9. **Indications générales** (couronne, heure dorée, Grande Ombre) : montrées à tous les humains concernés au moment exact, sans attendre l'écart de 8 s (elles le relancent) ; la couronne s'affiche en bulle sur le couronné.
10. **« Trop pâle pour ce sable »** : lu dans la grille (9 points de l'empreinte d'ombre sur du sable fort adverse non figé, ≥ 50 % pendant 1,5 s), complété par les événements `paleOnStrong` ; ne dépend pas de leur fréquence d'émission.
11. **Mémoire des indications** injectée (`HintMemory`) ; adaptateur `createKeyValueHintMemory(localStorage)` tolérant aux erreurs de stockage.
12. Textes d'indication : « toi caché » (accord masculin imposé au joueur) → « tu es invisible » ; libellés de boutons en paramètres `{dive}`/`{flap}` (clavier).
13. **L'horloge ne se laisse pas évincer** : une réplique d'événement ne démarre pas si l'écart qu'elle imposerait empêchait une réplique d'horloge imminente (heure dorée, couchant : 8 s ; Grande Ombre, dix secondes : sa durée + 0,4 s) ; à priorité égale et au même instant, l'horloge passe devant. Mesuré sur 180 manches synthétiques (`src/dev/narrator/simulate.ts`, 2 à 8 oiseaux) : heure dorée 96 % → **100 %**, couchant 94 % → **100 %**.

Densité mesurée sur ces 180 manches (flux d'événements denses) : **7,8 répliques en manche** en moyenne (5 à 9), plus l'ouverture et les résultats ; les quatre répliques d'horloge à chaque manche ; une seule réplique de résultats par manche.

## 4. Constantes de présentation locales (pas du gameplay)

`narrator.ts` : respiration 0,4 s entre deux répliques ; estimation de durée 0,35 s + 0,08 s/caractère ; seuil d'activité du stick 0,05 ; `RUNAWAY_FROM = 60` (demandé dans RULES). `hints.ts` : maintien d'un événement « tsk » 0,5 s, seuil pâle-sur-fort 50 %, oubli d'une indication d'événement après 3 s. `lines.ts` : écart des gros vols = `RULES.leaderChangeMinGap` (20 s, constante dédiée demandée). Voir REQUESTS.md.

## 5. Voix (tools/tts)

- **Moteur** : Kyutai Pocket TTS 3.3.0, voix `bill_boerst` (CC0) en FR et EN, température 0,3, **tempo 0,92**.
- **Longueur** : les pauses de fin de phrase de Pocket (0,55 à 1,3 s) sont ramenées à **420 ms** (`--max-pause-ms`, ajouté à l'outil) : naturel conservé, répliques < 3 s.
- **Sélection** : 4 prises par clip, meilleure UTMOS, puis **Whisper small** qui doit retrouver le texte (CER ≤ 0,12) et **le nom de couleur** (`keywords`, homophones acceptés). Whisper reçoit la liste des 12 noms en amorce (`asr_prompt`, ajouté à l'outil) : sans elle il écrit « Coray » ou « Corée » pour un « Corail » bien dit. Test A/B sur les 84 premiers clips : l'amorce corrige les noms, pas les phrases mâchées (« Volachas » reste faux).
- **Le ralenti est appliqué avant la notation** (correction de l'outil : l'ASR jugeait l'audio non ralenti), et **l'ASR juge chaque prise candidate après encodage** : Whisper-small bascule au moindre changement sur les prises limites (le même audio encodé à 32, 46 ou 48 kb/s peut passer ou échouer), il faut donc qu'il juge le fichier final. `--verify` re-transcrit les MP3 finaux et met à jour le manifest ; le lot final y passe sans alerte.
- **Rognage** : un îlot de bruit isolé en bord de prise (clic ≤ 100 ms suivi de ≥ 200 ms de silence, 3 clips EN) est désormais écarté par l'outil.
- **Normalisation ASR** : nombres jusqu'à 99 en lettres FR/EN (Whisper écrit « 36 chandelles »).
- **Reprises** : `narrator-retry.ts` donne une nouvelle graine aux clips refusés (`narrator.seeds.json`) ; le lot suivant ne régénère qu'eux.
- **Prononciation** : « Carmin » dit « Carmain » (sinon « Carmen ») ; « Rose, mord la poussière » (virgule dans le seul texte prononcé : « Rose mord » donnait « Osmore ») ; une trentaine de tournures que Pocket FR mâche ont été remplacées, constatées par l'ASR (et, pour les premières, confirmées par Whisper large-v3-turbo), par exemple : « ouvre la chasse » (« Volachas »), « lance la chasse » (« la slasheuse »), « frappe en premier » (« frappe en Prune ») → « ouvre les hostilités » ; « Levez les yeux » (« Le Vélésir ») → « Surveillez le ciel » ; « goûte au sable » (« Guto Sabre »), « voit des étoiles en plein jour » (« en plein joueur »), « voit trente-six chandelles » (« Wattron ») → « en voit de toutes les couleurs » (jeu de mots de jeu à couleurs, bien articulé) ; « Ça arrive aux meilleurs » (« Sarri, Vomir ») → « On n'a rien vu ». Pocket FR bute sur les enchaînements de sifflantes, sur les mots courts collés au nom (« Rose mord », « Corail dort ») et sur un mot final court.
- **Whisper large-v3-turbo** (conseillé par la recherche pour le lot final) : 35 à 58 s par clip sur la machine partagée, soit ~8 h pour le lot : écarté ; vérification finale faite avec `small` + amorce.
- **Format** : MP3 mono **24 kHz** (fréquence native de Pocket), **ABR 32 kb/s** (coupure ~8 kHz, la parole reste nette), −16 LUFS, crête ≤ −1,5 dBTP, ~90 ms de silence en tête et 100 ms en queue. Premier lot en VBR q5 : 46 kb/s réels, 12,4 Mo — trop lourd pour la cible de 8 Mo (2 015 s de voix au total : 8 Mo ⇔ 32 kb/s). Lot refait intégralement en ABR 32k (encodage unique, pas de transcodage).
- **Manifests** : complet (notes de prise, UTMOS, transcription, `speech_s`) dans `tools/tts/narrator.manifest.json` ; réduit (`id`, `lang`, `text`, `file`, `duration_s`, 94 Ko, ~20 Ko compressé) dans `public/audio/narrator/manifest.json`, seul chargé par le jeu.
- **Cache** des prises retenues (`tools/tts/out/cache`, ignoré par git) : un changement d'encodage ou de padding se refait en quelques secondes, sans re-synthèse.
- Commandes : `tools/tts/narrator.sh` (tout, idempotent ; `--parallel` : FR et EN dans deux processus) ; `tools/tts/narrator.sh --verify` ; `npx tsx tools/tts/narrator-retry.ts` puis `tools/tts/narrator.sh`.
- **Méthode suivie** : (1) calibration sur 130 répliques (durées réelles : ~11 caractères/s, pauses de 0,55-1,3 s → textes resserrés et pauses plafonnées) ; (2) pré-test de chaque modèle FR sur une couleur difficile (Indigo, Corail), 1-2 prises : 14 tournures que Pocket FR rend mal repérées et réécrites avant le lot ; (3) lot complet, 4 prises + ASR ; (4) `--verify` sur les MP3 finaux ; (5) nouvelles graines pour les refus, jusqu'à zéro `asr_ok: false`.
- Collisions phonétiques rencontrées (à éviter pour de futures répliques) : « Corail dort » ≈ « corridor », « Vos ombres » ≈ « Vos hommes », « le désert dort » ≈ « le désir d'or », « se tait » ≈ « c'était », « fait semblant » ≈ « fait sans blanc », « prend tout » ≈ « prune deux », « le sable » ≈ « le sabre », « Gare aux serres » ≈ « Garros Air », « Azure it is » ≈ « as your it is ». En fin de phrase, un mot court est souvent avalé (« jour », « tranchera », « Erreur », « Yet »).

### 5.1 Bilan du lot final (mesuré)

| | |
|---|---|
| Clips | 722 (28 modèles à couleur × 12 × 2 langues + 25 neutres × 2) |
| Vérification ASR (Whisper small, MP3 finaux) | **722 / 722**, 0 `asr_ok: false` |
| Durée parlée | moyenne 2,40 s, **max 2,96 s** (règle < 3 s) ; fichiers 2,66 s en moyenne, 1 917 s au total |
| Poids | **8,30 Mo** de MP3 (cible 8 Mo : +4 %) ; au runtime, une langue et les couleurs présentes seulement (~1,5 Mo à 4 joueurs) |
| Loudness | −17,1 à −16,2 LUFS, crête ≤ −1,5 dBTP |
| UTMOS moyen (prise retenue) | FR 4,10, EN 4,41 (mêmes niveaux que le banc d'essai de docs/research/tts.md) |
| Navigateur | les 722 fichiers décodés par Web Audio dans Chrome, durées = manifest à 1 ms près (`node src/dev/narrator/capture.mjs 8806 --decode-all`) |

## 6. Limites connues

- Personne n'a écouté les clips : la qualité est jugée par UTMOS + transcription + mesures (durée, pauses, loudness, spectrogrammes). Whisper-small valide un clip quand il retrouve le texte à 12 % près, ce qui tolère des homophones (« Midi, le Sabine… » pour « le sable »). Une écoute humaine rapide de la page de dev reste conseillée (bouton ×12 : un modèle dans les 12 couleurs ; surtout Rose, Corail, Carmin en FR, Azure en EN).
- Le poids dépasse de 4 % la cible de 8 Mo ; `--bitrate 30k` la tiendrait (ré-encodage depuis le cache en ~6 min, puis `--verify`), au prix d'un peu de brillance.
- Le narrateur suppose la durée annoncée du clip ; si l'audio est retardé (autoplay), l'écart suivant reste mesuré depuis le début supposé.
- Les indications et le narrateur ne voient pas l'écran : la bulle « Au clac : COUP D'AILE ! » peut arriver après un piqué très rapide (elle reste valable pendant le piqué, 3 s au plus).
