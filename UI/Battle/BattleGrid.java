package UI.Battle;

import Objects.*;
import java.util.*;

public class BattleGrid {

    public static final int MAX_ELEVATION = 3;

    private final int rows;
    private final int cols;

    // Per-tile elevation level (0..MAX_ELEVATION); visual-only for now
    private final int[][] elevation;

    // Which cells are part of the playable shape; null means every cell in the
    // rows x cols rectangle is playable (the default, fully-backward-compatible case)
    private final boolean[][] enabled;

    private final List<Entity> entities = new ArrayList<>();
    private final List<Enemy> enemies = new ArrayList<>();
    private final List<TerrainObject> terrainObjects = new ArrayList<>();
    private final List<Pickup> pickups = new ArrayList<>();

    public BattleGrid(int rows, int cols, List<Entity> entities,
            List<TerrainObject> terrainObjects, List<Pickup> pickups) {
        this(rows, cols, null, entities, terrainObjects, pickups);
    }

    public BattleGrid(int rows, int cols, boolean[][] enabledMask, List<Entity> entities,
            List<TerrainObject> terrainObjects, List<Pickup> pickups) {
        this.rows = rows;
        this.cols = cols;
        this.elevation = new int[rows][cols];
        this.enabled = enabledMask;
        this.entities.addAll(entities);
        this.terrainObjects.addAll(terrainObjects);
        this.pickups.addAll(pickups);
    }

    public GridObject getObjectAt(int r, int c) {
        for (Entity e : entities) {
            if (e.getRow() == r && e.getCol() == c) {
                return e;
            }
        }

        for (Enemy e : enemies) {
            if (e.getRow() == r && e.getCol() == c) {
                return e;
            }
        }

        for (TerrainObject t : terrainObjects) {
            if (!t.isDestroyed() && t.getRow() == r && t.getCol() == c) {
                return t;
            }
        }

        for (Pickup p : pickups) {
            if (p.getRow() == r && p.getCol() == c) {
                return p;
            }
        }

        return null;
    }

    public boolean isEnabled(int r, int c) {
        return inBounds(r, c) && (enabled == null || enabled[r][c]);
    }

    public boolean isBlocked(int r, int c) {
        if (!isEnabled(r, c)) {
            return true;
        }
        for (TerrainObject t : terrainObjects) {
            if (t.getRow() == r && t.getCol() == c && !t.isDestroyed()) {
                return t.hasCollision();
            }
        }

        for (Entity e : entities) {
            if (e.getRow() == r && e.getCol() == c) {
                return true;
            }
        }

        for (Enemy e : enemies) {
            if (e.getRow() == r && e.getCol() == c) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether an entity or enemy may occupy (r,c): the cell must be enabled,
     * free of other units, and free of any terrain that has collision - unless
     * that terrain is the only thing there and has collision off, in which case
     * the unit shares the tile with it. Unlike isBlocked(), this respects
     * getObjectAt()'s precedence (a unit already standing on non-colliding
     * terrain still counts as occupied) rather than isBlocked()'s early return
     * on terrain presence alone.
     */
    public boolean canUnitStand(int r, int c) {
        if (!isEnabled(r, c)) {
            return false;
        }
        GridObject obj = getObjectAt(r, c);
        if (obj == null) {
            return true;
        }
        return obj instanceof TerrainObject && !((TerrainObject) obj).hasCollision();
    }

    public boolean inBounds(int r, int c) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    public int getElevation(int r, int c) {
        return inBounds(r, c) ? elevation[r][c] : 0;
    }

    public void setElevation(int r, int c, int level) {
        if (inBounds(r, c)) {
            elevation[r][c] = Math.max(0, Math.min(MAX_ELEVATION, level));
        }
    }

    public void adjustElevation(int r, int c, int delta) {
        setElevation(r, c, getElevation(r, c) + delta);
    }

    public TerrainObject getTerrainAt(int r, int c) {
        for (TerrainObject t : terrainObjects) {
            if (t.getRow() == r && t.getCol() == c && !t.isDestroyed()) {
                return t;
            }
        }
        return null;
    }

    public Pickup getPickupAt(int r, int c) {
        for (Pickup p : pickups) {
            if (p.getRow() == r && p.getCol() == c) {
                return p;
            }
        }
        return null;
    }

    public void removeEntity(Entity e) {
        entities.remove(e);
    }

    public void removeEnemy(Enemy e) {
        enemies.remove(e);
    }

    public void removeDestroyedTerrain() {
        terrainObjects.removeIf(TerrainObject::isDestroyed);
    }

    public void removePickup(Pickup p) {
        pickups.remove(p);
    }

    public List<TerrainObject> getTerrainObjects() {
        return terrainObjects;
    }

    public List<Pickup> getPickups() {
        return pickups;
    }

    public List<Entity> getEntities() {
        return entities;
    }

    public List<Enemy> getEnemies() {
        return enemies;
    }

    public int getRows() {
        return rows;
    }

    public int getCols() {
        return cols;
    }

    /**
     * Add an entity at its current position.
     */
    public void addEntity(Entity entity) {
        entities.add(entity);
    }
    
    /**
     * Add a terrain object at its current position.
     */
    public void addTerrain(TerrainObject terrain) {
        terrainObjects.add(terrain);
    }
    
    /**
     * Add a pickup at its current position.
     */
    public void addPickup(Pickup pickup) {
        pickups.add(pickup);
    }
    
    /**
     * Add an enemy at its current position.
     */
    public void addEnemy(Enemy enemy) {
        enemies.add(enemy);
    }
}
