import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';

/**
 * Rain on the glass. The drop video is a grayscale height map (white = thick water);
 * we take its gradient as a surface normal and bend the rendered scene through it,
 * then add rim shading and a specular glint so each drop reads as a tiny lens.
 */
const RainGlassShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tRain: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTile: { value: 800 },
    uStrength: { value: 0 },
    uRainTexel: { value: 1 / 1024 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tRain;
    uniform vec2 uRes;
    uniform float uTile, uStrength, uRainTexel;
    varying vec2 vUv;

    float h(vec2 p) { return texture2D(tRain, p).r; }

    void main() {
      vec2 ruv = vUv * uRes / uTile;                 // screen px → drop-video tiles
      float e = uRainTexel * 1.5;
      float c  = h(ruv);
      float dx = h(ruv + vec2(e, 0.0)) - h(ruv - vec2(e, 0.0));
      float dy = h(ruv + vec2(0.0, e)) - h(ruv - vec2(0.0, e));
      vec2 n = vec2(dx, dy);                          // surface slope
      float wet = smoothstep(0.02, 0.25, c);

      // refraction: drops act like small inverted lenses
      vec2 offs = (-n * 2.2 - (vUv - 0.5) * 0.0) * uStrength;
      offs += -n * c * uStrength * 1.5;
      vec3 scene = texture2D(tDiffuse, vUv + offs * vec2(1.0, uRes.x / uRes.y)).rgb;
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 col = mix(base, scene, wet * step(0.0001, uStrength));

      // shading: darker rim where the drop surface is steep, bright core
      float slope = length(n) * 6.0;
      col *= 1.0 - smoothstep(0.15, 1.0, slope) * 0.35 * wet * step(0.0001, uStrength);
      col += col * c * 0.18 * step(0.0001, uStrength);
      // specular glint from an upper-left light
      vec3 N = normalize(vec3(-n * 9.0, 1.0));
      float spec = pow(max(dot(N, normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 60.0);
      col += vec3(1.0, 0.95, 1.0) * spec * wet * 0.55 * step(0.0001, uStrength);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Vignette, film grain, lightning wash, chromatic fringe and the intro fade. */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: RainGlassShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFlash, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // subtle lens fringe towards the corners
      vec2 ca = d * r2 * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - ca).b;

      col += uFlash * vec3(0.12, 0.11, 0.2) * (1.0 - vUv.y * 0.3);
      float vig = smoothstep(0.95, 0.18, r2 * 1.9);
      col *= mix(0.5, 1.0, vig);
      col += (rnd(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5) * 0.035;
      gl_FragColor = vec4(col * uFade, 1.0);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private rain: ShaderPass;
  private finish: ShaderPass;

  constructor(private stage: Stage) {
    const { renderer, scene, camera } = stage;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    const b = CONFIG.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), b.strength, b.radius, b.threshold);
    this.composer.addPass(this.bloom);

    this.rain = new ShaderPass(RainGlassShader);
    this.composer.addPass(this.rain);

    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());

    stage.onResize(() => this.resize());
    this.resize();
  }

  setRainTexture(tex: THREE.Texture) {
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.rain.uniforms.tRain.value = tex;
    this.rain.uniforms.uStrength.value = CONFIG.rain.refraction;
  }

  private resize() {
    const { width, height, dpr } = this.stage;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    // Bloom at half resolution: it's blurry anyway.
    this.bloom.resolution.set(width / 2, height / 2);
    const px = new THREE.Vector2(width * dpr, height * dpr);
    this.rain.uniforms.uRes.value.copy(px);
    this.rain.uniforms.uTile.value = CONFIG.rain.tileSize * dpr * Math.max(0.75, Math.min(1.2, height / 1000));
    this.finish.uniforms.uRes.value.copy(px);
  }

  set flash(v: number) {
    this.finish.uniforms.uFlash.value = v;
  }
  set fade(v: number) {
    this.finish.uniforms.uFade.value = v;
  }
  set rainAmount(v: number) {
    if (this.rain.uniforms.tRain.value) this.rain.uniforms.uStrength.value = CONFIG.rain.refraction * v;
  }

  render(time: number) {
    this.finish.uniforms.uTime.value = time;
    this.composer.render();
  }
}
