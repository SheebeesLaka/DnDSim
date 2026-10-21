/**
 * docs/RULES.md (the in-app Rules screen) quotes exact numbers. Its tables are
 * checked against the engine here, so a rule change that forgets the doc fails.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attackTier, saveFailTier, weaponDamageBonus } from '../../src/engine/rules/combat.ts';
import { maxSlotsForLevel } from '../../src/engine/rules/spellSlots.ts';
import { entityMovement } from '../../src/engine/selectors/stats.ts';
import type { EntityUnit } from '../../src/engine/types.ts';
import { parseBlocks, splitParts, type Block } from '../../src/ui/markdown.ts';
import { ctx, fresh, run, unitNamed } from '../helpers/engine.ts';

const md = readFileSync('docs/RULES.md', 'utf8');
const tables = parseBlocks(md).filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table');
const table = (firstHeader: string) => {
  const t = tables.find((x) => x.head[0] === firstHeader);
  if (!t) throw new Error(`RULES.md has no table headed "${firstHeader}"`);
  return t;
};
const num = (s: string) => Number(s.replace(/−/g, '-'));

/** "−2 to 0", "1–2", "8 or more", "−3 or less", "below 0", "7" → the values it covers (open ends: 3 more). */
function range(cell: string): number[] {
  const c = cell.replace(/−/g, '-').trim();
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  let m = /^(-?\d+)\s*(?:to|–)\s*(-?\d+)$/.exec(c);
  if (m) return span(num(m[1] ?? ''), num(m[2] ?? ''));
  m = /^(-?\d+) or more$/.exec(c);
  if (m) return span(num(m[1] ?? ''), num(m[1] ?? '') + 3);
  m = /^(-?\d+) or less$/.exec(c);
  if (m) return span(num(m[1] ?? '') - 3, num(m[1] ?? ''));
  m = /^below (-?\d+)$/.exec(c);
  if (m) return span(num(m[1] ?? '') - 3, num(m[1] ?? '') - 1);
  if (/^-?\d+$/.test(c)) return [num(c)];
  throw new Error(`unreadable range "${cell}"`);
}

describe('docs/RULES.md matches the engine', () => {
  it('has a Players part and a DM part', () => {
    expect(splitParts(md).parts.map((p) => p.title)).toEqual(['Players', 'DM']);
  });

  it('MOB by DEX', () => {
    const c = ctx();
    const state = run(fresh({ partyList: [] }).state, c, {
      type: 'PLACE_ENTITY',
      name: 'Henry Keaton',
      r: 0,
      c: 0,
    });
    const henry = structuredClone(unitNamed(state, 'Henry Keaton')) as EntityUnit;
    henry.sheet.weapons = [null, null];
    henry.sheet.accessories = [null, null, null];
    henry.sheet.status = [];
    henry.statAdjustment = [0, 0, 0, 0, 0, 0];
    const t = table('DEX');
    const mob = t.rows[0] ?? [];
    t.head.slice(1).forEach((cell, i) => {
      for (const dex of range(cell)) {
        henry.sheet.baseAttributes[1] = dex;
        expect(entityMovement(henry), `DEX ${dex}`).toBe(num(mob[i + 1] ?? ''));
      }
    });
  });

  it('weapon bonus by attack modifier', () => {
    const t = table('Attack modifier');
    const bonus = t.rows[0] ?? [];
    t.head.slice(1).forEach((cell, i) => {
      for (const mod of range(cell))
        expect(weaponDamageBonus(mod), `mod ${mod}`).toBe(num(bonus[i + 1] ?? ''));
    });
  });

  it('attack tiers by margin', () => {
    for (const [cell, result] of table('Margin').rows) {
      const tier = result === 'miss' ? 0 : num((result ?? '').replace('tier ', ''));
      for (const margin of range(cell ?? '')) expect(attackTier(margin), `margin ${margin}`).toBe(tier);
    }
  });

  it('failed-save tiers', () => {
    const t = table('Save failed by (DC − total)');
    const tiers = t.rows[0] ?? [];
    t.head.slice(1).forEach((cell, i) => {
      for (const by of range(cell))
        expect(saveFailTier(15, 15 - by), `failed by ${by}`).toBe(num(tiers[i + 1] ?? ''));
    });
    expect(saveFailTier(15, 15)).toBe(0); // total ≥ DC saves
  });

  it('spell slots', () => {
    const t = table('Level');
    expect(t.rows.flatMap((r) => range(r[0] ?? ''))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const row of t.rows)
      for (const level of range(row[0] ?? ''))
        for (let spell = 1; spell <= 9; spell++)
          expect(maxSlotsForLevel(level, spell), `level ${level}, spell level ${spell}`).toBe(
            row[spell] ? num(row[spell] ?? '') : 0,
          );
  });
});
