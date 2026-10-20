import { expect, test } from '@playwright/test';
import { beginTestBattle, clickCell } from './helpers.ts';

test('the player window mirrors the DM board and honours display options', async ({ context }) => {
  // two WebGL pages on software rendering (SwiftShader) in one browser
  test.setTimeout(90_000);
  const dm = await context.newPage();
  await beginTestBattle(dm);
  const player = await context.newPage();
  await player.goto('/player.html');
  await expect(player.locator('[data-testid=turn-rail]')).toBeVisible({ timeout: 30_000 });
  // background pages skip animation frames, which Playwright's actionability checks wait on
  await dm.bringToFront();
  // enemy health bars by default (scenario prefs come from the repo's ui_prefs: EXACT)
  const enemyBar = player.locator('[data-testid=rail-u6] .hb');
  await expect(enemyBar.first()).toBeVisible();
  // flip to HIDDEN in Field ▸ TV and the TV loses the enemy's bar, not the party's
  await dm.click('[data-testid=dock-tv]');
  await dm.click('[data-testid=tv-enemyHp-HIDDEN]');
  await expect(enemyBar).toHaveCount(0);
  await expect(player.locator('[data-testid=rail-u1] .hb').first()).toBeVisible();
  await dm.click('[data-testid=tv-enemyHp-EXACT]');
  await expect(enemyBar.first()).toBeVisible();
  // a DM-side move shows up on the player side
  await dm.click('[data-testid=field-toggle]');
  await clickCell(dm, 6, 4);
  await dm.click('[data-testid=act-move]');
  await clickCell(dm, 6, 5);
  await expect
    .poll(() =>
      player.evaluate(
        () =>
          (
            window as unknown as {
              dndsimPlayer: { replica: { state: { vm: { units: { id: string; c: number }[] } } } };
            }
          ).dndsimPlayer.replica.state.vm.units.find((u) => u.id === 'u1')?.c,
      ),
    )
    .toBe(5);
  // the DM's area template reaches the players only with spellTemplates on (repo prefs: true)
  await clickCell(dm, 2, 10);
  await dm.click('[data-testid=act-cast]');
  await dm.click('[data-testid=spell-Fireball]');
  await dm.click('[data-testid=cast-btn]');
  const pt = await dm.evaluate(() =>
    (
      window as unknown as {
        dndsim: { renderer: { cellCenter: (c: { r: number; c: number }) => { x: number; y: number } } };
      }
    ).dndsim.renderer.cellCenter({ r: 7, c: 8 }),
  );
  await dm.mouse.move(pt.x, pt.y);
  await expect
    .poll(() =>
      player.evaluate(
        () =>
          (
            window as unknown as {
              dndsimPlayer: { replica: { state: { vm: { highlights: { areaTemplate: unknown[] } } } } };
            }
          ).dndsimPlayer.replica.state.vm.highlights.areaTemplate.length,
      ),
    )
    .toBeGreaterThan(0);
  // the TV camera moves with the DM's: pan the DM board and the TV centres on the same ground point
  await dm.keyboard.press('Escape');
  await dm.mouse.move(600, 420);
  await dm.mouse.down();
  await dm.mouse.move(690, 370, { steps: 6 });
  await dm.mouse.up();
  type Cam = { cam: { target: { x: number; y: number } } };
  const dmTarget = await dm.evaluate(() => {
    const t = (window as unknown as { dndsim: { renderer: Cam } }).dndsim.renderer.cam.target;
    return { x: t.x, y: t.y };
  });
  await expect
    .poll(() =>
      player.evaluate(() => {
        const t = (window as unknown as { dndsimPlayer: { renderer: Cam } }).dndsimPlayer.renderer.cam.target;
        return { x: t.x, y: t.y };
      }),
    )
    .toEqual(dmTarget);
});

test('the TV victory screen hides party HP numbers when that option is off', async ({ context }) => {
  test.setTimeout(90_000);
  const dm = await context.newPage();
  await beginTestBattle(dm);
  const player = await context.newPage();
  await player.goto('/player.html');
  await expect(player.locator('[data-testid=turn-rail]')).toBeVisible({ timeout: 30_000 });
  await dm.bringToFront();
  type Win = {
    dndsim: {
      prefs: { display: { partyHpNumbers: boolean } };
      store: {
        battle: { units: { id: string; kind: string }[] };
        dispatch: (cmd: { type: 'REMOVE_UNIT'; unitId: string }) => unknown;
      };
    };
  };
  // Field > TV > Party HP numbers off
  await dm.click('[data-testid=dock-tv]');
  if (await dm.evaluate(() => (window as unknown as Win).dndsim.prefs.display.partyHpNumbers))
    await dm.click('[data-testid=tv-partyHpNumbers]');
  expect(await dm.evaluate(() => (window as unknown as Win).dndsim.prefs.display.partyHpNumbers)).toBe(false);
  await dm.click('[data-testid=field-toggle]');
  // no enemies left, then End battle: a victory
  await dm.evaluate(() => {
    const store = (window as unknown as Win).dndsim.store;
    for (const u of store.battle.units.filter((x) => x.kind === 'enemy'))
      store.dispatch({ type: 'REMOVE_UNIT', unitId: u.id });
  });
  await dm.click('[data-testid=menu]');
  await dm.getByText('End battle…').click();
  await dm.click('[data-testid=confirm-ok]');
  // the DM still sees the numbers; the TV shows the bars without them
  await expect(dm.locator('[data-testid=victory-hp]').first()).toBeVisible();
  await expect(player.locator('[data-testid=victory]')).toBeVisible();
  await expect(player.locator('[data-testid=victory] .hpbar').first()).toBeVisible();
  await expect(player.locator('[data-testid=victory-hp]')).toHaveCount(0);
});
