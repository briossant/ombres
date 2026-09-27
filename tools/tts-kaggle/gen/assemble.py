#!/usr/bin/env python3
"""Manifest du jeu pour le paquet : entrées FR du lot Qwen3 (<travail>/manifest.fr.json), entrées EN et fichiers en/
repris tels quels du lot actuel (public/audio/narrator/, lu seulement). Usage : assemble.py <travail> <paquet>"""
import json
import shutil
import sys
from pathlib import Path

w, pkg = Path(sys.argv[1]), Path(sys.argv[2])
pub = Path(__file__).resolve().parents[3] / "public/audio/narrator"
cur = json.loads((pub / "manifest.json").read_text(encoding="utf-8"))
fr = {e["id"]: e for e in json.loads((w / "manifest.fr.json").read_text(encoding="utf-8"))["lines"]}
assert len(fr) == sum(e["lang"] == "fr" for e in cur["lines"]), "FR incomplet"
lines = [fr[e["id"]] if e["lang"] == "fr" else e for e in cur["lines"]]
shutil.copytree(pub / "en", pkg / "en", dirs_exist_ok=True)
doc = {**cur, "total_duration_s": round(sum(e["duration_s"] for e in lines), 2), "lines": lines}
text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
(pkg / "manifest.json").write_text(text.replace('},{"id"', '},\n{"id"') + "\n", encoding="utf-8")
print("manifest :", len(lines), "entrées,", doc["total_duration_s"], "s")
