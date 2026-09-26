#!/usr/bin/env python3
"""Contrôle d'un paquet de voix (arborescence de public/audio/narrator/) : chaque entrée du manifest a son
fichier, chaque MP3 se décode entièrement, durée ffprobe = duration_s du manifest, sonie intégrée et crête
(ffmpeg ebur128) des fichiers d'une langue. Usage : check_package.py <paquet> [langue mesurée, défaut fr]"""
import json
import re
import subprocess
import sys
from pathlib import Path

pkg = Path(sys.argv[1])
lang = sys.argv[2] if len(sys.argv) > 2 else "fr"
man = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))
errors, dd, lufs, tps, sizes = [], [], [], [], {}
listed = set()
for e in man["lines"]:
    f = pkg / e["file"]
    listed.add(e["file"])
    if not f.exists():
        errors.append(f"absent : {e['file']}")
        continue
    sizes[e["lang"]] = sizes.get(e["lang"], 0) + f.stat().st_size
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(f)],
                       capture_output=True, text=True)
    dur = float(json.loads(p.stdout)["format"]["duration"])
    dd.append(abs(dur - e["duration_s"]))
    if abs(dur - e["duration_s"]) > 0.0015:
        errors.append(f"durée {e['file']} : fichier {dur:.3f} s, manifest {e['duration_s']}")
    af = "ebur128=peak=true" if e["lang"] == lang else "anull"
    p = subprocess.run(["ffmpeg", "-v", "error", "-nostats", "-i", str(f), "-af", af, "-f", "null", "-"],
                       capture_output=True, text=True)
    if p.returncode != 0 or re.search(r"error|invalid|corrupt", p.stderr, re.I):
        errors.append(f"décodage {e['file']} : {p.stderr.strip()[:200]}")
    if e["lang"] == lang:
        p = subprocess.run(["ffmpeg", "-nostats", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"],
                           capture_output=True, text=True)
        summ = p.stderr[p.stderr.rfind("Summary:"):]
        lufs.append(float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1)))
        tps.append(float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1)))
orphans = sorted(str(p.relative_to(pkg)) for p in pkg.glob("*/*.mp3") if str(p.relative_to(pkg)) not in listed)
counts = ", ".join(f"{k} {sum(1 for e in man['lines'] if e['lang'] == k)}" for k in sorted(sizes))
print(f"{len(man['lines'])} entrées ({counts}), "
      f"{len(orphans)} fichier(s) hors manifest, écart de durée max {max(dd) * 1000:.1f} ms")
print("poids : " + ", ".join(f"{k} {v / 1e6:.2f} Mo" for k, v in sorted(sizes.items())))
if lufs:
    print(f"{lang} : sonie {min(lufs):.1f} à {max(lufs):.1f} LUFS (moyenne {sum(lufs) / len(lufs):.2f}), "
          f"crête vraie max {max(tps):.1f} dBTP")
print("erreurs :", len(errors))
for x in errors[:20]:
    print("  ", x)
sys.exit(1 if errors or orphans else 0)
