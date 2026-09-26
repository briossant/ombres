// Vérification complète de l'audio (≈ 10 min ; serveur de dev lancé, --port=8804 par défaut) :
// 1. typage (fichiers audio) et tests unitaires ; 2. boucles sans couture ; 3. manche complète
// rendue hors ligne avec la vraie simulation + 6 bots (sonie par section, crêtes, clics, tonalité) ;
// 4. narrateur (voix, sous-titres, ducking) ; 5. parcours temps réel de tous les écrans ;
// 6. coût CPU du thread audio par écran.
//   node tools/audio-verify.mjs [--port=8804]
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const opt = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const port = opt.port ?? 8804
const sh = (cmd, ignoreFail = true) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
  } catch (e) {
    if (!ignoreFail) throw e
    return String(e.stdout ?? '')
  }
}
const nixPy = cmd => `nix-shell -p 'python3.withPackages(p:[p.numpy p.scipy p.soundfile p.matplotlib])' ffmpeg --run '${cmd}'`

console.log('── 1. typage et tests')
const tsc = sh('npx tsc --noEmit -p tsconfig.json').split('\n').filter(l => /^src\/(host\/audio|host\/bus|dev\/audio)/.test(l))
console.log(tsc.length ? tsc.join('\n') : '  typage audio : OK')
console.log('  ' + (sh('npx vitest run src/host/audio').split('\n').find(l => /Tests/.test(l)) ?? '').trim())
console.log('── 2. boucles')
console.log(sh(nixPy('python3 tools/audio-analyze.py loop public/audio/sfx/*loop*.ogg public/audio/music/samples/tanpura_A2.ogg public/audio/music/lobby_*.ogg')).trim().replace(/^/gm, '  '))
console.log('── 3. manche complète (vraie simulation + bots), tous les bus')
sh(`node tools/audio-render.mjs --port=${port} --real --out=shots/audio/verify_round.wav --analyze`)
const r = JSON.parse(readFileSync('shots/audio/verify_round.json', 'utf8'))
console.log(`  intégrée ${r.integrated_lufs} LUFS · crête ${r.peak_dbfs} dBFS · clics isolés ${r.clicks.length} · spectrogramme shots/audio/verify_round.png`)
for (const s of r.sections) console.log(`  ${s.name.padEnd(12)} ${String(s.lufs).padStart(6)} LUFS  crête ${String(s.peak).padStart(6)}  la mineur pent. ${Math.round(100 * s.pentatonic_share)} %`)
console.log('── 4. narrateur')
const n = sh(`node tools/audio-narrator-check.mjs --port=${port}`)
const d = JSON.parse(n.slice(n.indexOf('{'), n.lastIndexOf('}') + 1))
for (const [k, v] of Object.entries(d)) console.log(`  ${k.padEnd(6)} affiché=${v.shown} voix=${v.voiced} durée=${v.duration} s  voix RMS crête=${v.voiceRmsPeakDb} dB  ducking min=${v.duckMin}`)
console.log('── 5. parcours temps réel (RMS/crête par bus, dB)')
console.log(sh(`node tools/audio-flow-check.mjs --port=${port}`).trim().replace(/^/gm, '  '))
console.log('── 6. coût CPU du thread audio')
console.log(sh(`node tools/audio-cpu.mjs --port=${port} --window=5`).trim().replace(/^/gm, '  '))
