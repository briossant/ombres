# tools/tts-kaggle — banc des TTS « gros modèles » sur Kaggle

Banc d'essai reproductible des voix du narrateur sur les machines gratuites de Kaggle. Il compare des modèles récents, trop lourds pour le CPU de dev, à Pocket TTS, le moteur du lot actuel. Résultats et recommandation : `docs/research/tts-kaggle.md`.

Rien ici ne modifie le jeu. Les kernels écrivent dans leur propre sortie Kaggle ; on ne rapatrie que des JSON de mesures et quelques MP3 d'écoute.

## Contenu

| chemin | rôle |
|---|---|
| `corpus.json` | 18 répliques réelles du jeu (10 FR, 8 EN) : couleurs difficiles et tournures signalées (« L'heure dorée », « Elle fige tout », « Dix secondes »). Mots-clés et amorce ASR repris de `tools/tts/narrator.lines.json`. |
| `data/benchlib.py` | normalisation du texte et CER (identiques à `tools/tts/gen.py`), syllabes, rognage et plafonnement des pauses comme le lot |
| `data/genlib.py` | boucle de génération commune : graines `1000 + 101·k`, WAV natifs, temps de calcul, une partie par GPU |
| `data/refs_meta.json` | références de clonage (sources, licences, transcriptions) ; les WAV sont téléchargés par `make_dataset.sh` |
| `data/voices_screen.json`, `screen_voices.py` | tri sans écoute des 269 voix libres de `kyutai/tts-voices` (F0, langue, transcription) |
| `make_dataset.sh` | prépare et envoie le dataset privé `ftgplwa/ombres-tts-bench-data` |
| `kernels/pocket/` | référence Pocket TTS 3.3.0 / bill_boerst, réglages du lot (CPU) |
| `kernels/qwen3/` | Qwen3-TTS 1.7B Base (clonage) + VoiceDesign « concevoir puis cloner » |
| `kernels/voxcpm2/` | VoxCPM2 2B (clonage « ultime » + conception de voix) |
| `kernels/chatterbox/` | Chatterbox Multilingual v3 (clonage) |
| `kernels/kyutai16/` | Kyutai TTS 1.6B en_fr (voix à embedding précalculé) |
| `kernels/cosyvoice3/` | Fun-CosyVoice3 0.5B (clonage) |
| `kernels/eval/` | mesures : Whisper large-v3, UTMOS22, UTMOSv2, DNSMOS, WavLM-SV, débit, durée, F0 ; `make_shards.sh` pour l'évaluation en tranches sur CPU |

## Lancer

Accès Kaggle éphémère, rien d'installé sur la machine :

```bash
export KAGGLE_API_TOKEN="$(cat ~/.kaggle/access_token)"
K="uvx --from kaggle kaggle"
tools/tts-kaggle/make_dataset.sh /tmp/ombres-ds create        # « version » au lieu de « create » ensuite
for k in pocket qwen3 voxcpm2 chatterbox kyutai16 cosyvoice3; do $K kernels push -p tools/tts-kaggle/kernels/$k; done
$K kernels status ftgplwa/ombres-tts-qwen3
$K kernels push -p tools/tts-kaggle/kernels/eval              # GPU : lit les sorties des kernels (kernel_sources)
$K kernels output ftgplwa/ombres-tts-eval -p /tmp/eval --file-pattern '.*\.(json|md|mp3)$'
```

Réglages par variables d'environnement, avec des valeurs par défaut dans les scripts : `OMBRES_TAKES` (3), `OMBRES_REFS` (`bill,frm`), `OMBRES_LINES` (chemin d'un lot au format `narrator.lines.json`, pour une génération complète), `OMBRES_GPUS`.

## Ce que Kaggle impose (constaté le 26/09/2026)

- **Quota GPU : 6 h par semaine** sur ce compte, pas 30 h (`get_accelerator_quota_statistics` de `kagglesdk`, remise à zéro le samedi 00:00 UTC). Le temps passé en file d'attente ne compte pas.
- **Accélérateur** : `NvidiaTeslaT4` (2 × T4). `NvidiaL4` est accepté par l'API mais le kernel tombe alors sur CPU. Pas de bf16 natif sur T4 : les scripts chargent les modèles en float32.
- **2 sessions GPU et 5 sessions CPU au plus.** Une version de kernel en file d'attente continue de compter quand on en pousse une nouvelle, et un `push` qui répond 500/502 peut laisser une session fantôme : on reste alors bloqué à « Maximum batch GPU session count of 2 reached » sans rien voir tourner. Il n'existe pas de commande pour annuler une session sans son identifiant.
- **Repli CPU** : tous les scripts de génération tournent aussi sur les kernels CPU (4 vCPU, sans quota), en mettant `"enable_gpu": false` et en retirant `machine_shape`. C'est plus lent (voir le doc de recherche) mais suffisant pour 18 répliques × 3 prises.
- **Évaluation en tranches sur CPU** : `kernels/eval/make_shards.sh <dossier> <nom> <préfixes> <kernels-sources> <n>` fabrique n kernels qui mesurent chacun une tranche ; on rapatrie les `metrics_shard*.json` et `refemb.json`, puis `OMBRES_INPUT=<dossier> OMBRES_WORK=<dossier> python kernels/eval/evaluate.py --merge` agrège en local (numpy seulement).
- faster-whisper (CTranslate2) a besoin des bibliothèques `nvidia-cublas`/`nvidia-cudnn` des paquets pip dans `LD_LIBRARY_PATH` : `evaluate.py` se relance lui-même avec ce chemin.
- Pièges d'installation rencontrés : `voxcpm` 2.0.3 (PyPI) n'accepte pas `seed=` ; Chatterbox ramène torch à 2.6, il faut désinstaller le torchvision de l'image ; `moshi` 0.2.13 exige torch < 2.10, on l'installe sans dépendances.

## Métriques (kernel `eval`)

Chaque prise est d'abord traitée comme le ferait le lot (bords rognés, pauses internes ramenées à 420 ms), puis normalisée à −20 LUFS pour les prédicteurs.

- **CER P / N** : Whisper large-v3, langue imposée, avec l'amorce des 12 noms de couleur (P, comme `gen.py`) puis sans (N). « OK » = CER ≤ 0,12 et mots-clés entendus (homophones admis).
- **p(langue)** : probabilité que Whisper, laissé libre, attribue à la langue attendue. Un accent étranger marqué la fait chuter ; c'est le seul indicateur d'accent disponible sans écoute.
- **UTMOS22-strong** (SpeechMOS), **UTMOSv2**, **DNSMOS** (OVRL/SIG/BAK, P.808) : prédicteurs de qualité. UTMOS est entraîné sur de l'anglais ; DNSMOS mesure surtout la propreté du signal. On ne compare qu'au sein d'une langue.
- **Durée parlée**, part des prises ≤ 3 s, **débit** (syllabes et lettres par seconde de parole), **F0** médiane.
- **Voix** : WavLM-base-plus-SV. Cohérence = cosinus moyen entre toutes les prises d'une langue ; FR↔EN = cosinus entre les centroïdes des deux langues ; similarité avec la référence clonée.
- **best-of-3** : sélection du lot simulée (par réplique, la prise qui passe l'ASR avec le meilleur UTMOS).
