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
        sheet?: { currentHP: number; name: string };
      }[];
      turn: { started: boolean; round: number; order: string[] };
      pending: unknown;
    }
  >;

export async function beginTestBattle(page: Page): Promise<void> {
  await page.goto('/?scenario=test&seed=1');
  await page.waitForSelector('[data-testid=phase]');
  await page.click('[data-testid=begin-btn]');
  await page.waitForSelector('[data-testid=init-begin]');
  await page.click('[data-testid=init-begin]');
  await page.waitForFunction(() => document.querySelector('[data-testid=phase]')?.textContent === 'Round 1');
}
