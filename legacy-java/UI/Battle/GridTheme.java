package UI.Battle;

import UI.SpriteUtils;
import javafx.scene.image.Image;
import javafx.scene.image.PixelWriter;
import javafx.scene.image.WritableImage;
import javafx.scene.paint.Color;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * A visual theme for the battle board: floor tile textures plus the backdrop
 * around the board.
 *
 * Tiles are loaded from resources/sprites/tiles/&lt;name&gt;_0..2.png when those
 * files exist, so any 8/16-bit tileset can be dropped in later; otherwise
 * pixel-art textures are generated procedurally (deterministic, so snapshots
 * are stable). Three variants per theme break up repetition; the renderer
 * picks one per cell from a position hash.
 */
public final class GridTheme {

    public static final int TILE_SIZE = 32;
    private static final int VARIANTS = 3;

    private static final Map<String, GridTheme> CACHE = new HashMap<>();

    public final String name;
    public final Image[] floorVariants;
    public final Color backdropBase;
    public final Image backdropTexture;

    private GridTheme(String name, Image[] floorVariants, Color backdropBase, Image backdropTexture) {
        this.name = name;
        this.floorVariants = floorVariants;
        this.backdropBase = backdropBase;
        this.backdropTexture = backdropTexture;
    }

    /** Theme names offered in pickers. */
    public static String[] names() {
        return new String[]{"stone", "grass", "dirt"};
    }

    /** Resolve a theme by name (case-insensitive); unknown names fall back to stone. */
    public static GridTheme byName(String name) {
        String key = name == null ? "stone" : name.toLowerCase().trim();
        switch (key) {
            case "grass", "dirt", "stone" -> { }
            default -> key = "stone";
        }
        return CACHE.computeIfAbsent(key, GridTheme::create);
    }

    private static GridTheme create(String name) {
        Color base = switch (name) {
            case "grass" -> Color.web("#41582f");
            case "dirt" -> Color.web("#5a4632");
            default -> Color.web("#3a3a42");
        };

        Image[] variants = new Image[VARIANTS];
        boolean allFiles = true;
        for (int i = 0; i < VARIANTS; i++) {
            Image img = SpriteUtils.loadSprite("tiles/" + name + "_" + i + ".png");
            if (img == null) {
                allFiles = false;
                break;
            }
            variants[i] = img;
        }
        if (!allFiles) {
            for (int i = 0; i < VARIANTS; i++) {
                variants[i] = generateTile(name, base, i, 1.0);
            }
        }

        // Backdrop: same material, much darker, so the board reads as the
        // lit part of a larger environment
        Color darkBase = base.deriveColor(0, 0.8, 0.32, 1.0);
        Image backdropTexture = generateTile(name, darkBase, 7, 0.6);
        return new GridTheme(name, variants, darkBase.deriveColor(0, 1, 0.75, 1.0), backdropTexture);
    }

    /**
     * Generate one 32x32 pixel-art tile: per-pixel value noise over the base
     * color, speckles, and a theme-specific detail pass (cracks / grass
     * blades / pebbles). Deterministic per (name, variant).
     */
    private static Image generateTile(String name, Color base, int variant, double detailStrength) {
        WritableImage img = new WritableImage(TILE_SIZE, TILE_SIZE);
        PixelWriter pw = img.getPixelWriter();
        Random rnd = new Random(name.hashCode() * 31L + variant * 7919L);

        for (int y = 0; y < TILE_SIZE; y++) {
            for (int x = 0; x < TILE_SIZE; x++) {
                double jitter = 1.0 + (rnd.nextDouble() - 0.5) * 0.06;
                if (rnd.nextDouble() < 0.10) {
                    jitter += (rnd.nextDouble() - 0.45) * 0.22 * detailStrength;
                }
                pw.setArgb(x, y, argb(base, jitter));
            }
        }

        switch (name) {
            case "grass" -> {
                // Short brighter blades
                for (int i = 0; i < 14; i++) {
                    int x = rnd.nextInt(TILE_SIZE);
                    int y = rnd.nextInt(TILE_SIZE - 2);
                    int c = argb(base, 1.25 + rnd.nextDouble() * 0.2 * detailStrength);
                    pw.setArgb(x, y, c);
                    pw.setArgb(x, y + 1, c);
                    if (rnd.nextBoolean() && x + 1 < TILE_SIZE) {
                        pw.setArgb(x + 1, y + 1, argb(base, 1.15));
                    }
                }
            }
            case "dirt" -> {
                // Small pebbles: light top, dark under
                for (int i = 0; i < 7; i++) {
                    int x = rnd.nextInt(TILE_SIZE - 2);
                    int y = rnd.nextInt(TILE_SIZE - 2);
                    pw.setArgb(x, y, argb(base, 1.22));
                    pw.setArgb(x + 1, y, argb(base, 1.14));
                    pw.setArgb(x, y + 1, argb(base, 0.75));
                    pw.setArgb(x + 1, y + 1, argb(base, 0.82));
                }
            }
            default -> {
                // Stone: a couple of darker crack runs
                for (int i = 0; i < 2; i++) {
                    int x = rnd.nextInt(TILE_SIZE);
                    int y = rnd.nextInt(TILE_SIZE);
                    int len = 5 + rnd.nextInt(7);
                    for (int s = 0; s < len; s++) {
                        pw.setArgb(Math.floorMod(x, TILE_SIZE), Math.floorMod(y, TILE_SIZE), argb(base, 0.72));
                        x += rnd.nextInt(3) - 1 == 0 ? 0 : 1;
                        y += rnd.nextInt(2);
                    }
                }
            }
        }
        return img;
    }

    private static int argb(Color base, double brightness) {
        int r = clamp255((int) Math.round(base.getRed() * 255 * brightness));
        int g = clamp255((int) Math.round(base.getGreen() * 255 * brightness));
        int b = clamp255((int) Math.round(base.getBlue() * 255 * brightness));
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    private static int clamp255(int v) {
        return Math.max(0, Math.min(255, v));
    }
}
