// Renders the scene frame-by-frame (deterministic time) and encodes an MP4.
// Usage: npm run dev  (in another terminal), then:
//   node scripts/capture.mjs [out.mp4] [width] [height] [seconds]
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const [out = 'halloween.mp4', w = '1080', h = '1350', secs = '14'] = process.argv.slice(2);
const fps = 30;
const frames = Math.round(+secs * fps);
const dir = fs.mkdtempSync('frames-');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`http://127.0.0.1:5173/?capture&w=${w}&h=${h}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

// Choreographed "cursor" after the intro: look around, admire the title, click the pumpkin.
const pointer = (t) => {
  if (t < 4.6) return null;
  const k = t - 4.6;
  if (k < 1.6) return [-0.75 + k * 0.1, -0.15 + k * 0.05];       // glance left
  if (k < 3.2) return [-0.5 + (k - 1.6) * 0.5, 0.6];              // up at the title
  if (k < 4.3) return [0.75, 0.1 - (k - 3.2) * 0.3];              // over to the right
  return [Math.sin(k * 0.9) * 0.35, -0.05 + Math.sin(k * 1.3) * 0.12]; // back to the viewer
};

for (let i = 0; i < frames; i++) {
  const t = i / fps;
  const p = pointer(t);
  await page.evaluate(([t, p]) => {
    if (p) window.__input.set(p[0], p[1]);
    if (Math.abs(t - 9.2) < 0.017) window.__input.click(0, -0.05);   // cackle + candy burst
    if (Math.abs(t - 11.6) < 0.017) window.__lightning.trigger();
  }, [t, p]);
  await page.evaluate((dt) => window.__frame(dt), 1 / fps);
  const data = await page.evaluate(() => document.getElementById('stage').toDataURL('image/jpeg', 0.95));
  fs.writeFileSync(`${dir}/f_${String(i).padStart(4, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  if (i % 30 === 0) console.log(`frame ${i}/${frames}`);
}
await browser.close();

execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', `${dir}/f_%04d.jpg`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
fs.rmSync(dir, { recursive: true });
console.log('wrote', out);
