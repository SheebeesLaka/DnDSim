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
  // flip to HIDDEN via the debug panel and the TV loses the enemy's bar, not the party's
  await dm.keyboard.press('`');
  await dm.selectOption('[data-testid=pref-enemyHp]', 'HIDDEN');
  await expect(enemyBar).toHaveCount(0);
  await expect(player.locator('[data-testid=rail-u1] .hb').first()).toBeVisible();
  await dm.selectOption('[data-testid=pref-enemyHp]', 'EXACT');
  await expect(enemyBar.first()).toBeVisible();
  // a DM-side move shows up on the player side
  await dm.keyboard.press('`');
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
});
