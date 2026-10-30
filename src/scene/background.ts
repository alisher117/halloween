import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Stage } from '../core/stage';

/**
 * The flat illustration. A shader maps the artwork inside an oversized plane so
 * tall/narrow screens get a soft continuation of the sky and ground instead of bars.
 */
export class Background {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(private stage: Stage, texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;

    this.uniforms = {
      map: { value: texture },
      uPlane: { value: new THREE.Vector2(1, 1) },
      uImage: { value: new THREE.Vector2(1, 1) },
      uFlash: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec2 uPlane, uImage;
        uniform float uFlash;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * uPlane;
          vec2 iuv = p / uImage + 0.5;
          vec2 cuv = clamp(iuv, vec2(0.001), vec2(0.999));
          vec3 col = texture2D(map, cuv).rgb;
          // Continue the artwork beyond its top/bottom edge with a blurred, darkening fade.
          float over = max(iuv.y - 1.0, 0.0), under = max(-iuv.y, 0.0);
          if (over > 0.0 || under > 0.0) {
            float ev = iuv.y > 1.0 ? 0.999 : 0.001;
            float d = over + under;
            vec3 sharp = texture2D(map, vec2(cuv.x, ev)).rgb;
            vec3 soft = texture2D(map, vec2(cuv.x, ev), 4.0).rgb;
            vec3 edge = mix(sharp, soft, smoothstep(0.0, 0.06, d));     // no seam at the border
            vec3 deep = iuv.y > 1.0 ? vec3(0.03, 0.01, 0.08) : vec3(0.04, 0.015, 0.08);
            col = mix(edge, deep, smoothstep(0.02, 0.4, d));
          }
          // Lightning: cool light that hits the sky hardest.
          float sky = smoothstep(0.75, 0.05, 1.0 - iuv.y);
          col += uFlash * vec3(0.55, 0.5, 0.95) * (0.18 + 0.55 * sky);
          col *= 1.0 + uFlash * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    stage.scene.add(this.mesh);
    stage.onResize(() => this.layout());
    this.layout();
  }

  set flash(v: number) {
    this.uniforms.uFlash.value = v;
  }

  private layout() {
    const { stage } = this;
    const z = stage.bgZ;
    const { halfW, halfH } = stage.visibleHalfSize(z);
    // Oversize the plane: covers the view even with parallax and the intro's wide FOV.
    const w = Math.max(halfW * 2, stage.bgW) * 1.6;
    const h = Math.max(halfH * 2, stage.bgH) * 1.6;
    this.mesh.position.set(0, 0, z);
    this.mesh.scale.set(w, h, 1);
    this.uniforms.uPlane.value.set(w, h);
    this.uniforms.uImage.value.set(stage.bgW, stage.bgH);
  }
}

export const loadBackgroundTexture = () => new THREE.TextureLoader().loadAsync(CONFIG.background.src);
