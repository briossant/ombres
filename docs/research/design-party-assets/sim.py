"""Simulation grossiere d'une manche d'Ombres (design-party).
But : ordres de grandeur (epuisement du sable neutre, couverture des ombres de tours,
volatilite de fin de manche, poids du debut de manche). Pas une IA de bot finale.
"""
import math, sys, json
import numpy as np

CFG = dict(
    A=165.0, B=112.0,          # demi-axes arene (m) pour 5-6 oiseaux
    CELL=1.3,                  # m (sim) ; jeu reel 512x512
    DT=0.1,
    T_SUN=110.0, E0=88.0, E1=5.0,
    T_NIGHT=5.0,               # rideau de nuit O->E
    H_BAS=4.0, H_HAUT=16.0,
    R_BAS=5.0, R_HAUT=12.0,
    V_BAS=16.0, V_HAUT=22.0,
    TURN_BAS=140.0, TURN_HAUT=110.0,
    CLIMB_T=1.0, DIVE_T=0.6,
    DIVE_RANGE=32.0, DIVE_CONE=50.0, DIVE_HIT_P=0.55,
    STUN=1.4, INVULN=3.0, SPLASH_R=12.0, SPLASH_R_LEADER=16.0,
    DIVE_CD=2.5,
    SPRINT_V=28.0, SPRINT_T=0.6, SPRINT_CD=4.0,
    NIGHT=True,
    TOWERS="default",
    LEADER_BOUNTY=True,
)

# Tours : (x, y, [segments (z0, r0, z1, r1)], [spheres (z, R)])
def towers_default():
    return [
        # dans l'arene (x est, y nord) ; segments lathe (z0, r0, z1, r1) ; spheres (z, R)
        (-70, 12, [(0, 7, 50, 5), (50, 16, 53, 16), (53, 3, 80, 2)], [(80, 5)]),   # Grande Aiguille (repere)
        (-118, -48, [(0, 3.5, 26, 3.5), (26, 15, 28, 15)], []),                  # Parasol O
        (30, 62, [(0, 3.5, 24, 3.5), (24, 14, 26, 14)], []),                     # Parasol N
        (70, -42, [(0, 3, 55, 2)], [(55, 6)]),                                   # Aiguille E
        (-25, -70, [(0, 5, 42, 3)], [(26, 10)]),                                 # Bulbe S
        (112, 30, [(0, 9, 30, 9)], [(30, 9)]),                                   # Colonne E + dome
        (-128, 60, [(0, 4, 46, 2.5)], [(46, 5)]),                                # Aiguille NO
        # geantes hors arene (dans la tempete a l'ouest) : n'agissent qu'au coucher
        (-240, -35, [(0, 10, 105, 7)], [(105, 12)]),
        (-235, 70, [(0, 9, 85, 6)], [(85, 10)]),
    ]


def elev(t, c):
    tau = min(max(t / c["T_SUN"], 0.0), 1.0)
    return c["E0"] + (c["E1"] - c["E0"]) * tau


def azim(t, c):
    tau = min(max(t / c["T_SUN"], 0.0), 1.0)
    return 270 - 30 * (1 - tau) ** 2


def shadow_dir(t, c):
    az = math.radians(azim(t, c))
    return np.array([-math.sin(az), -math.cos(az)])  # oppose au soleil (x=est, y=nord)


class Grid:
    def __init__(self, c):
        self.c = c
        self.nx = int(2 * c["A"] / c["CELL"])
        self.ny = int(2 * c["B"] / c["CELL"])
        xs = (np.arange(self.nx) + 0.5) * c["CELL"] - c["A"]
        ys = (np.arange(self.ny) + 0.5) * c["CELL"] - c["B"]
        self.X, self.Y = np.meshgrid(xs, ys)
        self.inside = (self.X / c["A"]) ** 2 + (self.Y / c["B"]) ** 2 <= 1.0
        self.owner = np.full(self.X.shape, -1, np.int8)
        self.strong = np.zeros(self.X.shape, bool)
        self.n_in = self.inside.sum()

    def ij(self, x, y):
        c = self.c
        return int((y + c["B"]) / c["CELL"]), int((x + c["A"]) / c["CELL"])


def tower_shadow_mask(g, towers, t, c):
    e = math.radians(elev(t, c))
    d = shadow_dir(t, c)
    k = 1 / math.tan(e)
    m = np.zeros(g.X.shape, bool)
    for (tx, ty, segs, sph) in towers:
        for (z0, r0, z1, r1) in segs:
            ax, ay = tx + d[0] * z0 * k, ty + d[1] * z0 * k
            bx, by = tx + d[0] * z1 * k, ty + d[1] * z1 * k
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy + 1e-9
            u = np.clip(((g.X - ax) * vx + (g.Y - ay) * vy) / L2, 0, 1)
            rr = r0 + u * (r1 - r0)
            m |= (g.X - ax - u * vx) ** 2 + (g.Y - ay - u * vy) ** 2 <= rr * rr
        for (z, Rs) in sph:
            cx, cy = tx + d[0] * z * k, ty + d[1] * z * k
            # ellipse : demi-axe Rs/sin(e) le long de d, Rs en travers
            px, py = g.X - cx, g.Y - cy
            along = px * d[0] + py * d[1]
            across = -px * d[1] + py * d[0]
            m |= (along * math.sin(e) / Rs) ** 2 + (across / Rs) ** 2 <= 1
    return m


class Bird:
    def __init__(self, i, pers, rng, c):
        self.i = i; self.pers = pers; self.rng = rng; self.c = c
        ang = 2 * math.pi * i / 6 + 0.3
        self.p = np.array([0.45 * c["A"] * math.cos(ang), 0.45 * c["B"] * math.sin(ang)])
        self.hd = ang + math.pi / 2
        self.layer = 1  # 1 HAUT, 0 BAS
        self.h = c["H_HAUT"]
        self.target = self.p.copy()
        self.replan = 0.0
        self.stun = 0.0; self.inv = 0.0; self.dive_cd = 0.0; self.diving = 0.0; self.dive_tgt = None
        self.sprint = 0.0; self.sprint_cd = 0.0
        self.hits = 0; self.hit_taken = 0; self.dives = 0

    def radius(self):
        c = self.c
        f = (self.h - c["H_BAS"]) / (c["H_HAUT"] - c["H_BAS"])
        return c["R_BAS"] + f * (c["R_HAUT"] - c["R_BAS"])

    def strong(self):
        return self.h < 10.0

    def speed(self):
        c = self.c
        if self.diving > 0: return 34.0
        if self.sprint > 0: return c["SPRINT_V"]
        f = (self.h - c["H_BAS"]) / (c["H_HAUT"] - c["H_BAS"])
        return c["V_BAS"] + f * (c["V_HAUT"] - c["V_BAS"])


PERS = {
    # p_bas : preference pour BAS ; aggr : proba/s de piquer si cible ; sweep : conscience du soleil
    "peintre":  dict(p_bas=0.8, aggr=0.2, sweep=0.5),
    "faucon":   dict(p_bas=0.1, aggr=1.5, sweep=0.3),
    "voilier":  dict(p_bas=0.15, aggr=0.3, sweep=0.8),
    "pilleur":  dict(p_bas=0.6, aggr=0.5, sweep=0.6),
    "prudent":  dict(p_bas=0.4, aggr=0.3, sweep=0.5),
    "fou":      dict(p_bas=0.5, aggr=0.8, sweep=0.1),
}


_capture_times = []
_captured = {}

def run(n_birds=6, seed=0, c=CFG, record=False):
    rng = np.random.default_rng(seed)
    g = Grid(c)
    towers = towers_default() if c["TOWERS"] == "default" else []
    names = list(PERS.keys())
    birds = [Bird(i, PERS[names[i % len(names)]], rng, c) for i in range(n_birds)]
    # tache de depart
    for b in birds:
        m = ((g.X - b.p[0]) ** 2 + (g.Y - b.p[1]) ** 2 <= 8 ** 2) & g.inside
        g.owner[m] = b.i; g.strong[m] = True
    t = 0.0
    T_END = c["T_SUN"] + (c["T_NIGHT"] if c["NIGHT"] else 0)
    hist = []
    tmask = tower_shadow_mask(g, towers, 0, c); tmask_t = 0
    flips = []
    leader_prev = None; lead_changes = []
    while t < T_END - 1e-9:
        if t - tmask_t >= 1.0:
            tmask = tower_shadow_mask(g, towers, t, c); tmask_t = t
        tt = min(t, c["T_SUN"])
        e = math.radians(elev(tt, c)); d = shadow_dir(tt, c)
        s_e = 1 / math.sin(e); k = 1 / math.tan(e)
        lit = g.inside & ~tmask
        if c["NIGHT"] and t > c["T_SUN"]:
            xf = -c["A"] + 2 * c["A"] * (t - c["T_SUN"]) / c["T_NIGHT"]
            lit &= g.X > xf
        counts = np.bincount(g.owner[g.inside].astype(np.int64) + 1, minlength=n_birds + 1)[1:]
        leader = int(np.argmax(counts))
        # --- decisions ---
        for b in birds:
            b.stun = max(0, b.stun - c["DT"]); b.inv = max(0, b.inv - c["DT"])
            b.dive_cd = max(0, b.dive_cd - c["DT"]); b.sprint = max(0, b.sprint - c["DT"]); b.sprint_cd = max(0, b.sprint_cd - c["DT"])
            if b.stun > 0: continue
            b.replan -= c["DT"]
            if b.replan <= 0 and b.diving <= 0:
                b.replan = 0.8
                best = None; bs = -1e9
                sweep = b.pers["sweep"] * (1 if math.degrees(e) < 25 else 0)
                for _ in range(24):
                    ang = rng.uniform(0, 2 * math.pi); rr = math.sqrt(rng.uniform(0, 1))
                    q = np.array([rr * c["A"] * 0.92 * math.cos(ang), rr * c["B"] * 0.92 * math.sin(ang)])
                    # ou tombera mon ombre si je suis la ?
                    layer_guess = 0 if rng.uniform() < b.pers["p_bas"] else 1
                    h = c["H_BAS"] if layer_guess == 0 else c["H_HAUT"]
                    sc = q + d * h * k
                    i, j = g.ij(sc[0], sc[1])
                    if not (0 <= i < g.ny and 0 <= j < g.nx): continue
                    win = (slice(max(0, i - 4), i + 5), slice(max(0, j - 4), j + 5))
                    own = g.owner[win]; st = g.strong[win]; ins = lit[win]
                    if layer_guess == 0:
                        val = ((own != b.i) & ins).sum() + 0.5 * ((own != b.i) & st & ins).sum()
                    else:
                        val = ((own != b.i) & ~st & ins).sum() * 2.5
                    # bonus meneur (vol au meneur)
                    if c["LEADER_BOUNTY"] and b.i != leader:
                        val += 0.3 * ((own == leader) & ins).sum()
                    dist = np.linalg.norm(q - b.p)
                    dv = q - b.p
                    ns = abs(dv[1]) / (np.linalg.norm(dv) + 1e-6)
                    score = val / (1 + dist / 60) * (1 + sweep * ns)
                    if score > bs:
                        bs = score; best = (q, layer_guess)
                if best is not None:
                    b.target = best[0]
                    # peur des faucons
                    threat = any(o.layer == 1 and o.i != b.i and np.linalg.norm(o.p - b.p) < 30 for o in birds)
                    lay = best[1]
                    if threat and lay == 0 and rng.uniform() < 0.3: lay = 1
                    b.layer = lay
                if b.pers["aggr"] >= 1.0 and rng.uniform() < 0.6:
                    prey = [o for o in birds if o is not b and o.layer == 0 and o.stun <= 0 and np.linalg.norm(o.p - b.p) < 90]
                    if prey:
                        o = min(prey, key=lambda o: np.linalg.norm(o.p - b.p) - (30 if o.i == leader else 0))
                        b.target = o.p + np.array([math.cos(o.hd), math.sin(o.hd)]) * 15; b.layer = 1
                if b.pers is PERS["fou"] and rng.uniform() < 0.3:
                    b.target = b.p + rng.normal(0, 60, 2)
            # piquer ?
            if b.layer == 1 and b.h > 12 and b.dive_cd <= 0 and b.diving <= 0:
                for o in birds:
                    if o is b or o.layer != 0 or o.h > 8 or o.stun > 0 or o.inv > 0: continue
                    # cache si ombre dans l'ombre d'une tour
                    osc = o.p + d * o.h * k
                    oi, oj = g.ij(osc[0], osc[1])
                    if 0 <= oi < g.ny and 0 <= oj < g.nx and tmask[oi, oj]: continue
                    dv = o.p - b.p; dist = np.linalg.norm(dv)
                    if dist > c["DIVE_RANGE"]: continue
                    ang = math.degrees(abs((math.atan2(dv[1], dv[0]) - b.hd + math.pi) % (2 * math.pi) - math.pi))
                    if ang > c["DIVE_CONE"]: continue
                    if rng.uniform() < b.pers["aggr"] * c["DT"] * (2 if o.i == leader else 1):
                        b.diving = c["DIVE_T"]; b.dive_tgt = o; b.layer = 0; b.dives += 1
                        break
            # sprint en BAS
            if b.layer == 0 and b.h < 6 and b.sprint_cd <= 0 and rng.uniform() < 0.05:
                b.sprint = c["SPRINT_T"]; b.sprint_cd = c["SPRINT_CD"]
        # --- physique ---
        for b in birds:
            if b.stun > 0:
                continue
            if b.diving > 0:
                b.diving -= c["DT"]
                b.h = max(c["H_BAS"], b.h - (c["H_HAUT"] - c["H_BAS"]) / c["DIVE_T"] * c["DT"])
                if b.dive_tgt is not None:
                    tg = b.dive_tgt.p
                    b.target = tg.copy()
                if b.diving <= 0:
                    o = b.dive_tgt; b.dive_tgt = None
                    if o is not None and o.layer == 0 and o.inv <= 0 and rng.uniform() < c["DIVE_HIT_P"]:
                        o.stun = c["STUN"]; o.inv = c["STUN"] + c["INVULN"]
                        b.hits += 1; o.hit_taken += 1
                        R = c["SPLASH_R_LEADER"] if (c["LEADER_BOUNTY"] and o.i == leader) else c["SPLASH_R"]
                        m = ((g.X - o.p[0]) ** 2 + (g.Y - o.p[1]) ** 2 <= R * R) & lit
                        g.owner[m] = b.i; g.strong[m] = True
                        b.layer = 1; b.dive_cd = c["DIVE_CD"]
                    else:
                        b.layer = 0; b.dive_cd = c["DIVE_CD"] + 1.0
            else:
                goal = c["H_HAUT"] if b.layer == 1 else c["H_BAS"]
                rate = (c["H_HAUT"] - c["H_BAS"]) / (c["CLIMB_T"] if goal > b.h else c["DIVE_T"])
                b.h += max(-rate * c["DT"], min(rate * c["DT"], goal - b.h))
            dv = b.target - b.p
            want = math.atan2(dv[1], dv[0])
            diff = (want - b.hd + math.pi) % (2 * math.pi) - math.pi
            tr = math.radians(c["TURN_BAS"] if b.h < 10 else c["TURN_HAUT"]) * c["DT"]
            b.hd += max(-tr, min(tr, diff))
            b.p = b.p + np.array([math.cos(b.hd), math.sin(b.hd)]) * b.speed() * c["DT"]
            # mur de sable
            q = (b.p[0] / c["A"]) ** 2 + (b.p[1] / c["B"]) ** 2
            if q > 0.9:
                b.target = np.array([0.0, 0.0]) + rng.normal(0, 30, 2)
            if q > 1.0:
                b.p = b.p / math.sqrt(q) * 0.999
        # --- peinture ---
        before = g.owner.copy() if record else None
        order = rng.permutation(n_birds)
        for idx in order:
            b = birds[idx]
            if b.stun > 0: continue
            r = b.radius(); sc = b.p + d * b.h * k
            ra = r * s_e
            # bbox
            ext = ra + 2
            j0 = max(0, int((sc[0] - ext + c["A"]) / c["CELL"])); j1 = min(g.nx, int((sc[0] + ext + c["A"]) / c["CELL"]) + 1)
            i0 = max(0, int((sc[1] - ext + c["B"]) / c["CELL"])); i1 = min(g.ny, int((sc[1] + ext + c["B"]) / c["CELL"]) + 1)
            if j0 >= j1 or i0 >= i1: continue
            X = g.X[i0:i1, j0:j1] - sc[0]; Y = g.Y[i0:i1, j0:j1] - sc[1]
            along = X * d[0] + Y * d[1]; across = -X * d[1] + Y * d[0]
            m = ((along / ra) ** 2 + (across / r) ** 2 <= 1) & lit[i0:i1, j0:j1]
            own = g.owner[i0:i1, j0:j1]; st = g.strong[i0:i1, j0:j1]
            if b.strong():
                own[m] = b.i; st[m] = True
            else:
                mm = m & ((~st) | (own == -1))
                own[mm] = b.i; st[mm] = False
        for tc in _capture_times:
            if abs(t - tc) < c['DT'] / 2:
                _captured[tc] = dict(owner=g.owner.copy(), strong=g.strong.copy(), tmask=tmask.copy(), lit=lit.copy(), birds=[(b.p.copy(), b.h, b.radius()) for b in birds], e=e, d=d.copy())
        if record:
            flips.append(int(((before != g.owner) & g.inside).sum()))
        if int(round(t / c["DT"])) % 10 == 0:
            cnt = np.bincount(g.owner[g.inside].astype(np.int64) + 1, minlength=n_birds + 1)
            hist.append(dict(t=round(t, 1), neutral=cnt[0] / g.n_in, shares=(cnt[1:] / g.n_in).tolist(),
                             tower=float((tmask & g.inside).sum() / g.n_in),
                             strong=float((g.strong & g.inside & (g.owner >= 0)).sum() / g.n_in)))
        if leader_prev is None:
            leader_prev = leader; cand = leader; cand_t = t
        if leader != cand:
            cand = leader; cand_t = t
        if cand != leader_prev and t - cand_t >= 2.0:
            lead_changes.append(round(t, 1)); leader_prev = cand
        t += c["DT"]
    cnt = np.bincount(g.owner[g.inside].astype(np.int64) + 1, minlength=n_birds + 1)
    final = (cnt[1:] / g.n_in).tolist()
    return dict(hist=hist, final=final, flips=flips, lead_changes=lead_changes,
                hits=[b.hits for b in birds], dives=[b.dives for b in birds], taken=[b.hit_taken for b in birds], g=g, towers=towers)


def summarize(n_runs=20, n_birds=6, c=CFG, label=""):
    import statistics as stt
    res = []
    for s in range(n_runs):
        r = run(n_birds, s, c)
        res.append(r)
    def at(r, tq):
        for h in r["hist"]:
            if h["t"] >= tq: return h
        return r["hist"][-1]
    out = {}
    # epuisement neutre
    tn = []
    for r in res:
        x = next((h["t"] for h in r["hist"] if h["neutral"] < 0.10), None)
        tn.append(x if x is not None else 999)
    out["t_neutral<10%"] = stt.median(tn)
    out["neutral_final"] = stt.mean(r["hist"][-1]["neutral"] for r in res)
    out["tower_cov"] = {tq: round(stt.mean(at(r, tq)["tower"] for r in res), 3) for tq in (0, 30, 60, 80, 90, 100, 105, 110)}
    # le meneur a t=X gagne-t-il ?
    for tq in (60, 90, 100, 105):
        w = [int(np.argmax(at(r, tq)["shares"]) == int(np.argmax(r["final"]))) for r in res]
        out[f"leader@{tq}_wins"] = sum(w) / len(w)
    # ecart final 1er-2e
    gaps = []
    for r in res:
        f = sorted(r["final"], reverse=True); gaps.append(f[0] - f[1])
    out["gap_1_2_median"] = round(stt.median(gaps), 3)
    out["top_share_median"] = round(stt.median(max(r["final"]) for r in res), 3)
    out["lead_changes_median"] = stt.median(len(r["lead_changes"]) for r in res)
    out["lead_changes_after90_median"] = stt.median(len([x for x in r["lead_changes"] if x >= 90]) for r in res)
    # part du territoire final qui a change de proprietaire apres t=95 (approx via shares L1)
    dl = []
    for r in res:
        a = np.array(at(r, 95)["shares"]); b = np.array(r["final"])
        dl.append(0.5 * np.abs(a - b).sum())
    out["share_shift_after95_median"] = round(stt.median(dl), 3)
    out["hits_per_round_median"] = stt.median(sum(r["hits"]) for r in res)
    out["dives_per_round_median"] = stt.median(sum(r["dives"]) for r in res)
    out["strong_final"] = round(stt.mean(r["hist"][-1]["strong"] for r in res), 3)
    print(label, json.dumps(out, indent=1))
    return res


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "base"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    if mode == "base":
        summarize(n, 6, CFG, "BASE 6 oiseaux")
    elif mode == "four":
        c = dict(CFG); c.update(A=150.0, B=100.0)
        summarize(n, 4, c, "4 oiseaux arene 150x100")
    elif mode == "notower":
        c = dict(CFG); c.update(TOWERS="none")
        summarize(n, 6, c, "SANS TOURS")
    elif mode == "nonight":
        c = dict(CFG); c.update(NIGHT=False)
        summarize(n, 6, c, "SANS RIDEAU")
    elif mode == "one":
        import time; t0 = time.time(); r = run(6, 0, CFG); print("dur", time.time() - t0, "hits", r["hits"], "dives", r["dives"], "lc", r["lead_changes"])
        for h in r["hist"][::10]: print(h["t"], round(h["neutral"], 3), round(h["tower"], 3), [round(x, 3) for x in h["shares"]])
    elif mode == "e8":
        c = dict(CFG); c.update(E1=8.0)
        summarize(n, 6, c, "E1=8deg")
