/**
 * Scene lighting from the view model: ambient/hemisphere by `vm.ambient`
 * (plus DM reveal), a shadowed sun when the ambient is bright/dim, and one
 * PointLight per engine light (distance = dim radius). Up to MAX_SHADOW_LIGHTS
 * point lights cast shadows; their maps are refreshed only when told to.
 */
import * as THREE from 'three';
import type { BoardVM, LightVM } from '../../../engine/view/boardViewModel.ts';
import { CARRIED_HEIGHT, LAMP_HEIGHT, LIGHT_INTENSITY, MAX_SHADOW_LIGHTS, STEP } from './constants.ts';

interface PointEntry {
  light: THREE.PointLight;
  bulb: THREE.Mesh;
  /** DM-only cord from a hanging lamp down to its tile, so the bulb reads as belonging there */
  cord: THREE.Line;
  key: string;
}

export class LightLayer {
  readonly group = new THREE.Group();
  private ambient = new THREE.AmbientLight('#8fa6c0', 0.3);
  private hemi = new THREE.HemisphereLight('#dfe8f5', '#2a2e36', 0.3);
  private sun = new THREE.DirectionalLight('#fff2dd', 0);
  private points = new Map<string, PointEntry>();
  private bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  private cordMat = new THREE.LineBasicMaterial({ color: '#8a96a8', transparent: true, opacity: 0.55 });
  private ambientKey = '';

  constructor() {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.intensity = 0.75;
    this.group.add(this.ambient, this.hemi, this.sun, this.sun.target);
  }

  update(vm: BoardVM, topY: (r: number, c: number) => number, altitudeOf: (id: string) => number): void {
    this.updateAmbient(vm);
    const seen = new Set<string>();
    const shadowBudget = { left: MAX_SHADOW_LIGHTS };
    // moving (attached) lights first so they keep their shadows when the budget is tight
    const ordered = [...vm.lights].sort(
      (a, b) => Number(Boolean(b.attachedTo)) - Number(Boolean(a.attachedTo)),
    );
    for (const l of ordered) {
      seen.add(l.id);
      const ground = topY(l.r, l.c);
      const y = ground + (l.attachedTo ? altitudeOf(l.attachedTo) * STEP + CARRIED_HEIGHT : LAMP_HEIGHT);
      const key = `${l.r},${l.c},${y},${ground},${l.on},${l.color},${l.brightRadius},${l.dimRadius}`;
      let e = this.points.get(l.id);
      if (!e) {
        const light = new THREE.PointLight(l.color, 0, 1, 0);
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.004;
        light.shadow.normalBias = 0.03;
        light.shadow.camera.near = 0.2;
        light.shadow.autoUpdate = false;
        light.shadow.intensity = 0.8; // dark, never a black hole
        const bulb = new THREE.Mesh(this.bulbGeo, new THREE.MeshBasicMaterial({ color: l.color }));
        const cord = new THREE.Line(new THREE.BufferGeometry(), this.cordMat);
        this.group.add(light, bulb, cord);
        e = { light, bulb, cord, key: '' };
        this.points.set(l.id, e);
      }
      if (e.key !== key) {
        e.key = key;
        this.applyPoint(e, l, y, ground);
      }
      const wantsShadow = l.on && shadowBudget.left > 0;
      if (wantsShadow) shadowBudget.left--;
      if (e.light.castShadow !== wantsShadow) {
        e.light.castShadow = wantsShadow;
        e.light.shadow.needsUpdate = true;
      }
      // attached lights ride a unit: the bulb would sit inside the sprite, so hide it
      e.bulb.visible = !l.attachedTo && vm.view === 'dm';
      e.cord.visible = e.bulb.visible;
    }
    for (const [id, e] of this.points) {
      if (seen.has(id)) continue;
      this.group.remove(e.light, e.bulb, e.cord);
      (e.bulb.material as THREE.Material).dispose();
      e.cord.geometry.dispose();
      e.light.dispose();
      this.points.delete(id);
    }
  }

  /**
   * No distance decay: the angle between the floor and the light does the
   * falloff (a lamp-height cone), and the cutoff window is sized so the dim
   * radius still reads as lit (~0.35 of full) and nothing beyond it is.
   */
  private applyPoint(e: PointEntry, l: LightVM, y: number, ground: number): void {
    e.light.position.set(l.c + 0.5, y, l.r + 0.5);
    e.light.color.set(l.color);
    const h = Math.max(0.5, y - ground);
    e.light.distance = 1.25 * Math.hypot(Math.max(l.dimRadius, l.brightRadius) + 0.5, h);
    e.light.decay = 0;
    e.light.intensity = l.on ? LIGHT_INTENSITY : 0;
    e.light.visible = l.on;
    e.bulb.position.copy(e.light.position);
    e.cord.geometry.dispose();
    e.cord.geometry = new THREE.BufferGeometry().setFromPoints([
      e.light.position.clone(),
      new THREE.Vector3(e.light.position.x, ground + 0.02, e.light.position.z),
    ]);
    const mat = e.bulb.material as THREE.MeshBasicMaterial;
    if (l.on) {
      mat.color.set(l.color).multiplyScalar(2.6); // > 1 so bloom picks the bulb up
      mat.toneMapped = false;
    } else mat.color.set('#4a4f55');
    e.light.shadow.needsUpdate = true;
  }

  private updateAmbient(vm: BoardVM): void {
    const key = `${vm.ambient}|${vm.view}|${vm.dmReveal}|${vm.rows}x${vm.cols}`;
    if (key === this.ambientKey) return;
    this.ambientKey = key;
    const dm = vm.view === 'dm';
    // three's Lambert divides irradiance by pi, so intensity ~3 means "full albedo".
    if (vm.ambient === 'bright') {
      this.ambient.intensity = 1.5;
      this.hemi.intensity = 1.1;
      this.sun.intensity = 2.2;
    } else if (vm.ambient === 'dim') {
      this.ambient.intensity = 0.75;
      this.hemi.intensity = 0.5;
      this.sun.intensity = 0.6;
    } else {
      // dark: the DM's reveal keeps geometry legible; without it the DM sees a little more than players
      const reveal = dm ? (vm.dmReveal ? 1.25 : 0.4) : 0.06;
      this.ambient.intensity = reveal;
      this.hemi.intensity = reveal * 0.6;
      this.sun.intensity = 0;
    }
    this.sun.visible = this.sun.intensity > 0;
    const span = Math.max(vm.rows, vm.cols);
    this.sun.position.set(vm.cols / 2 - span * 0.6, span * 1.2, vm.rows / 2 + span * 0.45);
    this.sun.target.position.set(vm.cols / 2, 0, vm.rows / 2);
    const cam = this.sun.shadow.camera;
    cam.left = -span * 0.8;
    cam.right = span * 0.8;
    cam.top = span * 0.8;
    cam.bottom = -span * 0.8;
    cam.near = 1;
    cam.far = span * 4;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }

  /** Something that casts shadows moved: refresh every shadow map on the next frame. */
  markShadowsDirty(): void {
    this.sun.shadow.needsUpdate = true;
    for (const e of this.points.values()) if (e.light.castShadow) e.light.shadow.needsUpdate = true;
  }

  /**
   * Something changed at these cells: refresh the sun's map and the maps of the
   * shadowed point lights that reach them (each point light re-renders six cube
   * faces, so far-away lights are left alone). Returns how many point maps were marked.
   */
  markShadowsDirtyNear(cells: readonly { r: number; c: number }[]): number {
    if (cells.length === 0) return 0;
    this.sun.shadow.needsUpdate = true;
    let marked = 0;
    for (const e of this.points.values()) {
      if (!e.light.castShadow) continue;
      const reach = e.light.distance + 1.5; // + a tall sprite's shadow reaching back into range
      const near = cells.some(
        (cell) => Math.hypot(cell.c + 0.5 - e.light.position.x, cell.r + 0.5 - e.light.position.z) <= reach,
      );
      if (near) {
        e.light.shadow.needsUpdate = true;
        marked++;
      }
    }
    return marked;
  }

  dispose(): void {
    for (const e of this.points.values()) {
      e.light.dispose();
      (e.bulb.material as THREE.Material).dispose();
      e.cord.geometry.dispose();
    }
    this.points.clear();
    this.bulbGeo.dispose();
    this.cordMat.dispose();
    this.sun.dispose();
  }
}
