package Objects;

import EntityRes.ColorUtils;

public class TerrainObject extends GridObject {

    protected String type;
    protected int health;
    protected String color;
    protected boolean collision = true;
    // Only meaningful when collision is false: whether an entity sharing this
    // tile draws in front of the terrain sprite (true) or behind it (false).
    protected boolean entityAboveTerrain = true;
    protected String spritePath; // Optional sprite image path

    public TerrainObject(int row, int col, String type, int health, String color, boolean collision) {
        super(row, col);
        this.type = type;
        this.health = health;
        this.color = ColorUtils.normalizeHex(color, ColorUtils.fromLegacyIndex(8));
        this.collision = collision;
    }

    public TerrainObject(int row, int col, String type, int health, int color, boolean collision) {
        this(row, col, type, health, ColorUtils.fromLegacyIndex(color), collision);
    }

    public TerrainObject(int row, int col, String type, int health, String color) {
        this(row, col, type, health, color, true); // Default: has collision
    }

    public TerrainObject(int row, int col, String type, int health, int color) {
        this(row, col, type, health, ColorUtils.fromLegacyIndex(color), true);
    }

    public TerrainObject(int row, int col, String type, int health) {
        this(row, col, type, health, ColorUtils.fromLegacyIndex(8));
    }

    public TerrainObject(int row, int col, int health) {
        super(row, col);
        this.type = "Generic";
        this.health = health;
        this.color = ColorUtils.fromLegacyIndex(8);
    }

    /**
     * Copy constructor - used when placing a fresh instance of a terrain template.
     */
    public TerrainObject(TerrainObject other) {
        this(other.row, other.col, other.type, other.health, other.color, other.collision);
        this.spritePath = other.spritePath;
        this.entityAboveTerrain = other.entityAboveTerrain;
    }

    public int getHealth() {
        return health;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        if (type != null && !type.trim().isEmpty()) {
            this.type = type.trim();
        }
    }

    public void setHealth(int health) {
        this.health = Math.max(0, health);
    }

    /** True if entities cannot occupy this tile (a wall, a rock, a tree trunk). */
    public boolean hasCollision() {
        return collision;
    }

    public void setCollision(boolean collision) {
        this.collision = collision;
    }

    /**
     * When collision is false, whether an entity standing on this tile draws
     * in front of the terrain sprite (true, e.g. flowers underfoot) or behind
     * it (false, e.g. tall grass that hides the entity's feet). Ignored while
     * collision is true, since no entity can ever share the tile.
     */
    public boolean isEntityAboveTerrain() {
        return entityAboveTerrain;
    }

    public void setEntityAboveTerrain(boolean entityAboveTerrain) {
        this.entityAboveTerrain = entityAboveTerrain;
    }

    public String getColor() {
        color = ColorUtils.normalizeHex(color, ColorUtils.fromLegacyIndex(8));
        return color;
    }

    public void setColor(String color) {
        this.color = ColorUtils.normalizeHex(color, ColorUtils.fromLegacyIndex(8));
    }

    public void setColor(int color) {
        setColor(ColorUtils.fromLegacyIndex(color));
    }

    public String getSpritePath() {
        return spritePath;
    }

    public void setSpritePath(String spritePath) {
        this.spritePath = spritePath;
    }

    public java.awt.Color getDisplayColor() {
        return ColorUtils.toAwtColor(color, ColorUtils.fromLegacyIndex(8));
    }

    public void takeDamage(int dmg) {
        health -= dmg;
        if (health <= 0) {
            onDestroyed();
        }
    }

    //Example override:
    // @Override
    // protected void onDestroyed() {
    //     grid.addPickup(new Pickup(row, col,
    //             new Weapon("Iron Axe", "Weapon", 6, new int[]{1, 0, 0})
    //     ));
    // }
    protected void onDestroyed() {
        // Default: do nothing
        // Subclasses override for effects

    }

    public boolean isDestroyed() {
        return health <= 0;
    }
}
