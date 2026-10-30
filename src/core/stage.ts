import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Renderer + camera + the mapping between artwork coordinates and 3D space.
 *
 * The background art lives on a plane at `backgroundZ`. Anything placed at
 * another depth is scaled by `depthScale(z)` so that, from the resting camera,
 * it lines up with the same spot of the illustration.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene = new THREE.Scene();
  readonly canvas: HTMLCanvasElement;

  width = 1;
  height = 1;
  dpr = 1;
  /** Size of the artwork plane in world units. */
  bgW = 1;
  bgH = 1;

  readonly restZ = CONFIG.camera.z;
  readonly bgZ = CONFIG.camera.backgroundZ;

  private resizeHandlers = new Set<() => void>();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  constructor(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // post-processing chain; MSAA is wasted here
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // keep the illustration's colours exact
    this.renderer.setClearColor(0x14082a, 1);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.01, 100);
    this.camera.position.set(0, 0, this.restZ);
  }

  onResize(fn: () => void) {
    this.resizeHandlers.add(fn);
    return () => this.resizeHandlers.delete(fn);
  }

  resize(width = window.innerWidth, height = window.innerHeight, dpr?: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const isSmall = Math.min(width, height) < 700;
    this.dpr = dpr ?? Math.min(window.devicePixelRatio || 1, isSmall ? 1.75 : 2);

    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.layoutBackground();
    this.resizeHandlers.forEach((fn) => fn());
  }

  get aspect() {
    return this.width / this.height;
  }

  private layoutBackground() {
    const { aspect: imgAspect, minVisibleWidth, overscan } = CONFIG.background;
    const { halfW, halfH } = this.visibleHalfSize(this.bgZ);
    const visW = halfW * 2;
    const visH = halfH * 2;
    let w: number;
    let h: number;
    if (this.aspect >= imgAspect) {
      w = visW;
      h = w / imgAspect;
    } else {
      h = visH;
      w = h * imgAspect;
      if (visW / w < minVisibleWidth) {
        w = visW / minVisibleWidth;
        h = w / imgAspect;
      }
    }
    this.bgW = w * overscan;
    this.bgH = h * overscan;
  }

  /** How much smaller something at depth z must be to line up with the artwork. */
  depthScale(z: number) {
    return (this.restZ - z) / (this.restZ - this.bgZ);
  }

  /** Half width/height of the view frustum at depth z (resting camera). */
  visibleHalfSize(z: number) {
    const halfH = (this.restZ - z) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    return { halfW: halfH * this.camera.aspect, halfH };
  }

  /** World position at depth z that sits over artwork point (u, v). */
  imageToWorld(u: number, v: number, z: number, out = new THREE.Vector3()) {
    const s = this.depthScale(z);
    return out.set((u - 0.5) * this.bgW * s, (0.5 - v) * this.bgH * s, z);
  }

  /** A length expressed as a fraction of artwork width, in world units at depth z. */
  imageSize(fraction: number, z: number) {
    return fraction * this.bgW * this.depthScale(z);
  }

  /** Intersect the pointer ray with the plane z = const. */
  pointerOnZ(ndc: THREE.Vector2, z: number, out = new THREE.Vector3()) {
    this.raycaster.setFromCamera(ndc, this.camera);
    this.plane.constant = -z;
    return this.raycaster.ray.intersectPlane(this.plane, out) ?? out.set(0, 0, z);
  }

  get raycasterFromPointer() {
    return this.raycaster;
  }
}
