# Ombres — banc TTS : Kyutai TTS 1.6B en_fr (code MIT/Apache, poids CC-BY-4.0), voix = embeddings précalculés
# de kyutai/tts-voices (le modèle ne clone pas un wav arbitraire : seules les voix fournies avec un
# embedding « .1e68beda@240.safetensors » sont utilisables ; voice-zero/bill_boerst n'en a pas).
# Systèmes : k16-<nom> pour chaque voix de VOICES (même voix en FR et en EN), cfg 2,0, temp 0,6 ;
# variante « -slow » avec padding_bonus (débit plus lent).
# 2 T4 : une partie par GPU. Sortie : /kaggle/working/wav/<système>/*.wav + gen_<système>.json.
import glob, os, subprocess, sys, time

T0 = time.time()
# nom=chemin dans kyutai/tts-voices (sans suffixe d'embedding)
# Choix sans écoute (tri local des voix libres : langue détectée par Whisper, F0 médiane, voir le doc de recherche) :
#   frm   = CML-TTS 4193 (CC-BY-4.0), français, F0 89 Hz, 11,4 car/s : la même référence que les modèles à clonage
#   erick = don de voix « Erick » (CC0), français, F0 104 Hz
#   jeff  = don de voix « Jeff_Andrew » (CC0), anglais, F0 82 Hz (contrôle : voix anglophone grave)
VOICES = [v.split("=", 1) for v in os.environ.get(
    "OMBRES_VOICES",
    "frm=cml-tts/fr/4193_3103_000004-0001_enhanced.wav,erick=voice-donations/Erick_enhanced.wav,"
    "jeff=voice-donations/Jeff_Andrew_enhanced.wav").split(",") if v]
SLOW = [v for v in os.environ.get("OMBRES_SLOW", "frm").split(",") if v]  # voix testées aussi en débit lent
PAD_BONUS = float(os.environ.get("OMBRES_PAD_BONUS", "1.0"))
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
LINES = os.environ.get("OMBRES_LINES")


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_PART" not in os.environ:
    # moshi épingle torch<2.10 : on garde le torch de l'image (--no-deps) et on ajoute ses petites dépendances
    sh(f"{sys.executable} -m pip install -q --no-deps moshi==0.2.13 && {sys.executable} -m pip install -q 'sphn>=0.2,<0.3' sentencepiece 2>&1 | tail -3")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)

sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402

part = genlib.split_gpus()
NP = genlib.nparts()
if part is None:
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

import torch  # noqa: E402
from moshi.models.loaders import CheckpointInfo  # noqa: E402
from moshi.models.tts import DEFAULT_DSM_TTS_REPO, TTSModel  # noqa: E402

ci = CheckpointInfo.from_hf_repo(DEFAULT_DSM_TTS_REPO)
DEV = "cuda" if torch.cuda.is_available() else "cpu"  # kernel CPU possible (file d'attente T4 saturée)
model = TTSModel.from_checkpoint_info(ci, n_q=32, temp=0.6, device=DEV, dtype=torch.float32)
SR = model.mimi.sample_rate
lines = genlib.load_lines(LINES)

jobs = []
for name, path in VOICES:
    jobs.append((f"k16-{name}", path, 0.0))
    if name in SLOW:
        jobs.append((f"k16-{name}-slow", path, PAD_BONUS))
for system, path, bonus in jobs[part::NP]:
    def synth(txt, lang, _v, seed, path=path, bonus=bonus):
        model.padding_bonus = bonus
        with torch.no_grad():
            out = model.simple_generate(txt, path, cfg_coef=2.0, show_progress=False)
        return out[0].float().cpu().numpy(), SR

    genlib.run(system, {"fr": path, "en": path}, synth, lines, takes=TAKES)
print(f"[partie {part}] {time.time()-T0:.0f}s", flush=True)
