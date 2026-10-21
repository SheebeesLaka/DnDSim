/** The sheet picker behind a sprite's Choose…, on the fixture scenario (writes are logged, not saved). */
import { expect, test, type Page } from '@playwright/test';

const REF = 'party/thrain_sheet.png@1,1,32,32;34,1,32,32';

const lastSpritePath = (page: Page) =>
  page.evaluate(() => {
    const writes = (
      window as unknown as { dndsim: { assets: { writes: { op: string; path: string; text?: string }[] } } }
    ).dndsim.assets.writes;
    const w = writes.filter((x) => x.op === 'put' && x.path === 'entities/party/Henry_Keaton.json').pop();
    return w?.text ? (JSON.parse(w.text) as { spritePath: string | null }).spritePath : undefined;
  });

/** True once the canvas has any visible pixel. */
const drawn = (page: Page, testid: string) =>
  page.evaluate((id) => {
    const c = document.querySelector<HTMLCanvasElement>(`[data-testid=${id}]`);
    const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return false;
    for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) return true;
    return false;
  }, testid);

test.beforeEach(async ({ page }) => {
  await page.goto('/?scenario=test&view=sheets');
  await page.click('[data-testid=group-ALL]');
  await page.click('[data-testid="sheet-row-Henry Keaton"]');
  await page.locator('[data-testid=sheet-pane] [data-testid=sprite-choose]').click();
  await page.click('[data-testid="sheet-party/thrain_sheet.png"]');
  await expect(page.locator('[data-testid=frame-0]')).toBeVisible();
});

test('pick two frames on a sheet: they play in click order and the sheet saves the ref', async ({ page }) => {
  await page.click('[data-testid=frame-0]');
  await page.click('[data-testid=frame-1]');
  await expect(page.locator('[data-testid=frame-0] .sheet-order')).toHaveText('1');
  await expect(page.locator('[data-testid=frame-1] .sheet-order')).toHaveText('2');
  await expect(page.locator('[data-testid=sheet-ref]')).toHaveText(REF);
  await expect.poll(() => drawn(page, 'sheet-preview')).toBe(true);
  // clicking a picked frame takes it out again
  await page.click('[data-testid=frame-0]');
  await expect(page.locator('[data-testid=sheet-ref]')).toHaveText('party/thrain_sheet.png@34,1,32,32');
  await page.click('[data-testid=frame-0]');
  await page.click('[data-testid=sheet-use]');
  await expect(page.locator('[data-testid=sheet-picker]')).toHaveCount(0);
  await expect(page.locator('[data-testid=sheet-pane] [data-testid=sprite-path]')).toHaveText(
    'party/thrain_sheet.png@34,1,32,32;1,1,32,32',
  );
  await expect.poll(() => lastSpritePath(page)).toBe('party/thrain_sheet.png@34,1,32,32;1,1,32,32');
});

test('drag a box by hand on the sheet', async ({ page }) => {
  const stage = page.locator('.sheet-stage');
  const box = (await stage.boundingBox())!;
  const zoom = Number((await page.locator('.sheet-zoom').textContent())?.replace('×', ''));
  // around the pig in the cell at (133,1): sheet pixels 136..161 x 4..31
  await page.mouse.move(box.x + 136 * zoom + 1, box.y + 4 * zoom + 1);
  await page.mouse.down();
  await page.mouse.move(box.x + 161 * zoom + 1, box.y + 31 * zoom + 1, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.sheet-box.custom.on')).toHaveCount(1);
  await expect(page.locator('[data-testid=sheet-ref]')).toHaveText('party/thrain_sheet.png@136,4,26,28');
  await expect.poll(() => drawn(page, 'sheet-preview')).toBe(true);
});
