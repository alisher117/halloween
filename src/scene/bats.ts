import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';
import type { Input } from '../core/input';
import { clamp, damp, easeInOutCubic, lerp, rand, randRange } from '../utils/math';

/* ───────────── geometry: one wing (hinge at x = 0) + body ───────────── */

function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.1);
  s.quadraticCurveTo(0.18, 0.3, 0.4, 0.34); // leading edge up to the wrist
  s.quadraticCurveTo(0.72, 0.36, 1.0, 0.22); // to the wing tip
  // scalloped trailing edge
  s.quadraticCurveTo(0.86, 0.12, 0.8, 0.0);
  s.quadraticCurveTo(0.66, 0.06, 0.56, -0.07);
  s.quadraticCurveTo(0.42, -0.0, 0.3, -0.1);
  s.quadraticCurveTo(0.16, -0.05, 0.0, -0.12);
  s.closePath();
  return new THREE.ShapeGeometry(s, 10);
}

function bodyGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.24);
  s.quadraticCurveTo(0.09, -0.16, 0.08, 0.02);
  s.quadraticCurveTo(0.08, 0.12, 0.06, 0.15);
  s.lineTo(0.075, 0.27); // right ear
  s.lineTo(0.025, 0.18);
  s.lineTo(-0.025, 0.18);
  s.lineTo(-0.075, 0.27); // left ear
  s.lineTo(-0.06, 0.15);
  s.quadraticCurveTo(-0.08, 0.12, -0.08, 0.02);
  s.quadraticCurveTo(-0.09, -0.16, 0, -0.24);
  return new THREE.ShapeGeometry(s, 8);
}

// Normalised so a bat is ~1 unit wide tip-to-tip; `size` is then its world width.
const WING = wingGeometry().scale(0.5, 0.5, 1);
const BODY = bodyGeometry().scale(0.5, 0.5, 1);

type Mode = 'hidden' | 'burst' | 'orbit' | 'flyby';

class Bat {
  readonly group = new THREE.Group();
  private wingR = new THREE.Group();
  private wingL = new THREE.Group();
  readonly material: THREE.MeshBasicMaterial;

  mode: Mode = 'hidden';
  t = 0;
  dur = 1;
  flapRate = 8;
  flapPhase = Math.random() * Math.PI * 2;
  size = 1;
  // path (burst / flyby): quadratic bezier
  p0 = new THREE.Vector3();
  p1 = new THREE.Vector3();
  p2 = new THREE.Vector3();
  // orbit
  anchor = new THREE.Vector3();
  orbitR = new THREE.Vector2(0.2, 0.1);
  orbitSpeed = 0.6;
  avoid = new THREE.Vector3();
  prev = new THREE.Vector3();
  vel = new THREE.Vector3();
  roll = 0;
  onArrive?: () => void;

  constructor(color: THREE.Color) {
    this.material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const wr = new THREE.Mesh(WING, this.material);
    const wl = new THREE.Mesh(WING, this.material);
    wl.scale.x = -1;
    this.wingR.add(wr);
    this.wingL.add(wl);
    this.wingR.position.x = 0.02;
    this.wingL.position.x = -0.02;
    this.group.add(new THREE.Mesh(BODY, this.material), this.wingR, this.wingL);
    this.group.visible = false;
  }

  flap(time: number, amount = 1) {
    const ph = time * this.flapRate * Math.PI * 2 + this.flapPhase;
    const up = Math.sin(ph);
    this.wingR.rotation.set(0, up * 0.55 * amount, up * 0.6 * amount);
    this.wingL.rotation.set(0, -up * 0.55 * amount, -up * 0.6 * amount);
    this.group.children[0].position.y = -up * 0.015; // body bobs against the stroke
  }

  bezier(t: number, out: THREE.Vector3) {
    const a = 1 - t;
    return out
      .copy(this.p0)
      .multiplyScalar(a * a)
      .addScaledVector(this.p1, 2 * a * t)
      .addScaledVector(this.p2, t * t);
  }
}

/**
 * Bats: four residents circle the title, a swarm bursts out of the pumpkin
 * during the intro, and now and then one swoops right past the lens.
 */
export class Bats {
  private residents: Bat[] = [];
  private swarm: Bat[] = [];
  private flyer: Bat;
  private time = 0;
  private nextFlyby = randRange(CONFIG.bats.flybyEvery);
  private tmp = new THREE.Vector3();
  private pointer = new THREE.Vector3();
  private active = false;

  constructor(private stage: Stage) {
    const color = new THREE.Color(CONFIG.bats.color);
    CONFIG.bats.residents.forEach(() => this.residents.push(this.make(color)));
    for (let i = 0; i < CONFIG.bats.swarm; i++) this.swarm.push(this.make(color));
    this.flyer = this.make(new THREE.Color(0x1a0d2e));
    stage.onResize(() => this.layoutResidents());
    this.layoutResidents();
  }

  private make(color: THREE.Color) {
    const b = new Bat(color.clone());
    this.stage.scene.add(b.group);
    return b;
  }

  private layoutResidents() {
    CONFIG.bats.residents.forEach((r, i) => {
      const bat = this.residents[i];
      const z = -2.5 + i * 0.2;
      this.stage.imageToWorld(r.u, r.v, z, bat.anchor);
      bat.size = this.stage.imageSize(r.size, z);
      bat.orbitR.set(bat.size * rand(0.5, 0.9), bat.size * rand(0.25, 0.45));
      bat.orbitSpeed = rand(0.45, 0.75) * (r.flip ? -1 : 1);
      if (bat.mode === 'orbit') bat.group.scale.setScalar(bat.size);
    });
  }

  /** Release everyone from the pumpkin's mouth. */
  burstFrom(origin: THREE.Vector3, residentsToo = true) {
    this.active = true;
    const all = residentsToo ? [...this.residents, ...this.swarm] : this.swarm;
    all.forEach((bat, i) => {
      const isResident = this.residents.includes(bat);
      bat.mode = 'burst';
      bat.t = -i * 0.045 - rand(0, 0.08); // staggered exit
      bat.dur = isResident ? rand(1.6, 2.1) : rand(1.3, 2.2);
      bat.flapRate = rand(10, 13);
      bat.p0.copy(origin);
      if (isResident) {
        bat.p2.copy(bat.anchor);
        bat.onArrive = () => {
          bat.mode = 'orbit';
          bat.t = Math.random() * 10;
          bat.flapRate = rand(5.5, 7.5);
        };
      } else {
        // fly off past the edges, mostly upward
        const ang = rand(-0.25, 1.25) * Math.PI;
        const z = rand(-2, 4);
        const { halfW, halfH } = this.stage.visibleHalfSize(z);
        bat.p2.set(Math.cos(ang) * halfW * 1.5, Math.abs(Math.sin(ang)) * halfH * 1.4 + halfH * 0.2, z);
        bat.size = this.stage.imageSize(rand(0.035, 0.06), z);
        bat.onArrive = () => {
          bat.mode = 'hidden';
          bat.group.visible = false;
        };
      }
      bat.p1.copy(origin).lerp(bat.p2, 0.35);
      bat.p1.y += rand(0.6, 1.6);
      bat.p1.x += rand(-1, 1);
      bat.prev.copy(origin);
    });
  }

  /** Skip the intro: residents start in place. */
  settle() {
    this.active = true;
    for (const bat of this.residents) {
      bat.mode = 'orbit';
      bat.t = Math.random() * 10;
      bat.flapRate = rand(5.5, 7.5);
      bat.group.visible = true;
      bat.group.scale.setScalar(bat.size);
    }
  }

  /** Scatter the residents (pumpkin cackle). */
  startle() {
    for (const bat of this.residents) bat.avoid.add(new THREE.Vector3(rand(-1, 1), rand(0.5, 1.2), 0).multiplyScalar(bat.size * 2.5));
  }

  set flash(v: number) {
    const k = 1 + v * 0.8;
    for (const b of [...this.residents, ...this.swarm]) b.material.color.setHex(CONFIG.bats.color).multiplyScalar(k);
  }

  private startFlyby() {
    const b = this.flyer;
    const z = rand(5.2, 6.4);
    const { halfW, halfH } = this.stage.visibleHalfSize(z);
    const dir = Math.random() < 0.5 ? 1 : -1;
    b.mode = 'flyby';
    b.t = 0;
    b.dur = rand(1.4, 2.0);
    b.flapRate = rand(7, 9);
    b.size = Math.min(halfW, halfH) * rand(0.35, 0.5);
    const y0 = rand(-0.2, 0.6) * halfH;
    b.p0.set(-dir * halfW * 1.6, y0, z);
    b.p2.set(dir * halfW * 1.6, y0 + rand(-0.4, 0.5) * halfH, z);
    b.p1.set(rand(-0.3, 0.3) * halfW, y0 - rand(0.3, 0.6) * halfH, z);
    b.prev.copy(b.p0);
    b.material.opacity = 0.92;
  }

  update(dt: number, input: Input) {
    this.time += dt;
    if (!this.active) return;
    if (input.inside) this.stage.pointerOnZ(input.ndc, -2.4, this.pointer);

    for (const bat of [...this.residents, ...this.swarm]) this.updateBat(bat, dt, input);

    this.nextFlyby -= dt;
    if (this.nextFlyby <= 0 && this.flyer.mode !== 'flyby') {
      this.startFlyby();
      this.nextFlyby = randRange(CONFIG.bats.flybyEvery);
    }
    if (this.flyer.mode === 'flyby') this.updateBat(this.flyer, dt, input);
  }

  private updateBat(bat: Bat, dt: number, input: Input) {
    const g = bat.group;
    if (bat.mode === 'hidden') return;
    bat.t += dt;

    if (bat.mode === 'burst' || bat.mode === 'flyby') {
      if (bat.t < 0) {
        g.visible = false;
        return;
      }
      const k = clamp(bat.t / bat.dur, 0, 1);
      const e = bat.mode === 'burst' ? easeInOutCubic(k) : k;
      bat.bezier(e, this.tmp);
      g.position.copy(this.tmp);
      g.visible = true;
      // grow out of the mouth
      const grow = bat.mode === 'burst' ? lerp(0.15, 1, Math.min(1, k * 2.2)) : 1;
      g.scale.setScalar(bat.size * grow);
      bat.flap(this.time, 1);
      if (k >= 1) {
        if (bat.mode === 'flyby') {
          bat.mode = 'hidden';
          g.visible = false;
        } else bat.onArrive?.();
      }
    } else if (bat.mode === 'orbit') {
      const w = bat.orbitSpeed;
      const tt = bat.t * w;
      this.tmp.set(Math.sin(tt) * bat.orbitR.x, Math.sin(tt * 2) * bat.orbitR.y, Math.cos(tt) * 0.15);
      // dodge the pointer
      if (input.inside && input.idle < 2) {
        const d = this.tmp.clone().add(bat.anchor).sub(this.pointer);
        d.z = 0;
        const dist = d.length();
        const r = bat.size * 2.2;
        if (dist < r) bat.avoid.addScaledVector(d.normalize(), (r - dist) * dt * 6);
      }
      bat.avoid.multiplyScalar(Math.exp(-dt * 1.6));
      g.position.copy(bat.anchor).add(this.tmp).add(bat.avoid);
      g.scale.setScalar(damp(g.scale.x, bat.size, 6, dt));
      bat.flap(this.time, 0.85);
    }

    // bank into the direction of travel
    bat.vel.subVectors(g.position, bat.prev).divideScalar(Math.max(dt, 1e-4));
    bat.prev.copy(g.position);
    const targetRoll = clamp(-bat.vel.x * 0.12, -0.6, 0.6);
    bat.roll = damp(bat.roll, targetRoll, 8, dt);
    g.rotation.set(0, 0, bat.roll);
  }
}
