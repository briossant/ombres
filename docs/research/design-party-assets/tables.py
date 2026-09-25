"""Tables analytiques pour design-party.md : soleil, ombres, debits de peinture."""
import math

T_SUN = 110.0          # s, soleil de 88 deg a 5 deg (lineaire)
E0, E1 = 88.0, 5.0
H = {"BAS": 4.0, "HAUT": 16.0}
R = {"BAS": 5.0, "HAUT": 12.0}      # rayon de la bulle d'ombre (m)
V = {"BAS": 16.0, "HAUT": 22.0}     # vitesse croisiere (m/s)

def elev(t):
    return E0 + (E1 - E0) * min(max(t / T_SUN, 0), 1)

def azim(t):
    tau = min(max(t / T_SUN, 0), 1)
    return 270 - 30 * (1 - tau) ** 2

print("t(s)  e(deg) az   stretch  off_BAS off_HAUT  len_BAS len_HAUT  m2/s_BAS m2/s_HAUT (vol N-S)  m2/s_BAS m2/s_HAUT (vol E-O)")
for t in [0, 15, 30, 45, 60, 70, 80, 90, 95, 100, 105, 110]:
    e = math.radians(elev(t))
    s = 1 / math.sin(e)
    row = [t, elev(t), azim(t), s]
    row += [H["BAS"] / math.tan(e), H["HAUT"] / math.tan(e)]
    row += [2 * R["BAS"] * s, 2 * R["HAUT"] * s]
    # vol perpendiculaire a l'azimut: largeur balayee = longueur de l'ellipse
    row += [2 * R["BAS"] * s * V["BAS"], 2 * R["HAUT"] * s * V["HAUT"]]
    # vol parallele a l'azimut: largeur balayee = 2r
    row += [2 * R["BAS"] * V["BAS"], 2 * R["HAUT"] * V["HAUT"]]
    print("{:4.0f} {:6.1f} {:5.1f} {:6.2f} {:8.1f} {:8.1f} {:8.1f} {:8.1f} {:9.0f} {:9.0f} {:9.0f} {:9.0f}".format(*row))

print()
print("Aires d'ombre (m2) :")
for t in [0, 60, 90, 100, 110]:
    e = math.radians(elev(t)); s = 1 / math.sin(e)
    print(t, "BAS", round(math.pi * R["BAS"] ** 2 * s), "HAUT", round(math.pi * R["HAUT"] ** 2 * s))

print()
print("Tour: longueur d'ombre d'un fut de hauteur h (m) :")
for e_deg in [88, 70, 45, 30, 20, 15, 10, 7, 5]:
    e = math.radians(e_deg)
    print(e_deg, [round(h / math.tan(e)) for h in (25, 35, 50, 65, 80)])

# Integrale cumulee du "multiplicateur" (etirement) : quelle part du potentiel de peinture
# est dans chaque phase ?
print()
dt = 0.1
tot = 0; parts = {}
phases = [(0, 35, "Zenith"), (35, 75, "Apres-midi"), (75, 98, "Heure doree"), (98, 110, "Coucher")]
for (a, b, n) in phases:
    acc = 0; t = a
    while t < b:
        acc += (1 / math.sin(math.radians(elev(t)))) * dt
        t += dt
    parts[n] = acc; tot += acc
for n in parts:
    print(f"{n:12s} {parts[n]:6.1f} s-equiv  {100*parts[n]/tot:5.1f}% du potentiel (vol N-S)")
