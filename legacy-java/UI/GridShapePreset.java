package UI;

/** A user-painted battle grid shape, saved under a name for reuse. */
public class GridShapePreset {

    private String name;
    private int rows;
    private int cols;
    private boolean[][] mask;

    // No-arg constructor for Gson
    private GridShapePreset() {}

    public GridShapePreset(String name, int rows, int cols, boolean[][] mask) {
        this.name = name;
        this.rows = rows;
        this.cols = cols;
        this.mask = mask;
    }

    public String getName() {
        return name;
    }

    public int getRows() {
        return rows;
    }

    public int getCols() {
        return cols;
    }

    public boolean[][] getMask() {
        return mask;
    }
}
