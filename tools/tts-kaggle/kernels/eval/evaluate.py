# Ombres — banc TTS : évaluation objective de toutes les prises (sur GPU Kaggle).
# Entrées : sorties des kernels de génération (wav/<système>/<id>.t<k>.wav, gen_<système>.json, refs/)
#           + dataset ombres-tts-bench-data (corpus, benchlib, clips Pocket actuels pocket_lot/).
# Par prise, après le traitement du lot (rognage des bords, pauses internes ≤ 420 ms) :
#   CER Whisper large-v3 avec l'amorce des noms de couleur (P) et sans (N), mots-clés entendus ;
#   probabilité de la langue attendue (détection libre de Whisper : proxy d'accent) ;
#   UTMOS22-strong, UTMOSv2, DNSMOS (P.835 : SIG/BAK/OVRL, P.808) ; durée parlée, pause max ;
#   débit (syllabes/s, lettres/s) ; F0 médiane ; embedding locuteur WavLM-SV (stabilité, FR↔EN, référence).
# Sorties : metrics_clips.json, metrics_systems.json, summary.md, samples/*.mp3.
import glob, json, os, subprocess, sys, time

T0 = time.time()
WORK = os.environ.get("OMBRES_WORK", "/kaggle/working")
INP = os.environ.get("OMBRES_INPUT", "/kaggle/input")
TEST = bool(os.environ.get("OMBRES_TEST"))  # essai local sur CPU : Whisper small, sans UTMOSv2/DNSMOS/WavLM


def sh(c):
    print(">>", c, flush=True)
    subprocess.run(c, shell=True, check=False)


if "OMBRES_LD" not in os.environ and not TEST and "--merge" not in sys.argv:
    sh("pip install -q faster-whisper pyloudnorm onnxruntime 2>&1 | tail -2")
    sh("pip install -q git+https://github.com/sarulab-speech/UTMOSv2.git 2>&1 | tail -2")
    import importlib.util
    libs = []
    for m in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            spec = importlib.util.find_spec(m)
        except ModuleNotFoundError:  # image CPU sans bibliothèques CUDA
            spec = None
        if spec:
            libs += [os.path.join(p, "lib") for p in spec.submodule_search_locations]
    env = dict(os.environ, OMBRES_LD="1", LD_LIBRARY_PATH=":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")]))
    print(f"[install] {time.time()-T0:.0f}s", flush=True)
    sys.exit(subprocess.run([sys.executable, os.path.abspath(sys.argv[0])], env=env).returncode)

sys.path.insert(0, os.path.dirname(glob.glob(f"{INP}/**/benchlib.py", recursive=True)[0]))
import benchlib as B  # noqa: E402
import numpy as np  # noqa: E402

corpus = {e["id"]: e for e in json.load(open(glob.glob(f"{INP}/**/corpus.json", recursive=True)[0]))}


# ------------------------------------------------------------------ inventaire des prises
def inventory():
    """Toutes les prises des kernels de génération montés en entrée (+ les clips du lot Pocket actuel).
    OMBRES_SYSTEMS (préfixes séparés par des virgules) restreint aux systèmes voulus (évaluation en tranches)."""
    keep = [p for p in os.environ.get("OMBRES_SYSTEMS", "").split(",") if p]
    items = [it for it in _inventory() if not keep or any(it["system"].startswith(p) for p in keep)]
    return items


def _inventory():
    items = []
    for gj in sorted(glob.glob(f"{INP}/**/gen_*.json", recursive=True)):
        g = json.load(open(gj))
        base = os.path.dirname(gj)
        for c in g["clips"]:
            if "error" in c:
                continue
            p = os.path.join(base, "wav", g["system"], f"{c['id']}.t{c['take']}.wav")
            if os.path.exists(p) and c["id"] in corpus:
                items.append({"system": g["system"], "id": c["id"], "lang": c["lang"], "take": c["take"], "path": p,
                              "text": c["text"], "gen_s": c["gen_s"], "raw_s": c["audio_s"], "clipped": c["clipped"]})
    # clips du lot actuel (Pocket, prise retenue après tri UTMOS + ASR)
    for e in corpus.values():
        c = glob.glob(f"{INP}/**/pocket_lot/{e['lang']}/{e['lot_id']}.mp3", recursive=True)
        if c:
            items.append({"system": "pocket-lot", "id": e["id"], "lang": e["lang"], "take": 0, "path": c[0],
                          "text": e["pocket_text"], "gen_s": None, "raw_s": None, "clipped": 0})
    return items


def keywords_for(it):
    e = corpus[it["id"]]
    if it["system"] == "pocket-lot" and e["lot_id"] == "greatShadow1" and e["lang"] == "fr":
        return ["glace"]  # le lot dit « Elle glace tout »
    return e["keywords"]


def load16(path):
    import librosa
    y, sr = librosa.load(path, sr=None, mono=True)
    return y.astype(np.float32), sr


# ------------------------------------------------------------------ mesure (une partie = un GPU)
def measure(items, part):
    import librosa
    try:
        import pyloudnorm as pyln
    except ImportError:  # essai local : normalisation RMS
        pyln = None
    import soundfile as sf
    import torch
    from faster_whisper import WhisperModel

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    asr = WhisperModel(os.environ.get("OMBRES_ASR", "small" if TEST else "large-v3"), device=dev,
                       compute_type="float16" if dev == "cuda" else "int8",
                       cpu_threads=os.cpu_count() or 4)
    utmos = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True).eval().to(dev)
    try:
        if TEST:
            raise RuntimeError("mode test")
        import utmosv2
        u2 = utmosv2.create_model(pretrained=True)
    except Exception as e:  # noqa: BLE001
        print("UTMOSv2 indisponible :", repr(e)[:300], flush=True)
        u2 = None
    try:
        if TEST:
            raise RuntimeError("mode test")
        from torchmetrics.functional.audio.dnsmos import deep_noise_suppression_mean_opinion_score as dnsmos
    except Exception as e:  # noqa: BLE001
        print("DNSMOS indisponible :", e, flush=True)
        dnsmos = None
    if not TEST:
        from transformers import AutoFeatureExtractor, WavLMForXVector
        fe = AutoFeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
        sv = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv").eval().to(dev)
    meter = pyln.Meter(16000) if pyln else None
    os.makedirs(f"{WORK}/tmp", exist_ok=True)

    def transcribe(y, lang, prompt):
        segs, info = asr.transcribe(y, language=lang, beam_size=5, temperature=0.0, without_timestamps=True,
                                    condition_on_previous_text=False, initial_prompt=prompt or None)
        return " ".join(s.text.strip() for s in segs).strip()

    def emb(y):
        if TEST:
            v = np.random.default_rng(len(y)).normal(size=512)
            return (v / np.linalg.norm(v)).round(5).tolist()
        x = fe(y, sampling_rate=16000, return_tensors="pt")
        with torch.no_grad():
            e = sv(**{k: v.to(dev) for k, v in x.items()}).embeddings[0]
        e = torch.nn.functional.normalize(e, dim=-1)
        return e.cpu().numpy().round(5).tolist()

    out = []
    for n, it in enumerate(items):
        e = corpus[it["id"]]
        lang = it["lang"]
        y, sr = load16(it["path"])
        ys = B.ship_like(y, sr)  # ce que le lot garderait
        st = B.speech_stats(ys, sr)
        y16 = librosa.resample(ys, orig_sr=sr, target_sr=16000) if sr != 16000 else ys
        try:
            y16n = pyln.normalize.loudness(y16, meter.integrated_loudness(y16), -20.0)
        except Exception:  # noqa: BLE001
            y16n = y16 * (0.1 / max(1e-4, float(np.sqrt(np.mean(y16 ** 2)))))
        y16n = (y16n / max(1.0, float(np.abs(y16n).max()) / 0.98)).astype(np.float32)
        hp = transcribe(y16n, lang, e.get("asr_prompt"))
        hn = transcribe(y16n, lang, None) if not os.environ.get("OMBRES_SKIP_N") else ""
        try:  # détection seule (un passage d'encodeur, sans décodage)
            _, _, all_probs = asr.detect_language(y16n)
            probs = dict(all_probs or [])
        except Exception:  # noqa: BLE001  (anciennes versions de faster-whisper)
            _, info = asr.transcribe(y16n, beam_size=1, without_timestamps=True)
            probs = dict(info.all_language_probs or [])
        r = {k: it[k] for k in ("system", "id", "lang", "take", "gen_s", "raw_s", "clipped")}
        r.update({
            "text": it["text"], "asr_p": hp, "asr_n": hn,
            "cer_p": round(B.cer(it["text"], hp, lang), 3), "cer_n": round(B.cer(it["text"], hn, lang), 3),
            "kw_miss_p": B.keywords_missing(keywords_for(it), hp, lang),
            "kw_miss_n": B.keywords_missing(keywords_for(it), hn, lang),
            "lang_det": max(probs, key=probs.get) if probs else None, "lang_p": round(float(probs.get(lang, 0.0)), 3),
            "dur_s": round(len(ys) / sr, 3), **st,
            "syl_s": round(B.syllables(it["text"], lang) / max(st["speech_s"], 0.3), 2),
            "let_s": round(B.letters(it["text"]) / max(st["speech_s"], 0.3), 2),
        })
        with torch.no_grad():
            r["utmos"] = round(float(utmos(torch.from_numpy(y16n).unsqueeze(0).to(dev), 16000).item()), 3)
        if u2 is not None:
            try:
                m2 = u2.predict(data=y16n, sr=16000)
                r["utmosv2"] = round(float(np.asarray(m2.cpu() if hasattr(m2, "cpu") else m2).reshape(-1)[0]), 3)
            except Exception as ex:  # noqa: BLE001
                r["utmosv2_err"] = repr(ex)[:120]
        if dnsmos is not None:
            try:
                d = dnsmos(torch.from_numpy(y16n), 16000, False).cpu().numpy().tolist()
                r["dns_p808"], r["dns_sig"], r["dns_bak"], r["dns_ovrl"] = [round(float(v), 3) for v in d]
            except Exception as ex:  # noqa: BLE001
                r["dns_err"] = repr(ex)[:120]
        f0 = librosa.yin(y16, fmin=60, fmax=400, sr=16000, frame_length=1024, hop_length=256)
        rms = librosa.feature.rms(y=y16, frame_length=1024, hop_length=256)[0][: len(f0)]
        v = f0[: len(rms)][rms > rms.max() * 0.05]
        r["f0"] = round(float(np.median(v)), 1) if len(v) else None
        r["emb"] = emb(y16)
        out.append(r)
        if n % 25 == 0:
            print(f"[p{part}] {n}/{len(items)} {r['system']} {r['id']} cer {r['cer_p']} utmos {r['utmos']} "
                  f"u2 {r.get('utmosv2')} dns {r.get('dns_ovrl')} « {hp} » {time.time()-T0:.0f}s", flush=True)
    return out


def ref_embeddings():
    """Embeddings des références de clonage (dataset + références conçues par les kernels)."""
    if TEST:
        return {}
    import librosa
    import torch
    from transformers import AutoFeatureExtractor, WavLMForXVector
    fe = AutoFeatureExtractor.from_pretrained("microsoft/wavlm-base-plus-sv")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    sv = WavLMForXVector.from_pretrained("microsoft/wavlm-base-plus-sv").eval().to(dev)
    res = {}
    for p in glob.glob(f"{INP}/**/refs/*.wav", recursive=True):
        y, _ = librosa.load(p, sr=16000, mono=True)
        x = fe(y[: 16000 * 15], sampling_rate=16000, return_tensors="pt")
        with torch.no_grad():
            e = sv(**{k: v.to(dev) for k, v in x.items()}).embeddings[0]
        res[os.path.splitext(os.path.basename(p))[0]] = torch.nn.functional.normalize(e, dim=-1).cpu().numpy()
    return res


# ------------------------------------------------------------------ agrégats
def aggregate(clips, refemb):
    import collections
    gens = {}
    for gj in glob.glob(f"{INP}/**/gen_*.json", recursive=True):
        g = json.load(open(gj))
        gens[g["system"]] = g
    by = collections.defaultdict(list)
    for c in clips:
        by[c["system"]].append(c)

    def ok(c, cond="p"):
        return c[f"cer_{cond}"] <= 0.12 and not c[f"kw_miss_{cond}"]

    def mean(v):
        v = [x for x in v if x is not None]
        return round(float(np.mean(v)), 3) if v else None

    systems = {}
    for s, cs in sorted(by.items()):
        row = {"system": s, "rtf": gens.get(s, {}).get("rtf"), "voices": gens.get(s, {}).get("voices")}
        E = {}
        for lang in ("fr", "en"):
            L = [c for c in cs if c["lang"] == lang]
            if not L:
                continue
            emb = np.array([c["emb"] for c in L])
            E[lang] = emb
            sim = emb @ emb.T
            iu = np.triu_indices(len(L), 1)
            # sélection du lot simulée : par réplique, la prise qui passe l'ASR (P) avec le meilleur UTMOS
            sel = []
            for lid in sorted({c["id"] for c in L}):
                takes = [c for c in L if c["id"] == lid]
                good = [c for c in takes if ok(c)]
                pool = good or takes
                sel.append((bool(good), max(pool, key=lambda c: c["utmos"])))
            row[lang] = {
                "n": len(L), "lines": len({c["id"] for c in L}),
                "cer_p": mean([c["cer_p"] for c in L]), "cer_n": mean([c["cer_n"] for c in L]),
                "ok_p": round(np.mean([ok(c) for c in L]), 3), "ok_n": round(np.mean([ok(c, "n") for c in L]), 3),
                "kw_ok_p": round(np.mean([not c["kw_miss_p"] for c in L]), 3),
                "lang_p": mean([c["lang_p"] for c in L]),
                "utmos": mean([c["utmos"] for c in L]), "utmos_sd": round(float(np.std([c["utmos"] for c in L])), 3),
                "utmosv2": mean([c.get("utmosv2") for c in L]),
                "dns_ovrl": mean([c.get("dns_ovrl") for c in L]), "dns_sig": mean([c.get("dns_sig") for c in L]),
                "dns_bak": mean([c.get("dns_bak") for c in L]), "dns_p808": mean([c.get("dns_p808") for c in L]),
                "speech_s": mean([c["speech_s"] for c in L]), "speech_max": round(max(c["speech_s"] for c in L), 2),
                "le3s": round(np.mean([c["speech_s"] <= 3.0 for c in L]), 3),
                "max_pause": mean([c["max_pause_s"] for c in L]),
                "syl_s": mean([c["syl_s"] for c in L]), "let_s": mean([c["let_s"] for c in L]),
                "f0": round(float(np.median([c["f0"] for c in L if c["f0"]])), 1),
                "spk_consist": round(float(sim[iu].mean()), 3) if len(iu[0]) else None,
                "spk_min": round(float(sim[iu].min()), 3) if len(iu[0]) else None,
                "best3_lines_ok": round(np.mean([g for g, _ in sel]), 3),
                "best3_utmos": mean([c["utmos"] for _, c in sel]),
                "best3_utmosv2": mean([c.get("utmosv2") for _, c in sel]),
                "fails": [f"{c['id']}.t{c['take']}: « {c['asr_p']} »" for c in L if not ok(c)][:12],
            }
        if "fr" in E and "en" in E:
            cf, ce = E["fr"].mean(0), E["en"].mean(0)
            row["fr_en_sim"] = round(float(cf @ ce / np.linalg.norm(cf) / np.linalg.norm(ce)), 3)
        # similarité à la référence clonée : « <modèle>-<réf>[-variante] » ; « design » = référence conçue
        parts = s.split("-")
        rname = "bill" if parts[0] == "pocket" else (f"{parts[0]}_design" if parts[1] == "design" else parts[1])
        if rname in refemb and E:
            allE = np.concatenate([E[k] for k in E])
            row["ref_sim"] = round(float((allE @ refemb[rname]).mean()), 3)
            row["ref"] = rname
        systems[s] = row
    return systems


def fmt(v, d=2):
    return "—" if v is None else (f"{v:.{d}f}" if isinstance(v, float) else str(v))


def summary_md(systems):
    rows = []
    for lang in ("fr", "en"):
        rows.append(f"\n### {lang.upper()}\n")
        rows.append("| système | prises | CER P | OK P | OK N | mots-clés | p(langue) | UTMOS | UTMOSv2 | DNSMOS | "
                    "parole moy/max (s) | ≤3 s | syll/s | F0 | cohérence locuteur | best-of-3 OK | best-of-3 UTMOS | RTF |")
        rows.append("|" + "---|" * 18)
        for s, r in sorted(systems.items(), key=lambda kv: -((kv[1].get(lang) or {}).get("best3_utmos") or 0)):
            x = r.get(lang)
            if not x:
                continue
            rows.append(f"| {s} | {x['n']} | {fmt(x['cer_p'],3)} | {fmt(x['ok_p'])} | {fmt(x['ok_n'])} | {fmt(x['kw_ok_p'])} | "
                        f"{fmt(x['lang_p'])} | {fmt(x['utmos'])}±{fmt(x['utmos_sd'])} | {fmt(x['utmosv2'])} | {fmt(x['dns_ovrl'])} | "
                        f"{fmt(x['speech_s'])}/{fmt(x['speech_max'])} | {fmt(x['le3s'])} | {fmt(x['syl_s'])} | {fmt(x['f0'],0)} | "
                        f"{fmt(x['spk_consist'])} | {fmt(x['best3_lines_ok'])} | {fmt(x['best3_utmos'])} | {fmt(r['rtf'])} |")
    rows.append("\n### Voix\n\n| système | FR↔EN (cos) | sim. référence |\n|---|---|---|")
    for s, r in sorted(systems.items()):
        rows.append(f"| {s} | {fmt(r.get('fr_en_sim'),3)} | {fmt(r.get('ref_sim'),3)} ({r.get('ref','')}) |")
    rows.append("\n### Échecs ASR (P)\n")
    for s, r in sorted(systems.items()):
        for lang in ("fr", "en"):
            f = (r.get(lang) or {}).get("fails")
            if f:
                rows.append(f"- **{s} {lang}** : " + " ; ".join(f))
    return "\n".join(rows)


def samples(clips):
    """Quelques MP3 par système (meilleure prise selon ASR puis UTMOS) pour l'écoute humaine."""
    os.makedirs(f"{WORK}/samples", exist_ok=True)
    pick = ["fr.golden1", "fr.greatShadow1", "fr.bigSteal.5", "fr.dodge.8", "en.tenSeconds2", "en.leaderChange1.4",
            "en.dodge.3"]
    items = {(it["system"], it["id"], it["take"]): it["path"] for it in inventory()}
    for s in sorted({c["system"] for c in clips}):
        for lid in pick:
            takes = [c for c in clips if c["system"] == s and c["id"] == lid]
            if not takes:
                continue
            best = max(takes, key=lambda c: (c["cer_p"] <= 0.12 and not c["kw_miss_p"], c["utmos"]))
            src = items[(s, lid, best["take"])]
            dst = f"{WORK}/samples/{s}__{lid}.mp3"
            try:
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af",
                                "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5",
                                "-ac", "1", "-ar", "24000", "-b:a", "48k", dst])
            except FileNotFoundError:
                print("ffmpeg absent : pas d'échantillons MP3", flush=True)
                return


def finish(clips, refemb):
    """Agrégats, résumé, échantillons MP3 (sur Kaggle, ou en local avec --merge)."""
    systems = aggregate(clips, refemb)
    json.dump([{k: v for k, v in c.items() if k != "emb"} for c in clips],
              open(f"{WORK}/metrics_clips.json", "w"), ensure_ascii=False, indent=0)
    json.dump(systems, open(f"{WORK}/metrics_systems.json", "w"), ensure_ascii=False, indent=1)
    md = summary_md(systems)
    open(f"{WORK}/summary.md", "w").write(md)
    print(md, flush=True)
    return systems


# SHARD = "i/n" : kernel CPU qui ne mesure qu'une tranche des prises (la file T4 étant saturée, l'évaluation
# peut tourner en n kernels CPU parallèles ; fusion locale : OMBRES_INPUT=<sorties> evaluate.py --merge).
SHARD = os.environ.get("OMBRES_SHARD", "")

if __name__ == "__main__":
    if "--merge" in sys.argv:
        clips = []
        for f in sorted(glob.glob(f"{INP}/**/metrics_shard*.json", recursive=True)):
            clips += json.load(open(f))
        refemb = {}
        for f in glob.glob(f"{INP}/**/refemb.json", recursive=True):
            refemb.update({k: np.array(v) for k, v in json.load(open(f)).items()})
        finish(clips, refemb)
        sys.exit(0)
    items = inventory()
    print(len(items), "prises ;", sorted({i["system"] for i in items}), flush=True)
    if SHARD:
        i, n = (int(x) for x in SHARD.split("/"))
        res = measure(items[i::n], i)
        json.dump(res, open(f"{WORK}/metrics_shard{i}.json", "w"), ensure_ascii=False)
        if i == 0:
            json.dump({k: v.tolist() for k, v in ref_embeddings().items()}, open(f"{WORK}/refemb.json", "w"))
        print(f"[fin] {time.time()-T0:.0f}s", flush=True)
        sys.exit(0)
    if "OMBRES_PART" in os.environ:
        p = int(os.environ["OMBRES_PART"])
        res = measure(items[p::int(os.environ.get("OMBRES_NP", "2"))], p)
        json.dump(res, open(f"{WORK}/metrics_part{p}.json", "w"), ensure_ascii=False)
        sys.exit(0)
    procs = []
    n = 1 if TEST else 2
    for i in range(n):
        env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(i), OMBRES_PART=str(i), OMBRES_NP=str(n))
        procs.append(subprocess.Popen([sys.executable, os.path.abspath(sys.argv[0])], env=env))
    for pr in procs:
        pr.wait()
    clips = []
    for i in range(n):
        clips += json.load(open(f"{WORK}/metrics_part{i}.json"))
    finish(clips, ref_embeddings())
    samples(clips)
    for f in glob.glob(f"{WORK}/metrics_part*.json") + glob.glob(f"{WORK}/tmp/*"):
        os.remove(f)
    print(f"[fin] {time.time()-T0:.0f}s", flush=True)
