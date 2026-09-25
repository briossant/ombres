import math, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import sim
c = dict(sim.CFG)
# snapshots d'une manche
snaps = {}
orig_run = sim.run
# on rejoue la manche en capturant l'etat a certains instants via un hook simple
import copy
times = [20, 60, 90, 104, 112.5]
rng_seed = 3
# re-implementation legere : on patch hist pour capturer owner
g_states = {}
def run_capture(seed):
    r = sim.run(6, seed, c)
    return r
# approche simple : relancer run() avec T_SUN tronque ne marche pas (soleil change). On ajoute un hook global.
sim._capture_times = times
r = sim.run(6, rng_seed, c)
g = r["g"]
cols = ["#e07a5f", "#f2cc8f", "#81b29a", "#3d85c6", "#9b72cf", "#e56b9f"]
fig, axs = plt.subplots(1, len(times), figsize=(4.2 * len(times), 3.4))
for ax, tc in zip(axs, times):
    st = sim._captured[tc]
    img = np.ones(g.X.shape + (3,)) * np.array([0.93, 0.87, 0.74])
    for i, col in enumerate(cols):
        rgb = np.array(matplotlib.colors.to_rgb(col))
        m = st["owner"] == i
        img[m & st["strong"]] = rgb
        img[m & ~st["strong"]] = 0.45 * rgb + 0.55 * np.array([0.93, 0.87, 0.74])
    img[st["tmask"]] *= 0.45
    img[~st["lit"] & ~st["tmask"] & g.inside] *= 0.35
    img[~g.inside] = [0.55, 0.45, 0.35]
    ax.imshow(img, origin="lower", extent=[-c["A"], c["A"], -c["B"], c["B"]])
    for (tx, ty, segs, sph) in r["towers"]:
        if abs(tx) < c["A"]:
            ax.plot(tx, ty, "k^", ms=5)
    for (p, h, rad) in st["birds"]:
        ax.plot(p[0], p[1], "wo", ms=4, mec="k")
    ax.set_title(f"t={tc:.0f}s  e={math.degrees(st['e']):.0f} deg", fontsize=10)
    ax.set_xticks([]); ax.set_yticks([])
plt.tight_layout(); plt.savefig("snapshots.png", dpi=90)

# courbes
T = np.arange(0, 110.01, 0.5)
e = np.array([sim.elev(t, c) for t in T])
st = 1 / np.sin(np.radians(e))
fig, ax = plt.subplots(1, 2, figsize=(11, 3.4))
ax[0].plot(T, e, label="elevation (deg)")
ax2 = ax[0].twinx(); ax2.plot(T, st, "r", label="etirement 1/sin(e)"); ax2.set_ylim(0, 12)
for x in (35, 75, 98): ax[0].axvline(x, color="gray", ls=":")
ax[0].set_xlabel("t (s)"); ax[0].set_title("Soleil : elevation (bleu) et etirement des ombres (rouge)")
h = r["hist"]
ax[1].plot([x["t"] for x in h], [x["tower"] for x in h], label="ombre des tours")
ax[1].plot([x["t"] for x in h], [x["neutral"] for x in h], label="sable neutre")
for i, col in enumerate(cols):
    ax[1].plot([x["t"] for x in h], [x["shares"][i] for x in h], color=col, lw=1)
ax[1].legend(fontsize=8); ax[1].set_title("Part de l'arene (1 manche simulee, 6 bots)"); ax[1].set_xlabel("t (s)")
plt.tight_layout(); plt.savefig("curves.png", dpi=90)
print("ok", r["final"])
