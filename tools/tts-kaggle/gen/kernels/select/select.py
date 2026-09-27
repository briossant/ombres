# Ombres — lot FR du narrateur : tri des prises Qwen3-TTS par tools/tts/gen.py lui-même (kernel CPU, sans quota).
# gen.py relit les prises brutes du kernel ombres-tts-gen-synth (qwen3_engine.ReplayEngine) et applique les
# réglages du lot (tools/tts/narrator.sh) : 4 prises, rognage, pauses ≤ 420 ms, atempo du preset, UTMOS22,
# MP3 24 kHz ABR 48 kb/s + présence +2 dB, −16 LUFS, Whisper small P (amorce des couleurs) + N (sans) + C (fond
# réel du jeu, asr-bed.ogg), mots-clés = nom de couleur, refus au-delà de 3,0 s parlées.
# Tours, pour les seules répliques encore refusées : graines 1000 (tempo 1,2) → graines 2000 (1,2) →
# graines 1000 puis 2000 à 1,3 (répliques trop longues). Tranche : OMBRES_SHARD « i/n » (en tête du fichier).
# Sortie : select.zip (prises retenues en FLAC 24 bits + notes = cache de gen.py, MP3, manifests, journal)
# et final_lines.json (graine et preset retenus par réplique : l'entrée de la ré-encodage local).
import glob, json, os, shutil, subprocess, sys, tarfile, time, types, zipfile

T0 = time.time()
SHARD = os.environ.get("OMBRES_SHARD", "0/1")
ROUNDS = json.loads(os.environ.get("OMBRES_ROUNDS", '[[1000,"narrator_qwen3"],[2000,"narrator_qwen3"],'
                                   '[1000,"narrator_qwen3_t13"],[2000,"narrator_qwen3_t13"]]'))
WORK, TAKES = "/kaggle/working", "/kaggle/tmp/takes"
ARGS = ["--takes", "4", "--asr", "--sample-rate", "24000", "--bitrate", "48k", "--abr", "--presence-db", "2",
        "--presence-hz", "3000", "--max-pause-ms", "420", "--tail-ms", "100", "--max-speech-s", "3.0",
        "--asr-bed-snr", "6", "--asr-strict"]


def sh(c):
    print(">>", c, flush=True)
    return subprocess.run(c, shell=True, check=False)


def find(name):
    c = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    assert c, f"{name} introuvable"
    return c[0]


if "OMBRES_CHILD" in os.environ:  # un tour de gen.py (processus séparé : argv propre)
    sys.path.insert(0, os.path.dirname(find("qwen3_engine.py")))
    import gen
    import qwen3_engine as Q
    gen.ENGINES["qwen3"] = Q.ReplayEngine
    sys.argv = ["gen.py"] + sys.argv[1:]
    sys.exit(gen.main())

sh(f"{sys.executable} -m pip install -q faster-whisper 2>&1 | tail -2")
if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
    sh("(apt-get update -qq && apt-get install -y -qq ffmpeg) > /dev/null 2>&1")
if not shutil.which("ffprobe"):
    sh(f"{sys.executable} -m pip install -q static-ffmpeg 2>&1 | tail -1")
    sh("static_ffmpeg_paths")
    import static_ffmpeg
    static_ffmpeg.add_paths()
sh("ffmpeg -version | head -1")
os.makedirs(TAKES, exist_ok=True)
for t in glob.glob("/kaggle/input/**/takes*.tar", recursive=True):
    tarfile.open(t).extractall(TAKES)
if not os.listdir(TAKES):  # sortie de kernel déjà décompressée par Kaggle
    for f in glob.glob("/kaggle/input/**/*.flac", recursive=True):
        os.symlink(f, os.path.join(TAKES, os.path.basename(f)))
print(f"[prises] {len(os.listdir(TAKES))} — {time.time()-T0:.0f}s", flush=True)
# le code de SpeechMOS est téléchargé une fois ici (torch.hub)
import torch  # noqa: E402
torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)

DATA = os.path.dirname(find("qwen3_engine.py"))
sys.path.insert(0, DATA)
import gen  # noqa: E402
from pathlib import Path  # noqa: E402

lines = gen.load_lines(Path(find("lines.fr-qwen3.json")))
i, n = (int(x) for x in SHARD.split("/"))
mine = [ln for k, ln in enumerate(lines) if k % n == i]
if os.environ.get("OMBRES_ONLY"):  # reprise de quelques répliques (après retouche de leur graphie)
    mine = [ln for ln in lines if ln["id"] in os.environ["OMBRES_ONLY"].split(",")]
if int(os.environ.get("OMBRES_LIMIT", "0")):  # essai à blanc sur quelques répliques
    mine = mine[: int(os.environ["OMBRES_LIMIT"])]
todo = {ln["id"] for ln in mine}
final = {ln["id"]: dict(ln) for ln in mine}
status = {}
env = dict(os.environ, OMBRES_CHILD="1", OMBRES_TAKES_DIR=TAKES, OMP_NUM_THREADS="4")
for r, (base, voice) in enumerate(ROUNDS):
    if not todo:
        break
    rl = [{**ln, "seed": base, "voice": voice} if ln["id"] in todo else ln for ln in mine]
    lf = f"{WORK}/lines.r{r}.json"
    json.dump(rl, open(lf, "w"), ensure_ascii=False)
    man = f"{WORK}/manifest.r{r}.json"
    t = time.time()
    p = subprocess.run([sys.executable, os.path.abspath(sys.argv[0]), lf, "--out", f"{WORK}/out", "--voices",
                        find("voices.qwen3.json"), "--cache", f"{WORK}/cache", "--manifest", man,
                        "--asr-bed", find("asr-bed.ogg"), "--only", ",".join(sorted(todo)), *ARGS],
                       env=env, capture_output=True, text=True)
    open(f"{WORK}/gen.r{r}.log", "w").write(p.stdout + p.stderr)
    print(f"[tour {r}] graines {base}, {voice} : {len(todo)} répliques, code {p.returncode}, {time.time()-t:.0f}s\n"
          + (p.stderr[-3000:] if p.returncode else "\n".join(p.stderr.splitlines()[-3:])), flush=True)
    entries = {e["id"]: e for e in json.load(open(man))["lines"]} if os.path.exists(man) else {}
    for lid in sorted(todo):
        e = entries.get(lid)
        if not e:
            continue
        if e.get("asr_ok") or lid not in status:
            status[lid] = {"round": r, **e}
            final[lid] = {**final[lid], "seed": base, "voice": voice}
    todo = {lid for lid in todo if not (entries.get(lid) or {}).get("asr_ok")}
    print(f"[tour {r}] restent {len(todo)} : {sorted(todo)}", flush=True)

# Prises retenues : clé de cache de gen.py (réglages identiques à ARGS), en FLAC 24 bits (+ notes JSON).
import soundfile as sf  # noqa: E402
a = types.SimpleNamespace(pause_ms=500, max_pause_ms=420, takes=4, asr="small", max_cer=0.12)
presets = json.load(open(find("voices.qwen3.json")))["presets"]
fl = [final[ln["id"]] for ln in mine]
with zipfile.ZipFile(f"{WORK}/select.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for ln in fl:
        say = (ln.get("say") or ln["text"]).strip()
        vcfg = presets[ln["voice"]][ln["lang"]]
        key = gen.synth_key_of(ln, say, ln["lang"], vcfg, int(ln["seed"]), a)
        src = f"{WORK}/cache/{key}"
        if not os.path.exists(src + ".wav"):
            print("  prise en cache absente :", ln["id"], flush=True)
            continue
        y, sr = sf.read(src + ".wav", dtype="float32")
        sf.write(f"/kaggle/tmp/{key}.flac", y, sr, subtype="PCM_24")
        z.write(f"/kaggle/tmp/{key}.flac", f"cache/{key}.flac")
        z.write(src + ".json", f"cache/{key}.json")
        mp3 = f"{WORK}/out/{ln['lang']}/{ln['id']}.mp3"
        if os.path.exists(mp3):
            z.write(mp3, f"mp3/{ln['lang']}/{ln['id']}.mp3")
    for f in glob.glob(f"{WORK}/manifest.r*.json") + glob.glob(f"{WORK}/gen.r*.log"):
        z.write(f, "logs/" + os.path.basename(f))
json.dump(fl, open(f"{WORK}/final_lines.json", "w"), ensure_ascii=False, indent=0)
json.dump(status, open(f"{WORK}/status.json", "w"), ensure_ascii=False, indent=0)
shutil.rmtree(f"{WORK}/out", ignore_errors=True)
shutil.rmtree(f"{WORK}/cache", ignore_errors=True)
for f in glob.glob(f"{WORK}/manifest.r*.json") + glob.glob(f"{WORK}/gen.r*.log") + glob.glob(f"{WORK}/lines.r*.json"):
    os.remove(f)
ok = sum(1 for s in status.values() if s.get("asr_ok"))
print(f"[fin] tranche {SHARD} : {ok}/{len(mine)} répliques valides, refus : {sorted(todo)} — {time.time()-T0:.0f}s",
      flush=True)
