// Premier contact : écran titre (cinématique de démo) regardé 50 s, une image par seconde.
//   PORT=8822 node tools/polish/feel/title.mjs --name=title [--secs=50]
import { openPC, Recorder, outDir, sleep, arg } from './lib.mjs'
const dir = outDir(arg('name', 'title'))
const { browser, pc, cdp } = await openPC({ query: '?debug=nosave', settings: { quality: 'high' } })
const rec = new Recorder(cdp, dir, { overviewMs: 1000, quality: 70 })
rec.tag = 'title'
await rec.start()
await sleep(Number(arg('secs', '50')) * 1000)
await rec.stop()
console.log('images', rec.frames, rec.fps().toFixed(1))
await browser.close()
