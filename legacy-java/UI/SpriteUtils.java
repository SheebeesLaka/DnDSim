package UI;

import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.image.PixelReader;
import javafx.scene.image.PixelWriter;
import javafx.scene.image.WritableImage;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.paint.Color;
import EntityRes.CharSheet;
import EntityRes.ColorUtils;
import Objects.Enemy;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Utility class for loading and caching character/enemy sprites.
 * Provides fallback rendering when sprites are not available.
 */
public class SpriteUtils {
    
    private static final Map<String, Image> spriteCache = new HashMap<>();
    private static final String SPRITES_BASE_PATH = "resources/sprites/";

    // Standard sprite size (32x32)
    public static final int SPRITE_SIZE = 32;

    // --- Sprite sheet support ---
    // spritePath convention: "party/sheet.png#3" = row 3 of an auto-sliced
    // sheet. The corner pixel is the transparency key (magenta-background
    // style); frames are found by scanning for fully-background separator
    // rows/columns, so irregular spacing is fine. Each frame is normalized
    // bottom-centered onto a shared per-row canvas so feet stay aligned and
    // integer scaling is identical across animation frames.
    private static final Map<String, List<Image[]>> sheetCache = new HashMap<>();
    private static final long IDLE_FRAME_NANOS = 300_000_000L; // idle animation cadence
    private static final int MIN_FRAME_SIZE = 32;
    
    /**
     * Load a sprite image from the given path.
     * Caches images to avoid reloading.
     * 
     * @param spritePath Relative path from resources/sprites/ (e.g., "party/henry.png")
     * @return The loaded Image, or null if not found
     */
    public static Image loadSprite(String spritePath) {
        if (spritePath == null || spritePath.isEmpty()) {
            return null;
        }
        
        // Check cache first
        if (spriteCache.containsKey(spritePath)) {
            return spriteCache.get(spritePath);
        }
        
        // Build full path
        String fullPath = SPRITES_BASE_PATH + spritePath;
        File imageFile = new File(fullPath);
        
        if (!imageFile.exists()) {
            // Also try without the base path (in case spritePath is already full)
            imageFile = new File(spritePath);
            if (!imageFile.exists()) {
                System.out.println("Sprite not found: " + fullPath);
                spriteCache.put(spritePath, null); // Cache the miss to avoid repeated lookups
                return null;
            }
        }
        
        try {
            Image image = new Image(new FileInputStream(imageFile));
            spriteCache.put(spritePath, image);
            return image;
        } catch (Exception e) {
            System.out.println("Error loading sprite: " + e.getMessage());
            spriteCache.put(spritePath, null);
            return null;
        }
    }

    /** Whether a sprite path refers to a sheet row ("sheet.png#3") rather than a single image. */
    public static boolean isSheetRef(String spritePath) {
        return spritePath != null && spritePath.indexOf('#') >= 0;
    }

    /**
     * The sprite image to draw right now: sheet rows cycle their first two
     * (walk) frames on a fixed cadence, single images are returned as-is.
     */
    public static Image currentFrame(String spritePath) {
        if (!isSheetRef(spritePath)) {
            return loadSprite(spritePath);
        }
        Image[] frames = sheetRowFrames(spritePath);
        if (frames == null || frames.length == 0) {
            return null;
        }
        int idx = (int) ((System.nanoTime() / IDLE_FRAME_NANOS) % Math.min(2, frames.length));
        return frames[idx];
    }

    /** Non-animated representative frame, for side panels and previews. */
    public static Image staticFrame(String spritePath) {
        if (!isSheetRef(spritePath)) {
            return loadSprite(spritePath);
        }
        Image[] frames = sheetRowFrames(spritePath);
        return (frames == null || frames.length == 0) ? null : frames[0];
    }

    /** All frames of the referenced sheet row, or null if the ref is invalid. */
    private static Image[] sheetRowFrames(String spritePath) {
        int hash = spritePath.lastIndexOf('#');
        String sheetPath = spritePath.substring(0, hash);
        int row;
        try {
            row = Integer.parseInt(spritePath.substring(hash + 1).trim());
        } catch (NumberFormatException e) {
            return null;
        }
        List<Image[]> rows = loadSheet(sheetPath);
        if (rows == null || row < 0 || row >= rows.size()) {
            return null;
        }
        return rows.get(row);
    }

    private static List<Image[]> loadSheet(String sheetPath) {
        if (sheetCache.containsKey(sheetPath)) {
            return sheetCache.get(sheetPath);
        }
        Image sheet = loadSprite(sheetPath);
        List<Image[]> rows = (sheet == null || sheet.getPixelReader() == null) ? null : sliceSheet(sheet);
        sheetCache.put(sheetPath, rows);
        return rows;
    }

    /**
     * Slice a sheet into rows of frames. Separators are rows/columns made
     * entirely of the background color (sampled from the top-left pixel).
     */
    private static List<Image[]> sliceSheet(Image sheet) {
        PixelReader pr = sheet.getPixelReader();
        int w = (int) sheet.getWidth();
        int h = (int) sheet.getHeight();
        int bg = pr.getArgb(0, 0);

        boolean[] colContent = new boolean[w];
        boolean[] rowContent = new boolean[h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (pr.getArgb(x, y) != bg) {
                    colContent[x] = true;
                    rowContent[y] = true;
                }
            }
        }
        List<int[]> colRuns = contentRuns(colContent);
        List<int[]> rowRuns = contentRuns(rowContent);
        if (colRuns.isEmpty() || rowRuns.isEmpty()) {
            return null;
        }

        // One shared frame width keeps horizontal centering and integer
        // scaling consistent across every frame of the sheet
        int frameW = MIN_FRAME_SIZE;
        for (int[] cr : colRuns) {
            frameW = Math.max(frameW, cr[1] - cr[0] + 1);
        }

        List<Image[]> rows = new ArrayList<>();
        for (int[] rr : rowRuns) {
            int frameH = rr[1] - rr[0] + 1;
            Image[] frames = new Image[colRuns.size()];
            for (int i = 0; i < colRuns.size(); i++) {
                frames[i] = extractFrame(pr, colRuns.get(i), rr, frameW, frameH, bg);
            }
            rows.add(frames);
        }
        return rows;
    }

    /** Trim one frame's content and blit it bottom-centered onto a transparent canvas. */
    private static Image extractFrame(PixelReader pr, int[] colRun, int[] rowRun,
            int frameW, int frameH, int bg) {
        int minX = Integer.MAX_VALUE, maxX = -1, minY = Integer.MAX_VALUE, maxY = -1;
        for (int y = rowRun[0]; y <= rowRun[1]; y++) {
            for (int x = colRun[0]; x <= colRun[1]; x++) {
                if (pr.getArgb(x, y) != bg) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        WritableImage frame = new WritableImage(frameW, frameH);
        if (maxX < 0) {
            return frame; // empty cell stays fully transparent
        }
        PixelWriter pw = frame.getPixelWriter();
        int cw = maxX - minX + 1;
        int ch = maxY - minY + 1;
        int dx = (frameW - cw) / 2;
        int dy = frameH - ch;
        for (int y = 0; y < ch; y++) {
            for (int x = 0; x < cw; x++) {
                int argb = pr.getArgb(minX + x, minY + y);
                if (argb != bg) {
                    pw.setArgb(dx + x, dy + y, argb);
                }
            }
        }
        return frame;
    }

    /** Runs of consecutive true indices as {start, end} pairs. */
    private static List<int[]> contentRuns(boolean[] content) {
        List<int[]> runs = new ArrayList<>();
        int start = -1;
        for (int i = 0; i < content.length; i++) {
            if (content[i] && start < 0) {
                start = i;
            }
            if (!content[i] && start >= 0) {
                runs.add(new int[]{start, i - 1});
                start = -1;
            }
        }
        if (start >= 0) {
            runs.add(new int[]{start, content.length - 1});
        }
        return runs;
    }
    
    /**
     * Create an ImageView for a character's sprite.
     * Falls back to a colored circle icon if no sprite is available.
     * Sprites are scaled to fit the size while preserving aspect ratio.
     * 
     * @param charSheet The character sheet
     * @param size The desired display size
     * @return An ImageView or fallback Node
     */
    public static javafx.scene.Node createCharacterSprite(CharSheet charSheet, int size) {
        Image sprite = staticFrame(charSheet.getSpritePath());
        
        if (sprite != null) {
            ImageView view = new ImageView(sprite);
            view.setFitWidth(size);
            view.setFitHeight(size);
            view.setPreserveRatio(true); // Keep aspect ratio, don't squish
            view.setSmooth(false); // Keep pixel art crisp
            return view;
        }
        
        // Fallback: colored circle
        return createFallbackAvatar(charSheet.getColor(), size, true);
    }
    
    /**
     * Create an ImageView for an enemy's sprite.
     * Falls back to a colored circle icon if no sprite is available.
     * Sprites are scaled to fit the size while preserving aspect ratio.
     * 
     * @param enemy The enemy
     * @param size The desired display size
     * @return An ImageView or fallback Node
     */
    public static javafx.scene.Node createEnemySprite(Enemy enemy, int size) {
        Image sprite = staticFrame(enemy.getSpritePath());
        
        if (sprite != null) {
            ImageView view = new ImageView(sprite);
            view.setFitWidth(size);
            view.setFitHeight(size);
            view.setPreserveRatio(true); // Keep aspect ratio, don't squish
            view.setSmooth(false); // Keep pixel art crisp
            return view;
        }
        
        // Fallback: colored circle with enemy styling
        return createFallbackAvatar(enemy.getColor(), size, false);
    }
    
    /**
     * Create a fallback avatar when no sprite is available.
     * Uses a styled circular region with a color based on the entity's selected color.
     */
    public static javafx.scene.Node createFallbackAvatar(String colorHex, int size, boolean isParty) {
        javafx.scene.layout.StackPane avatar = new javafx.scene.layout.StackPane();
        avatar.setMinSize(size, size);
        avatar.setMaxSize(size, size);
        
        String hexColor = ColorUtils.normalizeHex(colorHex, ColorUtils.DEFAULT_COLOR);
        String borderColor = isParty ? "#4CAF50" : "#d75f5f";
        
        avatar.setStyle(String.format(
            "-fx-background-color: %s; " +
            "-fx-background-radius: %d; " +
            "-fx-border-color: %s; " +
            "-fx-border-radius: %d; " +
            "-fx-border-width: 2;",
            hexColor, size / 2, borderColor, size / 2
        ));
        
        return avatar;
    }
    
    /**
     * Draw a sprite on a canvas GraphicsContext.
     * Used by BattleGridCanvas for rendering entities on the grid.
     * Sprites are scaled to fit the cell while preserving aspect ratio.
     * 
     * @param gc The graphics context
     * @param spritePath Path to the sprite
     * @param x X coordinate (center)
     * @param y Y coordinate (center)
     * @param size Cell size to fit within
     * @param fallbackColor Fallback color if sprite not found
     * @param isParty Whether this is a party member (affects fallback border)
     */
    public static void drawSpriteOnCanvas(GraphicsContext gc, String spritePath, 
            double x, double y, double size, Color fallbackColor, boolean isParty) {
        Image sprite = loadSprite(spritePath);
        
        if (sprite != null) {
            // Scale to fit cell while preserving aspect ratio
            double spriteWidth = sprite.getWidth();
            double spriteHeight = sprite.getHeight();
            double scale = Math.min(size / spriteWidth, size / spriteHeight);
            double drawWidth = spriteWidth * scale;
            double drawHeight = spriteHeight * scale;
            double drawX = x - drawWidth / 2;
            double drawY = y - drawHeight / 2;
            gc.drawImage(sprite, drawX, drawY, drawWidth, drawHeight);
        } else {
            // Fallback to colored circle
            double radius = size / 2;
            gc.setFill(fallbackColor);
            gc.fillOval(x - radius, y - radius, size, size);
            
            // Add border based on entity type
            gc.setStroke(isParty ? Color.web("#4CAF50") : Color.web("#d75f5f"));
            gc.setLineWidth(2);
            gc.strokeOval(x - radius, y - radius, size, size);
        }
    }
    
    /**
     * Draw a unit sprite bottom-anchored in a grid tile.
     * Uses integer pixel scaling so pixel art stays crisp; sprites taller than
     * the tile extend upward past it, feet resting near the tile's bottom edge.
     * Falls back to a colored token (circle for party, square for enemies).
     *
     * @param gc The graphics context
     * @param spritePath Path to the sprite
     * @param tileX Left edge of the tile
     * @param tileY Top edge of the tile
     * @param cellSize Tile size
     * @param fallbackColor Fallback token color if sprite not found
     * @param isParty Whether this is a party member (circle token + green border)
     */
    public static void drawUnitSpriteOnCanvas(GraphicsContext gc, String spritePath,
            double tileX, double tileY, double cellSize, Color fallbackColor, boolean isParty) {
        drawUnitSpriteOnCanvas(gc, spritePath, tileX, tileY, cellSize, fallbackColor, isParty, true);
    }

    /**
     * As above, but with explicit control over sheet animation: animated
     * units cycle their walk frames, others show their static first frame.
     */
    public static void drawUnitSpriteOnCanvas(GraphicsContext gc, String spritePath,
            double tileX, double tileY, double cellSize, Color fallbackColor, boolean isParty,
            boolean animated) {
        Image sprite = animated ? currentFrame(spritePath) : staticFrame(spritePath);
        double footY = tileY + cellSize * 0.90;

        if (sprite != null) {
            double scale = unitSpriteScale(sprite, cellSize);
            double drawW = sprite.getWidth() * scale;
            double drawH = sprite.getHeight() * scale;
            double drawX = Math.round(tileX + (cellSize - drawW) / 2);
            double drawY = Math.round(footY - drawH);
            gc.drawImage(sprite, drawX, drawY, drawW, drawH);
        } else {
            double d = cellSize * 0.62;
            double topY = footY - d;
            double leftX = tileX + (cellSize - d) / 2;
            gc.setFill(fallbackColor);
            gc.setStroke(isParty ? Color.web("#4CAF50") : Color.web("#d75f5f"));
            gc.setLineWidth(2);
            if (isParty) {
                gc.fillOval(leftX, topY, d, d);
                gc.strokeOval(leftX, topY, d, d);
            } else {
                gc.fillRect(leftX, topY, d, d);
                gc.strokeRect(leftX, topY, d, d);
            }
        }
    }

    /**
     * Continuous scale so sprite size tracks the camera smoothly while
     * zooming, rather than jumping only at whole-multiple thresholds.
     * Scales by HEIGHT with a slight overshoot: sheet frames carry a lot of
     * transparent horizontal padding, so width-based scaling made characters
     * look too small in their tiles. Heads may poke above the tile - that's
     * the intended 3/4-view look.
     */
    private static double unitSpriteScale(Image sprite, double cellSize) {
        return cellSize * 1.10 / sprite.getHeight();
    }

    /**
     * The y coordinate the top of a unit's sprite (or fallback token) will be
     * drawn at by drawUnitSpriteOnCanvas. Lets callers place overlays (HP
     * bars etc.) above the unit's head, wherever it actually ends up.
     */
    public static double unitSpriteDrawTop(String spritePath, double tileY, double cellSize) {
        double footY = tileY + cellSize * 0.90;
        Image sprite = staticFrame(spritePath); // per-row canvas: same height every frame
        if (sprite != null) {
            return Math.round(footY - sprite.getHeight() * unitSpriteScale(sprite, cellSize));
        }
        return footY - cellSize * 0.62;
    }

    /**
     * Clear the sprite cache. Useful when sprites are updated externally.
     */
    public static void clearCache() {
        spriteCache.clear();
        sheetCache.clear();
    }
    
    /**
     * Check if a sprite exists for the given path.
     */
    public static boolean spriteExists(String spritePath) {
        if (spritePath == null || spritePath.isEmpty()) {
            return false;
        }

        // Sheet refs exist when the row actually resolves to frames
        if (isSheetRef(spritePath)) {
            Image[] frames = sheetRowFrames(spritePath);
            return frames != null && frames.length > 0;
        }

        // Check cache first
        if (spriteCache.containsKey(spritePath)) {
            return spriteCache.get(spritePath) != null;
        }

        // Check file existence
        String fullPath = SPRITES_BASE_PATH + spritePath;
        File imageFile = new File(fullPath);
        return imageFile.exists();
    }

    /**
     * Create a sprite node for a terrain object.
     * Falls back to a colored square if no sprite is available.
     * Sprites are scaled to fit while preserving aspect ratio.
     * 
     * @param terrain The terrain object
     * @param size The desired display size
     * @return A Node for display
     */
    public static javafx.scene.Node createTerrainSprite(Objects.TerrainObject terrain, int size) {
        Image sprite = staticFrame(terrain.getSpritePath());
        
        if (sprite != null) {
            ImageView view = new ImageView(sprite);
            view.setFitWidth(size);
            view.setFitHeight(size);
            view.setPreserveRatio(true); // Keep aspect ratio
            view.setSmooth(false);
            return view;
        }
        
        // Fallback: colored square
        return createTerrainFallback(terrain.getColor(), size);
    }

    /**
     * Create a fallback terrain display (colored square).
     */
    public static javafx.scene.Node createTerrainFallback(String colorHex, int size) {
        javafx.scene.layout.StackPane square = new javafx.scene.layout.StackPane();
        square.setMinSize(size, size);
        square.setMaxSize(size, size);
        
        String normalizedHex = ColorUtils.normalizeHex(colorHex, ColorUtils.fromLegacyIndex(8));
        
        square.setStyle(String.format(
            "-fx-background-color: %s; " +
            "-fx-background-radius: 4; " +
            "-fx-border-color: #505052; " +
            "-fx-border-radius: 4; " +
            "-fx-border-width: 1;",
            normalizedHex
        ));
        
        return square;
    }

    /**
     * How far a terrain sprite rises above its own tile, in cells. The art's
     * aspect ratio is the only height setting: a flat decal returns 0, a sprite
     * twice as tall as it is wide returns ~1.1. Lets the board reserve headroom
     * so an overhanging sprite in row 0 is not cut off by the canvas edge.
     */
    public static double terrainOverhangCells(Objects.TerrainObject terrain) {
        Image sprite = staticFrame(terrain.getSpritePath());
        if (sprite == null || sprite.getWidth() <= 0) {
            return 0; // no art: the fallback block never leaves its cell
        }
        // Mirrors drawTerrainSpriteOnCanvas: height is width-fit, base sits at 0.90
        return Math.max(0, sprite.getHeight() / sprite.getWidth() - 0.90);
    }

    /**
     * Draw a terrain sprite on a canvas GraphicsContext.
     * Sprites are scaled to cell width and bottom-anchored on the unit foot
     * line, so taller-than-wide art overhangs the rows behind it.
     */
    public static void drawTerrainSpriteOnCanvas(GraphicsContext gc, Objects.TerrainObject terrain,
            double x, double y, double cellSize) {
        Image sprite = staticFrame(terrain.getSpritePath());
        
        if (sprite != null) {
            // Scale to cell WIDTH and stand on the same foot line as units, so a
            // taller-than-wide sprite (a tree) overhangs the rows behind it rather
            // than being squashed into its tile. The back-to-front pass in
            // BattleGridCanvas.redraw() then occludes the overhang correctly.
            double footY = y + cellSize * 0.90;
            double drawHeight = sprite.getHeight() * (cellSize / sprite.getWidth());
            gc.drawImage(sprite, Math.round(x), Math.round(footY - drawHeight), cellSize, drawHeight);
        } else {
            // Fallback: extruded block - lighter top face over a darker front
            // face so flat colors still read as standing on the board
            java.awt.Color awtColor = terrain.getDisplayColor();
            Color fxColor = Color.rgb(awtColor.getRed(), awtColor.getGreen(), awtColor.getBlue());
            double inset = Math.max(2, cellSize * 0.06);
            double w = cellSize - inset * 2;
            double h = cellSize - inset * 2;
            double depth = Math.max(3, cellSize * 0.18);
            double blockX = x + inset;
            double blockY = y + inset;

            // Drop shadow peeking out below the block
            gc.setFill(Color.rgb(0, 0, 0, 0.35));
            gc.fillRect(blockX + 2, blockY + h - 2, w, 4);

            // Front face (darker), then top face
            gc.setFill(fxColor.deriveColor(0, 1.0, 0.55, 1.0));
            gc.fillRect(blockX, blockY + h - depth, w, depth);
            gc.setFill(fxColor);
            gc.fillRect(blockX, blockY, w, h - depth);

            // Lit top edge
            gc.setFill(fxColor.deriveColor(0, 0.85, 1.35, 1.0));
            gc.fillRect(blockX, blockY, w, Math.max(2, cellSize * 0.045));

            gc.setStroke(Color.rgb(0, 0, 0, 0.45));
            gc.setLineWidth(1);
            gc.strokeRect(blockX + 0.5, blockY + 0.5, w - 1, h - 1);
        }
    }
}
