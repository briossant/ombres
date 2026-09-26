# Ombres — banc TTS : Fun-CosyVoice3 0.5B (FunAudioLLM / Alibaba, Apache-2.0, 9 langues dont le français).
# Systèmes : cosy-<ref> (clonage zero-shot avec transcription de chaque référence de REFS), en FR et en EN.
# Installation minimale par-dessus le torch de l'image (le requirements.txt officiel épingle torch 2.3.1 / py3.10).
# 2 T4 : une partie par GPU. Sortie : /kaggle/working/wav/<système>/*.wav + gen_<système>.json.
import glob, os, subprocess, sys, time

T0 = time.time()
REFS = os.environ.get("OMBRES_REFS", "bill,frm").split(",")
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
LINES = os.environ.get("OMBRES_LINES")
REPO = "/kaggle/working/CosyVoice"
PROMPT_PREFIX = "You are a helpful assistant.<|endofprompt|>"


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_PART" not in os.environ:
    sh(f"git clone -q --recursive --depth 1 https://github.com/FunAudioLLM/CosyVoice.git {REPO}")
    sh(f"{sys.executable} -m pip install -q conformer==0.3.2 'diffusers<0.33' hydra-core HyperPyYAML inflect lightning modelscope omegaconf "
       "onnxruntime openai-whisper pyworld wetext 'x-transformers==2.11.24' gdown wget "
       # transformers 5 charge le LLM Qwen2 de CosyVoice en bf16 (« mat1 and mat2 must have the same dtype ») :
       # on reprend la version épinglée par CosyVoice
       "'transformers==4.51.3' 2>&1 | tail -3")
    from huggingface_hub import snapshot_download
    snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir="/kaggle/working/Fun-CosyVoice3-0.5B")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)

sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402

part = genlib.split_gpus()
NP = genlib.nparts()
if part is None:
    sh(f"rm -rf {REPO} /kaggle/working/Fun-CosyVoice3-0.5B")  # ne garder que les wav et les json en sortie
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

sys.path[:0] = [REPO, f"{REPO}/third_party/Matcha-TTS"]
import torch  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402

model = AutoModel(model_dir="/kaggle/working/Fun-CosyVoice3-0.5B")
SR = model.sample_rate
lines = genlib.load_lines(LINES)
refs = genlib.refs()
for r in REFS[part::NP]:
    wav, text = refs[r]["wav"], refs[r]["text"]

    def synth(txt, lang, _v, seed, wav=wav, text=text):
        chunks = [j["tts_speech"] for j in model.inference_zero_shot(txt, PROMPT_PREFIX + text, wav, stream=False)]
        return torch.cat(chunks, dim=-1).squeeze(0).cpu().numpy(), SR

    genlib.run(f"cosy-{r}", {"fr": wav, "en": wav}, synth, lines, takes=TAKES)
print(f"[partie {part}] {time.time()-T0:.0f}s", flush=True)
