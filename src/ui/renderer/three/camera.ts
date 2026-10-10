/**
 * Locked tactical orthographic camera with integer texel zoom and pixel-grid
 * snapping (no shimmer while panning). Azimuth is fixed at 0 — the sheets are
 * front-facing only — so screen x = world x and screen y mixes height (cos
 * pitch) and depth (sin pitch). A top-down mode looks straight down.
 */
import * as THREE from 'three';
import { MAX_ZOOM, MIN_ZOOM, PITCH_TACTICAL, PITCH_TOP, TEXELS, type CameraMode } from './constants.ts';

const DIST = 60;

export class TacticalCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  mode: CameraMode = 'tactical';
  /** integer screen pixels per texel */
  zoom = 3;
  /** ground point (x, z) the view is centred on */
  target = new THREE.Vector2(0, 0);
  /** viewport in CSS pixels */
  private width = 1;
  private height = 1;

  get viewportWidth(): number {
    return this.width;
  }
  get viewportHeight(): number {
    return this.height;
  }

  get pitch(): number {
    return this.mode === 'top' ? PITCH_TOP : PITCH_TACTICAL;
  }
  /** CSS pixels per world unit */
  get ppu(): number {
    return TEXELS * this.zoom;
  }
  /** vertical stretch for upright sprites so they project 1:1 */
  get spriteStretch(): number {
    return this.mode === 'top' ? 1 : 1 / Math.cos(this.pitch);
  }
  /** unit vector from the scene toward the camera */
  get toCamera(): THREE.Vector3 {
    return new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch));
  }

  setViewport(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.update();
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.update();
  }

  /** Pan by a CSS-pixel delta (drag): move the target on the ground plane. */
  pan(dx: number, dy: number): void {
    this.target.x -= dx / this.ppu;
    this.target.y -= dy / (this.ppu * Math.sin(this.pitch));
    this.update();
  }

  /** Change zoom by whole steps, keeping the ground point under (px, py) still. */
  zoomBy(steps: number, px?: number, py?: number): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + steps));
    if (next === this.zoom) return;
    const anchor = px !== undefined && py !== undefined ? this.groundAt(px, py) : null;
    this.zoom = next;
    this.update();
    if (anchor) {
      const after = this.groundAt(px as number, py as number);
      this.target.x += anchor.x - after.x;
      this.target.y += anchor.y - after.y;
      this.update();
    }
  }

  /** Choose the largest zoom that fits a world-space box and centre on it. */
  fit(bounds: THREE.Box3, margin = 12): void {
    const centre = bounds.getCenter(new THREE.Vector3());
    this.target.set(centre.x, centre.z);
    for (let k = MAX_ZOOM; k >= MIN_ZOOM; k--) {
      this.zoom = k;
      this.update();
      const px = this.projectBox(bounds);
      if (px.width + margin * 2 <= this.width && px.height + margin * 2 <= this.height) break;
    }
    // centre the projected box (height makes the plain ground centre sit low)
    const px = this.projectBox(bounds);
    const cx = (px.minX + px.maxX) / 2 - this.width / 2;
    const cy = (px.minY + px.maxY) / 2 - this.height / 2;
    this.pan(-cx, -cy);
  }

  /** Recompute position and frustum with everything snapped to the pixel grid. */
  update(): void {
    const ppu = this.ppu;
    const s = Math.sin(this.pitch),
      c = Math.cos(this.pitch);
    // snap the target so world origin lands on whole CSS pixels
    const tx = Math.round(this.target.x * ppu) / ppu;
    const tz = s > 1e-6 ? Math.round(this.target.y * s * ppu) / (s * ppu) : this.target.y;
    const cam = this.camera;
    const halfW0 = Math.floor(this.width / 2),
      halfW1 = this.width - halfW0;
    const halfH0 = Math.floor(this.height / 2),
      halfH1 = this.height - halfH0;
    cam.left = -halfW0 / ppu;
    cam.right = halfW1 / ppu;
    cam.top = halfH1 / ppu;
    cam.bottom = -halfH0 / ppu;
    cam.near = 0.1;
    cam.far = DIST * 3;
    cam.position.set(tx, s * DIST, tz + c * DIST);
    cam.up.set(0, 1, 0);
    if (this.mode === 'top') cam.up.set(0, 0, -1);
    cam.lookAt(tx, 0, tz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  /** World point -> CSS pixel position inside the viewport (y down). */
  project(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = p.clone().project(this.camera);
    return out.set(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height);
  }

  /** Normalised device coords for a CSS pixel position. */
  ndc(px: number, py: number): THREE.Vector2 {
    return new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
  }

  /** Ground-plane (y = 0) point under a CSS pixel. */
  groundAt(px: number, py: number): THREE.Vector2 {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(px, py), this.camera);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit);
    return new THREE.Vector2(hit.x, hit.z);
  }

  /** Screen-space AABB of a world box (CSS px). */
  projectBox(box: THREE.Box3): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const q = this.project(p);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Lift (world y) that moves a point's projected y onto a whole CSS pixel, so
   * sprites standing on odd heights still sample 1:1.
   */
  pixelLift(p: THREE.Vector3): number {
    if (this.mode === 'top') return 0;
    const sy = this.project(p).y;
    const frac = sy - Math.round(sy);
    return frac / (this.ppu * Math.cos(this.pitch));
  }
}
