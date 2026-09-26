# Ombres — banc TTS : VoxCPM2 (OpenBMB, 2 B, Apache-2.0, 30 langues dont le français, sortie 48 kHz).
# Systèmes :
#   vox-<ref>   : clonage « ultime » (prompt_wav + transcription + reference_wav) de chaque référence de REFS
#   vox-design  : « concevoir puis cloner » : une description en tête de texte fabrique une référence de 12 s
#                 (aucune voix humaine réelle), clonée ensuite pour toutes les répliques.
# 2 T4 : une partie par GPU. Sortie : /kaggle/working/wav/<système>/*.wav + gen_<système>.json.
import glob, json, os, subprocess, sys, time

T0 = time.time()
REFS = os.environ.get("OMBRES_REFS", "bill,frm").split(",")
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
LINES = os.environ.get("OMBRES_LINES")
CFG = float(os.environ.get("OMBRES_CFG", "2.0"))
STEPS = int(os.environ.get("OMBRES_STEPS", "10"))
DESIGN_FR = ("Le vent se lève sur les dunes. Personne ne sait d'où viennent les ombres, "
             "mais elles finissent toujours par rentrer. Asseyez-vous, et écoutez bien.")
DESIGN_DESC = ("An old male storyteller, deep low-pitched slightly husky voice, speaking French slowly and calmly, "
               "almost murmuring, mysterious, dry humour")


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_PART" not in os.environ:
    sh(f"{sys.executable} -m pip install -q voxcpm 2>&1 | tail -3")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)

sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402

part = genlib.split_gpus()
NP = genlib.nparts()
if part is None:
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from voxcpm import VoxCPM  # noqa: E402

lines = genlib.load_lines(LINES)
refs = genlib.refs()
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, optimize=False)
SR = model.tts_model.sample_rate
print("sample rate", SR, flush=True)


def f0_median(y, sr):
    import librosa
    f0 = librosa.yin(y, fmin=60, fmax=400, sr=sr, frame_length=4096, hop_length=1024)
    rms = librosa.feature.rms(y=y, frame_length=4096, hop_length=1024)[0][: len(f0)]
    return float(np.median(f0[: len(rms)][rms > rms.max() * 0.03]))


jobs = []
if part == 0:
    best = None
    import torch
    for s in (11, 22, 33):
        torch.manual_seed(s)  # voxcpm 2.0.3 (PyPI) n'accepte pas encore `seed=`
        y = model.generate(text=f"({DESIGN_DESC}){DESIGN_FR}", cfg_value=CFG, inference_timesteps=STEPS)
        y = np.asarray(y, dtype=np.float32)
        f0 = f0_median(y, SR)
        print(f"  design seed {s}: {len(y)/SR:.1f}s F0 {f0:.0f} Hz", flush=True)
        if (70 <= f0 <= 150 and (best is None or f0 < best[0])) or (best is None and s == 33):
            best = (f0, y, s)
    os.makedirs(f"{genlib.WORK}/refs", exist_ok=True)
    ref_design = f"{genlib.WORK}/refs/vox_design.wav"
    sf.write(ref_design, best[1], SR)
    json.dump({"text": DESIGN_FR, "desc": DESIGN_DESC, "seed": best[2], "f0": best[0]},
              open(f"{genlib.WORK}/refs/vox_design.json", "w"), ensure_ascii=False)
    jobs.append(("vox-design", ref_design, DESIGN_FR))
    jobs += [(f"vox-{r}", refs[r]["wav"], refs[r]["text"]) for r in (REFS[1::2] if NP > 1 else REFS)]
else:
    jobs += [(f"vox-{r}", refs[r]["wav"], refs[r]["text"]) for r in REFS[0::2]]

for system, wav, text in jobs:
    def synth(txt, lang, _v, seed, wav=wav, text=text):
        y = model.generate(text=txt, prompt_wav_path=wav, prompt_text=text, reference_wav_path=wav,
                           cfg_value=CFG, inference_timesteps=STEPS)  # graine : torch.manual_seed dans genlib
        return y, SR

    genlib.run(system, {"fr": wav, "en": wav}, synth, lines, takes=TAKES)
print(f"[partie {part}] {time.time()-T0:.0f}s", flush=True)
