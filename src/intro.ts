import * as THREE from 'three';
import { CONFIG } from './config';
import type { Stage } from './core/stage';
import type { Pumpkin } from './scene/pumpkin';
import { clamp, easeInOutQuart, invLerp, lerp } from './utils/math';

export interface IntroHooks {
  /** Fired once, when the camera has pulled far enough back for bats to fly out. */
  onBatsRelease: (mouth: THREE.Vector3) => void;
}

/**
 * Opening shot: start inside the glowing grin, then dolly back (with a FOV pull)
 * until the full scene is revealed.
 */
export class Intro {
  t = 0;
  done = false;
  private released = false;
  private start = new THREE.Vector3();
  private mouth = new THREE.Vector3();
  private look = new THREE.Vector3();
  private origin = new THREE.Vector3(0, 0, 0);

  /** 0..1 progress values other systems read. */
  fade = 0;
  reveal = 0;
  boost = 1.4;

  constructor(private stage: Stage, private pumpkin: Pumpkin, private hooks: IntroHooks) {
    this.computeStart();
    stage.onResize(() => this.computeStart());
  }

  private computeStart() {
    this.pumpkin.mouthRest(this.mouth);
    this.start.copy(this.mouth).add(new THREE.Vector3(0, 0.02 * this.pumpkin.scale, 0.2 * this.pumpkin.scale));
  }

  get total() {
    return CONFIG.intro.hold + CONFIG.intro.duration;
  }

  /** Jump to the final framing without releasing the bat swarm. */
  skip() {
    this.released = true;
    this.t = this.total;
    this.update(0);
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const { hold, duration, startFov } = CONFIG.intro;
    const cam = this.stage.camera;

    const k = clamp((this.t - hold) / duration, 0, 1);
    const e = easeInOutQuart(k);

    cam.position.lerpVectors(this.start, new THREE.Vector3(0, 0, this.stage.restZ), e);
    this.look.lerpVectors(this.mouth, this.origin, easeInOutQuart(clamp(k * 1.15, 0, 1)));
    cam.fov = lerp(startFov, CONFIG.camera.fov, e);
    cam.updateProjectionMatrix();
    cam.lookAt(this.look);

    this.fade = clamp(this.t / 0.6, 0, 1);
    this.reveal = invLerp(0.35, 1, k);
    // the grin burns hot while we're inside it, then settles
    this.boost = lerp(1.4, 0, invLerp(0.0, 0.5, k));
    this.pumpkin.glowBoost = this.boost;

    if (!this.released && k > 0.22) {
      this.released = true;
      this.hooks.onBatsRelease(this.pumpkin.mouthWorld());
    }
    if (k >= 1) {
      this.done = true;
      this.pumpkin.glowBoost = 0;
      if (!this.released) {
        this.released = true;
        this.hooks.onBatsRelease(this.pumpkin.mouthWorld());
      }
    }
  }
}
