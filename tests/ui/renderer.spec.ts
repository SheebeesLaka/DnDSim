import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BoardVM, CellVM, UnitVM } from '../../src/engine/view/boardViewModel.ts';
import { installCanvasShim } from '../helpers/canvasShim.ts';

installCanvasShim();

const { TacticalCamera } = await import('../../src/ui/renderer/three/camera.ts');
const { TileLayer } = await import('../../src/ui/renderer/three/tiles.ts');
const { UnitLayer } = await import('../../src/ui/renderer/three/units.ts');
const { pickWithRay, shadowChanges } = await import('../../src/ui/renderer/three/ThreeRenderer.ts');
const { isOccluded } = await import('../../src/ui/renderer/three/occlusion.ts');
const { cellsAlong, heightRegions, labelCellCosts } = await import('../../src/ui/renderer/three/regions.ts');
const { AZIMUTHS, PITCH_MAX, PITCH_MIN, PITCH_TACTICAL, ROTATE_MS, SHADOW_STRETCH, STEP, TEXELS } =
  await import('../../src/ui/renderer/three/constants.ts');
const { viewOptionsFromPrefs, turnYaw, homeAngles, anglePrefs } = await import('../../src/ui/viewPrefs.ts');
const { findLedges, SKIRT_TOP } = await import('../../src/ui/renderer/three/ledges.ts');
const { SkirtLayer, skirtDistances, skirtFade, maxPropHeight, SKIRT_RINGS } =
  await import('../../src/ui/renderer/three/skirt.ts');
const { faceShade } = await import('../../src/ui/renderer/three/tiles.ts');
const { BOARD_THEME_IDS, TOP_VARIANTS, makeTopAtlas, topVariant } =
  await import('../../src/ui/renderer/three/tileThemes.ts');
const { BOARD_THEMES, DEFAULT_BOARD_THEME } = await import('../../src/ui/boardThemes.ts');
const { THEME_PROPS } = await import('../../src/ui/renderer/three/skirt.ts');
const { WheelZoom, EVENTS_PER_STEP, IDLE_RESET_MS } =
  await import('../../src/ui/renderer/three/wheelZoom.ts');
const { SPRITE_CELL, STEP_TEXELS, tx } = await import('../../src/ui/renderer/three/constants.ts');
const { makeSideTexture } = await import('../../src/ui/renderer/three/tileThemes.ts');
const { LightLayer, lightTweenLevel, ambientLevels } = await import('../../src/ui/renderer/three/lights.ts');

const W = 1200,
  H = 800;

function boardVm(rows: number, cols: number, edit: (cells: CellVM[][]) => void = () => {}): BoardVM {
  const cells: CellVM[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellVM[] = [];
    for (let c = 0; c < cols; c++)
      row.push({ r, c, enabled: true, elevation: 0, light: 'bright', ramp: null });
    cells.push(row);
  }
  edit(cells);
  return {
    rows,
    cols,
    theme: 'stone',
    ambient: 'bright',
    dmReveal: false,
    cells,
    units: [],
    lights: [],
    highlights: {
      placement: [],
      move: [],
      attack: [],
      castRange: [],
      castTargets: [],
      areaTemplate: [],
      areaUnits: [],
    },
    banner: null,
    phaseLabel: 'Setup',
    strip: [],
    showStrip: true,
    view: 'dm',
    turnOrder: [],
    started: false,
    round: 0,
    pendingKind: null,
  };
}

const unit = (id: string, r: number, c: number, extra: Partial<UnitVM> = {}): UnitVM => ({
  id,
  kind: 'entity',
  name: id,
  initials: id.toUpperCase(),
  r,
  c,
  altitude: 0,
  color: '#3366cc',
  side: 'party',
  hp: 10,
  maxHp: 10,
  showHpRing: true,
  showHpNumbers: true,
  ac: 10,
  mob: 3,
  statuses: [],
  selected: false,
  active: false,
  inDarkness: false,
  terrain: null,
  spritePath: 'sheet.png#0',
  ...extra,
});

/** The scene of the HD-2D brief: a +15/+10/+5 corner, a pit, a ramp. */
const raisedScene = () =>
  boardVm(8, 9, (cells) => {
    const set = (r: number, c: number, e: number) => {
      const cell = cells[r]?.[c];
      if (cell) cell.elevation = e;
    };
    set(0, 0, 3);
    set(0, 1, 2);
    set(1, 0, 2);
    set(1, 1, 1);
    set(0, 2, 1);
    set(2, 0, 1);
    set(5, 5, -1);
    set(5, 6, -1);
    set(6, 5, -2);
    const ramp = cells[3]?.[6];
    if (ramp) {
      ramp.elevation = 1;
      ramp.ramp = { from: 1, to: 0, dir: 'S' };
    }
  });

const DEG = Math.PI / 180;

/** heading: a home-heading index (0..3), or { yaw, pitch } in degrees for a free angle */
function setup(vm: BoardVM, heading: 0 | 1 | 2 | 3 | { yaw: number; pitch: number } = 0) {
  const tiles = new TileLayer();
  tiles.update(vm);
  const cam = new TacticalCamera();
  if (typeof heading === 'number') cam.setAngles(AZIMUTHS[heading] as number, PITCH_TACTICAL);
  else cam.setAngles(heading.yaw * DEG, heading.pitch * DEG);
  cam.setViewport(W, H);
  cam.fit(tiles.bounds);
  const ray = new THREE.Raycaster();
  const scene = new THREE.Scene();
  scene.add(tiles.group);
  scene.updateMatrixWorld(true);
  return { tiles, cam, ray, scene };
}

const HEADINGS = [0, 1, 2, 3] as const;
/** free angles (degrees): off-grid yaws across the whole tilt range */
const ANGLES = [0, 17, 30, 133, 301].flatMap((yaw) => [30, 40, 52, 60].map((pitch) => ({ yaw, pitch })));
const angleName = (a: { yaw: number; pitch: number }) => `yaw ${a.yaw}° pitch ${a.pitch}°`;
const whole = (v: number) => Math.abs(v - Math.round(v)) < 1e-3;

describe('tactical camera: crisp pixels at every heading', () => {
  it.each(HEADINGS)('heading %i: chooses a whole-number zoom that fits the board', (az) => {
    const { cam, tiles } = setup(raisedScene(), az);
    expect(Number.isInteger(cam.zoom)).toBe(true);
    const box = cam.projectBox(tiles.bounds);
    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.maxX).toBeLessThanOrEqual(W);
    expect(box.minY).toBeGreaterThanOrEqual(0);
    expect(box.maxY).toBeLessThanOrEqual(H);
  });

  it.each(HEADINGS)(
    'heading %i: world origin stays on whole pixels after arbitrary pans (no shimmer)',
    (az) => {
      const { cam } = setup(raisedScene(), az);
      const pans = [
        [0.3, 0.7],
        [13.37, -2.2],
        [-101.9, 44.4],
        [0.5, 0.5],
        [7.77, 3.14],
      ];
      for (const [dx, dy] of pans) {
        cam.pan(dx ?? 0, dy ?? 0);
        const p = cam.project(new THREE.Vector3(0, 0, 0));
        expect(whole(p.x) && whole(p.y), `after pan ${dx},${dy}: ${p.x},${p.y}`).toBe(true);
      }
    },
  );

  it.each(HEADINGS)('heading %i: a whole-pixel pan shifts every point by exactly that much', (az) => {
    const { cam } = setup(raisedScene(), az);
    const pts = [new THREE.Vector3(2.3, 0, 4.1), new THREE.Vector3(6.71, STEP * 2, 1.05)];
    const before = pts.map((p) => cam.project(p));
    cam.pan(37, -23);
    pts.forEach((p, i) => {
      const a = before[i] as THREE.Vector2;
      const b = cam.project(p);
      expect(b.x - a.x).toBeCloseTo(37, 4);
      expect(b.y - a.y).toBeCloseTo(-23, 4);
    });
  });

  it.each(HEADINGS)('heading %i: a billboard texel is exactly `zoom` pixels wide and tall', (az) => {
    const { cam } = setup(raisedScene(), az);
    const p = new THREE.Vector3(2, 0, 3);
    const a = cam.project(p);
    const b = cam.project(p.clone().addScaledVector(cam.right, 1 / TEXELS));
    expect(b.x - a.x).toBeCloseTo(cam.zoom, 5);
    expect(b.y - a.y).toBeCloseTo(0, 5);
    const top = cam.project(p.clone().add(new THREE.Vector3(0, (1 / TEXELS) * cam.spriteStretch, 0)));
    expect(a.y - top.y).toBeCloseTo(cam.zoom, 5);
    expect(top.x - a.x).toBeCloseTo(0, 5);
  });

  it.each(HEADINGS)('heading %i: pixelSnap puts a sprite corner anywhere onto a whole pixel', (az) => {
    const { cam } = setup(raisedScene(), az);
    const corner = new THREE.Vector3(3.37, 0.123, 2.81);
    corner.add(cam.pixelSnap(corner));
    const p = cam.project(corner);
    expect(whole(p.x) && whole(p.y)).toBe(true);
  });

  it('integer zoom steps keep the point under the cursor in place', () => {
    const { cam } = setup(raisedScene());
    const before = cam.groundAt(400, 300);
    const z0 = cam.zoom;
    cam.zoomBy(1, 400, 300);
    expect(cam.zoom).toBe(z0 + 1);
    const after = cam.groundAt(400, 300);
    expect(after.distanceTo(before)).toBeLessThan(1.5 / (TEXELS * cam.zoom) + 0.05);
  });

  it('top-down mode looks straight down without stretching sprites, keeping screen-north', () => {
    const { cam } = setup(raisedScene(), 1);
    cam.setMode('top');
    expect(cam.spriteStretch).toBe(1);
    const a = cam.project(new THREE.Vector3(2, 0, 3));
    const b = cam.project(new THREE.Vector3(2, 1, 3));
    expect(b.y).toBeCloseTo(a.y, 3);
    // the ground direction toward the camera still points screen-down
    const c = cam.project(new THREE.Vector3(2, 0, 3).add(cam.forward));
    expect(c.y - a.y).toBeCloseTo(cam.ppu, 3);
    expect(c.x - a.x).toBeCloseTo(0, 3);
  });

  it('turns take the short way round, tween, and keep the centre of the view in place', () => {
    const { cam } = setup(raisedScene(), 3);
    const centre = cam.groundAt(W / 2, H / 2);
    const start = cam.headingAngle;
    cam.setAngles(AZIMUTHS[0] as number, PITCH_TACTICAL, 1000);
    expect(cam.turning).toBe(true);
    cam.tick(1000 + ROTATE_MS / 2);
    expect(cam.headingAngle).toBeGreaterThan(start);
    expect(cam.headingAngle).toBeLessThan(start + Math.PI / 2);
    cam.tick(1000 + ROTATE_MS + 1);
    expect(cam.turning).toBe(false);
    expect(cam.headingAngle).toBeCloseTo(start + Math.PI / 2, 6); // 3 -> 0 is a quarter turn forward
    expect(cam.groundAt(W / 2, H / 2).distanceTo(centre)).toBeLessThan(2 / cam.ppu);
    expect(cam.tick(5000)).toBe(false);
  });

  it('the headings are 90° apart and off the grid axes, so two side faces show', () => {
    for (let k = 0; k < 4; k++) {
      const a = AZIMUTHS[k] as number;
      expect(Math.abs(Math.sin(a))).toBeGreaterThan(0.3);
      expect(Math.abs(Math.cos(a))).toBeGreaterThan(0.3);
      expect(a - (AZIMUTHS[0] as number)).toBeCloseTo((k * Math.PI) / 2);
    }
  });
});

describe('free camera: orbit and tilt', () => {
  it.each(ANGLES.map((a) => [angleName(a), a] as const))(
    '%s: whole-pixel origin after pans, exact pan shifts, 1:1 texels, snapped corners',
    (_name, angle) => {
      const { cam } = setup(raisedScene(), angle);
      for (const [dx, dy] of [
        [0.3, 0.7],
        [13.37, -2.2],
        [-101.9, 44.4],
      ]) {
        cam.pan(dx ?? 0, dy ?? 0);
        const p = cam.project(new THREE.Vector3(0, 0, 0));
        expect(whole(p.x) && whole(p.y), `after pan ${dx},${dy}: ${p.x},${p.y}`).toBe(true);
      }
      const pt = new THREE.Vector3(6.71, STEP * 2, 1.05);
      const before = cam.project(pt);
      cam.pan(37, -23);
      const after = cam.project(pt);
      expect(after.x - before.x).toBeCloseTo(37, 4);
      expect(after.y - before.y).toBeCloseTo(-23, 4);
      // an upright billboard texel, stretched for this tilt, is exactly `zoom` pixels square
      const a = cam.project(pt);
      const b = cam.project(pt.clone().addScaledVector(cam.right, 1 / TEXELS));
      const top = cam.project(pt.clone().add(new THREE.Vector3(0, (1 / TEXELS) * cam.spriteStretch, 0)));
      expect(b.x - a.x).toBeCloseTo(cam.zoom, 5);
      expect(a.y - top.y).toBeCloseTo(cam.zoom, 5);
      expect(top.x - a.x).toBeCloseTo(0, 5);
      const corner = new THREE.Vector3(3.37, 0.123, 2.81);
      corner.add(cam.pixelSnap(corner));
      const q = cam.project(corner);
      expect(whole(q.x) && whole(q.y)).toBe(true);
    },
  );

  it('right-drag turns the heading and tilts, hard-stopping at the tilt limits', () => {
    const { cam } = setup(raisedScene());
    const yaw0 = cam.headingAngle;
    cam.orbit(50, 0);
    expect(cam.headingAngle).toBeLessThan(yaw0); // dragging right swings the camera to its left
    expect(cam.pitch).toBeCloseTo(PITCH_TACTICAL, 6);
    cam.orbit(0, 10_000);
    expect(cam.pitch).toBeCloseTo(PITCH_MAX, 6);
    cam.orbit(0, -10_000);
    expect(cam.pitch).toBeCloseTo(PITCH_MIN, 6);
    // top-down only turns
    cam.setMode('top');
    cam.orbit(0, 500);
    cam.setMode('tactical');
    expect(cam.pitch).toBeCloseTo(PITCH_MIN, 6);
    // far round and back: the saved angle is wrapped to [0, 360)
    cam.orbit(-5000, 0);
    expect(cam.angles.yaw).toBeGreaterThanOrEqual(0);
    expect(cam.angles.yaw).toBeLessThan(360);
  });

  it('orbiting keeps the ground point at the centre of the view in place', () => {
    const { cam } = setup(raisedScene());
    const centre = cam.groundAt(W / 2, H / 2);
    cam.orbit(123, 37);
    expect(cam.groundAt(W / 2, H / 2).distanceTo(centre)).toBeLessThan(2 / cam.ppu);
  });

  it('a requested angle tweens there the short way, tilt included; repeating it is a no-op', () => {
    const { cam } = setup(raisedScene(), { yaw: 350, pitch: 35 });
    const start = cam.headingAngle;
    expect(cam.setAngles(10 * DEG, 55 * DEG, 0)).toBe(true);
    cam.tick(ROTATE_MS / 2);
    // forward 20° through 360, not back 340° through 180
    expect(cam.headingAngle).toBeGreaterThan(start);
    expect(cam.headingAngle).toBeLessThan(start + 20 * DEG);
    expect(cam.pitch).toBeGreaterThan(35 * DEG);
    expect(cam.pitch).toBeLessThan(55 * DEG);
    cam.tick(ROTATE_MS + 1);
    expect(cam.turning).toBe(false);
    expect(cam.headingAngle).toBeCloseTo(start + 20 * DEG, 6);
    expect(cam.pitch).toBeCloseTo(55 * DEG, 6);
    expect(cam.angles).toEqual({ yaw: 10, pitch: 55 });
    expect(cam.setAngles(10 * DEG, 55 * DEG, 5000)).toBe(false);
    // out-of-range tilts are clamped
    cam.setAngles(10 * DEG, 85 * DEG);
    expect(cam.pitch).toBeCloseTo(PITCH_MAX, 6);
  });

  it('two quick 90° turns add up: the second starts from where the first is heading', () => {
    const { cam } = setup(raisedScene(), { yaw: 47, pitch: 40 });
    cam.setAngles(137 * DEG, 40 * DEG, 0);
    cam.tick(50);
    cam.setAngles(227 * DEG, 40 * DEG, 50);
    cam.tick(50 + ROTATE_MS + 1);
    expect(cam.angles.yaw).toBeCloseTo(227, 6);
  });
});

/** Top height of each cell (ramps: their high edge), as the ghost test uses. */
const tileHeights = (vm: BoardVM, tiles: InstanceType<typeof TileLayer>) => (r: number, c: number) => {
  const cell = vm.cells[r]?.[c];
  if (!cell?.enabled) return null;
  return cell.ramp ? Math.max(cell.ramp.from, cell.ramp.to) * STEP : tiles.topY(r, c);
};

describe('picking: screen point -> (r, c)', () => {
  const pickAt = (s: ReturnType<typeof setup>, units: InstanceType<typeof UnitLayer>, p: THREE.Vector2) => {
    s.ray.setFromCamera(s.cam.ndc(p.x, p.y), s.cam.camera);
    return pickWithRay(s.ray, units, s.tiles);
  };

  it.each(HEADINGS)(
    'heading %i: every visible tile-top centre maps to its own cell, raised, sunken and ramped alike',
    (az) => {
      const vm = raisedScene();
      const s = setup(vm, az);
      const units = new UnitLayer();
      const heights = tileHeights(vm, s.tiles);
      const hidden: string[] = [];
      for (const row of vm.cells)
        for (const cell of row) {
          const y = s.tiles.topY(cell.r, cell.c);
          const occluded = isOccluded(
            heights,
            vm.rows,
            vm.cols,
            cell.r,
            cell.c,
            y + 1e-3,
            s.cam.pitch,
            s.cam.headingAngle,
            s.tiles.maxY,
          );
          if (occluded) {
            hidden.push(`${cell.r},${cell.c}`);
            continue;
          }
          const hit = pickAt(s, units, s.cam.project(new THREE.Vector3(cell.c + 0.5, y, cell.r + 0.5)));
          expect(hit?.cell, `cell ${cell.r},${cell.c}`).toEqual({ r: cell.r, c: cell.c });
        }
      // cells behind the +15 ft corner (seen from the north it stands in front of them), the ramp
      // or in the pits; the rest of the 72 cells stay visible
      expect(hidden.length, hidden.join(' ')).toBeLessThanOrEqual(14);
      if (az === 0) expect(hidden).toContain('6,5'); // the one-cell 10 ft pit
    },
  );

  it('the hidden centre of a deep pit picks the rim on the camera side of it', () => {
    const s = setup(raisedScene());
    const centre = new THREE.Vector3(5.5, s.tiles.topY(6, 5), 6.5);
    const hit = pickAt(s, new UnitLayer(), s.cam.project(centre))?.cell;
    const rims = cellsAlong(s.cam.forward).map((o) => ({ r: 6 + o.dr, c: 5 + o.dc }));
    expect(rims).toContainEqual(hit);
  });

  it('a click on the front lip of the +15 ft corner selects the corner, not the tile drawn behind it', () => {
    const vm = raisedScene();
    const s = setup(vm);
    const units = new UnitLayer();
    const lip = new THREE.Vector3(0.5, 3 * STEP, 0.95);
    expect(pickAt(s, units, s.cam.project(lip))?.cell).toEqual({ r: 0, c: 0 });
    // the cliff face below the lip belongs to the raised cell too
    const face = new THREE.Vector3(0.5, 2.5 * STEP, 1.0); // on the south cliff face
    expect(pickAt(s, units, s.cam.project(face))?.cell).toEqual({ r: 0, c: 0 });
  });

  it('the raised tiles report their tops at elevation x 5 ft step', () => {
    const s = setup(raisedScene());
    expect(s.tiles.topY(0, 0)).toBeCloseTo(3 * STEP);
    expect(s.tiles.topY(6, 5)).toBeCloseTo(-2 * STEP);
    expect(s.tiles.topY(3, 6)).toBeCloseTo(0.5 * STEP); // ramp midpoint
  });

  describe('overlapping sprites', () => {
    const makeFrames = (opaque: boolean) => {
      const w = 32,
        h = 32;
      const data = new Uint8ClampedArray(w * h * 4);
      if (opaque) for (let i = 3; i < data.length; i += 4) data[i] = 255;
      const canvas = document.createElement('canvas');
      return {
        atlas: {
          path: 'sheet.png',
          canvas,
          width: w,
          height: h,
          pixels: { width: w, height: h, data },
          version: 1,
        },
        frames: [{ x: 0, y: 0, w: 16, h: 24 }],
        animated: false,
        single: false,
      };
    };

    const layer = (s: ReturnType<typeof setup>, vm: BoardVM, opaque: boolean) => {
      const units = new UnitLayer();
      units.setHeading(s.cam.headingAngle);
      units.update(vm.units, {
        topY: (r, c) => s.tiles.topY(r, c),
        surface: (cell, lift) => s.tiles.surfaceMatrix(cell.r, cell.c, lift),
        mode: 'tactical',
        stretch: s.cam.spriteStretch,
        view: 'dm',
        library: { get: () => makeFrames(opaque) } as never,
        now: 0,
      });
      s.scene.add(units.group);
      s.scene.updateMatrixWorld(true);
      return units;
    };

    /** Two units, the second one cell toward the camera from the first; pick a point of the first's tile it covers. */
    const run = (opaque: boolean, az: 0 | 1 | 2 | 3 = 0) => {
      const vm = boardVm(8, 8);
      const s0 = setup(vm, az);
      const f = s0.cam.forward;
      const fr = Math.round(f.z),
        fc = Math.round(f.x);
      vm.units = [unit('back', 3, 3), unit('front', 3 + fr, 3 + fc)];
      const s = setup(vm, az);
      const units = layer(s, vm, opaque);
      // a point of the back unit's tile, on the side facing the front unit
      const p = s.cam.project(new THREE.Vector3(3.5 + 0.4 * fc, 0, 3.5 + 0.4 * fr));
      return { hit: pickAt(s, units, p), front: { r: 3 + fr, c: 3 + fc } };
    };

    it.each(HEADINGS)('heading %i: the sprite in front wins when its texel is opaque', (az) => {
      const { hit, front } = run(true, az);
      expect(hit).toEqual({ cell: front, unitId: 'front' });
    });

    it('tilting re-stretches sprites to stay 1:1 on screen, while their shadow casters keep one height', () => {
      const vm = boardVm(8, 8);
      vm.units = [unit('a', 3, 3)];
      const s = setup(vm);
      const units = layer(s, vm, true);
      const g = units.get('a');
      if (!g) throw new Error('no unit');
      const casters = () => {
        s.scene.updateMatrixWorld(true);
        return g.root.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.castShadow);
      };
      const casterHeight = () => {
        const [m] = casters();
        if (!m) throw new Error('no shadow caster');
        return new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y;
      };
      expect(casters()).toHaveLength(1); // the twin, not the drawn body
      const shadowH = casterHeight();
      expect(shadowH).toBeCloseTo((24 / TEXELS) * SHADOW_STRETCH, 5);
      for (const dy of [400, -800]) {
        s.cam.orbit(0, dy);
        units.setStretch(s.cam.spriteStretch);
        const a = units.anchors('a');
        if (!a) throw new Error('no anchors');
        const feet = s.cam.project(a.feet),
          head = s.cam.project(a.head);
        expect(feet.y - head.y).toBeCloseTo(24 * s.cam.zoom, 4); // 24 texels tall on screen at any tilt
        expect(casterHeight()).toBeCloseTo(shadowH, 5);
      }
      // the twin is never picked
      expect(units.pickables()).toHaveLength(1);
    });

    it('a unit hidden in a deep pit is picked through its silhouette, ahead of the rim in front', () => {
      const vm = raisedScene();
      vm.units = [unit('deep', 6, 5)];
      const s = setup(vm);
      const units = layer(s, vm, true);
      units.setGhosted(new Set(['deep']));
      const feet = new THREE.Vector3(5.5, s.tiles.topY(6, 5) + 0.3, 6.5);
      expect(pickAt(s, units, s.cam.project(feet))).toEqual({ cell: { r: 6, c: 5 }, unitId: 'deep' });
      // without the silhouette the rim in front wins
      units.setGhosted(new Set());
      expect(pickAt(s, units, s.cam.project(feet))?.unitId).toBeNull();
    });

    it('transparent padding is clicked through to what is behind', () => {
      const { hit } = run(false);
      expect(hit?.unitId).toBeNull();
      expect(hit?.cell).toEqual({ r: 3, c: 3 });
    });
  });
});

describe('occlusion (hidden-unit silhouettes)', () => {
  const grid = (heights: Record<string, number>) => (r: number, c: number) => heights[`${r},${c}`] ?? 0;
  const SOUTH = 0;
  const occ = (h: ReturnType<typeof grid>, r: number, c: number, y: number, max: number, heading = SOUTH) =>
    isOccluded(h, 10, 10, r, c, y, PITCH_TACTICAL, heading, max);
  it('a unit right behind a tall block is hidden; one beside it or on top is not', () => {
    const h = grid({ '4,3': 2 });
    expect(occ(h, 3, 3, 0.6, 3)).toBe(true);
    expect(occ(h, 3, 4, 0.6, 3)).toBe(false);
    expect(occ(h, 3, 3, 2.5, 3)).toBe(false);
    expect(occ(h, 5, 3, 0.6, 3)).toBe(false); // in front of the block
  });
  it('far blocks need to be taller to hide a unit, and top-down hides nothing', () => {
    expect(occ(grid({ '7,3': 2 }), 3, 3, 0.6, 3)).toBe(false);
    expect(occ(grid({ '7,3': 6 }), 3, 3, 0.6, 7)).toBe(true);
    expect(isOccluded(grid({ '4,3': 9 }), 10, 10, 3, 3, 0.6, Math.PI / 2, SOUTH, 9)).toBe(false);
  });
  it('a unit in a pit is hidden by the rim in front of it', () => {
    expect(occ(grid({ '3,3': -1 }), 3, 3, -1 + 0.2, 1)).toBe(true);
  });
  it('the heading decides which side a block hides: in front from one heading, behind from the opposite', () => {
    const h = grid({ '4,3': 2 });
    const se = AZIMUTHS[0] as number, // camera south-south-east
      nw = AZIMUTHS[2] as number; // camera north-north-west
    expect(occ(h, 3, 3, 0.6, 3, se)).toBe(true);
    expect(occ(h, 3, 3, 0.6, 3, nw)).toBe(false);
    expect(occ(h, 5, 3, 0.6, 3, nw)).toBe(true);
    // a diagonal sight line crosses the next column too
    expect(occ(grid({ '4,4': 2 }), 3, 3, 0.6, 3, se)).toBe(true);
  });
});

describe('height-region chips', () => {
  it('labels each contiguous level and ramp run once, avoiding occupied cells', () => {
    const vm = raisedScene();
    const regions = heightRegions(vm.cells, labelCellCosts([{ r: 1, c: 0, kind: 'entity' }], true));
    // diagonal neighbours are separate regions, as on the board (Manhattan adjacency)
    const levels = regions
      .filter((r) => r.kind === 'level')
      .map((r) => [r.elevation, r.cells.length])
      .sort((a, b) => (b[0] ?? 0) - (a[0] ?? 0) || (b[1] ?? 0) - (a[1] ?? 0));
    expect(levels).toEqual([
      [3, 1],
      [2, 1],
      [2, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [-1, 2],
      [-2, 1],
    ]);
    const ramp = regions.find((r) => r.kind === 'ramp');
    expect(ramp).toMatchObject({ from: 1, to: 0, cells: [{ r: 3, c: 6 }] });
    // the -5 ft pit spans (5,5)-(5,6): with a unit at (6,6) its sprite covers (5,6), so (5,5) is labelled;
    // a fully covered one-cell region still gets its chip
    const pit = heightRegions(vm.cells, labelCellCosts([{ r: 5, c: 5, kind: 'entity' }], true)).find(
      (r) => r.elevation === -1,
    );
    expect(pit?.label).toEqual({ r: 5, c: 6 });
    const occupiedTen = regions.find(
      (r) => r.kind === 'level' && r.cells.some((c) => c.r === 1 && c.c === 0),
    );
    expect(occupiedTen?.label).toEqual({ r: 1, c: 0 });
  });
  it('a diagonal heading spreads a sprite over the two cells behind it', () => {
    expect(cellsAlong({ x: 0, z: -1 })).toEqual([{ dr: -1, dc: 0 }]);
    const toward = { x: Math.sin(AZIMUTHS[0] as number), z: Math.cos(AZIMUTHS[0] as number) };
    const costs = labelCellCosts([{ r: 5, c: 5, kind: 'entity' }], true, toward);
    expect(costs.get('4,5')).toBe(2);
    expect(costs.get('4,4')).toBe(2);
    expect(costs.get('6,5')).toBe(1);
    expect(costs.get('6,6')).toBe(1);
  });
  it('ranks cells: occupied > covered by an upright sprite > under an HP label > free', () => {
    const costs = labelCellCosts([{ r: 5, c: 5, kind: 'entity' }], true);
    expect(costs.get('5,5')).toBe(3);
    expect(costs.get('4,5')).toBe(2);
    expect(costs.get('6,5')).toBe(1);
    expect(costs.get('5,6')).toBeUndefined();
    expect(labelCellCosts([{ r: 5, c: 5, kind: 'entity' }], false).has('4,5')).toBe(false);
    expect(labelCellCosts([{ r: 5, c: 5, kind: 'pickup' }], true).has('4,5')).toBe(false);
  });
});

describe('ledges, side shading and the scenery skirt', () => {
  it('marks every drop from a flat top, including the board edge, and leaves ramps alone', () => {
    const vm = raisedScene();
    const ledges = findLedges(vm.cells);
    const at = (r: number, c: number, dr: number, dc: number) =>
      ledges.find((l) => l.r === r && l.c === c && l.dr === dr && l.dc === dc);
    // +15 ft corner drops 5 ft to the +10 ft cells beside it, and off the board to the north
    expect(at(0, 0, 0, 1)).toMatchObject({ high: 3 * STEP, low: 2 * STEP, lowIsCell: true });
    expect(at(0, 0, -1, 0)).toMatchObject({ high: 3 * STEP, low: SKIRT_TOP, lowIsCell: false });
    // the rim of the -5 ft pit drops into it; the pit floor itself drops nowhere inside the board
    expect(at(4, 5, 1, 0)).toMatchObject({ high: 0, low: -STEP });
    expect(at(5, 5, 0, 1)).toBeUndefined();
    // the ramp cell and the edges next to it carry no ledge
    expect(ledges.some((l) => l.r === 3 && l.c === 6)).toBe(false);
    expect(at(3, 5, 0, 1)).toBeUndefined();
  });

  it('shades the camera-left side face lighter than the camera-right one at every heading', () => {
    for (const a of AZIMUTHS) {
      const faces = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([nx, nz]) => (nx ?? 0) * Math.sin(a) + (nz ?? 0) * Math.cos(a) > 0); // faces on screen
      expect(faces).toHaveLength(2);
      const right = { x: Math.cos(a), z: -Math.sin(a) };
      const [left, rightFace] = [...faces].sort(
        (p, q) =>
          (p[0] ?? 0) * right.x + (p[1] ?? 0) * right.z - ((q[0] ?? 0) * right.x + (q[1] ?? 0) * right.z),
      );
      expect(faceShade(left?.[0] ?? 0, left?.[1] ?? 0, a)).toBeGreaterThan(
        faceShade(rightFace?.[0] ?? 0, rightFace?.[1] ?? 0, a) + 0.2,
      );
    }
  });

  it('surrounds the board (and fills its disabled cells) with floor that fades out by the outer ring', () => {
    const vm = boardVm(4, 5, (cells) => {
      const hole = cells[1]?.[2];
      if (hole) hole.enabled = false;
    });
    const cells = skirtDistances(vm);
    const keys = new Set(cells.map((s) => `${s.r},${s.c}`));
    expect(keys.has('1,2')).toBe(true); // the disabled cell
    expect(keys.has('0,0')).toBe(false); // playable cells are never skirt
    expect(keys.has(`${-SKIRT_RINGS},${-SKIRT_RINGS}`)).toBe(true);
    expect(cells.length).toBe((4 + 2 * SKIRT_RINGS) * (5 + 2 * SKIRT_RINGS) - (4 * 5 - 1));
    expect(skirtFade(1)).toBeCloseTo(1);
    expect(skirtFade(SKIRT_RINGS)).toBeLessThan(0.02);
    expect(skirtFade(3)).toBeGreaterThan(skirtFade(5));
  });

  it('keeps tall props far enough out that they never cover a board tile on screen', () => {
    // a prop of height h at ground distance d covers h / tan(pitch) of ground behind it on screen
    for (const d of [2, 3, 4, 6]) {
      const covered = maxPropHeight(d) / Math.tan(PITCH_MIN); // the shallowest tilt covers the most
      expect(d - covered).toBeGreaterThan(1); // still short of the nearest board cell's centre band
    }
    expect(maxPropHeight(1)).toBe(0);
  });

  it('is decoration only: rebuilt per theme/shape, outside the camera fit, nothing pickable', () => {
    const vm = raisedScene();
    const s = setup(vm);
    const skirt = new SkirtLayer();
    expect(skirt.update(vm)).toBe(true);
    expect(skirt.update(vm)).toBe(false);
    expect(skirt.update({ ...vm, theme: 'grass' })).toBe(true);
    expect(skirt.group.children.length).toBeGreaterThan(1); // floor + props
    expect(s.tiles.bounds.min.x).toBe(0);
    expect(s.tiles.bounds.max.z).toBe(vm.rows);
    expect(s.tiles.pickables().some((o) => o.parent === skirt.group)).toBe(false);
  });
});

describe('board themes', () => {
  it('every theme the pickers offer has tile painters and scenery props; new battles start in the facility', () => {
    for (const t of BOARD_THEMES) {
      expect(BOARD_THEME_IDS, t.id).toContain(t.id);
      expect(Object.keys(THEME_PROPS[t.id] ?? {}).length, t.id).toBeGreaterThan(0);
    }
    expect(BOARD_THEMES[0]?.id).toBe('facility');
    expect(BOARD_THEMES[1]?.id).toBe('arboretum');
    expect(DEFAULT_BOARD_THEME).toBe('facility');
  });

  it('wall blocks follow the theme, with their side faces shaded by the camera heading', () => {
    const wall = unit('wall', 1, 1, {
      kind: 'terrain',
      side: 'other',
      color: '#8a5a3a',
      spritePath: null,
      terrain: { collision: true, entityAboveTerrain: false, spritePath: null },
    });
    const ctxFor = (theme: string) => ({
      topY: () => 0,
      surface: () => new THREE.Matrix4(),
      mode: 'tactical' as const,
      stretch: 1,
      view: 'dm' as const,
      library: { get: () => null } as never,
      now: 0,
      theme,
    });
    const layer = new UnitLayer();
    layer.setHeading(AZIMUTHS[0] as number);
    layer.update([wall], ctxFor('facility'));
    const block = layer.blocks()[0];
    const mats = block?.material as THREE.MeshLambertMaterial[];
    expect(mats).toHaveLength(6);
    expect(mats[2]?.map).not.toBe(mats[0]?.map); // its own roof texture
    // the brown terrain colour only tints a themed bulkhead a little
    expect(mats[2]?.color.r).toBeGreaterThan(0.6); // linear; the raw brown is ~0.25
    // +x and +z both face the camera at heading 0; the camera-left one (+z) is lighter
    expect(mats[4]?.color.r ?? 0).toBeGreaterThan((mats[0]?.color.r ?? 0) + 0.05);
    const pzBefore = mats[4]?.color.r ?? 0;
    layer.setHeading(AZIMUTHS[1] as number);
    expect(mats[4]?.color.r).not.toBeCloseTo(pzBefore, 3);
    // a theme change rebuilds the materials; legacy themes keep the full terrain colour
    layer.update([wall], ctxFor('stone'));
    const stone = layer.blocks()[0]?.material as THREE.MeshLambertMaterial[];
    expect(stone[2]?.color.getHexString()).toBe('8a5a3a');
  });

  it('bakes the top variants side by side, one cell of texels each', () => {
    const atlas = makeTopAtlas('facility');
    const img = atlas.image as { width: number; height: number };
    expect(img.width).toBe(TEXELS * TOP_VARIANTS);
    expect(img.height).toBe(TEXELS);
  });

  it('picks a stable variant per cell, mostly the plain one, with every variant in use', () => {
    const counts = new Array<number>(TOP_VARIANTS).fill(0);
    for (let r = 0; r < 40; r++)
      for (let c = 0; c < 40; c++) {
        const v = topVariant(r, c);
        expect(v).toBe(topVariant(r, c));
        counts[v] = (counts[v] ?? 0) + 1;
      }
    expect(counts.every((n) => n > 0)).toBe(true);
    expect(counts[0]).toBeGreaterThan(1600 * 0.45);
    expect(counts[3]).toBeLessThan(1600 * 0.2);
  });
});

describe('lighting: levels and transitions', () => {
  const lamp = (on: boolean, groupId: string | null = null) => ({
    id: groupId ? `lamp-${groupId}` : 'lamp',
    name: 'Lamp',
    r: 1,
    c: 1,
    on,
    color: '#ffd9a0',
    brightRadius: 2,
    dimRadius: 4,
    attachedTo: null,
    groupId,
  });
  const withLights = (lights: ReturnType<typeof lamp>[], extra: Partial<BoardVM> = {}): BoardVM => ({
    ...boardVm(4, 4),
    ambient: 'dark',
    lights,
    ...extra,
  });
  const flat = () => 0;

  it('a single light fades up and down; it never jumps', () => {
    const layer = new LightLayer();
    layer.update(withLights([lamp(false)]), flat, flat, 0);
    expect(layer.levelOf('lamp')).toBe(0);
    layer.update(withLights([lamp(true)]), flat, flat, 1000);
    layer.tick(1100);
    const mid = layer.levelOf('lamp') ?? 0;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1);
    expect(layer.tick(2000)).toBe(true); // the step that lands it
    expect(layer.levelOf('lamp')).toBe(1);
    expect(layer.tick(2100)).toBe(false);
    layer.update(withLights([lamp(false)]), flat, flat, 3000);
    layer.tick(3100);
    expect(layer.levelOf('lamp')).toBeGreaterThan(0);
    layer.tick(4000);
    expect(layer.levelOf('lamp')).toBe(0);
  });

  it('a grouped light (room power) flickers before it settles; a light that exists at load does not animate', () => {
    const layer = new LightLayer();
    layer.update(withLights([lamp(false, 'hangar')]), flat, flat, 0);
    layer.update(withLights([lamp(true, 'hangar')]), flat, flat, 1000);
    const seen: number[] = [];
    for (let t = 1000; t <= 3000; t += 10) {
      layer.tick(t);
      seen.push(layer.levelOf('lamp-hangar') ?? -1);
    }
    // goes bright, drops back near dark, then settles at full
    const firstBright = seen.findIndex((v) => v > 0.6);
    expect(firstBright).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstBright).some((v) => v < 0.1)).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
    const fresh = new LightLayer();
    fresh.update(withLights([lamp(true)]), flat, flat, 0);
    expect(fresh.levelOf('lamp')).toBe(1);
    expect(fresh.tick(10)).toBe(false);
  });

  it('the flicker curve: waits its stagger, flickers, ramps to full', () => {
    expect(lightTweenLevel('power-on', 50, 0, 100)).toEqual({ level: 0, done: false });
    expect(lightTweenLevel('power-on', 130, 0, 100).level).toBeGreaterThan(0.5);
    expect(lightTweenLevel('power-on', 220, 0, 100).level).toBeLessThan(0.1);
    expect(lightTweenLevel('power-on', 5000, 0, 100)).toEqual({ level: 1, done: true });
    expect(lightTweenLevel('fade-in', 0, 0.4).level).toBeCloseTo(0.4); // resumes from where it was
  });

  it('ambient: bright leans on the key light; the DM reveal stays dim enough for pools to show; players get almost none', () => {
    const bright = ambientLevels('bright', 'dm', true);
    expect(bright.sun).toBeGreaterThan(bright.ambient * 2);
    expect(bright.points).toBeLessThan(0.5); // a torch barely matters in daylight
    const reveal = ambientLevels('dark', 'dm', true);
    expect(reveal.ambient).toBeLessThan(0.7);
    expect(reveal.points).toBe(1);
    expect(ambientLevels('dark', 'dm', false).ambient).toBeLessThan(reveal.ambient);
    expect(ambientLevels('dark', 'player', true).ambient).toBeLessThan(0.1);
    expect(ambientLevels('dim', 'dm', true).ambient).toBeLessThan(bright.ambient);
  });
});

describe('shadow-map refresh', () => {
  it('reports the old and new cells of what moved, and nothing for selection/HP changes', () => {
    const first = shadowChanges(new Map(), [unit('a', 1, 1), unit('b', 2, 2)]);
    expect(first.cells).toEqual([
      { r: 1, c: 1 },
      { r: 2, c: 2 },
    ]);
    const same = shadowChanges(first.next, [unit('a', 1, 1, { selected: true, hp: 2 }), unit('b', 2, 2)]);
    expect(same.cells).toEqual([]);
    const moved = shadowChanges(first.next, [unit('a', 1, 3), unit('b', 2, 2)]);
    expect(moved.cells).toEqual([
      { r: 1, c: 3 },
      { r: 1, c: 1 },
    ]);
    const flew = shadowChanges(first.next, [unit('a', 1, 1, { altitude: 2 }), unit('b', 2, 2)]);
    expect(flew.cells).toHaveLength(2);
    const gone = shadowChanges(first.next, [unit('a', 1, 1)]);
    expect(gone.cells).toEqual([{ r: 2, c: 2 }]);
  });
});

describe('view preferences', () => {
  it('defaults: DM blur on, player blur off; both tactical with bloom', () => {
    expect(viewOptionsFromPrefs({}, 'dm')).toEqual({
      camera: 'tactical',
      yaw: 30,
      pitch: 40,
      blur: true,
      bloom: true,
    });
    expect(viewOptionsFromPrefs({}, 'player')).toEqual({
      camera: 'tactical',
      yaw: 30,
      pitch: 40,
      blur: false,
      bloom: true,
    });
  });
  it('reads board.* and board.player.* toggles independently; the player mirrors the DM angle', () => {
    const prefs = {
      'board.camera': 'top',
      'board.blur': 'false',
      'board.player.bloom': 'false',
      'board.yaw': '117.5',
      'board.pitch': '52',
    };
    expect(viewOptionsFromPrefs(prefs, 'dm')).toEqual({
      camera: 'top',
      yaw: 117.5,
      pitch: 52,
      blur: false,
      bloom: true,
    });
    expect(viewOptionsFromPrefs(prefs, 'player')).toEqual({
      camera: 'tactical',
      yaw: 117.5,
      pitch: 52,
      blur: false,
      bloom: false,
    });
    expect(viewOptionsFromPrefs({ 'board.camera': 'weird' }, 'dm').camera).toBe('tactical');
  });
  it('migrates the old heading index, clamps the tilt, wraps the heading', () => {
    expect(viewOptionsFromPrefs({ 'board.azimuth': '2' }, 'dm').yaw).toBe(210);
    expect(viewOptionsFromPrefs({ 'board.azimuth': '2', 'board.yaw': '45' }, 'dm').yaw).toBe(45);
    expect(viewOptionsFromPrefs({ 'board.azimuth': '7' }, 'dm').yaw).toBe(30);
    expect(viewOptionsFromPrefs({ 'board.yaw': '-90' }, 'dm').yaw).toBe(270);
    expect(viewOptionsFromPrefs({ 'board.yaw': 'x' }, 'dm').yaw).toBe(30);
    expect(viewOptionsFromPrefs({ 'board.pitch': '89' }, 'dm').pitch).toBeCloseTo(60, 6);
    expect(viewOptionsFromPrefs({ 'board.pitch': '5' }, 'dm').pitch).toBeCloseTo(30, 6);
  });
  it('turns 90° from any heading; reset lands on the nearest home heading at the default tilt', () => {
    expect([turnYaw(300, 1), turnYaw(30, -1), turnYaw(47.5, 1)]).toEqual([30, 300, 137.5]);
    expect(homeAngles(47)).toEqual({ yaw: 30, pitch: 40 });
    expect(homeAngles(100)).toEqual({ yaw: 120, pitch: 40 });
    expect(homeAngles(350)).toEqual({ yaw: 30, pitch: 40 });
    expect(anglePrefs({ yaw: 12, pitch: 50 })).toMatchObject({
      'board.yaw': '12',
      'board.pitch': '50',
      'board.azimuth': null,
    });
  });
});

describe('wheel zoom', () => {
  const run = (w: InstanceType<typeof WheelZoom>, deltas: number[], t0 = 0, dt = 16) =>
    deltas.map((d, i) => w.feed(d, t0 + i * dt));

  it('a level every 5 wheel events in one direction, whatever their size (wheel or pinch)', () => {
    expect(EVENTS_PER_STEP).toBe(5);
    const w = new WheelZoom();
    expect(run(w, Array<number>(10).fill(-2))).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(run(w, Array<number>(5).fill(300), 1000)).toEqual([0, 0, 0, 0, -1]);
  });

  it('slow mouse notches still add up', () => {
    const w = new WheelZoom();
    expect(run(w, Array<number>(5).fill(-100), 0, IDLE_RESET_MS - 50)).toEqual([0, 0, 0, 0, 1]);
  });

  it('a direction change or a long pause starts the count over', () => {
    const w = new WheelZoom();
    run(w, [-1, -1, -1, -1]);
    expect(w.feed(1, 100)).toBe(0); // reversed: 1 of 5 outward
    expect(run(w, [-1, -1, -1, -1], 200)).toEqual([0, 0, 0, 0]);
    expect(w.feed(-1, 200 + IDLE_RESET_MS * 2)).toBe(0); // after a pause: 1 of 5
  });
});

describe('tile density', () => {
  it('tiles are 20 texels with the 5 ft step at 3/4 of a cell; sprites keep 1 texel = zoom px', () => {
    expect(TEXELS).toBe(20);
    expect(STEP_TEXELS).toBe(15);
    expect(STEP).toBeCloseTo(0.75, 6);
    expect([tx(8), tx(16), tx(12)]).toEqual([10, 20, 15]);
    const top = makeTopAtlas('facility');
    const side = makeSideTexture('facility');
    const size = (t: { image: unknown }) => t.image as { width: number; height: number };
    expect(size(top)).toMatchObject({ width: TEXELS * TOP_VARIANTS, height: TEXELS });
    expect(size(side)).toMatchObject({ width: TEXELS, height: STEP_TEXELS });
  });

  it('cell-sized billboards (initials tokens) shrink with the denser tiles, so they keep their screen size', () => {
    expect(SPRITE_CELL).toBeCloseTo(0.8, 6);
    const vm = boardVm(4, 4);
    const u = unit('t', 1, 1);
    u.spritePath = null;
    const layer = new UnitLayer();
    layer.update([u], {
      topY: () => 0,
      surface: () => new THREE.Matrix4(),
      mode: 'tactical',
      stretch: 1,
      view: 'dm',
      library: { get: () => null } as never,
      now: 0,
    });
    expect(vm.rows).toBe(4);
    expect(layer.get('t')?.w).toBeCloseTo(0.8 * SPRITE_CELL, 6);
  });
});

beforeAll(() => {
  expect(typeof document).toBe('object');
});
