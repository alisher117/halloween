import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';
import type { Input } from '../core/input';
import { NOISE_GLSL } from '../utils/glsl';

type LayerCfg = { z: number; opacity: number; height: number };

/**
 * Ground fog: domain-warped fBm on planes at two depths (behind and in front of
 * the pumpkin). The pointer parts the fog like a hand moving through smoke.
 */
export class Fog {
  private layers: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; cfg: LayerCfg }[] = [];
  private mouse = new THREE.Vector3();
  private stir = 0;

  constructor(private stage: Stage) {
    const { back, front, color } = CONFIG.fog;
    this.addLayer(back, color, 0.0, 1);
    this.addLayer(front, color, 37.0, -1);
    stage.onResize(() => this.layout());
    this.layout();
  }

  private addLayer(cfg: LayerCfg, color: number, seed: number, dir: number) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uDir: { value: dir },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: cfg.opacity },
        uAspect: { value: 1 },
        uMouse: { value: new THREE.Vector2(-9, -9) },
        uStir: { value: 0 },
        uFlash: { value: 0 },
        uReveal: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uSeed, uDir, uOpacity, uAspect, uStir, uFlash, uReveal;
        uniform vec3 uColor;
        uniform vec2 uMouse;
        varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.4 + uSeed;
          float t = uTime;
          // pointer pushes the fog away and leaves a swirl behind
          vec2 toM = (vUv - uMouse) * vec2(uAspect, 1.0);
          float md = length(toM);
          float push = exp(-md * md * 18.0) * (0.25 + uStir);
          p += normalize(toM + 1e-4) * push * 0.6;

          vec2 q = vec2(fbm(p + vec2(t * 0.05 * uDir, t * 0.02)), fbm(p + vec2(5.2, 1.3) - t * 0.03));
          float n = fbm(p + 1.6 * q + vec2(t * 0.04 * uDir, 0.0));

          // dense at the bottom, wispy ragged top edge
          float edge = vUv.y + (n - 0.5) * 0.45;
          float mask = smoothstep(0.95, 0.15, edge);
          float a = smoothstep(0.28, 0.85, n) * mask;
          a *= 1.0 - smoothstep(0.32, 0.0, md) * 0.55 * (0.4 + uStir);   // clear a pocket around the pointer
          a *= smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          vec3 col = uColor * (0.75 + 0.5 * n) + uFlash * vec3(0.5, 0.5, 0.8);
          gl_FragColor = vec4(col, a * uOpacity * uReveal);
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = cfg.z > 0 ? 5 : -4;
    this.stage.scene.add(mesh);
    this.layers.push({ mesh, cfg });
  }

  private layout() {
    for (const { mesh, cfg } of this.layers) {
      const { halfW, halfH } = this.stage.visibleHalfSize(cfg.z);
      const w = halfW * 2 * 1.25;
      const art = this.stage.imageSize(1, cfg.z) / CONFIG.background.aspect; // artwork height at this depth
      const h = Math.max(art * cfg.height, halfH * 2 * cfg.height);
      const bottom = Math.min(-art / 2, -halfH) - h * 0.08;
      mesh.position.set(0, bottom + h / 2, cfg.z);
      mesh.scale.set(w, h, 1);
      mesh.material.uniforms.uAspect.value = w / h;
    }
  }

  set flash(v: number) {
    for (const { mesh } of this.layers) mesh.material.uniforms.uFlash.value = v * 0.6;
  }

  set reveal(v: number) {
    for (const { mesh } of this.layers) mesh.material.uniforms.uReveal.value = v;
  }

  update(dt: number, time: number, input: Input) {
    this.stir += (Math.min(input.speed * 0.6, 1.2) - this.stir) * Math.min(1, dt * 3);
    for (const { mesh, cfg } of this.layers) {
      const u = mesh.material.uniforms;
      u.uTime.value = time;
      u.uStir.value = this.stir;
      if (input.inside) {
        this.stage.pointerOnZ(input.ndc, cfg.z, this.mouse);
        const target = new THREE.Vector2(
          (this.mouse.x - mesh.position.x) / mesh.scale.x + 0.5,
          (this.mouse.y - mesh.position.y) / mesh.scale.y + 0.5,
        );
        (u.uMouse.value as THREE.Vector2).lerp(target, Math.min(1, dt * 6));
      }
    }
  }
}
