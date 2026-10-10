package UI.Battle;

/**
 * Computes the playable-cell mask for each built-in battle-grid shape, inscribed
 * in a rows x cols bounding box. Each cell is sampled at its center to avoid
 * systematic bias toward one edge of the shape.
 */
public final class GridShapes {

    public enum ShapeType { RECTANGLE, CIRCLE, DIAMOND, PLUS, CUSTOM }

    private GridShapes() {}

    /** Null means "every cell in the rectangle is playable" - the fast, back-compat path. */
    public static boolean[][] forType(ShapeType type, int rows, int cols) {
        return switch (type) {
            case RECTANGLE -> null;
            case CIRCLE -> circle(rows, cols);
            case DIAMOND -> diamond(rows, cols);
            case PLUS -> plus(rows, cols);
            case CUSTOM -> null; // caller supplies its own painted mask
        };
    }

    /** Ellipse inscribed in the bounding box. */
    public static boolean[][] circle(int rows, int cols) {
        double radiusRows = rows / 2.0;
        double radiusCols = cols / 2.0;
        double centerRow = rows / 2.0;
        double centerCol = cols / 2.0;

        boolean[][] mask = new boolean[rows][cols];
        for (int r = 0; r < rows; r++) {
            double nr = (r + 0.5 - centerRow) / radiusRows;
            for (int c = 0; c < cols; c++) {
                double nc = (c + 0.5 - centerCol) / radiusCols;
                mask[r][c] = nr * nr + nc * nc <= 1.0 + 1e-9;
            }
        }
        return mask;
    }

    /** Rotated square (L1 ball) inscribed in the bounding box. */
    public static boolean[][] diamond(int rows, int cols) {
        double radiusRows = rows / 2.0;
        double radiusCols = cols / 2.0;
        double centerRow = rows / 2.0;
        double centerCol = cols / 2.0;

        boolean[][] mask = new boolean[rows][cols];
        for (int r = 0; r < rows; r++) {
            double nr = (r + 0.5 - centerRow) / radiusRows;
            for (int c = 0; c < cols; c++) {
                double nc = (c + 0.5 - centerCol) / radiusCols;
                mask[r][c] = Math.abs(nr) + Math.abs(nc) <= 1.0 + 1e-9;
            }
        }
        return mask;
    }

    /** A centered cross with arms one-third the shorter dimension thick. */
    public static boolean[][] plus(int rows, int cols) {
        int thickness = Math.max(1, Math.round(Math.min(rows, cols) / 3.0f));
        int rowStart = (rows - thickness) / 2;
        int colStart = (cols - thickness) / 2;

        boolean[][] mask = new boolean[rows][cols];
        for (int r = 0; r < rows; r++) {
            boolean inHorizontalBar = r >= rowStart && r < rowStart + thickness;
            for (int c = 0; c < cols; c++) {
                boolean inVerticalBar = c >= colStart && c < colStart + thickness;
                mask[r][c] = inHorizontalBar || inVerticalBar;
            }
        }
        return mask;
    }

    /** Count of playable cells; treats a null mask (rectangle) as fully enabled. */
    public static int enabledCount(boolean[][] mask, int rows, int cols) {
        if (mask == null) return rows * cols;
        int count = 0;
        for (boolean[] row : mask) {
            for (boolean cell : row) {
                if (cell) count++;
            }
        }
        return count;
    }
}
