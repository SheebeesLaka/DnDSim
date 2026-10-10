/**
 * Which party sheets the app should write back to saves/entities/party.
 * Java saves eagerly on every mutation; the port's app layer writes these
 * snapshots debounced and atomically after each command instead (R15.2).
 */
import type { CharSheetDef } from '../../assets/types.ts';
import type { BattleState } from '../types.ts';

export function partySheetsToPersist(state: BattleState): Record<string, CharSheetDef> {
  const out: Record<string, CharSheetDef> = {};
  for (const g of state.graveyard) if (g.sheet.isParty) out[g.sourceName] = g.sheet;
  for (const u of state.units) if (u.kind === 'entity' && u.sheet.isParty) out[u.sourceName] = u.sheet;
  return out;
}
