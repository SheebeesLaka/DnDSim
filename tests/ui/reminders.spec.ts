import { describe, expect, it } from 'vitest';
import type { Arrival, DmTimer } from '../../src/engine/types.ts';
import { dueReminders } from '../../src/ui/battle/reminders.ts';

const arrival = (id: string, round: number): Arrival => ({ id, templateStem: 'Goblin', count: 2, round });
const timer = (id: string, round: number): DmTimer => ({ id, name: 'Lights out', round });
const ids = (d: { arrivals: { id: string }[]; timers: { id: string }[] }) => [
  ...d.arrivals.map((a) => a.id),
  ...d.timers.map((t) => t.id),
];

describe('reinforcement and timer prompts', () => {
  const turn = (round: number) => ({
    started: true,
    round,
    arrivals: [arrival('a2', 2), arrival('a4', 4)],
    timers: [timer('t3', 3)],
  });

  it('asks about what is due by this round, nothing earlier', () => {
    expect(ids(dueReminders(turn(1), new Map()))).toEqual([]);
    expect(ids(dueReminders(turn(2), new Map()))).toEqual(['a2']);
    expect(ids(dueReminders(turn(3), new Map()))).toEqual(['a2', 't3']);
  });

  it('asks once per round: a second check in the same round finds nothing new', () => {
    const asked = new Map([['a2', 2]]);
    expect(ids(dueReminders(turn(2), asked))).toEqual([]);
  });

  it('"Later" leaves it queued, so the next round asks again', () => {
    // asked in round 2, the DM chose Later (still in the list): round 3 asks again
    const asked = new Map([['a2', 2]]);
    expect(ids(dueReminders(turn(3), asked))).toEqual(['a2', 't3']);
  });

  it('one queued for the current round is asked about at once', () => {
    const t = { ...turn(4), arrivals: [arrival('now', 4)], timers: [] };
    expect(ids(dueReminders(t, new Map()))).toEqual(['now']);
  });

  it('asks nothing before the battle has begun', () => {
    expect(ids(dueReminders({ ...turn(3), started: false }, new Map()))).toEqual([]);
  });
});
