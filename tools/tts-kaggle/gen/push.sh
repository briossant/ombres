#!/usr/bin/env bash
# Lot FR Qwen3-TTS sur Kaggle : prépare le dataset privé et pousse les kernels (tous préfixés ombres-tts-gen).
#   gen/push.sh dataset [create]        # ftgplwa/ombres-tts-gen-data (gen.py, moteur, lignes, presets, fond ASR, voix)
#   gen/push.sh synth [VAR=val ...]     # GPU 2 × T4 : prises brutes (OMBRES_BASES, OMBRES_TAKES, OMBRES_ONLY…)
#   gen/push.sh select N [VAR=val ...]  # N kernels CPU de tri (tranches i/N), lisent la sortie de ombres-tts-gen-synth
#   gen/push.sh smoke                   # essai à blanc sur CPU (3 répliques × 2 prises, synthèse + tri)
# Les VAR=val sont écrites en tête du script du kernel (Kaggle ne transmet pas de variables d'environnement).
# Dossier de travail : $OMBRES_BUILD (défaut : /tmp/ombres-tts-gen).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
B="${OMBRES_BUILD:-/tmp/ombres-tts-gen}"
export KAGGLE_API_TOKEN="$(cat ~/.kaggle/access_token)"
K="uvx --from kaggle kaggle"
USER=ftgplwa
SFX="${OMBRES_SUFFIX:-}"   # ex. « -fix » : kernels ombres-tts-gen-synth-fix / -select-fix-<i> pour une reprise

kernel() {  # kernel <slug> <script source> <gpu:true|false> <kernel_sources json> [VAR=val ...]
  local slug=$1 src=$2 gpu=$3 ks=$4; shift 4
  local d="$B/k/$slug"; mkdir -p "$d"
  { echo "import os"; for kv in "$@"; do echo "os.environ.setdefault(\"${kv%%=*}\", \"${kv#*=}\")"; done; cat "$src"; } > "$d/$(basename "$src")"
  local shape=""; [ "$gpu" = true ] && shape=', "machine_shape": "NvidiaTeslaT4"'
  cat > "$d/kernel-metadata.json" <<J
{"id": "$USER/$slug", "title": "$slug", "code_file": "$(basename "$src")", "language": "python",
 "kernel_type": "script", "is_private": true, "enable_gpu": $gpu, "enable_tpu": false, "enable_internet": true,
 "dataset_sources": ["$USER/ombres-tts-gen-data"], "kernel_sources": $ks, "competition_sources": [],
 "model_sources": []$shape}
J
  $K kernels push -p "$d"
}

case "${1:-}" in
  dataset)
    D="$B/data"; rm -rf "$D"; mkdir -p "$D"
    python3 "$HERE/prepare.py" "$D"
    cp "$ROOT/tools/tts/gen.py" "$HERE/qwen3_engine.py" "$ROOT/tools/tts/asr-bed.ogg" \
       "$ROOT/tools/tts-kaggle/data/voices/qwen3_design.wav" "$D/"
    echo '{"title": "ombres-tts-gen-data", "id": "'$USER'/ombres-tts-gen-data", "licenses": [{"name": "CC0-1.0"}]}' > "$D/dataset-metadata.json"
    if [ "${2:-}" = create ]; then $K datasets create -p "$D"; else $K datasets version -p "$D" -m "maj lot"; fi ;;
  synth)
    shift; kernel "ombres-tts-gen-synth$SFX" "$HERE/kernels/synth/synth.py" true '[]' "$@" ;;
  select)
    n=$2; shift 2
    for ((i = 0; i < n; i++)); do
      kernel "ombres-tts-gen-select$SFX-$i" "$HERE/kernels/select/select.py" false "[\"$USER/ombres-tts-gen-synth$SFX\"]" \
        "OMBRES_SHARD=$i/$n" "$@"
    done ;;
  extract)   # extract <ids> : prises brutes de quelques répliques, pour un re-tri local (local_rounds.py)
    kernel ombres-tts-gen-extract "$HERE/kernels/extract/extract.py" false \
      "[\"$USER/ombres-tts-gen-synth\", \"$USER/ombres-tts-gen-synth-fix\"]" "OMBRES_ONLY=$2" ;;
  smoke)
    kernel ombres-tts-gen-smoke-synth "$HERE/kernels/synth/synth.py" false '[]' OMBRES_LIMIT=3 OMBRES_TAKES=2 \
      OMBRES_BASES=1000 OMBRES_BATCH=6 ;;
  smoke-select)
    kernel ombres-tts-gen-smoke-select "$HERE/kernels/select/select.py" false "[\"$USER/ombres-tts-gen-smoke-synth\"]" \
      OMBRES_LIMIT=3 'OMBRES_ROUNDS=[[1000,\"narrator_qwen3\"],[1000,\"narrator_qwen3_t13\"]]' ;;
  *) sed -n 2,8p "$0"; exit 1 ;;
esac
