# Tri (CPU, local) des voix libres de kyutai/tts-voices : F0 médiane (librosa yin) et, pour les voix graves
# (F0 < 150 Hz), langue + transcription par Whisper small. Sortie : <dossier>/refs_local.json (copie : data/voices_screen.json).
# Usage : LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH tools/tts/.venv/bin/python tools/tts-kaggle/screen_voices.py <dossier-temporaire>
import os, json, sys, numpy as np, librosa, torch
from huggingface_hub import list_repo_files, hf_hub_download
from faster_whisper import WhisperModel
S = sys.argv[1]
files = list_repo_files("kyutai/tts-voices")
emb = {f[: f.index(".wav") + 4] for f in files if f.endswith(".safetensors") and ".wav." in f}
want = [f for f in files if f.endswith(".wav") and not f.endswith("_enhanced.wav")
        and f.split("/")[0] in ("voice-donations", "cml-tts", "unmute-prod-website")]
asr = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
out = []
for i, f in enumerate(sorted(want)):
    p = hf_hub_download("kyutai/tts-voices", f, cache_dir=f"{S}/hfcache")
    y, _ = librosa.load(p, sr=16000, mono=True)
    f0 = librosa.yin(y, fmin=60, fmax=400, sr=16000, frame_length=1024, hop_length=256)
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0][: len(f0)]
    v = f0[rms > rms.max() * 0.03]
    f0m = float(np.median(v)) if len(v) else 0
    r = {"path": f, "f0": round(f0m, 1), "dur": round(len(y) / 16000, 2), "emb": f in emb,
         "emb_enh": f.replace(".wav", "_enhanced.wav") in emb}
    if f0m < 150:  # voix graves seulement : transcription et langue
        segs, info = asr.transcribe(y, beam_size=1, without_timestamps=True, condition_on_previous_text=False)
        r.update(lang=info.language, lang_p=round(info.language_probability, 2), text=" ".join(s.text.strip() for s in segs))
    out.append(r)
    os.remove(os.path.realpath(p))
    if i % 25 == 0:
        print(i, r, flush=True)
json.dump(out, open(f"{S}/refs_local.json", "w"), ensure_ascii=False, indent=0)
