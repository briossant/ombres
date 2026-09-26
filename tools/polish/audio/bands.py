#!/usr/bin/env python3
"""Rapport voix / reste par bande d'octave pendant les répliques (là où la voix parle).
  python3 tools/polish/audio/bands.py <dossier> <nom>
Donne, par bande (125 Hz … 8 kHz), la médiane et le 10e centile du rapport voix / (musique +
ambiance + bruitages + réverbe + interface) sur les blocs de 50 ms où la voix est active, et
la part de chaque stem dans le « reste » de cette bande : qui masque la parole, et où.
"""
import json, os, sys
import numpy as np
import soundfile as sf
from scipy import signal
sys.path.insert(0, os.path.dirname(__file__))
from timemap import make_ts
DIR, NAME = sys.argv[1], sys.argv[2]
WAV = os.path.join(DIR, f'{NAME}.wav')
meta = json.load(open(os.path.join(DIR, f'{NAME}.events.json')))
an = json.load(open(os.path.join(DIR, f'{NAME}.analysis.json')))
SR = meta['sr']
BANDS = [125, 250, 500, 1000, 2000, 4000, 8000]
sos = [signal.butter(4, [f / np.sqrt(2), min(f * np.sqrt(2), SR / 2 - 100)], btype='bandpass', fs=SR, output='sos') for f in BANDS]
stems = ['voice', 'music', 'amb', 'sfx', 'verb', 'ui']
H = SR // 20
res = {f: [] for f in BANDS}
share = {f: np.zeros(5) for f in BANDS}
per_line = []
for l in an['lines']:
    a, b = l['t'], l['t'] + l['clip_s'] + 0.2
    x, _ = sf.read(WAV, start=int(a * SR), stop=int(b * SR), dtype='float32', always_2d=True)
    s = x[:, 2:8].astype(np.float64) * 2
    n = s.shape[0] - s.shape[0] % H
    v_all = (s[:n, 0] ** 2).reshape(-1, H).mean(axis=1)
    active = v_all > v_all.max() / 30
    row = {}
    for f, so in zip(BANDS, sos):
        y = signal.sosfilt(so, s[:n], axis=0)
        p = (y ** 2).reshape(-1, H, 6).mean(axis=1)
        v = p[:, 0]
        r = p[:, 1:].sum(axis=1)
        snr = 10 * np.log10((v[active] + 1e-15) / (r[active] + 1e-15))
        res[f].extend(snr.tolist())
        share[f] += p[active, 1:].sum(axis=0)
        row[f] = round(float(np.median(snr)), 1)
    per_line.append((l['t'], l['lineId'], row))
print('bande   médiane  10e c.   part du reste : musique ambiance bruitages réverbe interface')
for f in BANDS:
    v = np.array(res[f])
    sh = share[f] / share[f].sum() * 100
    print(f'{f:5d} Hz {np.median(v):7.1f} {np.percentile(v, 10):7.1f}   ' + '  '.join(f'{x:5.0f} %' for x in sh))
worst = sorted(per_line, key=lambda r: min(r[2][2000], r[2][4000]))[:8]
print('\nrépliques les plus masquées à 2-4 kHz (consonnes) :')
for t, lid, row in worst:
    print(f'  {t:7.1f} {lid:16s} ' + ' '.join(f'{k}:{v:+.0f}' for k, v in row.items()))
