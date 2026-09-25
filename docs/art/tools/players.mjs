import { okl } from './lib.mjs';
// Final v3. Order in this array = assignment order (slot 1..12).
// id: [L,C,h] identity colour (cape, saddle, wing band, UI swatch). terr: wash params (dL, cs) ; hue shared with identity.
export const PLAYERS = [
 { fr:'Corail',   en:'Coral',   L:0.67, C:0.150, h:40,  dL:-0.053, cs:1.15, glyph:'croix',     glyphEn:'cross',    pattern:'lignes45' },
 { fr:'Lagon',    en:'Lagoon',  L:0.83, C:0.105, h:192, dL: 0.060, cs:0.92, glyph:'vagues',    glyphEn:'waves',    pattern:'lignes0' },
 { fr:'Indigo',   en:'Indigo',  L:0.46, C:0.150, h:274, dL:-0.109, cs:1.07, glyph:'croissant', glyphEn:'crescent', pattern:'points' },
 { fr:'Safran',   en:'Saffron', L:0.87, C:0.145, h:89,  dL: 0.056, cs:1.15, glyph:'disque',    glyphEn:'disc',     pattern:'lignes90' },
 { fr:'Azur',     en:'Azure',   L:0.65, C:0.130, h:244, dL:-0.019, cs:0.96, glyph:'triangle',  glyphEn:'triangle', pattern:'lignes135' },
 { fr:'Carmin',   en:'Carmine', L:0.49, C:0.155, h:12,  dL:-0.120, cs:1.15, glyph:'carre',     glyphEn:'square',   pattern:'grille' },
 { fr:'Prune',    en:'Plum',    L:0.58, C:0.120, h:322, dL:-0.070, cs:0.94, glyph:'goutte',    glyphEn:'drop',     pattern:'grilleDiag' },
 { fr:'Anis',     en:'Anise',   L:0.76, C:0.145, h:133, dL: 0.052, cs:1.15, glyph:'etoile',    glyphEn:'star',     pattern:'vagues' },
 { fr:'Sarcelle', en:'Teal',    L:0.47, C:0.085, h:209, dL:-0.091, cs:0.94, glyph:'chevron',   glyphEn:'chevron',  pattern:'tirets0' },
 { fr:'Rose',     en:'Rose',    L:0.79, C:0.115, h:1,   dL: 0.059, cs:0.96, glyph:'losange',   glyphEn:'diamond',  pattern:'anneaux' },
 { fr:'Lilas',    en:'Lilac',   L:0.76, C:0.115, h:290, dL: 0.049, cs:1.15, glyph:'anneau',    glyphEn:'ring',     pattern:'zigzag' },
 { fr:'Jade',     en:'Jade',    L:0.61, C:0.118, h:152, dL:-0.097, cs:0.93, glyph:'eclair',    glyphEn:'bolt',     pattern:'tirets90' },
];
export const idColor = p => okl(p.L, p.C, p.h);
