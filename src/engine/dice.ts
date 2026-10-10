/** Die-string helpers mirroring DiceRollPanel and BattleView.DICE_PROGRESSION. */

export const DICE_PROGRESSION = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;

/** DiceRollPanel.getMaxValue: any string other than d4..d20 counts as a d6 (F-31). */
export function dieMax(die: string | null | undefined): number {
  switch ((die ?? '').toLowerCase()) {
    case 'd4':
      return 4;
    case 'd6':
      return 6;
    case 'd8':
      return 8;
    case 'd10':
      return 10;
    case 'd12':
      return 12;
    case 'd20':
      return 20;
    default:
      return 6;
  }
}

/** BattleView.diceIndex: unknown (incl. null) → 0, i.e. d4 (F-27). */
export function diceIndex(die: string | null | undefined): number {
  const i = (DICE_PROGRESSION as readonly string[]).indexOf(die ?? '');
  return i < 0 ? 0 : i;
}

/** BattleView.cycleDie: one step along the progression, clamped. */
export function cycleDie(die: string | null | undefined, direction: number): string {
  const i = Math.max(0, Math.min(DICE_PROGRESSION.length - 1, diceIndex(die) + direction));
  return DICE_PROGRESSION[i] as string;
}

/** CombatManager.formatDiceList: "2d6 + d10"; empty → "0". */
export function formatDiceList(dice: readonly string[]): string {
  if (dice.length === 0) return '0';
  const counts = new Map<string, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()].map(([d, n]) => (n > 1 ? `${n}${d}` : d)).join(' + ');
}
