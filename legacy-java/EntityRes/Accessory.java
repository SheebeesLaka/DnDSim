package EntityRes;

import java.util.ArrayList;

public class Accessory extends Item {

    // Fields
    private int defense;
    private int[] modifiedAttributes;
    private ArrayList<ItemAbility> abilities;
    
    // Legacy field for backward compatibility
    private int armorType;

    // Constructor
    public Accessory(String name, String type, int defense, int[] modifiedAttributes) {
        super(name, type);
        this.defense = defense;
        this.modifiedAttributes = modifiedAttributes;
        this.abilities = new ArrayList<>();
    }

    // Methods
    public void setDefense(int defense) {
        this.defense = defense;
    }

    public int getDefense() {
        return defense;
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
    
    // Legacy method for backward compatibility with old armor saves
    @Deprecated
    public int getArmorType() {
        return armorType;
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
