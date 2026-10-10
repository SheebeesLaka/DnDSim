package EntityRes;

/**
 * 5e full-caster spell slot table. Row = character level (1-20), column = spell level (1-9).
 */
public final class SpellSlots {

    public static final int MAX_SPELL_LEVEL = 9;

    private static final int[][] FULL_CASTER = {
        {2, 0, 0, 0, 0, 0, 0, 0, 0}, // 1
        {3, 0, 0, 0, 0, 0, 0, 0, 0}, // 2
        {4, 2, 0, 0, 0, 0, 0, 0, 0}, // 3
        {4, 3, 0, 0, 0, 0, 0, 0, 0}, // 4
        {4, 3, 2, 0, 0, 0, 0, 0, 0}, // 5
        {4, 3, 3, 0, 0, 0, 0, 0, 0}, // 6
        {4, 3, 3, 1, 0, 0, 0, 0, 0}, // 7
        {4, 3, 3, 2, 0, 0, 0, 0, 0}, // 8
        {4, 3, 3, 3, 1, 0, 0, 0, 0}, // 9
        {4, 3, 3, 3, 2, 0, 0, 0, 0}, // 10
        {4, 3, 3, 3, 2, 1, 0, 0, 0}, // 11
        {4, 3, 3, 3, 2, 1, 0, 0, 0}, // 12
        {4, 3, 3, 3, 2, 1, 1, 0, 0}, // 13
        {4, 3, 3, 3, 2, 1, 1, 0, 0}, // 14
        {4, 3, 3, 3, 2, 1, 1, 1, 0}, // 15
        {4, 3, 3, 3, 2, 1, 1, 1, 0}, // 16
        {4, 3, 3, 3, 2, 1, 1, 1, 1}, // 17
        {4, 3, 3, 3, 3, 1, 1, 1, 1}, // 18
        {4, 3, 3, 3, 3, 2, 1, 1, 1}, // 19
        {4, 3, 3, 3, 3, 2, 2, 1, 1}, // 20
    };

    private SpellSlots() {}

    /** Max slots of the given spell level (1-9) for a caster of the given character level. */
    public static int maxSlots(int characterLevel, int spellLevel) {
        if (spellLevel < 1 || spellLevel > MAX_SPELL_LEVEL) return 0;
        int row = Math.max(1, Math.min(20, characterLevel)) - 1;
        return FULL_CASTER[row][spellLevel - 1];
    }

    /** Highest spell level this character level has any slots for (0 if none). */
    public static int highestSlotLevel(int characterLevel) {
        for (int lvl = MAX_SPELL_LEVEL; lvl >= 1; lvl--) {
            if (maxSlots(characterLevel, lvl) > 0) return lvl;
        }
        return 0;
    }
}
