"""Ombres — boucle de génération commune aux kernels Kaggle du banc TTS.

Chaque kernel fournit `synth(text, lang, voice, seed) -> (audio float32 mono, sr)` et une liste de
« systèmes » (nom, voix par langue). genlib écrit :
  /kaggle/working/wav/<système>/<id>.t<k>.wav   (PCM 16 bits, fréquence native du modèle)
  /kaggle/working/gen_<système>.json            (graine, temps de calcul, durée audio par prise)
Les références de clonage (voix CC0 / CC-BY de kyutai/tts-voices) sont téléchargées par `ref_path`.
"""
from __future__ import annotations

import glob
import json
import os
import time

import numpy as np
import soundfile as sf

WORK = "/kaggle/working"


def find(name: str) -> str:
    c = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    assert c, f"{name} introuvable dans /kaggle/input"
    return c[0]


def load_lines(path: str | None = None, langs=("fr", "en"), only: str | None = None) -> list[dict]:
    """Corpus du banc (défaut) ou lot complet (tools/tts/narrator.lines.json : ids sans préfixe de langue)."""
    lines = json.load(open(path or find("corpus.json")))
    out = []
    for ln in lines:
        if ln["lang"] not in langs:
            continue
        ln = dict(ln)
        if not ln["id"].startswith(ln["lang"] + "."):
            ln["id"] = f"{ln['lang']}.{ln['id']}"
        if only and ln["id"] not in only.split(","):
            continue
        out.append(ln)
    return out


def ref_path(rel: str) -> str:
    """Fichier de kyutai/tts-voices (ex. 'voice-zero/bill_boerst.wav'), mis en cache local."""
    from huggingface_hub import hf_hub_download

    return hf_hub_download("kyutai/tts-voices", rel)


def seeds(takes: int) -> list[int]:
    return [1000 + 101 * k for k in range(takes)]


def run(system: str, voices: dict, synth, lines: list[dict], takes: int = 3, text_key: str = "text",
        max_s: float | None = None) -> dict:
    """voices : {"fr": spec, "en": spec} ; spec est passé tel quel à synth."""
    import torch

    d = os.path.join(WORK, "wav", system)
    os.makedirs(d, exist_ok=True)
    meta = {"system": system, "voices": {k: str(v) for k, v in voices.items()}, "clips": []}
    t_start = time.time()
    for ln in lines:
        v = voices.get(ln["lang"])
        if v is None:
            continue
        text = ln.get(text_key) or ln["text"]
        for k, seed in enumerate(seeds(takes)):
            fn = os.path.join(d, f"{ln['id']}.t{k}.wav")
            if os.path.exists(fn):
                continue
            torch.manual_seed(seed)
            np.random.seed(seed % (2**32))
            import random
            random.seed(seed)
            if torch.cuda.is_available():
                torch.cuda.synchronize()
            t0 = time.time()
            try:
                y, sr = synth(text, ln["lang"], v, seed)
                err = None
            except Exception as e:  # noqa: BLE001
                y, sr, err = np.zeros(1600, np.float32), 16000, repr(e)[:300]
            if torch.cuda.is_available():
                torch.cuda.synchronize()
            dt = time.time() - t0
            y = np.asarray(y, dtype=np.float32).reshape(-1)
            peak = float(np.abs(y).max()) if len(y) else 0.0
            clipped = int((np.abs(y) >= 0.999).sum())
            if peak > 0.99:
                y = y / peak * 0.97
            sf.write(fn, y, sr, subtype="PCM_16")
            c = {"id": ln["id"], "lang": ln["lang"], "take": k, "seed": seed, "text": text, "sr": sr,
                 "gen_s": round(dt, 3), "audio_s": round(len(y) / sr, 3), "peak": round(peak, 3), "clipped": clipped}
            if err:
                c["error"] = err
                print("  ERREUR", system, ln["id"], k, err, flush=True)
            meta["clips"].append(c)
            print(f"  {system} {ln['id']} t{k} {c['audio_s']:.2f}s en {dt:.2f}s", flush=True)
            if max_s and time.time() - t_start > max_s:
                print("  budget de temps atteint, arrêt", flush=True)
                break
    ok = [c for c in meta["clips"] if "error" not in c]
    meta["rtf"] = round(sum(c["gen_s"] for c in ok) / max(1e-6, sum(c["audio_s"] for c in ok)), 3) if ok else None
    json.dump(meta, open(os.path.join(WORK, f"gen_{system}.json"), "w"), ensure_ascii=False, indent=0)
    print(f"[{system}] {len(ok)} prises, RTF {meta['rtf']}", flush=True)
    return meta


def refs() -> dict:
    """Références de clonage du dataset : {nom: {"wav": chemin, "text": transcription, "lang", "license", "source"}}."""
    meta = json.load(open(find("refs_meta.json")))
    base = os.path.dirname(find("refs_meta.json"))
    for k, v in meta.items():
        v["wav"] = os.path.join(base, "refs", v["file"])
    return meta


def gpus() -> list[str]:
    """GPU à utiliser : OMBRES_GPUS (ex. « 0,1 »), sinon tous ceux que liste nvidia-smi."""
    import subprocess

    if os.environ.get("OMBRES_GPUS"):
        return os.environ["OMBRES_GPUS"].split(",")
    out = subprocess.run("nvidia-smi -L", shell=True, capture_output=True, text=True).stdout
    return [str(i) for i in range(max(1, out.count("GPU ")))]


def nparts() -> int:
    """Nombre de parties (une par GPU) : les scripts répartissent leurs systèmes par `[part::nparts()]`."""
    return int(os.environ.get("OMBRES_NPARTS") or len(gpus()))


def split_gpus(parts: int | None = None) -> int | None:
    """Répartit le kernel sur les GPU (2 T4 sur Kaggle) : le processus parent relance le script une fois par
    GPU (CUDA_VISIBLE_DEVICES=g, OMBRES_PART=i, OMBRES_NPARTS=n) et attend. Retourne l'indice de la partie
    dans un enfant, None dans le parent (qui a déjà tout attendu)."""
    import subprocess
    import sys

    if "OMBRES_PART" in os.environ:
        return int(os.environ["OMBRES_PART"])
    gl = gpus()
    procs = []
    for i, g in enumerate(gl):
        env = dict(os.environ, CUDA_VISIBLE_DEVICES=g, OMBRES_PART=str(i), OMBRES_NPARTS=str(len(gl)))
        log = open(os.path.join(WORK, f"part{i}.log"), "w")
        procs.append((subprocess.Popen([sys.executable, os.path.abspath(sys.argv[0])], env=env,
                                       stdout=log, stderr=subprocess.STDOUT), log, i))
    for p, log, i in procs:
        p.wait()
        log.close()
        print(f"--- partie {i} : code {p.returncode} ---", flush=True)
        print(open(os.path.join(WORK, f"part{i}.log")).read()[-6000:], flush=True)
    return None
