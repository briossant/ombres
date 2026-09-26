#!/usr/bin/env bash
# Génère (ou met à jour) toutes les voix du narrateur d'Ombres dans public/audio/narrator/.
#   tools/tts/narrator.sh                  # tout ce qui manque ou a changé (idempotent)
#   tools/tts/narrator.sh --parallel       # idem, FR et EN dans deux processus, puis fusion des manifests
#   tools/tts/narrator.sh --verify         # re-transcrit les MP3 finaux, met à jour asr_* et speech_s
#   tools/tts/narrator.sh --only firstHit.5,tie --force --takes 8   # refaire quelques clips
# Réglages du lot (docs/agent-notes/director.md §5) :
#   Pocket TTS, voix bill_boerst, tempo 0,92 (preset "narrator") ; 4 prises départagées par UTMOS,
#   vérifiées par Whisper avec le nom de couleur en mot-clé ; pauses internes ramenées à 420 ms
#   (répliques < 3 s) ; MP3 mono 24 kHz ABR 32 kb/s, -16 LUFS.
# Manifests : complet (notes de prise, ASR) dans tools/tts/narrator.manifest.json ; réduit (id, lang,
# file, duration_s) dans public/audio/narrator/manifest.json, seul servi au jeu.
# Les prises retenues sont en cache (tools/tts/out/cache) : changer l'encodage ne re-synthétise rien.
# La machine est partagée : tout tourne avec `nice -n 10`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
npx tsx tools/tts/narrator-lines.ts
mkdir -p tools/tts/out
OUT=public/audio/narrator
FULL=tools/tts/narrator.manifest.json
LITE=$OUT/manifest.json
COMMON=(tools/tts/narrator.lines.json --out "$OUT" --takes 4 --asr --sample-rate 24000 --bitrate 32k --abr
        --max-pause-ms 420 --tail-ms 100)

if [ "${1:-}" = "--parallel" ]; then
  shift
  # Deux processus de 3 fils chacun ; chacun son manifest (entrées reconstruites depuis le cache), fusionnés à la fin.
  OMP_NUM_THREADS=3 nice -n 10 "$HERE/tts.sh" "${COMMON[@]}" --lang fr --manifest tools/tts/out/manifest.fr.json "$@" > tools/tts/out/narrator-fr.log 2>&1 &
  P1=$!
  OMP_NUM_THREADS=3 nice -n 10 "$HERE/tts.sh" "${COMMON[@]}" --lang en --manifest tools/tts/out/manifest.en.json "$@" > tools/tts/out/narrator-en.log 2>&1 &
  P2=$!
  S=0
  wait $P1 || S=$?
  wait $P2 || S=$?
  "$HERE/tts.sh" "${COMMON[@]}" --manifest "$FULL" --lite-manifest "$LITE" --merge tools/tts/out/manifest.fr.json tools/tts/out/manifest.en.json
  rm -f tools/tts/out/manifest.fr.json tools/tts/out/manifest.en.json
  exit $S
fi
exec nice -n 10 "$HERE/tts.sh" "${COMMON[@]}" --manifest "$FULL" --lite-manifest "$LITE" "$@"
