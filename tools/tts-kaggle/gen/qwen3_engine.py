"""Ombres — moteur Qwen3-TTS pour tools/tts/gen.py, en deux temps (génération sur GPU Kaggle, tri sur CPU).

1. `requests(...)` énumère exactement les synthèses que gen.py demandera pour un lot : pour chaque réplique,
   chaque graine `base + 101·k` (k < takes) et chaque morceau entre des `[pause]`. Le kernel GPU
   (`kernels/synth`) les génère par lots (batch) et range chaque prise brute sous `take_key(...)`.
2. `ReplayEngine` est enregistré dans `gen.ENGINES["qwen3"]` par le kernel de tri (`kernels/select`) :
   gen.py croit synthétiser, il relit les prises brutes. Tout le reste (rognage, pauses ≤ 420 ms, atempo,
   UTMOS, encodage MP3, Whisper P/N/C, refus au-delà de 3 s, manifest, cache) est celui du lot Pocket.

La clé d'une prise ne dépend que de ce qui décide l'audio brut : texte prononcé, graine, modèle, voix de
référence, réglages d'échantillonnage. Le `tempo` n'en fait pas partie : les presets qui ne diffèrent que
par l'accélération (narrator_qwen3, narrator_qwen3_t13…) réutilisent les mêmes prises brutes.
En batch, une seule graine torch est posée par lot : la « graine » d'une prise est une étiquette stable
(elle fixe son nom et sa place dans le choix de gen.py), pas une reproduction bit à bit.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

SYNTH_FIELDS = ("engine", "model", "reference", "ref_text", "language", "dtype", "max_new_tokens", "sampling")
PAUSE_RE = re.compile(r"\[pause(?:\s*[= ]\s*(\d+))?\]", re.I)  # identique à gen.PAUSE_RE


def synth_cfg(cfg: dict) -> dict:
    return {k: cfg.get(k) for k in SYNTH_FIELDS}


def take_key(text: str, cfg: dict, seed: int) -> str:
    blob = json.dumps({"text": text.strip(), "seed": int(seed), **synth_cfg(cfg)}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode()).hexdigest()[:20]


def parts_of(say: str) -> list[str]:
    """Morceaux prononcés, comme gen.synth_line (les morceaux vides sont sautés, la graine avance quand même)."""
    return [p.strip() for p in PAUSE_RE.split(say)[::2]]


def requests(lines: list[dict], presets: dict, bases: list[int] | None, takes: int,
             only: set[str] | None = None) -> list[dict]:
    """Synthèses à produire. `bases` : graines de départ des répliques (None : celle de la réplique ou du preset)."""
    out: dict[str, dict] = {}
    for ln in lines:
        if only and ln["id"] not in only:
            continue
        preset = presets.get(ln.get("voice", "narrator"), {})
        cfg = preset.get(ln["lang"])
        if not cfg or cfg.get("engine") != "qwen3":
            continue
        say = (ln.get("say") or ln["text"]).strip()
        seed0 = int(ln.get("seed", cfg.get("seed", 1000)))
        for base in (bases or [seed0]):
            for k in range(takes):
                s = base + 101 * k
                for i, part in enumerate(parts_of(say)):
                    if not part:
                        continue
                    key = take_key(part, cfg, s + i)
                    out.setdefault(key, {"key": key, "id": ln["id"], "lang": ln["lang"], "text": part,
                                         "seed": s + i, "base": base, "cfg": synth_cfg(cfg)})
    return list(out.values())


class ReplayEngine:
    """Relit les prises brutes générées sur GPU (dossier OMBRES_TAKES_DIR, fichiers <clé>.flac)."""

    def __init__(self) -> None:
        self.dir = os.environ["OMBRES_TAKES_DIR"]

    def synth(self, text: str, cfg: dict, seed: int):
        import numpy as np
        import soundfile as sf

        path = os.path.join(self.dir, take_key(text, cfg, seed) + ".flac")
        if not os.path.exists(path):
            raise FileNotFoundError(f"prise non générée : « {text} » graine {seed}")
        y, sr = sf.read(path, dtype="float32")
        return np.asarray(y, dtype=np.float32).reshape(-1), int(sr)
