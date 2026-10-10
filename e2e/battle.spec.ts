import { expect, test } from '@playwright/test';
import { battle, beginTestBattle, clickCell } from './helpers.ts';

test('Begin → initiative → move → typed attack → HP text', async ({ page }) => {
  await beginTestBattle(page);
  await expect(page.locator('[data-testid=strip] .card')).toHaveCount(8);
  // select Henry (6,4), move one tile east
  await clickCell(page, 6, 4);
  await expect(page.locator('[data-testid=sel-name]')).toHaveText('Henry Keaton');
  await expect(page.locator('[data-testid=mob]')).toHaveText('MOB: 2');
  await page.click('[data-testid=act-move]');
  await clickCell(page, 6, 5);
  const afterMove = await battle(page);
  expect(afterMove.units.find((u) => u.id === 'u1')).toMatchObject({ r: 6, c: 5 });
  // attack the Snake at (7,7): d20 15 → +6 vs AC 12 → tier 3, three d4
  await page.click('[data-testid=act-attack]');
  await clickCell(page, 7, 7);
  await page.fill('[data-testid=d20-input]', '15');
  await page.click('[data-testid=dice-submit]');
  await expect(page.locator('[data-testid=damage-panel]')).toBeVisible();
  const dice = page.locator('[data-testid=damage-panel] input');
  await expect(dice).toHaveCount(3);
  for (let i = 0; i < 3; i++) await dice.nth(i).fill('3');
  await page.click('[data-testid=dice-submit]');
  await expect(page.locator('[data-testid=card-u6]')).toContainText('1/14'); // 9 + 4 bonus = 13 of 14
  // sidebar reflects selection after the attack
  await expect(page.locator('[data-testid=sel-name]')).toHaveText('Henry Keaton');
  // Next advances the round counter eventually
  for (let i = 0; i < 8; i++) await page.click('[data-testid=next-btn]');
  await expect(page.locator('[data-testid=phase]')).toHaveText('Round 2');
});

test('cancel at the miss banner spends nothing; sidebar tweaks are battle-only', async ({ page }) => {
  await beginTestBattle(page);
  await clickCell(page, 7, 3); // Dan with the shotgun and shells
  await expect(page.locator('[data-testid=weapon]')).toContainText('Shortbarrel Shotgun (x6)');
  await page.click('[data-testid=act-attack]');
  await clickCell(page, 7, 7);
  await page.fill('[data-testid=d20-input]', '1');
  await page.click('[data-testid=dice-submit]');
  await expect(page.locator('[data-testid=confirm-panel]')).toContainText('MISS');
  await page.click('[data-testid=dice-cancel]');
  await expect(page.locator('[data-testid=weapon]')).toContainText('(x6)');
  await page.click('[data-testid=stat-ac-inc]');
  await expect(page.locator('[data-testid=stat-ac]')).toHaveText('14');
  await page.click('[data-testid=dice-0-inc]');
  await expect(page.locator('[data-testid=dice-0]')).toHaveText('d8');
});

test('spell picker, area aim and shared rolls', async ({ page }) => {
  await beginTestBattle(page);
  await clickCell(page, 2, 10); // Grand Wizard Man
  await page.click('[data-testid=act-cast]');
  await page.click('[data-testid=spell-Fireball]');
  await page.click('[data-testid=cast-btn]');
  await clickCell(page, 7, 8); // burst 2 catches the Snake (7,7) and the Hornet (8,9)
  await expect(page.locator('[data-testid=auto-roll]')).toBeVisible();
  await page.click('[data-testid=auto-roll]');
  const panel = page.locator('[data-testid=damage-panel], [data-testid=confirm-panel]');
  await expect(panel).toBeVisible();
  const inputs = page.locator('[data-testid=damage-panel] input');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill('1');
  await page.click('[data-testid=dice-submit]');
  await expect(page.locator('[data-testid=damage-panel]')).toHaveCount(0);
  const b = await battle(page);
  expect(b.pending).toBeNull();
});
