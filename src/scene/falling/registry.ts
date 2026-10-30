/**
 * ─────────────────────────────────────────────────────────────
 *  FALLING ITEMS STORAGE
 * ─────────────────────────────────────────────────────────────
 *  Everything that drops from the top of the scene is declared here.
 *
 *  To add a new item:
 *    1. Put the image in  public/falling/  (SVG or PNG with transparency,
 *       square canvas works best — SVGs need width/height attributes).
 *    2. Add an entry below. That's it — it's picked up on next load.
 *
 *  To remove one, delete or comment out its entry.
 */

export type FallMotion =
  /** Rigid objects: spin around a random 3D axis (candy, bones). */
  | 'tumble'
  /** Light objects: pendulum sway + flipping, like a real leaf. */
  | 'flutter';

export interface FallingItemDef {
  id: string;
  /** Path relative to the site root (files in /public). */
  src: string;
  /** Relative spawn frequency. 2 = twice as common as 1. */
  weight?: number;
  /** Size range as a fraction of the artwork width. */
  size: [number, number];
  motion: FallMotion;
  /** Can this item be thrown out of the pumpkin when it's clicked? */
  inCandyBurst?: boolean;
}

export const FALLING_ITEMS: FallingItemDef[] = [
  { id: 'candy-corn', src: './falling/candy-corn.svg', weight: 3, size: [0.022, 0.034], motion: 'tumble', inCandyBurst: true },
  { id: 'wrapped-orange', src: './falling/wrapped-orange.svg', weight: 2, size: [0.03, 0.045], motion: 'tumble', inCandyBurst: true },
  { id: 'wrapped-purple', src: './falling/wrapped-purple.svg', weight: 2, size: [0.03, 0.045], motion: 'tumble', inCandyBurst: true },
  { id: 'lollipop', src: './falling/lollipop.svg', weight: 1, size: [0.035, 0.05], motion: 'tumble', inCandyBurst: true },
  { id: 'bone-candy', src: './falling/bone-candy.svg', weight: 1, size: [0.03, 0.042], motion: 'tumble', inCandyBurst: true },
  { id: 'leaf-maple', src: './falling/leaf-maple.svg', weight: 3, size: [0.03, 0.05], motion: 'flutter' },
  { id: 'leaf-oak', src: './falling/leaf-oak.svg', weight: 2, size: [0.03, 0.046], motion: 'flutter' },
];

export const FALLING_SETTINGS = {
  /** Upper bound of items on screen at once (pooled — nothing is allocated after load). */
  maxActive: 46,
  /** Ambient spawn rate (items per second). */
  perSecond: 2.6,
  /** Depth range: negative = behind the pumpkin, positive = in front of it. */
  depth: [-4, 3.2] as [number, number],
  /** Fall speed in artwork-heights per second. */
  speed: [0.07, 0.14] as [number, number],
  /** How many candies the pumpkin throws when clicked. */
  burstCount: 14,
};
