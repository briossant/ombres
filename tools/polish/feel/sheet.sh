#!/usr/bin/env bash
# Planche contact : sheet.sh <sortie.jpg> <colonnes> <largeur> fichiers...
out=$1; cols=$2; w=$3; shift 3
h=$(( w * 9 / 16 ))
montage -font "/nix/store/qwnwwzfwipdi17c7icw2l709bpdcaakv-home-manager-path/share/fonts/truetype/NerdFonts/JetBrainsMono/JetBrainsMonoNLNerdFont-Medium.ttf" -label '%t' "$@" -tile ${cols}x -geometry ${w}x${h}+2+2 -pointsize 11 -background '#222' -fill '#eee' "$out"
