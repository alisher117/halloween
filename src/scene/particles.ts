import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';
import { rand } from '../utils/math';

/** Glowing embers that drift up out of the cauldron and pumpkin. */
export class Embers {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private origin = new THREE.Vector3();
  private spread = 1;

  constructor(private stage: Stage) {
    const n = CONFIG.embers.count;
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seed.set([Math.random(), Math.random(), Math.random(), rand(0.6, 1.4)], i * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));

    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOrigin: { value: this.origin },
          uSpread: { value: 1 },
          uRise: { value: 1 },
          uSize: { value: 1 },
          uReveal: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 seed;
          uniform float uTime, uSpread, uRise, uSize, uReveal;
          uniform vec3 uOrigin;
          varying float vA;
          varying float vHue;
          void main() {
            float life = 5.5 * seed.w;
            float t = mod(uTime + seed.z * life, life) / life;          // 0..1 lifetime
            vec3 p = uOrigin;
            p.x += (seed.x - 0.5) * uSpread + sin(uTime * 0.9 + seed.y * 20.0) * uSpread * 0.12 * t;
            p.y += t * uRise;
            p.z += (seed.y - 0.5) * 1.5;
            vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t)) * uReveal;
            vA *= 0.55 + 0.45 * sin(uTime * 9.0 + seed.x * 40.0);       // twinkle
            vHue = seed.y;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (0.6 + seed.x) * (1.0 - t * 0.5) / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          varying float vHue;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.82, 0.4), vHue);
            gl_FragColor = vec4(col * 1.6, a * a * vA);
          }
        `,
      }),
    );
    this.points.frustumCulled = false;
    stage.scene.add(this.points);
    stage.onResize(() => this.layout());
    this.layout();
  }

  private layout() {
    const s = this.stage;
    s.imageToWorld(0.5, 0.62, 0.4, this.origin);
    this.spread = s.imageSize(0.3, 0.4);
    const u = this.points.material.uniforms;
    u.uSpread.value = this.spread;
    u.uRise.value = s.bgH * s.depthScale(0.4) * 0.6;
    u.uSize.value = 26 * s.dpr * (s.height / 900);
  }

  set reveal(v: number) {
    this.points.material.uniforms.uReveal.value = v;
  }

  update(time: number) {
    this.points.material.uniforms.uTime.value = time;
  }
}

/** Thin rain streaks falling behind the wet glass. */
export class RainStreaks {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(private stage: Stage) {
    const n = CONFIG.rain.streaks;
    const geo = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));

    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uView: { value: new THREE.Vector2(10, 10) },
          uFlash: { value: 0 },
          uReveal: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 seed;
          uniform float uTime, uReveal;
          uniform vec2 uView;
          varying vec2 vUv;
          varying float vA;
          void main() {
            vUv = uv;
            float z = mix(-5.0, 3.0, seed.z);
            float depthK = (10.0 - z) / 10.0;                        // frustum grows with distance
            vec2 view = uView * depthK;
            float speed = mix(2.2, 3.4, seed.w) * view.y;
            float y = view.y * 0.6 - mod(uTime * speed + seed.y * view.y * 1.4, view.y * 1.4);
            float x = (seed.x - 0.5) * view.x * 1.1 + y * 0.12;     // slight wind slant
            float len = mix(0.04, 0.09, seed.w) * view.y;
            float wid = 0.0016 * view.y * mix(0.7, 1.4, seed.z);
            vec3 p = vec3(x, y, z) + vec3(position.x * wid + position.y * len * 0.12, position.y * len, 0.0);
            vA = mix(0.05, 0.16, seed.z) * uReveal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uFlash;
          varying vec2 vUv;
          varying float vA;
          void main() {
            float a = smoothstep(0.0, 0.5, vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0);
            gl_FragColor = vec4(vec3(0.78, 0.74, 1.0) * (1.0 + uFlash * 2.0), a * vA);
          }
        `,
      }),
      n,
    );
    // Instances are positioned entirely in the shader.
    const id = new THREE.Matrix4();
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    stage.scene.add(this.mesh);
    stage.onResize(() => this.layout());
    this.layout();
  }

  private layout() {
    const { halfW, halfH } = this.stage.visibleHalfSize(0);
    this.mesh.material.uniforms.uView.value.set(halfW * 2, halfH * 2);
  }

  set flash(v: number) {
    this.mesh.material.uniforms.uFlash.value = v;
  }

  set reveal(v: number) {
    this.mesh.material.uniforms.uReveal.value = v;
  }

  update(time: number) {
    this.mesh.material.uniforms.uTime.value = time;
  }
}
