import { expect, test } from '@playwright/test';

test('DM page and API respond', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toContainText('Cassandralis');
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const assets = (await (await request.get('/api/assets')).json()) as { enemies: Record<string, unknown> };
  expect(Object.keys(assets.enemies)).toHaveLength(18);
});

test('player page loads', async ({ page }) => {
  await page.goto('/player.html');
  await expect(page.locator('#app')).toContainText('Player View');
});
