import { expect, test } from '@playwright/test';
import { battle, beginTestBattle, clickCell, typeDigits } from './helpers.ts';

const hpOf = async (page: Parameters<typeof battle>[0], id: string) =>
  (await battle(page)).units.find((u) => u.id === id)?.health;

test('Begin → initiative → move → typed attack → HP, then Space round to round 2', async ({ page }) => {
  await beginTestBattle(page);
  expect((await battle(page)).turn.order).toHaveLength(8);
  await expect(page.locator('[data-testid=rail-u1]').first()).toBeVisible();
  // select Henry (6,4), move one tile east
  await clickCell(page, 6, 4);
  await expect(page.locator('[data-testid=sel-name]')).toHaveText('Henry Keaton');
  await expect(page.locator('[data-testid=sel-stats]')).toContainText('MOB 2');
  await page.click('[data-testid=act-move]');
  await clickCell(page, 6, 5);
  expect((await battle(page)).units.find((u) => u.id === 'u1')).toMatchObject({ r: 6, c: 5 });
  // attack the Snake at (7,7): d20 15 → +6 vs AC 12 → tier 3, three d4
  await page.click('[data-testid=act-attack]');
  await clickCell(page, 7, 7);
  await expect(page.locator('[data-testid=roll-panel]')).toBeVisible();
  await typeDigits(page, '15');
  await expect(page.locator('[data-testid=roll-panel]')).toContainText('HIT');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await battle(page)).pending?.kind).toBe('damage');
  await typeDigits(page, '333'); // each d4 is final after one digit
  await page.keyboard.press('Enter');
  await expect.poll(() => hpOf(page, 'u6')).toBe(1); // 9 + 4 bonus = 13 of 14
  await expect(page.locator('[data-testid=roll-panel]')).toHaveCount(0);
  // Space ends each turn; eight turns later it is round 2
  for (let i = 0; i < 8; i++) await page.keyboard.press(' ');
  await expect.poll(async () => (await battle(page)).turn.round).toBe(2);
});

test('cancel at the miss spends nothing; Adjust is battle-only; undo puts it back', async ({ page }) => {
  await beginTestBattle(page);
  await clickCell(page, 7, 3); // Dan with the shotgun and shells
  await expect(page.locator('[data-testid=weapon]')).toContainText('Shortbarrel Shotgun');
  await expect(page.locator('[data-testid=weapon]')).toContainText('6 ammo');
  await page.click('[data-testid=act-attack]');
  await clickCell(page, 7, 7);
  await typeDigits(page, '1');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=roll-panel]')).toContainText('MISS');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=roll-panel]')).toHaveCount(0);
  await expect(page.locator('[data-testid=weapon]')).toContainText('6 ammo');
  // right-click → Adjust: AC +1 and the tier-1 die up one step, on this battle only
  const dan = await page.evaluate(() =>
    (
      window as unknown as {
        dndsim: { renderer: { unitPoint: (id: string, f: number) => { x: number; y: number } } };
      }
    ).dndsim.renderer.unitPoint('u2', 0.4),
  );
  await page.mouse.click(dan.x, dan.y, { button: 'right' });
  await page.click('text=Adjust AC, stats & dice');
  const sheet = page.locator('[data-testid=adjust-sheet]');
  const ac = Number(await sheet.locator('[data-testid=adj-ac]').textContent());
  await sheet.locator('[data-testid=adj-ac-inc]').click();
  await expect(sheet.locator('[data-testid=adj-ac]')).toHaveText(String(ac + 1));
  await sheet.locator('[data-testid=adj-t1-inc]').click();
  await expect(sheet.locator('[data-testid=adj-t1]')).toHaveClass(/up/);
  expect((await battle(page)).units.find((u) => u.id === 'u2')?.acAdjustment).toBe(1);
  // Ctrl+Z steps back one change at a time
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await battle(page)).units.find((u) => u.id === 'u2')?.acAdjustment).toBe(0);
});

test('cast picker, area aim, auto-roll and typed damage', async ({ page }) => {
  await beginTestBattle(page);
  await clickCell(page, 2, 10); // Grand Wizard Man
  await page.click('[data-testid=act-cast]');
  await page.click('[data-testid=spell-Fireball]');
  await page.click('[data-testid=cast-btn]');
  await clickCell(page, 7, 8); // burst 2 catches the Snake (7,7) and the Hornet (8,9)
  await expect.poll(async () => (await battle(page)).pending?.kind).toBe('areaD20s');
  await page.keyboard.press('a'); // auto-roll the enemies' saves
  // damage dice, then any confirm step: type 1s until the roll is done
  for (let step = 0; step < 4; step++) {
    const kind = (await battle(page)).pending?.kind;
    if (!kind) break;
    if (kind === 'damage') {
      const n = await page.evaluate(
        () =>
          (window as unknown as { dndsim: { store: { battle: { pending: { dice: string[] } } } } }).dndsim
            .store.battle.pending.dice.length,
      );
      // a 1 is final on a d4–d8 but could still become 10 on a d10+: Tab on only when it stayed put
      const cursor = () =>
        page.evaluate(
          () =>
            (window as unknown as { dndsim: { store: { session: { rollDraft: { cursor: number } } } } })
              .dndsim.store.session.rollDraft.cursor,
        );
      for (let i = 0; i < n; i++) {
        const at = await cursor();
        await page.keyboard.press('1');
        if ((await cursor()) === at && i < n - 1) await page.keyboard.press('Tab');
      }
    }
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => (await battle(page)).pending).toBeNull();
});
