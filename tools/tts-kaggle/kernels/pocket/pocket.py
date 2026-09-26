# Ombres — banc TTS : référence Pocket TTS 3.3.0 (Kyutai, 100 M, poids CC-BY-4.0), voix bill_boerst (CC0),
# réglages du lot actuel (preset « narrator » : modèles french / english, température 0,3, atempo 0,92).
# Kernel CPU (pas de quota GPU). Mêmes graines et même corpus que les autres systèmes : 3 prises BRUTES
# (sans tri UTMOS ni ASR) = ce que Pocket donne avant la sélection du lot.
import glob, os, subprocess, sys, time

T0 = time.time()
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
TEMPO = 0.92
subprocess.run("pip install -q pocket-tts==3.3.0 2>&1 | tail -2; which ffmpeg", shell=True)
sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402
import numpy as np  # noqa: E402
from pocket_tts import TTSModel  # noqa: E402

models = {lang: TTSModel.load_model(language=m, temp=0.3) for lang, m in (("fr", "french"), ("en", "english"))}
states = {lang: m.get_state_for_audio_prompt("bill_boerst") for lang, m in models.items()}


def atempo(y, sr, tempo):
    p = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
                        "-af", f"atempo={tempo}", "-f", "f32le", "-ar", str(sr), "-ac", "1", "pipe:1"],
                       input=np.ascontiguousarray(y, dtype=np.float32).tobytes(), capture_output=True)
    if p.returncode != 0:
        import librosa
        return librosa.effects.time_stretch(y, rate=tempo)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def synth(txt, lang, _v, seed):
    m = models[lang]
    y = m.generate_audio(states[lang], txt).detach().cpu().numpy().reshape(-1).astype(np.float32)
    return atempo(y, m.sample_rate, TEMPO), int(m.sample_rate)


genlib.run("pocket-bill", {"fr": "bill_boerst", "en": "bill_boerst"}, synth, genlib.load_lines(), takes=TAKES)
print(f"[fin] {time.time()-T0:.0f}s", flush=True)
