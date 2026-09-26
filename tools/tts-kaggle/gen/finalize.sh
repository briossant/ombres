#!/usr/bin/env bash
# Rapatrie les prises retenues par les kernels de tri et construit le paquet prêt à intégrer
# (même arborescence que public/audio/narrator/ : fr/ Qwen3, en/ copie du lot Pocket actuel, manifest.json du jeu).
#   gen/finalize.sh <travail> <paquet> <N tranches>
# Rien n'est écrit dans public/ ni dans tools/tts/ : ré-encodage local (loudnorm −16 LUFS, MP3 24 kHz ABR 48k,
# présence +2 dB) depuis le cache, puis vérification Whisper small P + N + C des MP3 finaux.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
W="$1"; PKG="$2"; N="$3"
export KAGGLE_API_TOKEN="$(cat ~/.kaggle/access_token)"
mkdir -p "$W/sel" "$W/cache" "$PKG"
for ((i = 0; i < N; i++)); do
  [ -f "$W/sel/$i/select.zip" ] || timeout 600 uvx --from kaggle kaggle kernels output "ftgplwa/ombres-tts-gen-select-$i" \
    -p "$W/sel/$i" --file-pattern '.*\.(zip|json|log)$' > /dev/null
done
python3 "$HERE/prepare.py" "$W" > /dev/null   # voices.qwen3.json (identique au dataset)
PY="$ROOT/tools/tts/.venv/bin/python"
LD_LIBRARY_PATH="${NIX_LD_LIBRARY_PATH:-}" "$PY" - "$W" "$N" <<'PY'
import json, sys, zipfile, glob, os
w, n = sys.argv[1], int(sys.argv[2])
order = [l["id"] for l in json.load(open(f"{w}/lines.fr-qwen3.json"))]
final = {}
for i in range(n):
    for l in json.load(open(f"{w}/sel/{i}/final_lines.json")):
        final[l["id"]] = l
    with zipfile.ZipFile(f"{w}/sel/{i}/select.zip") as z:
        for name in z.namelist():
            if name.startswith("cache/"):
                z.extract(name, w)
missing = [i for i in order if i not in final]
assert not missing, f"répliques absentes des tranches : {missing}"
json.dump([final[i] for i in order], open(f"{w}/lines.final.json", "w"), ensure_ascii=False, indent=0)
import soundfile as sf  # FLAC 24 bits -> WAV float, format du cache de gen.py
for f in glob.glob(f"{w}/cache/*.flac"):
    y, sr = sf.read(f, dtype="float32")
    sf.write(f[:-5] + ".wav", y, sr, subtype="FLOAT")
    os.remove(f)
print(len(order), "répliques ;", len(glob.glob(f"{w}/cache/*.wav")), "prises en cache")
PY
ARGS=(--out "$PKG" --voices "$W/voices.qwen3.json" --cache "$W/cache" --manifest "$W/manifest.full.json"
      --takes 4 --asr --sample-rate 24000 --bitrate 48k --abr --presence-db 2 --presence-hz 3000 --max-pause-ms 420
      --tail-ms 100 --max-speech-s 3.0 --asr-bed "$ROOT/tools/tts/asr-bed.ogg" --asr-bed-snr 6 --asr-strict)
RUN="export LD_LIBRARY_PATH=\${NIX_LD_LIBRARY_PATH:-}; export OMP_NUM_THREADS=4; nice -n 10 $PY $HERE/run_gen.py $W/lines.final.json $(printf '%q ' "${ARGS[@]}")"
nix-shell -p ffmpeg --run "$RUN --lite-manifest $W/manifest.fr.json" 2>&1 | tee "$W/encode.log" | grep -v "^♻" | tail -5
nix-shell -p ffmpeg --run "$RUN --verify" 2>&1 | tee "$W/verify.log" | tail -8
# Manifest du jeu : entrées FR remplacées, entrées EN et fichiers en/ repris du lot actuel.
python3 - "$W" "$PKG" "$ROOT/public/audio/narrator" <<'PY'
import json, sys, shutil, os
w, pkg, pub = sys.argv[1:]
cur = json.load(open(f"{pub}/manifest.json"))
fr = {e["id"]: e for e in json.load(open(f"{w}/manifest.fr.json"))["lines"]}
lines = [fr[e["id"]] if e["lang"] == "fr" else e for e in cur["lines"]]
assert len(fr) == sum(e["lang"] == "fr" for e in cur["lines"]), "FR incomplet"
shutil.copytree(f"{pub}/en", f"{pkg}/en", dirs_exist_ok=True)
doc = {**cur, "total_duration_s": round(sum(e["duration_s"] for e in lines), 2), "lines": lines}
text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
open(f"{pkg}/manifest.json", "w").write(text.replace('},{"id"', '},\n{"id"') + "\n")
print("manifest :", len(lines), "entrées,", doc["total_duration_s"], "s")
PY
