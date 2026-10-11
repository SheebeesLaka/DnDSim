/**
 * Character Sheets on the fixture scenario. The AssetStore is read-only there:
 * every write is logged (window.dndsim.assets.writes) and nothing touches saves/.
 */
import { expect, test, type Page } from '@playwright/test';
import { battle } from './helpers.ts';

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
const ops = async (page: Page) => (await writes(page)).map((w) => `${w.op} ${w.path}`);
const lastPut = async (page: Page, path: string) => {
  const w = (await writes(page)).filter((x) => x.op === 'put' && x.path === path).pop();
  return w?.text ? (JSON.parse(w.text) as Record<string, unknown>) : null;
};
/** Sheet edits are written after a short debounce. */
const savedSheet = (page: Page, stem: string) =>
  expect.poll(() => lastPut(page, `entities/party/${stem}.json`));

const HENRY = 'entities/party/Henry_Keaton.json';

test.describe('Character Sheets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=test&view=sheets');
    await expect(page.locator('[data-testid=sheets-screen]')).toBeVisible();
    // the real ui_prefs.json may pin another default group tab
    await page.click('[data-testid=group-ALL]');
  });

  test('edit a sheet: HP, attributes, status, items, equipment, spells, then rename', async ({
    page,
  }, info) => {
    await page.click('[data-testid="sheet-row-Henry Keaton"]');
    const pane = page.locator('[data-testid=sheet-pane]');
    await expect(pane.locator('[data-testid=sheet-name]')).toHaveValue('Henry Keaton');

    // HP is written after the debounce, with no Save button
    await pane.locator('[data-testid=sheet-hp]').fill('25');
    await pane.locator('[data-testid=sheet-hp]').press('Tab');
    await savedSheet(page, 'Henry_Keaton').toMatchObject({ currentHP: 25, totalHP: 36 });

    // attributes: total follows base, the point budget updates
    const total = pane.locator('[data-testid=sheet-total-STR]');
    const before = Number(await total.textContent());
    const points = await pane.locator('[data-testid=sheet-points]').textContent();
    await pane.locator('[data-testid=sheet-base-STR]').fill('8');
    await pane.locator('[data-testid=sheet-base-STR]').press('Tab');
    await expect(total).toHaveText(String(before + 2));
    await expect(pane.locator('[data-testid=sheet-points]')).not.toHaveText(points ?? '');
    await expect
      .poll(async () => ((await lastPut(page, HENRY))?.baseAttributes as number[] | undefined)?.[0])
      .toBe(8);

    // status flags
    await pane.locator('[data-testid=sheet-status]').click();
    await pane.locator('[data-testid=sheet-status-Unconscious]').check();
    await expect(pane.locator('[data-testid=sheet-status]')).toContainText('Unconscious');
    await expect
      .poll(async () =>
        ((await lastPut(page, HENRY))?.status as { name: string }[] | undefined)?.map((s) => s.name),
      )
      .toEqual(['Unconscious']);
    await pane.locator('[data-testid=sheet-status-Unconscious]').uncheck();
    await pane.locator('[data-testid=sheet-status]').click();

    // add two kits and a greatsword
    const addItem = async (category: string, item: string, qty: number) => {
      await pane.locator('[data-testid=sheet-add-item]').click();
      const dlg = page.locator('.dialog', { hasText: 'Add Item' });
      await dlg.locator('[data-testid=sheet-add-category]').selectOption({ label: category });
      await dlg.locator('[data-testid=sheet-add-select]').selectOption({ label: item });
      await dlg.locator('[data-testid=sheet-add-qty]').fill(String(qty));
      await dlg.locator('[data-testid=dialog-ok]').click();
    };
    await addItem('Consumable', 'First-Aid Kit', 2);
    await addItem('Weapon', 'Greatsword', 1);
    await pane.locator('[data-testid=sheet-inv-tab-consumables]').click();
    await expect(pane.locator('[data-testid="sheet-item-First-Aid Kit"]')).toContainText('×2');

    // equip it: the copy leaves the inventory, the slot holds it
    await pane.locator('[data-testid=sheet-equip-primary]').selectOption({ label: 'Greatsword' });
    await pane.locator('[data-testid=sheet-inv-tab-weapons]').click();
    await expect(pane.locator('[data-testid=sheet-item-Greatsword]')).toHaveCount(0);
    await expect
      .poll(async () => {
        const s = await lastPut(page, HENRY);
        return {
          primary: (s?.weapons as ({ name: string } | null)[] | undefined)?.[0]?.name,
          inventory: (s?.inventory as { name: string; quantity: number }[] | undefined)?.map(
            (i) => `${i.name}×${i.quantity}`,
          ),
        };
      })
      .toEqual({ primary: 'Greatsword', inventory: ['First-Aid Kit×2'] });

    // remove one of the two kits
    await pane.locator('[data-testid=sheet-inv-tab-consumables]').click();
    await pane.locator('[data-testid="sheet-item-First-Aid Kit"] button').click();
    await page.locator('[data-testid=remove-some]').click();
    await expect(pane.locator('[data-testid="sheet-item-First-Aid Kit"]')).toContainText('×1');

    // learn a spell
    await pane.locator('[data-testid=sheet-learn-spell]').click();
    await page.locator('[data-testid=sheet-learn-select]').selectOption({ label: 'Fire Bolt (Cantrip)' });
    await page.locator('.dialog', { hasText: 'Learn Spell' }).locator('[data-testid=dialog-ok]').click();
    await expect(pane.locator('[data-testid="sheet-spell-Fire Bolt"]')).toBeVisible();
    await expect.poll(async () => (await lastPut(page, HENRY))?.knownSpells).toEqual(['Fire Bolt']);
    await page.screenshot({ path: info.outputPath('sheet-pane.png'), fullPage: true });

    // rename: new file, old file deleted, party.json follows
    await pane.locator('[data-testid=sheet-name]').fill('Henry K');
    await pane.locator('[data-testid=sheet-name]').press('Tab');
    await expect(page.locator('[data-testid="sheet-row-Henry K"]')).toBeVisible();
    await expect(page.locator('[data-testid="sheet-row-Henry Keaton"]')).toHaveCount(0);
    const log = await ops(page);
    const at = log.lastIndexOf('put entities/party/Henry_K.json');
    expect(at).toBeGreaterThan(-1);
    expect(log.slice(at, at + 3)).toEqual([
      'put entities/party/Henry_K.json',
      `del ${HENRY}`,
      'put party.json',
    ]);
    expect(await lastPut(page, 'entities/party/Henry_K.json')).toMatchObject({
      name: 'Henry K',
      currentHP: 25,
    });
    const party = (await writes(page)).filter((w) => w.path === 'party.json').pop();
    expect(JSON.parse(party?.text ?? '[]')).toEqual(['Henry K', 'Dan Dixon', 'Grand Wizard Man', 'NMB-15']);
    // the pane stayed on the renamed sheet and later edits go to the new file
    await pane.locator('[data-testid=sheet-ac]').fill('15');
    await pane.locator('[data-testid=sheet-ac]').press('Tab');
    await savedSheet(page, 'Henry_K').toMatchObject({ armorClass: 15 });
    expect((await writes(page)).every((w) => w.skipped)).toBe(true);
  });

  test('new character joins the shown group; right-click moves it; double-click pins the default tab', async ({
    page,
  }) => {
    await page.click('[data-testid=group-ALPHA]');
    await expect(page.locator('[data-testid="sheet-row-Magnolia Grandiflora"]')).toBeVisible();
    await expect(page.locator('[data-testid="sheet-row-Henry Keaton"]')).toHaveCount(0);
    await page.click('[data-testid=add-character]');
    const dlg = page.locator('[data-testid=new-character]');
    await dlg.locator('[data-testid=new-char-name]').fill('Test Hero');
    await dlg.locator('[data-testid=new-char-hp]').fill('14');
    await dlg.locator('[data-testid=new-char-weapon]').selectOption({ label: 'Handaxe' });
    await dlg.locator('[data-testid=dialog-ok]').click();
    await expect(page.locator('[data-testid=sheet-name]')).toHaveValue('Test Hero');
    await expect(page.locator('[data-testid="sheet-row-Test Hero"]')).toBeVisible();
    expect(await lastPut(page, 'entities/party/Test_Hero.json')).toMatchObject({
      name: 'Test Hero',
      group: 'ALPHA',
      totalHP: 14,
      currentHP: 14,
    });
    const saved = await lastPut(page, 'entities/party/Test_Hero.json');
    expect((saved?.weapons as ({ name: string } | null)[])[0]?.name).toBe('Handaxe');

    // a duplicate is refused
    await page.click('[data-testid=add-character]');
    await page.locator('[data-testid=new-char-name]').fill('Test Hero');
    await page.locator('[data-testid=new-character] [data-testid=dialog-ok]').click();
    await expect(page.locator('.dialog h3', { hasText: 'Duplicate Name' })).toBeVisible();
    await page.locator('.dialog', { hasText: 'Duplicate Name' }).getByRole('button', { name: 'OK' }).click();
    await page.locator('[data-testid=new-character]').getByRole('button', { name: 'Cancel' }).click();

    await page.click('[data-testid="sheet-row-Test Hero"]', { button: 'right' });
    await page.click('[data-testid=move-OMEGA]');
    await expect(page.locator('[data-testid="sheet-row-Test Hero"]')).toHaveCount(0);
    await expect
      .poll(async () => (await lastPut(page, 'entities/party/Test_Hero.json'))?.group)
      .toBe('OMEGA');
    await page.click('[data-testid=group-OMEGA]');
    await expect(page.locator('[data-testid="sheet-row-Test Hero"]')).toBeVisible();
    // the open pane picked up the move
    await expect(page.locator('[data-testid=sheet-group] option:checked')).toHaveText(/Ω|Omega/);

    await page.dblclick('[data-testid=group-OMEGA]');
    await expect(page.locator('[data-testid=group-OMEGA]')).toHaveClass(/pinned/);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { dndsim: { prefs: { all: Record<string, unknown> } } }).dndsim.prefs.all[
            'characterSheets.defaultGroup'
          ],
      ),
    ).toBe('OMEGA');
  });

  test('party dialog: add, remove, and drag from Available onto Active (F-54)', async ({ page }, info) => {
    await page.click('[data-testid=open-party]');
    const dlg = page.locator('[data-testid=party-dialog]');
    const available = dlg.locator('[data-testid=party-available]');
    const active = dlg.locator('[data-testid=party-active]');
    await expect(available).toContainText('Magnolia Grandiflora');
    await dlg.locator('[data-testid="party-available-Magnolia Grandiflora"]').click();
    await dlg.locator('[data-testid=party-add]').click();
    await expect(active).toContainText('Magnolia Grandiflora');
    const partyJson = async () =>
      JSON.parse((await writes(page)).filter((w) => w.path === 'party.json').pop()?.text ?? '[]') as string[];
    expect(await partyJson()).toEqual([
      'Henry Keaton',
      'Dan Dixon',
      'Grand Wizard Man',
      'NMB-15',
      'Magnolia Grandiflora',
    ]);

    await dlg.locator('[data-testid="party-active-Henry Keaton"]').click();
    await dlg.locator('[data-testid=party-remove]').click();
    await expect(available).toContainText('Henry Keaton');
    expect(await partyJson()).toEqual(['Dan Dixon', 'Grand Wizard Man', 'NMB-15', 'Magnolia Grandiflora']);

    // drag Henry back in, in front of NMB-15
    await dlg
      .locator('[data-testid="party-available-Henry Keaton"]')
      .dragTo(dlg.locator('[data-testid="party-active-NMB-15"]'));
    await expect
      .poll(partyJson)
      .toEqual(['Dan Dixon', 'Grand Wizard Man', 'Henry Keaton', 'NMB-15', 'Magnolia Grandiflora']);
    await page.screenshot({ path: info.outputPath('party-dialog.png') });
    await dlg.locator('[data-testid=party-close]').click();
    await expect(dlg).toHaveCount(0);
  });

  test('enemies: search, tag filter, sort, create with mobility 0 (F-56), edit, delete', async ({
    page,
  }, info) => {
    await page.click('[data-testid=mode-enemies]');
    const browser = page.locator('[data-testid=enemy-browser]');
    const cards = browser.locator('.enemy-card');
    await expect(cards).toHaveCount(5);
    await expect(page.locator('[data-testid=enemy-summary]')).toContainText('5 enemies');

    await page.fill('[data-testid=enemy-search]', 'sn');
    await expect(cards).toHaveCount(1);
    await expect(browser.locator('[data-testid=enemy-card-Snake]')).toBeVisible();
    await page.fill('[data-testid=enemy-search]', '');

    await page.click('[data-testid=enemy-filter-Boss]');
    await expect(cards).toHaveCount(1);
    await page.click('[data-testid=enemy-filter-Boss]');
    // a tag filter shows one flat list, which the sort orders
    await page.click('[data-testid=enemy-filter-Beast]');
    await page.locator('[data-testid=enemy-sort]').selectOption({ label: 'HP' });
    await page.click('[data-testid=enemy-sort-dir]');
    await expect(cards.locator('strong')).toHaveText([
      'Legendary Broodmother',
      'Overgrown Hornet',
      'Spider',
      'Snake',
    ]);
    await page.click('[data-testid=enemy-filter-Beast]');
    await page.screenshot({ path: info.outputPath('enemies.png'), fullPage: true });

    await page.click('[data-testid=add-enemy]');
    const dlg = page.locator('[data-testid=enemy-editor]');
    await dlg.locator('[data-testid=enemy-name]').fill('Cave Bat');
    await dlg.locator('[data-testid=enemy-hp]').fill('9');
    await dlg.locator('[data-testid=enemy-mob]').fill('0');
    await dlg.locator('[data-testid=enemy-dex]').fill('5');
    await dlg.locator('[data-testid=enemy-tag-Beast]').click();
    await dlg.locator('[data-testid=enemy-custom-tag]').fill('Flying');
    await dlg.locator('[data-testid=enemy-add-tag]').click();
    await dlg.locator('[data-testid=dialog-ok]').click();
    const path = 'entities/enemies/Cave Bat.json';
    expect(await lastPut(page, path)).toMatchObject({
      name: 'Cave Bat',
      health: 9,
      maxHealth: 9,
      mobility: 0,
      dexterity: 5,
      tags: ['Beast', 'Flying'],
    });
    expect(((await lastPut(page, path))?.attributes as number[])[1]).toBe(5);
    expect(
      JSON.parse((await writes(page)).filter((w) => w.path === 'enemy_tags.json').pop()?.text ?? '[]'),
    ).toContain('Flying');
    const card = browser.locator('[data-testid="enemy-card-Cave Bat"]');
    await expect(card).toContainText('HP 9');
    await expect(browser.locator('[data-testid=enemy-filter-Flying]')).toBeVisible();

    await card.locator('[data-testid="enemy-edit-Cave Bat"]').click();
    await page.locator('[data-testid=enemy-hp]').fill('12');
    await page.locator('[data-testid=enemy-editor] [data-testid=dialog-ok]').click();
    await expect(card).toContainText('HP 12');
    expect(await lastPut(page, path)).toMatchObject({ maxHealth: 12, mobility: 0 });

    await card.locator('[data-testid="enemy-delete-Cave Bat"]').click();
    await page.click('[data-testid=confirm-ok]');
    await expect(card).toHaveCount(0);
    expect((await writes(page)).pop()).toMatchObject({ op: 'del', path });
  });
});

test('mid-battle: Manage → Character Sheets → edit HP → back; the unit has the new HP', async ({ page }) => {
  await page.goto('/?scenario=test&seed=1');
  await page.waitForSelector('[data-testid=phase]');
  await page.click('[data-testid=tab-manage]');
  await page.click('[data-testid=open-sheets]');
  await expect(page.locator('[data-testid=sheets-screen]')).toBeVisible();
  await page.click('[data-testid=group-ALL]');
  await page.click('[data-testid="sheet-row-Dan Dixon"]');
  await page.locator('[data-testid=sheet-hp]').fill('7');
  await page.locator('[data-testid=sheet-hp]').press('Tab');
  await page.click('[data-testid=editor-back]');
  await expect(page.locator('[data-testid=phase]')).toBeVisible();
  const dan = (await battle(page)).units.find((u) => u.kind === 'entity' && u.sheet?.name === 'Dan Dixon');
  expect(dan?.sheet?.currentHP).toBe(7);
  expect(await lastPut(page, 'entities/party/Dan_Dixon.json')).toMatchObject({ currentHP: 7 });
});
