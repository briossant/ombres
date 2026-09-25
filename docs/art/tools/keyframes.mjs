import { okl, hex, lab, lch, mixLab } from './lib.mjs';
// Authored keyframes (sun elevation in degrees of the *palette* clock, see ART_BIBLE §2.4)
// K0/K2/K3/K4/K5 = moebius-palettes.json unchanged; 50/25 = OKLab interpolation (checked), 10 and 1 = authored (anti-mud)
export const KF = [
 { id:'KF80', name:'Zénith', elev:80, skyTop:'#8DD3D2', skyMid:'#B5E3D9', skyHorizon:'#E6F3E3', sandLit:'#F1DABE', groundFlat:'#F1DABE', sandShade:'#CCB0A7', castShadow:'#A18EA1', ink:'#2B1D23', sun:'#FFFCF0', haze:'#EBE8DA' },
 { id:'KF50', name:'Après-midi', elev:50, skyTop:'#57B8CD', skyMid:'#93D4DA', skyHorizon:'#CFEAE8', sandLit:'#EED1A9', groundFlat:'#EED1A9', sandShade:'#C1A199', castShadow:'#8C7F98', ink:'#2B1D23', sun:'#FFF9E3', haze:'#E6DBC8' },
 { id:'KF25', name:'Fin d\'après-midi', elev:25, skyTop:'#6294C2', skyMid:'#8FCCD1', skyHorizon:'#EAE9BD', sandLit:'#F2C284', groundFlat:'#EBBC86', sandShade:'#B38887', castShadow:'#77698D', ink:'#2C1C22', sun:'#FFF4CC', haze:'#EED2A7' },
 { id:'KF16', name:'Heure dorée', elev:16, skyTop:'#6886BD', skyMid:hex(okl(0.86,0.045,165)), skyHorizon:'#F7E9A7', sandLit:'#F4BC74', groundFlat:'#EAB377', sandShade:'#AE7E80', castShadow:'#6F6089', ink:'#2D1C22', sun:'#FFF2C3', haze:'#F2CE99' },
 { id:'KF10', name:'Soleil bas', elev:10, skyTop:hex(okl(0.57,0.078,288)), skyMid:hex(okl(0.86,0.07,60)), skyHorizon:'#FBDE8C', sandLit:'#F2A96A', groundFlat:hex(okl(0.745,0.066,36)), sandShade:'#977B86', castShadow:'#62567D', ink:'#2A1A22', sun:'#FFECB7', haze:'#EEBA90' },
 { id:'KF3', name:'Coucher', elev:3.5, skyTop:'#795C87', skyMid:'#EC9C63', skyHorizon:'#FFD16B', sandLit:'#EF945F', groundFlat:'#82788B', sandShade:'#7D768C', castShadow:'#554C70', ink:'#261721', sun:'#FFE6A9', haze:'#E8A587' },
 { id:'KF1', name:'Soleil sur la Falaise', elev:1, skyTop:hex(okl(0.46,0.075,305)), skyMid:hex(okl(0.72,0.13,45)), skyHorizon:hex(okl(0.86,0.135,78)), sandLit:hex(okl(0.70,0.135,38)), groundFlat:hex(okl(0.565,0.032,302)), sandShade:hex(okl(0.545,0.035,298)), castShadow:hex(okl(0.42,0.058,292)), ink:hex(okl(0.22,0.03,330)), sun:hex(okl(0.90,0.10,75)), haze:hex(okl(0.74,0.085,40)) },
 { id:'KF-4', name:'Crépuscule (derrière la nuit)', elev:-4, skyTop:'#272950', skyMid:'#775774', skyHorizon:'#D69F58', sandLit:'#706C7F', groundFlat:'#575568', sandShade:'#575568', castShadow:'#45455D', ink:'#181322', sun:'#F6B669', haze:'#816C85' },
 { id:'KF-15', name:'Nuit (résultats)', elev:-15, skyTop:'#162C55', skyMid:'#294875', skyHorizon:'#5B678C', sandLit:'#9B94AB', groundFlat:'#7B778D', sandShade:'#7B778D', castShadow:'#626079', ink:'#131423', sun:'#E3F0FE', haze:'#69708F' },
];
// hatch opacity (ink) per keyframe, and mix of the hatch colour towards castShadow
export const HATCH = { KF80:[0.30,0.0], KF50:[0.35,0.0], KF25:[0.38,0.05], KF16:[0.40,0.10], KF10:[0.42,0.15], KF3:[0.42,0.20], KF1:[0.40,0.25], 'KF-4':[0.25,0.30], 'KF-15':[0.20,0.35] };
// territory chroma per keyframe (strong wash, before per-player scale)
export const PAINT_C = { KF80:0.105, KF50:0.105, KF25:0.11, KF16:0.115, KF10:0.12, KF3:0.13, KF1:0.135, 'KF-4':0.13, 'KF-15':0.12 };
