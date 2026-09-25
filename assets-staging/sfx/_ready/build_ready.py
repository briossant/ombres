#!/usr/bin/env python3
"""Construit les SFX 'prêts pour le jeu' (OGG Vorbis) depuis les originaux Freesound (mp3 HQ preview) du dossier parent.
Requiert: sox (avec support ogg). Usage: python3 build_ready.py   (idempotent)
One-shots: mono, 44.1 kHz, trim + pré-roll, fade-in 5 ms, fade-out, normalisés à -1 dBFS crête.
Loops: stéréo, crossfade equal-power (fade 'q') de X s entre la fin et le début -> boucle sans couture, normalisés -3 dBFS.
Option pitch: décalage en demi-tons (pitch shift sans changer la durée) pour rendre les cris 'géants'."""
import subprocess, os, glob, tempfile
os.environ['LC_ALL'] = 'C'
HERE = os.path.dirname(os.path.abspath(__file__)); SFX = os.path.dirname(HERE)
def src(fsid):
    m = glob.glob(f'{SFX}/*/*__fs{fsid}.mp3'); assert m, fsid; return m[0]
def sox(*a): subprocess.run(['sox', *map(str, a)], check=True)
def oneshot(name, fsid, start=None, end=None, fade_out=0.08, pitch=0, norm=-1, mono=True):
    out = f'{HERE}/{name}.ogg'; eff = []
    if start is not None: eff += ['trim', start] + ([f'={end}'] if end else [])
    if pitch: eff += ['pitch', int(pitch * 100)]
    eff += ['fade', 't', 0.005, 0, fade_out, 'norm', norm]
    ch = ['-c', 1] if mono else []
    sox(src(fsid), '-r', 44100, *ch, '-C', 4, out, *eff)
def loop(name, fsid, a, L, X, norm=-3, mono=False):
    out = f'{HERE}/{name}.ogg'; ch = ['-c', 1] if mono else ['-c', 2]
    with tempfile.TemporaryDirectory() as t:
        full, head, tail, body, xf = [f'{t}/{n}.wav' for n in ('f', 'h', 't', 'b', 'x')]
        sox(src(fsid), '-r', 44100, *ch, full)   # décodage + rééchantillonnage UNE fois (sinon artefacts de filtre aux bords des morceaux)
        sox(full, head, 'trim', a, X, 'fade', 'q', X)             # début: fade-in
        sox(full, tail, 'trim', a + L, X, 'fade', 'q', 0, X, X)   # après la fin: fade-out
        sox('-m', '-v', 1, head, '-v', 1, tail, xf)  # -v 1: sinon sox -m divise par 2 (creux de -6 dB)
        sox(full, body, 'trim', a + X, L - X)
        sox(xf, body, '-C', 4, out, 'norm', norm)
S = oneshot
# --- ailes
for i,(a,b) in enumerate([(4.44,5.15),(7.39,8.45),(11.87,12.6),(22.23,22.8),(26.02,26.55),(29.47,30.1),(32.07,32.7)],1): S(f'wing_flap_{i:02d}', 711122, a, b, 0.1)
for i,(a,b) in enumerate([(1.2,1.85),(2.31,3.0),(3.40,4.1),(5.53,6.25)],1): S(f'wing_flap_heavy_{i:02d}', 759529, a, b, 0.12)
for i,(a,b) in enumerate([(0.16,0.9),(0.92,1.6),(1.67,2.2),(2.47,3.0)],1): S(f'wing_flap_foley_{i:02d}', 596541, a, b, 0.1)
S('wing_fold_flutter', 651753, 0.98, 3.4, 0.2)
for i,(a,b) in enumerate([(15.8,16.5),(13.9,14.7),(18.74,19.4)],1): S(f'feather_burst_{i:02d}', 207275, a, b, 0.15)
loop('wings_flapping_loop', 759529, 2.30, 4.25, 0.05, mono=True)
# --- whoosh / piqué
S('dive_nighthawk_01', 164201); S('dive_nighthawk_02', 164207)
S('dive_whoosh_big_01', 648614, fade_out=0.3); S('dive_whoosh_big_02', 649445, fade_out=0.3)
S('whoosh_pass_01', 683101); S('whoosh_pass_02', 60013); S('whoosh_long', 369698, 2.8, 6.8, 0.4)
# --- impacts
S('impact_hit_heavy', 504626); S('impact_punch', 399183); S('impact_thud_light', 496187)
S('boom_cinematic', 255111, 0, 5.5, 1.5); S('sub_drop', 428073, fade_out=0.4); S('deep_tremor', 119782, 0, 8, 2.0)
# --- cris d'oiseaux (+ versions 'géantes' pitchées -5 demi-tons)
for i,(a,b) in enumerate([(4.48,5.6),(6.70,7.7),(9.13,10.6)],1):
    S(f'bird_hawk_scream_{i:02d}', 616926, a, b, 0.2); S(f'bird_hawk_scream_{i:02d}_giant', 616926, a, b, 0.25, pitch=-5)
for i,(a,b) in enumerate([(0.9,3.2),(3.5,5.9),(8.5,10.7)],1): S(f'bird_eagle_cry_{i:02d}', 635419, a, b, 0.3)
for i,(a,b) in enumerate([(0.15,0.7),(1.0,1.55),(4.65,5.4)],1): S(f'bird_kee_ah_{i:02d}', 770032, a, b, 0.1)
for i,(a,b) in enumerate([(13.0,13.6),(39.7,40.7),(24.0,25.0),(21.1,22.2)],1): S(f'bird_squawk_{i:02d}', 675962, a, b, 0.12)
S('bird_griffin_cry', 563685, 0.3, 5.6, 0.4); S('bird_ptero_squawk', 263530); S('bird_vulture_hiss', 188041); S('bird_eagle_cry_short', 381200)
# --- carillons / cloches / gongs
S('chime_single', 169855, fade_out=0.5); S('chime_transition', 419594, 0, 4.8, 1.0)
S('bell_tibetan', 346328, 0, 10, 3.0); S('bowl_hit', 421829, 0, 12, 3.0); S('bowl_strike_soft', 271370, fade_out=1.0)
S('bell_harmony', 400605, 0, 14, 3.0); S('bells_harmony_chord', 400809, fade_out=1.0); S('triangle', 349503, fade_out=0.8)
S('gong_big', 486629, 0, 25, 6.0); S('gong_short', 121800, fade_out=1.0)
S('harp_gliss_up_01', 505063, 0.47, 8.6, 1.0); S('harp_gliss_up_02', 505063, 16.25, 20.8, 0.8); S('harp_gliss_down', 436129, 1.08, 7.4, 1.0)
# --- cors / signaux
S('horn_alpen', 507468, fade_out=0.5); S('horn_conch', 78974, 0.39, 7.5, 0.8); S('horn_fog_distant', 507471, fade_out=1.0)
# --- compte à rebours / tension
S('tick_wood_soft', 692828); S('tick_rods', 275679); S('tick_woodblock', 53403)
S('heartbeat_01', 273150, 1.48, 2.1, 0.08)
S('riser_long', 789102, fade_out=0.3); S('riser_short', 334525, fade_out=0.3); S('riser_hit', 715353, 4.4, 10.9, 1.0)
# --- UI musicale (rejoindre: pitcher par couleur de joueur)
S('join_kalimba_c', 331047, fade_out=0.5); S('join_handpan_csharp', 493864, fade_out=0.5)
# --- sable
S('sandfall', 326304, fade_out=0.3); S('hourglass_turn', 625655, fade_out=0.5)
S('wind_gust_01', 146932, fade_out=0.5); S('wind_gust_02', 352421, fade_out=1.0)
# --- boucles d'ambiance
loop('amb_wind_base_loop', 697217, 0.5, 38, 2)
loop('amb_wind_high_loop', 344887, 1.0, 16, 2)
loop('amb_wind_eerie_loop', 156414, 10, 60, 3)
loop('amb_wind_howl_loop', 117611, 2, 30, 3)
loop('amb_wind_dark_loop', 645305, 2, 50, 3)
loop('amb_wind_night_crickets_loop', 165526, 20, 60, 3)
loop('sand_paint_rainstick_loop', 235966, 2, 30, 2)
loop('amb_chimes_loop', 437337, 5, 60, 4)
loop('amb_crystal_chimes_loop', 772279, 3, 55, 4)
print('ok', len(glob.glob(HERE + '/*.ogg')), 'fichiers')
