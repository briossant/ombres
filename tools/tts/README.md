# tools/tts — voix du narrateur (TTS local, gratuit)

Pré-génère pendant le dev les répliques du narrateur d'Ombres en **français** et en **anglais**, en MP3 normalisés, avec un manifest de durées. Rien n'est appelé pendant le jeu. Recherche et comparatif : `docs/research/tts.md`.

- **Moteur par défaut** : [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts) 3.3.0. Code MIT, poids **CC-BY-4.0** (dépôt non restreint `kyutai/pocket-tts-without-voice-cloning`), 100 M paramètres, plus rapide que le temps réel sur CPU.
- **Voix par défaut** : `bill_boerst`, un lecteur LibriVox publié sous **CC0** via Voice-Zero. On garde la même voix en FR et en EN.
- **Moteurs secondaires** :
  - Supertonic 3 (Supertone ; code MIT, modèle OpenRAIL-M) : ONNX, rapide, 10 voix ;
  - Kokoro-82M (Apache-2.0) : pour l'anglais alternatif et pour la voix FR féminine `ff_siwis`.
- **Option** : Chatterbox Multilingual (MIT) pour cloner une voix de référence libre. Il est lent sur CPU et demande un venv séparé.

## Installation (une fois)

```bash
cd tools/tts
./setup.sh            # crée .venv (python3.11, torch 2.14 + torchaudio CPU, pas de CUDA) et installe requirements.txt
```

- Il faut `python3.11` et, de préférence, `uv` (sinon le script bascule sur `python -m venv` + pip). **Aucune installation système n'est faite.**
- Les modèles se téléchargent au premier lancement dans `~/.cache/huggingface`. Comptez environ 220 Mo par langue pour Pocket et 330 Mo pour Kokoro. Avec `--takes`, il faut aussi environ 400 Mo pour UTMOS, et environ 480 Mo pour whisper-small (`--asr`).
- Sur NixOS, `tts.sh` exporte `LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH`, parce que les wheels torch ont besoin de `libstdc++` via nix-ld. Si `ffmpeg` manque dans le PATH, le script se relance tout seul dans `nix-shell -p ffmpeg`. Le devShell du `flake.nix` fournit déjà ffmpeg.

Installation manuelle équivalente :

```bash
uv venv -p python3.11 .venv
uv pip install --python .venv/bin/python "torch==2.14.0" "torchaudio==2.11.0" --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv/bin/python -r requirements.txt \
  --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
```

## Utilisation

```bash
# depuis la racine du repo
tools/tts/tts.sh assets-src/narrator/lines.json --out public/audio/narrator --takes 4 --asr
tools/tts/tts.sh tools/tts/lines.example.json --out /tmp/narr --dry-run    # voir ce qui serait généré
tools/tts/tts.sh lines.json --out public/audio/narrator --only lead_coral,last_ten --force
```

**Entrée** : une liste JSON.

```json
[
  {"id": "lead_coral", "lang": "fr", "text": "Le Corail prend la tête !"},
  {"id": "lead_coral", "lang": "en", "text": "Coral takes the lead!"},
  {"id": "last_ten", "lang": "fr", "text": "Dix secondes. [pause 600] Tout peut encore basculer."}
]
```

- `id` : `[a-z0-9_-]`. Il est unique par langue et le même `id` sert en FR et en EN.
- Champs optionnels :
  - `voice` : nom d'un preset de `voices.json`. Par défaut `narrator`.
  - `seed` : entier. Le changer re-tire une prise.
  - `keywords` : mots qui doivent être entendus par l'ASR avec `--asr`, typiquement le nom de couleur, par exemple `["Corail"]`. Une prise où l'un d'eux manque est rejetée. Les variantes homophones que Whisper orthographie autrement se séparent par `|` : `["Lilas|lila"]`, `["Saffron|Safran"]`.
  - `say` : graphie **prononcée**, si elle doit différer du sous-titre. Par exemple `"text": "Le Carmin prend la tête !"` avec `"say": "Le Carmain prend la tête !"` : Pocket dit sinon « Carmen ». Le TTS lit `say`, le jeu affiche `text`.
- `[pause]` ou `[pause 700]` insère un silence exact, en millisecondes (500 par défaut). Les TTS rallongent peu les pauses sur « … » : pour un vrai silence dramatique, utilisez `[pause]`.
- Écrivez les nombres en lettres (« Dix secondes », pas « 10 secondes »).

**Sortie** :

- `<out>/<lang>/<id>.mp3` : mono, 44,1 kHz, VBR `-q:a 3` (environ 80-90 kb/s, soit ~11 Ko par seconde), loudness **-16 LUFS intégrés** (mesuré : ±0,2 avec `narrator`, pire cas -16,6), true-peak ≤ -1,5 dBTP. Le fichier commence par 40 ms de silence et se termine par 200 ms.
- `<out>/manifest.json` :

```json
{"generator": "ombres-tts/1", "format": {...}, "loudness_target": {...}, "total_duration_s": 33.3,
 "lines": [{"id": "lead_coral", "lang": "fr", "text": "...", "file": "fr/lead_coral.mp3",
            "duration_s": 2.0, "lufs": -16.0, "true_peak_db": -2.5, "voice": "narrator",
            "engine": "pocket", "seed": 1335, "take": "2/4", "utmos": 3.9, "asr_cer": 0.0,
            "asr_text": "Le corail prend la tête.", "asr_ok": true, "hash": "…"}]}
```

Le jeu lit `duration_s` pour caler les sous-titres et l'enchaînement des répliques. Ce sont les durées réelles des MP3, padding inclus.

## Qualité : prises multiples et vérification automatique

Personne ne peut écouter chaque prise. Les garde-fous sont donc automatiques :

1. **Garde-fous de débit** (toujours actifs) : entre 0,035 et 0,16 s par caractère, pas de trou de plus de 1,2 s, pas de sortie muette. Une prise aberrante est refaite, avec au plus 2 prises de secours.
2. **`--takes N`** : génère N prises (graines `seed + 101·k`) et garde celle qui a le meilleur score **UTMOS** (prédicteur de MOS). On conseille 4. Avec Pocket, cela coûte environ 1 s de CPU par prise et par réplique courte.
3. **`--asr [modèle]`** : transcrit la prise retenue avec faster-whisper (`small` par défaut). Si le CER dépasse `--max-cer` (0,12), l'outil passe à la prise suivante. Avec `keywords`, chaque mot-clé doit aussi apparaître dans la transcription. Si aucune prise ne passe, l'outil garde la moins mauvaise, écrit un `⚠` dans le log et met `"asr_ok": false` dans le manifest. Il faut alors reformuler la réplique ou changer de voix. Avec `--asr large-v3-turbo`, la vérification est plus sûre sur les noms propres, mais elle prend environ 15 à 35 s par réplique sur le Ryzen 4600H.

Pourquoi c'est utile :

- Pendant les tests, une prise du modèle FR 24 couches était inintelligible (« or coree pronotate » au lieu de « Le Corail prend la tête »), alors que son score UTMOS était bon (4,19). **Seul l'ASR attrape ce cas.**
- Pocket `french` sous-articule parfois le dernier mot d'une phrase : environ 1 prise sur 20, et 13 sur 16 quand la phrase finit par « de l'Ocre ».
- Test des 12 couleurs du jeu (« Le X prend la tête ! ») :
  - 2 vrais problèmes FR, corrigés par la graphie : « Carmin » dit « Carmen », corrigé par `say` « Carmain » ; « Le Sarcelle » dit « sorcelle », corrigé par « **La** Sarcelle ».
  - 3 faux positifs d'orthographe ASR : « Lilas » transcrit « lila », « Saffron » transcrit « Safran », « Azure » transcrit « as your ». On les gère avec `|` dans `keywords` ; pour « Azure », le CER reste haut : alerte à valider à l'oreille.

## Idempotence

- Chaque MP3 porte dans son tag ID3 `comment` un hash `ombres-tts/1:<sha256[:16]>`. Ce hash couvre le texte, la langue, le preset de voix complet, la graine et les réglages de post-traitement.
- Au lancement, un fichier existant dont le hash correspond est **ignoré**. Si le texte ou la voix a changé, **seule la ligne concernée** est régénérée (log `↻`). `--force` régénère tout.
- Un MP3 **sans tag `ombres-tts`**, par exemple un enregistrement humain déposé à la main, n'est **jamais écrasé** sans `--force` (log `⏭`, `"engine": "external"` dans le manifest).
- `--takes` et `--asr` ne font pas partie du hash. Pour refaire une ligne avec plus de prises, utilisez `--force --only id`.
- Écritures atomiques (fichier temporaire puis `rename`). Le manifest est réécrit après chaque ligne : un Ctrl-C ne perd rien, et on peut relancer.
- Si le manifest est supprimé, il est reconstruit sans régénérer l'audio.
- Les MP3 dont l'id n'est plus dans l'entrée sont signalés mais **jamais supprimés**.

## Presets de voix (`voices.json`)

| preset | FR | EN | usage |
|---|---|---|---|
| `narrator` | pocket `french` / `bill_boerst`, tempo 0,92 | pocket `english` / `bill_boerst`, tempo 0,92 | **défaut** : conteur posé, même voix dans les 2 langues |
| `narrator_deep` | pocket `french` / `peter_yearsley`, tempo 0,95 | idem en `english` | voix plus grave (F0 ≈ 85-95 Hz), plus variable |
| `narrator_bright` | pocket `french` / `george` (VCTK, CC-BY) | pocket `english` / `george` | meilleur UTMOS FR, débit rapide (tempo 0,9) |
| `narrator_supertonic` | supertonic-3 `M4`, vitesse 0,9, 16 étapes | idem | alternative : intelligibilité FR parfaite dans nos tests ; modèle OpenRAIL-M |
| `narrator_kokoro` | kokoro `ff_siwis` (f) speed 0.9 | kokoro `bm_george` speed 0.9 | secours : voix FR **féminine** |

Paramètres par moteur :

- **pocket** : `model` (`french`, `french_24l`, `english`…), `voice` (voix prédéfinie ou chemin `.wav`/`.safetensors`), `temperature` (0,3 recommandé), `seed`, `tempo` (post-traitement ffmpeg `atempo`, par exemple 0.94 pour ralentir de 6 %).
  - Cloner un `.wav` demande les poids restreints `kyutai/pocket-tts` : il faut accepter les conditions sur Hugging Face et exécuter `hf auth login`.
- **kokoro** : `lang_code` (`f` pour FR, `a` pour US, `b` pour UK), `voice`, `speed`.
- **supertonic** : `model` (`supertonic-3`), `voice` (`M1`…`M5`, `F1`…`F5`), `lang`, `speed` (défaut du paquet : 1,05), `steps` (16 conseillé), `seed`.
- **chatterbox** : `language_id`, `reference` (wav de 6 à 10 s sous licence libre), `exaggeration` (0,5), `cfg_weight` (0,5 ; 0,3 donne un débit plus lent), `t3_model` (`v3`).

**Licences des voix** : n'utilisez **que** des voix CC0 ou CC-BY. À exclure : `cosette` (Expresso) et `jean` (EARS), qui sont **CC-BY-NC**.

| voix Pocket | source | licence |
|---|---|---|
| `bill_boerst`, `peter_yearsley`, `stuart_bell`, `caro_davy` | LibriVox via Voice-Zero | CC0 |
| `marius`, `javert` | Unmute Voice Donation | CC0 |
| `estelle` | enregistrement Kyutai | CC0 |
| `alba` | Alba MacKenna | CC-BY-4.0 |
| `george`, `michael`, `paul`, `charles`, `anna`, `vera`… | VCTK | CC-BY-4.0 |

## Chatterbox (optionnel, venv séparé)

```bash
cd tools/tts
uv venv -p python3.11 .venv-chatterbox
uv pip install --python .venv-chatterbox/bin/python "torch==2.6.0+cpu" "torchaudio==2.6.0+cpu" --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv-chatterbox/bin/python -r requirements-chatterbox.txt \
  --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
uv pip install --python .venv-chatterbox/bin/python --no-deps "git+https://github.com/resemble-ai/chatterbox@master"   # modèle v3
OMBRES_TTS_VENV=$PWD/.venv-chatterbox ./tts.sh lines.json --out ... # avec un preset "engine": "chatterbox"
```

Ajoutez `setuptools<81` : sans lui, `resemble-perth` échoue silencieusement et le chargement plante avec `'NoneType' object is not callable`. Sur le Ryzen 5 4600H, comptez environ 3 à 4 tokens/s, soit **8 à 20 fois le temps réel** (40 à 110 s par réplique). Chaque sortie est tatouée (watermark PerTh inaudible).

## Crédits à mettre dans le jeu

> Voix du narrateur synthétisée avec Pocket TTS de Kyutai (modèle sous licence CC-BY 4.0).
> Voix d'origine : « Bill Boerst » (LibriVox, domaine public / CC0, sélection Voice-Zero).

Si vous utilisez une voix VCTK ou `alba`, ajoutez la mention CC-BY correspondante : « CSTR VCTK Corpus, University of Edinburgh » ou « Alba MacKenna ». Si vous utilisez Kokoro, ajoutez « Kokoro-82M, hexgrad, Apache-2.0 ». Si vous utilisez Supertonic, ajoutez « Supertonic, Supertone Inc. (modèle OpenRAIL-M) », et respectez les restrictions d'usage de la licence : pas d'usurpation d'identité ni de désinformation.

## Dépannage

| symptôme | cause | solution |
|---|---|---|
| `libstdc++.so.6: cannot open shared object file` | NixOS | lancez via `tts.sh`, ou `export LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH` |
| Kokoro : `Error processing file '…/espeakng_loader/phontab'` | espeak-ng tronque les chemins de plus de 160 caractères | corrigé automatiquement (copie dans `~/.cache/ombres-tts/espeak-ng-data`) |
| Kokoro EN : `No virtual environment found; run uv venv` | spaCy tente de télécharger `en_core_web_sm` avec pip | le modèle est épinglé dans `requirements.txt` |
| mot final avalé ou flou (« …du désert de ») | sous-articulation du dernier mot par Pocket FR (ce n'est pas une troncature) | `--takes 4 --asr`, et reformuler pour ne pas finir sur un nom court |
| `ffmpeg introuvable` | ffmpeg absent du PATH | `nix develop`, ou laissez `tts.sh` relancer dans `nix-shell -p ffmpeg` |
