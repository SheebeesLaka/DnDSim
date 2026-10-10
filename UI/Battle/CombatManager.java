package UI.Battle;

import EntityRes.Ammunition;
import EntityRes.Item;
import EntityRes.Spell;
import EntityRes.Status;
import EntityRes.Weapon;
import Objects.Entity;
import Objects.Enemy;
import Objects.GridObject;
import Objects.TerrainObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Manages combat calculations for the margin-based attack tier system.
 * 
 * Attack Flow:
 * 1. Attacker rolls d20
 * 2. Calculate margin = (d20 + stat modifier) - target AC
 * 3. If margin < 0, attack misses (margin == 0 still hits, since meeting AC exactly succeeds)
 * 4. Otherwise, determine tier: 1-4 = tier 1, 5-7 = tier 2, 8+ = tier 3
 * 5. Roll damage dice based on tier (cumulative: tier 2 includes tier 1 dice, etc.)
 */
public class CombatManager {

    /**
     * Calculate margin from attack roll
     * @return margin value (negative = miss, 0 or positive = hit)
     */
    public static int calculateMargin(int d20Roll, int statModifier, int targetAC) {
        return (d20Roll + statModifier) - targetAC;
    }
    
    /**
     * Determine attack tier from margin
     * @return 0 = miss, 1-3 = hit tier
     */
    public static int getAttackTier(int margin) {
        if (margin < 0) return 0;
        if (margin <= 4) return 1;
        if (margin <= 7) return 2;
        return 3;
    }
    
    /**
     * Get list of dice to roll for a given tier and weapon dice configuration.
     * Tiers are cumulative: tier 2 includes tier 1 dice, tier 3 includes tier 1 & 2.
     * 
     * @param weaponDice Array of 3 dice strings [tier1, tier2, tier3]
     * @param tier Attack tier (1, 2, or 3)
     * @return List of dice strings to roll
     */
    public static List<String> getDiceForTier(String[] weaponDice, int tier) {
        List<String> dice = new ArrayList<>();
        if (weaponDice == null || weaponDice.length < 3) {
            weaponDice = new String[]{"d4", "d4", "d6"}; // Default
        }
        
        if (tier >= 1 && weaponDice[0] != null) {
            dice.add(weaponDice[0]);
        }
        if (tier >= 2 && weaponDice[1] != null) {
            dice.add(weaponDice[1]);
        }
        if (tier >= 3 && weaponDice[2] != null) {
            dice.add(weaponDice[2]);
        }
        
        return dice;
    }
    
    /**
     * Format dice list for display (e.g., "2d6 + 1d10")
     */
    public static String formatDiceList(List<String> dice) {
        if (dice == null || dice.isEmpty()) return "0";
        
        // Count occurrences of each die type
        java.util.Map<String, Integer> diceCounts = new java.util.LinkedHashMap<>();
        for (String die : dice) {
            diceCounts.merge(die, 1, Integer::sum);
        }
        
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (var entry : diceCounts.entrySet()) {
            if (!first) sb.append(" + ");
            if (entry.getValue() > 1) {
                sb.append(entry.getValue());
            }
            sb.append(entry.getKey());
            first = false;
        }
        
        return sb.toString();
    }
    
    /**
     * Get attack modifier for an attacker (Entity or Enemy)
     */
    public static int getAttackModifier(GridObject attacker) {
        if (attacker instanceof Entity e) {
            return e.getAttackModifier();
        } else if (attacker instanceof Enemy en) {
            return en.getAttackModifier();
        }
        return 0;
    }
    
    /**
     * Get AC for a target (Entity, Enemy, or Terrain)
     */
    public static int getTargetAC(GridObject target) {
        if (target instanceof Entity e) {
            return e.getAC();
        } else if (target instanceof Enemy en) {
            return en.getAC();
        } else if (target instanceof TerrainObject) {
            return 10; // Stationary object - flat AC
        }
        return 10; // Default AC
    }
    
    /**
     * Get damage dice for an attacker
     */
    public static String[] getDamageDice(GridObject attacker) {
        if (attacker instanceof Entity e) {
            return e.getDamageDice();
        } else if (attacker instanceof Enemy en) {
            return en.getDamageDice();
        }
        return new String[]{"d4", "d4", "d6"};
    }
    
    /**
     * Get name of attacker for display
     */
    public static String getAttackerName(GridObject attacker) {
        if (attacker instanceof Entity e) {
            return e.getName();
        } else if (attacker instanceof Enemy en) {
            return en.getName();
        }
        return "Unknown";
    }
    
    /**
     * Get name of target for display
     */
    public static String getTargetName(GridObject target) {
        if (target instanceof Entity e) {
            return e.getName();
        } else if (target instanceof Enemy en) {
            return en.getName();
        } else if (target instanceof TerrainObject t) {
            return t.getType();
        }
        return "Unknown";
    }
    
    /**
     * Apply damage to target
     */
    public static void applyDamage(GridObject target, int damage) {
        if (target instanceof Entity e) {
            e.takeDamage(damage);
        } else if (target instanceof Enemy en) {
            en.takeDamage(damage);
        } else if (target instanceof TerrainObject t) {
            t.takeDamage(damage);
        }
    }
    
    /**
     * Check if target is dead
     */
    public static boolean isTargetDead(GridObject target) {
        if (target instanceof Entity e) {
            return e.isDead();
        } else if (target instanceof Enemy en) {
            return en.isDead();
        } else if (target instanceof TerrainObject t) {
            return t.isDestroyed();
        }
        return false;
    }
    
    /**
     * Get current health of target
     */
    public static int getTargetHealth(GridObject target) {
        if (target instanceof Entity e) {
            return e.getHealth();
        } else if (target instanceof Enemy en) {
            return en.getHealth();
        } else if (target instanceof TerrainObject t) {
            return t.getHealth();
        }
        return 0;
    }
    
    /**
     * Get max health of target
     */
    public static int getTargetMaxHealth(GridObject target) {
        if (target instanceof Entity e) {
            return e.getCharSheet().getTotalHP();
        } else if (target instanceof Enemy en) {
            return en.getMaxHealth();
        }
        return 1;
    }
    
    /**
     * Get stat type name for display
     */
    public static String getStatTypeName(GridObject attacker) {
        if (attacker instanceof Entity e) {
            var weapon = e.getCharSheet().getEquippedWeapon();
            if (weapon != null) {
                return weapon.getStatType();
            }
        }
        return "STRENGTH";
    }
    
    /**
     * Consume ammunition for a ranged weapon attack.
     * @param attacker The attacking entity
     * @return The name of the ammo consumed, or null if no ammo needed/consumed
     */
    public static String consumeAmmo(GridObject attacker) {
        if (!(attacker instanceof Entity e)) {
            return null; // Enemies don't use ammo
        }
        
        Weapon weapon = e.getCharSheet().getEquippedWeapon();
        if (weapon == null || !weapon.isRanged()) {
            return null; // No weapon or melee weapon
        }
        
        // Find compatible ammunition in inventory
        for (Item item : e.getCharSheet().getInventory()) {
            if (item instanceof Ammunition ammo) {
                if (ammo.getQuantity() > 0 && ammo.isCompatibleWith(weapon)) {
                    // Found compatible ammo - consume 1
                    e.getCharSheet().removeItemQuantity(ammo, 1);
                    return ammo.getName();
                }
            }
        }
        
        return null; // No compatible ammo found
    }
    
    /**
     * Check if attacker has ammo for their ranged weapon.
     * @return true if weapon is melee OR has compatible ammo, false if ranged with no ammo
     */
    public static boolean hasAmmoForWeapon(GridObject attacker) {
        if (!(attacker instanceof Entity e)) {
            return true; // Enemies always have ammo
        }
        
        Weapon weapon = e.getCharSheet().getEquippedWeapon();
        if (weapon == null || !weapon.isRanged()) {
            return true; // No weapon or melee weapon doesn't need ammo
        }
        
        // Check for compatible ammunition
        for (Item item : e.getCharSheet().getInventory()) {
            if (item instanceof Ammunition ammo) {
                if (ammo.getQuantity() > 0 && ammo.isCompatibleWith(weapon)) {
                    return true;
                }
            }
        }
        
        return false; // No compatible ammo found
    }

    // ===================== Spellcasting =====================

    /** Saving throw modifier for any target; terrain has no saves. */
    public static int getSaveModifier(GridObject target, int statIndex) {
        if (target instanceof Entity e) {
            return e.getSaveModifier(statIndex);
        } else if (target instanceof Enemy en) {
            return en.getSaveModifier(statIndex);
        }
        return 0;
    }

    /**
     * Tier for a saving throw. Meeting the DC is a success (0). Otherwise the fail margin is
     * DC - total - 1, so failing by exactly 1 mirrors an attack that meets AC exactly (margin 0, tier 1).
     */
    public static int getSaveFailTier(int dc, int saveTotal) {
        if (saveTotal >= dc) return 0;
        return getAttackTier(dc - saveTotal - 1);
    }

    /**
     * Dice for a spell at the given tier: cumulative tier dice, plus one extra tier-1 die per
     * cantrip scaling level reached, plus one upcast die per slot level above the spell's base level.
     */
    public static List<String> getSpellDice(Spell spell, int tier, int casterLevel, int slotLevel) {
        List<String> dice = new ArrayList<>();
        String[] tierDice = spell.getDamageDice();
        for (int i = 0; i < Math.min(tier, 3); i++) {
            if (tierDice != null && i < tierDice.length && tierDice[i] != null && !tierDice[i].isEmpty()) {
                dice.add(tierDice[i]);
            }
        }
        if (dice.isEmpty() || tier < 1) {
            return dice;
        }
        if (spell.isCantrip()) {
            for (int lvl : Spell.CANTRIP_SCALING_LEVELS) {
                if (casterLevel >= lvl) dice.add(dice.get(0));
            }
        } else if (spell.getUpcastDie() != null && !spell.getUpcastDie().isEmpty()) {
            for (int i = spell.getLevel(); i < slotLevel; i++) {
                dice.add(spell.getUpcastDie());
            }
        }
        return dice;
    }

    /** Number of tier dice (ignoring blanks) that a hit of the given tier rolls. */
    private static int tierDieCount(Spell spell, int tier) {
        int n = 0;
        String[] tierDice = spell.getDamageDice();
        for (int i = 0; i < Math.min(tier, 3); i++) {
            if (tierDice != null && i < tierDice.length && tierDice[i] != null && !tierDice[i].isEmpty()) n++;
        }
        return n;
    }

    /**
     * Area spells roll their dice once, at the highest tier any target needs. Because tiers are
     * cumulative, a lower-tier target takes the first few tier dice plus the shared extra dice
     * (cantrip scaling / upcast), which getSpellDice always appends after the tier dice.
     *
     * @param rolled values for getSpellDice(spell, maxTier, ...), in that order
     */
    public static int sumRolledForTier(Spell spell, List<Integer> rolled, int maxTier, int tier) {
        int own = tierDieCount(spell, tier);
        if (own == 0 || tier < 1) return 0;
        int shared = tierDieCount(spell, maxTier);
        int sum = 0;
        for (int i = 0; i < own && i < rolled.size(); i++) sum += rolled.get(i);
        for (int i = shared; i < rolled.size(); i++) sum += rolled.get(i);
        return sum;
    }

    public static int gridDistance(GridObject a, GridObject b) {
        return Math.abs(a.getRow() - b.getRow()) + Math.abs(a.getCol() - b.getCol());
    }

    public static boolean isInRange(GridObject caster, GridObject target, int range) {
        if (caster == target) return true;
        return gridDistance(caster, target) <= Math.max(1, range);
    }

    /** Hostility is side-based: enemies vs everyone else (party and non-party entities). */
    public static boolean isHostile(GridObject a, GridObject b) {
        return (a instanceof Enemy) != (b instanceof Enemy);
    }

    /** Whether the spell's target type allows this target (range not considered). */
    public static boolean isValidSpellTarget(GridObject caster, GridObject target, Spell spell) {
        if (target == null) return false;
        String type = spell.getTargetType();
        if (Spell.TARGET_SELF.equals(type)) {
            return target == caster;
        }
        if (target instanceof TerrainObject) {
            // Only damaging attack spells can hit objects (e.g. Fire Bolt on a tree)
            return (Spell.ATTACK.equals(spell.getResolution()) || Spell.AUTO.equals(spell.getResolution()))
                && !Spell.TARGET_ALLY.equals(type);
        }
        if (!(target instanceof Entity) && !(target instanceof Enemy)) return false;
        if (Spell.TARGET_ANY.equals(type)) return true;
        boolean hostile = isHostile(caster, target);
        if (Spell.TARGET_ALLY.equals(type)) return !hostile;
        return hostile && target != caster;
    }

    /** Heal a target, capped at max HP. Returns the HP actually restored. */
    public static int applyHealing(GridObject target, int amount) {
        if (target instanceof Entity e) {
            var sheet = e.getCharSheet();
            int before = sheet.getCurrentHP();
            sheet.setCurrentHP(Math.min(sheet.getTotalHP(), before + amount));
            sheet.save();
            return sheet.getCurrentHP() - before;
        } else if (target instanceof Enemy en) {
            int before = en.getHealth();
            en.setHealth(before + amount);
            return en.getHealth() - before;
        }
        return 0;
    }

    /** Apply a status to an Entity or Enemy (terrain ignores statuses). */
    public static boolean applyStatus(GridObject target, Status status) {
        if (status == null) return false;
        // Re-applying a status of the same name refreshes its duration instead of stacking
        Iterable<Status> existing = target instanceof Entity e0 ? java.util.Arrays.asList(e0.getCharSheet().getStatus())
                : target instanceof Enemy en0 ? en0.getStatuses() : null;
        if (existing != null) {
            for (Status s : existing) {
                if (s.getName() != null && s.getName().equals(status.getName())) {
                    if (s.getDuration() != -1) {
                        s.setDuration(status.getDuration() == -1 ? -1 : Math.max(s.getDuration(), status.getDuration()));
                    }
                    if (target instanceof Entity e1) e1.getCharSheet().save();
                    return true;
                }
            }
        }
        if (target instanceof Entity e) {
            e.getCharSheet().addStatus(status);
            e.getCharSheet().updateAttributes();
            e.getCharSheet().save();
            return true;
        } else if (target instanceof Enemy en) {
            en.addStatus(status);
            return true;
        }
        return false;
    }

    /** Spell attack modifier for a caster (casting stat + attack statuses). */
    public static int getSpellAttackModifier(GridObject caster) {
        if (caster instanceof Entity e) {
            return e.getSpellAttackModifier();
        }
        return getAttackModifier(caster);
    }

    public static int getSpellSaveDC(GridObject caster) {
        if (caster instanceof Entity e) {
            return e.getSpellSaveDC();
        }
        return EntityRes.CharSheet.SPELL_DC_BASE + getAttackModifier(caster);
    }

    public static int getCastingModifier(GridObject caster) {
        if (caster instanceof Entity e) {
            return e.getCastingModifier();
        }
        return getAttackModifier(caster);
    }

    public static int getCasterLevel(GridObject caster) {
        if (caster instanceof Entity e) {
            return e.getCharSheet().getLevel();
        }
        return 1;
    }
}
