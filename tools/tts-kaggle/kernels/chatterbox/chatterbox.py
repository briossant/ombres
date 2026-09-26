# Ombres — banc TTS : Chatterbox Multilingual v3 (Resemble AI, 0,5 B, MIT, 23 langues ; watermark PerTh).
# Systèmes : cb-<ref> (clonage de chaque référence de REFS, exaggeration 0,5, cfg_weight 0,5), en FR et en EN.
# 2 T4 : une partie par GPU. Sortie : /kaggle/working/wav/<système>/*.wav + gen_<système>.json.
import glob, os, subprocess, sys, time

T0 = time.time()
REFS = os.environ.get("OMBRES_REFS", "bill,frm").split(",")
TAKES = int(os.environ.get("OMBRES_TAKES", "3"))
LINES = os.environ.get("OMBRES_LINES")
EXAG = float(os.environ.get("OMBRES_EXAG", "0.5"))
CFGW = float(os.environ.get("OMBRES_CFGW", "0.5"))


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_PART" not in os.environ:
    # modèle v3 : dépôt git (le paquet PyPI peut être en retard) ; ses dépendances épinglées (torch 2.6) s'installent
    sh(f"{sys.executable} -m pip install -q 'setuptools<81' 'chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox@master' 2>&1 | tail -3")
    # torch est ramené à 2.6 : le torchvision de l'image (fait pour torch 2.10) casse l'import de transformers
    sh(f"{sys.executable} -m pip uninstall -y -q torchvision")
    sh(f"{sys.executable} -m pip list 2>/dev/null | grep -i -E '^(torch|transformers|chatterbox|resemble)'")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)

sys.path.insert(0, os.path.dirname(glob.glob("/kaggle/input/**/genlib.py", recursive=True)[0]))
import genlib  # noqa: E402

part = genlib.split_gpus()
NP = genlib.nparts()
if part is None:
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

import torch  # noqa: E402
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402

DEV = "cuda" if torch.cuda.is_available() else "cpu"  # kernel CPU possible (file d'attente T4 saturée)
try:
    model = ChatterboxMultilingualTTS.from_pretrained(device=DEV, t3_model="v3")
    ver = "v3"
except TypeError:
    model = ChatterboxMultilingualTTS.from_pretrained(device=DEV)
    ver = "défaut"
print("chatterbox", ver, "sr", model.sr, flush=True)
lines = genlib.load_lines(LINES)
refs = genlib.refs()
mine = REFS[part::NP]
for r in mine:
    wav = refs[r]["wav"]

    def synth(txt, lang, _v, seed, wav=wav):
        y = model.generate(txt, language_id=lang, audio_prompt_path=wav, exaggeration=EXAG, cfg_weight=CFGW)
        return y.squeeze(0).cpu().numpy(), model.sr

    suffix = "" if (EXAG, CFGW) == (0.5, 0.5) else f"-e{EXAG}c{CFGW}"
    genlib.run(f"cb-{r}{suffix}", {"fr": wav, "en": wav}, synth, lines, takes=TAKES)
print(f"[partie {part}] {time.time()-T0:.0f}s", flush=True)
