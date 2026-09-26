"""Projection du temps audio (ctx.currentTime des événements) sur l'axe du fichier WAV.

Enregistrements sans `chunkFix` (premier rec.mjs) : le tampon du worklet (22 050 trames, pas un
multiple de 128) perdait les 94 dernières trames de chaque bloc de 22 144 ; les trous signalés
(`gapList`) ont été comblés de silence par rec.mjs. On replace chaque événement sur l'axe réel.
"""
import numpy as np
import soundfile as sf


def make_ts(meta, wav):
    SR, F0 = meta['sr'], meta['firstFrame']
    if meta.get('chunkFix') is not None:
        return lambda t: (t * SR - F0) / SR
    gaps = {a: b for a, b in (meta.get('gapList') or [])}
    total = sf.info(wav).frames
    segs = []
    tstart, fpos = F0, 0
    while fpos < total + 22144:
        segs.append((tstart, fpos))
        end = tstart + 22144
        fpos += 22050
        if end in gaps:
            fpos += max(0, gaps[end] - end)
            end = gaps[end]
        tstart = end
    L = np.array(segs, dtype=np.float64)

    def ts(t):
        f = t * SR
        k = int(np.searchsorted(L[:, 0], f, side='right')) - 1
        if k < 0:
            return (f - F0) / SR
        t0, p0 = L[k]
        r = f - t0
        return (p0 + (min(r, 22050) if r < 22144 else 22050 + (r - 22144))) / SR
    return ts
