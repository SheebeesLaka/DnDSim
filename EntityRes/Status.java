package EntityRes;

public class Status {

    // Effect type constants
    public static final int NONE = 0;
    public static final int DAMAGE_OVER_TIME = 1;
    public static final int HEAL_OVER_TIME = 2;
    public static final int STAT_MODIFIER = 3;
    public static final int MOVEMENT_MODIFIER = 4;  // targetAttribute -1 = flat tiles of movement
    public static final int AC_MODIFIER = 5;        // flat AC bonus/penalty
    public static final int ATTACK_MODIFIER = 6;    // flat bonus/penalty to attack rolls (weapons and spells)

    public static final String[] EFFECT_TYPE_NAMES = {
        "None", "Damage over time", "Heal over time", "Stat modifier", "Movement modifier", "AC modifier", "Attack modifier"
    };

    // Target attribute constants (for STAT_MODIFIER)
    public static final int STRENGTH = 0;
    public static final int DEXTERITY = 1;
    public static final int CONSTITUTION = 2;
    public static final int INTELLIGENCE = 3;
    public static final int WISDOM = 4;
    public static final int CHARISMA = 5;

    // Available status types
    public static final String[] AVAILABLE_STATUSES = {
        "Neutral",
        "Unconscious",
        "Dead"
    };

    // Fields
    private String name;
    private int effectType;       // Type of effect (DOT, HOT, stat mod, etc.)
    private int magnitude;        // Amount of damage/heal or stat modifier
    private int duration;         // Turns remaining (-1 for permanent)
    private int targetAttribute;  // For STAT_MODIFIER: which attribute to modify

    // Constructor - simple (for backward compatibility)
    public Status(String name) {
        this.name = name;
        this.effectType = NONE;
        this.magnitude = 0;
        this.duration = -1;  // Permanent by default
        this.targetAttribute = -1;
    }

    // Constructor - full
    public Status(String name, int effectType, int magnitude, int duration, int targetAttribute) {
        this.name = name;
        this.effectType = effectType;
        this.magnitude = magnitude;
        this.duration = duration;
        this.targetAttribute = targetAttribute;
    }

    // Factory methods for common status effects
    public static Status poison(int damagePerTurn, int duration) {
        return new Status("POISONED", DAMAGE_OVER_TIME, damagePerTurn, duration, -1);
    }

    /** Sum of magnitudes for statuses of the given effect type (targetAttribute ignored). */
    public static int sumMagnitude(Iterable<Status> statuses, int effectType) {
        int total = 0;
        if (statuses == null) return 0;
        for (Status s : statuses) {
            if (s.getEffectType() == effectType) total += s.getMagnitude();
        }
        return total;
    }

    /** Sum of flat movement modifiers (MOVEMENT_MODIFIER not tied to an attribute). */
    public static int sumMovement(Iterable<Status> statuses) {
        int total = 0;
        if (statuses == null) return 0;
        for (Status s : statuses) {
            if (s.getEffectType() == MOVEMENT_MODIFIER && s.getTargetAttribute() < 0) total += s.getMagnitude();
        }
        return total;
    }
    // Methods
    public void setName(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public int getEffectType() {
        return effectType;
    }

    public void setEffectType(int effectType) {
        this.effectType = effectType;
    }

    public int getMagnitude() {
        return magnitude;
    }

    public void setMagnitude(int magnitude) {
        this.magnitude = magnitude;
    }

    public int getDuration() {
        return duration;
    }

    public void setDuration(int duration) {
        this.duration = duration;
    }

    public boolean isPermanent() {
        return duration == -1;
    }

    public int getTargetAttribute() {
        return targetAttribute;
    }

    public void setTargetAttribute(int targetAttribute) {
        this.targetAttribute = targetAttribute;
    }

    /**
     * Tick down the duration by 1. Returns true if status should be removed.
     */
    public boolean tick() {
        if (duration > 0) {
            duration--;
            return duration == 0;
        }
        return false;  // Permanent effects don't expire
    }

    @Override
    public String toString() {
        if (duration > 0) {
            return name + " (" + duration + " turns)";
        }
        return name;
    }
}
