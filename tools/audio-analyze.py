#!/usr/bin/env python3
"""Analyse objective de l'audio d'Ombres (on ne peut pas écouter : on mesure).

Dépendances : numpy, scipy, soundfile, matplotlib, ffmpeg. Sur NixOS, sans rien installer :
  nix-shell -p 'python3.withPackages(p:[p.numpy p.scipy p.soundfile p.matplotlib])' ffmpeg \
    --run 'python3 tools/audio-analyze.py stats public/audio/sfx/*.ogg'

Sous-commandes
  stats  FICHIERS…            crête, RMS, sonie intégrée et momentanée max (BS.1770, LUFS), durée
  pitch  FICHIERS…            fondamentale (HPS) et partiels principaux (justesse des échantillons)
  loop   FICHIERS…            continuité à la couture d'une boucle (saut d'échantillon, flux spectral)
  sheet  SORTIE.png FICHIERS… planche : enveloppe + spectrogramme + mesures de chaque fichier
  report RENDU.wav SORTIE     rapport d'un rendu hors ligne (manche complète) : sonie dans le temps,
                              crêtes, clics, chroma par section → SORTIE.png + SORTIE.json
                              (--sections "0:noon,15:afternoon,…" en secondes de rendu)
  piano  RENDU.wav DÉBUT FIN SORTIE.png
                              « rouleau de piano » : spectrogramme sur l'échelle des notes (la1 → do7),
                              pour lire harmonie, mélodie et rythme sans écouter
"""
import io, json, subprocess, sys
import numpy as np
from scipy import signal

NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def load(path, sr=44100, mono=False):
    """Décode n'importe quel format via ffmpeg → float64 (n, ch)."""
    import soundfile as sf
    args = ['ffmpeg', '-v', 'quiet', '-i', path, '-ar', str(sr)]
    if mono:
        args += ['-ac', '1']
    raw = subprocess.run(args + ['-f', 'wav', '-'], capture_output=True, check=True).stdout
    x, sr = sf.read(io.BytesIO(raw), always_2d=True)
    return x, sr


def note_name(f):
    m = 69 + 12 * np.log2(f / 440)
    n = int(round(m))
    return f"{NOTES[n % 12]}{n // 12 - 1}{(m - n) * 100:+.0f}c"


# ─── Sonie BS.1770 (pondération K, coefficients calculés pour toute fréquence) ──

def k_weight(x, sr):
    # Pré-filtre (étagère haute) et RLB (passe-haut), formules de pyloudnorm / BS.1770-4
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40)
    w0 = 2 * np.pi * fc / sr
    alpha = np.sin(w0) / (2 * Q)
    b = [A * ((A + 1) + (A - 1) * np.cos(w0) + 2 * np.sqrt(A) * alpha), -2 * A * ((A - 1) + (A + 1) * np.cos(w0)),
         A * ((A + 1) + (A - 1) * np.cos(w0) - 2 * np.sqrt(A) * alpha)]
    a = [(A + 1) - (A - 1) * np.cos(w0) + 2 * np.sqrt(A) * alpha, 2 * ((A - 1) - (A + 1) * np.cos(w0)),
         (A + 1) - (A - 1) * np.cos(w0) - 2 * np.sqrt(A) * alpha]
    y = signal.lfilter(b, a, x, axis=0)
    fc2, Q2 = 38.13547087613982, 0.5003270373253953
    w0 = 2 * np.pi * fc2 / sr
    alpha = np.sin(w0) / (2 * Q2)
    b = [(1 + np.cos(w0)) / 2, -(1 + np.cos(w0)), (1 + np.cos(w0)) / 2]
    a = [1 + alpha, -2 * np.cos(w0), 1 - alpha]
    return signal.lfilter(b, a, y, axis=0)


def loudness(x, sr):
    """(intégrée LUFS avec portes, momentanée max LUFS, courbe momentanée 100 ms)."""
    y = k_weight(x, sr)
    win, hop = int(0.4 * sr), int(0.1 * sr)
    if len(y) < win:
        y = np.pad(y, ((0, win - len(y)), (0, 0)))
    p = np.array([np.sum(np.mean(y[i:i + win] ** 2, axis=0)) for i in range(0, len(y) - win + 1, hop)])
    lk = -0.691 + 10 * np.log10(p + 1e-15)
    gated = p[lk > -70]
    if len(gated) == 0:
        return -70.0, float(lk.max()), lk
    rel = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    g2 = p[(lk > -70) & (lk > rel)]
    integ = -0.691 + 10 * np.log10(np.mean(g2)) if len(g2) else -70.0
    return float(integ), float(lk.max()), lk


def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def stats_of(path):
    x, sr = load(path)
    integ, mmax, _ = loudness(x, sr)
    return dict(file=path.split('/')[-1], dur=len(x) / sr, ch=x.shape[1], peak=db(np.max(np.abs(x))),
                rms=db(np.sqrt(np.mean(x ** 2))), lufs=integ, mmax=mmax)


def cmd_stats(files):
    print(f"{'fichier':42s} {'durée':>6s} ch {'crête':>6s} {'RMS':>6s} {'LUFS':>6s} {'Mmax':>6s}")
    for f in files:
        s = stats_of(f)
        print(f"{s['file'][:42]:42s} {s['dur']:6.2f} {s['ch']:2d} {s['peak']:6.1f} {s['rms']:6.1f} {s['lufs']:6.1f} {s['mmax']:6.1f}")


def cmd_pitch(files):
    for p in files:
        x, sr = load(p, mono=True)
        x = x[:, 0]
        a, b = int(len(x) * 0.05), int(len(x) * 0.8)
        seg = x[a:b]
        N = max(1 << int(np.ceil(np.log2(len(seg)))), 1 << 18)
        S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N))
        f = np.fft.rfftfreq(N, 1 / sr)
        hps = np.log(S + 1e-9)
        for h in (2, 3, 4):
            d = S[::h]
            hps[:len(d)] += np.log(d + 1e-9)
        band = (f > 50) & (f < 1200)
        f0 = f[np.argmax(np.where(band, hps, -1e9))]
        order = np.argsort(np.where((f > 40) & (f < 3000), S, 0))[::-1]
        peaks = []
        for i in order:
            if all(abs(f[i] - q) > 6 for q, _ in peaks):
                peaks.append((f[i], S[i]))
            if len(peaks) >= 6:
                break
        print(f"{p.split('/')[-1]:40s} f0≈{f0:7.1f} Hz {note_name(f0):>9s} | " +
              ', '.join(f"{fr:.0f}({note_name(fr)})" for fr, _ in sorted(peaks)))


def seam(x, sr):
    """Mesure la couture fin → début d'une boucle : saut relatif et flux spectral relatif."""
    m = x.mean(axis=1)
    d = np.abs(np.diff(m))
    local = np.percentile(d, 99.9)
    jump = abs(m[0] - m[-1])
    n = 2048
    def spec(s):
        return np.abs(np.fft.rfft(s * np.hanning(len(s))))
    a, b = spec(m[-n:]), spec(m[:n])
    mid = [spec(m[i:i + n]) for i in range(n, len(m) - 2 * n, len(m) // 20)]
    flux = lambda u, v: np.sum((np.log(u + 1e-6) - np.log(v + 1e-6)) ** 2) / len(u)
    ref = np.median([flux(mid[i], mid[i + 1]) for i in range(len(mid) - 1)]) if len(mid) > 2 else 1
    return jump / (local + 1e-12), flux(a, b) / (ref + 1e-12)


def cmd_loop(files):
    for f in files:
        x, sr = load(f)
        j, fl = seam(x, sr)
        ok = j < 1.0 and fl < 2.0
        print(f"{f.split('/')[-1]:40s} saut/p99.9={j:5.2f}  flux/médian={fl:5.2f}  {'OK' if ok else 'À VÉRIFIER'}")


def cmd_sheet(out, files):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = len(files)
    cols = 3
    rows = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows * 2, cols, figsize=(cols * 5.2, rows * 2.6), squeeze=False,
                             gridspec_kw={'height_ratios': [1, 2] * rows})
    for k, f in enumerate(files):
        r, c = divmod(k, cols)
        x, sr = load(f, mono=True)
        m = x[:, 0]
        t = np.arange(len(m)) / sr
        ax = axes[2 * r][c]
        hop = max(1, len(m) // 800)
        env = np.array([np.max(np.abs(m[i:i + hop])) for i in range(0, len(m), hop)])
        ax.fill_between(np.arange(len(env)) * hop / sr, -env, env, color='#553')
        s = stats_of(f)
        ax.set_title(f"{s['file'][:34]}  {s['dur']:.2f}s  pk {s['peak']:.0f}  Mmax {s['mmax']:.0f}", fontsize=7)
        ax.set_xlim(0, t[-1] if len(t) else 1)
        ax.set_ylim(-1, 1)
        ax.axis('off')
        ax2 = axes[2 * r + 1][c]
        ax2.specgram(m + 1e-9, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=-120, vmax=-20)
        ax2.set_ylim(0, 12000)
        ax2.tick_params(labelsize=6)
    for k in range(n, rows * cols):
        r, c = divmod(k, cols)
        axes[2 * r][c].axis('off')
        axes[2 * r + 1][c].axis('off')
    fig.tight_layout()
    fig.savefig(out, dpi=80)
    print('écrit', out)


def detect_clicks(m, sr):
    """Clics = impulsions ISOLÉES : énergie au-dessus de 8 kHz concentrée sur ~1 ms, sans énergie
    comparable ni avant (−20 → −2 ms) ni après (+2 → +20 ms). Une attaque de percussion (shaker,
    frappe) garde de l'énergie aiguë pendant des dizaines de ms : elle n'est pas comptée."""
    hp = signal.sosfilt(signal.butter(6, 8000, 'hp', fs=sr, output='sos'), m)
    p = hp * hp
    c = np.concatenate([[0], np.cumsum(p)])
    def mean(a, b):
        a = np.clip(a, 0, len(p)); b = np.clip(b, 0, len(p))
        return (c[b] - c[a]) / np.maximum(b - a, 1)
    n = np.arange(len(p))
    w1 = int(0.0008 * sr); w2 = int(0.002 * sr); w3 = int(0.02 * sr)
    step = max(1, w1 // 2)
    idx = n[::step]
    now = mean(idx, idx + w1)
    before = mean(idx - w3, idx - w2)
    after = mean(idx + w2, idx + w3)
    floor = np.percentile(now, 50) + 1e-12
    cand = idx[(idx > 0.01 * sr) & (now > 25 * before + 1e-12) & (now > 25 * after + 1e-12) & (now > 50 * floor)]
    clicks = []
    last = -sr
    for i in cand:
        if i - last > 0.05 * sr:
            clicks.append(i / sr)
            last = i
    return clicks


def cmd_report(wav, out, sections_arg=None):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    x, sr = load(wav)
    m = x.mean(axis=1)
    integ, mmax, lk = loudness(x, sr)
    peak = db(np.max(np.abs(x)))
    clicks = detect_clicks(m, sr)
    sections = []
    if sections_arg:
        pts = [(float(a), b) for a, b in (s.split(':') for s in sections_arg.split(','))]
        dur = len(m) / sr
        for i, (t0, name) in enumerate(pts):
            t1 = pts[i + 1][0] if i + 1 < len(pts) else dur
            seg = x[int(t0 * sr):int(t1 * sr)]
            if len(seg) < sr * 0.5:
                continue
            li, _, _ = loudness(seg, sr)
            # chroma : énergie par classe de hauteur (60 Hz – 2 kHz)
            n = 16384
            f = np.fft.rfftfreq(n, 1 / sr)
            band = (f > 60) & (f < 2000)
            pc = (np.round(69 + 12 * np.log2(f[band] / 440)).astype(int)) % 12
            chroma = np.zeros(12)
            segm = seg.mean(axis=1)
            for j in range(0, len(segm) - n, n // 2):
                S = np.abs(np.fft.rfft(segm[j:j + n] * np.hanning(n)))[band] ** 2
                np.add.at(chroma, pc, S)
            chroma /= chroma.sum() + 1e-12
            pent = sum(chroma[NOTES.index(p)] for p in ('A', 'C', 'D', 'E', 'G'))
            sections.append(dict(name=name, t0=t0, t1=t1, lufs=round(li, 1), peak=round(db(np.max(np.abs(seg))), 1),
                                 pentatonic_share=round(float(pent), 3),
                                 chroma={NOTES[k]: round(float(chroma[k]), 3) for k in np.argsort(chroma)[::-1][:7]}))
    rep = dict(file=wav, duration=len(m) / sr, integrated_lufs=round(integ, 1), momentary_max=round(mmax, 1),
               peak_dbfs=round(peak, 2), clicks=[round(c, 3) for c in clicks], sections=sections)
    with open(out + '.json', 'w') as fh:
        json.dump(rep, fh, indent=1, ensure_ascii=False)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(16, 7), gridspec_kw={'height_ratios': [1, 2]})
    tt = np.arange(len(lk)) * 0.1
    a1.plot(tt, lk, color='#a33', lw=0.8, label='momentanée (LUFS)')
    a1.axhline(integ, color='#333', ls='--', lw=0.6)
    a1.set_ylim(-60, 0)
    a1.set_xlim(0, len(m) / sr)
    for s in sections:
        a1.axvline(s['t0'], color='#36a', lw=0.6)
        a1.text(s['t0'] + 0.3, -8, f"{s['name']} {s['lufs']}", fontsize=7, color='#36a')
    for c in clicks:
        a1.axvline(c, color='#f0a', lw=1.2)
    a1.set_title(f"{wav.split('/')[-1]} — intégrée {integ:.1f} LUFS, crête {peak:.2f} dBFS, clics {len(clicks)}", fontsize=9)
    a1.legend(fontsize=7)
    a2.specgram(m + 1e-9, NFFT=4096, Fs=sr, noverlap=3072, cmap='magma', vmin=-130, vmax=-30)
    a2.set_ylim(0, 8000)
    a2.set_xlim(0, len(m) / sr)
    fig.tight_layout()
    fig.savefig(out + '.png', dpi=80)
    print(json.dumps(rep, indent=1, ensure_ascii=False))


def cmd_piano(wav, t0, t1, out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    x, sr = load(wav)
    m = x.mean(axis=1)
    seg = m[int(t0 * sr):int(t1 * sr)]
    n, hop = 8192, 512
    win = np.hanning(n)
    S = np.array([np.abs(np.fft.rfft(seg[i:i + n] * win)) for i in range(0, len(seg) - n, hop)]).T
    f = np.fft.rfftfreq(n, 1 / sr)
    midi = np.arange(33, 97)
    rows = []
    for mm in midi:
        fc = 440 * 2 ** ((mm - 69) / 12)
        sel = (f >= fc * 2 ** (-1 / 24)) & (f < fc * 2 ** (1 / 24))
        rows.append(S[sel].max(axis=0) if sel.any() else np.zeros(S.shape[1]))
    R = 20 * np.log10(np.array(rows) + 1e-9)
    fig, ax = plt.subplots(figsize=(18, 8))
    ax.imshow(R, aspect='auto', origin='lower', cmap='magma', vmin=R.max() - 60, vmax=R.max(), extent=[t0, t1 - n / sr, 32.5, 96.5])
    ticks = [mm for mm in midi if NOTES[mm % 12] in ('A', 'C', 'E')]
    ax.set_yticks(ticks)
    ax.set_yticklabels([f"{NOTES[mm % 12]}{mm // 12 - 1}" for mm in ticks])
    ax.set_title(f"{wav.split('/')[-1]} {t0}-{t1} s")
    fig.tight_layout()
    fig.savefig(out, dpi=70)
    print('écrit', out)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'stats':
        cmd_stats(args)
    elif cmd == 'pitch':
        cmd_pitch(args)
    elif cmd == 'loop':
        cmd_loop(args)
    elif cmd == 'sheet':
        cmd_sheet(args[0], args[1:])
    elif cmd == 'piano':
        cmd_piano(args[0], float(args[1]), float(args[2]), args[3])
    elif cmd == 'report':
        sec = None
        if '--sections' in args:
            i = args.index('--sections')
            sec = args[i + 1]
            args = args[:i] + args[i + 2:]
        cmd_report(args[0], args[1], sec)
    else:
        print(__doc__)
        sys.exit(2)
