import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';
import type { Input } from '../core/input';
import { clamp, damp, noise1 } from '../utils/math';

/** Mouth centre in the model's own units (measured from the GLB face cut-outs). */
const MOUTH_LOCAL = new THREE.Vector3(0, -0.2, 0.47);
/** The GLB body is ~1 unit wide. */
const MODEL_WIDTH = 1.0;

export async function loadPumpkinModel() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(CONFIG.pumpkin.src);
  return gltf.scene;
}

/**
 * The hero jack-o'-lantern: turns to look at the pointer, flickers like a candle,
 * and cackles (squash + glow burst) when clicked.
 */
export class Pumpkin {
  readonly root = new THREE.Group();
  private bob = new THREE.Group();
  private look = new THREE.Group();
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private glowSprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private innerLight = new THREE.PointLight(0xff8a2a, 0, 0, 2);
  private hitTargets: THREE.Object3D[] = [];

  private yaw = 0;
  private pitch = 0;
  private time = 0;
  private laugh = 0; // 1 → 0 after a click
  private wanderSeed = Math.random() * 100;
  /** Extra glow multiplier driven by the intro. */
  glowBoost = 0;

  constructor(private stage: Stage, model: THREE.Object3D) {
    this.setupMaterials(model);
    this.look.add(model);
    this.bob.add(this.look);
    this.root.add(this.bob);

    // Candle inside: lights the carved walls.
    this.innerLight.position.set(0, -0.05, 0.05);
    this.look.add(this.innerLight);

    // Warm halo painted onto the scene behind the pumpkin.
    this.glowSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(),
        color: 0xff7a1a,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.4,
      }),
    );
    this.glowSprite.renderOrder = -5;
    stage.scene.add(this.glowSprite);

    this.addLights();
    stage.scene.add(this.root);
    stage.onResize(() => this.layout());
    this.layout();
  }

  private setupMaterials(model: THREE.Object3D) {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.hitTargets.push(mesh);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as THREE.MeshStandardMaterial[]) {
        if (m.name === 'Pumpkin_Flesh' || m.name === 'Pumpkin_Inside') {
          m.emissive = new THREE.Color(0xffffff);
          this.glowMats.push(m);
        }
        if (m.name === 'Pumpkin_Skin') {
          m.roughness = 0.42;
          m.envMapIntensity = 0.55;
        }
        if (m.name === 'Pumpkin_Stem') m.envMapIntensity = 0.3;
      }
    });
  }

  private addLights() {
    const { scene, renderer } = this.stage;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    scene.add(new THREE.HemisphereLight(0x8a6ad6, 0x1a0b2e, 0.8));

    const key = new THREE.DirectionalLight(0xffe0bd, 1.7);
    key.position.set(-3, 4, 6);
    scene.add(key);

    const rimL = new THREE.DirectionalLight(0xb685ff, 3.2);
    rimL.position.set(-6, 3, -4);
    const rimR = new THREE.DirectionalLight(0xd08cff, 2.6);
    rimR.position.set(6, 2, -4);
    scene.add(rimL, rimR);
  }

  get scale() {
    return this.root.scale.x;
  }

  /** Mouth position in world space (used by the intro camera and candy bursts). */
  mouthWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.look.localToWorld(out.copy(MOUTH_LOCAL));
  }

  /** Same, but for the resting pose — stable even while the pumpkin is moving. */
  mouthRest(out = new THREE.Vector3()) {
    const s = this.root.scale.x;
    return out.copy(MOUTH_LOCAL).multiplyScalar(s).add(this.root.position);
  }

  hitTest(raycaster: THREE.Raycaster) {
    return raycaster.intersectObjects(this.hitTargets, false).length > 0;
  }

  cackle() {
    this.laugh = 1;
  }

  private layout() {
    const { anchor, width, z } = CONFIG.pumpkin;
    const s = this.stage.imageSize(width, z) / MODEL_WIDTH;
    this.stage.imageToWorld(anchor.u, anchor.v, z, this.root.position);
    this.root.scale.setScalar(s);

    this.glowSprite.position.set(this.root.position.x, this.root.position.y - s * 0.05, -1.2);
    const gs = this.stage.imageSize(width * 2.0, -1.2);
    this.glowSprite.scale.set(gs, gs, 1);
  }

  update(dt: number, input: Input) {
    this.time += dt;
    const t = this.time;
    const cfg = CONFIG.pumpkin;

    // ── Look at the pointer (or wander when the pointer is idle / absent) ──
    let tx: number;
    let ty: number;
    if (input.inside && input.idle < 3.5) {
      const p = this.root.position.clone().project(this.stage.camera);
      tx = (input.ndc.x - p.x) * 1.15;
      ty = (input.ndc.y - p.y) * 0.9;
    } else {
      tx = noise1(t * 0.35 + this.wanderSeed) * 0.7;
      ty = noise1(t * 0.27 + this.wanderSeed * 2) * 0.35;
    }
    const targetYaw = clamp(tx, -1, 1) * cfg.maxYaw;
    const targetPitch = clamp(-ty, -1, 1) * cfg.maxPitch;
    const prevYaw = this.yaw;
    this.yaw = damp(this.yaw, targetYaw, cfg.followSpeed, dt);
    this.pitch = damp(this.pitch, targetPitch, cfg.followSpeed, dt);
    const yawVel = dt > 0 ? (this.yaw - prevYaw) / dt : 0;

    this.look.rotation.set(this.pitch, this.yaw, clamp(-yawVel * 0.06, -0.12, 0.12), 'YXZ');

    // ── Idle float + cackle squash ──
    this.laugh = Math.max(0, this.laugh - dt * 0.9);
    const l = this.laugh;
    const shake = l > 0 ? Math.sin(t * 38) * 0.05 * l : 0;
    const squash = l > 0 ? Math.sin(t * 22) * 0.07 * l : 0;
    this.bob.position.y = Math.sin(t * 1.3) * 0.025 + l * 0.04;
    this.bob.rotation.z = shake;
    this.bob.scale.set(1 + squash, 1 - squash, 1 + squash);

    // ── Candle flicker ──
    const flicker =
      0.82 + 0.12 * noise1(t * 7.3) + 0.06 * noise1(t * 19.1 + 3) + Math.max(0, noise1(t * 2.1 + 9)) * 0.1;
    const glow = flicker * (1 + l * 1.4) + this.glowBoost;
    for (const m of this.glowMats) m.emissiveIntensity = glow * 1.15;
    this.innerLight.intensity = glow * 1.2;
    this.glowSprite.material.opacity = 0.07 + 0.08 * flicker + l * 0.25 + this.glowBoost * 0.15;
  }
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
