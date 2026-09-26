
### FR

| système | prises | CER P | OK P | OK N | mots-clés | p(langue) | UTMOS | UTMOSv2 | DNSMOS | parole moy/max (s) | ≤3 s | syll/s | F0 | cohérence locuteur | best-of-3 OK | best-of-3 UTMOS | RTF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qwen3-bill | 30 | 0.100 | 0.63 | 0.37 | 0.73 | 0.22 | 4.39±0.12 | 3.50 | 3.33 | 2.74/3.08 | 0.87 | 3.64 | 119 | 0.94 | 0.80 | 4.44 | 2.40 |
| cosy-bill | 30 | 0.156 | 0.47 | 0.40 | 0.77 | 0.45 | 4.20±0.24 | 3.17 | 3.33 | 4.07/6.55 | 0.10 | 2.54 | 127 | 0.91 | 0.80 | 4.33 | 15.06 |
| cb-bill | 30 | 0.011 | 1.00 | 0.97 | 1.00 | 1.00 | 4.07±0.21 | 3.26 | 3.35 | 2.42/2.91 | 1.00 | 4.15 | 120 | 0.93 | 1.00 | 4.20 | 18.31 |
| qwen3-design | 30 | 0.008 | 1.00 | 0.90 | 1.00 | 0.99 | 4.08±0.18 | 3.49 | 3.44 | 3.18/3.71 | 0.23 | 3.16 | 86 | 0.97 | 1.00 | 4.16 | 2.35 |
| qwen3-design@1.2 | 30 | 0.008 | 1.00 | 0.93 | 1.00 | 0.99 | 4.00±0.19 | 3.47 | 3.39 | 2.68/3.14 | 0.87 | 3.76 | 87 | 0.96 | 1.00 | 4.10 | — |
| vox-bill | 30 | 0.067 | 0.67 | 0.40 | 0.83 | 0.56 | 3.84±0.34 | 2.89 | 3.34 | 2.99/4.04 | 0.67 | 3.33 | 122 | 0.94 | 0.90 | 4.07 | 2.62 |
| pocket-lot | 10 | 0.008 | 1.00 | 0.70 | 1.00 | 0.99 | 4.03±0.20 | 2.89 | 3.31 | 2.47/2.75 | 1.00 | 4.05 | 122 | 0.95 | 1.00 | 4.03 | — |
| pocket-bill | 30 | 0.014 | 0.90 | 0.60 | 0.90 | 0.98 | 3.92±0.31 | 2.85 | 3.36 | 2.44/2.81 | 1.00 | 4.11 | 116 | 0.94 | 0.90 | 4.03 | 0.56 |
| qwen3-frm | 30 | 0.009 | 1.00 | 0.90 | 1.00 | 1.00 | 3.88±0.19 | 3.49 | 3.22 | 2.89/3.48 | 0.63 | 3.46 | 79 | 0.95 | 1.00 | 4.00 | 2.27 |
| cosy-frm | 30 | 0.014 | 1.00 | 0.87 | 1.00 | 1.00 | 3.78±0.31 | 3.29 | 3.28 | 3.29/4.03 | 0.30 | 3.05 | 95 | 0.94 | 1.00 | 3.98 | 13.63 |
| qwen3-frm@1.12 | 30 | 0.008 | 1.00 | 0.90 | 1.00 | 1.00 | 3.83±0.20 | 3.47 | 3.23 | 2.60/3.10 | 0.93 | 3.85 | 79 | 0.94 | 1.00 | 3.94 | — |
| cb-frm | 30 | 0.043 | 0.90 | 0.77 | 0.97 | 1.00 | 3.77±0.21 | 3.44 | 3.14 | 2.93/4.92 | 0.70 | 3.46 | 88 | 0.94 | 1.00 | 3.89 | 13.78 |
| vox-frm@1.1 | 30 | 0.008 | 1.00 | 0.80 | 1.00 | 1.00 | 3.35±0.29 | 3.06 | 2.88 | 2.68/3.80 | 0.77 | 3.83 | 80 | 0.95 | 1.00 | 3.53 | — |
| vox-frm | 30 | 0.008 | 1.00 | 0.83 | 1.00 | 1.00 | 3.35±0.30 | 3.04 | 2.90 | 2.92/4.23 | 0.53 | 3.51 | 80 | 0.95 | 1.00 | 3.52 | 2.34 |
| k16-erick | 30 | 0.048 | 0.80 | 0.53 | 0.80 | 1.00 | 3.36±0.22 | 3.05 | 3.27 | 2.86/3.67 | 0.73 | 3.51 | 107 | 0.92 | 1.00 | 3.49 | 11.06 |
| k16-frm | 30 | 0.077 | 0.77 | 0.60 | 0.77 | 1.00 | 3.19±0.21 | 2.70 | 2.58 | 3.05/3.99 | 0.43 | 3.30 | 78 | 0.95 | 0.90 | 3.31 | 11.11 |
| k16-frm-slow | 30 | 0.070 | 0.87 | 0.50 | 0.90 | 1.00 | 3.03±0.35 | 2.54 | 2.53 | 4.20/5.84 | 0.13 | 2.45 | 77 | 0.96 | 0.90 | 3.26 | 10.34 |
| vox-design | 30 | 0.009 | 1.00 | 0.87 | 1.00 | 1.00 | 2.98±0.24 | 2.72 | 3.08 | 3.38/4.10 | 0.20 | 2.96 | 112 | 0.96 | 1.00 | 3.11 | 2.38 |
| vox-design@1.15 | 30 | 0.009 | 1.00 | 0.87 | 1.00 | 1.00 | 2.88±0.25 | 2.70 | 3.13 | 2.95/3.58 | 0.53 | 3.39 | 112 | 0.96 | 1.00 | 3.00 | — |
| k16-jeff | 30 | 0.135 | 0.57 | 0.53 | 0.73 | 0.61 | 2.53±0.39 | 2.68 | 2.58 | 2.97/4.12 | 0.63 | 3.39 | 82 | 0.93 | 1.00 | 2.76 | 11.03 |

### EN

| système | prises | CER P | OK P | OK N | mots-clés | p(langue) | UTMOS | UTMOSv2 | DNSMOS | parole moy/max (s) | ≤3 s | syll/s | F0 | cohérence locuteur | best-of-3 OK | best-of-3 UTMOS | RTF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qwen3-bill | 24 | 0.006 | 1.00 | 0.88 | 1.00 | 1.00 | 4.43±0.05 | 3.59 | 3.28 | 2.50/3.03 | 0.96 | 4.05 | 122 | 0.94 | 1.00 | 4.46 | 2.40 |
| cosy-bill | 24 | 0.018 | 0.92 | 0.88 | 0.92 | 0.98 | 4.37±0.11 | 3.58 | 3.32 | 2.97/3.99 | 0.54 | 3.41 | 126 | 0.94 | 1.00 | 4.44 | 15.06 |
| cb-bill | 24 | 0.012 | 0.96 | 0.92 | 0.96 | 1.00 | 4.36±0.14 | 3.59 | 3.31 | 2.46/2.81 | 1.00 | 4.06 | 118 | 0.95 | 1.00 | 4.41 | 18.31 |
| pocket-bill | 24 | 0.038 | 0.83 | 0.92 | 0.83 | 1.00 | 4.36±0.11 | 3.33 | 3.37 | 2.49/2.89 | 1.00 | 4.04 | 119 | 0.95 | 0.88 | 4.39 | 0.56 |
| pocket-lot | 8 | 0.000 | 1.00 | 1.00 | 1.00 | 1.00 | 4.36±0.08 | 3.27 | 3.36 | 2.55/2.84 | 1.00 | 3.92 | 125 | 0.95 | 1.00 | 4.36 | — |
| qwen3-design | 24 | 0.028 | 0.92 | 0.75 | 1.00 | 0.77 | 4.27±0.17 | 3.68 | 3.44 | 3.20/4.25 | 0.33 | 3.12 | 89 | 0.94 | 1.00 | 4.35 | 2.35 |
| cb-frm | 24 | 0.023 | 0.92 | 0.79 | 0.96 | 0.97 | 4.24±0.15 | 3.68 | 3.18 | 3.01/5.40 | 0.50 | 3.39 | 88 | 0.93 | 1.00 | 4.35 | 13.78 |
| qwen3-design@1.2 | 24 | 0.018 | 0.96 | 0.88 | 1.00 | 0.68 | 4.23±0.19 | 3.57 | 3.41 | 2.72/3.63 | 0.79 | 3.68 | 89 | 0.93 | 1.00 | 4.35 | — |
| vox-bill | 24 | 0.018 | 0.96 | 0.79 | 0.96 | 1.00 | 4.17±0.27 | 3.16 | 3.34 | 2.45/3.02 | 0.96 | 4.11 | 123 | 0.95 | 1.00 | 4.33 | 2.62 |
| qwen3-frm | 24 | 0.015 | 1.00 | 0.83 | 1.00 | 0.32 | 4.23±0.19 | 3.71 | 3.27 | 3.15/4.32 | 0.29 | 3.19 | 84 | 0.94 | 1.00 | 4.30 | 2.27 |
| qwen3-frm@1.12 | 24 | 0.015 | 1.00 | 0.83 | 1.00 | 0.31 | 4.22±0.17 | 3.67 | 3.26 | 2.84/3.86 | 0.58 | 3.54 | 85 | 0.94 | 1.00 | 4.28 | — |
| cosy-frm | 24 | 0.048 | 0.71 | 0.42 | 0.88 | 0.70 | 4.11±0.33 | 3.35 | 3.28 | 3.59/4.63 | 0.12 | 2.80 | 100 | 0.93 | 0.88 | 4.24 | 13.63 |
| vox-frm | 24 | 0.052 | 0.79 | 0.75 | 0.92 | 0.42 | 3.78±0.24 | 3.07 | 3.04 | 3.22/4.91 | 0.38 | 3.13 | 84 | 0.95 | 0.88 | 3.94 | 2.34 |
| vox-frm@1.1 | 24 | 0.045 | 0.88 | 0.67 | 0.92 | 0.44 | 3.74±0.26 | 3.12 | 2.98 | 2.93/4.22 | 0.54 | 3.44 | 84 | 0.95 | 1.00 | 3.94 | — |
| k16-erick | 24 | 0.075 | 0.71 | 0.50 | 0.96 | 0.36 | 3.65±0.17 | 3.05 | 3.26 | 2.94/3.55 | 0.58 | 3.40 | 107 | 0.94 | 0.88 | 3.80 | 11.06 |
| k16-frm | 24 | 0.028 | 0.92 | 0.75 | 0.96 | 0.61 | 3.60±0.22 | 2.94 | 2.48 | 2.93/3.98 | 0.54 | 3.42 | 77 | 0.93 | 1.00 | 3.69 | 11.11 |
| k16-frm-slow | 24 | 0.014 | 0.92 | 0.88 | 0.96 | 0.48 | 3.51±0.19 | 2.67 | 2.30 | 4.12/5.75 | 0.04 | 2.43 | 78 | 0.93 | 1.00 | 3.58 | 10.34 |
| vox-design | 24 | 0.076 | 0.79 | 0.79 | 0.88 | 0.45 | 3.40±0.27 | 2.97 | 3.10 | 3.63/4.62 | 0.08 | 2.75 | 119 | 0.94 | 0.88 | 3.53 | 2.38 |
| vox-design@1.15 | 24 | 0.094 | 0.75 | 0.79 | 0.88 | 0.45 | 3.31±0.26 | 2.94 | 3.16 | 3.17/4.03 | 0.42 | 3.15 | 118 | 0.94 | 0.75 | 3.46 | — |
| k16-jeff | 24 | 0.062 | 0.83 | 0.62 | 0.83 | 0.89 | 3.02±0.29 | 2.81 | 2.38 | 2.69/3.55 | 0.88 | 3.71 | 79 | 0.93 | 0.88 | 3.27 | 11.03 |

### Voix

| système | FR↔EN (cos) | sim. référence |
|---|---|---|
| cb-bill | 0.707 | 0.847 (bill) |
| cb-frm | 0.928 | 0.908 (frm) |
| cosy-bill | 0.934 | 0.920 (bill) |
| cosy-frm | 0.974 | 0.934 (frm) |
| k16-erick | 0.990 | — () |
| k16-frm | 0.976 | 0.946 (frm) |
| k16-frm-slow | 0.982 | 0.946 (frm) |
| k16-jeff | 0.978 | — () |
| pocket-bill | 0.730 | 0.842 (bill) |
| pocket-lot | 0.730 | 0.850 (bill) |
| qwen3-bill | 0.989 | 0.952 (bill) |
| qwen3-design | 0.979 | 0.958 (qwen3_design) |
| qwen3-design@1.2 | 0.974 | — () |
| qwen3-frm | 0.982 | 0.927 (frm) |
| qwen3-frm@1.12 | 0.981 | — () |
| vox-bill | 0.967 | 0.950 (bill) |
| vox-design | 0.971 | 0.957 (vox_design) |
| vox-design@1.15 | 0.967 | — () |
| vox-frm | 0.984 | 0.953 (frm) |
| vox-frm@1.1 | 0.984 | — () |

### Échecs ASR (P)

- **cb-bill en** : en.golden1.t1: « The Shadows are getting ambitious. »
- **cb-frm fr** : fr.tenSeconds3.t2: « Tout peut encore basculer. » ; fr.leaderChange1.1.t2: « Lagon prend la tête. Le sable bivite. » ; fr.leaderChange4.7.t0: « Anis mène la danse. Les dunes suivent. Les dunes suivent. »
- **cb-frm en** : en.leaderChange1.4.t0: « As Yur takes the lead, Sand forgets. » ; en.bigSteal.10.t1: « Lilac, just swallow the peace of the desert. »
- **cosy-bill fr** : fr.golden1.t0: « C'est l'air doré, les ombres foigrant. » ; fr.greatShadow1.t1: « La nuit tombe de la falaise. Elle fiche tout. » ; fr.tenSeconds3.t0: « Des secondes, tout peut encore basculer. » ; fr.leaderChange1.1.t1: « La langue prend la tête, la cible oublie vite. » ; fr.bigSteal.5.t1: « Carmin vient d'Avalare, où Morceau de Dessaires. » ; fr.dodge.8.t0: « Sarcelle Escuive, Les Serres, Etrepe, Duvin. » ; fr.dodge.8.t2: « Sarcelle Escuive Les cerfs attrapent du vin. » ; fr.leaderChange4.7.t1: « Anismen, La Danse, Ledoune, Suivre. » ; fr.greatShadow1.t2: « La nuit tombe de la falaise » ; fr.leaderChange1.1.t0: « Lagoon prend la tête, la sable oublie vite. 4. Gap » ; fr.bigSteal.5.t0: « Carmin, Viande de Valais, Amour-Saut de Désert. » ; fr.bigSteal.5.t2: « Camédiens de Valais, un morceau de désert. »
- **cosy-bill en** : en.lastRay.5.t1: « Carmen stole the last of the light. » ; en.golden1.t2: « The Shadows are getting ambitious. »
- **cosy-frm en** : en.tenSeconds2.t0: « 10 secondes. The desert holds its breath. » ; en.tenSeconds2.t2: « 10 secondes. The desert holds its breath. » ; en.leaderChange1.4.t2: « Aziel takes the lead. Son forgets. » ; en.dodge.3.t0: « Saffron Dodge, Taloncloth Honor. » ; en.dodge.3.t2: « Saffron, Doge, Talon, Clause and Nair. » ; en.leaderChange2.2.t0: « Indigo moves ahead. The Sun side coming. » ; en.dodge.3.t1: « Saffron Dodge, Talon, Claws on Air. »
- **k16-erick fr** : fr.greatShadow1.t1: « La nuit tombe de la falaise, elle fiche tout. » ; fr.tenSeconds3.t0: « Tout peut encore basculer. » ; fr.firstCrown.3.t2: « Tout le monde la voit. » ; fr.dodge.8.t0: « Carcelle esquive, les cerfs attrapent du vent. » ; fr.huntStreak.4.t0: « Chasse encore, surveillez le ciel. » ; fr.huntStreak.4.t2: « Chasse encore, surveillez le ciel. »
- **k16-erick en** : en.dodge.3.t0: « Saffron dodges » ; en.golden1.t1: « In the golden hour, the shadows are getting ambitious. » ; en.golden1.t0: « In the golden hour, the shadows are getting ambitious. » ; en.golden1.t2: « In the golden hour, the shadows are getting ambitious. » ; en.firstCrown.7.t0: « Anise wears the crown, Mind talents. » ; en.bigSteal.10.t1: « I swallowed a piece of the desert. » ; en.dodge.3.t1: « Saffron, Dodges, Talon, Claws, On Air. »
- **k16-frm fr** : fr.golden1.t0: « C'est l'eau n'est pas absolument incompressible, elle est du moins » ; fr.tenSeconds3.t2: « 60 secondes, tout peut encore basculer. » ; fr.tenSeconds3.t0: « Tout peut encore basculer. » ; fr.dodge.8.t0: « Parcelles esquivent, les cerfs attrapent du vent. » ; fr.golden1.t1: « C'est l'or doré, les ombres voient grand. » ; fr.tenSeconds3.t1: « Tout peut encore basculer. » ; fr.dodge.8.t1: « Carcelle esquive, les cerfs attrapent du vent. »
- **k16-frm en** : en.golden1.t1: « The shadows are getting ambitious. » ; en.tenSeconds2.t1: « Within ten seconds, the desert holds its breath. »
- **k16-frm-slow fr** : fr.tenSeconds3.t0: « Tout peut encore basculer. » ; fr.firstCrown.3.t2: « Safran porte la couronne. Or, tout le n'est pas absolument incompressible et du » ; fr.tenSeconds3.t2: « Tout peut encore basculer. » ; fr.tenSeconds3.t1: « Tout peut encore basculer. »
- **k16-frm-slow en** : en.golden1.t1: « Golden Owl. The shadows are getting ambitious. » ; en.golden1.t2: « In the golden hour, the shadows are getting ambitious. »
- **k16-jeff fr** : fr.leaderChange1.1.t1: « Nous allons prendre la tête. Le sable oublie vite. » ; fr.huntStreak.4.t1: « La dure chasse encore, surveilleuse le ciel. » ; fr.golden1.t0: « C'est le doré. Les ombres voient grande. » ; fr.tenSeconds3.t2: « 6 secondes, tout peut encore basculer. » ; fr.bigSteal.5.t1: « Carmin, Venda, Valère et Morsod, Désir. » ; fr.dodge.8.t2: « Les cerfs attrapent du vent. » ; fr.leaderChange4.7.t1: « Une semaine à la danse, la journée suivante. » ; fr.tenSeconds3.t1: « Tu peux encore basculer. » ; fr.leaderChange1.1.t2: « Les enfants prennent la tête, les sables oublient vite. » ; fr.bigSteal.5.t2: « Carmin rentre dans un morceau de désert. » ; fr.dodge.8.t1: « Sarcelle Esquive, le seré à trappe du vent. » ; fr.huntStreak.4.t0: « Azur chassait encore, surveillait le ciel. »
- **k16-jeff en** : en.golden1.t1: « The shadows are getting ambitious. » ; en.golden1.t0: « The Shadows are getting ambitious. » ; en.golden1.t2: « The shadows are getting ambitious. » ; en.lastRay.5.t2: « Arma installs the last of the light. »
- **pocket-bill fr** : fr.greatShadow1.t1: « La nuit tombe de la falaise, elle fiche tout. » ; fr.greatShadow1.t0: « La nuit tombe de la falaise, elle fiche tout. » ; fr.greatShadow1.t2: « La nuit tombe de la falaise, elle fiche tout. »
- **pocket-bill en** : en.golden1.t1: « The Shadows are getting ambitious. » ; en.golden1.t0: « The Shadows are getting ambitious. » ; en.golden1.t2: « The Shadows are getting ambitious. » ; en.lastRay.5.t0: « Carmen stole the last of the light. »
- **qwen3-bill fr** : fr.golden1.t0: « C'est l'air d'oreille, les ombres voient grand. » ; fr.golden1.t2: « C'est l'heure d'oreille. Les oeuvres voient grand. » ; fr.greatShadow1.t1: « La Nuit Tôme de la Falaise » ; fr.tenSeconds3.t0: « Dites secundides, tout peut encore basculer. » ; fr.tenSeconds3.t2: « Des secondes, tout peut encore basculer. » ; fr.dodge.8.t2: « Sarcelle Esquive, Les Serres à Trappes du Vin. » ; fr.golden1.t1: « C'est l'heure d'aurrer. Les ombres voient grand. » ; fr.greatShadow1.t0: « La Nuit Tôme de la Falaise » ; fr.greatShadow1.t2: « La nuit tombe de la falaise. Elle fiche tout. » ; fr.leaderChange1.1.t0: « Lagon, Prun, La Tête, La Cible, Oublie, Vite. » ; fr.dodge.8.t1: « Sarcelle Esquive, Les Serres à Trappes du Vannes. »
- **qwen3-design en** : en.dodge.3.t0: « Saffron Dodge, Clothes on Air. » ; en.dodge.3.t1: « Saffron Dodge, Talon, Clozonner. »
- **qwen3-design@1.2 en** : en.dodge.3.t1: « Saffron Dodge, Talon, Clozonner. »
- **vox-bill fr** : fr.golden1.t0: « C'est l'air doré, les ombres voient grand. » ; fr.greatShadow1.t1: « La nuit tombe de la falaise. Elfiche 2. » ; fr.golden1.t2: « C'est l'air doré, les ombres voient grand. » ; fr.golden1.t1: « A l'heure adorée, les ombres voient grand. » ; fr.greatShadow1.t2: « La Nuit Tombe de la Falaise, El Fij 2. » ; fr.leaderChange1.1.t0: « Lagon Pralatet, Le Sable Oublivit. » ; fr.firstCrown.3.t1: « Safran porte le courant tout le monde le voit. » ; fr.dodge.8.t1: « Sarcelle esquive. Les cerfs attrapent Duval. » ; fr.huntStreak.4.t2: « Azur chasse encore. Servier le ciel. » ; fr.roundWin2.10.t1: « Les désirs s'endorment chez Lilas, ce soir. »
- **vox-bill en** : en.bigSteal.10.t1: « Ilac just swallowed a piece of the desert. »
- **vox-design en** : en.tenSeconds2.t0: « The desert holds its breath. » ; en.dodge.3.t2: « Saffron Doge, Talonclose in air. » ; en.tenSeconds2.t2: « The desert holds its breath. » ; en.tenSeconds2.t1: « The desert holds its breath. » ; en.dodge.3.t1: « Saffron Dodge, Clothes on Air. »
- **vox-design@1.15 en** : en.tenSeconds2.t0: « Dans ce gond, the desert holds its breath. » ; en.dodge.3.t2: « Saffron Doge. Talon Claws on air. » ; en.tenSeconds2.t2: « The desert holds its breath. » ; en.dodge.3.t0: « Saffron Dodge » ; en.tenSeconds2.t1: « The desert holds its breath. » ; en.dodge.3.t1: « Saffron dodges. Feet close in air. »
- **vox-frm en** : en.tenSeconds2.t2: « The desert holds its breath. » ; en.dodge.3.t0: « Saffron, Doge, Talon, Claws on Air. » ; en.dodge.3.t2: « Saffron Dodge, Talon, Clozonair. » ; en.tenSeconds2.t1: « Tout un second, the desert holds its breath. » ; en.dodge.3.t1: « Saffron Dodge, Talon Claws on Air. »
- **vox-frm@1.1 en** : en.tenSeconds2.t2: « The desert holds its breath. » ; en.dodge.3.t0: « Saffron, Doge, Talon, Claws on Air. » ; en.tenSeconds2.t1: « Tout un second, the desert holds its breath. »