import type { Page } from '@playwright/test';

export async function clickCell(page: Page, r: number, c: number): Promise<void> {
  const pt = await page.evaluate(
    (cell) =>
      (
        window as unknown as {
          dndsim: { renderer: { cellCenter: (cell: { r: number; c: number }) => { x: number; y: number } } };
        }
      ).dndsim.renderer.cellCenter(cell),
    { r, c },
  );
  await page.mouse.click(pt.x, pt.y);
}

export const battle = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { dndsim: { store: { battle: unknown } } }).dndsim.store.battle,
  ) as Promise<
    Record<string, never> & {
      units: {
        id: string;
        kind: string;
        r: number;
        c: number;
        name?: string;
        health?: number;
        acAdjustment: number;
        sheet?: { currentHP: number; name: string };
      }[];
      turn: { started: boolean; round: number; order: string[]; currentIndex: number };
      pending: { kind: string } | null;
    }
  >;

/** Types a string of digits the way the DM does: straight onto the page, no field focused. */
export async function typeDigits(page: Page, digits: string): Promise<void> {
  for (const d of digits) await page.keyboard.press(d);
}

/**
 * The test scenario: Begin, type a distinct d20 for each party member (the cards
 * auto-advance once a value can't take another digit), Enter.
 */
export async function beginTestBattle(page: Page, url = '/?scenario=test&seed=1'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('[data-testid=begin]');
  await page.click('[data-testid=begin]');
  await page.waitForSelector('[data-testid=initiative-sheet]');
  const party = await page.evaluate(
    () =>
      (window as unknown as { dndsim: { store: { battle: { pending: { party: string[] } } } } }).dndsim.store
        .battle.pending.party.length,
  );
  for (let i = 0; i < party; i++) await typeDigits(page, String(20 - i));
  await page.keyboard.press('Enter');
  // initiative totals add DEX, so distinct d20s can still tie: leave those for later (Esc)
  for (let i = 0; i < 4 && (await page.locator('[data-testid=tie-sheet]').count()) > 0; i++)
    await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      (window as unknown as { dndsim: { store: { battle: { turn: { started: boolean } } } } }).dndsim.store
        .battle.turn.started,
  );
}
