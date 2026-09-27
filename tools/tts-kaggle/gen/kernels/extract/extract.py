# Ombres — extrait des sorties de ombres-tts-gen-synth(-fix) les prises brutes de quelques répliques (OMBRES_ONLY),
# pour les re-trier en local quand la vérification locale (Whisper small sur les MP3 ré-encodés sur la machine de
# dev) refuse une prise que le tri sur Kaggle avait acceptée. Kernel CPU, sans quota. Sortie : subset.tar + index.
import glob, json, os, tarfile

ONLY = set(os.environ["OMBRES_ONLY"].split(","))
index, keep = {}, {}
for f in glob.glob("/kaggle/input/**/takes_index.json", recursive=True):
    for k, v in json.load(open(f)).items():
        if v["id"] in ONLY:
            index[k] = v
            keep[k + ".flac"] = os.path.dirname(f)
n = 0
with tarfile.open("/kaggle/working/subset.tar", "w") as out:
    for d in set(keep.values()):
        for t in glob.glob(f"{d}/takes*.tar"):
            with tarfile.open(t) as tar:
                for m in tar:
                    if m.name in keep and keep[m.name] == d:
                        out.addfile(m, tar.extractfile(m))
                        n += 1
json.dump(index, open("/kaggle/working/subset_index.json", "w"), ensure_ascii=False)
print(f"{n} prises pour {len(ONLY)} répliques", flush=True)
