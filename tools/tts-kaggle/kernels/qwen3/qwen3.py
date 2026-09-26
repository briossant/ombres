# Ombres — banc TTS : Qwen3-TTS 12 Hz 1.7B (Alibaba, Apache-2.0), clonage d'une voix de référence libre.
# Systèmes :
#   qwen3-<ref>    : modèle Base, clonage (ref_audio + transcription) de chaque référence de REFS, en FR et en EN
#   qwen3-design   : « concevoir puis cloner » : VoiceDesign fabrique une référence de 12 s à partir d'une
#                    description (aucune voix humaine réelle), le modèle Base la clone ensuite pour toutes les
#                    répliques (voix stable d'une réplique à l'autre).
# 2 T4 : une partie par GPU. Sortie : /kaggle/working/wav/<système>/*.wav + gen_<système>.json.
import glob, json, os, subprocess, sys, time

T0 = time.time()
REFS = os.environ.get("OMBRES_REFS", "bill,frm").split(",")
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
LINES = os.environ.get("OMBRES_LINES")  # chemin d'un lot complet (sinon : corpus du banc)
DESIGN_FR = ("Le vent se lève sur les dunes. Personne ne sait d'où viennent les ombres, "
             "mais elles finissent toujours par rentrer. Asseyez-vous, et écoutez bien.")
DESIGN_INSTRUCT = ("An old male storyteller with a deep, low-pitched, slightly husky voice. He speaks slowly and "
                   "calmly, almost in a murmur, with a mysterious tone and a dry sense of humour, like an old desert "
                   "nomad telling a tale by the fire. Native French speaker.")


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_PART" not in os.environ:
    sh(f"{sys.executable} -m pip install -q qwen-tts 2>&1 | tail -3")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)

sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402

part = genlib.split_gpus()
NP = genlib.nparts()
if part is None:
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

import numpy as np  # noqa: E402
import torch  # noqa: E402
from qwen_tts import Qwen3TTSModel  # noqa: E402

DT = torch.float32  # T4 : pas de bf16 natif ; fp16 risque des débordements sur un LLM
LANG = {"fr": "French", "en": "English"}
lines = genlib.load_lines(LINES)
refs = genlib.refs()


def load(name):
    for attn in ("sdpa", None):
        try:
            kw = {"attn_implementation": attn} if attn else {}
            return Qwen3TTSModel.from_pretrained(name, device_map="cuda:0", dtype=DT, **kw)
        except Exception as e:  # noqa: BLE001
            print("chargement", name, attn, e, flush=True)
    raise RuntimeError(name)


def f0_median(y, sr):
    import librosa
    f0 = librosa.yin(y, fmin=60, fmax=400, sr=sr, frame_length=2048)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0][: len(f0)]
    return float(np.median(f0[: len(rms)][rms > rms.max() * 0.03]))


jobs = []
if part == 0:
    # 1) conception de la voix (une fois), 3 essais : on garde le plus grave dans une plage plausible
    t = time.time()
    dm = load("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    best = None
    for s in (11, 22, 33):
        torch.manual_seed(s)
        wavs, sr = dm.generate_voice_design(text=DESIGN_FR, language="French", instruct=DESIGN_INSTRUCT)
        y = np.asarray(wavs[0], dtype=np.float32)
        f0 = f0_median(y, sr)
        print(f"  design seed {s}: {len(y)/sr:.1f}s F0 {f0:.0f} Hz", flush=True)
        if 70 <= f0 <= 150 and (best is None or f0 < best[0]):
            best = (f0, y, sr, s)
        if best is None and s == 33:
            best = (f0, y, sr, s)
    import soundfile as sf
    os.makedirs(f"{genlib.WORK}/refs", exist_ok=True)
    ref_design = f"{genlib.WORK}/refs/qwen3_design.wav"
    sf.write(ref_design, best[1], best[2])
    json.dump({"text": DESIGN_FR, "instruct": DESIGN_INSTRUCT, "seed": best[3], "f0": best[0]},
              open(f"{genlib.WORK}/refs/qwen3_design.json", "w"), ensure_ascii=False)
    print(f"  design retenu : seed {best[3]} F0 {best[0]:.0f} Hz ({time.time()-t:.0f}s)", flush=True)
    del dm
    torch.cuda.empty_cache()
    jobs.append(("qwen3-design", ref_design, DESIGN_FR))
    jobs += [(f"qwen3-{r}", refs[r]["wav"], refs[r]["text"]) for r in (REFS[1::2] if NP > 1 else REFS)]
else:
    jobs += [(f"qwen3-{r}", refs[r]["wav"], refs[r]["text"]) for r in REFS[0::2]]

model = load("Qwen/Qwen3-TTS-12Hz-1.7B-Base")
for system, wav, text in jobs:
    prompt = model.create_voice_clone_prompt(ref_audio=wav, ref_text=text)

    def synth(txt, lang, _v, seed, prompt=prompt):
        wavs, sr = model.generate_voice_clone(text=txt, language=LANG[lang], voice_clone_prompt=prompt,
                                              max_new_tokens=600)
        return wavs[0], sr

    genlib.run(system, {"fr": wav, "en": wav}, synth, lines, takes=TAKES)
print(f"[partie {part}] {time.time()-T0:.0f}s", flush=True)
