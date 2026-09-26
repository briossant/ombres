"""Ombres — outils communs du banc TTS sur Kaggle (texte, CER, signal).

Copié dans le dataset privé `ombres-tts-bench-data` ; les kernels l'importent depuis /kaggle/input.
Normalisation et CER identiques à tools/tts/gen.py (AsrChecker) pour que les chiffres soient comparables.
"""
from __future__ import annotations

import re
import unicodedata

import numpy as np

# ------------------------------------------------------------------ texte
NUMS = {
    "fr": "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize "
          "dix-sept dix-huit dix-neuf vingt".split(),
    "en": "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
          "sixteen seventeen eighteen nineteen twenty".split(),
}
SAME = {
    "fr": [("lheuredoree", "leurdore"), ("sonombre", "sonnombre"), ("envoit", "envoie")],
    "en": [],
}


def norm(s: str, lang: str) -> str:
    """Minuscules, sans accents, espaces ni ponctuation ; nombres ≤ 20 en lettres (comme gen.py)."""
    units = NUMS.get(lang, [])
    s = re.sub(r"\b(\d{1,2})\b", lambda m: units[int(m.group(1))] if int(m.group(1)) < len(units) else m.group(1), s)
    s = unicodedata.normalize("NFD", s.lower().replace("’", "'"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "", s)
    for a, b in SAME.get(lang, []):
        s = s.replace(a, b)
    return s


def cer(ref: str, hyp: str, lang: str) -> float:
    r, h = norm(ref, lang), norm(hyp, lang)
    if not r:
        return 0.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hc in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc))
        prev = cur
    return prev[-1] / len(r)


def keywords_missing(keywords: list[str], hyp: str, lang: str) -> list[str]:
    hn = norm(hyp, lang)
    out = []
    for k in keywords or []:
        alts = [norm(a, lang) for a in k.split("|")]
        if not any(a and a in hn for a in alts):
            out.append(k.split("|")[0])
    return out


_V = {"fr": "aeiouyàâäéèêëîïôöùûüœæ", "en": "aeiouy"}


def syllables(text: str, lang: str) -> int:
    """Nombre de syllabes (heuristique orthographique ; sert à comparer des systèmes sur le même texte)."""
    n = 0
    for w in re.findall(r"[a-zàâäéèêëîïôöùûüœæç]+", text.lower().replace("’", "'")):
        groups = re.findall(f"[{_V[lang]}]+", w)
        k = len(groups)
        if lang == "fr":
            if k > 1 and re.search(r"(e|es|ent)$", w) and not re.search(r"(ée|ées|ie|ue)s?$", w):
                k -= 1  # e muet final (« tête », « suivent »)
        else:
            if k > 1 and w.endswith("e") and not w.endswith(("le", "ee", "ie", "ye")):
                k -= 1
            if w.endswith("ed") and k > 1 and not w.endswith(("ted", "ded")):
                k -= 1
            if w.endswith("es") and k > 1 and not w.endswith(("ses", "xes", "zes", "ches", "shes", "ges", "ces")):
                k -= 1
        n += k  # « c' », « l' », « d' » : pas de voyelle, pas de syllabe
    return n


def letters(text: str) -> int:
    return len(re.sub(r"[^A-Za-zÀ-ÿœæ]", "", text))


# ------------------------------------------------------------------ signal (mêmes règles que gen.py)
def _db_frames(y: np.ndarray, sr: int):
    hop = max(1, int(sr * 0.01))
    n = len(y) // hop
    if n == 0:
        return hop, np.zeros(0)
    return hop, 20 * np.log10(np.sqrt((y[: n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12))


def voiced_bounds(y: np.ndarray, sr: int, gate_db: float = 45.0):
    hop, db = _db_frames(y, sr)
    if len(db) == 0:
        return None
    idx = np.where(db > db.max() - gate_db)[0]
    if len(idx) == 0:
        return None
    breaks = np.where(np.diff(idx) > 20)[0]
    first, last = 0, len(idx) - 1
    while len(breaks) and breaks[0] >= first and idx[breaks[0]] - idx[first] < 10:
        first, breaks = breaks[0] + 1, breaks[1:]
    while len(breaks) and breaks[-1] < last and idx[last] - idx[breaks[-1] + 1] < 10:
        last, breaks = breaks[-1], breaks[:-1]
    idx = idx[first:last + 1]
    return max(0, idx[0] * hop - int(0.05 * sr)), min(len(y), (idx[-1] + 1) * hop + int(0.06 * sr))


def compact_pauses(y: np.ndarray, sr: int, max_pause_s: float, gate_db: float = 40.0) -> np.ndarray:
    hop, db = _db_frames(y, sr)
    if len(db) < 3 or max_pause_s <= 0:
        return y
    active = db > db.max() - gate_db
    idx = np.where(active)[0]
    if len(idx) < 2:
        return y
    keep, xf = int(max_pause_s * sr), int(0.008 * sr)
    cuts, run_start = [], None
    for i in range(idx[0], idx[-1] + 1):
        if not active[i]:
            run_start = i if run_start is None else run_start
        elif run_start is not None:
            a, b = run_start * hop, i * hop
            excess = (b - a) - keep
            if excess > xf:
                c0 = a + (b - a - excess) // 2
                cuts.append((c0, c0 + excess))
            run_start = None
    if not cuts:
        return y
    out, pos = [], 0
    for c0, c1 in cuts:
        head, tail = y[pos:c0].copy(), y[c1:c1 + xf]
        if len(head) >= xf and len(tail) == xf:
            ramp = np.linspace(0, 1, xf, dtype=np.float32)
            head[-xf:] = head[-xf:] * (1 - ramp) + tail * ramp
            out.append(head)
            pos = c1 + xf
        else:
            out.append(head)
            pos = c1
    out.append(y[pos:])
    return np.concatenate(out).astype(np.float32)


def fade(y: np.ndarray, sr: int, fin: float = 0.005, fout: float = 0.03) -> np.ndarray:
    y = y.copy()
    fi, fo = int(fin * sr), int(fout * sr)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    return y


def speech_stats(y: np.ndarray, sr: int) -> dict:
    hop, db = _db_frames(y, sr)
    idx = np.where(db > db.max() - 40)[0] if len(db) else []
    if len(idx) == 0:
        return {"speech_s": 0.0, "max_pause_s": 0.0}
    gaps = np.diff(idx) - 1
    return {"speech_s": round((idx[-1] - idx[0] + 1) * 0.01, 3),
            "max_pause_s": round(float(gaps.max() * 0.01) if len(gaps) else 0.0, 3)}


def ship_like(y: np.ndarray, sr: int, max_pause_s: float = 0.42) -> np.ndarray:
    """Ce que le lot ferait de la prise : rognage des bords, pauses internes plafonnées, fondus."""
    b = voiced_bounds(y, sr)
    if b:
        y = y[b[0]:b[1]]
    y = compact_pauses(y, sr, max_pause_s)
    return fade(y, sr)
