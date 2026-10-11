/**
 * Locked tactical orthographic camera with integer texel zoom and pixel-grid
 * snapping (no shimmer while panning). The camera sits on one of four headings
 * (AZIMUTHS, 90° apart and offset from the grid axes so two side faces of every
 * step show) and turns between them in a short tween; top-down drops the
 * offset so the map is square to the screen. Snapping happens in
 * screen space — the view target is rounded along the camera's right and up
 * axes — so a whole-pixel pan is an exact image shift at any heading. A
 * top-down mode looks straight down, keeping the same screen-north.
 */
import * as THREE from 'three';
import {
  AZIMUTH_OFFSET,
  AZIMUTHS,
  MAX_ZOOM,
  MIN_ZOOM,
  PITCH_TACTICAL,
  PITCH_TOP,
  ROTATE_MS,
  TEXELS,
  type CameraAzimuth,
  type CameraMode,
} from './constants.ts';

const DIST = 60;
const QUARTER = Math.PI / 2;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

export class TacticalCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  mode: CameraMode = 'tactical';
  /** integer screen pixels per texel */
  zoom = 3;
  /** ground point (x, z) the view is centred on (unsnapped) */
  target = new THREE.Vector2(0, 0);
  /** heading index the camera is at or turning toward */
  azimuth: CameraAzimuth = 0;
  /** current heading angle (radians, continuous: turning 3 -> 0 goes forward) */
  private heading = AZIMUTHS[0] ?? 0;
  private turn: { from: number; to: number; start: number } | null = null;
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
  /**
   * The heading the view actually uses: top-down drops the off-axis offset so
   * the map stays square to the screen (and keeps only the 90° turns).
   */
  private get view(): number {
    return this.mode === 'top' ? this.heading - AZIMUTH_OFFSET : this.heading;
  }
  /** current view heading angle (radians) */
  get headingAngle(): number {
    return this.view;
  }
  /** true while a 90° turn is in progress */
  get turning(): boolean {
    return this.turn !== null;
  }
  /** CSS pixels per world unit */
  get ppu(): number {
    return TEXELS * this.zoom;
  }
  /** vertical stretch for upright sprites so they project 1:1 */
  get spriteStretch(): number {
    return this.mode === 'top' ? 1 : 1 / Math.cos(this.pitch);
  }
  /** unit ground vector pointing from the view target toward the camera (screen-down on the floor) */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.view), 0, Math.cos(this.view));
  }
  /** unit ground vector pointing screen-right */
  get right(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.view), 0, -Math.sin(this.view));
  }
  /** unit vector pointing screen-up (perpendicular to the view direction) */
  get up(): THREE.Vector3 {
    const s = Math.sin(this.pitch),
      c = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.view) * s, c, -Math.cos(this.view) * s);
  }
  /** unit vector from the scene toward the camera */
  get toCamera(): THREE.Vector3 {
    const s = Math.sin(this.pitch),
      c = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.view) * c, s, Math.cos(this.view) * c);
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

  /**
   * Turn to a heading. With `now` the turn is tweened (advance it with tick);
   * without, it jumps. Always takes the short way round.
   */
  setAzimuth(azimuth: CameraAzimuth, now?: number): void {
    if (azimuth === this.azimuth && !this.turn) return;
    const goal = this.turn ? this.turn.to : this.heading;
    let delta = (((azimuth - this.azimuth) % 4) + 4) % 4;
    if (delta === 3) delta = -1;
    const to = goal + delta * QUARTER;
    this.azimuth = azimuth;
    if (now === undefined) {
      this.turn = null;
      this.heading = to;
    } else this.turn = { from: this.heading, to, start: now };
    this.update();
  }

  /** Advance a turn in progress. Returns true while the camera moved. */
  tick(now: number): boolean {
    if (!this.turn) return false;
    const t = Math.min(1, (now - this.turn.start) / ROTATE_MS);
    this.heading = this.turn.from + (this.turn.to - this.turn.from) * easeOut(t);
    if (t >= 1) {
      this.heading = this.turn.to;
      this.turn = null;
    }
    this.update();
    return true;
  }

  /** Pan by a CSS-pixel delta (drag): move the target on the ground plane. */
  pan(dx: number, dy: number): void {
    const r = this.right,
      f = this.forward;
    const along = dy / (this.ppu * Math.sin(this.pitch));
    this.target.x -= (r.x * dx) / this.ppu + f.x * along;
    this.target.y -= (r.z * dx) / this.ppu + f.z * along;
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
    const s = Math.sin(this.pitch);
    const sinH = Math.sin(this.view),
      cosH = Math.cos(this.view);
    // The target's screen coordinates are (t·right, t·up); round both to whole
    // pixels and rebuild the ground point, so world origin lands on the pixel grid.
    const a = Math.round((this.target.x * cosH - this.target.y * sinH) * ppu) / ppu;
    const along = Math.round((this.target.x * sinH + this.target.y * cosH) * s * ppu) / (s * ppu);
    const tx = a * cosH + along * sinH;
    const tz = -a * sinH + along * cosH;
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
    const to = this.toCamera;
    cam.position.set(tx + to.x * DIST, to.y * DIST, tz + to.z * DIST);
    // straight down, "up" would be degenerate: keep screen-north the far side of the heading
    if (this.mode === 'top') cam.up.set(-sinH, 0, -cosH);
    else cam.up.set(0, 1, 0);
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
   * World offset (along the screen's right and up axes) that moves a point's
   * projection onto whole CSS pixels, so a sprite whose corner is that point
   * samples 1:1 wherever it stands.
   */
  pixelSnap(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const q = this.project(p);
    const fx = q.x - Math.round(q.x),
      fy = q.y - Math.round(q.y);
    return out
      .copy(this.right)
      .multiplyScalar(-fx / this.ppu)
      .addScaledVector(this.up, fy / this.ppu);
  }
}
