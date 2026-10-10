package EntityRes;

import java.util.ArrayList;

public class Weapon extends Item {

    // Fields
    private String[] damageDice;  // Damage dice per tier [tier1, tier2, tier3], e.g. ["d6", "d6", "d10"]
    private String statType;      // Stat modifier type used for attack rolls
    private String ammoType;      // Ammo type required (null for melee weapons), e.g. "12 Gauge", "Arrow"
    private int[] modifiedAttributes;
    private ArrayList<ItemAbility> abilities;
    
    // Legacy field for backward compatibility during migration
    private int damage;

    // Constructor
    public Weapon(String name, String type, String[] damageDice, String statType, int[] modifiedAttributes) {
        super(name, type);
        this.damageDice = damageDice != null ? damageDice : new String[]{"d4", "d4", "d6"};
        this.statType = statType != null ? statType : "STRENGTH";
        this.modifiedAttributes = modifiedAttributes;
        this.ammoType = null;  // Default: melee weapon
        this.abilities = new ArrayList<>();
    }
    
    // Constructor with ammo type
    public Weapon(String name, String type, String[] damageDice, String statType, String ammoType, int[] modifiedAttributes) {
        super(name, type);
        this.damageDice = damageDice != null ? damageDice : new String[]{"d4", "d4", "d6"};
        this.statType = statType != null ? statType : "STRENGTH";
        this.ammoType = ammoType;
        this.modifiedAttributes = modifiedAttributes;
        this.abilities = new ArrayList<>();
    }
    
    // Legacy constructor for backward compatibility
    public Weapon(String name, String type, int damage, int[] modifiedAttributes) {
        super(name, type);
        this.damage = damage;
        // Convert legacy damage to dice tiers (approximate)
        this.damageDice = convertLegacyDamage(damage);
        this.statType = "STRENGTH";
        this.modifiedAttributes = modifiedAttributes;
    }
    
    /**
     * Convert legacy flat damage to dice tiers (for migration)
     */
    private String[] convertLegacyDamage(int damage) {
        if (damage <= 3) return new String[]{"d4", "d4", "d6"};
        if (damage <= 6) return new String[]{"d6", "d6", "d8"};
        if (damage <= 10) return new String[]{"d6", "d6", "d10"};
        return new String[]{"d8", "d8", "d12"};
    }

    // Methods
    public void setDamageDice(String[] damageDice) {
        this.damageDice = damageDice;
    }

    public String[] getDamageDice() {
        // Handle legacy weapons that only have damage field
        if (damageDice == null && damage > 0) {
            damageDice = convertLegacyDamage(damage);
        }
        return damageDice != null ? damageDice : new String[]{"d4", "d4", "d6"};
    }
    
    public String getStatType() {
        return statType != null ? statType : "STRENGTH";
    }
    
    public void setStatType(String statType) {
        this.statType = statType;
    }
    
    /**
     * Get the stat index for CharSheet.
     */
    public int getStatIndex() {
        if ("DEXTERITY".equalsIgnoreCase(statType)) return CharSheet.DEXTERITY;
        if ("CONSTITUTION".equalsIgnoreCase(statType)) return CharSheet.CONSTITUTION;
        if ("INTELLIGENCE".equalsIgnoreCase(statType)) return CharSheet.INTELLIGENCE;
        if ("WISDOM".equalsIgnoreCase(statType)) return CharSheet.WISDOM;
        if ("CHARISMA".equalsIgnoreCase(statType)) return CharSheet.CHARISMA;
        return CharSheet.STRENGTH;
    }

    /**
     * Get the ammo type this weapon uses (null for melee weapons)
     */
    public String getAmmoType() {
        return ammoType;
    }
    
    public void setAmmoType(String ammoType) {
        this.ammoType = ammoType;
    }
    
    /**
     * Check if this weapon is ranged (requires ammo)
     */
    public boolean isRanged() {
        return ammoType != null && !ammoType.isEmpty();
    }
    
    public void setModifiedAttributes(int[] modifiedAttributes) {
        // Always store as 6-element array
        this.modifiedAttributes = new int[6];
        if (modifiedAttributes != null) {
            for (int i = 0; i < modifiedAttributes.length && i < 6; i++) {
                this.modifiedAttributes[i] = modifiedAttributes[i];
            }
        }
    }

    public int[] getModifiedAttributes() {
        // Always return 6-element array (padded with zeros for older items)
        int[] ans = new int[6];
        if (modifiedAttributes != null) {
            for (int i = 0; i < modifiedAttributes.length && i < 6; i++) {
                ans[i] = modifiedAttributes[i];
            }
        }
        return ans;
    }
    
    // Abilities
    public ArrayList<ItemAbility> getAbilities() {
        if (abilities == null) abilities = new ArrayList<>();
        return abilities;
    }
    
    public void setAbilities(ArrayList<ItemAbility> abilities) {
        this.abilities = abilities != null ? abilities : new ArrayList<>();
    }
    
    public void addAbility(ItemAbility ability) {
        if (abilities == null) abilities = new ArrayList<>();
        abilities.add(ability);
    }
    
    public void removeAbility(ItemAbility ability) {
        if (abilities != null) abilities.remove(ability);
    }
    
    public void clearAbilities() {
        if (abilities != null) abilities.clear();
    }
    
    public boolean hasAbilities() {
        return abilities != null && !abilities.isEmpty();
    }

}
