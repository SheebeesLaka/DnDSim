/**
 * HD-2D board checks on the shared test scene (scenarios/test.json), which has
 * every case the brief asks for: a +15/+10/+5 corner, a unit in a pit, a flier
 * at altitude 3, sprite units beside a token-fallback unit, one light on and a
 * light group off. WebGL runs on SwiftShader (see playwright.config.ts).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

interface R {
  library: { status: (p: string) => string };
  hitTest: (x: number, y: number) => { r: number; c: number } | null;
  pick: (x: number, y: number) => { cell: { r: number; c: number }; unitId: string | null } | null;
  cellCenter: (c: { r: number; c: number }) => { x: number; y: number };
  project: (x: number, y: number, z: number) => { x: number; y: number };
  unitPoint: (id: string, frac: number) => { x: number; y: number } | null;
  animationPaused: boolean;
  stats: { frames: number; lastFrameMs: number; drawCalls: number };
  scene: { traverse: (fn: (o: Record<string, unknown>) => void) => void };
  tiles: { topY: (r: number, c: number) => number };
}

async function openScene(page: Page): Promise<void> {
  await page.goto('/?scenario=test&seed=1');
  await page.waitForSelector('[data-testid=board]');
  await page.waitForFunction(
    () =>
      (window as unknown as { dndsim?: { renderer: R } }).dndsim?.renderer.library.status(
        'party/testsprites.png',
      ) === 'ready',
  );
  await page.waitForTimeout(500);
}

test.describe('HD-2D board', () => {
  test.setTimeout(90_000);

  test('loads the sliced sprite sheet and draws sprites beside token fallbacks', async ({ page }, info) => {
    await openScene(page);
    const kinds = await page.evaluate(() => {
      const r = (window as unknown as { dndsim: { renderer: R } }).dndsim.renderer;
      const out: Record<string, { textured: boolean; depthCutout: boolean; distanceCutout: boolean }> = {};
      r.scene.traverse((o) => {
        const id = (o.userData as { unitId?: string }).unitId;
        const geo = o.geometry as { type?: string } | undefined;
        if (!id || geo?.type !== 'PlaneGeometry') return;
        const mat = o.material as { map?: unknown };
        const depth = o.customDepthMaterial as { map?: unknown; alphaTest?: number } | undefined;
        const dist = o.customDistanceMaterial as { map?: unknown; alphaTest?: number } | undefined;
        out[id] = {
          textured: Boolean(mat.map),
          depthCutout: Boolean(depth?.map) && depth?.alphaTest === 0.5,
          distanceCutout: Boolean(dist?.map) && dist?.alphaTest === 0.5,
        };
      });
      return out;
    });
    // u1 Henry, u2 Dan, u6 Snake, u8 Puppet have sheet rows; u4 NMB-15 is the token fallback beside them
    for (const id of ['u1', 'u2', 'u4', 'u6', 'u8']) {
      expect(kinds[id], id).toEqual({ textured: true, depthCutout: true, distanceCutout: true });
    }
    await page.screenshot({ path: info.outputPath('dm-tactical.png') });
    await info.attach('dm-tactical', { path: info.outputPath('dm-tactical.png'), contentType: 'image/png' });
  });

  test('clicks on raised tiles and on overlapping sprites pick the right target', async ({ page }) => {
    await openScene(page);
    // every raised/sunken cell of the corner, ledge and pit resolves to itself
    const raised = [
      { r: 1, c: 12 }, // +15 ft
      { r: 1, c: 9 }, // +10 ft
      { r: 3, c: 11 },
      { r: 4, c: 10 }, // +5 ft ledge
      { r: 2, c: 8 }, // +5 ft
      { r: 8, c: 3 }, // -5 ft pit (8,2 is wholly covered by the Puppet standing in front of it)
      { r: 5, c: 10 }, // ramp
    ];
    const results = await page.evaluate((cells) => {
      const r = (window as unknown as { dndsim: { renderer: R } }).dndsim.renderer;
      return cells.map((cell) => {
        const p = r.cellCenter(cell);
        return r.hitTest(p.x, p.y);
      });
    }, raised);
    expect(results).toEqual(raised);

    // a real click on the wizard standing on the +10 ft platform selects him
    const gw = await page.evaluate(() =>
      (window as unknown as { dndsim: { renderer: R } }).dndsim.renderer.unitPoint('u3', 0.3),
    );
    if (!gw) throw new Error('no wizard');
    await page.mouse.click(gw.x, gw.y);
    await expect(page.locator('[data-testid=sidebar]')).toContainText('Grand Wizard Man');

    // Dan's head is drawn over the tile north of him; clicking it selects Dan, not that tile
    const head = await page.evaluate(() => {
      const r = (window as unknown as { dndsim: { renderer: R } }).dndsim.renderer;
      const p = r.unitPoint('u2', 0.85);
      const northEdge = r.project(3.5, r.tiles.topY(7, 3), 7);
      return p && { ...p, northEdgeY: northEdge.y, pick: r.pick(p.x, p.y) };
    });
    if (!head) throw new Error('no Dan');
    expect(head.y).toBeLessThan(head.northEdgeY); // the point really is over the tile behind him
    expect(head.pick).toEqual({ cell: { r: 7, c: 3 }, unitId: 'u2' });
    await page.mouse.click(head.x, head.y);
    await expect(page.locator('[data-testid=sidebar]')).toContainText('Dan Dixon');
  });

  test('panning moves the picture by whole pixels: no shimmer', async ({ page }) => {
    await openScene(page);
    // geometry only: freeze idle frames and switch off bloom/blur (their mip-chain blurs are not shift-invariant)
    await page.evaluate(() => {
      const r = (
        window as unknown as {
          dndsim: { renderer: R & { setViewOptions: (o: { bloom: boolean; blur: boolean }) => void } };
        }
      ).dndsim.renderer;
      r.animationPaused = true;
      r.setViewOptions({ bloom: false, blur: false });
    });
    await page.mouse.move(5, 5); // no hover frame
    const box = await page.locator('canvas[data-testid=board]').boundingBox();
    if (!box) throw new Error('no board');
    const shot = async () => PNG.sync.read(await page.locator('canvas[data-testid=board]').screenshot());
    const settled = async () => {
      let prev = await shot();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(300);
        const next = await shot();
        if (Buffer.compare(prev.data, next.data) === 0) return next;
        prev = next;
      }
      throw new Error('board never settled');
    };
    const before = await settled();
    // drag by an odd number of pixels through fractional intermediate steps
    const sx = box.x + box.width * 0.5,
      sy = box.y + box.height * 0.85;
    const dx = 37,
      dy = -23;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + dx / 3, sy + dy / 3, { steps: 3 });
    await page.mouse.move(sx + dx, sy + dy, { steps: 7 });
    await page.mouse.up();
    await page.mouse.move(5, 5);
    const after = await settled();
    // compare the board's centre: after[x+dx, y+dy] must equal before[x, y]
    let compared = 0,
      differing = 0;
    const x0 = Math.floor(box.width * 0.3),
      x1 = Math.floor(box.width * 0.6);
    const y0 = Math.floor(box.height * 0.35),
      y1 = Math.floor(box.height * 0.6);
    for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2) {
        const a = (y * before.width + x) * 4;
        const b = ((y + dy) * after.width + (x + dx)) * 4;
        let d = 0;
        for (let k = 0; k < 3; k++)
          d = Math.max(d, Math.abs((before.data[a + k] ?? 0) - (after.data[b + k] ?? 0)));
        compared++;
        if (d > 12) differing++;
      }
    expect(compared).toBeGreaterThan(1000);
    expect(differing / compared).toBeLessThan(0.01);
  });

  test('light on, light group off, flier tether, DM and player views', async ({ context }, info) => {
    const dm = await context.newPage();
    await openScene(dm);
    const lights = await dm.evaluate(() => {
      const r = (window as unknown as { dndsim: { renderer: R } }).dndsim.renderer;
      let on = 0,
        off = 0;
      r.scene.traverse((o) => {
        if (o.isPointLight) {
          if (o.visible && (o.intensity as number) > 0) on++;
          else off++;
        }
      });
      return { on, off };
    });
    expect(lights).toEqual({ on: 2, off: 1 }); // lamp + Henry's torch on; hangar group off
    await dm.screenshot({ path: info.outputPath('dm.png') });
    await info.attach('dm', { path: info.outputPath('dm.png'), contentType: 'image/png' });
    const player = await context.newPage();
    await player.goto('/player.html');
    await player.bringToFront();
    await player.waitForSelector('[data-testid=board]', { timeout: 30_000 });
    await player.waitForTimeout(1000);
    // the hornet flies in darkness and the platform enemies are unlit: hidden from players
    const playerUnits = await player.evaluate(() =>
      (
        window as unknown as { dndsimPlayer: { renderer: { units: { ids: () => string[] } } } }
      ).dndsimPlayer.renderer.units.ids(),
    );
    expect(playerUnits).toContain('u1');
    expect(playerUnits).not.toContain('u7');
    await player.screenshot({ path: info.outputPath('player.png') });
    await info.attach('player', { path: info.outputPath('player.png'), contentType: 'image/png' });
    expect(readFileSync(info.outputPath('player.png')).length).toBeGreaterThan(10_000);
  });
});

test('performance scene: 25x25, 40 units, 20 lights with 8 shadowed, local shadow refresh', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/?scenario=perf&seed=1&bench=1');
  await page.waitForSelector('[data-testid=board]');
  await page.waitForTimeout(2000);
  const shape = await page.evaluate(() => {
    const w = window as unknown as {
      dndsim: {
        store: { battle: { board: { rows: number; cols: number }; units: unknown[] } };
        renderer: {
          scene: { traverse: (fn: (o: Record<string, unknown>) => void) => void };
          stats: { drawCalls: number };
        };
      };
    };
    let lights = 0,
      shadowed = 0;
    w.dndsim.renderer.scene.traverse((o) => {
      if (o.isPointLight && o.visible) {
        lights++;
        if (o.castShadow) shadowed++;
      }
    });
    const b = w.dndsim.store.battle;
    return {
      rows: b.board.rows,
      cols: b.board.cols,
      units: b.units.length,
      lights,
      shadowed,
      calls: w.dndsim.renderer.stats.drawCalls,
    };
  });
  expect(shape).toMatchObject({ rows: 25, cols: 25, units: 40, lights: 20, shadowed: 8 });
  expect(shape.calls).toBeLessThan(500);
  // moving one unit refreshes only the shadow maps of lights that reach it
  const marked = await page.evaluate(() => {
    const r = (
      window as unknown as {
        dndsim: {
          renderer: { lights: { markShadowsDirtyNear: (cells: { r: number; c: number }[]) => number } };
        };
      }
    ).dndsim.renderer;
    return {
      corner: r.lights.markShadowsDirtyNear([{ r: 0, c: 24 }]),
      everywhere: r.lights.markShadowsDirtyNear(
        Array.from({ length: 25 }, (_, i) => ({ r: i, c: i })).concat(
          Array.from({ length: 25 }, (_, i) => ({ r: 24 - i, c: i })),
        ),
      ),
    };
  });
  expect(marked.corner).toBeLessThan(8);
  expect(marked.everywhere).toBe(8);
  await page.screenshot({ path: info.outputPath('perf.png') });
  await info.attach('perf', { path: info.outputPath('perf.png'), contentType: 'image/png' });
});
