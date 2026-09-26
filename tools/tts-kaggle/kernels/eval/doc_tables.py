"""Tables Markdown du doc de recherche (docs/research/tts-kaggle.md) à partir de metrics_systems.json.
Usage : python doc_tables.py [dossier de metrics_systems.json ; défaut tools/tts-kaggle/results]"""
import json
import sys

import os

M = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "results")
f = f"{M}/metrics_systems.json" if os.path.exists(f"{M}/metrics_systems.json") else f"{M}/work/metrics_systems.json"
S = json.load(open(f))

LABEL = {
    "pocket-lot": "Pocket, lot actuel (1 prise triée)",
    "pocket-bill": "Pocket 3.3 / bill_boerst, tempo 0,92",
    "qwen3-design": "Qwen3-TTS 1.7B / voix conçue",
    "qwen3-design@1.2": "Qwen3-TTS / voix conçue, atempo 1,2",
    "qwen3-frm": "Qwen3-TTS / clone frm",
    "qwen3-frm@1.12": "Qwen3-TTS / clone frm, atempo 1,12",
    "qwen3-bill": "Qwen3-TTS / clone bill",
    "cb-bill": "Chatterbox v3 / clone bill",
    "cb-frm": "Chatterbox v3 / clone frm",
    "vox-design": "VoxCPM2 / voix conçue",
    "vox-design@1.15": "VoxCPM2 / voix conçue, atempo 1,15",
    "vox-frm": "VoxCPM2 / clone frm",
    "vox-frm@1.1": "VoxCPM2 / clone frm, atempo 1,1",
    "vox-bill": "VoxCPM2 / clone bill",
    "cosy-bill": "CosyVoice3 / clone bill",
    "cosy-frm": "CosyVoice3 / clone frm",
    "k16-frm": "Kyutai 1.6B / frm",
    "k16-frm-slow": "Kyutai 1.6B / frm, débit lent",
    "k16-erick": "Kyutai 1.6B / erick",
    "k16-jeff": "Kyutai 1.6B / jeff",
}
DEV = {"pocket": "CPU", "qwen3": "T4", "vox": "T4", "cb": "CPU", "cosy": "CPU", "k16": "CPU"}


def f(v, d=2):
    if v is None:
        return "—"
    return f"{v:.{d}f}".replace(".", ",")


def pct(v):
    return "—" if v is None else f"{round(100 * v)} %"


def table(lang, order=None):
    rows = [(s, r[lang]) for s, r in S.items() if lang in r]
    rows.sort(key=lambda x: -(x[1]["utmosv2"] or 0))
    out = ["| système | intelligible (P / sans amorce) | p(langue) | UTMOS | UTMOSv2 | DNSMOS | parole moy. / max | ≤ 3 s | syll/s | F0 | cohérence | RTF |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for s, x in rows:
        rtf = S[s].get("rtf")
        dev = DEV.get(s.split("-")[0], "")
        out.append(
            f"| {LABEL.get(s, s)} | {pct(x['ok_p'])} / {pct(x['ok_n'])} | {f(x['lang_p'])} | {f(x['utmos'])} | {f(x['utmosv2'])} | "
            f"{f(x['dns_ovrl'])} | {f(x['speech_s'], 1)} / {f(x['speech_max'], 1)} s | {pct(x['le3s'])} | {f(x['syl_s'], 1)} | "
            f"{f(x['f0'], 0)} Hz | {f(x['spk_consist'])} | {f(rtf, 1) + ' ' + dev if rtf else '—'} |")
    return "\n".join(out)


def voices():
    out = ["| système | FR↔EN (cos) | sim. à la référence |", "|---|---|---|"]
    for s, r in sorted(S.items(), key=lambda kv: -(kv[1].get("fr_en_sim") or 0)):
        if "@" in s:
            continue
        out.append(f"| {LABEL.get(s, s)} | {f(r.get('fr_en_sim'))} | {f(r.get('ref_sim'))} {('(' + r['ref'] + ')') if r.get('ref') else ''} |")
    return "\n".join(out)


def fails():
    out = []
    for s, r in sorted(S.items()):
        for lang in ("fr", "en"):
            x = r.get(lang) or {}
            if x.get("fails"):
                out.append(f"- {LABEL.get(s, s)} ({lang.upper()}) : " + " ; ".join(x["fails"]))
    return "\n".join(out)


print("## FR\n\n" + table("fr") + "\n\n## EN\n\n" + table("en") + "\n\n## Voix\n\n" + voices() + "\n\n## Échecs\n\n" + fails())
