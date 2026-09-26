# Ombres — lot FR du narrateur : prises brutes Qwen3-TTS 12 Hz 1.7B Base (Apache-2.0) sur 2 × T4.
# Clone de la voix conçue `qwen3_design.wav` (Qwen3 VoiceDesign, aucune voix réelle). Pour chaque réplique
# du lot (dataset ombres-tts-gen-data : lines.fr-qwen3.json + voices.qwen3.json), les graines
# base + 101·k (k < OMBRES_TAKES) de chaque base de OMBRES_BASES, générées par lots (batch) : une partie par GPU.
# Sortie : takes_p<i>.tar (<clé>.flac, PCM 16 bits 24 kHz, clé = qwen3_engine.take_key) + takes_index.json.
# Le tri (UTMOS, Whisper, durée) se fait ensuite sur CPU (kernels/select), sans quota GPU.
import glob, json, os, subprocess, sys, tarfile, time

T0 = float(os.environ.get("OMBRES_T0", time.time()))
os.environ["OMBRES_T0"] = str(T0)
CONF = {"BASES": "1000,2000", "TAKES": "4", "BATCH": "24", "BUDGET_MIN": "80", "LIMIT": "0", "ONLY": "",
        "LINES": "lines.fr-qwen3.json"}
CONF = {k: os.environ.get("OMBRES_" + k, v) for k, v in CONF.items()}
WORK, TMP = "/kaggle/working", "/kaggle/tmp/takes"


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


def find(name):
    c = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    assert c, f"{name} introuvable"
    return c[0]


DATA = os.path.dirname(find("qwen3_engine.py"))
sys.path.insert(0, DATA)
import gen  # noqa: E402  (tools/tts/gen.py, copié dans le dataset)
import qwen3_engine as Q  # noqa: E402
from pathlib import Path  # noqa: E402

lines = gen.load_lines(Path(find(CONF["LINES"])))
presets = json.load(open(find("voices.qwen3.json")))["presets"]
only = set(filter(None, CONF["ONLY"].split(","))) or None
if int(CONF["LIMIT"]):
    lines = lines[: int(CONF["LIMIT"])]
reqs = Q.requests(lines, presets, [int(b) for b in CONF["BASES"].split(",")], int(CONF["TAKES"]), only)
reqs.sort(key=lambda r: (r["base"], len(r["text"]), r["key"]))  # une base après l'autre ; lots de longueurs voisines

if "OMBRES_PART" not in os.environ:
    print(f"[conf] {CONF} — {len(lines)} répliques, {len(reqs)} prises à générer", flush=True)
    sh(f"{sys.executable} -m pip install -q qwen-tts 2>&1 | tail -3")
    print(f"[install] {time.time()-T0:.0f}s", flush=True)
    n = subprocess.run("nvidia-smi -L", shell=True, capture_output=True, text=True).stdout.count("GPU ")
    gpus = [str(i) for i in range(n)] or ["cpu"]
    procs = []
    for i, g in enumerate(gpus):
        env = dict(os.environ, OMBRES_PART=str(i), OMBRES_NPARTS=str(len(gpus)),
                   CUDA_VISIBLE_DEVICES="" if g == "cpu" else g)
        log = open(f"{WORK}/part{i}.log", "w")
        procs.append((subprocess.Popen([sys.executable, os.path.abspath(sys.argv[0])], env=env, stdout=log,
                                       stderr=subprocess.STDOUT), log, i))
    for p, log, i in procs:
        p.wait()
        log.close()
        print(f"--- partie {i} : code {p.returncode} ---\n" + open(f"{WORK}/part{i}.log").read()[-5000:], flush=True)
    index = {}
    for f in glob.glob(f"{WORK}/index_p*.json"):
        index.update(json.load(open(f)))
    with tarfile.open(f"{WORK}/takes.tar", "w") as tar:
        for k in sorted(index):
            if os.path.exists(f"{TMP}/{k}.flac"):
                tar.add(f"{TMP}/{k}.flac", arcname=f"{k}.flac")
    json.dump(index, open(f"{WORK}/takes_index.json", "w"), ensure_ascii=False)
    missing = [r["key"] for r in reqs if r["key"] not in index]
    print(f"[fin] {len(index)} prises, {len(missing)} manquantes, {time.time()-T0:.0f}s", flush=True)
    sys.exit(0)

# ------------------------------------------------------------------ une partie (un GPU)
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from qwen_tts import Qwen3TTSModel  # noqa: E402

part, nparts = int(os.environ["OMBRES_PART"]), int(os.environ["OMBRES_NPARTS"])
dev = "cuda:0" if torch.cuda.is_available() else "cpu"
os.makedirs(TMP, exist_ok=True)
mine = [r for i, r in enumerate(reqs) if i % nparts == part and not os.path.exists(f"{TMP}/{r['key']}.flac")]
cfg = mine[0]["cfg"] if mine else None
assert all(r["cfg"] == cfg for r in mine), "une seule configuration de synthèse par kernel"
print(f"[p{part}] {len(mine)} prises sur {dev}", flush=True)
DT = {"float32": torch.float32, "float16": torch.float16, "bfloat16": torch.bfloat16}[cfg["dtype"]]
model = Qwen3TTSModel.from_pretrained(cfg["model"], device_map=dev, dtype=DT, attn_implementation="sdpa")
prompt = model.create_voice_clone_prompt(ref_audio=find(cfg["reference"]), ref_text=cfg["ref_text"])
# Décodage codec → audio par petits paquets : chaque prise est décodée avec les ~12 s de la référence devant elle,
# à 24 kHz ; un lot entier d'un coup ferait déborder la mémoire de la T4.
_tok = model.model.speech_tokenizer
_decode = _tok.decode


def _decode_small(encoded, n=4):
    if isinstance(encoded, list) and len(encoded) > n:
        wavs, fs = [], None
        for j in range(0, len(encoded), n):
            w, fs = _decode(encoded[j:j + n])
            wavs += list(w)
        return wavs, fs
    return _decode(encoded)


_tok.decode = _decode_small
print(f"[p{part}] modèle prêt {time.time()-T0:.0f}s", flush=True)
index, done_s, gen_s = {}, 0.0, 0.0
budget = float(CONF["BUDGET_MIN"]) * 60


def run_batch(batch):
    torch.manual_seed(int(batch[0]["key"][:8], 16))
    try:
        wavs, sr = model.generate_voice_clone(text=[r["text"] for r in batch], language=cfg["language"],
                                              voice_clone_prompt=prompt, max_new_tokens=cfg["max_new_tokens"])
        return list(zip(batch, wavs)), sr
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        if len(batch) == 1:
            raise
        h = len(batch) // 2
        a, sr = run_batch(batch[:h])
        b, _ = run_batch(batch[h:])
        return a + b, sr


B = int(CONF["BATCH"])
for j in range(0, len(mine), B):
    if time.time() - T0 > budget:
        print(f"[p{part}] budget atteint, arrêt", flush=True)
        break
    batch = mine[j:j + B]
    t = time.time()
    res, sr = run_batch(batch)
    dt = time.time() - t
    audio = 0.0
    for r, w in res:
        y = np.asarray(w, dtype=np.float32).reshape(-1)
        peak = float(np.abs(y).max()) if len(y) else 0.0
        if peak > 0.99:
            y = y / peak * 0.97
        sf.write(f"{TMP}/{r['key']}.flac", y, sr, subtype="PCM_16")
        index[r["key"]] = {k: r[k] for k in ("id", "lang", "text", "seed", "base")} | {
            "sr": sr, "audio_s": round(len(y) / sr, 3), "peak": round(peak, 3), "batch_s": round(dt, 2),
            "batch_n": len(batch), "hit_max": len(y) / sr >= cfg["max_new_tokens"] / 12.5 - 0.2}
        audio += len(y) / sr
    done_s += audio
    gen_s += dt
    json.dump(index, open(f"{WORK}/index_p{part}.json", "w"), ensure_ascii=False)
    print(f"[p{part}] {j + len(batch)}/{len(mine)} lot {len(batch)} : {audio:.0f}s d'audio en {dt:.1f}s "
          f"(RTF lot {dt / max(audio, 1e-6):.3f}) — {time.time()-T0:.0f}s", flush=True)
print(f"[p{part}] fin : {len(index)} prises, {done_s:.0f}s d'audio en {gen_s:.0f}s de calcul "
      f"(RTF {gen_s / max(done_s, 1e-6):.3f})", flush=True)
