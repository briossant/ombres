import { chromium } from 'playwright-core';
// usage: node shot.mjs out.png "query" [timings]
const [out, query, wantTimings] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/etc/profiles/per-user/bcr/bin/google-chrome', headless: true,
  args: (process.env.ANGLE==='gl' ? ['--enable-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl'] : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']).concat(['--disable-gpu-vsync', '--disable-frame-rate-limit']) });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:8765/index.html?' + query);
try { await page.waitForFunction(() => window.__ready, null, { timeout: 20000 }); } catch (e) { logs.push('timeout ready'); }
await page.waitForTimeout(500);
await page.screenshot({ path: out });
if (wantTimings) { try { await page.waitForFunction(() => window.__timings, null, { timeout: 30000 }); console.log('TIMINGS', JSON.stringify(await page.evaluate(() => window.__timings))); } catch (e) { console.log('no timings'); } }
const errs = logs.filter(l => /error|warn/i.test(l));
if (errs.length) console.log(errs.slice(0, 8).join('\n').slice(0, 4000));
await browser.close();
