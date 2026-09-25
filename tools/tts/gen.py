#!/usr/bin/env python3
"""Ombres — générateur des voix du narrateur (TTS local et gratuit ; hors-ligne après le 1er téléchargement).

Entrée : JSON [{"id": "lead_coral", "lang": "fr", "text": "Le Corail prend la tête !"}, ...]
  champs optionnels : "voice" (preset de voices.json, défaut "narrator"), "seed" (int),
                      "keywords" (mots devant être entendus par l'ASR, ex. ["Ocre"] : le nom de couleur ;
                      variantes homophones séparées par "|", ex. ["Lilas|lila"]),
                      "say" (graphie prononcée si elle diffère du sous-titre, ex. text "Le Carmin…",
                      say "Le Carmain…" : le TTS lit "say", le jeu affiche "text").
  Dans "text", "[pause]" ou "[pause 700]" insère un silence exact (ms, défaut 500) : chaque morceau
  est synthétisé séparément puis recollé (les TTS ignorent souvent "..." pour les pauses dramatiques).
Sortie : <out>/<lang>/<id>.mp3 (mono 44.1 kHz, EBU R128 -16 LUFS, true-peak <= -1.5 dBTP)
         <out>/manifest.json (durées, loudness mesurée, prise retenue, scores).

Qualité (on ne peut pas tout écouter) : --takes N génère N prises par réplique et garde la meilleure
selon UTMOS (prédicteur de MOS) + garde-fous de débit/pauses ; --asr vérifie la prise retenue par
transcription (faster-whisper) et passe à la suivante si l'intelligibilité est mauvaise.

Idempotent : un MP3 est ignoré si son tag ID3 "comment" contient le hash attendu
(texte + langue + preset de voix + graine + post-traitement). Changer le texte ou la voix
=> régénération de la ligne seule. --force régénère tout. --takes/--asr ne font pas partie du hash.
Lancer via ./tts.sh (LD_LIBRARY_PATH NixOS + ffmpeg via nix-shell si absent).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf

TOOL_VERSION = "ombres-tts/1"
HERE = Path(__file__).resolve().parent
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]*$")
PAUSE_RE = re.compile(r"\[pause(?:\s*[= ]\s*(\d+))?\]", re.I)
LANGS = {"fr", "en"}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ============================================================================ moteurs TTS
class PocketEngine:
    """Kyutai Pocket TTS (code MIT, poids CC-BY-4.0, voix prédéfinies CC0/CC-BY). CPU ~temps réel."""

    def __init__(self) -> None:
        self.models: dict = {}
        self.states: dict = {}

    def synth(self, text: str, cfg: dict, seed: int) -> tuple[np.ndarray, int]:
        import torch
        from pocket_tts import TTSModel

        mkey = (cfg["model"], float(cfg.get("temperature", 0.3)))
        if mkey not in self.models:
            t0 = time.time()
            self.models[mkey] = TTSModel.load_model(language=mkey[0], temp=mkey[1])
            log(f"  [pocket] modèle {mkey[0]} chargé en {time.time() - t0:.1f}s")
        model = self.models[mkey]
        voice = cfg["voice"]
        skey = (mkey, voice)
        if skey not in self.states:
            v = voice
            if v.endswith((".wav", ".mp3", ".flac", ".safetensors")) and not v.startswith(("hf://", "http")):
                v = v if os.path.isabs(v) else str((HERE / v).resolve())
            self.states[skey] = model.get_state_for_audio_prompt(v)
        torch.manual_seed(seed)
        audio = model.generate_audio(self.states[skey], text)
        return audio.detach().cpu().numpy().reshape(-1).astype(np.float32), int(model.sample_rate)


class KokoroEngine:
    """Kokoro-82M (Apache-2.0). FR : une seule voix (ff_siwis, féminine). EN : nombreuses voix."""

    def __init__(self) -> None:
        self.pipes: dict = {}
        self._espeak_ready = False

    def _fix_espeak(self) -> None:
        # espeak-ng tronque les chemins de données > ~160 caractères ("Error processing file .../phontab") :
        # on copie les données dans un chemin court si besoin.
        if self._espeak_ready:
            return
        import espeakng_loader
        import misaki.espeak  # noqa: F401
        from phonemizer.backend.espeak.wrapper import EspeakWrapper

        data = Path(espeakng_loader.get_data_path())
        if len(str(data)) > 120:
            short = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "ombres-tts" / "espeak-ng-data"
            if not (short / "phontab").exists():
                short.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(data, short, dirs_exist_ok=True)
            data = short
        EspeakWrapper.set_data_path(str(data))
        self._espeak_ready = True

    def synth(self, text: str, cfg: dict, seed: int) -> tuple[np.ndarray, int]:
        import torch

        self._fix_espeak()
        from kokoro import KPipeline

        lc = cfg["lang_code"]  # 'f' français, 'a' anglais US, 'b' anglais UK
        if lc not in self.pipes:
            self.pipes[lc] = KPipeline(lang_code=lc, repo_id="hexgrad/Kokoro-82M")
        torch.manual_seed(seed)
        chunks = [a.numpy() if hasattr(a, "numpy") else np.asarray(a)
                  for _, _, a in self.pipes[lc](text, voice=cfg["voice"], speed=float(cfg.get("speed", 1.0)))]
        return np.concatenate(chunks).astype(np.float32), 24000


class ChatterboxEngine:
    """Chatterbox Multilingual (MIT) — clonage d'une voix de référence libre. Optionnel ; lent sur CPU
    (~8-20x temps réel). Venv séparé : voir README (requirements-chatterbox.txt)."""

    def __init__(self) -> None:
        self.model = None

    def synth(self, text: str, cfg: dict, seed: int) -> tuple[np.ndarray, int]:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        if self.model is None:
            self.model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model=cfg.get("t3_model", "v3"))
        ref = cfg["reference"]
        ref = ref if os.path.isabs(ref) else str((HERE / ref).resolve())
        torch.manual_seed(seed)
        wav = self.model.generate(text, language_id=cfg["language_id"], audio_prompt_path=ref,
                                  exaggeration=float(cfg.get("exaggeration", 0.5)),
                                  cfg_weight=float(cfg.get("cfg_weight", 0.5)),
                                  temperature=float(cfg.get("temperature", 0.8)))
        return wav.detach().cpu().numpy().reshape(-1).astype(np.float32), int(self.model.sr)


class SupertonicEngine:
    """Supertonic 3 (Supertone ; code MIT, modèle OpenRAIL-M). ONNX, rapide, 10 voix M1-M5/F1-F5,
    31 langues, paramètre de vitesse. Alternative sérieuse à Pocket (cf. docs/research/tts.md)."""

    def __init__(self) -> None:
        self.tts = None
        self.styles: dict = {}

    def synth(self, text: str, cfg: dict, seed: int) -> tuple[np.ndarray, int]:
        from supertonic import TTS

        if self.tts is None:
            self.tts = TTS(model=cfg.get("model", "supertonic-3"),
                           intra_op_num_threads=int(os.environ.get("OMP_NUM_THREADS", "6")))
        v = cfg["voice"]
        if v not in self.styles:
            self.styles[v] = self.tts.get_voice_style(v)
        np.random.seed(seed % (2 ** 32))  # le bruit initial du flow-matching vient de numpy
        wav, _ = self.tts.synthesize(text, voice_style=self.styles[v], lang=cfg["lang"],
                                     total_steps=int(cfg.get("steps", 16)), speed=float(cfg.get("speed", 1.0)))
        return np.asarray(wav, dtype=np.float32).reshape(-1), int(getattr(self.tts, "sample_rate", 44100))


ENGINES = {"pocket": PocketEngine, "kokoro": KokoroEngine, "chatterbox": ChatterboxEngine,
           "supertonic": SupertonicEngine}


# ============================================================================ évaluateurs (optionnels)
class UtmosScorer:
    """UTMOS22-strong (prédicteur de MOS naturel, via torch.hub tarepan/SpeechMOS). Entraîné sur de
    l'anglais : fiable pour classer des prises d'une même voix, pas comme note absolue en français."""

    def __init__(self) -> None:
        import torch

        self.torch = torch
        self.model = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True).eval()

    def __call__(self, y: np.ndarray, sr: int) -> float:
        import librosa

        y16 = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
        with self.torch.no_grad():
            return float(self.model(self.torch.from_numpy(y16).unsqueeze(0), 16000).item())


class AsrChecker:
    """Transcription aller-retour (faster-whisper) -> CER entre texte attendu et entendu."""

    def __init__(self, model: str) -> None:
        from faster_whisper import WhisperModel

        self.model = WhisperModel(model, device="cpu", compute_type="int8",
                                  cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "6")))

    # Whisper écrit souvent les nombres en chiffres ("10 secondes") : on les remet en lettres.
    NUMS = {
        "fr": "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize "
              "dix-sept dix-huit dix-neuf vingt".split(),
        "en": "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
              "sixteen seventeen eighteen nineteen twenty".split(),
    }

    @classmethod
    def _norm(cls, s: str, lang: str) -> str:
        words = cls.NUMS.get(lang, [])
        s = re.sub(r"\b(\d{1,2})\b", lambda m: words[int(m.group(1))] if int(m.group(1)) < len(words) else m.group(1), s)
        s = unicodedata.normalize("NFD", s.lower().replace("’", "'"))
        s = "".join(c for c in s if unicodedata.category(c) != "Mn")
        return re.sub(r"[^a-z0-9]+", "", s)  # sans espaces ni ponctuation : « l'ocre » == « locre »

    def __call__(self, y: np.ndarray, sr: int, text: str, lang: str) -> tuple[float, str]:
        import librosa

        y16 = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
        segs, _ = self.model.transcribe(y16, language=lang, beam_size=5, temperature=0.0,
                                        without_timestamps=True, condition_on_previous_text=False)
        hyp = " ".join(s.text.strip() for s in segs).strip()
        return _cer(self._norm(PAUSE_RE.sub(" ", text), lang), self._norm(hyp, lang)), hyp


def _cer(ref: str, hyp: str) -> float:
    if not ref:
        return 0.0
    prev = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, hc in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc))
        prev = cur
    return prev[-1] / len(ref)


# ============================================================================ audio
def voiced_bounds(y: np.ndarray, sr: int, gate_db: float = 45.0) -> tuple[int, int] | None:
    hop = max(1, int(sr * 0.01))
    n = len(y) // hop
    if n == 0:
        return None
    db = 20 * np.log10(np.sqrt((y[: n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
    idx = np.where(db > db.max() - gate_db)[0]
    if len(idx) == 0:
        return None
    return max(0, idx[0] * hop - int(0.02 * sr)), min(len(y), (idx[-1] + 1) * hop + int(0.06 * sr))


def fade(y: np.ndarray, sr: int, fin: float = 0.005, fout: float = 0.03) -> np.ndarray:
    y = y.copy()
    fi, fo = int(fin * sr), int(fout * sr)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    return y


def trim(y: np.ndarray, sr: int) -> np.ndarray:
    b = voiced_bounds(y, sr)
    return fade(y[b[0]:b[1]], sr) if b else y


def speech_stats(y: np.ndarray, sr: int) -> dict:
    hop = max(1, int(sr * 0.01))
    n = len(y) // hop
    db = 20 * np.log10(np.sqrt((y[: n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))
    idx = np.where(db > db.max() - 40)[0]
    if len(idx) == 0:
        return {"speech_s": 0.0, "max_pause_s": 0.0}
    gaps = np.diff(idx) - 1
    return {"speech_s": (idx[-1] - idx[0] + 1) * 0.01, "max_pause_s": float(gaps.max() * 0.01) if len(gaps) else 0.0}


def ffmpeg_loudnorm_json(stderr: str) -> dict:
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    if not m:
        raise RuntimeError("sortie loudnorm introuvable:\n" + stderr[-2000:])
    return json.loads(m.group(0))


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"échec: {' '.join(cmd)}\n{p.stderr[-2000:]}")
    return p


def encode_normalized_mp3(wav_in: Path, mp3_out: Path, I: float, TP: float, LRA: float, q: int,
                          tempo: float, tag: str) -> dict:
    """EBU R128 : mesure -> (gain + limiteur si le gain ferait dépasser le true-peak) -> loudnorm
    2e passe linéaire -> MP3 mono 44.1 kHz VBR. Sans pré-limiteur, loudnorm linéaire plafonne le
    gain sur les voix à pics marqués (jusqu'à -2 LU mesuré sur des répliques courtes)."""
    base = f"loudnorm=I={I}:TP={TP}:LRA={LRA}"
    head = f"atempo={tempo}," if abs(tempo - 1.0) > 1e-3 else ""

    def measure(pre: str) -> dict:
        af = head + (pre + "," if pre else "") + base + ":print_format=json"
        return ffmpeg_loudnorm_json(run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav_in), "-af", af,
                                         "-f", "null", "-"]).stderr)

    m = measure("")
    pre = ""
    gain = I - float(m["input_i"])
    if float(m["input_tp"]) + gain > TP - 0.5:
        lim = 10 ** ((TP - 1.0) / 20)  # limiteur à TP-1 dB, suréchantillonné pour les pics inter-échantillons
        pre = (f"volume={gain:.2f}dB,aresample=192000,alimiter=limit={lim:.4f}:attack=2:release=40:level=disabled,"
               f"aresample=48000")
        m = measure(pre)
    af = head + ((pre + ",") if pre else "") + (
        f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
        f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json,"
        f"aresample=44100")
    tmp = mp3_out.with_suffix(".tmp.mp3")
    run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(wav_in), "-af", af, "-ac", "1",
         "-c:a", "libmp3lame", "-q:a", str(q), "-metadata", f"comment={tag}", "-id3v2_version", "3", str(tmp)])
    os.replace(tmp, mp3_out)
    chk = ffmpeg_loudnorm_json(run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp3_out), "-af",
                                    base + ":print_format=json", "-f", "null", "-"]).stderr)
    return {"lufs": float(chk["input_i"]), "true_peak_db": float(chk["input_tp"])}


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration:format_tags=comment", "-of", "json", str(path)])
    d = json.loads(p.stdout).get("format", {})
    return {"duration": float(d.get("duration", 0.0)), "comment": (d.get("tags") or {}).get("comment", "")}


# ============================================================================ génération
def synth_line(engine, text: str, cfg: dict, seed: int, pause_ms_default: int) -> tuple[np.ndarray, int]:
    """Gère les marqueurs [pause N] : synthèse par morceau + silences exacts."""
    parts, pauses, pos = [], [], 0
    for m in PAUSE_RE.finditer(text):
        parts.append(text[pos:m.start()])
        pauses.append(int(m.group(1) or pause_ms_default))
        pos = m.end()
    parts.append(text[pos:])
    parts = [p.strip() for p in parts]
    if len(parts) == 1:
        return engine.synth(parts[0], cfg, seed)
    out, sr = [], None
    for i, p in enumerate(parts):
        if not p:
            continue
        y, sr = engine.synth(p, cfg, seed + i)
        if out:
            out.append(np.zeros(int(sr * pauses[i - 1] / 1000), np.float32))
        out.append(trim(y, sr))
    return np.concatenate(out), sr


def is_sane(y: np.ndarray, sr: int, text: str, pause_ms_default: int) -> tuple[bool, dict]:
    """Garde-fous : débit plausible (0.035–0.16 s/caractère hors pauses explicites), pas de trou
    > 1.2 s (hors [pause]), pas de sortie muette. Attrape les emballements/troncatures des TTS."""
    st = speech_stats(y, sr)
    pauses = [int(m.group(1) or pause_ms_default) / 1000 for m in PAUSE_RE.finditer(text)]
    nchar = len(re.sub(r"\W", "", PAUSE_RE.sub("", text)))
    spc = (st["speech_s"] - sum(pauses)) / max(nchar, 1)
    sane = (0.035 <= spc <= 0.16 and st["max_pause_s"] <= 1.2 + max(pauses, default=0.0)
            and float(np.abs(y).max()) > 1e-3)
    return sane, {"s_per_char": round(spc, 3), "max_pause_s": round(st["max_pause_s"], 2)}


def load_lines(path: Path) -> list[dict]:
    lines = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(lines, list):
        raise SystemExit("L'entrée doit être une liste JSON [{id, lang, text}].")
    seen, errors = set(), []
    for i, ln in enumerate(lines):
        bad = [k for k in ("id", "lang", "text") if not isinstance(ln.get(k), str) or not ln[k].strip()]
        if bad:
            errors.append(f"ligne {i}: champ(s) {bad} manquant(s) ou vide(s)")
            continue
        if not ID_RE.match(ln["id"]):
            errors.append(f"ligne {i}: id '{ln['id']}' invalide (a-z0-9_- uniquement, minuscules)")
        if ln["lang"] not in LANGS:
            errors.append(f"ligne {i}: lang '{ln['lang']}' non supportée ({sorted(LANGS)})")
        if (ln["lang"], ln["id"]) in seen:
            errors.append(f"ligne {i}: doublon {(ln['lang'], ln['id'])}")
        seen.add((ln["lang"], ln["id"]))
    if errors:
        raise SystemExit("Entrée invalide:\n  " + "\n  ".join(errors))
    return lines


def write_manifest(path: Path, entries: dict, lines: list[dict], post: dict) -> None:
    order = {(ln["lang"], ln["id"]): i for i, ln in enumerate(lines)}
    kept = sorted((e for k, e in entries.items() if k in order), key=lambda e: order[(e["lang"], e["id"])])
    doc = {"generator": TOOL_VERSION, "format": {"codec": "mp3", "sample_rate": 44100, "channels": 1},
           "loudness_target": {"integrated_lufs": post["lufs"], "true_peak_db": post["tp"]},
           "total_duration_s": round(sum(e.get("duration_s", 0) for e in kept), 2), "lines": kept}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="fichier JSON [{id, lang, text}]")
    ap.add_argument("--out", type=Path, required=True, help="dossier de sortie (ex: public/audio/narrator)")
    ap.add_argument("--voices", type=Path, default=HERE / "voices.json", help="presets de voix")
    ap.add_argument("--force", action="store_true", help="régénère tout, même ce qui est à jour")
    ap.add_argument("--only", default="", help="ids séparés par des virgules")
    ap.add_argument("--lang", choices=sorted(LANGS), help="ne traiter qu'une langue")
    ap.add_argument("--dry-run", action="store_true", help="liste ce qui serait (re)généré")
    ap.add_argument("--takes", type=int, default=1, help="prises par réplique ; garde la meilleure (UTMOS). Conseillé : 4")
    ap.add_argument("--asr", nargs="?", const="small", default=None, metavar="MODELE",
                    help="vérifie l'intelligibilité par faster-whisper (défaut: small ; large-v3-turbo = plus sûr, plus lent)")
    ap.add_argument("--max-cer", type=float, default=0.12, help="seuil CER pour --asr")
    ap.add_argument("--pause-ms", type=int, default=500, help="durée par défaut de [pause]")
    ap.add_argument("--lufs", type=float, default=-16.0)
    ap.add_argument("--true-peak", type=float, default=-1.5)
    ap.add_argument("--lra", type=float, default=11.0)
    ap.add_argument("--mp3-quality", type=int, default=3, help="libmp3lame -q:a (0=meilleur … 9)")
    ap.add_argument("--head-ms", type=int, default=40, help="silence avant la voix")
    ap.add_argument("--tail-ms", type=int, default=200, help="silence après la voix")
    ap.add_argument("--keep-wav", action="store_true", help="garde aussi le WAV brut retenu (debug)")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"{tool} introuvable : lance via ./tts.sh, `nix develop` ou `nix-shell -p ffmpeg`.")

    presets = json.loads(args.voices.read_text(encoding="utf-8"))["presets"]
    lines = load_lines(args.input)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    entries: dict = {}
    if manifest_path.exists():
        try:
            entries = {(e["lang"], e["id"]): e for e in json.loads(manifest_path.read_text(encoding="utf-8")).get("lines", [])}
        except (ValueError, KeyError):
            log("manifest existant illisible : il sera reconstruit")
    post = {"lufs": args.lufs, "tp": args.true_peak, "lra": args.lra, "q": args.mp3_quality,
            "head": args.head_ms, "tail": args.tail_ms, "pause": args.pause_ms}

    engines: dict = {}
    scorer = asr = None
    if args.takes > 1 and not args.dry_run:
        try:
            scorer = UtmosScorer()
        except Exception as ex:  # noqa: BLE001 — réseau/hub indisponible : on continue sans score
            log(f"⚠ UTMOS indisponible ({ex!r}) : sélection des prises sur les seuls garde-fous")
    if args.asr and not args.dry_run:
        asr = AsrChecker(args.asr)

    stats = {"generated": 0, "skipped": 0, "stale": 0, "failed": 0, "asr_warn": 0}
    t_start = time.time()
    for ln in lines:
        lid, lang, text = ln["id"], ln["lang"], ln["text"].strip()
        say = (ln.get("say") or text).strip()  # texte prononcé (graphie phonétique éventuelle), "text" = sous-titre
        if (only and lid not in only) or (args.lang and lang != args.lang):
            continue
        preset = ln.get("voice", "narrator")
        if preset not in presets or lang not in presets[preset]:
            log(f"✗ {lang}/{lid}: preset '{preset}' sans voix pour '{lang}'")
            stats["failed"] += 1
            continue
        vcfg = presets[preset][lang]
        seed = int(ln.get("seed", vcfg.get("seed", 1234)))
        h = hashlib.sha256(json.dumps({"v": TOOL_VERSION, "text": say, "lang": lang, "voice": vcfg, "seed": seed,
                                       "post": post}, sort_keys=True).encode()).hexdigest()[:16]
        tag = f"{TOOL_VERSION}:{h}"
        rel = f"{lang}/{lid}.mp3"
        mp3 = out / rel
        mp3.parent.mkdir(parents=True, exist_ok=True)
        if mp3.exists() and not args.force:
            info = probe(mp3)
            if info["comment"] == tag:
                stats["skipped"] += 1
                if (entries.get((lang, lid)) or {}).get("hash") != h:  # manifest perdu : reconstruit sans régénérer
                    entries[(lang, lid)] = {"id": lid, "lang": lang, "text": text, "file": rel,
                                            "duration_s": round(info["duration"], 3), "voice": preset,
                                            "engine": vcfg["engine"], "hash": h}
                continue
            if not info["comment"].startswith("ombres-tts/"):
                # fichier posé à la main (enregistrement humain, retouche…) : jamais écrasé sans --force
                stats["skipped"] += 1
                log(f"⏭ {rel}: fichier sans tag ombres-tts (externe) → conservé (--force pour l'écraser)")
                entries[(lang, lid)] = {"id": lid, "lang": lang, "text": text, "file": rel,
                                        "duration_s": round(info["duration"], 3), "voice": "external",
                                        "engine": "external", "hash": None}
                continue
            stats["stale"] += 1
            log(f"↻ {rel}: texte/voix/réglages modifiés → régénération")
        if args.dry_run:
            log(f"• (dry-run) {rel}: {text}")
            continue

        eng = engines.setdefault(vcfg["engine"], ENGINES[vcfg["engine"]]())
        t0 = time.time()
        cands = []
        n_takes = max(1, args.takes)
        for k in range(n_takes + 2):  # +2 prises de secours si toutes sont aberrantes
            if k >= n_takes and any(c["sane"] for c in cands):
                break
            s = seed + 101 * k
            try:
                y, sr = synth_line(eng, say, vcfg, s, args.pause_ms)
            except Exception as ex:  # noqa: BLE001
                log(f"✗ {rel}: erreur moteur ({ex!r})")
                break
            sane, st = is_sane(y, sr, say, args.pause_ms)
            y = trim(y, sr)
            score = scorer(y, sr) if scorer else 0.0
            cands.append({"y": y, "sr": sr, "seed": s, "take": k + 1, "sane": sane, "score": score, **st})
        if not cands:
            stats["failed"] += 1
            continue
        cands.sort(key=lambda c: (c["sane"], c["score"]), reverse=True)
        chosen, asr_info = cands[0], {}
        if asr:
            # mot-clé "Lilas|lila" : variantes acceptées (homophones que Whisper orthographie autrement)
            keywords = [[AsrChecker._norm(a, lang) for a in k.split("|")] for k in ln.get("keywords", [])]
            for c in cands:
                cer, hyp = asr(c["y"], c["sr"], say, lang)
                hyp_n = AsrChecker._norm(hyp, lang)
                missing = [alts[0] for alts in keywords if not any(a in hyp_n for a in alts)]
                c["asr_cer"], c["asr_text"], c["asr_missing"] = round(cer, 3), hyp, missing
                if cer <= args.max_cer and not missing:
                    chosen = c
                    break
            else:
                chosen = min(cands, key=lambda c: (len(c.get("asr_missing", [])), c.get("asr_cer", 9)))
                stats["asr_warn"] += 1
                miss = f", mots-clés non entendus : {chosen['asr_missing']}" if chosen.get("asr_missing") else ""
                log(f"  ⚠ {rel}: aucune prise valide (CER ≤ {args.max_cer}{' + mots-clés' if keywords else ''}) ; "
                    f"retenue : CER {chosen['asr_cer']}{miss} « {chosen['asr_text']} » → reformuler ou changer de voix")
            asr_info = {"asr_cer": chosen.get("asr_cer"), "asr_text": chosen.get("asr_text"),
                        "asr_ok": not (chosen.get("asr_missing") or (chosen.get("asr_cer") or 0) > args.max_cer)}
        y = np.concatenate([np.zeros(int(chosen["sr"] * args.head_ms / 1000), np.float32), chosen["y"],
                            np.zeros(int(chosen["sr"] * args.tail_ms / 1000), np.float32)])
        peak = float(np.abs(y).max())
        if peak > 0.89:  # certains moteurs (Chatterbox, Piper) sortent > 0 dBFS : on évite l'écrêtage PCM16,
            y = y * (0.89 / peak)  # la normalisation loudness rétablit le niveau ensuite
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / "raw.wav"
            sf.write(wav, y, chosen["sr"], subtype="PCM_16")
            loud = encode_normalized_mp3(wav, mp3, args.lufs, args.true_peak, args.lra, args.mp3_quality,
                                         float(vcfg.get("tempo", 1.0)), tag)
            if args.keep_wav:
                shutil.copy(wav, mp3.with_suffix(".raw.wav"))
        dur = probe(mp3)["duration"]
        entries[(lang, lid)] = {"id": lid, "lang": lang, "text": text, **({"say": say} if say != text else {}),
                                "file": rel, "duration_s": round(dur, 3),
                                "lufs": round(loud["lufs"], 1), "true_peak_db": round(loud["true_peak_db"], 1),
                                "voice": preset, "engine": vcfg["engine"], "seed": chosen["seed"],
                                "take": f"{chosen['take']}/{len(cands)}", "utmos": round(chosen["score"], 2) if scorer else None,
                                **asr_info, "hash": h}
        stats["generated"] += 1
        flag = "" if chosen["sane"] else " ⚠ débit/pauses suspects"
        mos = f" mos={chosen['score']:.2f}" if scorer else ""
        log(f"✓ {rel} {dur:.2f}s {loud['lufs']:.1f} LUFS prise {chosen['take']}/{len(cands)}{mos} ({time.time() - t0:.1f}s){flag}")
        write_manifest(manifest_path, entries, lines, post)

    write_manifest(manifest_path, entries, lines, post)
    wanted = {f"{ln['lang']}/{ln['id']}.mp3" for ln in lines}
    orphans = sorted(str(p.relative_to(out)) for p in out.glob("*/*.mp3") if str(p.relative_to(out)) not in wanted)
    if orphans:
        log(f"⚠ {len(orphans)} fichier(s) absents de l'entrée (non supprimés) : {', '.join(orphans[:10])}")
    log(f"terminé en {time.time() - t_start:.0f}s — générés {stats['generated']}, à jour {stats['skipped']}, "
        f"modifiés {stats['stale']}, échecs {stats['failed']}, alertes ASR {stats['asr_warn']}")
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
