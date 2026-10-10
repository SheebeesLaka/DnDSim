package UI;

import EntityRes.UiPreferences;

import java.util.ArrayList;
import java.util.List;

/**
 * What the Two Display Mode player window is allowed to show. Thin typed wrapper over
 * UiPreferences (keys "display.player.*") so the choices survive restarts, plus a listener
 * list so an open player window refreshes the moment the DM flips a setting.
 */
public final class PlayerDisplayOptions {

    /** How much enemy health the players get to see. */
    public enum EnemyHp {
        EXACT("Exact", "Health ring, HP bar and the \"12/18\" numbers"),
        VAGUE("Vague", "Health ring and HP bar, but no numbers"),
        HIDDEN("Hidden", "No enemy health shown at all");

        public final String label;
        public final String description;

        EnemyHp(String label, String description) {
            this.label = label;
            this.description = description;
        }
    }

    /** Category of a floating combat text, so the player view can reword or hide it. */
    public enum TextKind { DAMAGE, HEAL, STATUS, INITIATIVE, OTHER }

    private static final String PREFIX = "display.player.";
    public static final String ENEMY_HP = PREFIX + "enemyHp";
    public static final String PARTY_HP_NUMBERS = PREFIX + "partyHpNumbers";
    public static final String COMBAT_NUMBERS = PREFIX + "combatNumbers";
    public static final String STATUS_TEXT = PREFIX + "statusText";
    public static final String ENEMY_INITIATIVE = PREFIX + "enemyInitiativeRolls";
    public static final String ENEMY_NAMES = PREFIX + "enemyNames";
    public static final String TURN_STRIP = PREFIX + "turnStrip";
    public static final String SPELL_TEMPLATES = PREFIX + "spellTemplates";

    private static final PlayerDisplayOptions INSTANCE = new PlayerDisplayOptions();
    private final List<Runnable> listeners = new ArrayList<>();

    private PlayerDisplayOptions() {}

    public static PlayerDisplayOptions get() {
        return INSTANCE;
    }

    public EnemyHp getEnemyHp() {
        String v = UiPreferences.get(ENEMY_HP);
        try {
            return v == null ? EnemyHp.EXACT : EnemyHp.valueOf(v);
        } catch (IllegalArgumentException e) {
            return EnemyHp.EXACT;
        }
    }

    public void setEnemyHp(EnemyHp mode) {
        UiPreferences.set(ENEMY_HP, mode.name());
        fireChanged();
    }

    public boolean showPartyHpNumbers() { return flag(PARTY_HP_NUMBERS, true); }
    public boolean showCombatNumbers() { return flag(COMBAT_NUMBERS, true); }
    public boolean showStatusText() { return flag(STATUS_TEXT, true); }
    public boolean showEnemyInitiative() { return flag(ENEMY_INITIATIVE, false); }
    public boolean showEnemyNames() { return flag(ENEMY_NAMES, true); }
    public boolean showTurnStrip() { return flag(TURN_STRIP, true); }
    public boolean showSpellTemplates() { return flag(SPELL_TEMPLATES, false); }

    /** Read a boolean setting, falling back to its default when never set. */
    public boolean flag(String key, boolean defaultValue) {
        String v = UiPreferences.get(key);
        return v == null ? defaultValue : Boolean.parseBoolean(v);
    }

    public void setFlag(String key, boolean value) {
        UiPreferences.set(key, String.valueOf(value));
        fireChanged();
    }

    /** Called (on the FX thread) whenever any player display setting changes. */
    public void addListener(Runnable listener) {
        listeners.add(listener);
    }

    public void removeListener(Runnable listener) {
        listeners.remove(listener);
    }

    private void fireChanged() {
        for (Runnable r : new ArrayList<>(listeners)) {
            r.run();
        }
    }

    /**
     * Reword or drop a floating combat text for the player screen.
     * @return the text to show, or null to show nothing
     */
    public String playerText(String text, TextKind kind) {
        switch (kind) {
            case DAMAGE -> {
                if (showCombatNumbers() || !text.matches("-\\d+")) return text;
                return "Hit!";
            }
            case HEAL -> {
                return showCombatNumbers() || !text.matches("\\+\\d+") ? text : "Healed";
            }
            case STATUS -> {
                return showStatusText() ? text : null;
            }
            case INITIATIVE -> {
                return showEnemyInitiative() ? text : null;
            }
            default -> {
                return text;
            }
        }
    }
}
