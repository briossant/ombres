#!/usr/bin/env python3
"""Réduction de gain de la chaîne master (glue + limiteur + saturation), estimée bloc par bloc :
rapport entre le master (moyenne L/R) et la somme des stems (moyenne L/R, avant master).
Le gain statique hors compression (volume général² × 0,81 × gain de rattrapage automatique des
DynamicsCompressor de Chrome) est lu sur les blocs calmes (90e centile du rapport).

  python3 tools/polish/audio/gainred.py <dossier> <nom>
"""
import json, os, sys
import numpy as np
import soundfile as sf
sys.path.insert(0, os.path.dirname(__file__))
from timemap import make_ts

DIR, NAME = sys.argv[1], sys.argv[2]
WAV = os.path.join(DIR, f'{NAME}.wav')
meta = json.load(open(os.path.join(DIR, f'{NAME}.events.json')))
SR = meta['sr']
ts = make_ts(meta, WAV)
HOP = SR // 20  # 50 ms
M, S, V = [], [], []
for blk in sf.blocks(WAV, blocksize=HOP * 200, dtype='float32', always_2d=True):
    n = blk.shape[0] - blk.shape[0] % HOP
    b = blk[:n].astype(np.float64)
    m = b[:, :2].mean(axis=1)
    s = b[:, 2:8].sum(axis=1) * 2
    M.append((m ** 2).reshape(-1, HOP).mean(axis=1))
    S.append((s ** 2).reshape(-1, HOP).mean(axis=1))
    V.append(((b[:, 2] * 2) ** 2).reshape(-1, HOP).mean(axis=1))
M, S, V = map(np.concatenate, (M, S, V))
ok = (S > 1e-7) & (M > 1e-9)
r = 10 * np.log10(M[ok] / S[ok])
static = np.percentile(r, 90)
gr = np.full(len(M), np.nan)
gr[ok] = 10 * np.log10(M[ok] / S[ok]) - static
print(f'gain statique estimé (blocs calmes) : {static:+.1f} dB  [attendu : 20·log10(0,9²·0,81) = {20*np.log10(0.81*0.81):+.1f} dB + rattrapage des compresseurs]')
lvl = 10 * np.log10(S + 1e-12)
for lo, hi in [(-60, -30), (-30, -24), (-24, -20), (-20, -16), (-16, -12), (-12, 0)]:
    sel = ok & (lvl >= lo) & (lvl < hi)
    if sel.sum():
        g = gr[sel]
        print(f'  somme des stems {lo:>4d}..{hi:>4d} dBFS RMS : réduction médiane {np.nanmedian(g):+.1f} dB, 95e centile {np.nanpercentile(g, 5):+.1f} dB  ({sel.sum()} blocs)')
voice = ok & (V > 10 ** (-40 / 10))
print(f'pendant la voix : réduction médiane {np.nanmedian(gr[voice]):+.1f} dB (95e c. {np.nanpercentile(gr[voice], 5):+.1f}) ; hors voix : {np.nanmedian(gr[ok & ~voice]):+.1f} dB')
# par segment d'écran
marks = sorted((ts(e['t']), e['v']) for e in meta['events'] if e['k'] == 'screen')
marks.append((len(M) / 20, 'end'))
acc = {}
for (a, n), (b, _) in zip(marks, marks[1:]):
    i, j = int(a * 20), int(b * 20)
    g = gr[i:j]
    g = g[np.isfinite(g)]
    if len(g):
        acc.setdefault(n, []).append(g)
for n, gs in acc.items():
    g = np.concatenate(gs)
    print(f'  écran {n:14s} réduction médiane {np.median(g):+.1f} dB, 5 % des blocs sous {np.percentile(g, 5):+.1f} dB')
