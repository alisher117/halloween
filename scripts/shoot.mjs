// Usage: node scripts/shoot.mjs <outDir> <w> <h> <t1,t2,...> [clickAt]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'shots', w = '1440', h = '900', times = '0.3,1.5,3,4.6,7'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5173/?capture&w=${w}&h=${h}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const fps = 30;
let t = 0;
const ts = times.split(',').map(Number);
const fs = await import('fs');
fs.mkdirSync(out, { recursive: true });
for (const target of ts) {
  while (t < target - 1e-6) {
    // pointer path for the shots
    const clickAt = Number(process.env.CLICK_AT ?? -1);
    await page.evaluate(([tt, ca]) => {
      if (ca > 0 && Math.abs(tt - ca) < 0.016) window.__input.click(0, -0.05);
      else if (tt > 5) window.__input.set(Math.sin(tt) * 0.6, 0.3);
    }, [t, clickAt]);
    await page.evaluate((dt) => window.__frame(dt), 1 / fps);
    t += 1 / fps;
  }
  const data = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
  fs.writeFileSync(`${out}/t${target.toFixed(1)}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', target);
}
await browser.close();
