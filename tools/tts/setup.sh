#!/usr/bin/env bash
# Crée tools/tts/.venv (Python 3.11, torch CPU — pas de CUDA) et installe les dépendances.
# Aucun paquet système n'est installé : tout reste dans le venv (+ caches ~/.cache/{uv,huggingface}).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${OMBRES_TTS_VENV:-$HERE/.venv}"
PY="${PYTHON:-python3.11}"
CPU_INDEX="https://download.pytorch.org/whl/cpu"

if command -v uv >/dev/null 2>&1; then
  uv venv -p "$PY" "$VENV"
  PIP=(uv pip install --python "$VENV/bin/python")
  EXTRA=(--extra-index-url "$CPU_INDEX" --index-strategy unsafe-best-match)
else
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -U pip
  PIP=("$VENV/bin/pip" install)
  EXTRA=(--extra-index-url "$CPU_INDEX")
fi

# 1) torch CPU d'abord (évite de tirer ~3 Go de CUDA)
"${PIP[@]}" "torch==2.14.0" "torchaudio==2.11.0" --index-url "$CPU_INDEX"
# 2) le reste
"${PIP[@]}" -r "$HERE/requirements.txt" "${EXTRA[@]}"

# Vérification rapide (NixOS : libstdc++ via nix-ld)
if [ -n "${NIX_LD_LIBRARY_PATH:-}" ]; then export LD_LIBRARY_PATH="$NIX_LD_LIBRARY_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi
"$VENV/bin/python" -c "import torch, pocket_tts, kokoro, soundfile; print('OK torch', torch.__version__)"
echo "Installé. Les modèles (~0.5-1.5 Go) se téléchargent au premier lancement dans ~/.cache/huggingface."
