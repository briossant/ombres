"""Contrôle de audio_analyze.py : mêmes répliques, clip propre (sans musique ni bruitages),
même fenêtre (0,3 s de silence avant) ; et le mixage avec une fenêtre ouverte 1,2 s plus tôt.
Si le clip propre est reconnu en entier et le mixage non, c'est le mixage qui masque.
  LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH tools/tts/.venv/bin/python tools/polish/firsttime/audio_control.py fr
"""
import json, sys, difflib, unicodedata, re
import numpy as np
import av
from faster_whisper import WhisperModel

lang = sys.argv[1] if len(sys.argv) > 1 else 'fr'
base = f'shots/polish/firsttime/audio/{lang}'
subs = [e for e in json.load(open(f'{base}-subs.json')) if e['kind'] == 'sub']
man = json.load(open('public/audio/narrator/manifest.json'))['lines']
sr = 16000

def decode(path):
    c = av.open(path)
    r = av.AudioResampler(format='fltp', layout='mono', rate=sr)
    out = []
    for f in c.decode(audio=0):
        for g in r.resample(f):
            out.append(g.to_ndarray()[0])
    return np.concatenate(out).astype(np.float32)

def norm(s):
    s = unicodedata.normalize('NFD', s.lower().replace('’', "'"))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z ]', ' ', s).split()

mix = decode(f'{base}-mix.webm')
model = WhisperModel('small', device='cpu', compute_type='int8')
def hear(a):
    segs, _ = model.transcribe(a, language=lang, beam_size=5, vad_filter=False, condition_on_previous_text=False)
    return ' '.join(s.text.strip() for s in segs)
def score(ref, hyp):
    return difflib.SequenceMatcher(None, norm(ref), norm(hyp)).ratio()

for e in subs:
    txt = e['text'].replace(' ,', ',')
    clip = next((l for l in man if l['lang'] == lang and norm(l['text']) == norm(txt)), None)
    clean = ''
    if clip:
        a = decode(f'public/audio/narrator/{clip["file"]}')
        a = np.concatenate([np.zeros(int(0.3 * sr), np.float32), a, np.zeros(int(0.8 * sr), np.float32)])
        clean = hear(a)
    t0 = max(0, e['t'] - 1.5)
    early = hear(mix[int(t0 * sr):int((e['t'] + 3.8) * sr)])
    print(f'{e["t"]:6.1f} s « {txt} »  [{clip["id"] if clip else "?"}]')
    print(f'     clip propre ({score(txt, clean):.2f}) : « {clean} »')
    print(f'     mixage -1,5 s ({score(txt, early):.2f}) : « {early} »')
