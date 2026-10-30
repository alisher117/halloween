import * as THREE from 'three';
import './styles.css';
import { CONFIG } from './config';
import { Stage } from './core/stage';
import { Input } from './core/input';
import { Background, loadBackgroundTexture } from './scene/background';
import { Pumpkin, loadPumpkinModel } from './scene/pumpkin';
import { Fog } from './scene/fog';
import { Bats } from './scene/bats';
import { FallingSystem } from './scene/falling/FallingSystem';
import { Embers, RainStreaks } from './scene/particles';
import { Lightning } from './fx/lightning';
import { Post } from './fx/post';
import { Intro } from './intro';
import { clamp, damp } from './utils/math';

const params = new URLSearchParams(location.search);
/** ?capture → deterministic, externally stepped frames (used to render the Instagram video). */
const CAPTURE = params.has('capture');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches && !CAPTURE;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const loader = document.getElementById('loader');

function createRainVideo() {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  for (const s of CONFIG.rain.sources) {
    const src = document.createElement('source');
    src.src = s.src;
    src.type = s.type;
    video.appendChild(src);
  }
  return video;
}

async function boot() {
  const stage = new Stage(canvas, { preserveDrawingBuffer: CAPTURE });
  const captureSize = CAPTURE
    ? { w: Number(params.get('w') ?? 1080), h: Number(params.get('h') ?? 1350) }
    : null;
  const doResize = () =>
    captureSize ? stage.resize(captureSize.w, captureSize.h, 1) : stage.resize();
  doResize();

  const input = new Input(canvas, !CAPTURE);

  const [bgTex, model] = await Promise.all([loadBackgroundTexture(), loadPumpkinModel()]);
  const bg = new Background(stage, bgTex);

  const pumpkin = new Pumpkin(stage, model);
  const fog = new Fog(stage);
  const bats = new Bats(stage);
  const falling = new FallingSystem(stage);
  const embers = new Embers(stage);
  const streaks = new RainStreaks(stage);
  const lightning = new Lightning();
  const post = new Post(stage);
  await falling.load();

  // Rain-on-glass drop map
  const video = createRainVideo();
  const rainTex = new THREE.VideoTexture(video);
  post.setRainTexture(rainTex);
  if (!CAPTURE) {
    const tryPlay = () => video.play().catch(() => undefined);
    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { once: true });
  } else {
    await new Promise<void>((r) => {
      if (video.readyState >= 2) r();
      else video.addEventListener('loadeddata', () => r(), { once: true });
      video.load();
    });
  }

  const intro = new Intro(stage, pumpkin, {
    onBatsRelease: (mouth) => bats.burstFrom(mouth),
  });
  if (reducedMotion) {
    intro.skip();
    bats.settle();
  }

  // Compile every shader before the first visible frame (avoids a hitch mid-intro).
  stage.renderer.compile(stage.scene, stage.camera);

  window.addEventListener('resize', doResize);

  // ── interaction ──
  const ray = new THREE.Raycaster();
  input.onClick((ndc) => {
    if (!intro.done) return;
    ray.setFromCamera(ndc, stage.camera);
    if (pumpkin.hitTest(ray)) {
      pumpkin.cackle();
      falling.burst(pumpkin.mouthWorld());
      bats.startle();
    }
  });

  let hoverCheck = 0;
  // A stand-in pointer for the intro (pumpkin keeps facing the camera).
  const idleInput = new Input(document.createElement('div'), false);

  // ── frame ──
  let time = 0;
  const parallax = new THREE.Vector2();

  function frame(dt: number) {
    time += dt;
    input.update(dt);
    intro.update(dt);
    lightning.update(dt);

    if (intro.done) {
      // gentle parallax: the camera drifts with the pointer
      const tx = input.inside ? input.ndc.x : Math.sin(time * 0.2) * 0.3;
      const ty = input.inside ? input.ndc.y : Math.sin(time * 0.15) * 0.2;
      parallax.x = damp(parallax.x, tx, 2.5, dt);
      parallax.y = damp(parallax.y, ty, 2.5, dt);
      const p = CONFIG.camera.parallax;
      stage.camera.position.set(parallax.x * p, parallax.y * p * 0.6, stage.restZ);
      stage.camera.lookAt(0, 0, 0);
    }

    const reveal = intro.done ? 1 : intro.reveal;
    const flash = lightning.value * reveal;
    bg.flash = flash;
    fog.flash = flash;
    bats.flash = flash;
    falling.flash = flash;
    streaks.flash = flash;
    post.flash = flash;
    post.fade = intro.done ? 1 : intro.fade;
    post.rainAmount = reveal;
    fog.reveal = reveal;
    embers.reveal = reveal;
    streaks.reveal = reveal;
    falling.intensity = clamp(reveal * 1.2 - 0.2, 0, 1);

    pumpkin.update(dt, intro.done ? input : idleInput);
    fog.update(dt, time, input);
    bats.update(dt, input);
    falling.update(dt);
    embers.update(time);
    streaks.update(time);

    // pointer cursor over the pumpkin
    if (!CAPTURE && (hoverCheck += dt) > 0.1) {
      hoverCheck = 0;
      ray.setFromCamera(input.ndc, stage.camera);
      canvas.classList.toggle('is-hovering-pumpkin', input.inside && intro.done && pumpkin.hitTest(ray));
    }

    if (!CAPTURE) post.render(time);
  }

  loader?.classList.add('is-done');
  setTimeout(() => loader?.remove(), 700);

  if (CAPTURE) {
    // Driven by scripts/capture.mjs
    const w = window as unknown as Record<string, unknown>;
    w.__input = input;
    w.__lightning = lightning;
    w.__frame = async (dt: number) => {
      frame(dt);
      // keep the drop video in lock-step with scene time
      await new Promise<void>((r) => {
        video.addEventListener('seeked', () => r(), { once: true });
        video.currentTime = time % (video.duration || 9);
      });
      rainTex.needsUpdate = true;
      post.render(time);
    };
    w.__ready = true;
    return;
  }

  let last = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    frame(dt);
  });
}

boot().catch((err) => {
  console.error(err);
  loader?.remove();
});
