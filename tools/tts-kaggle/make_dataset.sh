#!/usr/bin/env bash
# Prépare puis envoie le dataset privé ftgplwa/ombres-tts-bench-data (corpus, utilitaires, références de
# clonage, clips Pocket actuels en lecture seule). Usage : tools/tts-kaggle/make_dataset.sh <dossier-temporaire> [create]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; P="$ROOT/tools/tts-kaggle"; D="${1:?dossier}"
mkdir -p "$D/refs"
cp "$P/corpus.json" "$P/data/benchlib.py" "$P/data/genlib.py" "$P/data/refs_meta.json" "$D/"
curl -sL -o "$D/refs/bill.wav" https://huggingface.co/kyutai/tts-voices/resolve/main/voice-zero/bill_boerst.wav
cp "$P/data/voices/qwen3_design.wav" "$D/refs/"   # voix conçue retenue pour le FR (docs/research/tts-kaggle.md)
curl -sL -o "$D/refs/frm.wav" https://huggingface.co/kyutai/tts-voices/resolve/main/cml-tts/fr/4193_3103_000004-0001_enhanced.wav
(cd "$ROOT/public/audio/narrator" && python3 -c "import zipfile,os;z=zipfile.ZipFile('$D/pocket_lot.zip','w');[z.write(os.path.join(r,f)) for r,_,fs in os.walk('.') for f in fs]")
cp "$ROOT/tools/tts/narrator.lines.json" "$D/"   # pour une génération complète (OMBRES_LINES)
[ -f "$D/dataset-metadata.json" ] || cat > "$D/dataset-metadata.json" <<'J'
{"title": "ombres-tts-bench-data", "id": "ftgplwa/ombres-tts-bench-data", "licenses": [{"name": "CC0-1.0"}]}
J
export KAGGLE_API_TOKEN="$(cat ~/.kaggle/access_token)"
if [ "${2:-}" = create ]; then uvx --from kaggle kaggle datasets create -p "$D" --dir-mode zip; else uvx --from kaggle kaggle datasets version -p "$D" -m "maj banc" --dir-mode zip; fi
