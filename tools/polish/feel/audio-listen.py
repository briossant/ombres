"""« Écoute » instrumentée du mixage réel capturé par audio-capture.mjs (critique game feel).
Sonie à court terme (RMS pondéré K approximé), par phase ; niveau des événements par rapport au fond ;
voix du narrateur par rapport au lit sonore ; silences ; densité des transitoires.
  nix-shell -p 'python3.withPackages(p:[p.numpy p.scipy])' --run 'python3 tools/polish/feel/audio-listen.py shots/polish/feel/audio6'
"""
import json, sys, wave
import numpy as np
from scipy import signal

d = sys.argv[1]
w = wave.open(f'{d}/mix.wav')
sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
meta = json.load(open(f'{d}/audio-log.json'))
t0 = meta['t0']
log = meta['log']
# pondération K (BS.1770) : étage « tête » + passe-haut RLB, recalculés pour sr
def kweight(sig, fs):
    # shelving +4 dB au-dessus de ~1,5 kHz
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / fs); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, sig)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / fs)
    b = [1, -2, 1]
    a = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return signal.lfilter(b, a, y)
y = kweight(x, sr)
hop = int(0.1 * sr)
win = int(0.4 * sr)
n = (len(y) - win) // hop
mom = np.array([-0.691 + 10 * np.log10(np.mean(y[i * hop:i * hop + win] ** 2) + 1e-12) for i in range(n)])  # LUFS momentané (400 ms)
tt = np.arange(n) * 0.1 + 0.2  # centre de fenêtre, s depuis t0
def at(a):
    return a - t0
def lufs(a, b):
    i0, i1 = int(max(0, (a - 0.2) / 0.1)), int(max(0, (b - 0.2) / 0.1))
    seg = mom[i0:i1]
    if len(seg) == 0:
        return float('nan')
    return 10 * np.log10(np.mean(10 ** (seg / 10)))
peak = lambda a, b: 20 * np.log10(np.max(np.abs(x[int(a * sr):int(b * sr)])) + 1e-9)

# phases (temps audio)
ph = [(at(e['a']), e['e']['phase']) for e in log if e['type'] == 'phase']
scr = [(at(e['a']), e['e']) for e in log if e['type'] == 'screen']
print('# Mixage réel capturé —', f'{len(x)/sr:.1f} s', f'crête {20*np.log10(np.max(np.abs(x))+1e-9):.1f} dBFS', f'échantillons ≥ −0,3 dBFS : {int(np.sum(np.abs(x) > 0.966))}')
print('\n## Sonie par phase (LUFS court terme moyen, momentané max)')
marks = sorted(ph + [(a, 'écran:' + s) for a, s in scr])
for i, (a, nm) in enumerate(marks):
    b = marks[i + 1][0] if i + 1 < len(marks) else len(x) / sr
    if b - a < 0.5:
        continue
    i0, i1 = int(a / 0.1), int(b / 0.1)
    print(f'- {nm:22s} {a:6.1f} → {b:6.1f} s : {lufs(a, b):6.1f} LUFS, max momentané {np.max(mom[i0:max(i0+1,i1)]):6.1f}')

# événements : pic dans 0..400 ms après vs fond (LUFS 1,5 s avant)
print('\n## Émergence des événements (momentané max 0-0,5 s après − sonie des 1,5 s avant, dB)')
kinds = {}
for e in log:
    if e['type'] in ('diveWindup', 'diveCommit', 'diveHit', 'diveMiss', 'crown', 'bigSteal', 'countdown', 'lastSeconds', 'tenSeconds', 'night', 'flap', 'paleOnStrong'):
        a = at(e['a'])
        if a < 2 or a > len(x) / sr - 1:
            continue
        i0 = int((a - 0.2) / 0.1)
        after = np.max(mom[max(0, i0 + 2):i0 + 7]) if i0 + 7 < len(mom) else np.nan
        before = lufs(a - 1.5, a)
        kinds.setdefault(e['type'], []).append(after - before)
for k, v in kinds.items():
    v = np.array(v)
    print(f'- {k:13s} n={len(v):4d}  émergence médiane {np.nanmedian(v):+5.1f} dB  (p10 {np.nanpercentile(v,10):+5.1f}, p90 {np.nanpercentile(v,90):+5.1f})')

# narrateur : sonie pendant la réplique vs 2 s avant
print('\n## Narrateur (voix jouée) : sonie pendant la réplique vs lit sonore 2 s avant')
subs = [e for e in log if e['type'] == 'sub' and 'text' in e['e']]
for e in subs:
    a = at(e['a'])
    dur = min(e['e']['dur'] / 1000 - 0.6, 3.5)
    print(f"- {a:6.1f} s  {lufs(a + 0.1, a + dur):6.1f} vs {lufs(a - 2, a):6.1f} LUFS  « {e['e']['text']} » (voix {e['e']['voiced']})")

# silences (momentané < −45)
sil = mom < -45
runs = []
i = 0
while i < len(sil):
    if sil[i]:
        j = i
        while j < len(sil) and sil[j]:
            j += 1
        if j - i >= 5:
            runs.append((tt[i], (j - i) * 0.1))
        i = j
    else:
        i += 1
print('\n## Silences ≥ 0,5 s (momentané < −45 LUFS) :', ', '.join(f'{a:.1f} s ({l:.1f} s)' for a, l in runs) or 'aucun')
# densité de transitoires par phase (onsets : saut de +6 dB en 100 ms de l'enveloppe 20 ms)
env_hop = int(0.02 * sr)
env = np.array([np.sqrt(np.mean(y[i:i + env_hop] ** 2) + 1e-12) for i in range(0, len(y) - env_hop, env_hop)])
edb = 20 * np.log10(env)
on = np.where((edb[5:] - edb[:-5]) > 6)[0] + 5
# dédoublonner à 80 ms
ons = []
for o in on:
    if not ons or o - ons[-1] > 4:
        ons.append(o)
ons = np.array(ons) * 0.02
print('\n## Transitoires / s par phase (attaques de +6 dB) :')
for i, (a, nm) in enumerate(marks):
    b = marks[i + 1][0] if i + 1 < len(marks) else len(x) / sr
    if b - a < 1:
        continue
    c = np.sum((ons >= a) & (ons < b))
    print(f'- {nm:22s} {c / (b - a):.2f} /s')
# ralentis : événements hit → passe-bas ; mesure du centroïde spectral 0-0,4 s après vs avant
print('\n## Centroïde spectral autour des touches (le monde s\'étouffe pendant le ralenti ?)')
def centroid(a, b):
    seg = x[int(a * sr):int(b * sr)]
    if len(seg) < 256:
        return float('nan')
    f, P = signal.welch(seg, sr, nperseg=1024)
    return float(np.sum(f * P) / np.sum(P))
for e in log:
    if e['type'] == 'diveHit':
        a = at(e['a'])
        print(f'- {a:6.1f} s  avant {centroid(a-1.0,a-0.1):6.0f} Hz → pendant {centroid(a+0.05,a+0.45):6.0f} Hz → après {centroid(a+1.2,a+2.0):6.0f} Hz')
np.save(f'{d}/mom.npy', mom)
