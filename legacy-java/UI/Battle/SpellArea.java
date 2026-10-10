package UI.Battle;

import EntityRes.Spell;
import Objects.GridObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Area-of-effect geometry for spells, on the same Manhattan grid the movement and range code use.
 *
 *  - BURST: diamond of radius areaSize around an aimed cell within the spell's range. A range-0
 *           burst is centered on the caster and leaves the caster's own tile out.
 *  - CONE:  starts next to the caster and widens toward the aim's dominant direction (N/E/S/W):
 *           at forward distance f it is f/2 tiles wide on each side (sizes 1, 3, 3, 5, 5...).
 *  - LINE:  a 1-wide ray from the caster toward the aimed cell, areaSize tiles long, so it can
 *           point in any direction, not just the 8 compass ones.
 */
public final class SpellArea {

    private SpellArea() {}

    /** Where a self-centered burst is aimed: the caster's own tile. */
    public static boolean isAimValid(Spell spell, GridObject caster, int aimRow, int aimCol, BattleGrid grid) {
        if (!grid.inBounds(aimRow, aimCol)) return false;
        if (spell.isSelfCenteredArea()) return true;
        if (Spell.AREA_BURST.equals(spell.getArea())) {
            int dist = Math.abs(caster.getRow() - aimRow) + Math.abs(caster.getCol() - aimCol);
            return dist <= Math.max(1, spell.getRange()) && grid.isEnabled(aimRow, aimCol);
        }
        // Cone/line just need a direction
        return aimRow != caster.getRow() || aimCol != caster.getCol();
    }

    /** Cells covered by the spell's area for the given aim, as {row, col} pairs (enabled cells only). */
    public static List<int[]> cells(Spell spell, GridObject caster, int aimRow, int aimCol, BattleGrid grid) {
        List<int[]> out = new ArrayList<>();
        if (!spell.isArea() || !isAimValid(spell, caster, aimRow, aimCol, grid)) return out;
        int cr = caster.getRow();
        int cc = caster.getCol();
        int size = Math.max(1, spell.getAreaSize());

        switch (spell.getArea()) {
            case Spell.AREA_BURST -> {
                int r0 = spell.isSelfCenteredArea() ? cr : aimRow;
                int c0 = spell.isSelfCenteredArea() ? cc : aimCol;
                for (int r = r0 - size; r <= r0 + size; r++) {
                    for (int c = c0 - size; c <= c0 + size; c++) {
                        if (Math.abs(r - r0) + Math.abs(c - c0) > size) continue;
                        if (spell.isSelfCenteredArea() && r == cr && c == cc) continue;
                        add(out, grid, r, c);
                    }
                }
            }
            case Spell.AREA_CONE -> {
                int dr = aimRow - cr;
                int dc = aimCol - cc;
                // Dominant axis picks the cone's facing
                int fr = Math.abs(dr) >= Math.abs(dc) ? Integer.signum(dr) : 0;
                int fc = fr == 0 ? Integer.signum(dc) : 0;
                for (int f = 1; f <= size; f++) {
                    int half = f / 2;
                    for (int l = -half; l <= half; l++) {
                        // lateral axis is perpendicular to the facing
                        add(out, grid, cr + fr * f + fc * l, cc + fc * f + fr * l);
                    }
                }
            }
            case Spell.AREA_LINE -> {
                int dr = aimRow - cr;
                int dc = aimCol - cc;
                double steps = Math.max(Math.abs(dr), Math.abs(dc));
                double sr = dr / steps;
                double sc = dc / steps;
                Set<Long> seen = new LinkedHashSet<>();
                for (int i = 1; i <= size; i++) {
                    int r = (int) Math.round(cr + sr * i);
                    int c = (int) Math.round(cc + sc * i);
                    if (seen.add(key(r, c))) add(out, grid, r, c);
                }
            }
            default -> {}
        }
        return out;
    }

    /**
     * Units inside the area that the spell affects. Friendly spells (heal/buff) only touch the
     * caster's side; harmful ones hit the other side, plus the caster's side when friendlyFire is on.
     */
    public static List<GridObject> targets(Spell spell, GridObject caster, List<int[]> cells, BattleGrid grid) {
        Set<Long> covered = new LinkedHashSet<>();
        for (int[] cell : cells) covered.add(key(cell[0], cell[1]));

        List<GridObject> units = new ArrayList<>();
        units.addAll(grid.getEntities());
        units.addAll(grid.getEnemies());

        List<GridObject> out = new ArrayList<>();
        for (GridObject unit : units) {
            if (!covered.contains(key(unit.getRow(), unit.getCol()))) continue;
            if (CombatManager.isTargetDead(unit)) continue;
            boolean hostile = CombatManager.isHostile(caster, unit);
            boolean affected = spell.isFriendly() ? !hostile : (hostile || spell.isFriendlyFire());
            if (affected) out.add(unit);
        }
        return out;
    }

    private static void add(List<int[]> out, BattleGrid grid, int r, int c) {
        if (grid.inBounds(r, c) && grid.isEnabled(r, c)) out.add(new int[]{r, c});
    }

    private static long key(int r, int c) {
        return ((long) r << 32) ^ (c & 0xffffffffL);
    }
}
