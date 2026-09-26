#!/usr/bin/env python3
"""Analyse d'un enregistrement du mix réel (rec.mjs / record-game.mjs).

  python3 tools/polish/audio/analyze.py <dossier> <nom> [--plot SORTIE.png] [--clips DOSSIER]

Calcule, en flux (fichiers de plusieurs centaines de Mo) :
- blocs de 100 ms pondérés K (BS.1770) : master (stéréo), voix, musique, ambiance, bruitages,
  réverbe, interface, et « reste » (= tout sauf la voix, somme des stems avant master) ;
- énergie de la voix et du reste dans la bande de la parole (300-4000 Hz) ;
- crête d'échantillon du master par bloc.
Puis : segments (écrans, phases du soleil), sonie intégrée / LRA / crêtes par segment et par stem,
chaque réplique du narrateur (rapport voix / reste, pleine bande et bande parole, sons joués
pendant la réplique), densité des bruitages, silences et transitions. Écrit <nom>.analysis.json
et, avec --plot, une frise temporelle ; avec --clips, un WAV mono du master par réplique.
"""
import json, sys, os, collections
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(__file__))
from lufs import k_filter, lufs, integrated, lra, windowed  # noqa: E402

args = sys.argv[1:]
DIR, NAME = args[0], args[1]
PLOT = args[args.index('--plot') + 1] if '--plot' in args else None
CLIPS = args[args.index('--clips') + 1] if '--clips' in args else None
WAV = os.path.join(DIR, f'{NAME}.wav')
meta = json.load(open(os.path.join(DIR, f'{NAME}.events.json')))
SR = meta['sr']
F0 = meta['firstFrame']
EV = meta['events']
HOP = int(SR * 0.1)
STEM = 1 / meta.get('stemGain', 0.5)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))


from timemap import make_ts  # noqa: E402
ts = make_ts(meta, WAV)


# ─── Passe en flux ──────────────────────────────────────────────────────────
(b1, a1), (b2, a2) = k_filter(SR)
sp_b, sp_a = signal.butter(4, [300, 4000], btype='bandpass', fs=SR)
names = ['master', 'voice', 'music', 'amb', 'sfx', 'verb', 'ui', 'rest']
zi = {}
for n in names:
    ch = 2 if n == 'master' else 1
    zi[n] = [signal.lfilter_zi(b1, a1)[:, None] * np.zeros(ch), signal.lfilter_zi(b2, a2)[:, None] * np.zeros(ch)]
zsp = {n: signal.lfilter_zi(sp_b, sp_a)[:, None] * np.zeros(1) for n in ['voice', 'rest', 'mastersp']}
P = {n: [] for n in names}
PSP = {n: [] for n in ['voice', 'rest', 'mastersp']}
PEAK = []
RMSM = []
info = sf.info(WAV)
for blk in sf.blocks(WAV, blocksize=HOP * 100, dtype='float32', always_2d=True, fill_value=None):
    m = blk.shape[0] - blk.shape[0] % HOP
    if m == 0:
        break
    blk = blk[:m].astype(np.float64)
    st = blk[:, 2:8] * STEM
    streams = {
        'master': blk[:, 0:2],
        'voice': st[:, 0:1], 'music': st[:, 1:2], 'amb': st[:, 2:3], 'sfx': st[:, 3:4], 'verb': st[:, 4:5], 'ui': st[:, 5:6],
    }
    # stems : mono (moyenne L/R) → pour une sonie comparable au master stéréo, on compte 2 canaux
    streams['rest'] = st[:, 1:6].sum(axis=1, keepdims=True)
    for n, x in streams.items():
        z1, z2 = zi[n]
        y, z1 = signal.lfilter(b1, a1, x, axis=0, zi=z1)
        y, z2 = signal.lfilter(b2, a2, y, axis=0, zi=z2)
        zi[n] = [z1, z2]
        p = (y ** 2).reshape(-1, HOP, y.shape[1]).mean(axis=1).sum(axis=1)
        if n != 'master':
            p = p * 2  # mono dupliqué sur 2 enceintes
        P[n].append(p)
    for n, x in [('voice', streams['voice']), ('rest', streams['rest']), ('mastersp', blk[:, 0:1] * 0.5 + blk[:, 1:2] * 0.5)]:
        y, zsp[n] = signal.lfilter(sp_b, sp_a, x, axis=0, zi=zsp[n])
        PSP[n].append((y ** 2).reshape(-1, HOP).mean(axis=1))
    PEAK.append(np.abs(blk[:, 0:2]).max(axis=1).reshape(-1, HOP).max(axis=1))
    RMSM.append((blk[:, 0:2] ** 2).mean(axis=1).reshape(-1, HOP).mean(axis=1))
P = {n: np.concatenate(v) for n, v in P.items()}
PSP = {n: np.concatenate(v) for n, v in PSP.items()}
PEAK = np.concatenate(PEAK)
NB = len(P['master'])
TT = np.arange(NB) * 0.1 + 0.1  # fin de chaque bloc
print(f'{NAME} : {NB / 10:.1f} s, trous {meta["gaps"]} {meta.get("gapList")}')

MOM = {n: lufs(windowed(P[n], 4)) for n in names}
SHORT = {n: lufs(windowed(P[n], 30)) for n in names}


def seg_stats(a, b):
    i, j = max(0, int(a * 10)), min(NB, int(b * 10))
    if j - i < 5:
        return None
    out = {'start': round(a, 1), 'end': round(b, 1), 'dur': round(b - a, 1)}
    out['I'] = round(integrated(P['master'][i:j]), 1)
    out['LRA'] = round(lra(P['master'][i:j]), 1)
    mm = MOM['master'][i:j]
    out['Mmax'] = round(float(np.nanmax(mm)), 1) if np.isfinite(mm).any() else None
    ss = SHORT['master'][i:j]
    out['Smax'] = round(float(np.nanmax(ss)), 1) if np.isfinite(ss).any() else None
    out['peak'] = round(float(20 * np.log10(PEAK[i:j].max() + 1e-9)), 1)
    out['stems'] = {n: round(integrated(P[n][i:j]), 1) for n in names[1:]}
    return out


# ─── Segments : écrans et phases ────────────────────────────────────────────
marks = []
for e in EV:
    if e['k'] == 'screen':
        marks.append((ts(e['t']), 'screen:' + e['v']))
    elif e['k'] == 'sim' and e.get('type') == 'phase' and e.get('mode') == 'round':
        marks.append((ts(e['t']), 'sun:' + e['phase']))
    elif e['k'] == 'sim' and e.get('type') == 'countdown' and e.get('mode') == 'round' and e.get('n') == 3:
        marks.append((ts(e['t']), 'sun:countdown'))
    elif e['k'] == 'mark':
        marks.append((ts(e['t']), 'mark:' + e['label']))
    elif e['k'] == 'music':
        marks.append((ts(e['t']), f'music:{e["from"]}->{e["to"]}'))
    elif e['k'] == 'paused':
        marks.append((ts(e['t']), f'paused:{e["v"]}'))
marks.sort()
# segments = changements d'écran et de phase de soleil pendant les manches
bounds = []
screen = None
sun = None
for t, m in marks:
    if m.startswith('screen:'):
        v = m[7:]
        if v != screen:
            screen = v
            bounds.append((t, v))
    elif m.startswith('sun:') and screen == 'game':
        v = m[4:]
        if v != sun:
            sun = v
            bounds.append((t, 'game/' + v))
bounds.append((NB / 10, 'end'))
segments = []
for (a, n), (b, _) in zip(bounds, bounds[1:]):
    s = seg_stats(a, b)
    if s:
        s['name'] = n
        segments.append(s)

# ─── Réplique par réplique ──────────────────────────────────────────────────
manifest = json.load(open(os.path.join(ROOT, 'public/audio/narrator/manifest.json')))
clipdur = {}
cliptext = {}
for l in manifest['lines']:
    clipdur[(l['lang'], l['id'])] = l['duration_s']
    cliptext[(l['lang'], l['id'])] = l.get('text')
sfx_log = [e for e in EV if e['k'] == 'sfx' and e.get('ok')]
lines = []
for e in EV:
    if e['k'] != 'sub' or e.get('type') != 'show':
        continue
    t = ts(e['t'])
    cid = e['lineId'] + (f'.{e["color"]}' if e.get('color') is not None else '')
    d = clipdur.get(('fr', cid)) or clipdur.get(('en', cid)) or (e.get('dur', 2500) / 1000)
    # fenêtre où la voix sonne réellement (seuil sur le stem voix)
    i, j = int(t * 10), min(NB, int((t + d + 0.3) * 10) + 1)
    v = P['voice'][i:j]
    act = np.where(lufs(v) > -45)[0]
    if len(act):
        vi, vj = i + act[0], i + act[-1] + 1
    else:
        vi, vj = i, j
    rec = {'t': round(t, 2), 'lineId': e['lineId'], 'color': e.get('color'), 'text': e['text'], 'voiced': e.get('voiced'), 'clip_s': d}
    if len(act):
        pv, pr = P['voice'][vi:vj].mean(), P['rest'][vi:vj].mean()
        rec['voiceLUFS'] = round(float(lufs(pv)), 1)
        rec['restLUFS'] = round(float(lufs(pr)), 1)
        rec['snr'] = round(float(10 * np.log10(pv / max(pr, 1e-12))), 1)
        # bande parole
        sv, sr_ = PSP['voice'][vi:vj], PSP['rest'][vi:vj]
        rec['snrSpeech'] = round(float(10 * np.log10(sv.mean() / max(sr_.mean(), 1e-12))), 1)
        # pire 400 ms pendant la réplique, seulement là où la voix parle (à 10 dB de son max)
        vm = windowed(P['voice'][vi:vj], 4)
        blocks = []
        for k in range(3, len(sv)):
            if np.isfinite(vm[k]) and vm[k] > np.nanmax(vm) / 10:
                blocks.append(10 * np.log10(sv[k - 3:k + 1].mean() / max(sr_[k - 3:k + 1].mean(), 1e-12)))
        rec['snrSpeechWorst400ms'] = round(float(min(blocks)), 1) if blocks else None
        rec['maskers'] = {n: round(float(lufs(P[n][vi:vj].mean())), 1) for n in ['music', 'amb', 'sfx', 'verb', 'ui']}
        # reste 1 s avant la réplique (musique non duckée) vs pendant
        pre = P['rest'][max(0, i - 12):max(1, i - 2)].mean()
        rec['restBefore'] = round(float(lufs(pre)), 1)
        rec['masterMmax'] = round(float(np.nanmax(MOM['master'][vi:vj])), 1)
    during = [x for x in sfx_log if t - 0.2 <= ts(x.get('when', x['t'])) <= t + d]
    rec['sfxDuring'] = collections.Counter(x['name'] for x in during).most_common()
    # contexte : écran et phase
    ctx_ = [m for tt, m in marks if tt <= t]
    rec['ctx'] = next((m for m in reversed(ctx_) if m.startswith('screen:')), None)
    rec['sun'] = next((m for m in reversed(ctx_) if m.startswith('sun:')), None)
    lines.append(rec)

# ─── Bruitages : densité, refus, répétitions ────────────────────────────────
sfx_all = [e for e in EV if e['k'] == 'sfx']
by_seg = []
for s in segments:
    a, b = s['start'], s['end']
    xs = [x for x in sfx_all if a <= ts(x['t']) < b]
    ok = [x for x in xs if x.get('ok')]
    per_sec = collections.Counter(int(ts(x.get('when', x['t']))) for x in ok)
    by_seg.append({
        'name': s['name'], 'dur': s['dur'], 'played': len(ok), 'refused': len(xs) - len(ok),
        'perSec': round(len(ok) / max(s['dur'], 1e-3), 2), 'maxPerSec': max(per_sec.values()) if per_sec else 0,
        'top': collections.Counter(x['name'] for x in ok).most_common(12),
        'refusedTop': collections.Counter(x['name'] for x in xs if not x.get('ok')).most_common(6),
    })
# fichiers : nombre de lectures par fichier (répétition)
files = collections.Counter(x['file'] for x in sfx_all if x.get('ok'))
names_per_file = collections.defaultdict(set)
for x in sfx_all:
    names_per_file[x['file']].add(x['name'])
# voix simultanées (d'après les durées journalisées)
lv = [e for e in EV if e['k'] == 'lvl']
edges = []
for e in lv:
    t = ts(e['t'])
    edges.append((t, 1))
    edges.append((t + e['sec'], -1))
edges.sort()
cur = peak = 0
conc = []
for t, d in edges:
    cur += d
    conc.append((t, cur))
    peak = max(peak, cur)
# événements de simulation par type et par segment « game »
simc = collections.Counter(e['type'] for e in EV if e['k'] == 'sim' and e.get('mode') == 'round')

# ─── Silences (momentané < −50 LUFS pendant ≥ 0,5 s) ─────────────────────────
sil = []
mm = MOM['master']
low = np.where(~(mm > -50))[0]
if len(low):
    runs = np.split(low, np.where(np.diff(low) != 1)[0] + 1)
    for r in runs:
        if len(r) >= 5:
            sil.append((round(r[0] / 10, 1), round((r[-1] + 1) / 10, 1)))

# ─── Transitions d'écran : sonie court terme avant / après ──────────────────
trans = []
for t, m in marks:
    if m.startswith('screen:'):
        i = int(t * 10)
        def st(a, b):
            seg = P['master'][max(0, i + a):max(0, min(NB, i + b))]
            return round(float(lufs(seg.mean())), 1) if len(seg) else None
        trans.append({'t': round(t, 1), 'to': m[7:], 'before3s': st(-30, 0), 'after0_2s': st(0, 20), 'after2_6s': st(20, 60),
                      'minMomNext6s': round(float(np.nanmin(MOM['master'][i:min(NB, i + 60)])), 1) if i < NB else None})

out = {
    'name': NAME, 'seconds': NB / 10, 'gaps': meta['gaps'],
    'overall': seg_stats(0, NB / 10),
    'segments': segments, 'lines': lines, 'sfxBySegment': by_seg,
    'filesTop': files.most_common(25), 'fileNames': {f: sorted(v) for f, v in names_per_file.items() if len(v) > 1},
    'peakVoices': peak, 'simEventsRound': simc.most_common(), 'silences': sil, 'transitions': trans,
    'marks': [(round(t, 2), m) for t, m in marks],
}
json.dump(out, open(os.path.join(DIR, f'{NAME}.analysis.json'), 'w'), ensure_ascii=False, indent=1)
np.savez_compressed(os.path.join(DIR, f'{NAME}.blocks.npz'), **{f'P_{n}': P[n] for n in names}, **{f'PSP_{n}': PSP[n] for n in PSP}, PEAK=PEAK)

# ─── Impression ─────────────────────────────────────────────────────────────
print('\nSEGMENTS (LUFS intégrés master ; stems avant master)')
print(f'{"segment":28s} {"dur":>6s} {"I":>6s} {"LRA":>5s} {"Mmax":>6s} {"Smax":>6s} {"peak":>6s} | ' + ' '.join(f'{n:>6s}' for n in names[1:]))
for s in segments:
    print(f'{s["name"]:28s} {s["dur"]:6.1f} {s["I"]:6.1f} {s["LRA"]:5.1f} {s["Mmax"] or 0:6.1f} {s["Smax"] or 0:6.1f} {s["peak"]:6.1f} | ' + ' '.join(f'{s["stems"][n]:6.1f}' for n in names[1:]))
o = out['overall']
print(f'{"TOTAL":28s} {o["dur"]:6.1f} {o["I"]:6.1f} {o["LRA"]:5.1f} {o["Mmax"]:6.1f} {o["Smax"]:6.1f} {o["peak"]:6.1f}')
print('\nRÉPLIQUES')
for l in lines:
    print(f'{l["t"]:7.1f} {str(l["ctx"])[7:]:>12s} {str(l["sun"])[4:]:>12s} {l["lineId"]:18s} c={l["color"]!s:4s} v={l.get("voiceLUFS")} rest={l.get("restLUFS")} (avant {l.get("restBefore")}) SNR={l.get("snr")} parole={l.get("snrSpeech")} pire={l.get("snrSpeechWorst400ms")} masq={l.get("maskers")} sfx={l["sfxDuring"][:5]}')
print('\nBRUITAGES PAR SEGMENT')
for b in by_seg:
    print(f'{b["name"]:28s} joués {b["played"]:5d} ({b["perSec"]:.2f}/s, max {b["maxPerSec"]}/s) refusés {b["refused"]:4d} top {b["top"][:8]} refus {b["refusedTop"][:4]}')
print('\nfichiers les plus joués', files.most_common(12))
print('fichiers partagés par plusieurs sons', out['fileNames'])
print('voix simultanées max (journal)', peak)
print('silences ≥ 0,5 s', sil)
print('\nTRANSITIONS')
for t in trans:
    print(t)

if CLIPS:
    os.makedirs(CLIPS, exist_ok=True)
    for k, l in enumerate(lines):
        a = max(0, l['t'] - 0.4)
        b = l['t'] + l['clip_s'] + 0.6
        x, _ = sf.read(WAV, start=int(a * SR), stop=int(b * SR), dtype='float32', always_2d=True)
        sf.write(os.path.join(CLIPS, f'{NAME}_{k:02d}_{l["lineId"]}_mix.wav'), x[:, :2].mean(axis=1), SR)
        sf.write(os.path.join(CLIPS, f'{NAME}_{k:02d}_{l["lineId"]}_voice.wav'), x[:, 2] * STEM, SR)

if PLOT:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(3, 1, figsize=(26, 12), sharex=True, gridspec_kw={'height_ratios': [3, 1.2, 1]})
    ax = axs[0]
    for n, c in [('master', 'k'), ('music', 'tab:blue'), ('sfx', 'tab:red'), ('amb', 'tab:green'), ('voice', 'tab:purple'), ('ui', 'tab:orange')]:
        ax.plot(TT, SHORT[n], c, lw=1.4 if n == 'master' else 0.9, label=n + ' (court terme 3 s)')
    ax.plot(TT, MOM['master'], 'k', lw=0.3, alpha=0.4, label='master momentané')
    ax.set_ylim(-60, -5)
    ax.set_ylabel('LUFS')
    ax.grid(alpha=0.3)
    for t, m in marks:
        if m.startswith('screen:') or m.startswith('sun:'):
            ax.axvline(t, color='gray', lw=0.6, ls='--')
            ax.text(t, -7, m.split(':')[1], rotation=90, fontsize=7, va='top')
    for l in lines:
        ax.axvspan(l['t'], l['t'] + l['clip_s'], color='purple', alpha=0.12)
    ax.legend(loc='lower left', fontsize=7, ncol=7)
    ax.set_title(f'{NAME} : sonie du mix réel (master et stems avant master) ; bandes violettes = narrateur')
    ax = axs[1]
    snr_t = [l['t'] for l in lines if 'snrSpeech' in l]
    ax.bar(snr_t, [l['snrSpeech'] for l in lines if 'snrSpeech' in l], width=2.5, color='purple', label='voix / reste, bande 300-4000 Hz (dB)')
    ax.bar(snr_t, [l['snrSpeechWorst400ms'] or 0 for l in lines if 'snrSpeech' in l], width=1.2, color='orange', label='pire 400 ms')
    ax.axhline(10, color='g', lw=0.8, ls='--')
    ax.axhline(0, color='k', lw=0.6)
    ax.set_ylabel('dB')
    ax.legend(fontsize=7, loc='lower left')
    ax.grid(alpha=0.3)
    ax = axs[2]
    ok = [ts(x.get('when', x['t'])) for x in sfx_all if x.get('ok')]
    ax.hist(ok, bins=np.arange(0, NB / 10 + 1, 1.0), color='tab:red')
    ax.set_ylabel('bruitages / s')
    ax.set_xlabel('s')
    ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(PLOT, dpi=70)
    print('frise', PLOT)
