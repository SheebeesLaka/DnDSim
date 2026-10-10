import { expect, test } from '@playwright/test';
import { battle, beginTestBattle } from './helpers.ts';
import { rmSync, existsSync } from 'node:fs';

test('save a battle to saves/battles and load it back', async ({ page }) => {
  const name = 'e2e-roundtrip';
  const file = `saves/battles/${name}.json`;
  if (existsSync(file)) rmSync(file);
  try {
    await beginTestBattle(page);
    await page.click('[data-testid=tab-manage]');
    await page.fill('[data-testid=save-name]', name);
    await page.click('[data-testid=save-battle]');
    await expect(page.locator('.dialog')).toContainText('saved as');
    await page.click('.dialog button');
    expect(existsSync(file)).toBe(true);
    const before = await battle(page);
    // change something, then load the save: the round-1 state comes back
    await page.click('[data-testid=tab-battle]');
    for (let i = 0; i < 8; i++) await page.click('[data-testid=next-btn]');
    await expect(page.locator('[data-testid=phase]')).toHaveText('Round 2');
    await page.click('[data-testid=tab-manage]');
    await page.click('[data-testid=load-battle]');
    await page.selectOption('[data-testid=load-select]', name);
    await page.click('[data-testid=load-ok]');
    await expect(page.locator('[data-testid=phase]')).toHaveText('Round 1');
    const after = await battle(page);
    expect(after.turn.order).toEqual(before.turn.order);
    // the setup screen also lists it
    await page.goto('/');
    await expect(page.locator('[data-testid=load-saved]')).toBeVisible();
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});

test('a fresh board from the setup screen runs party placement', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid=shape-CIRCLE]');
  await page.fill('[data-testid=rows]', '6');
  await page.fill('[data-testid=cols]', '6');
  await page.click('[data-testid=start]');
  await expect(page.locator('[data-testid=phase]')).toHaveText('Setup');
  // party.json lists Grand Wizard Man → placement banner, Begin disabled until placed
  await expect(page.locator('[data-testid=begin-btn]')).toBeDisabled();
  const pt = await page.evaluate(() =>
    (
      window as unknown as {
        dndsim: { renderer: { cellCenter: (c: { r: number; c: number }) => { x: number; y: number } } };
      }
    ).dndsim.renderer.cellCenter({ r: 2, c: 2 }),
  );
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('[data-testid=begin-btn]')).toBeEnabled();
  await expect(page.locator('[data-testid=strip] .card')).toHaveCount(1);
});
