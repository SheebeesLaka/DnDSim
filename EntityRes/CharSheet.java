package EntityRes;

import java.util.ArrayList;
import com.google.gson.Gson;
import java.io.*;

public class CharSheet {

    private static final int ATTRIBUTE_COUNT = 6;

    // Meta
    private String name;
    private String characterClass;
    private String color;
    private boolean isParty;
    private String spritePath; // Path to character sprite image (e.g., "sprites/party/henry.png")
    private int level;
    private String group;      // Character-sheet roster group (GROUP_*); null = ungrouped

    // Roster groups for organizing the character sheet list. A character is in at most one.
    public static final String GROUP_OMEGA = "OMEGA";
    public static final String GROUP_ALPHA = "ALPHA";
    public static final String GROUP_NPC = "NPC";
    public static final String[] GROUPS = {GROUP_OMEGA, GROUP_ALPHA, GROUP_NPC};

    // HP and Statuses
    private int totalHP;
    private int currentHP;
    private int armorClass;
    private ArrayList<Status> status;

    // Attributes
    private int[] baseAttributes;
    private int[] tempAttributes;    // Equipment modifications
    private int[] totalAttributes;   // baseAttributes + tempAttributes
    public static final int STRENGTH = 0;
    public static final int DEXTERITY = 1;
    public static final int CONSTITUTION = 2;
    public static final int INTELLIGENCE = 3;
    public static final int WISDOM = 4;
    public static final int CHARISMA = 5;

    // Weapons
    private Weapon[] weapons;
    private final int PRIMARY = 0;
    private final int SECONDARY = 1;

    // Accessories (3 generic slots)
    private Accessory[] accessories;

    // Inventory
    private ArrayList<Item> inventory;
    private int wallet;

    // Character Abilities (innate abilities not tied to equipment)
    private ArrayList<ItemAbility> abilities;

    // Spellcasting (null spellcastingStat = not a caster)
    public static final int SPELL_DC_BASE = 10;
    private String spellcastingStat;
    private ArrayList<String> knownSpells;
    private int[] spellSlotsUsed;     // index 0 = level 1 slots used ... index 8 = level 9

    //Constructor
    public CharSheet(String name, boolean isParty, int totalHP, int[] baseAttributes, String color) {
        this.name = name;
        this.characterClass = "None";
        this.color = ColorUtils.normalizeHex(color, ColorUtils.DEFAULT_COLOR);
        this.isParty = isParty;
        this.level = 1;

        this.totalHP = totalHP;
        currentHP = totalHP;
        armorClass = 10;
        status = new ArrayList<Status>();

        this.baseAttributes = normalizeBaseAttributes(baseAttributes);
        this.tempAttributes = new int[ATTRIBUTE_COUNT];
        this.totalAttributes = new int[ATTRIBUTE_COUNT];
        for (int i = 0; i < ATTRIBUTE_COUNT; i++) {
            this.tempAttributes[i] = 0;
            this.totalAttributes[i] = this.baseAttributes[i];
        }

        // Initialize empty equipment slots (null = nothing equipped)
        weapons = new Weapon[2];
        weapons[0] = null;
        weapons[1] = null;

        accessories = new Accessory[3];
        accessories[0] = null;
        accessories[1] = null;
        accessories[2] = null;
        
        // Initialize totalAttributes after equipment is equipped
        updateAttributes();
        inventory = new ArrayList<Item>();
        abilities = new ArrayList<ItemAbility>();
        knownSpells = new ArrayList<String>();
        spellSlotsUsed = new int[SpellSlots.MAX_SPELL_LEVEL];
    }

    public CharSheet(String name, boolean isParty, int totalHP, int[] baseAttributes, int color) {
        this(name, isParty, totalHP, baseAttributes, ColorUtils.fromLegacyIndex(color));
    }

    // Methods
    public void setName(String name) {
        this.name = name;
        this.save();
    }

    public String getName() {
        return name;
    }

    public String getGroup() {
        return group;
    }

    /** Move this character into a roster group (null or unknown = ungrouped). */
    public void setGroup(String group) {
        this.group = java.util.Arrays.asList(GROUPS).contains(group) ? group : null;
        save();
    }

    /** Display name for a roster group: "Group \u03A9", "Group \u03B1", "NPC", or "Ungrouped" for null. */
    public static String groupLabel(String group) {
        if (group == null) return "Ungrouped";
        return switch (group) {
            case GROUP_OMEGA -> "Group \u03A9";
            case GROUP_ALPHA -> "Group \u03B1";
            case GROUP_NPC -> "NPC";
            default -> group;
        };
    }

    public void setCharacterClass(String characterClass) {
        this.characterClass = characterClass;
        this.save();
    }

    public String getCharacterClass() {
        return characterClass != null ? characterClass : "None";
    }

    public void setParty(boolean isParty) {
        this.isParty = isParty;
        this.save();
    }

    public boolean getParty() {
        return isParty;
    }

    public void setSpritePath(String spritePath) {
        this.spritePath = spritePath;
        this.save();
    }

    public String getSpritePath() {
        return spritePath;
    }

    public void setColor(String color) {
        this.color = ColorUtils.normalizeHex(color, ColorUtils.DEFAULT_COLOR);
        this.save();
    }

    public void setColor(int color) {
        setColor(ColorUtils.fromLegacyIndex(color));
    }

    public String getColor() {
        color = ColorUtils.normalizeHex(color, ColorUtils.DEFAULT_COLOR);
        return color;
    }

    public java.awt.Color getDisplayColor() {
        return ColorUtils.toAwtColor(color, ColorUtils.DEFAULT_COLOR);
    }

    public static String[] getColorNames() {
        return new String[] {
            "Black", "Gray", "White", "Maroon", "Red", "Orange", "Yellow", "Lime",
            "Green", "Blue", "Indigo", "Lilac", "Purple", "Pink", "Beige", "Brown"
        };
    }

    public static String getColorHex(int colorId) {
        return ColorUtils.legacyHex(colorId);
    }

    public String getColorName() {
        return getColor();
    }

    public int getLevel() {
        return Math.max(1, level);
    }

    public void setLevel(int level) {
        this.level = Math.max(1, level);
        this.save();
    }

    public void levelUp() {
        this.level = Math.max(1, this.level) + 1;
        this.save();
    }

    public int getAvailableStatPoints() {
        return 27 + ((getLevel() - 1) * 2);
    }

    public int getSpentStatPoints() {
        int sum = 0;
        for (int value : baseAttributes) {
            sum += value;
        }
        return sum;
    }

    public int getStatPointBalance() {
        return getAvailableStatPoints() - getSpentStatPoints();
    }

    public boolean isOverStatBudget() {
        return getStatPointBalance() < 0;
    }

    public void setTotalHP(int newHP) {
        totalHP = newHP;
        this.save();
    }

    public int getTotalHP() {
        return totalHP;
    }

    public int getCurrentHP() {
        return currentHP;
    }

    public void setCurrentHP(int newHP) {
        currentHP = newHP;
        this.save();
    }

    public void addCurrentHP(int HPtoAdd) {
        currentHP = Math.min(currentHP + HPtoAdd, totalHP); // Don't exceed max HP
        this.save();
    }

    public int getArmorClass() {
        return armorClass;
    }

    public void setArmorClass(int ac) {
        this.armorClass = ac;
        this.save();
    }

    public void mulCurrentHP(double factorToMul) {
        int temp = (int) (Math.ceil(currentHP * factorToMul));
        if (temp < 1) {
            currentHP = 1;
        } else {
            currentHP = temp;
        }
        this.save();
    }

    public void addStatus(Status newStatus) {
        if (!isInStatus(newStatus)) {
            status.add(newStatus);
            this.save();
        }
    }

    public void addStatusWithoutSave(Status newStatus) {
        if (!isInStatus(newStatus)) {
            status.add(newStatus);
        }
    }

    public Status removeStatus(Status statusToRemove) {
        Status ans = new Status("temp");
        if (isInStatus(statusToRemove)) {
            ans = statusToRemove;
            status.remove(statusToRemove);
            this.save();
        } else {
            // Temp exception
            System.out.println("statusRemoval Error");
        }
        return ans;
    }

    public void removeStatusWithoutSave(Status statusToRemove) {
        int idx = indexInStatus(statusToRemove);
        if (idx != -1) {
            status.remove(idx);
        }
    }

    public void clearStatus() {
        status.clear();
        this.save();
    }

    public void clearStatusWithoutSave() {
        status.clear();
    }

    public Status[] getStatus() {
        Status[] ans = new Status[status.size()];
        for (int i = 0; i < ans.length; i++) {
            ans[i] = status.get(i);
        }
        return ans;
    }

    /**
     * Process all status effects at the start of a turn.
     * Applies DOT/HOT, ticks down durations, and removes expired effects.
     */
    public void procStatus() {
        if (status.isEmpty()) {
            return;
        }

        java.util.Iterator<Status> iterator = status.iterator();
        while (iterator.hasNext()) {
            Status s = iterator.next();
            
            // Apply effect based on type
            switch (s.getEffectType()) {
                case Status.DAMAGE_OVER_TIME:
                    // Apply damage (minimum HP is 1 to avoid instant death from DOT)
                    int newHP = Math.max(1, currentHP - s.getMagnitude());
                    currentHP = newHP;
                    break;
                    
                case Status.HEAL_OVER_TIME:
                    // Apply healing (capped at totalHP)
                    currentHP = Math.min(totalHP, currentHP + s.getMagnitude());
                    break;
                    
                case Status.STAT_MODIFIER:
                case Status.MOVEMENT_MODIFIER:
                    // Stat modifiers are applied during updateAttributes()
                    // They affect the temp attributes while the status is active
                    break;
            }
            
            // Tick duration and remove if expired
            if (s.tick()) {
                iterator.remove();
            }
        }
        
        // Recalculate attributes (in case stat modifiers were removed)
        updateAttributes();
        
        // Process equipped item abilities
        processEquippedAbilities(ItemAbility.ON_TURN_START);
        
        this.save();
    }
    
    /**
     * Process abilities from equipped weapons, accessories, and character abilities that match the given trigger type.
     * @param triggerType The trigger type to process (e.g., ON_TURN_START, ON_HIT)
     * @return A list of ability descriptions that were triggered (for combat log)
     */
    public java.util.List<String> processEquippedAbilities(String triggerType) {
        java.util.List<String> triggered = new java.util.ArrayList<>();
        
        // Process character abilities (innate abilities)
        if (abilities != null) {
            for (ItemAbility ability : abilities) {
                if (triggerType.equals(ability.getTriggerType())) {
                    String result = applyAbility(ability);
                    if (result != null) triggered.add(ability.getName() + ": " + result);
                }
            }
        }
        
        // Process weapon abilities
        for (Weapon weapon : weapons) {
            if (weapon != null && weapon.hasAbilities()) {
                for (ItemAbility ability : weapon.getAbilities()) {
                    if (triggerType.equals(ability.getTriggerType())) {
                        String result = applyAbility(ability);
                        if (result != null) triggered.add(weapon.getName() + ": " + result);
                    }
                }
            }
        }
        
        // Process accessory abilities
        for (Accessory accessory : accessories) {
            if (accessory != null && accessory.hasAbilities()) {
                for (ItemAbility ability : accessory.getAbilities()) {
                    if (triggerType.equals(ability.getTriggerType())) {
                        String result = applyAbility(ability);
                        if (result != null) triggered.add(accessory.getName() + ": " + result);
                    }
                }
            }
        }
        
        return triggered;
    }
    
    /**
     * Apply a single item ability effect.
     * @param ability The ability to apply
     * @return A description of the effect applied, or null if nothing happened
     */
    private String applyAbility(ItemAbility ability) {
        switch (ability.getEffectType()) {
            case ItemAbility.EFFECT_HEAL:
                if (currentHP < totalHP) {
                    int healAmount = Math.min(ability.getMagnitude(), totalHP - currentHP);
                    currentHP += healAmount;
                    return "Healed " + healAmount + " HP";
                }
                return null;
                
            case ItemAbility.EFFECT_DAMAGE:
                int dmg = ability.getMagnitude();
                currentHP = Math.max(1, currentHP - dmg);
                return "Took " + dmg + " damage";
                
            case ItemAbility.EFFECT_STAT_BOOST:
                // Stat boosts from items are handled via modifiedAttributes
                // This is for temporary boosts applied as a status
                return null;
                
            case ItemAbility.EFFECT_STATUS:
                // Apply a status effect
                String statusName = ability.getStatusName();
                if (statusName != null) {
                    // Create a new status based on the ability
                    Status newStatus = new Status(statusName, Status.NONE, 0, 1, -1);
                    addStatus(newStatus);
                    return "Applied " + statusName;
                }
                return null;
                
            default:
                return null;
        }
    }

    /**
     * Get total stat modifiers from active status effects
     */
    public int getStatusAttributeModifier(int attribute) {
        int modifier = 0;
        for (Status s : status) {
            if ((s.getEffectType() == Status.STAT_MODIFIER || s.getEffectType() == Status.MOVEMENT_MODIFIER)
                    && s.getTargetAttribute() == attribute) {
                modifier += s.getMagnitude();
            }
        }
        return modifier;
    }

    public void updateAttributes() {
        // Calculate tempAttributes from equipped items (handle null slots)
        int[] acc0Attr = accessories[0] != null ? normalizeAttributeArray(accessories[0].getModifiedAttributes()) : new int[ATTRIBUTE_COUNT];
        int[] acc1Attr = accessories[1] != null ? normalizeAttributeArray(accessories[1].getModifiedAttributes()) : new int[ATTRIBUTE_COUNT];
        int[] acc2Attr = accessories[2] != null ? normalizeAttributeArray(accessories[2].getModifiedAttributes()) : new int[ATTRIBUTE_COUNT];
        int[] weapAttr = weapons[0] != null ? normalizeAttributeArray(weapons[0].getModifiedAttributes()) : new int[ATTRIBUTE_COUNT];
        
        // Reset temp attributes to zero
        for (int i = 0; i < tempAttributes.length; i++) {
            tempAttributes[i] = 0;
        }
        
        // Sum all equipment modifications
        for (int i = 0; i < tempAttributes.length; i++) {
            tempAttributes[i] = acc0Attr[i] + acc1Attr[i] + acc2Attr[i] + weapAttr[i];
        }
        
        // Calculate total attributes = base + equipment modifications + status modifiers
        for (int i = 0; i < totalAttributes.length; i++) {
            totalAttributes[i] = baseAttributes[i] + tempAttributes[i] + getStatusAttributeModifier(i);
        }
    }

    public void setAttributes(int[] values) {
        if (values.length != baseAttributes.length) {
            // Temp exception
            System.out.println("attributeLength Error");
        } else {
            for (int i = 0; i < baseAttributes.length; i++) {
                baseAttributes[i] = values[i];
            }
            this.save();
        }
    }

    public void setAttribute(int attribute, int value) {
        baseAttributes[attribute] = value;
        this.save();
    }

    public void incAttribute(int attribute) {
        baseAttributes[attribute] += 1;
        this.save();
    }

    public int[] getAttributes() {
        int[] ans = new int[baseAttributes.length];
        for (int i = 0; i < ans.length; i++) {
            ans[i] = baseAttributes[i];
        }
        return ans;
    }

    public int getAttribute(int attribute) {
        if (attribute < 0 || attribute >= baseAttributes.length) return 0;
        return baseAttributes[attribute];
    }

    public int[] getTempAttributes() {
        int[] ans = new int[tempAttributes.length];
        for (int i = 0; i < ans.length; i++) {
            ans[i] = tempAttributes[i];
        }
        return ans;
    }

    public int getTempAttribute(int attribute) {
        if (attribute < 0 || attribute >= tempAttributes.length) return 0;
        return tempAttributes[attribute];
    }

    public int[] getTotalAttributes() {
        int[] ans = new int[totalAttributes.length];
        for (int i = 0; i < ans.length; i++) {
            ans[i] = totalAttributes[i];
        }
        return ans;
    }

    public int getTotalAttribute(int attribute) {
        if (attribute < 0 || attribute >= totalAttributes.length) return 0;
        return totalAttributes[attribute];
    }

    public void equipPrimaryWeapon(Weapon newWeapon) {
        // Unequip current weapon first (adds back to inventory)
        if (weapons[PRIMARY] != null) {
            addItem(weapons[PRIMARY]);
        }
        // Equip new weapon and remove from inventory
        weapons[PRIMARY] = newWeapon;
        if (newWeapon != null) {
            removeItem(newWeapon);
        }
        updateAttributes();
        this.save();
    }

    public void equipSecondaryWeapon(Weapon newWeapon) {
        // Unequip current weapon first (adds back to inventory)
        if (weapons[SECONDARY] != null) {
            addItem(weapons[SECONDARY]);
        }
        // Equip new weapon and remove from inventory
        weapons[SECONDARY] = newWeapon;
        if (newWeapon != null) {
            removeItem(newWeapon);
        }
        this.save();
    }

    public Weapon getEquippedWeapon() {
        return resolveEquippedWeapon(PRIMARY);
    }

    public Weapon getEquippedSecondary() {
        return resolveEquippedWeapon(SECONDARY);
    }

    /**
     * Resolve equipped weapon from the item database by name so editor updates
     * (dice/stat/ammo) are reflected without requiring manual re-equip.
     */
    private Weapon resolveEquippedWeapon(int slot) {
        if (slot < 0 || slot >= weapons.length) {
            return null;
        }

        Weapon equipped = weapons[slot];
        if (equipped == null || equipped.getName() == null) {
            return equipped;
        }

        Weapon latest = ItemDatabase.getInstance().getWeapon(equipped.getName());
        if (latest != null) {
            weapons[slot] = latest;
            return latest;
        }

        return equipped;
    }

    public void unequipPrimaryWeapon() {
        if (weapons[PRIMARY] != null) {
            addItem(weapons[PRIMARY]);
        }
        weapons[PRIMARY] = null;
        updateAttributes();
        this.save();
    }

    public void unequipSecondaryWeapon() {
        if (weapons[SECONDARY] != null) {
            addItem(weapons[SECONDARY]);
        }
        weapons[SECONDARY] = null;
        this.save();
    }

    public void swapWeapons() {
        Weapon temp = weapons[PRIMARY];
        weapons[PRIMARY] = weapons[SECONDARY];
        weapons[SECONDARY] = temp;
        updateAttributes();
        this.save();
    }

    public void equipAccessory(int slot, Accessory accessory) {
        if (slot >= 0 && slot < 3) {
            // Unequip current accessory first (adds back to inventory)
            if (accessories[slot] != null) {
                addItem(accessories[slot]);
            }
            // Equip new accessory and remove from inventory
            accessories[slot] = accessory;
            if (accessory != null) {
                removeItem(accessory);
            }
            updateAttributes();
            this.save();
        }
    }

    public Accessory getAccessory(int slot) {
        if (slot >= 0 && slot < 3) {
            return accessories[slot];
        }
        return null;
    }

    public Accessory[] getAccessories() {
        return accessories;
    }

    public int getTotalDefense() {
        int totalDefense = 0;
        for (int i = 0; i < 3; i++) {
            if (accessories[i] != null) totalDefense += accessories[i].getDefense();
        }
        return totalDefense;
    }

    public void unequipAccessory(int slot) {
        if (slot >= 0 && slot < 3 && accessories[slot] != null) {
            addItem(accessories[slot]);
            accessories[slot] = null;
            updateAttributes();
            this.save();
        }
    }

    public void pickupItem(Item newItem) {
        int temp = indexInInventory(newItem);
        if (temp == -1) {
            inventory.add(newItem);
        } else {
            inventory.get(temp).addQuantity(newItem.getQuantity());
        }
        this.save();
    }

    public void dropItem(Item itemToDrop) {
        int temp = indexInInventory(itemToDrop);
        if (temp != -1) {
            if (inventory.get(temp).getQuantity() > itemToDrop.getQuantity()) {
                inventory.get(temp).addQuantity(itemToDrop.getQuantity() * -1);
            } else if (inventory.get(temp).getQuantity() == itemToDrop.getQuantity()) {
                inventory.remove(temp);
            } else {
                // Temp exception
                System.out.println("notInInventory Error");
            }
        } else {
            // Temp exception
            System.out.println("notInInventory Error");
        }
        this.save();
    }

    public void buyItem(Item itemToBuy, int cost) {
        if (wallet >= cost) {
            pickupItem(itemToBuy);
        }
    }

    public void sellItem(Item itemToSell, int price) {
        if (isInInventory(itemToSell)) {
            dropItem(itemToSell);
            wallet += price;
            this.save();
        }
    }

    private int indexInInventory(Item item) {
        for (int i = 0; i < inventory.size(); i++) {
            if (inventory.get(i).getName().equals(item.getName())) {
                return i;
            }
        }
        return -1;
    }

    private boolean isInInventory(Item item) {
        if (indexInInventory(item) == -1) {
            return false;
        }
        return true;
    }

    private int indexInStatus(Status stat) {
        for (int i = 0; i < status.size(); i++) {
            if (status.get(i).getName().equals(stat.getName())) {
                return i;
            }
        }
        return -1;
    }

    private boolean isInStatus(Status stat) {
        if (indexInStatus(stat) == -1) {
            return false;
        }
        return true;
    }

    public ArrayList<Item> getInventory() {
        return inventory;
    }

    // Character Abilities Management
    
    /**
     * Get the list of character abilities.
     */
    public ArrayList<ItemAbility> getAbilities() {
        if (abilities == null) {
            abilities = new ArrayList<ItemAbility>();
        }
        return abilities;
    }
    
    /**
     * Add an ability to the character.
     */
    public void addAbility(ItemAbility ability) {
        if (ability == null) return;
        if (abilities == null) {
            abilities = new ArrayList<ItemAbility>();
        }
        abilities.add(ability);
        save();
    }
    
    /**
     * Remove an ability from the character.
     */
    public void removeAbility(ItemAbility ability) {
        if (ability == null || abilities == null) return;
        abilities.remove(ability);
        save();
    }
    
    /**
     * Remove an ability by name.
     */
    public void removeAbilityByName(String name) {
        if (name == null || abilities == null) return;
        abilities.removeIf(a -> a.getName().equals(name));
        save();
    }
    
    /**
     * Check if character has any abilities.
     */
    public boolean hasAbilities() {
        return abilities != null && !abilities.isEmpty();
    }

    /**
     * Add an item to the inventory. If an identical item already exists (by name and type),
     * increase its quantity instead of adding a duplicate.
     */
    public void addItem(Item item) {
        if (item == null) return;
        
        // Check if item already exists in inventory (stack by name)
        for (Item existing : inventory) {
            if (existing.getName().equals(item.getName()) && 
                existing.getClass().equals(item.getClass())) {
                existing.addQuantity(item.getQuantity());
                save();
                return;
            }
        }
        
        // Item doesn't exist, add as new
        inventory.add(item);
        save();
    }

    /**
     * Remove an item from the inventory completely (matches by name and type).
     */
    public void removeItem(Item item) {
        if (item == null) return;
        Item toRemove = null;
        for (Item existing : inventory) {
            if (existing.getName().equals(item.getName()) && 
                existing.getClass().equals(item.getClass())) {
                toRemove = existing;
                break;
            }
        }
        if (toRemove != null) {
            inventory.remove(toRemove);
            save();
        }
    }

    /**
     * Remove a specific quantity of an item. If quantity becomes 0 or less, remove the item entirely.
     */
    public void removeItemQuantity(Item item, int quantity) {
        if (item == null) return;
        
        for (Item existing : inventory) {
            if (existing.getName().equals(item.getName()) && 
                existing.getClass().equals(item.getClass())) {
                existing.addQuantity(-quantity);
                if (existing.getQuantity() <= 0) {
                    inventory.remove(existing);
                }
                save();
                return;
            }
        }
    }

    public int getWallet() {
        return wallet;
    }

    // ---- Spellcasting ----

    public boolean isCaster() {
        return spellcastingStat != null && !spellcastingStat.isEmpty();
    }

    public String getSpellcastingStat() {
        return spellcastingStat;
    }

    public void setSpellcastingStat(String stat) {
        this.spellcastingStat = (stat == null || stat.isEmpty() || stat.equalsIgnoreCase("None")) ? null : stat;
        save();
    }

    public int getSpellcastingStatIndex() {
        return Spell.statIndex(spellcastingStat);
    }

    /** Raw casting stat, matching how weapon attacks use the raw weapon stat. */
    public int getCastingModifier() {
        return isCaster() ? getTotalAttribute(getSpellcastingStatIndex()) : 0;
    }

    public int getSpellSaveDC() {
        return SPELL_DC_BASE + getCastingModifier();
    }

    public java.util.List<String> getKnownSpellNames() {
        followSpellRenames();
        return knownSpells;
    }

    /** Known spells resolved through SpellDatabase (missing/deleted spells are skipped). */
    public java.util.List<Spell> getKnownSpells() {
        if (followSpellRenames()) save();
        java.util.List<Spell> list = new ArrayList<>();
        for (String spellName : knownSpells) {
            Spell spell = SpellDatabase.getInstance().getSpell(spellName);
            if (spell != null) list.add(spell);
        }
        list.sort(java.util.Comparator.comparingInt(Spell::getLevel).thenComparing(Spell::getName));
        return list;
    }

    /**
     * Swap in the new name for any known spell renamed in the editor while this sheet was loaded,
     * so neither display nor a later save() resurrects the stale name. Returns true if anything changed.
     */
    private boolean followSpellRenames() {
        if (knownSpells == null) return false;
        boolean changed = false;
        SpellDatabase db = SpellDatabase.getInstance();
        for (int i = 0; i < knownSpells.size(); i++) {
            String renamed = db.getRenamedName(knownSpells.get(i));
            if (renamed != null && db.getSpell(knownSpells.get(i)) == null) {
                knownSpells.set(i, renamed);
                changed = true;
            }
        }
        return changed;
    }

    public void learnSpell(String spellName) {
        if (spellName != null && !knownSpells.contains(spellName)) {
            knownSpells.add(spellName);
            save();
        }
    }

    public void forgetSpell(String spellName) {
        if (knownSpells.remove(spellName)) {
            save();
        }
    }

    public int getMaxSpellSlots(int spellLevel) {
        return isCaster() ? SpellSlots.maxSlots(level, spellLevel) : 0;
    }

    public int getSpellSlotsUsed(int spellLevel) {
        if (spellLevel < 1 || spellLevel > SpellSlots.MAX_SPELL_LEVEL) return 0;
        return spellSlotsUsed[spellLevel - 1];
    }

    public int getSpellSlotsRemaining(int spellLevel) {
        return Math.max(0, getMaxSpellSlots(spellLevel) - getSpellSlotsUsed(spellLevel));
    }

    public boolean hasSpellSlot(int spellLevel) {
        return spellLevel == 0 || getSpellSlotsRemaining(spellLevel) > 0;
    }

    /** Lowest slot level >= minLevel that still has a slot available, or -1 if none. */
    public int lowestAvailableSlot(int minLevel) {
        if (minLevel <= 0) return 0;
        for (int lvl = minLevel; lvl <= SpellSlots.MAX_SPELL_LEVEL; lvl++) {
            if (getSpellSlotsRemaining(lvl) > 0) return lvl;
        }
        return -1;
    }

    /** Spend one slot of the given level. Cantrips (level 0) are free. */
    public boolean spendSpellSlot(int spellLevel) {
        if (spellLevel == 0) return true;
        if (getSpellSlotsRemaining(spellLevel) <= 0) return false;
        spellSlotsUsed[spellLevel - 1]++;
        save();
        return true;
    }

    /** Restore one slot of the given level (manual DM correction). */
    public void restoreSpellSlot(int spellLevel) {
        if (spellLevel < 1 || spellLevel > SpellSlots.MAX_SPELL_LEVEL) return;
        if (spellSlotsUsed[spellLevel - 1] > 0) {
            spellSlotsUsed[spellLevel - 1]--;
            save();
        }
    }

    /** Long rest: restore every spell slot. */
    public void longRest() {
        java.util.Arrays.fill(spellSlotsUsed, 0);
        save();
    }

    // ---- Status-derived combat modifiers ----

    public int getStatusACModifier() {
        return Status.sumMagnitude(status, Status.AC_MODIFIER);
    }

    public int getStatusAttackModifier() {
        return Status.sumMagnitude(status, Status.ATTACK_MODIFIER);
    }

    public int getStatusMovementModifier() {
        return Status.sumMovement(status);
    }

    public void save() {
        // Only save party entities
        if (!isParty) {
            return;
        }

        followSpellRenames();
        String dir = "saves/entities/party";
        new File(dir).mkdirs();
        String filePath = dir + "/" + name.replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        Gson gson = ItemTypeAdapter.createGson();
        try (FileWriter writer = new FileWriter(filePath)) {
            gson.toJson(this, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    /**
     * Deletes this sheet's save file from disk. Only applicable to party entities.
     */
    public void delete() {
        if (!isParty) {
            return;
        }
        String filePath = "saves/entities/party/" + name.replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        File file = new File(filePath);
        if (file.exists()) {
            file.delete();
        }
    }

    public static CharSheet load(String name, boolean isParty) {
        String folder = isParty ? "party" : "nonparty";
        String dir = "saves/entities/" + folder;
        String filePath = dir + "/" + name.replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        Gson gson = ItemTypeAdapter.createGson();
        try (FileReader reader = new FileReader(filePath)) {
            CharSheet sheet = gson.fromJson(reader, CharSheet.class);
            if (sheet == null) {
                return null;
            }
            sheet.baseAttributes = normalizeBaseAttributes(sheet.baseAttributes);
            sheet.tempAttributes = normalizeAttributeArray(sheet.tempAttributes);
            sheet.totalAttributes = normalizeAttributeArray(sheet.totalAttributes);
            if (sheet.status == null) {
                sheet.status = new ArrayList<Status>();
            }
            if (sheet.level <= 0) {
                sheet.level = 1;
            }
            // Initialize armor class for older saves
            if (sheet.armorClass == 0) {
                sheet.armorClass = 10;
            }
            // Initialize equipment arrays for older saves
            if (sheet.weapons == null) {
                sheet.weapons = new Weapon[2];
            }
            if (sheet.accessories == null) {
                sheet.accessories = new Accessory[3];
            }
            if (sheet.inventory == null) {
                sheet.inventory = new ArrayList<Item>();
            }
            if (sheet.abilities == null) {
                sheet.abilities = new ArrayList<ItemAbility>();
            }
            if (sheet.knownSpells == null) {
                sheet.knownSpells = new ArrayList<String>();
            }
            if (sheet.spellSlotsUsed == null || sheet.spellSlotsUsed.length != SpellSlots.MAX_SPELL_LEVEL) {
                sheet.spellSlotsUsed = new int[SpellSlots.MAX_SPELL_LEVEL];
            }
            // Recalculate attributes in case they were corrupted
            sheet.updateAttributes();
            return sheet;
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    private static int[] normalizeAttributeArray(int[] values) {
        int[] normalized = new int[ATTRIBUTE_COUNT];
        if (values != null) {
            for (int i = 0; i < Math.min(ATTRIBUTE_COUNT, values.length); i++) {
                normalized[i] = values[i];
            }
        }
        return normalized;
    }

    private static int[] normalizeBaseAttributes(int[] values) {
        int[] normalized = new int[ATTRIBUTE_COUNT];
        if (values == null) {
            return normalized;
        }

        // Legacy save format: [STR, DEX, MOB, INT] to [STR, DEX, CON, INT, WIS, CHA].
        if (values.length == 4) {
            normalized[STRENGTH] = values[0];
            normalized[DEXTERITY] = values[1];
            normalized[CONSTITUTION] = 0;
            normalized[INTELLIGENCE] = values[3];
            normalized[WISDOM] = 0;
            normalized[CHARISMA] = 0;
            return normalized;
        }

        for (int i = 0; i < Math.min(ATTRIBUTE_COUNT, values.length); i++) {
            normalized[i] = values[i];
        }
        return normalized;
    }
    
    /**
     * Deep copy the CharSheet to create an independent instance for non-party entities
     */
    public CharSheet deepCopy() {
        Gson gson = ItemTypeAdapter.createGson();
        String json = gson.toJson(this);
        CharSheet copy = gson.fromJson(json, CharSheet.class);
        return copy;
    }
}
