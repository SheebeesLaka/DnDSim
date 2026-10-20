/**
 * Which reinforcement arrivals and DM timers to ask about now. Anything due
 * (its round has come) is asked about once per round until the DM acts on it:
 * "Later" leaves it queued, so the next round start asks again, and one
 * queued for the current round is asked about as soon as it is added.
 */
import type { Arrival, DmTimer, TurnState } from '../../engine/types.ts';

export interface DueReminders {
  arrivals: Arrival[];
  timers: DmTimer[];
}

/** `asked` maps an arrival/timer id to the round it was last asked about. */
export function dueReminders(
  turn: Pick<TurnState, 'started' | 'round' | 'arrivals' | 'timers'>,
  asked: ReadonlyMap<string, number>,
): DueReminders {
  if (!turn.started) return { arrivals: [], timers: [] };
  const due = <T extends { id: string; round: number }>(list: readonly T[] | undefined): T[] =>
    (list ?? []).filter((x) => x.round <= turn.round && asked.get(x.id) !== turn.round);
  return { arrivals: due(turn.arrivals), timers: due(turn.timers) };
}
