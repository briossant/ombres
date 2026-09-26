#!/usr/bin/env bash
# Évaluation en tranches sur kernels CPU (quand la file T4 est saturée) : un kernel par tranche, chacun avec un
# en-tête qui fixe OMBRES_SHARD / OMBRES_SYSTEMS, et les kernels de génération voulus en entrée.
# Usage : make_shards.sh <dossier-de-sortie> <nom> <préfixes-systèmes> <kernels-sources> <n-tranches>
#   ex. make_shards.sh /tmp/shards a pocket,qwen3 ombres-tts-pocket,ombres-tts-qwen3 2
# Fusion locale ensuite : OMBRES_INPUT=<sorties téléchargées> OMBRES_WORK=<dossier> python evaluate.py --merge
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=$1; NAME=$2; SYSTEMS=$3; SOURCES=$4; N=$5
for i in $(seq 0 $((N-1))); do
  d="$OUT/eval-$NAME$i"; mkdir -p "$d"
  { echo "import os; os.environ.setdefault('OMBRES_SHARD', '$i/$N'); os.environ.setdefault('OMBRES_SYSTEMS', '$SYSTEMS')"
    cat "$HERE/evaluate.py"; } > "$d/evaluate.py"
  python3 - "$d" "$NAME$i" "$SOURCES" <<'PY'
import json, sys
d, name, sources = sys.argv[1:]
json.dump({"id": f"ftgplwa/ombres-tts-eval-{name}", "title": f"ombres-tts-eval-{name}", "code_file": "evaluate.py",
           "language": "python", "kernel_type": "script", "is_private": True, "enable_gpu": False,
           "enable_tpu": False, "enable_internet": True, "dataset_sources": ["ftgplwa/ombres-tts-bench-data"],
           "kernel_sources": [f"ftgplwa/{s}" for s in sources.split(",")], "competition_sources": [],
           "model_sources": []}, open(f"{d}/kernel-metadata.json", "w"), indent=1)
PY
done
