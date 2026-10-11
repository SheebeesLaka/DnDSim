/**
 * Editors on the fixture scenario: the AssetStore is read-only there, so every
 * write is logged (window.dndsim.assets.writes) and nothing touches saves/.
 */
import { expect, test, type Page } from '@playwright/test';

interface Write {
  op: 'put' | 'del';
  path: string;
  text?: string;
  skipped: boolean;
}

const writes = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { dndsim: { assets: { writes: Write[] } } }).dndsim.assets.writes,
  );
const lastPut = async (page: Page, path: string) => {
  const w = (await writes(page)).filter((x) => x.op === 'put' && x.path === path).pop();
  return w?.text ? (JSON.parse(w.text) as Record<string, unknown>) : null;
};

test.describe('Asset Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=test&view=assets');
    await expect(page.locator('[data-testid=asset-editor]')).toBeVisible();
  });

  test('create, rename and delete a weapon with a STATUS ability (type and status name kept)', async ({
    page,
  }, info) => {
    await expect(page.locator('[data-testid="card-weapon-Greatsword"]')).toBeVisible();
    await page.click('[data-testid=add-weapon]');
    const dlg = page.locator('[data-testid=item-editor]');
    await dlg.locator('[data-testid=item-name]').fill('Venom Blade');
    await dlg.locator('[data-testid=item-tier1]').selectOption({ label: 'd10' });
    await dlg.locator('[data-testid=item-mod-DEX]').fill('2');
    await dlg.locator('[data-testid=ability-add]').click();
    const ab = page.locator('[data-testid=ability-dialog]');
    await ab.locator('[data-testid=ability-name]').fill('Poison');
    await ab.locator('[data-testid=ability-trigger]').selectOption({ label: 'ON_HIT' });
    await ab.locator('[data-testid=ability-effect]').selectOption({ label: 'STATUS' });
    await ab.locator('[data-testid=ability-status]').fill('Poisoned');
    await ab.locator('[data-testid=dialog-ok]').click();
    await expect(dlg.locator('[data-testid=ability-row-0]')).toContainText('Poison');
    await page.screenshot({ path: info.outputPath('weapon-dialog.png') });
    await dlg.locator('[data-testid=dialog-ok]').click();
    const card = page.locator('[data-testid="card-weapon-Venom Blade"]');
    await expect(card).toContainText('d10/d6/d8');
    await expect(card).toContainText('DEX');
    const saved = await lastPut(page, 'items/weapons/Venom_Blade.json');
    expect(saved).toMatchObject({ name: 'Venom Blade', type: 'Weapon', damageDice: ['d10', 'd6', 'd8'] });
    expect((saved?.abilities as Record<string, unknown>[])[0]).toMatchObject({
      name: 'Poison',
      triggerType: 'ON_HIT',
      effectType: 'STATUS',
      statusName: 'Poisoned',
    });

    // rename: the old file goes away (F-44)
    await card.locator('[data-testid="card-weapon-Venom Blade-edit"]').click();
    await page.locator('[data-testid=item-name]').fill('Viper Blade');
    await page.locator('[data-testid=dialog-ok]').click();
    await expect(page.locator('[data-testid="card-weapon-Viper Blade"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-weapon-Venom Blade"]')).toHaveCount(0);
    const ops = (await writes(page)).map((w) => `${w.op} ${w.path}`);
    expect(ops.slice(-2)).toEqual([
      'put items/weapons/Viper_Blade.json',
      'del items/weapons/Venom_Blade.json',
    ]);
    expect((await writes(page)).every((w) => w.skipped)).toBe(true);

    // delete with confirmation
    await page.click('[data-testid="card-weapon-Viper Blade-delete"]');
    await page.click('[data-testid=confirm-ok]');
    await expect(page.locator('[data-testid="card-weapon-Viper Blade"]')).toHaveCount(0);
    expect((await writes(page)).pop()).toMatchObject({ op: 'del', path: 'items/weapons/Viper_Blade.json' });
  });

  test('a duplicate name is refused with an alert and the dialog stays open', async ({ page }) => {
    await page.click('[data-testid=add-weapon]');
    await page.locator('[data-testid=item-name]').fill('Greatsword');
    await page.locator('[data-testid=dialog-ok]').click();
    await expect(page.locator('.dialog h3', { hasText: 'Duplicate Name' })).toBeVisible();
    await page.locator('.dialog', { hasText: 'Duplicate Name' }).getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('[data-testid=item-editor]')).toBeVisible();
  });

  test('consumable effect is editable (F-59) and crafting items carry the loader-safe type (F-47)', async ({
    page,
  }) => {
    await page.click('[data-testid=add-consumable]');
    await page.locator('[data-testid=item-name]').fill('Regen Tonic');
    await page.locator('[data-testid=item-effect-on]').check();
    await page.locator('[data-testid=item-effect-name]').fill('Regenerating');
    await page.locator('[data-testid=dialog-ok]').click();
    expect(await lastPut(page, 'items/consumables/Regen_Tonic.json')).toMatchObject({
      healAmount: 10,
      effect: { name: 'Regenerating', effectType: 2 },
    });
    await page.click('[data-testid=add-crafting]');
    await page.locator('[data-testid=item-name]').fill('Copper Wire');
    await page.locator('[data-testid=item-category]').selectOption({ label: 'Component' });
    await page.locator('[data-testid=dialog-ok]').click();
    expect(await lastPut(page, 'items/crafting/Copper_Wire.json')).toMatchObject({
      type: 'Crafting Item',
      craftingCategory: 'Component',
    });
    await page.click('[data-testid=asset-sub-consumables]');
    await expect(page.locator('[data-testid="card-crafting-Copper Wire"]')).toContainText('Component');
  });

  test('terrain: layer only shows without collision; spells: friendly resolution retargets, rename updates knowers', async ({
    page,
  }, info) => {
    await page.click('[data-testid=asset-tab-terrain]');
    await page.click('[data-testid=add-terrain]');
    const t = page.locator('[data-testid=terrain-editor]');
    await t.locator('[data-testid=terrain-type]').fill('Shallow Water');
    await expect(t.locator('[data-testid=terrain-layer]')).toBeHidden();
    await t.locator('[data-testid=terrain-collision]').uncheck();
    await expect(t.locator('[data-testid=terrain-layer]')).toBeVisible();
    await t.locator('[data-testid=terrain-layer]').selectOption({ label: 'Entity Below' });
    await t.locator('[data-testid=dialog-ok]').click();
    await expect(page.locator('[data-testid="card-terrain-Shallow Water"]')).toContainText('Below');
    expect(await lastPut(page, 'terrain/Shallow_Water.json')).toMatchObject({
      collision: false,
      entityAboveTerrain: false,
    });

    await page.click('[data-testid=asset-tab-spells]');
    await page.screenshot({ path: info.outputPath('spells.png') });
    await page.click('[data-testid=add-spell]');
    const s = page.locator('[data-testid=spell-editor]');
    await s.locator('[data-testid=spell-name]').fill('Mend');
    await s.locator('[data-testid=spell-resolution]').selectOption({ label: 'HEAL' });
    await expect(s.locator('[data-testid=spell-target]')).toHaveValue('1'); // ALLY
    await expect(s.locator('[data-testid=spell-tier2]')).toBeHidden();
    await expect(s.locator('[data-testid=spell-preview]')).toHaveText('Heals d10.');
    await s.locator('[data-testid=dialog-ok]').click();
    expect(await lastPut(page, 'spells/Mend.json')).toMatchObject({ resolution: 'HEAL', targetType: 'ALLY' });

    // renaming a known spell rewrites the sheets that know it
    const knowers = await page.evaluate(() =>
      Object.values(
        (
          window as unknown as {
            dndsim: { bundle: { party: Record<string, { name: string; knownSpells: string[] }> } };
          }
        ).dndsim.bundle.party,
      )
        .filter((p) => p.knownSpells.includes('Fire Bolt'))
        .map((p) => p.name),
    );
    expect(knowers.length).toBeGreaterThan(0);
    await page.click('[data-testid="card-spell-Fire Bolt-edit"]');
    await page.locator('[data-testid=spell-name]').fill('Fire Dart');
    await page.locator('[data-testid=dialog-ok]').click();
    const paths = (await writes(page)).map((w) => w.path);
    expect(paths).toContain('spells/Fire_Dart.json');
    expect(paths.some((p) => p.startsWith('entities/party/'))).toBe(true);
  });
});
