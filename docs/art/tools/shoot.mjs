import { chromium } from 'playwright-core';
const [url, out, w = '1700', h = '1300'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/etc/profiles/per-user/bcr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', e => console.log('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto(url); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }); await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true }); await b.close();
