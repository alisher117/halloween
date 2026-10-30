# Happy Halloween — interactive WebGL scene

Vite + TypeScript + Three.js. No framework, ~176 KB gzipped JS.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static output in dist/ — deploy anywhere (Vercel, Netlify, S3)
```

## What's in the scene

| Feature | Where |
| --- | --- |
| Intro: camera starts inside the pumpkin's grin and dollies out (FOV pull) | `src/intro.ts` |
| 3D jack-o'-lantern looks at the cursor, candle flicker, idle wander; click → cackle + candy burst | `src/scene/pumpkin.ts` |
| Rain on glass: your plugin's rain clip, used as a drop height map that refracts the scene | `src/fx/post.ts` (`RainGlassShader`) |
| Ground fog in two depths (behind / in front of the pumpkin); the cursor parts it | `src/scene/fog.ts` |
| Bats: swarm bursts from the mouth, 4 residents circle the title and dodge the cursor, occasional fly-by past the lens | `src/scene/bats.ts` |
| **Falling items storage** | `src/scene/falling/registry.ts` + `public/falling/` |
| Embers, rain streaks | `src/scene/particles.ts` |
| Lightning flashes, bloom, vignette, grain | `src/fx/lightning.ts`, `src/fx/post.ts` |
| All tunables (positions, sizes, timings) | `src/config.ts` |

## Adding things that fall

1. Drop an SVG (with `width`/`height` attributes) or a transparent PNG into `public/falling/`.
2. Add one line to `FALLING_ITEMS` in `src/scene/falling/registry.ts`:

```ts
{ id: 'ghost', src: './falling/ghost.png', weight: 1, size: [0.03, 0.05], motion: 'flutter' },
```

`motion: 'tumble'` spins like a solid object, `'flutter'` sways like a leaf. `inCandyBurst: true` lets the pumpkin throw it when clicked. Density/speed/depth live in `FALLING_SETTINGS` in the same file.

## Asset notes

- **Rain**: the plugin's `.webm` had the transparency checkerboard baked into every frame (no real alpha), so it can't be overlaid directly. `tools/rain_map.py` keys the checkerboard out and writes a looping grayscale drop height map → `public/video/rain-height.{webm,mp4}`. Re-run it if you export a new clip from the plugin:
  `ffmpeg -i effect.webm -vf format=gray frames/f_%04d.png && python3 tools/rain_map.py frames hmap`, then encode `hmap/` with ffmpeg.
- **Background**: the baked bats were removed (they're animated now), and the candy pile behind the 3D pumpkin was painted over so it doesn't peek out when the pumpkin turns.
- **Model**: compressed with `gltf-transform meshopt` (3.2 MB → 0.8 MB). The loader has the Meshopt decoder wired in.

## Instagram video

`scripts/capture.mjs` renders the scene frame by frame (deterministic time, scripted cursor and click) and encodes an MP4. With `npm run dev` running:

```bash
node scripts/capture.mjs halloween.mp4 1080 1350 14    # 4:5 feed post
node scripts/capture.mjs reel.mp4 1080 1920 14         # 9:16 reel/story
```

Needs Playwright (`npm i -D playwright && npx playwright install chromium`) and ffmpeg.

`?capture&w=1080&h=1350` in the URL puts the page in that stepped mode; it exposes `window.__frame(dt)`.

## Accessibility / performance

- `prefers-reduced-motion`: the intro is skipped and the scene starts settled.
- Pixel ratio is capped (1.75 on small screens, 2 elsewhere) and bloom runs at half resolution.
