#!/usr/bin/env python3
"""Re-tri LOCAL de quelques répliques du paquet, quand la vérification locale refuse une prise acceptée sur Kaggle.

Pourquoi : Whisper small bascule sur les prises limites au moindre changement d'encodage (director.md §5), et
ffmpeg 4.4 (Kaggle) ne produit pas exactement les mêmes MP3 que le ffmpeg de la machine de dev ; la durée
parlée mesurée sur le MP3 décodé (--verify) dépasse aussi de quelques centièmes celle de la prise avant encodage.
On rejoue donc, sur la machine de dev, le choix de gen.py parmi les prises brutes de ces seules répliques
(extraites par le kernel ombres-tts-gen-extract), avec une marge sur la durée (--max-speech-s 2.9 au tri), et
chaque tour se termine par --verify (P + N + C, 3,0 s sur le MP3 final) : une réplique n'est acquise que si le
MP3 écrit passe. Mêmes tours que sur Kaggle : graines 1000 → 2000 → tempo 1,3.

Usage : local_rounds.py <travail> <paquet> <ids séparés par des virgules>
(<travail>/subset : prises brutes ; met à jour <travail>/lines.final.json, les manifests et le paquet)
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
W, PKG, IDS = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3].split(",")
ROUNDS = [(1000, "narrator_qwen3"), (2000, "narrator_qwen3"), (1000, "narrator_qwen3_t13"),
          (2000, "narrator_qwen3_t13")]
COMMON = ["--out", str(PKG), "--voices", str(W / "voices.qwen3.json"), "--cache", str(W / "cache"),
          "--manifest", str(W / "manifest.full.json"), "--takes", "4", "--asr", "--sample-rate", "24000",
          "--bitrate", "48k", "--abr", "--presence-db", "2", "--presence-hz", "3000", "--max-pause-ms", "420",
          "--tail-ms", "100", "--asr-bed", str(ROOT / "tools/tts/asr-bed.ogg"), "--asr-bed-snr", "6", "--asr-strict"]
PY = str(ROOT / "tools/tts/.venv/bin/python")


def run(lines_file: Path, extra: list[str], log: Path) -> None:
    env = dict(os.environ, OMBRES_TAKES_DIR=str(W / "subset"), OMP_NUM_THREADS="4",
               LD_LIBRARY_PATH=os.environ.get("NIX_LD_LIBRARY_PATH", ""))
    with open(log, "a") as f:
        subprocess.run(["nice", "-n", "10", PY, str(HERE / "run_gen.py"), str(lines_file), *COMMON, *extra],
                       env=env, stdout=f, stderr=subprocess.STDOUT, check=False)


lines = json.loads((W / "lines.final.json").read_text(encoding="utf-8"))
todo = [i for i in IDS if i]
for r, (base, voice) in enumerate(ROUNDS):
    if not todo:
        break
    for ln in lines:
        if ln["id"] in todo:
            ln.update(seed=base, voice=voice)
    lf = W / "lines.final.json"
    lf.write_text(json.dumps(lines, ensure_ascii=False, indent=0), encoding="utf-8")
    run(lf, ["--force", "--only", ",".join(todo), "--max-speech-s", "2.9", "--lite-manifest",
             str(W / "manifest.fr.json")], W / "local_rounds.log")
    # le tri mesure la durée parlée avant encodage ; la règle du lot se juge sur le MP3 final (--verify, 3,0 s)
    run(lf, ["--verify", "--only", ",".join(todo), "--max-speech-s", "3.0"], W / "local_rounds.log")
    ent = {e["id"]: e for e in json.loads((W / "manifest.full.json").read_text(encoding="utf-8"))["lines"]}
    ok = [i for i in todo if ent[i].get("asr_ok")]
    todo = [i for i in todo if i not in ok]
    print(f"[tour local {r}] graines {base}, {voice} : valides {ok} ; restent {todo}", flush=True)
print(f"[fin] {len(IDS) - len(todo)}/{len(IDS)} valides à la vérification ; refus : {todo}", flush=True)
