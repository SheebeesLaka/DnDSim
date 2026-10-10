package Objects;

import EntityRes.CharSheet;
import EntityRes.Status;
import EntityRes.Weapon;

public class Entity extends GridObject {

    protected CharSheet charSheet;
    private int instanceNumber = 0;  // 0 = not set (party entity), >0 = non-party instance number
    private String baseName;  // Original name without instance number
    private int acAdjustment = 0;  // Temporary in-battle AC tweak; not persisted, resets each battle
    private final int[] statAdjustment = new int[6];  // Temporary in-battle stat tweaks, indexed by CharSheet.STRENGTH..CHARISMA
    private final String[] diceOverride = new String[3];  // Temporary in-battle damage dice tweaks per tier; null = use weapon's real die

    public Entity(int row, int col, CharSheet charSheet) {
        super(row, col);
        this.charSheet = charSheet;
        this.baseName = charSheet.getName();
    }

    /**
     * Get Armor Class for attack roll calculations
     * Base AC from the character sheet (default 10) + total defense from equipped armor
     */
    public int getAC() {
        return charSheet.getArmorClass() + charSheet.getTotalDefense() + charSheet.getStatusACModifier() + acAdjustment;
    }

    public int getAcAdjustment() {
        return acAdjustment;
    }

    /**
     * Temporarily adjust this entity's AC for the current battle only.
     * Not persisted to the CharSheet, so it resets whenever a new Entity is created.
     */
    public void adjustAC(int delta) {
        acAdjustment += delta;
    }

    public int getStatAdjustment(int attributeIndex) {
        return statAdjustment[attributeIndex];
    }

    /**
     * Temporarily adjust one of this entity's 6 basic stats for the current battle only.
     * Not persisted to the CharSheet, so it resets whenever a new Entity is created.
     */
    public void adjustStat(int attributeIndex, int delta) {
        statAdjustment[attributeIndex] += delta;
    }

    /**
     * The stat total (base + equipment + status + temporary battle adjustment) used for combat math.
     */
    public int getAdjustedAttribute(int attributeIndex) {
        return charSheet.getTotalAttribute(attributeIndex) + statAdjustment[attributeIndex];
    }

    /**
     * Get the stat modifier used for attack rolls with current weapon
     */
    public int getAttackModifier() {
        Weapon weapon = charSheet.getEquippedWeapon();
        int statusBonus = charSheet.getStatusAttackModifier();
        if (weapon != null) {
            int statIndex = weapon.getStatIndex();
            return getAdjustedAttribute(statIndex) + statusBonus;
        }
        // Unarmed uses STR
        return getAdjustedAttribute(CharSheet.STRENGTH) + statusBonus;
    }

    /** Raw casting stat (with battle adjustments), the spell analogue of the weapon stat. */
    public int getCastingModifier() {
        if (!charSheet.isCaster()) return 0;
        return getAdjustedAttribute(charSheet.getSpellcastingStatIndex());
    }

    /** Spell attack roll modifier: casting stat plus any attack-modifier statuses. */
    public int getSpellAttackModifier() {
        return getCastingModifier() + charSheet.getStatusAttackModifier();
    }

    public int getSpellSaveDC() {
        return CharSheet.SPELL_DC_BASE + getCastingModifier();
    }

    /** Saving throw modifier for the given stat index. */
    public int getSaveModifier(int attributeIndex) {
        return getAdjustedAttribute(attributeIndex);
    }

    /**
     * Get damage dice from equipped weapon, with any temporary battle adjustment applied per tier.
     */
    public String[] getDamageDice() {
        String[] base = getBaseDamageDice();
        String[] result = new String[3];
        for (int i = 0; i < 3; i++) {
            result[i] = diceOverride[i] != null ? diceOverride[i] : base[i];
        }
        return result;
    }

    /**
     * Get the equipped weapon's real damage dice, ignoring any temporary battle override.
     */
    public String[] getBaseDamageDice() {
        Weapon weapon = charSheet.getEquippedWeapon();
        String[] weaponDice = weapon != null ? weapon.getDamageDice() : new String[]{"d4", "d4", "d4"};
        String[] base = new String[3];
        for (int i = 0; i < 3; i++) {
            base[i] = weaponDice != null && i < weaponDice.length ? weaponDice[i] : null;
        }
        return base;
    }

    public String getDiceOverride(int tier) {
        return diceOverride[tier];
    }

    /**
     * Temporarily override one damage-dice tier for the current battle only.
     * Not persisted to the Weapon, so it resets whenever a new Entity is created.
     */
    public void setDiceOverride(int tier, String die) {
        diceOverride[tier] = die;
    }

    /**
     * Clear all temporary damage-dice overrides, e.g. when the equipped weapon changes so the
     * display/combat math snap back to reflect the newly equipped weapon's real dice.
     */
    public void resetDiceOverride() {
        for (int i = 0; i < diceOverride.length; i++) {
            diceOverride[i] = null;
        }
    }

    public int getMovement() {
        int totalDex = getAdjustedAttribute(CharSheet.DEXTERITY);
        return Math.max(0, 1 + ((totalDex + 1) / 2) + charSheet.getStatusMovementModifier());
    }

    public int getHealth() {
        return charSheet.getCurrentHP();
    }

    public String getName() {
        if (instanceNumber > 0) {
            return baseName + " #" + instanceNumber;
        }
        return charSheet.getName();
    }

    public CharSheet getCharSheet() {
        return charSheet;
    }
    
    public void setInstanceNumber(int number) {
        this.instanceNumber = number;
    }
    
    public int getInstanceNumber() {
        return instanceNumber;
    }
    
    public String getBaseName() {
        return baseName;
    }

    public void moveTo(int r, int c) {
        row = r;
        col = c;
    }

    public void takeDamage(int dmg) {
        charSheet.setCurrentHP(charSheet.getCurrentHP() - dmg);
        charSheet.save();
    }

    public boolean isDead() {
        return charSheet.getCurrentHP() <= 0;
    }

    public void addStatus(Status s) {
        charSheet.addStatus(s);
        charSheet.save();
    }

    public boolean isParty() {
        return charSheet.getParty();
    }
}
