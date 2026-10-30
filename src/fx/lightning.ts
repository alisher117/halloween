import { CONFIG } from '../config';
import { randRange } from '../utils/math';

/** Random double/triple lightning flickers. `value` is 0..1. */
export class Lightning {
  value = 0;
  private wait = randRange(CONFIG.lightning.every) * 0.6;
  private pulses: { at: number; amp: number }[] = [];
  private t = 0;

  trigger() {
    const n = Math.random() < 0.5 ? 2 : 3;
    this.pulses = [];
    let at = 0;
    for (let i = 0; i < n; i++) {
      this.pulses.push({ at, amp: i === 0 ? 0.55 : 0.8 + Math.random() * 0.4 });
      at += 0.07 + Math.random() * 0.12;
    }
    this.t = 0;
  }

  update(dt: number) {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.trigger();
      this.wait = randRange(CONFIG.lightning.every);
    }
    this.t += dt;
    let v = 0;
    for (const p of this.pulses) {
      const k = this.t - p.at;
      if (k >= 0) v = Math.max(v, p.amp * Math.exp(-k * 14));
    }
    this.value = v;
  }
}
