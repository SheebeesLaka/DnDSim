import { expect, test } from '@playwright/test';
import { beginTestBattle } from './helpers.ts';

test('Rules: from the main menu, Players and DM tabs, a section jump, back', async ({ page }) => {
  await page.goto('/?scenario=test&seed=1&view=menu');
  await page.click('[data-testid=menu-rules]');
  const doc = page.locator('[data-testid=rules-doc]');
  await expect(doc.locator('h2', { hasText: 'Attacking' })).toBeVisible();
  await expect(doc.locator('table').first()).toBeVisible();
  await page.click('[data-testid=rules-tab-1]');
  await expect(doc.locator('h2', { hasText: 'Enemies' })).toBeVisible();
  await expect(doc.locator('h2', { hasText: 'Attacking' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Item abilities' }).click();
  await expect(doc.locator('h2', { hasText: 'Item abilities' })).toBeInViewport();
  await page.click('[data-testid=rules-back]');
  await expect(page.locator('[data-testid=menu-rules]')).toBeVisible();
});

test('Rules: opened from the battle menu, Back returns to the same battle', async ({ page }) => {
  await beginTestBattle(page);
  await page.click('[data-testid=menu]');
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.locator('[data-testid=rules-doc]')).toBeVisible();
  await expect(page.locator('[data-testid=rules-back]')).toHaveText('← Back to battle');
  await page.click('[data-testid=rules-back]');
  await expect(page.locator('[data-testid=turn-rail]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { dndsim: { store: { battle: { turn: { started: boolean } } } } }).dndsim.store
          .battle.turn.started,
    ),
  ).toBe(true);
});
