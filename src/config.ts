/**
 * Scene tunables. Image-space values are fractions of the background artwork
 * (u = 0 left → 1 right, v = 0 top → 1 bottom), so everything stays glued to
 * the illustration at any screen size.
 */
export const CONFIG = {
  background: {
    src: './bg/halloween-bg.jpg',
    aspect: 2576 / 1717,
    /** Narrow screens show at least this much of the artwork's width (letterboxes top/bottom instead of cropping the pumpkin). */
    minVisibleWidth: 0.64,
    /** Extra scale so parallax never reveals an edge. */
    overscan: 1.06,
  },

  camera: { fov: 30, z: 10, backgroundZ: -6, parallax: 0.18 },

  pumpkin: {
    src: (import.meta.env.VITE_PUMPKIN_SRC as string | undefined) ?? './models/pumpkin.glb',
    anchor: { u: 0.5, v: 0.53 },
    /** Body width as a fraction of the artwork width (matches the Figma comp). */
    width: 0.34,
    z: 0,
    maxYaw: 0.75,
    maxPitch: 0.4,
    followSpeed: 5,
  },

  intro: {
    /** Seconds the camera holds inside the glowing mouth before pulling back. */
    hold: 0.7,
    duration: 3.6,
    startFov: 55,
  },

  rain: {
    sources: [
      { src: './video/rain-height.webm', type: 'video/webm' },
      { src: './video/rain-height.mp4', type: 'video/mp4' },
    ],
    /** On-screen size (CSS px) of one 1024px tile of the drop video. */
    tileSize: 820,
    refraction: 0.035,
    /** Falling rain streaks behind the glass. */
    streaks: 160,
  },

  fog: {
    color: 0xc6a2f0,
    back: { z: -3.2, opacity: 0.45, height: 0.38 },
    front: { z: 2.2, opacity: 0.26, height: 0.22 },
  },

  bats: {
    color: 0xa491dc,
    /** Resting spots around the title (the bats that were baked into the artwork). */
    residents: [
      { u: 0.305, v: 0.18, size: 0.058, flip: false },
      { u: 0.352, v: 0.13, size: 0.05, flip: false },
      { u: 0.645, v: 0.11, size: 0.06, flip: true },
      { u: 0.69, v: 0.165, size: 0.048, flip: true },
    ],
    /** Extra bats that burst out of the pumpkin during the intro. */
    swarm: 16,
    /** Seconds between big bats swooping past the lens. */
    flybyEvery: [9, 16] as [number, number],
  },

  lightning: { every: [11, 20] as [number, number] },

  embers: { count: 70 },

  bloom: { strength: 0.45, radius: 0.45, threshold: 0.9 },
} as const;
