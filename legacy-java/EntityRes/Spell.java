package EntityRes;

/**
 * A castable spell or cantrip. Spells are standalone assets (saves/spells/*.json), not Items:
 * characters reference them by name in CharSheet.knownSpells and resolve them through SpellDatabase.
 *
 * Resolution styles:
 *  - ATTACK: d20 + casting stat vs AC, margin picks the damage tier (same as weapons)
 *  - SAVE:   target rolls d20 + saveStat vs caster DC; how badly they fail picks the tier
 *  - HEAL:   no roll to hit, roll tier-1 dice (+ upcast) and restore HP
 *  - BUFF:   no roll, just applies riderStatus to the target
 *  - AUTO:   no roll, always hits and rolls every tier's dice (e.g. Magic Missile)
 */
public class Spell {

    public static final String ATTACK = "ATTACK";
    public static final String SAVE = "SAVE";
    public static final String HEAL = "HEAL";
    public static final String BUFF = "BUFF";
    public static final String AUTO = "AUTO";
    public static final String[] RESOLUTIONS = {ATTACK, SAVE, AUTO, HEAL, BUFF};

    public static final String TARGET_ENEMY = "ENEMY";
    public static final String TARGET_ALLY = "ALLY";
    public static final String TARGET_SELF = "SELF";
    public static final String TARGET_ANY = "ANY";
    public static final String[] TARGET_TYPES = {TARGET_ENEMY, TARGET_ALLY, TARGET_SELF, TARGET_ANY};

    // Area of effect: NONE = single target. BURST = diamond of radius areaSize centered on a cell within
    // range (range 0 = centered on the caster, caster excluded). CONE/LINE start at the caster, areaSize long.
    public static final String AREA_NONE = "NONE";
    public static final String AREA_BURST = "BURST";
    public static final String AREA_CONE = "CONE";
    public static final String AREA_LINE = "LINE";
    public static final String[] AREAS = {AREA_NONE, AREA_BURST, AREA_CONE, AREA_LINE};

    public static final String ON_SAVE_NONE = "NONE";
    public static final String ON_SAVE_HALF = "HALF";

    /** Character levels at which a cantrip gains one extra copy of its tier-1 die. */
    public static final int[] CANTRIP_SCALING_LEVELS = {5, 11, 17};

    private String name;
    private String description;
    private String color;
    private int level;                 // 0 = cantrip
    private String school;
    private String resolution;
    private int range;                 // tiles; 0 = self, 1 = touch
    private String targetType;
    private String[] damageDice;       // per tier [tier1, tier2, tier3]; HEAL uses these as heal dice
    private String saveStat;           // SAVE only, e.g. "DEXTERITY"
    private String onSave;             // SAVE only: NONE or HALF
    private String upcastDie;          // added once per slot level above base; null = no upcast bonus
    private Status riderStatus;        // optional status applied on hit / failed save / buff
    private int riderMinTier;          // minimum tier for the rider (ATTACK/SAVE); 1 = any hit
    private boolean addCastingMod;     // add caster's casting modifier to damage/healing
    private int flatDamage;            // flat bonus added to the damage/healing total (e.g. Magic Missile's +3)
    private String area;               // AREA_* (null/NONE = single target)
    private int areaSize;              // burst radius or cone/line length, in tiles
    private boolean friendlyFire;      // harmful area spells also hit allies (and the caster) inside the area

    public Spell() {
        this.name = "New Spell";
        this.description = "";
        this.color = "#7B68EE";
        this.level = 0;
        this.school = "Evocation";
        this.resolution = ATTACK;
        this.range = 6;
        this.targetType = TARGET_ENEMY;
        this.damageDice = new String[]{"d10", null, null};
        this.saveStat = "DEXTERITY";
        this.onSave = ON_SAVE_NONE;
        this.riderMinTier = 1;
        this.area = AREA_NONE;
        this.areaSize = 2;
    }

    /** Fill in defaults for fields missing from older/hand-written JSON. */
    void normalize() {
        if (name == null) name = "Unnamed Spell";
        if (description == null) description = "";
        color = ColorUtils.normalizeHex(color, "#7B68EE");
        if (school == null) school = "";
        if (resolution == null) resolution = ATTACK;
        if (targetType == null) targetType = isFriendly() ? TARGET_ALLY : TARGET_ENEMY;
        if (damageDice == null) damageDice = new String[3];
        if (damageDice.length < 3) {
            String[] padded = new String[3];
            System.arraycopy(damageDice, 0, padded, 0, damageDice.length);
            damageDice = padded;
        }
        if (saveStat == null) saveStat = "DEXTERITY";
        if (onSave == null) onSave = ON_SAVE_NONE;
        if (riderMinTier < 1) riderMinTier = 1;
        level = Math.max(0, Math.min(9, level));
        range = Math.max(0, range);
        if (area == null) area = AREA_NONE;
        if (isArea() && areaSize < 1) areaSize = 1;
    }

    public boolean isArea() {
        return area != null && !AREA_NONE.equals(area);
    }

    /** A range-0 burst is centered on the caster, so it needs no aiming. */
    public boolean isSelfCenteredArea() {
        return AREA_BURST.equals(area) && range == 0;
    }

    /** "Burst 2 @ 8 tiles", "Cone 3", "Line 10", or "" for single-target spells. */
    public String getAreaLabel() {
        if (!isArea()) return "";
        String shape = area.charAt(0) + area.substring(1).toLowerCase() + " " + areaSize;
        if (AREA_BURST.equals(area)) {
            return shape + (range == 0 ? " around you" : " @ " + range + " tiles");
        }
        return shape;
    }

    public boolean isCantrip() {
        return level == 0;
    }

    /** HEAL/BUFF spells default to targeting allies and never roll against AC or a save. */
    public boolean isFriendly() {
        return HEAL.equals(resolution) || BUFF.equals(resolution);
    }

    public String getLevelLabel() {
        return level == 0 ? "Cantrip" : "Level " + level;
    }

    public int getSaveStatIndex() {
        return statIndex(saveStat);
    }

    public static int statIndex(String stat) {
        if (stat == null) return CharSheet.DEXTERITY;
        return switch (stat.toUpperCase()) {
            case "STRENGTH" -> CharSheet.STRENGTH;
            case "CONSTITUTION" -> CharSheet.CONSTITUTION;
            case "INTELLIGENCE" -> CharSheet.INTELLIGENCE;
            case "WISDOM" -> CharSheet.WISDOM;
            case "CHARISMA" -> CharSheet.CHARISMA;
            default -> CharSheet.DEXTERITY;
        };
    }

    public String getRangeLabel() {
        return range == 0 ? "Self" : range == 1 ? "Touch" : range + " tiles";
    }

    /** Tier dice as "d10 / d10 / d12" (blank tiers shown as -), or "" if the spell has no dice. */
    public String getDiceLabel() {
        StringBuilder sb = new StringBuilder();
        boolean any = false;
        for (int i = 0; i < 3; i++) {
            String die = damageDice != null && i < damageDice.length ? damageDice[i] : null;
            if (die != null && !die.isEmpty()) any = true;
            if (i > 0) sb.append(" / ");
            sb.append(die == null || die.isEmpty() ? "-" : die);
        }
        return any ? sb.toString() : "";
    }

    /** One-line mechanical summary, e.g. "DEX save · 6 tiles · d8 / d8 / d10 · Burning". */
    public String getSummary() {
        StringBuilder sb = new StringBuilder();
        switch (resolution) {
            case SAVE -> sb.append(saveStat.substring(0, Math.min(3, saveStat.length()))).append(" save")
                    .append(ON_SAVE_HALF.equals(onSave) ? " (half)" : "");
            case HEAL -> sb.append("Heal");
            case BUFF -> sb.append("Buff");
            case AUTO -> sb.append("Auto-hit");
            default -> sb.append("Spell attack");
        }
        sb.append(" · ").append(isArea() ? getAreaLabel() : getRangeLabel());
        String dice = getDiceLabel();
        if (!dice.isEmpty() && !BUFF.equals(resolution)) {
            sb.append(" · ").append(HEAL.equals(resolution) && damageDice[0] != null ? damageDice[0] : dice);
            if (flatDamage != 0) sb.append(flatDamage > 0 ? " +" : " ").append(flatDamage);
        }
        if (riderStatus != null && riderStatus.getName() != null) {
            sb.append(" · ").append(riderStatus.getName());
            if (!isFriendly() && riderMinTier > 1) sb.append(" (T").append(riderMinTier).append("+)");
        }
        return sb.toString();
    }

    /** Fresh copy of the rider so each target gets its own duration counter. */
    public Status createRiderStatus() {
        if (riderStatus == null) return null;
        return new Status(riderStatus.getName(), riderStatus.getEffectType(), riderStatus.getMagnitude(),
                riderStatus.getDuration(), riderStatus.getTargetAttribute());
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public int getLevel() { return level; }
    public void setLevel(int level) { this.level = level; }
    public String getSchool() { return school; }
    public void setSchool(String school) { this.school = school; }
    public String getResolution() { return resolution; }
    public void setResolution(String resolution) { this.resolution = resolution; }
    public int getRange() { return range; }
    public void setRange(int range) { this.range = range; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String[] getDamageDice() { return damageDice; }
    public void setDamageDice(String[] damageDice) { this.damageDice = damageDice; }
    public String getSaveStat() { return saveStat; }
    public void setSaveStat(String saveStat) { this.saveStat = saveStat; }
    public String getOnSave() { return onSave; }
    public void setOnSave(String onSave) { this.onSave = onSave; }
    public String getUpcastDie() { return upcastDie; }
    public void setUpcastDie(String upcastDie) { this.upcastDie = upcastDie; }
    public Status getRiderStatus() { return riderStatus; }
    public void setRiderStatus(Status riderStatus) { this.riderStatus = riderStatus; }
    public int getRiderMinTier() { return riderMinTier; }
    public void setRiderMinTier(int riderMinTier) { this.riderMinTier = riderMinTier; }
    public boolean isAddCastingMod() { return addCastingMod; }
    public int getFlatDamage() { return flatDamage; }
    public String getArea() { return area == null ? AREA_NONE : area; }
    public void setArea(String area) { this.area = area; }
    public int getAreaSize() { return areaSize; }
    public void setAreaSize(int areaSize) { this.areaSize = areaSize; }
    public boolean isFriendlyFire() { return friendlyFire; }
    public void setFriendlyFire(boolean friendlyFire) { this.friendlyFire = friendlyFire; }
    public void setFlatDamage(int flatDamage) { this.flatDamage = flatDamage; }
    public void setAddCastingMod(boolean addCastingMod) { this.addCastingMod = addCastingMod; }
}
