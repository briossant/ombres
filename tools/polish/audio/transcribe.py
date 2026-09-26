#!/usr/bin/env python3
"""Transcrit les répliques extraites par analyze.py --clips : mix réel vs voix seule.

  tools/tts/tts.sh-like : LD_LIBRARY_PATH=$NIX_LD_LIBRARY_PATH tools/tts/.venv/bin/python \
      tools/polish/audio/transcribe.py <dossier clips> <analysis.json> [--model small|large-v3-turbo] [--lang fr]

Pour chaque réplique : texte attendu (sous-titre), transcription du MIX (ce qu'entend le salon)
et de la VOIX SEULE (même clip, stem voix), taux d'erreur par caractère (CER) et nom de couleur
retrouvé ou non. Whisper sert d'auditeur de substitution : un écart mix/voix seule = masquage.
"""
import json, os, re, sys, unicodedata, glob
from faster_whisper import WhisperModel

args = sys.argv[1:]
CLIPS, ANALYSIS = args[0], args[1]
MODEL = args[args.index('--model') + 1] if '--model' in args else 'small'
LANG = args[args.index('--lang') + 1] if '--lang' in args else 'fr'
an = json.load(open(ANALYSIS))
# amorce : les 12 noms de couleur (un joueur les connaît : ils sont écrits partout à l'écran)
PROMPT = None if '--noprompt' in args else 'Corail, Lagon, Indigo, Safran, Azur, Carmin, Prune, Anis, Sarcelle, Rose, Lilas, Jade.'
name = an['name']
COLORS_FR = ['Corail', 'Lagon', 'Indigo', 'Safran', 'Azur', 'Carmin', 'Prune', 'Anis', 'Sarcelle', 'Rose', 'Lilas', 'Jade']  # src/shared/palette.json


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('’', "'")
    return re.sub(r'[^a-z0-9 ]+', ' ', s).split()


def cer(ref, hyp):
    r, h = ' '.join(norm(ref)), ' '.join(norm(hyp))
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=4)
out = []
for k, l in enumerate(an['lines']):
    base = os.path.join(CLIPS, f'{name}_{k:02d}_{l["lineId"]}')
    res = {'k': k, 't': l['t'], 'lineId': l['lineId'], 'text': l['text'], 'snrSpeech': l.get('snrSpeech'), 'worst': l.get('snrSpeechWorst400ms')}
    for kind in ['mix', 'voice']:
        f = f'{base}_{kind}.wav'
        if not os.path.exists(f):
            continue
        segs, _ = model.transcribe(f, language=LANG, beam_size=5, vad_filter=False, condition_on_previous_text=False, initial_prompt=PROMPT)
        txt = ' '.join(s.text.strip() for s in segs)
        res[kind] = txt
        res[f'cer_{kind}'] = round(cer(l['text'], txt), 3)
        if l.get('color') is not None:
            cname = COLORS_FR[l['color']] if LANG == 'fr' else None
            if cname:
                res[f'color_{kind}'] = cname.lower() in ' '.join(norm(txt))
    out.append(res)
    print(f'{l["t"]:7.1f} {l["lineId"]:16s} SNRparole={l.get("snrSpeech")} pire={l.get("snrSpeechWorst400ms")}\n   attendu : {l["text"]}\n   voix    : {res.get("voice")}  (CER {res.get("cer_voice")}, couleur {res.get("color_voice")})\n   MIX     : {res.get("mix")}  (CER {res.get("cer_mix")}, couleur {res.get("color_mix")})', flush=True)
json.dump(out, open(os.path.join(CLIPS, f'{name}.transcripts.{MODEL}.json'), 'w'), ensure_ascii=False, indent=1)
