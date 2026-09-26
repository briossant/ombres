#!/usr/bin/env python3
"""Planche zoomée d'un moment de l'enregistrement : spectrogramme du master, sonie momentanée
de chaque stem, et étiquettes (sons joués, répliques, écrans).

  python3 tools/polish/audio/zoom.py <dossier> <nom> <début s> <fin s> <SORTIE.png> [titre]
"""
import json, os, sys
import numpy as np
import soundfile as sf
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
DIR, NAME, A, B, OUT = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
TITLE = sys.argv[6] if len(sys.argv) > 6 else f'{NAME} {A:.0f}-{B:.0f} s'
meta = json.load(open(os.path.join(DIR, f'{NAME}.events.json')))
SR = meta['sr']
F0 = meta['firstFrame']
# même projection temps → fichier que analyze.py (enregistrements anciens : blocs de 22 144 / 22 050)
spec = importlib.util.spec_from_file_location('an_ts', os.path.join(os.path.dirname(__file__), 'timemap.py'))
tm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tm)
ts = tm.make_ts(meta, os.path.join(DIR, f'{NAME}.wav'))
blocks = np.load(os.path.join(DIR, f'{NAME}.blocks.npz'))
x, _ = sf.read(os.path.join(DIR, f'{NAME}.wav'), start=int(A * SR), stop=int(B * SR), dtype='float32', always_2d=True)
m = x[:, :2].mean(axis=1)
fig, axs = plt.subplots(3, 1, figsize=(16, 10), sharex=True, gridspec_kw={'height_ratios': [2.2, 2, 1.4]})
f, t, S = signal.spectrogram(m, SR, nperseg=2048, noverlap=1536)
axs[0].pcolormesh(t + A, f, 10 * np.log10(S + 1e-12), shading='auto', vmin=-120, vmax=-40, cmap='magma')
axs[0].set_yscale('symlog', linthresh=200)
axs[0].set_ylim(40, 16000)
axs[0].set_ylabel('Hz (master)')
axs[0].set_title(TITLE)


def lufs(p):
    return -0.691 + 10 * np.log10(np.maximum(p, 1e-12))


i, j = int(A * 10), int(B * 10)
tt = np.arange(i, j) / 10 + 0.1
for n, c in [('master', 'k'), ('voice', 'tab:purple'), ('music', 'tab:blue'), ('sfx', 'tab:red'), ('amb', 'tab:green'), ('ui', 'tab:orange'), ('verb', 'tab:gray')]:
    p = blocks[f'P_{n}']
    mom = np.convolve(p, np.ones(4) / 4, 'full')[: len(p)]
    axs[1].plot(tt, lufs(mom[i:j]), c, lw=1.6 if n in ('master', 'voice') else 1, label=n)
axs[1].set_ylim(-60, -5)
axs[1].set_ylabel('LUFS momentané')
axs[1].legend(fontsize=7, ncol=7, loc='lower left')
axs[1].grid(alpha=0.3)
ev = meta['events']
y = 0
for e in ev:
    tt_ = ts(e.get('when', e['t'])) if e['k'] == 'sfx' else ts(e['t'])
    if not (A <= tt_ <= B):
        continue
    if e['k'] == 'sfx' and e.get('ok') and e['name'] not in ('tsk', 'flap_climb'):
        axs[2].text(tt_, (y % 8) + 0.2, e['name'], fontsize=6, rotation=0, color='tab:red')
        axs[2].plot([tt_, tt_], [0, 8], color='tab:red', lw=0.3, alpha=0.5)
        y += 1
    elif e['k'] == 'sub' and e.get('type') == 'show':
        for a in axs:
            a.axvline(tt_, color='purple', lw=1.2)
        axs[1].text(tt_, -8, '« ' + e['text'] + ' »', fontsize=8, color='purple')
    elif e['k'] in ('screen', 'music'):
        for a in axs:
            a.axvline(tt_, color='k', lw=0.8, ls='--')
        axs[1].text(tt_, -56, e.get('v') or f'{e["from"]}→{e["to"]}', fontsize=7, rotation=90)
    elif e['k'] == 'sim' and e.get('type') in ('phase', 'countdown', 'tenSeconds', 'night', 'lastSeconds') and e.get('mode') == 'round':
        axs[2].text(tt_, 8.5, f'{e["type"]} {e.get("phase", e.get("n", ""))}', fontsize=7, color='k')
        axs[2].plot([tt_, tt_], [0, 9], color='k', lw=0.6)
tsk = [ts(e.get('when', e['t'])) for e in ev if e['k'] == 'sfx' and e.get('ok') and e['name'] == 'tsk']
fl = [ts(e.get('when', e['t'])) for e in ev if e['k'] == 'sfx' and e.get('ok') and e['name'] == 'flap_climb']
axs[2].plot([v for v in tsk if A <= v <= B], [-0.5] * len([v for v in tsk if A <= v <= B]), '|', color='tab:brown', label='tsk')
axs[2].plot([v for v in fl if A <= v <= B], [-1.2] * len([v for v in fl if A <= v <= B]), '|', color='tab:olive', label='flap_climb')
axs[2].set_ylim(-2, 9.5)
axs[2].legend(fontsize=7, loc='upper right')
axs[2].set_xlim(A, B)
axs[2].set_xlabel('s (enregistrement)')
plt.tight_layout()
plt.savefig(OUT, dpi=80)
print(OUT)
