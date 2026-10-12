import { expect, test } from '@playwright/test';
import { battle, beginTestBattle } from './helpers.ts';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

test('save a battle to the campaign battles folder and load it back', async ({ page, request }) => {
  const name = 'e2e-roundtrip';
  // wherever the server keeps the campaign (a reused dev server may use the real one)
  const { campaignDir } = (await (await request.get('/api/health')).json()) as { campaignDir: string };
  const file = join(campaignDir, 'battles', `${name}.json`);
  if (existsSync(file)) rmSync(file);
  try {
    await beginTestBattle(page);
    await page.click('[data-testid=menu]');
    await page.click('text=Save battle…');
    await page.fill('[data-testid=save-name]', name);
    await page.click('[data-testid=save-ok]');
    await expect(page.locator('[data-testid=toast]')).toContainText('Battle saved');
    expect(existsSync(file)).toBe(true);
    const before = await battle(page);
    // change something, then load the save: the round-1 state comes back
    for (let i = 0; i < 8; i++) await page.keyboard.press(' ');
    await expect.poll(async () => (await battle(page)).turn.round).toBe(2);
    await page.click('[data-testid=menu]');
    await page.click('text=Load battle…');
    await page.click(`[data-testid=load-${name}]`);
    await expect.poll(async () => (await battle(page)).turn.round).toBe(1);
    const after = await battle(page);
    expect(after.turn.order).toEqual(before.turn.order);
    // the setup screen also lists it
    await page.goto('/');
    await page.click('[data-testid=menu-battle]');
    await expect(page.locator('[data-testid=load-saved]')).toBeVisible();
  } finally {
    if (existsSync(file)) rmSync(file);
  }
});

test('a fresh board from the setup screen runs party placement', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=menu]')).toBeVisible();
  await page.click('[data-testid=menu-battle]');
  await page.click('[data-testid=shape-CIRCLE]');
  await page.fill('[data-testid=rows]', '6');
  await page.fill('[data-testid=cols]', '6');
  await page.click('[data-testid=start]');
  await expect(page.locator('[data-testid=round-pill]')).toContainText('Setup');
  // party.json lists Grand Wizard Man → placement prompt, Begin disabled until placed
  await expect(page.locator('[data-testid=round-pill]')).toContainText('Place Grand Wizard Man');
  await expect(page.locator('[data-testid=begin]')).toBeDisabled();
  const pt = await page.evaluate(() =>
    (
      window as unknown as {
        dndsim: { renderer: { cellCenter: (c: { r: number; c: number }) => { x: number; y: number } } };
      }
    ).dndsim.renderer.cellCenter({ r: 2, c: 2 }),
  );
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('[data-testid=begin]')).toBeEnabled();
  await expect(page.locator('[data-testid=turn-rail] [data-testid^=rail-]')).toHaveCount(1);
});
