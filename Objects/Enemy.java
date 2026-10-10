package Objects;

import EntityRes.ColorUtils;
import EntityRes.Status;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.*;
import java.util.ArrayList;
import java.util.List;

public class Enemy extends GridObject {

    // Suggested tags shown as toggleable chips when creating/editing an enemy; the tags field
    // itself is a free list so custom tags work identically to these.
    public static final String[] PREDEFINED_TAGS = {"Boss", "Beast", "Undead", "Humanoid", "Dragon", "Construct", "Elemental"};

    private String name;
    private int health;
    private int maxHealth;
    private int mobility;
    private int armorClass;           // AC for attack rolls
    private String[] damageDice;      // Damage dice per tier [tier1, tier2, tier3]
    private int dexterity;            // Attack roll modifier and initiative stat
    private String color;
    private int instanceNumber = 0;
    private String baseName;
    private String spritePath; // Path to enemy sprite image (e.g., "sprites/enemies/spider.png")
    private transient int acAdjustment = 0;  // Temporary in-battle AC tweak; not persisted, resets each battle
    private transient int dexAdjustment = 0;  // Temporary in-battle Dexterity tweak; not persisted, resets each battle
    private transient String[] diceOverride = new String[3];  // Temporary in-battle damage dice tweaks per tier; null = use real die
    private List<String> tags = new ArrayList<>();  // Free-form + predefined tags for filtering; empty list default covers legacy saves
    // Saving-throw stats indexed like CharSheet.STRENGTH..CHARISMA. The DEX slot is ignored in favor of
    // `dexterity`; legacy saves without this array default every stat to the enemy's dexterity.
    private int[] attributes;
    private transient List<Status> statuses = new ArrayList<>();  // In-battle conditions (spell riders etc.)

    // Legacy flat damage from pre-dice saves; converted to damage dice on read
    private int attackDamage;

    /**
     * No-arg constructor so Gson deserialization (used by Enemy.load()) goes through normal
     * reflective construction instead of falling back to UnsafeAllocator, which skips field
     * initializers entirely - that was leaving diceOverride null instead of new String[3] for
     * every enemy loaded from disk, causing an NPE the moment a loaded enemy's damage dice
     * were read (e.g. attacking, being attacked, or hovering it during battle).
     */
    public Enemy() {
        super(0, 0);
    }

    public Enemy(int row, int col, String name, int maxHealth, int mobility, int armorClass,
                 String[] damageDice, int dexterity, String color) {
        super(row, col);
        this.name = name;
        this.baseName = name;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.mobility = mobility;
        this.armorClass = armorClass;
        this.damageDice = damageDice != null ? damageDice : new String[]{"d4", "d4", "d6"};
        this.dexterity = dexterity;
        this.color = ColorUtils.normalizeHex(color, ColorUtils.DEFAULT_COLOR);
    }

    /**
     * Convert legacy flat damage to dice tiers (for migration)
     */
    private String[] convertLegacyDamage(int damage) {
        if (damage <= 2) return new String[]{"d4", "d4", "d4"};
        if (damage <= 4) return new String[]{"d4", "d4", "d6"};
        if (damage <= 6) return new String[]{"d6", "d6", "d8"};
        return new String[]{"d6", "d8", "d10"};
    }
    
    /**
     * Get Armor Class for attack roll calculations
     */
    public int getAC() {
        // Handle legacy enemies without explicit AC
        int baseAC = armorClass <= 0 ? 10 : armorClass;
        return baseAC + acAdjustment + Status.sumMagnitude(getStatuses(), Status.AC_MODIFIER);
    }

    public void setAC(int ac) {
        this.armorClass = ac;
    }

    public int getAcAdjustment() {
        return acAdjustment;
    }

    /**
     * Temporarily adjust this enemy's AC for the current battle only.
     * Not persisted (transient), so it resets whenever a fresh Enemy is loaded.
     */
    public void adjustAC(int delta) {
        acAdjustment += delta;
    }

    public int getDexAdjustment() {
        return dexAdjustment;
    }

    /**
     * Temporarily adjust this enemy's Dexterity for the current battle only.
     * Not persisted (transient), so it resets whenever a fresh Enemy is loaded.
     * Applies to initiative rolled after the change (Begin, or joining mid-battle), but not
     * to initiative already rolled, and never to movement (flat `mobility` stat).
     */
    public void adjustDexterity(int delta) {
        dexAdjustment += delta;
    }

    public int getAdjustedDexterity() {
        return dexterity + dexAdjustment;
    }

    /**
     * Get modifier added to attack rolls.
     * Current enemy design uses dexterity for both attack rolls and initiative.
     */
    public int getAttackModifier() {
        return getAdjustedDexterity() + Status.sumMagnitude(getStatuses(), Status.ATTACK_MODIFIER);
    }

    private void ensureAttributes() {
        if (attributes == null || attributes.length != 6) {
            int[] filled = new int[6];
            for (int i = 0; i < 6; i++) {
                filled[i] = attributes != null && i < attributes.length ? attributes[i] : dexterity;
            }
            attributes = filled;
        }
    }

    /** Base stat for saving throws (index matches CharSheet.STRENGTH..CHARISMA). */
    public int getAttribute(int index) {
        if (index == 1) return dexterity;
        ensureAttributes();
        return attributes[index];
    }

    public void setAttribute(int index, int value) {
        if (index == 1) {
            dexterity = value;
            return;
        }
        ensureAttributes();
        attributes[index] = value;
    }

    /** Saving throw modifier, including temporary DEX tweaks and stat-modifier statuses. */
    public int getSaveModifier(int index) {
        int base = index == 1 ? getAdjustedDexterity() : getAttribute(index);
        int statusMod = 0;
        for (Status s : getStatuses()) {
            if (s.getEffectType() == Status.STAT_MODIFIER && s.getTargetAttribute() == index) {
                statusMod += s.getMagnitude();
            }
        }
        return base + statusMod;
    }

    public List<Status> getStatuses() {
        if (statuses == null) {
            statuses = new ArrayList<>();
        }
        return statuses;
    }

    public void addStatus(Status status) {
        if (status != null) {
            getStatuses().add(status);
        }
    }

    public void removeStatus(Status status) {
        getStatuses().remove(status);
    }

    /**
     * Turn-start status processing, mirroring CharSheet.procStatus(): DOT/HOT apply (DOT can't
     * drop below 1 HP), then durations tick down and expired statuses are removed.
     */
    public void procStatus() {
        java.util.Iterator<Status> it = getStatuses().iterator();
        while (it.hasNext()) {
            Status s = it.next();
            if (s.getEffectType() == Status.DAMAGE_OVER_TIME) {
                health = Math.max(1, health - s.getMagnitude());
            } else if (s.getEffectType() == Status.HEAL_OVER_TIME) {
                health = Math.min(maxHealth, health + s.getMagnitude());
            }
            if (s.tick()) {
                it.remove();
            }
        }
    }
    
    /**
     * Get damage dice per tier [tier1, tier2, tier3], with any temporary battle adjustment applied.
     */
    public String[] getDamageDice() {
        ensureDiceOverride();
        String[] base = getBaseDamageDice();
        String[] result = new String[3];
        for (int i = 0; i < 3; i++) {
            result[i] = diceOverride[i] != null ? diceOverride[i] : base[i];
        }
        return result;
    }

    /**
     * Gson's deserializer (Enemy.load()) constructs instances via reflection without running
     * field initializers, so a freshly-loaded Enemy could have a null diceOverride array even
     * with the no-arg constructor in place. Guard against that defensively here too.
     */
    private void ensureDiceOverride() {
        if (diceOverride == null) {
            diceOverride = new String[3];
        }
    }

    /**
     * Get this enemy's real damage dice, ignoring any temporary battle override.
     */
    public String[] getBaseDamageDice() {
        // Handle legacy enemies
        if (damageDice == null && attackDamage > 0) {
            damageDice = convertLegacyDamage(attackDamage);
        }
        String[] source = damageDice != null ? damageDice : new String[]{"d4", "d4", "d6"};
        String[] base = new String[3];
        for (int i = 0; i < 3; i++) {
            base[i] = i < source.length ? source[i] : null;
        }
        return base;
    }

    public void setDamageDice(String[] dice) {
        this.damageDice = dice;
    }

    public String getDiceOverride(int tier) {
        ensureDiceOverride();
        return diceOverride[tier];
    }

    /**
     * Temporarily override one damage-dice tier for the current battle only.
     * Not persisted (transient), so it resets whenever a fresh Enemy is loaded.
     */
    public void setDiceOverride(int tier, String die) {
        ensureDiceOverride();
        diceOverride[tier] = die;
    }

    public int getMovement() {
        return Math.max(0, mobility + Status.sumMovement(getStatuses()));
    }

    public int getHealth() {
        return health;
    }

    public int getMaxHealth() {
        return maxHealth;
    }

    public String getName() {
        if (instanceNumber > 0) {
            return baseName + " #" + instanceNumber;
        }
        return name;
    }

    public String getBaseName() {
        return baseName;
    }

    /**
     * Initiative modifier: an enemy's Dexterity is its initiative stat (the same value that
     * drives its attack rolls), including any temporary in-battle adjustment.
     */
    public int getInitiative() {
        return getAdjustedDexterity();
    }

    public int getDexterity() {
        return dexterity;
    }

    public String getColor() {
        color = ColorUtils.normalizeHex(color, ColorUtils.DEFAULT_COLOR);
        return color;
    }

    public void setSpritePath(String spritePath) {
        this.spritePath = spritePath;
    }

    public String getSpritePath() {
        return spritePath;
    }

    public List<String> getTags() {
        if (tags == null) {
            tags = new ArrayList<>();
        }
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags != null ? tags : new ArrayList<>();
    }

    public void setInstanceNumber(int number) {
        this.instanceNumber = number;
    }

    public int getInstanceNumber() {
        return instanceNumber;
    }

    public void moveTo(int r, int c) {
        row = r;
        col = c;
    }

    public void setHealth(int hp) {
        this.health = Math.max(0, Math.min(hp, maxHealth));
    }

    public void takeDamage(int dmg) {
        health -= dmg;
        if (health < 0) health = 0;
    }

    public boolean isDead() {
        return health <= 0;
    }

    public boolean isParty() {
        return false;
    }

    // Load enemy from JSON file
    public static Enemy load(String name) {
        try {
            File file = new File("saves/entities/enemies/" + name + ".json");
            if (!file.exists()) {
                return null;
            }
            Gson gson = new Gson();
            FileReader reader = new FileReader(file);
            Enemy enemy = gson.fromJson(reader, Enemy.class);
            reader.close();
            enemy.baseName = enemy.name;
            return enemy;
        } catch (Exception e) {
            System.out.println("Error loading enemy: " + e.getMessage());
            return null;
        }
    }

    /**
     * Strip characters that are illegal in a Windows filename (or unmappable by the JVM's
     * native filename encoding, which Windows silently turns into '?' - itself illegal) so
     * the display name can contain any characters without breaking the save path.
     */
    private static String sanitizeFileName(String name) {
        String sanitized = name.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_")
                .replaceAll("[.\\s]+$", "")
                .trim();
        return sanitized.isEmpty() ? "Unnamed_Enemy" : sanitized;
    }

    // Save enemy to JSON file. Returns true on success; false if the write failed (e.g. an
    // invalid filename), leaving the caller's in-memory object as the only copy.
    public boolean save() {
        try {
            File dir = new File("saves/entities/enemies");
            if (!dir.exists()) {
                dir.mkdirs();
            }
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            FileWriter writer = new FileWriter("saves/entities/enemies/" + sanitizeFileName(baseName) + ".json");
            gson.toJson(this, writer);
            writer.close();
            return true;
        } catch (Exception e) {
            System.out.println("Error saving enemy: " + e.getMessage());
            return false;
        }
    }

    // List all saved enemies
    public static String[] listSavedEnemies() {
        File dir = new File("saves/entities/enemies");
        if (!dir.exists()) {
            return new String[0];
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return new String[0];
        }
        String[] names = new String[files.length];
        for (int i = 0; i < files.length; i++) {
            names[i] = files[i].getName().replace(".json", "");
        }
        return names;
    }
}
