#!/usr/bin/env bash
# Lance gen.py dans le venv local, en réglant les détails NixOS :
#  - LD_LIBRARY_PATH <- NIX_LD_LIBRARY_PATH (les wheels torch/onnx ont besoin de libstdc++, libz…)
#  - ffmpeg/ffprobe : si absents du PATH, relance le script dans `nix-shell -p ffmpeg` (éphémère).
# Usage : tools/tts/tts.sh <lines.json> --out <dossier> [--force] [--only a,b] [--lang fr] [--dry-run]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${OMBRES_TTS_VENV:-$HERE/.venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "venv introuvable ($VENV) : lance d'abord $HERE/setup.sh" >&2
  exit 1
fi

if [ -n "${NIX_LD_LIBRARY_PATH:-}" ]; then
  export LD_LIBRARY_PATH="$NIX_LD_LIBRARY_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  if [ -z "${OMBRES_TTS_IN_NIXSHELL:-}" ] && command -v nix-shell >/dev/null 2>&1; then
    export OMBRES_TTS_IN_NIXSHELL=1
    exec nix-shell -p ffmpeg --run "$(printf '%q ' "$0" "$@")"
  fi
  echo "ffmpeg/ffprobe introuvables (utilise 'nix develop' ou 'nix-shell -p ffmpeg')" >&2
  exit 1
fi

# Threads CPU : 6 cœurs physiques sur la machine de dev ; ajustable.
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-6}"
exec "$VENV/bin/python" "$HERE/gen.py" "$@"
