#!/usr/bin/env python3
"""tools/tts/gen.py avec le moteur `qwen3` de rejeu (qwen3_engine.ReplayEngine) : en local, sert à ré-encoder
les prises retenues sur Kaggle depuis le cache (--cache) et à les vérifier (--verify), sans GPU.
Une prise absente du cache n'est pas synthétisée : gen.py signale « erreur moteur » pour cette réplique.
Même interface que gen.py ; OMBRES_TAKES_DIR : dossier des prises brutes (défaut : aucun)."""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "tts"))
sys.path.insert(0, str(HERE))
os.environ.setdefault("OMBRES_TAKES_DIR", "/nonexistent")
import gen  # noqa: E402
import qwen3_engine  # noqa: E402

gen.ENGINES["qwen3"] = qwen3_engine.ReplayEngine
sys.exit(gen.main())
