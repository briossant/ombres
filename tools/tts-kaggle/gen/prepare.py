#!/usr/bin/env python3
"""Ombres — prépare le lot FR Qwen3-TTS à partir de tools/tts/narrator.lines.json (lu, jamais modifié).

Écrit dans <dossier> :
  lines.fr-qwen3.json : les 361 répliques FR, preset `narrator_qwen3`, graphies « say » adaptées au modèle ;
  voices.qwen3.json   : presets Qwen3 (même voix et mêmes prises brutes, seul l'atempo diffère).

Graphies : les « say » du lot Pocket corrigeaient des défauts de Pocket (« Carmain » pour « Carmin »,
« Rôse », « Corail, chasse encore »). Qwen3 dit ces mots correctement (banc : 3/3), on repart donc du
texte affiché, apostrophes droites. `overrides.json` (même dossier que ce script) garde les retouches
propres à Qwen3, réplique par réplique : {"<id>": {"say": ..., "seed": ..., "voice": ...}}.
Usage : prepare.py <dossier>
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REF = ROOT / "tools/tts-kaggle/data/refs_meta.json"

# Voix : clone de la voix conçue par Qwen3 VoiceDesign (graine 22, F0 83 Hz, aucune personne réelle),
# docs/research/tts-kaggle.md §8. Échantillonnage : valeurs par défaut du checkpoint (generation_config.json).
BASE = {"engine": "qwen3", "model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "reference": "qwen3_design.wav",
        "ref_text": json.loads(REF.read_text(encoding="utf-8"))["qdesign"]["text"], "language": "French",
        "dtype": "float32", "max_new_tokens": 90, "sampling": "checkpoint", "seed": 1000}
TEMPOS = {"narrator_qwen3": 1.2, "narrator_qwen3_t125": 1.25, "narrator_qwen3_t13": 1.3}


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    src = json.loads((ROOT / "tools/tts/narrator.lines.json").read_text(encoding="utf-8"))
    ovr_path = HERE / "overrides.json"
    ovr = json.loads(ovr_path.read_text(encoding="utf-8")) if ovr_path.exists() else {}
    lines = []
    for ln in src:
        if ln["lang"] != "fr":
            continue
        e = {k: v for k, v in ln.items() if k not in ("say", "seed", "voice")}  # graine et graphie : propres à Pocket
        say = ln["text"].replace("’", "'")
        e.update({"say": say, "voice": "narrator_qwen3"})
        e.update({k: v for k, v in ovr.get(ln["id"], {}).items() if not k.startswith("_")})
        if e["say"] == e["text"]:
            del e["say"]
        lines.append(e)
    (out / "lines.fr-qwen3.json").write_text(
        "[" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in lines) + "]\n", encoding="utf-8")
    presets = {name: {"fr": {**BASE, "tempo": t}} for name, t in TEMPOS.items()}
    (out / "voices.qwen3.json").write_text(json.dumps({
        "_doc": "Presets Qwen3-TTS du lot FR (tools/tts-kaggle/gen). Seul l'atempo diffère : mêmes prises brutes.",
        "presets": presets}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(lines)} répliques FR, {sum('say' in e for e in lines)} avec graphie prononcée, "
          f"{len(ovr)} retouches → {out}")


if __name__ == "__main__":
    main()
