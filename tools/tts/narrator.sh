#!/usr/bin/env bash
# Génère (ou met à jour) toutes les voix du narrateur d'Ombres dans public/audio/narrator/.
#   tools/tts/narrator.sh                  # tout ce qui manque ou a changé (idempotent)
#   tools/tts/narrator.sh --parallel       # idem, FR et EN dans deux processus, puis fusion des manifests
#   tools/tts/narrator.sh --verify         # re-transcrit les MP3 finaux, met à jour asr_* et speech_s
#   tools/tts/narrator.sh --verify --asr-strict C   # idem + chaque clip posé dans le fond réel du jeu (audit)
#   tools/tts/narrator.sh --parallel --verify ...   # FR et EN en deux processus (la vérification la plus récente gagne)
#   tools/tts/narrator.sh --only firstHit.5,tie --force --takes 8   # refaire quelques clips
# Réglages du lot (docs/agent-notes/director.md §5) :
#   Pocket TTS, voix bill_boerst, tempo 0,92 (preset "narrator") ; 4 prises départagées par UTMOS,
#   vérifiées par Whisper avec le nom de couleur en mot-clé ; pauses internes ramenées à 420 ms,
#   prise refusée au-delà de 3 s parlées ; MP3 mono 24 kHz ABR 48 kb/s, présence +2 dB au-dessus
#   de 3 kHz, -16 LUFS.
# Toute prise NOUVELLE passe la vérification stricte (--asr-strict) : Whisper avec la liste des couleurs
# (P), sans elle (N), et posée dans le fond réel du jeu à +6 LU (C, tools/tts/asr-bed.ogg). Les prises
# en cache (ré-encodage seul) ne sont pas re-jugées : --verify relit les MP3 finaux.
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
COMMON=(tools/tts/narrator.lines.json --out "$OUT" --takes 4 --asr --sample-rate 24000 --bitrate 48k --abr
        --presence-db 2 --presence-hz 3000 --max-pause-ms 420 --tail-ms 100 --max-speech-s 3.0
        --asr-bed tools/tts/asr-bed.ogg --asr-bed-snr 6)
# Génération : vérification stricte des prises nouvelles (P + N + C). --verify : P seul, sauf --asr-strict.
case " $* " in
  *" --verify "*|*" --merge "*) ;;
  *) case " $* " in *" --asr-strict"*) ;; *) COMMON+=(--asr-strict) ;; esac ;;
esac

if [ "${1:-}" = "--parallel" ]; then
  shift
  # --verify relit les entrées du manifest : chaque processus part d'une copie du manifest complet.
  case " $* " in *" --verify "*) cp "$FULL" tools/tts/out/manifest.fr.json; cp "$FULL" tools/tts/out/manifest.en.json ;; esac
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
