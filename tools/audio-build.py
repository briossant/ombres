#!/usr/bin/env python3
"""Construit les assets audio servis d'Ombres depuis assets-staging/ (idempotent).

  nix-shell -p 'python3.withPackages(p:[p.numpy p.scipy p.soundfile])' ffmpeg sox \
    --run 'python3 tools/audio-build.py'            # tout
  … --run 'python3 tools/audio-build.py --only tick_rods,tanpura_a2'   # quelques entrées
  … --run 'python3 tools/audio-build.py --credits'  # imprime la section « audio » de CREDITS-sources.md

Sorties
  public/audio/sfx/<id>.ogg            bruitages, interface, ambiances (OGG Vorbis 44,1 kHz)
  public/audio/music/<id>.ogg          pistes des écrans hors manche (lues en streaming)
  public/audio/music/samples/<id>.ogg  échantillons d'instruments de la partition générative
  src/host/audio/manifest.gen.ts       catalogue typé : url, octets, durée, canaux, sonie, attaque…

Traitements (numpy + sox) : découpe, coupe du silence de tête (attaque à 4 ms), passe-haut,
réaccord par rééchantillonnage (« retune » en demi-tons : hauteur ET durée changent, sans
artefact de time-stretch), boucles sans couture (fondu enchaîné à puissance constante),
normalisation (crête pour les one-shots, sonie intégrée pour musiques et ambiances, avec
limiteur doux pour ne pas dépasser −1 dBFS), fondus de 5 ms contre les clics.

Les gains de mixage ne sont PAS appliqués ici : le manifeste porte la sonie momentanée
maximale (LUFS, BS.1770) de chaque fichier et le moteur règle chaque son en sonie perçue.
"""
import argparse, io, json, os, re, subprocess, sys, tempfile
import numpy as np
from scipy import signal
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STAGING = os.path.join(ROOT, 'assets-staging')
OUT_SFX = os.path.join(ROOT, 'public/audio/sfx')
OUT_MUSIC = os.path.join(ROOT, 'public/audio/music')
OUT_SAMPLES = os.path.join(OUT_MUSIC, 'samples')
MANIFEST_TS = os.path.join(ROOT, 'src/host/audio/manifest.gen.ts')
SR = 44100

sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module  # noqa: E402
_an = import_module('audio-analyze')
loudness = _an.loudness


def R(n): return f'{STAGING}/sfx/_ready/{n}.ogg'
def K(p): return f'{STAGING}/sfx/kenney/{p}.ogg'
def M(n): return f'{STAGING}/music/{n}.ogg'
def SMP(n): return f'{STAGING}/music/samples/{n}'


# ─── Catalogue ──────────────────────────────────────────────────────────────
# id: (source, options). kind : sfx | ui | amb | music | sample. group : critical | lazy | stream.
# Options : trim=(a, b) s ; onset=True (coupe le silence de tête) ; hp=Hz ; retune=demi-tons ;
# mono ; norm=('peak', dBFS) | ('lufs', LUFS) ; q=qualité Vorbis ; fade_out=s ;
# loop=(début, longueur, fondu) pour fabriquer une boucle ; is_loop (déjà bouclée).
C = {}


def add(id, src, kind, group='lazy', **o):
    assert id not in C, id
    C[id] = dict(src=src, kind=kind, group=group, **o)


ONE = dict(mono=True, norm=('peak', -1.0), q=3)
# Ailes : battements de montée (deux prises de foley), coup d'aile lourd, repli
for i in range(1, 8):
    add(f'wing_flap_{i:02d}', R(f'wing_flap_{i:02d}'), 'sfx', 'critical', fsid=711122, **ONE)
for i in range(1, 5):
    add(f'wing_flap_foley_{i:02d}', R(f'wing_flap_foley_{i:02d}'), 'sfx', 'critical', fsid=596541, **ONE)
    add(f'wing_flap_heavy_{i:02d}', R(f'wing_flap_heavy_{i:02d}'), 'sfx', 'critical', fsid=759529, **ONE)
add('wing_fold_flutter', R('wing_fold_flutter'), 'sfx', 'critical', fsid=651753, **ONE)
for i in range(1, 4):
    add(f'feather_burst_{i:02d}', R(f'feather_burst_{i:02d}'), 'sfx', 'critical', fsid=207275, onset=True, **ONE)
# Piqué
add('dive_whoosh_big_01', R('dive_whoosh_big_01'), 'sfx', 'critical', fsid=648614, **ONE)
add('dive_whoosh_big_02', R('dive_whoosh_big_02'), 'sfx', 'critical', fsid=649445, **ONE)
add('dive_nighthawk_01', R('dive_nighthawk_01'), 'sfx', 'critical', fsid=164201, **ONE)
add('dive_nighthawk_02', R('dive_nighthawk_02'), 'sfx', 'critical', fsid=164207, **ONE)
add('whoosh_pass_01', R('whoosh_pass_01'), 'sfx', 'critical', fsid=683101, trim=(0.12, 0.9), **ONE)
add('whoosh_pass_02', R('whoosh_pass_02'), 'sfx', 'critical', fsid=60013, **ONE)
# Souffles distincts (polish audio A4) : le même whoosh_pass_02 servait cinq sons (1,6 lecture/s en
# manche). Variantes du souffle du COUP D'AILE, souffle du piqué qui descend, souffle étouffé (caché).
def WH(n): return f'{STAGING}/sfx/whoosh/{n}.mp3'
add('whoosh_flap_01', WH('whoosh_freakinbehemoth__fs243400'), 'sfx', 'critical', fsid=243400, trim=(0.42, 1.1), fade_out=0.2, **ONE)
add('whoosh_flap_02', R('whoosh_long'), 'sfx', 'critical', fsid=369698, trim=(0.95, 1.75), fade_out=0.35, **ONE)
add('whoosh_flap_03', WH('whoosh_epic__fs27281'), 'sfx', 'critical', fsid=27281, trim=(1.2, 2.0), fade_out=0.35, **ONE)
add('whoosh_down_01', R('whoosh_long'), 'sfx', 'critical', fsid=369698, trim=(0.4, 2.0), fade_out=0.6, **ONE)
add('whoosh_hide_01', WH('whoosh_epic__fs27281'), 'sfx', 'lazy', fsid=27281, trim=(2.0, 3.4), fade_out=0.6, **ONE)
# Impacts
add('impact_punch', R('impact_punch'), 'sfx', 'critical', fsid=399183, onset=True, trim=(0, 0.9), **ONE)
add('impact_hit_heavy', R('impact_hit_heavy'), 'sfx', 'critical', fsid=504626, **ONE)
add('impact_thud_light', R('impact_thud_light'), 'sfx', 'critical', fsid=496187, onset=True, **ONE)
for i in (0, 2, 4):
    add(f'impact_soft_heavy_{i}', K(f'impact/impactSoft_heavy_00{i}'), 'sfx', 'critical', kenney='impact', **ONE)
for i in (0, 1, 3):
    add(f'impact_soft_medium_{i}', K(f'impact/impactSoft_medium_00{i}'), 'sfx', 'critical', kenney='impact', **ONE)
add('sandfall', R('sandfall'), 'sfx', 'critical', fsid=326304, trim=(0, 2.6), fade_out=0.8, **ONE)
add('sub_drop', R('sub_drop'), 'sfx', 'critical', fsid=428073, retune=0.75, **ONE)  # G#1+25c → A1
# Cris (prise d'élan, décrochage)
for i in range(1, 4):
    add(f'bird_hawk_scream_{i:02d}_giant', R(f'bird_hawk_scream_{i:02d}_giant'), 'sfx', 'critical', fsid=616926, onset=True, **ONE)
    add(f'bird_kee_ah_{i:02d}', R(f'bird_kee_ah_{i:02d}'), 'sfx', 'critical', fsid=770032, onset=True, **ONE)
for i in range(1, 5):
    add(f'bird_squawk_{i:02d}', R(f'bird_squawk_{i:02d}'), 'sfx', 'critical', fsid=675962, onset=True, **ONE)
add('bird_ptero_squawk', R('bird_ptero_squawk'), 'sfx', 'critical', fsid=263530, onset=True, **ONE)
add('bird_vulture_hiss', R('bird_vulture_hiss'), 'sfx', 'critical', fsid=188041, onset=True, **ONE)
for i in range(1, 4):
    add(f'bird_eagle_cry_{i:02d}', R(f'bird_eagle_cry_{i:02d}'), 'sfx', 'lazy', fsid=635419, **ONE)
add('bird_hawk_scream_01', R('bird_hawk_scream_01'), 'sfx', 'lazy', fsid=616926, onset=True, **ONE)
# Rythme de manche : compte à rebours, départ, phases, Grande Ombre, nuit
add('tick_rods', R('tick_rods'), 'sfx', 'critical', fsid=275679, onset=True, **ONE)
add('tick_woodblock', R('tick_woodblock'), 'sfx', 'critical', fsid=53403, onset=True, **ONE)
add('tick_wood_soft', R('tick_wood_soft'), 'sfx', 'critical', fsid=692828, onset=True, **ONE)
add('horn_conch', R('horn_conch'), 'sfx', 'critical', fsid=78974, retune=0.40, **ONE)          # E4−40c → E4
add('bell_tibetan', R('bell_tibetan'), 'sfx', 'critical', fsid=346328, retune=-1.45, trim=(0, 7), fade_out=2.5, **ONE)    # A#4+45c → A4
add('chime_transition', R('chime_transition'), 'sfx', 'critical', fsid=419594, retune=-4.0, **ONE)  # mi majeur pent. → do majeur pent. (= la mineur pent.)
add('boom_cinematic', R('boom_cinematic'), 'sfx', 'critical', fsid=255111, **ONE)
add('deep_tremor', R('deep_tremor'), 'sfx', 'critical', fsid=119782, trim=(0, 6.5), fade_out=2.0, **ONE)
add('gong_big', R('gong_big'), 'sfx', 'critical', fsid=486629, trim=(0, 13), fade_out=5.0, **ONE)  # déjà en la (A2+9c)
add('bowl_hit', R('bowl_hit'), 'sfx', 'critical', fsid=421829, retune=-4.08, trim=(0, 7), fade_out=2.5, **ONE)  # C#4−8c → A3
add('bowl_strike_soft', R('bowl_strike_soft'), 'sfx', 'critical', fsid=271370, retune=4.0, **ONE)  # F4 → A4 (cloche de la couronne)
add('heartbeat', R('heartbeat_01'), 'sfx', 'critical', fsid=273150, **ONE)
add('bell_harmony', R('bell_harmony'), 'sfx', 'lazy', fsid=400605, retune=-0.45, trim=(0, 7), fade_out=2.5, **ONE)  # C5+45c → C5
# Résultats, victoire, pause (réaccordés en la mineur / do majeur)
add('harp_gliss_up_01', R('harp_gliss_up_01'), 'sfx', 'lazy', fsid=505063, retune=-4.0, trim=(0, 7.5), fade_out=2.5, **ONE)   # mi majeur → do majeur
add('harp_gliss_up_02', R('harp_gliss_up_02'), 'sfx', 'lazy', fsid=505063, retune=5.0, **ONE)    # mi mineur pent. → la mineur pent.
add('harp_gliss_down', R('harp_gliss_down'), 'sfx', 'lazy', fsid=436129, retune=1.0, **ONE)      # sol# → la
add('bells_harmony_chord', R('bells_harmony_chord'), 'sfx', 'lazy', fsid=400809, retune=3.37, **ONE)  # la majeur −37c → do majeur (musique des résultats)
add('gong_short', R('gong_short'), 'sfx', 'lazy', fsid=121800, retune=2.55, **ONE)                # ~F#2+47c → A2
add('riser_hit', R('riser_hit'), 'sfx', 'lazy', fsid=715353, **ONE)
add('hourglass_turn', R('hourglass_turn'), 'sfx', 'lazy', fsid=625655, trim=(0, 5), fade_out=1.5, **ONE)
add('wind_gust_01', R('wind_gust_01'), 'amb', 'lazy', fsid=146932, **ONE)
add('wind_gust_02', R('wind_gust_02'), 'amb', 'lazy', fsid=352421, trim=(0, 7), fade_out=2.5, **ONE)
# Interface (organique : bois, papier, verre ; les sons tonaux sont en la)
add('ui_pluck', K('interface/pluck_001'), 'ui', 'critical', kenney='interface', **ONE)   # la
add('ui_glass', K('interface/glass_002'), 'ui', 'critical', kenney='interface', **ONE)   # si (9e)
add('ui_click_soft', K('interface/click_001'), 'ui', 'critical', kenney='interface', onset=True, **ONE)
add('ui_page_flip_1', K('rpg/bookFlip1'), 'ui', 'critical', kenney='rpg', trim=(0.48, 0.77), **ONE)
add('ui_page_flip_2', K('rpg/bookFlip2'), 'ui', 'critical', kenney='rpg', onset=True, **ONE)
add('ui_cloth', K('rpg/cloth1'), 'ui', 'critical', kenney='rpg', **ONE)

# Ambiances : boucles raccourcies (re-bouclées par fondu enchaîné) pour la mémoire — une boucle
# stéréo décodée pèse 21 Mo par minute — ; mono quand la couche est panoramiquée ou diffuse.
AMB = dict(norm=('lufs', -20.0), q=0)
add('amb_wind_base_loop', R('amb_wind_base_loop'), 'amb', 'critical', fsid=697217, loop=(1.0, 26.0, 3.0), **AMB)
add('amb_wind_high_loop', R('amb_wind_high_loop'), 'amb', 'lazy', fsid=344887, is_loop=True, mono=True, **AMB)
add('amb_wind_eerie_loop', R('amb_wind_eerie_loop'), 'amb', 'lazy', fsid=156414, loop=(3.0, 24.0, 3.0), **AMB)
add('amb_wind_howl_loop', R('amb_wind_howl_loop'), 'amb', 'lazy', fsid=117611, loop=(2.0, 24.0, 3.0), **AMB)
add('amb_wind_dark_loop', R('amb_wind_dark_loop'), 'amb', 'lazy', fsid=645305, loop=(2.0, 22.0, 3.0), mono=True, **AMB)
add('amb_night_crickets_loop', R('amb_wind_night_crickets_loop'), 'amb', 'lazy', fsid=165526, loop=(4.0, 24.0, 3.0), mono=True, **AMB)
# (amb_chimes_loop retiré : fa −24 cents sous la boucle du salon en sol majeur ; remplacé par un
#  carillon généré en sol pentatonique, src/host/audio/ambience.ts)
add('sand_paint_loop', R('sand_paint_rainstick_loop'), 'amb', 'critical', fsid=235966, loop=(2.0, 14.0, 2.0), mono=True, **AMB)

# Échantillons de la partition générative (réaccordés, passe-haut contre le ronflement à 46 Hz)
for i, n in enumerate(['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'], 1):
    add(f'tongue_{n}', SMP(f'tongue_drum_{i:02d}_{n}.ogg'), 'sample', 'lazy', fsid=497849, mono=True, hp=75,
        norm=('peak', -1.0), q=3, trim=(0, 4.2), fade_out=1.2, note=n)
add('oud_A2', SMP('oud_a2__fs172683.mp3'), 'sample', 'lazy', fsid=172683, mono=True, hp=50, onset=True, norm=('peak', -1.0), q=3, note='A2')
add('oud_C3', SMP('oud_c3__fs172684.mp3'), 'sample', 'lazy', fsid=172684, mono=True, hp=50, onset=True, norm=('peak', -1.0), q=3, note='C3')
add('oud_G2', SMP('oud_g2__fs172682.mp3'), 'sample', 'lazy', fsid=172682, mono=True, hp=50, onset=True, norm=('peak', -1.0), q=3, note='G2')
# Le « duduk C3 » sonne en réalité do4 (261,3 Hz mesurés)
add('duduk_C4', SMP('duduk_C3__fs479213.mp3'), 'sample', 'lazy', fsid=479213, mono=True, hp=90, onset=True, norm=('peak', -1.0), q=3,
    fade_out=0.6, note='C4')
# Tanpura « en mi » : Sa mesuré 80,87 Hz (mi1 −33 c) et Pa 120,9 Hz. Réaccordé en la (Sa = la2 110 Hz,
# Pa = mi3) par rééchantillonnage × 110/80,87, puis bouclé (fondu de 2 s).
add('tanpura_A2', SMP('tanpura_drone_E__fs148850.mp3'), 'sample', 'lazy', fsid=148850, speed=110 / 80.87, hp=60,
    loop=(0.6, 13.5, 2.0), norm=('lufs', -20.0), q=2, note='A2')

# Pistes des écrans (streaming). Sonie intégrée −18 LUFS.
MUS = dict(norm=('lufs', -18.0), q=1)
add('title_zhelanov_ambient_1', M('zhelanov_futuristic_ambient_1'), 'music', 'stream', oga='zhelanov1', **{**MUS, 'q': 2})
add('lobby_isaiah658_relaxing_loop', M('isaiah658_ambient_relaxing_loop'), 'music', 'lazy', oga='isaiah658', is_loop=True, **MUS)
add('results_cynicmusic_synthwave4k', M('cynicmusic_calm_ambient_1_synthwave4k'), 'music', 'stream', oga='cynic1', **{**MUS, 'q': 0})
add('podium_cynicmusic_lifewave2k', M('cynicmusic_calm_ambient_3_lifewave2k'), 'music', 'stream', oga='cynic3', **{**MUS, 'q': 0})
add('credits_tritachyon_dust', M('tritachyon_dust_ambient_guitar'), 'music', 'stream', oga='tritachyon', **MUS)

OGA = {
    'zhelanov1': ('« Futuristic ambient 1 »', 'Alexandr Zhelanov', 'https://opengameart.org/content/futuristic-ambient', 'CC-BY 4.0', 'OUI'),
    'isaiah658': ('« Ambient Relaxing Loop »', 'isaiah658', 'https://opengameart.org/content/ambient-relaxing-loop', 'CC0', 'non'),
    'cynic1': ('« Calm Ambient 1 (Synthwave 4k) »', 'cynicmusic (The Cynic Project)', 'https://opengameart.org/content/calm-ambient-1-synthwave-4k', 'CC0', 'non'),
    'cynic3': ('« Calm Ambient 3 (Lifewave 2k) »', 'cynicmusic (The Cynic Project)', 'https://opengameart.org/content/calm-ambient-3-lifewave-2k', 'CC0', 'non'),
    'tritachyon': ('« Soundscape – Dust – Ambient Guitar »', 'Tri-Tachyon', 'https://opengameart.org/content/soundscape-dust-ambient-guitar', 'CC-BY 4.0', 'OUI'),
}
KENNEY = {
    'interface': ('Interface Sounds', 'https://kenney.nl/assets/interface-sounds'),
    'impact': ('Impact Sounds', 'https://kenney.nl/assets/impact-sounds'),
    'rpg': ('RPG Audio', 'https://kenney.nl/assets/rpg-audio'),
}


# ─── Traitements ────────────────────────────────────────────────────────────

def run(*a):
    subprocess.run([str(x) for x in a], check=True, capture_output=True)


def decode(path, speed=None):
    """Décode en float32 44,1 kHz (sox pour le rééchantillonnage « speed » de haute qualité)."""
    with tempfile.TemporaryDirectory() as t:
        wav = f'{t}/a.wav'
        run('ffmpeg', '-v', 'quiet', '-y', '-i', path, '-ar', SR, '-c:a', 'pcm_f32le', wav)
        if speed:
            w2 = f'{t}/b.wav'
            run('sox', wav, w2, 'speed', f'{speed:.6f}', 'rate', '-v', SR)
            wav = w2
        x, sr = sf.read(wav, always_2d=True, dtype='float64')
    assert sr == SR
    return x


def onset_index(x, thresh_db=-30):
    e = np.max(np.abs(x), axis=1)
    thr = np.max(e) * 10 ** (thresh_db / 20)
    idx = int(np.argmax(e > thr))
    return max(0, idx - int(0.004 * SR))


def fade(x, fin=0.005, fout=0.02):
    n_in, n_out = int(fin * SR), int(fout * SR)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)[:, None] ** 2
    return x


def make_loop(x, a, L, X):
    """Boucle de longueur L (s) commençant à a, fondu enchaîné à puissance constante de X s."""
    a, L, X = int(a * SR), int(L * SR), int(X * SR)
    assert a + L + X <= len(x), 'source trop courte pour la boucle'
    t = np.linspace(0, np.pi / 2, X)[:, None]
    head = x[a:a + X] * np.sin(t)
    tail = x[a + L:a + L + X] * np.cos(t)
    return np.concatenate([head + tail, x[a + X:a + L]])


def soft_limit(x, ceiling_db=-1.0):
    """Limiteur doux échantillon par échantillon (tanh au-dessus de −6 dB sous le plafond)."""
    c = 10 ** (ceiling_db / 20)
    k = c * 0.5
    y = x.copy()
    over = np.abs(y) > k
    y[over] = np.sign(y[over]) * (k + (c - k) * np.tanh((np.abs(y[over]) - k) / (c - k)))
    return y


def process(spec):
    x = decode(spec['src'], spec.get('speed') or (2 ** (spec['retune'] / 12) if spec.get('retune') else None))
    if spec.get('mono'):
        x = x.mean(axis=1, keepdims=True)
    elif x.shape[1] == 1 and spec['kind'] in ('amb', 'music'):
        x = np.repeat(x, 2, axis=1)
    if 'trim' in spec:
        a, b = spec['trim']
        x = x[int(a * SR):int(b * SR) if b else None]
    if spec.get('hp'):
        sos = signal.butter(4, spec['hp'], 'hp', fs=SR, output='sos')
        x = signal.sosfiltfilt(sos, x, axis=0)
    if spec.get('onset'):
        x = x[onset_index(x):]
    if spec.get('loop'):
        x = make_loop(x, *spec['loop'])
    elif not spec.get('is_loop'):
        x = fade(x, 0.004 if spec.get('onset') else 0.005, spec.get('fade_out', 0.03))
    kind, level = spec['norm']
    if kind == 'peak':
        x = x * (10 ** (level / 20) / (np.max(np.abs(x)) + 1e-12))
    else:
        integ, _, _ = loudness(x, SR)
        x = soft_limit(x * 10 ** ((level - integ) / 20), -1.0)
    return x


def encode(x, out, q):
    with tempfile.TemporaryDirectory() as t:
        wav = f'{t}/a.wav'
        sf.write(wav, x.astype(np.float32), SR, subtype='FLOAT')
        tmp = out + '.tmp.ogg'
        run('ffmpeg', '-v', 'quiet', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', q, '-map_metadata', '-1', tmp)
        os.replace(tmp, out)


def measure(path):
    """Mesures sur le fichier ENCODÉ (ce que le jeu entendra)."""
    x = decode(path)
    integ, mmax, _ = loudness(x, SR)
    env = np.max(np.abs(x), axis=1)
    return dict(duration=round(len(x) / SR, 4), channels=x.shape[1], peakDb=round(20 * np.log10(np.max(env) + 1e-12), 2),
                lufs=round(integ, 1), mmax=round(mmax, 1),
                onset=round(onset_index(x) / SR + 0.004, 3), peakTime=round(int(np.argmax(env)) / SR, 3))


def out_path(id, spec):
    if spec['kind'] == 'music':
        return os.path.join(OUT_MUSIC, f'{id}.ogg'), f'audio/music/{id}.ogg'
    if spec['kind'] == 'sample':
        return os.path.join(OUT_SAMPLES, f'{id}.ogg'), f'audio/music/samples/{id}.ogg'
    return os.path.join(OUT_SFX, f'{id}.ogg'), f'audio/sfx/{id}.ogg'


def build(only=None):
    for d in (OUT_SFX, OUT_MUSIC, OUT_SAMPLES):
        os.makedirs(d, exist_ok=True)
    cache_path = os.path.join(ROOT, 'tools/out/audio-build-cache.json')
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        cache = json.load(open(cache_path))
    except Exception:
        cache = {}
    entries = {}
    for id, spec in C.items():
        path, url = out_path(id, spec)
        key = json.dumps({k: v for k, v in spec.items()}, sort_keys=True, default=str) + str(os.path.getmtime(spec['src']))
        fresh = os.path.exists(path) and cache.get(id, {}).get('key') == key
        if (only and id not in only) or fresh:
            if not os.path.exists(path):
                print('manquant (ignoré)', id)
                continue
            m = cache.get(id, {}).get('m') or measure(path)
        else:
            x = process(spec)
            encode(x, path, spec['q'])
            m = measure(path)
            print(f"✓ {id:34s} {m['duration']:7.2f}s {m['channels']}ch crête {m['peakDb']:6.1f} Mmax {m['mmax']:6.1f} "
                  f"LUFS {m['lufs']:6.1f} {os.path.getsize(path) / 1024:7.1f} Ko")
        cache[id] = dict(key=key, m=m)
        entries[id] = dict(url=url, bytes=os.path.getsize(path), kind=spec['kind'], group=spec['group'],
                           loop=bool(spec.get('is_loop') or spec.get('loop')), note=spec.get('note'), **m)
    json.dump(cache, open(cache_path, 'w'), indent=0)
    write_manifest(entries)
    total = sum(e['bytes'] for e in entries.values())
    by = {}
    for e in entries.values():
        by[e['kind']] = by.get(e['kind'], 0) + e['bytes']
    print(f"total {total / 1e6:.2f} Mo — " + ', '.join(f"{k} {v / 1e6:.2f} Mo" for k, v in sorted(by.items())))


def write_manifest(entries):
    lines = [
        '// GÉNÉRÉ par tools/audio-build.py — ne pas modifier à la main.',
        '// Catalogue des fichiers audio servis : mesures faites sur les fichiers encodés.',
        '// mmax = sonie momentanée maximale (LUFS, fenêtre 400 ms), lufs = sonie intégrée,',
        '// onset / peakTime = début de l\'attaque et instant de la crête (s).',
        '',
        "export type AssetKind = 'sfx' | 'ui' | 'amb' | 'music' | 'sample'",
        "export type AssetGroup = 'critical' | 'lazy' | 'stream'",
        '',
        'export interface AudioAsset {',
        '  url: string',
        '  bytes: number',
        '  kind: AssetKind',
        '  group: AssetGroup',
        '  loop: boolean',
        '  /** Note jouée par un échantillon d\'instrument (notation scientifique). */',
        '  note: string | null',
        '  duration: number',
        '  channels: number',
        '  peakDb: number',
        '  lufs: number',
        '  mmax: number',
        '  onset: number',
        '  peakTime: number',
        '}',
        '',
        'export const AUDIO_ASSETS = {',
    ]
    for id in sorted(entries):
        e = entries[id]
        lines.append(f"  {id}: {json.dumps(e, ensure_ascii=False, separators=(', ', ': '))},")
    lines += ['} as const satisfies Record<string, AudioAsset>', '', 'export type AssetId = keyof typeof AUDIO_ASSETS', '']
    src = '\n'.join(lines)
    src = re.sub(r'"(\w+)": ', r'\1: ', src)
    with open(MANIFEST_TS, 'w') as fh:
        fh.write(src)


def licenses_index():
    rows = {}
    for line in open(os.path.join(STAGING, 'LICENSES.md'), encoding='utf-8'):
        m = re.match(r'\| `[^`]*__fs(\d+)\.mp3` \| (.*?) \| (.*?) \| (https://freesound\.org/\S+) \| CC0 1\.0 \|', line)
        if m:
            rows[int(m.group(1))] = dict(title=m.group(2), author=m.group(3), url=m.group(4))
    return rows


def credits():
    lic = licenses_index()
    out = ['## audio', '', 'Fichiers servis par l\'agent audio (`tools/audio-build.py`). Modifications communes : découpe, mono, '
           'normalisation, fondus, réencodage OGG Vorbis ; « réaccordé » = rééchantillonné pour tomber en la mineur.', '',
           '**Attributions obligatoires (écran Crédits)** : « Futuristic ambient 1 » par Alexandr Zhelanov — CC-BY 4.0 — '
           'https://opengameart.org/content/futuristic-ambient (modifié : normalisé, réencodé) ; « Soundscape – Dust – Ambient '
           'Guitar » par Tri-Tachyon — CC-BY 4.0 — https://opengameart.org/content/soundscape-dust-ambient-guitar (modifié : '
           'normalisé, réencodé). Tout le reste est CC0 (remerciements facultatifs : Freesound, Kenney.nl, OpenGameArt).', '',
           '| Fichier servi | Source | Auteur | Licence | Attribution requise |', '|---|---|---|---|---|']
    for id, spec in C.items():
        _, url = out_path(id, spec)
        note = []
        if spec.get('retune') or spec.get('speed'):
            note.append('réaccordé')
        if spec.get('loop'):
            note.append('bouclé')
        suffix = f" ({', '.join(note)})" if note else ''
        if 'fsid' in spec:
            r = lic.get(spec['fsid'])
            assert r, f"licence introuvable pour fs{spec['fsid']} ({id})"
            out.append(f"| `public/{url}`{suffix} | {r['url']} (« {r['title']} ») | {r['author']} | CC0 1.0 | non |")
        elif 'kenney' in spec:
            pack, u = KENNEY[spec['kenney']]
            out.append(f"| `public/{url}` | {u} (pack {pack}) | Kenney (kenney.nl) | CC0 1.0 | non |")
        elif 'oga' in spec:
            t, a, u, l, att = OGA[spec['oga']]
            out.append(f"| `public/{url}` | {u} ({t}) | {a} | {l} | {att} |")
    out += ['', 'Générés par le code (aucun fichier) : vent procédural, grain de sable, « tsk », « clac », synthèse et '
            'réverbération de la partition générative (WebAudio natif, code du projet).']
    print('\n'.join(out))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--credits', action='store_true')
    a = ap.parse_args()
    if a.credits:
        credits()
    else:
        build(set(a.only.split(',')) if a.only else None)
