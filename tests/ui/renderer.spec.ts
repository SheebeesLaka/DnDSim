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
const { heightRegions, labelCellCosts } = await import('../../src/ui/renderer/three/regions.ts');
const { PITCH_TACTICAL, STEP, TEXELS } = await import('../../src/ui/renderer/three/constants.ts');
const { viewOptionsFromPrefs } = await import('../../src/ui/viewPrefs.ts');

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

function setup(vm: BoardVM) {
  const tiles = new TileLayer();
  tiles.update(vm);
  const cam = new TacticalCamera();
  cam.setViewport(W, H);
  cam.fit(tiles.bounds);
  const ray = new THREE.Raycaster();
  const scene = new THREE.Scene();
  scene.add(tiles.group);
  scene.updateMatrixWorld(true);
  return { tiles, cam, ray, scene };
}

describe('tactical camera: crisp pixels', () => {
  it('chooses a whole-number zoom that fits the board', () => {
    const { cam, tiles } = setup(raisedScene());
    expect(Number.isInteger(cam.zoom)).toBe(true);
    const box = cam.projectBox(tiles.bounds);
    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.maxX).toBeLessThanOrEqual(W);
    expect(box.minY).toBeGreaterThanOrEqual(0);
    expect(box.maxY).toBeLessThanOrEqual(H);
  });

  it('keeps the texel grid on whole pixels after arbitrary pans (no shimmer)', () => {
    const { cam } = setup(raisedScene());
    const pans = [
      [0.3, 0.7],
      [13.37, -2.2],
      [-101.9, 44.4],
      [0.5, 0.5],
      [7.77, 3.14],
    ];
    for (const [dx, dy] of pans) {
      cam.pan(dx ?? 0, dy ?? 0);
      // floor texel corners at several heights land on integer screen pixels
      for (const [x, y, z] of [
        [0, 0, 0],
        [3, 0, 2],
        [1 / TEXELS, 0, 5],
        [4, STEP * 2, 1],
      ]) {
        const p = cam.project(new THREE.Vector3(x, y, z));
        expect(Math.abs(p.x - Math.round(p.x))).toBeLessThan(1e-3);
        expect(Math.abs(p.y - Math.round(p.y))).toBeLessThan(1e-3);
      }
    }
  });

  it('one texel is exactly `zoom` pixels across, and a stretched sprite texel is `zoom` pixels tall', () => {
    const { cam } = setup(raisedScene());
    const a = cam.project(new THREE.Vector3(2, 0, 3));
    const b = cam.project(new THREE.Vector3(2 + 1 / TEXELS, 0, 3));
    expect(b.x - a.x).toBeCloseTo(cam.zoom, 5);
    const top = cam.project(new THREE.Vector3(2, (1 / TEXELS) * cam.spriteStretch, 3));
    expect(a.y - top.y).toBeCloseTo(cam.zoom, 5);
  });

  it('pixelLift snaps a sprite base at an odd height onto a whole pixel', () => {
    const { cam } = setup(raisedScene());
    const feet = new THREE.Vector3(3.5, 0.123, 2.5);
    feet.y += cam.pixelLift(feet);
    const p = cam.project(feet);
    expect(Math.abs(p.y - Math.round(p.y))).toBeLessThan(1e-3);
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

  it('top-down mode looks straight down without stretching sprites', () => {
    const { cam } = setup(raisedScene());
    cam.setMode('top');
    expect(cam.spriteStretch).toBe(1);
    const a = cam.project(new THREE.Vector3(2, 0, 3));
    const b = cam.project(new THREE.Vector3(2, 1, 3));
    expect(b.y).toBeCloseTo(a.y, 3);
  });
});

describe('picking: screen point -> (r, c)', () => {
  const pickAt = (s: ReturnType<typeof setup>, units: InstanceType<typeof UnitLayer>, p: THREE.Vector2) => {
    s.ray.setFromCamera(s.cam.ndc(p.x, p.y), s.cam.camera);
    return pickWithRay(s.ray, units, s.tiles);
  };

  it('maps every visible tile-top point to its own cell, raised, sunken and ramped alike', () => {
    const vm = raisedScene();
    const s = setup(vm);
    const units = new UnitLayer();
    const rise = Math.tan(PITCH_TACTICAL);
    const hidden: string[] = [];
    for (const row of vm.cells)
      for (const cell of row) {
        const y = s.tiles.topY(cell.r, cell.c);
        const southTop = cell.r + 1 < vm.rows ? s.tiles.topY(cell.r + 1, cell.c) : -Infinity;
        // the sight line from (z, y) clears the south neighbour's top at the shared edge?
        const visible = (z: number) => y + (cell.r + 1 - z) * rise >= southTop + 1e-3;
        const z = [cell.r + 0.5, cell.r + 0.15, cell.r + 0.04].find(visible);
        if (z === undefined) {
          hidden.push(`${cell.r},${cell.c}`);
          continue;
        }
        const hit = pickAt(s, units, s.cam.project(new THREE.Vector3(cell.c + 0.5, y, z)));
        expect(hit?.cell, `cell ${cell.r},${cell.c}`).toEqual({ r: cell.r, c: cell.c });
      }
    // only the floor of the one-cell 10 ft pit is out of sight at the tactical angle
    expect(hidden).toEqual(['6,5']);
  });

  it('the hidden centre of a deep pit picks the rim in front of it (what the DM actually sees there)', () => {
    const s = setup(raisedScene());
    const centre = new THREE.Vector3(5.5, s.tiles.topY(6, 5), 6.5);
    expect(pickAt(s, new UnitLayer(), s.cam.project(centre))?.cell).toEqual({ r: 7, c: 5 });
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

    const run = (opaque: boolean) => {
      const vm = boardVm(8, 8);
      vm.units = [unit('north', 3, 3), unit('south', 4, 3)];
      const s = setup(vm);
      const units = new UnitLayer();
      const frames = makeFrames(opaque);
      units.update(vm.units, {
        topY: (r, c) => s.tiles.topY(r, c),
        surface: (cell, lift) => s.tiles.surfaceMatrix(cell.r, cell.c, lift),
        mode: 'tactical',
        stretch: s.cam.spriteStretch,
        view: 'dm',
        library: { get: () => frames } as never,
        now: 0,
      });
      s.scene.add(units.group);
      s.scene.updateMatrixWorld(true);
      // a point on the north unit's tile that the south unit's tall sprite covers on screen
      const p = s.cam.project(new THREE.Vector3(3.5, 0, 3.9));
      return pickAt(s, units, p);
    };

    it('the sprite in front wins when its texel is opaque, even over the tile behind it', () => {
      expect(run(true)).toEqual({ cell: { r: 4, c: 3 }, unitId: 'south' });
    });

    it('a unit hidden in a deep pit is picked through its silhouette, ahead of the rim in front', () => {
      const vm = raisedScene();
      vm.units = [unit('deep', 6, 5)];
      const s = setup(vm);
      const units = new UnitLayer();
      units.update(vm.units, {
        topY: (r, c) => s.tiles.topY(r, c),
        surface: (cell, lift) => s.tiles.surfaceMatrix(cell.r, cell.c, lift),
        mode: 'tactical',
        stretch: s.cam.spriteStretch,
        view: 'dm',
        library: { get: () => makeFrames(true) } as never,
        now: 0,
      });
      units.setGhosted(new Set(['deep']));
      s.scene.add(units.group);
      s.scene.updateMatrixWorld(true);
      const feet = new THREE.Vector3(5.5, s.tiles.topY(6, 5) + 0.3, 6.5);
      expect(pickAt(s, units, s.cam.project(feet))).toEqual({ cell: { r: 6, c: 5 }, unitId: 'deep' });
      // without the silhouette the rim in front wins
      units.setGhosted(new Set());
      expect(pickAt(s, units, s.cam.project(feet))?.unitId).toBeNull();
    });

    it('transparent padding is clicked through to what is behind', () => {
      const hit = run(false);
      expect(hit?.unitId).toBeNull();
      expect(hit?.cell).toEqual({ r: 3, c: 3 });
    });
  });
});

describe('occlusion (hidden-unit silhouettes)', () => {
  const grid = (heights: Record<string, number>) => (r: number, c: number) => heights[`${r},${c}`] ?? 0;
  it('a unit right behind a tall block is hidden; one beside it or on top is not', () => {
    const h = grid({ '4,3': 2 });
    expect(isOccluded(h, 10, 3, 3, 0.6, PITCH_TACTICAL, 3)).toBe(true);
    expect(isOccluded(h, 10, 3, 4, 0.6, PITCH_TACTICAL, 3)).toBe(false);
    expect(isOccluded(h, 10, 3, 3, 2.5, PITCH_TACTICAL, 3)).toBe(false);
    expect(isOccluded(h, 10, 5, 3, 0.6, PITCH_TACTICAL, 3)).toBe(false); // in front of the block
  });
  it('far blocks need to be taller to hide a unit, and top-down hides nothing', () => {
    const h = grid({ '7,3': 2 });
    expect(isOccluded(h, 10, 3, 3, 0.6, PITCH_TACTICAL, 3)).toBe(false);
    expect(isOccluded(grid({ '7,3': 6 }), 10, 3, 3, 0.6, PITCH_TACTICAL, 7)).toBe(true);
    expect(isOccluded(grid({ '4,3': 9 }), 10, 3, 3, 0.6, Math.PI / 2, 9)).toBe(false);
  });
  it('a unit in a pit is hidden by the rim in front of it', () => {
    const h = grid({ '3,3': -1 });
    expect(isOccluded(h, 10, 3, 3, -1 + 0.2, PITCH_TACTICAL, 1)).toBe(true);
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
    expect(viewOptionsFromPrefs({}, 'dm')).toEqual({ camera: 'tactical', blur: true, bloom: true });
    expect(viewOptionsFromPrefs({}, 'player')).toEqual({ camera: 'tactical', blur: false, bloom: true });
  });
  it('reads board.* and board.player.* keys independently', () => {
    const prefs = { 'board.camera': 'top', 'board.blur': 'false', 'board.player.bloom': 'false' };
    expect(viewOptionsFromPrefs(prefs, 'dm')).toEqual({ camera: 'top', blur: false, bloom: true });
    expect(viewOptionsFromPrefs(prefs, 'player')).toEqual({ camera: 'tactical', blur: false, bloom: false });
    expect(viewOptionsFromPrefs({ 'board.camera': 'weird' }, 'dm').camera).toBe('tactical');
  });
});

beforeAll(() => {
  expect(typeof document).toBe('object');
});
