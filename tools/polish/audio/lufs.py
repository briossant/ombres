"""Mesures BS.1770 (K-weighting, sonie momentanée / court terme / intégrée, LRA) sur numpy.

Utilisé par analyze.py ; pas de dépendance hors numpy/scipy.
"""
import numpy as np
from scipy import signal


def k_filter(sr):
    """Coefficients des deux étages de pondération K (BS.1770-4), recalculés pour `sr`."""
    # étage 1 : shelving haut
    f0 = 1681.974450955533
    G = 3.999843853973347
    Q = 0.7071752369554196
    K = np.tan(np.pi * f0 / sr)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    # étage 2 : passe-haut RLB
    f0 = 38.13547087602444
    Q = 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    b2 = [1, -2, 1]
    a0 = 1 + K / Q + K * K
    a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    return (b1, a1), (b2, a2)


def kweight(x, sr):
    """x : (n,) ou (n, ch) → signal pondéré K, même forme."""
    (b1, a1), (b2, a2) = k_filter(sr)
    y = signal.lfilter(b1, a1, x, axis=0)
    return signal.lfilter(b2, a2, y, axis=0)


def block_power(xk, sr, hop=0.1):
    """Énergie moyenne (somme des canaux) par bloc de `hop` s. xk : signal déjà pondéré."""
    if xk.ndim == 1:
        xk = xk[:, None]
    n = int(sr * hop)
    m = xk.shape[0] // n
    p = (xk[: m * n] ** 2).reshape(m, n, xk.shape[1]).mean(axis=1).sum(axis=1)
    return p  # par bloc de 100 ms


def windowed(p, blocks):
    """Moyenne glissante de `blocks` blocs (4 = momentané 400 ms, 30 = court terme 3 s), alignée à la fin."""
    c = np.concatenate([[0], np.cumsum(p)])
    out = np.full(len(p), np.nan)
    for i in range(blocks - 1, len(p)):
        out[i] = (c[i + 1] - c[i + 1 - blocks]) / blocks
    return out


def lufs(pw):
    return -0.691 + 10 * np.log10(np.maximum(pw, 1e-12))


def integrated(p100):
    """Sonie intégrée (portes absolue −70 et relative −10) depuis les blocs de 100 ms."""
    if len(p100) < 4:
        return float('nan')
    m = windowed(p100, 4)[3:]  # blocs de 400 ms, recouvrement 75 %
    l = lufs(m)
    g = m[l > -70]
    if not len(g):
        return float('-inf')
    rel = lufs(g.mean()) - 10
    g2 = g[lufs(g) > rel]
    return float(lufs(g2.mean())) if len(g2) else float('-inf')


def lra(p100):
    """Loudness range (EBU 3342) sur court terme 3 s."""
    if len(p100) < 30:
        return float('nan')
    s = windowed(p100, 30)[29::1]
    l = lufs(s)
    l = l[l > -70]
    if not len(l):
        return float('nan')
    rel = lufs(np.mean(10 ** ((l + 0.691) / 10))) - 20
    l = l[l > rel]
    if len(l) < 2:
        return 0.0
    return float(np.percentile(l, 95) - np.percentile(l, 10))
