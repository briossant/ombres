"""Écoute instrumentée du mixage enregistré (audiorec.mjs) : niveaux par écran/phase, crêtes,
et intelligibilité du narrateur DANS le mixage (Whisper small, comparé au sous-titre affiché).
  LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH tools/tts/.venv/bin/python tools/polish/firsttime/audio_analyze.py fr
"""
import json
import sys
import difflib
import unicodedata
import re
import numpy as np
import av

lang = sys.argv[1] if len(sys.argv) > 1 else 'fr'
base = f'shots/polish/firsttime/audio/{lang}'
subs = json.load(open(f'{base}-subs.json'))

# ─── décodage ───
cont = av.open(f'{base}-mix.webm')
res = av.AudioResampler(format='fltp', layout='stereo', rate=16000)
chunks = []
for frame in cont.decode(audio=0):
    for f in res.resample(frame):
        chunks.append(f.to_ndarray())
x = np.concatenate(chunks, axis=1)  # (2, n)
sr = 16000
mono = x.mean(axis=0)
dur = mono.size / sr
print(f'durée {dur:.1f} s, crête {20*np.log10(np.abs(x).max()+1e-9):.1f} dBFS')

# ─── niveaux (RMS glissant 400 ms, dBFS) par segment ───
def rms_db(a):
    return 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)

marks = [(e['t'], e['text']) for e in subs if e['kind'] in ('screen', 'phase')]
marks.append((dur, 'fin'))
print('\nNiveau moyen par segment (RMS dBFS, ≈ sonie relative) :')
for (t0, name), (t1, _) in zip(marks, marks[1:]):
    if t1 - t0 < 0.5:
        continue
    seg = mono[int(t0 * sr):int(t1 * sr)]
    win = int(0.4 * sr)
    loud = [rms_db(seg[i:i + win]) for i in range(0, max(1, seg.size - win), win)]
    print(f'  {t0:6.1f}-{t1:6.1f} s  {name:14s} moy {rms_db(seg):6.1f}  p10 {np.percentile(loud,10):6.1f}  p90 {np.percentile(loud,90):6.1f}')

# ─── narrateur : transcription du mixage autour de chaque sous-titre ───
from faster_whisper import WhisperModel
model = WhisperModel('small', device='cpu', compute_type='int8')

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z ]', ' ', s).split()

print('\nNarrateur dans le mixage (Whisper small sur 4 s après l’apparition du sous-titre) :')
ok = 0
lines = [e for e in subs if e['kind'] == 'sub']
for e in lines:
    t0 = max(0, e['t'] - 0.3)
    seg = mono[int(t0 * sr):int((t0 + 4.2) * sr)].astype(np.float32)
    # voix seule ? on mesure aussi le niveau du segment
    segs, _ = model.transcribe(seg, language=lang, beam_size=5, vad_filter=False, condition_on_previous_text=False)
    heard = ' '.join(s.text.strip() for s in segs)
    ref = norm(e['text'])
    hyp = norm(heard)
    ratio = difflib.SequenceMatcher(None, ref, hyp).ratio()
    ok += ratio >= 0.7
    print(f'  {e["t"]:6.1f} s  {ratio:4.2f}  attendu « {e["text"]} »\n                entendu « {heard} »')
print(f'\n{ok}/{len(lines)} répliques reconnues (ratio ≥ 0,7) dans le mixage')
