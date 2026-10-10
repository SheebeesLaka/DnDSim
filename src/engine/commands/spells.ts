/** CAST_SPELL: picker validation, self-resolve, single-target and area flows (R7.2–R7.10). */
import { err } from '../errors.ts';
import { isAreaSpell, isSelfCenteredArea, spellDamageBonus, spellDice } from '../rules/combat.ts';
import { lowestAvailableSlot, MAX_SPELL_LEVEL, spellSlotsRemaining } from '../rules/spellSlots.ts';
import { areaCells, areaTargets, isAimValid, isInRange, isValidSpellTarget } from '../rules/targeting.ts';
import { combatantById, inBounds, unitById } from '../selectors/board.ts';
import {
  armorClass,
  casterLevel,
  castingModifier,
  isCaster,
  saveModifier,
  spellAttackModifier,
  spellSaveDC,
  spellStatIndex,
} from '../selectors/stats.ts';
import type { SpellDef } from '../../assets/types.ts';
import type { AreaFlow, Cell, Combatant, EngineAssets, EntityUnit, Pending, SpellFlow } from '../types.ts';
import { resolveAreaOutcome, resolveSpellOutcome } from '../rules/resolve.ts';
import { type HandlerMap } from './_shared.ts';

/** SpellPickerDialog.castableSpells: known spells that are cantrips or have a slot ≥ their level (F-33: no isCaster check). */
export function castableSpells(e: EntityUnit, assets: EngineAssets): SpellDef[] {
  const out: SpellDef[] = [];
  for (const name of e.sheet.knownSpells) {
    const s = assets.spells[name];
    if (s && lowestAvailableSlot(e.sheet, s.level) >= 0) out.push(s);
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export const spellHandlers: HandlerMap = {
  CAST_SPELL(draft, cmd, ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const caster = combatantById(draft, cmd.casterId);
    if (!caster || caster.kind !== 'entity' || !caster.sheet.isParty)
      return err('notParty', 'only party members cast');
    if (!isCaster(caster.sheet) || caster.sheet.knownSpells.length === 0) {
      emit({
        type: 'alert',
        level: 'info',
        title: 'No Spells',
        message: `${caster.sheet.name} has no spellcasting stat or known spells.\nSet them up on the character sheet.`,
      });
      return err('noSpells', 'not a caster');
    }
    const spell = ctx.assets.spells[cmd.spellName];
    if (!spell || !caster.sheet.knownSpells.includes(spell.name))
      return err('unknownSpell', `${cmd.spellName} is not known`);
    const slot = Math.trunc(cmd.slotLevel);
    if (
      spell.level === 0
        ? slot !== 0
        : slot < spell.level || slot > MAX_SPELL_LEVEL || spellSlotsRemaining(caster.sheet, slot) <= 0
    ) {
      return err(
        'noSlot',
        spell.level === 0 ? 'cantrips are cast with slot 0' : `no level ${slot} slot for ${spell.name}`,
      );
    }
    const common = {
      casterId: caster.id,
      spell,
      slotLevel: slot,
      casterLevel: casterLevel(caster),
      damageBonus: spellDamageBonus(spell, castingModifier(caster)),
    };

    if (isAreaSpell(spell)) {
      const aim: Cell | undefined = isSelfCenteredArea(spell) ? { r: caster.r, c: caster.c } : cmd.aim;
      if (!aim) return err('needAim', 'area spells need an aim cell');
      if (!isAimValid(draft, spell, caster, aim)) {
        if (inBounds(draft, aim.r, aim.c) && (aim.r !== caster.r || aim.c !== caster.c))
          emit({ type: 'floatText', cell: aim, text: 'Out of range', color: '#b8b8c0', kind: 'OTHER' });
        return err('badAim', 'invalid aim');
      }
      const cells = areaCells(draft, spell, caster, aim);
      const targets = areaTargets(draft, spell, caster, cells);
      if (targets.length === 0) {
        emit({ type: 'floatText', cell: aim, text: 'No targets', color: '#b8b8c0', kind: 'OTHER' });
        return err('noTargets', 'nobody in the area (slot kept)');
      }
      const flow: AreaFlow = { flow: 'area', ...common, cells, targetIds: targets.map((t) => t.id) };
      if (spell.resolution === 'BUFF') {
        resolveAreaOutcome(
          draft,
          flow,
          targets.map(() => ({ tier: 1, damage: 0, saved: false, crit: false, applyRider: true })),
          ctx,
          emit,
        );
        return undefined;
      }
      if (spell.resolution === 'ATTACK' || spell.resolution === 'SAVE') {
        const save = spell.resolution === 'SAVE';
        if (save) flow.saveDC = spellSaveDC(caster);
        else flow.attackMod = spellAttackModifier(caster);
        draft.pending = {
          kind: 'areaD20s',
          flow,
          prompt: save ? "Each target's d20 save:" : 'Attack d20 per target:',
        };
        return undefined;
      }
      const tier = spell.resolution === 'HEAL' ? 1 : 3;
      draft.pending = {
        kind: 'damage',
        flow,
        dice: spellDice(spell, tier, common.casterLevel, slot),
        prompt: spell.resolution === 'HEAL' ? 'Enter heal rolls (shared):' : 'Enter damage rolls (shared):',
        tier,
        saved: false,
        halve: false,
        area: {
          tiers: targets.map(() => tier),
          saved: targets.map(() => false),
          half: targets.map(() => false),
          crit: targets.map(() => false),
          maxTier: tier,
        },
      };
      return undefined;
    }

    // single target
    let target: ReturnType<typeof unitById>;
    const selfResolve =
      spell.targetType === 'SELF' || (spell.range === 0 && draft.rules.compat.rangeZeroResolvesOnCaster);
    if (selfResolve) target = caster;
    else {
      if (!cmd.targetId) return err('needTarget', 'pick a target');
      target = unitById(draft, cmd.targetId);
      if (!isValidSpellTarget(caster, target ?? null, spell) || !target)
        return err('invalidTarget', 'not a legal target for this spell');
      if (!isInRange(caster, target, spell.range)) {
        emit({
          type: 'floatText',
          cell: { r: target.r, c: target.c },
          text: 'Out of range',
          color: '#b8b8c0',
          kind: 'OTHER',
        });
        return err('outOfRange', 'target out of range');
      }
    }
    const flow: SpellFlow = { flow: 'spell', ...common, targetId: target.id };
    const pending = startSingleTarget(flow, spell, caster, target);
    if (pending === null) {
      // BUFF: no roll, the rider simply lands
      resolveSpellOutcome(
        draft,
        flow,
        { hit: true, tier: 1, total: 0, d20: 0, saved: false, applyRider: true },
        ctx,
        emit,
      );
      return undefined;
    }
    draft.pending = pending;
    return undefined;
  },
};

function startSingleTarget(
  flow: SpellFlow,
  spell: SpellDef,
  caster: Combatant,
  target: NonNullable<ReturnType<typeof unitById>>,
): Pending | null {
  switch (spell.resolution) {
    case 'SAVE': {
      const targetMod =
        target.kind === 'entity' || target.kind === 'enemy'
          ? saveModifier(target, spellStatIndex(spell.saveStat))
          : 0;
      flow.saveDC = spellSaveDC(caster);
      flow.saveMod = targetMod;
      return { kind: 'd20', flow, prompt: "Enter target's d20 save:" };
    }
    case 'AUTO':
      return {
        kind: 'damage',
        flow,
        dice: spellDice(spell, 3, flow.casterLevel, flow.slotLevel),
        prompt: 'Enter damage rolls:',
        tier: 3,
        saved: false,
        halve: false,
      };
    case 'HEAL':
      return {
        kind: 'damage',
        flow,
        dice: spellDice(spell, 1, flow.casterLevel, flow.slotLevel),
        prompt: 'Enter heal rolls:',
        tier: 1,
        saved: false,
        halve: false,
      };
    case 'BUFF':
      return null;
    case 'ATTACK': {
      flow.attackMod = spellAttackModifier(caster);
      flow.targetAC = target.kind === 'terrain' ? 10 : target.kind === 'pickup' ? 10 : armorClass(target);
      return { kind: 'd20', flow, prompt: 'Enter spell attack d20:' };
    }
  }
}
