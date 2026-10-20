import { expect, test, type Page } from '@playwright/test';
import { battle, beginTestBattle } from './helpers.ts';

type Dndsim = {
  dndsim: { store: { dispatch: (cmd: unknown) => { ok: boolean; error?: { message: string } } } };
};
/** Dispatch a command; 'ok' or the engine's refusal message. */
const dispatch = (page: Page, cmd: unknown) =>
  page.evaluate((c) => {
    const res = (window as unknown as Dndsim).dndsim.store.dispatch(c);
    return res.ok ? 'ok' : (res.error?.message ?? 'refused');
  }, cmd);

/** End turns until the round number goes up (keeping the rolled order when a tie comes up, like Esc). */
async function nextRound(page: Page): Promise<void> {
  const start = (await battle(page)).turn.round;
  for (let i = 0; i < 40 && (await battle(page)).turn.round === start; i++) {
    if ((await battle(page)).pending?.kind === 'tieOrder') await dispatch(page, { type: 'DISMISS_TIES' });
    expect(await dispatch(page, { type: 'NEXT_TURN' })).toBe('ok');
  }
  expect((await battle(page)).turn.round).toBe(start + 1);
}

test('reinforcements: one due now is asked at once; "Later" asks again next round', async ({ page }) => {
  await beginTestBattle(page);
  const round = (await battle(page)).turn.round;
  const toast = (count: number) => page.locator('[data-testid=toast]', { hasText: `×${count} arrive` });

  // queued for the round already under way: the DM is asked straight away
  await dispatch(page, { type: 'ADD_ARRIVAL', templateStem: 'Spider', count: 3, round });
  await expect(toast(3)).toHaveCount(1);
  await toast(3).getByRole('button', { name: 'Cancel them' }).click();
  await expect(toast(3)).toHaveCount(0);

  // queued for next round: nothing yet, then asked when it comes
  await dispatch(page, { type: 'ADD_ARRIVAL', templateStem: 'Spider', count: 2, round: round + 1 });
  await expect(toast(2)).toHaveCount(0);
  await nextRound(page);
  await expect(toast(2)).toHaveCount(1);

  // Later keeps them queued and the next round start asks again
  await toast(2).getByRole('button', { name: 'Later' }).click();
  await expect(toast(2)).toHaveCount(0);
  await nextRound(page);
  await expect(toast(2)).toHaveCount(1);
});
