import * as THREE from 'three';

/**
 * Pointer state in normalised device coordinates (-1..1, y up).
 * Works for mouse, pen and touch. Scripted input (capture mode) can drive it via `set()`.
 */
export class Input {
  readonly ndc = new THREE.Vector2(0, 0);
  /** Seconds since the pointer last moved. */
  idle = Infinity;
  /** Pointer speed in NDC units per second (smoothed). */
  speed = 0;
  inside = false;

  private clickHandlers = new Set<(ndc: THREE.Vector2) => void>();
  private last = new THREE.Vector2();

  constructor(private el: HTMLElement, listen = true) {
    if (!listen) return;
    el.addEventListener('pointermove', this.onMove, { passive: true });
    el.addEventListener('pointerdown', this.onDown, { passive: true });
    el.addEventListener('pointerleave', () => (this.inside = false));
    window.addEventListener('blur', () => (this.inside = false));
  }

  onClick(fn: (ndc: THREE.Vector2) => void) {
    this.clickHandlers.add(fn);
  }

  /** Drive the pointer programmatically (used by the video capture script). */
  set(x: number, y: number) {
    this.ndc.set(x, y);
    this.idle = 0;
    this.inside = true;
  }

  click(x: number, y: number) {
    this.set(x, y);
    this.clickHandlers.forEach((fn) => fn(this.ndc));
  }

  update(dt: number) {
    this.idle += dt;
    const moved = this.ndc.distanceTo(this.last);
    this.last.copy(this.ndc);
    const inst = dt > 0 ? moved / dt : 0;
    this.speed += (inst - this.speed) * Math.min(1, dt * 8);
  }

  private toNdc(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onMove = (e: PointerEvent) => {
    this.toNdc(e);
    this.idle = 0;
    this.inside = true;
  };

  private onDown = (e: PointerEvent) => {
    this.toNdc(e);
    this.idle = 0;
    this.inside = true;
    this.clickHandlers.forEach((fn) => fn(this.ndc));
  };
}
