// QA technique : navigateur sans WebGL (GPU sur liste noire, bureau à distance, --disable-3d-apis) :
// que voit le joueur ? (aucun repli prévu, aucune ErrorBoundary)
//   PORT=8824 node tools/polish/tech/nowebgl.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, SHOTS, sleep, collect } from './common.mjs'
const browser = await launch({ extraArgs: ['--disable-3d-apis', '--disable-webgl'] })
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.goto(`${ORIGIN}/`, { waitUntil: 'load' })
await sleep(10000)
await pc.screenshot({ path: `${SHOTS}/nowebgl.jpg`, type: 'jpeg', quality: 70 })
console.log('texte visible :', JSON.stringify((await pc.evaluate(() => document.body.innerText)).slice(0, 300)))
console.log('root enfants :', await pc.evaluate(() => document.getElementById('root').children.length))
console.log(logs.slice(0, 8).join('\n'))
await browser.close()
