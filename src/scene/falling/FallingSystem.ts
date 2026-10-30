import * as THREE from 'three';
import type { Stage } from '../../core/stage';
import { clamp, invLerp, rand, randRange, weightedPick } from '../../utils/math';
import { FALLING_ITEMS, FALLING_SETTINGS, type FallingItemDef } from './registry';

interface Item {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  def: FallingItemDef;
  alive: boolean;
  vel: THREE.Vector3;
  terminal: number;
  gravity: number;
  age: number;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  baseX: number;
  spinAxis: THREE.Vector3;
  spinRate: number;
  size: number;
}

const FAR_TINT = new THREE.Color(0x5e4a8f);
const NEAR_TINT = new THREE.Color(0xffffff);
const GEO = new THREE.PlaneGeometry(1, 1);

/**
 * Pooled spawner for everything declared in `registry.ts`.
 * Items drift down at mixed depths (some pass behind the pumpkin, some in front)
 * and the pumpkin can throw a burst of candy out of its mouth.
 */
export class FallingSystem {
  private textures = new Map<string, THREE.Texture>();
  private pool: Item[] = [];
  private defs: FallingItemDef[] = [];
  private spawnAcc = 0;
  private qTmp = new THREE.Quaternion();
  private flashLevel = 0;
  private tintDirty = false;
  enabled = true;
  /** 0..1 — scales the ambient spawn rate (used to ease in after the intro). */
  intensity = 1;

  constructor(private stage: Stage) {}

  async load() {
    const loader = new THREE.TextureLoader();
    const results = await Promise.allSettled(
      FALLING_ITEMS.map(async (def) => {
        const tex = await loader.loadAsync(def.src);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        this.textures.set(def.id, tex);
        return def;
      }),
    );
    this.defs = results.flatMap((r, i) => {
      if (r.status === 'fulfilled') return [r.value];
      console.warn(`[falling] could not load "${FALLING_ITEMS[i].src}"`, r.reason);
      return [];
    });
    if (!this.defs.length) return;

    const size = FALLING_SETTINGS.maxActive + FALLING_SETTINGS.burstCount * 2;
    for (let i = 0; i < size; i++) {
      const def = this.defs[0];
      const mesh = new THREE.Mesh(
        GEO,
        new THREE.MeshBasicMaterial({
          map: this.textures.get(def.id)!,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.02,
        }),
      );
      mesh.visible = false;
      this.stage.scene.add(mesh);
      this.pool.push({
        mesh,
        def,
        alive: false,
        vel: new THREE.Vector3(),
        terminal: 1,
        gravity: 0,
        age: 0,
        phase: 0,
        swayAmp: 0,
        swayFreq: 1,
        baseX: 0,
        spinAxis: new THREE.Vector3(0, 1, 0),
        spinRate: 1,
        size: 1,
      });
    }
  }

  private take(): Item | undefined {
    return this.pool.find((it) => !it.alive);
  }

  private get activeCount() {
    let n = 0;
    for (const it of this.pool) if (it.alive) n++;
    return n;
  }

  private assign(it: Item, def: FallingItemDef, z: number) {
    it.def = def;
    it.mesh.material.map = this.textures.get(def.id)!;
    // constant world size → nearer items look bigger (depth cue)
    it.size = this.stage.imageSize(randRange(def.size), -1);
    it.mesh.scale.set(it.size, it.size, 1);
    it.age = 0;
    it.phase = Math.random() * Math.PI * 2;
    it.spinAxis.set(rand(-1, 1), rand(-1, 1), rand(-0.6, 0.6)).normalize();
    it.spinRate = def.motion === 'tumble' ? rand(1.2, 3.2) : rand(1.5, 3);
    it.swayFreq = rand(0.9, 1.6);
    it.mesh.quaternion.setFromEuler(new THREE.Euler(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(0, Math.PI * 2)));
    const artH = this.stage.bgH * this.stage.depthScale(z);
    it.terminal = randRange(FALLING_SETTINGS.speed) * artH * (def.motion === 'flutter' ? 0.75 : 1);
    it.swayAmp = def.motion === 'flutter' ? it.size * rand(1.2, 2.4) : it.size * rand(0.1, 0.4);
    this.applyTint(it);
    it.alive = true;
    it.mesh.visible = true;
  }

  private applyTint(it: Item) {
    const [zmin, zmax] = FALLING_SETTINGS.depth;
    const t = invLerp(zmin, zmax * 0.4, it.mesh.position.z);
    it.mesh.material.color.copy(FAR_TINT).lerp(NEAR_TINT, t).multiplyScalar(1 + this.flashLevel * 0.6);
  }

  spawnAmbient() {
    const it = this.take();
    if (!it) return;
    const z = randRange(FALLING_SETTINGS.depth);
    const { halfW, halfH } = this.stage.visibleHalfSize(z);
    const def = weightedPick(this.defs);
    it.mesh.position.set(rand(-halfW, halfW) * 1.05, halfH + 0.3, z);
    this.assign(it, def, z);
    it.mesh.position.y += it.size;
    it.baseX = it.mesh.position.x;
    it.vel.set(0, -it.terminal, 0);
    it.gravity = 0;
  }

  /** Throw candy out of the pumpkin's mouth. */
  burst(origin: THREE.Vector3, count = FALLING_SETTINGS.burstCount, power = 1) {
    const candy = this.defs.filter((d) => d.inCandyBurst);
    if (!candy.length) return;
    const artH = this.stage.bgH * this.stage.depthScale(origin.z);
    for (let i = 0; i < count; i++) {
      const it = this.take();
      if (!it) return;
      const z = origin.z + rand(0.2, 1.6);
      it.mesh.position.set(origin.x + rand(-0.1, 0.1), origin.y, z);
      this.assign(it, weightedPick(candy), z);
      it.baseX = 0; // ballistic items don't sway around a fixed column
      const a = rand(-1, 1);
      it.vel.set(a * artH * 0.45 * power, rand(0.55, 0.95) * artH * power, rand(0, 0.6));
      it.gravity = artH * 1.6;
      it.spinRate *= 2;
    }
  }

  set flash(v: number) {
    if (Math.abs(v - this.flashLevel) > 0.005) this.tintDirty = true;
    this.flashLevel = v;
  }

  update(dt: number) {
    if (!this.pool.length) return;

    if (this.enabled) {
      this.spawnAcc += dt * FALLING_SETTINGS.perSecond * this.intensity;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.activeCount < FALLING_SETTINGS.maxActive) this.spawnAmbient();
      }
    }

    for (const it of this.pool) {
      if (!it.alive) continue;
      it.age += dt;
      const m = it.mesh;
      const p = m.position;

      if (it.gravity > 0) {
        // ballistic phase (candy burst) → settles into a normal fall
        it.vel.y = Math.max(it.vel.y - it.gravity * dt, -it.terminal * 1.6);
        it.vel.x *= Math.exp(-dt * 0.6);
        it.vel.z *= Math.exp(-dt * 0.8);
        p.addScaledVector(it.vel, dt);
      } else if (it.def.motion === 'flutter') {
        // pendulum: slows at the ends of each swing, tilts with the swing
        const s = Math.sin(it.age * it.swayFreq * Math.PI + it.phase);
        const c = Math.cos(it.age * it.swayFreq * Math.PI + it.phase);
        p.x = it.baseX + s * it.swayAmp;
        p.y -= it.terminal * (0.55 + 0.45 * Math.abs(c)) * dt;
        m.rotation.set(Math.sin(it.age * it.spinRate) * 1.1, c * 0.5, -c * 0.7);
      } else {
        p.x = it.baseX + Math.sin(it.age * it.swayFreq + it.phase) * it.swayAmp;
        p.y += it.vel.y * dt;
      }

      if (it.def.motion === 'tumble' || it.gravity > 0) {
        this.qTmp.setFromAxisAngle(it.spinAxis, it.spinRate * dt);
        m.quaternion.multiply(this.qTmp);
      }

      if (this.tintDirty) this.applyTint(it);

      const { halfW, halfH } = this.stage.visibleHalfSize(p.z);
      const out = p.y < -halfH - it.size * 2 || Math.abs(p.x) > halfW * 1.6 || p.z > this.stage.restZ - 0.5;
      if (out) {
        it.alive = false;
        m.visible = false;
      }
      // fade in at the very top so nothing pops
      m.material.opacity = clamp(it.age * 3, 0, 1);
    }
    this.tintDirty = false;
  }
}
