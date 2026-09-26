#!/usr/bin/env python3
"""Tonalité estimée (profils de Krumhansl-Kessler sur chroma STFT) de fichiers ou de tranches
d'un enregistrement. Sert à vérifier que stingers, notes de joueurs et musiques s'accordent.
  python3 tools/polish/audio/keys.py FICHIER[:début:fin]…
"""
import sys
import numpy as np
import soundfile as sf
from scipy import signal
N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def chroma(x, sr):
    f, t, Z = signal.stft(x, sr, nperseg=8192, noverlap=6144)
    mag = np.abs(Z)
    c = np.zeros(12)
    ok = (f > 60) & (f < 4000)
    midi = 69 + 12 * np.log2(f[ok] / 440)
    pc = np.round(midi).astype(int) % 12
    dev = np.abs(midi - np.round(midi))
    w = (mag[ok] ** 2).sum(axis=1) * (dev < 0.3)
    for k in range(12):
        c[k] = w[pc == k].sum()
    return c / (c.sum() + 1e-12), midi, (mag[ok] ** 2).sum(axis=1)


def key_of(c):
    best = []
    for k in range(12):
        best.append((np.corrcoef(np.roll(MAJ, k), c)[0, 1], f'{N[k]} majeur'))
        best.append((np.corrcoef(np.roll(MIN, k), c)[0, 1], f'{N[k]} mineur'))
    best.sort(reverse=True)
    return best[:3]


for arg in sys.argv[1:]:
    parts = arg.split(':')
    path = parts[0]
    ch = None
    if len(parts) >= 3:
        info = sf.info(path)
        a, b = float(parts[1]), float(parts[2])
        x, sr = sf.read(path, start=int(a * info.samplerate), stop=int(b * info.samplerate), always_2d=True)
        ch = int(parts[3]) if len(parts) > 3 else None
    else:
        x, sr = sf.read(path, always_2d=True)
    x = x[:, ch] if ch is not None else x.mean(axis=1)
    c, midi, pw = chroma(x, sr)
    # écart d'accord global (cents) : moyenne pondérée de l'écart au demi-ton le plus proche
    dev = (midi - np.round(midi)) * 100
    tune = np.sum(dev * pw) / np.sum(pw)
    top = ' '.join(f'{N[k]}{c[k]*100:.0f}' for k in np.argsort(-c)[:7])
    print(f'{arg.split("/")[-1]:60s} {key_of(c)[0][1]:10s} ({key_of(c)[0][0]:.2f}; puis {key_of(c)[1][1]}) accord {tune:+.0f} c | {top}')
