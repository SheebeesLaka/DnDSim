package UI;

import javafx.geometry.VPos;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.scene.text.TextAlignment;

/**
 * A small hex/radar chart visualizing a character's six attributes at once.
 * Complements (does not replace) the editable base/bonus/total values elsewhere.
 */
public class AttributeRadarChart extends StackPane {

    private static final String[] LABELS = {"STR", "DEX", "CON", "INT", "WIS", "CHA"};
    private static final String[] COLORS = {"#d75f5f", "#4CAF50", "#2196F3", "#FF9800", "#4ec9b0", "#c586c0"};
    private static final int AXES = 6;
    private static final double LABEL_PAD = 22;

    private final Canvas canvas;
    private int[] values = new int[AXES];

    public AttributeRadarChart(double size) {
        canvas = new Canvas(size, size);
        getChildren().add(canvas);
        draw();
    }

    /**
     * Updates the chart with new total attribute values (STR, DEX, CON, INT, WIS, CHA order) and redraws.
     */
    public void setValues(int[] totalAttributes) {
        int[] copy = new int[AXES];
        if (totalAttributes != null) {
            for (int i = 0; i < AXES && i < totalAttributes.length; i++) {
                copy[i] = totalAttributes[i];
            }
        }
        this.values = copy;
        draw();
    }

    private void draw() {
        GraphicsContext gc = canvas.getGraphicsContext2D();
        double w = canvas.getWidth();
        double h = canvas.getHeight();
        gc.clearRect(0, 0, w, h);

        double cx = w / 2;
        double cy = h / 2;
        double radius = Math.min(w, h) / 2 - LABEL_PAD;
        double startAngle = -Math.PI / 2;
        double angleStep = 2 * Math.PI / AXES;

        // 4 rings at increments of 3 (scale ceiling 12) - a single stat won't realistically
        // exceed this given the total point pool (40) is spread across all six attributes.
        // Still grows gracefully if some future build pushes a stat past that.
        int ringIncrement = 3;
        int ringCount = 4;
        int scaleMax = ringIncrement * ringCount;
        for (int v : values) {
            scaleMax = Math.max(scaleMax, v);
        }
        scaleMax = ((scaleMax + ringIncrement - 1) / ringIncrement) * ringIncrement;
        ringCount = scaleMax / ringIncrement;

        // Concentric grid rings
        gc.setStroke(Color.web("#3c3c3e"));
        gc.setLineWidth(1);
        for (int ring = 1; ring <= ringCount; ring++) {
            double r = radius * ring / (double) ringCount;
            double[] xs = new double[AXES];
            double[] ys = new double[AXES];
            for (int i = 0; i < AXES; i++) {
                double angle = startAngle + i * angleStep;
                xs[i] = cx + r * Math.cos(angle);
                ys[i] = cy + r * Math.sin(angle);
            }
            gc.strokePolygon(xs, ys, AXES);
        }

        // Axis lines
        for (int i = 0; i < AXES; i++) {
            double angle = startAngle + i * angleStep;
            gc.strokeLine(cx, cy, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        }

        // Data polygon
        double[] dataX = new double[AXES];
        double[] dataY = new double[AXES];
        for (int i = 0; i < AXES; i++) {
            double angle = startAngle + i * angleStep;
            double r = radius * Math.max(0, Math.min(1.0, (double) values[i] / scaleMax));
            dataX[i] = cx + r * Math.cos(angle);
            dataY[i] = cy + r * Math.sin(angle);
        }
        gc.setFill(Color.web("#569cd6", 0.25));
        gc.fillPolygon(dataX, dataY, AXES);
        gc.setStroke(Color.web("#569cd6"));
        gc.setLineWidth(2);
        gc.strokePolygon(dataX, dataY, AXES);

        // Vertex dots, colored per axis
        for (int i = 0; i < AXES; i++) {
            gc.setFill(Color.web(COLORS[i]));
            gc.fillOval(dataX[i] - 4, dataY[i] - 4, 8, 8);
        }

        // Axis labels
        gc.setTextAlign(TextAlignment.CENTER);
        gc.setTextBaseline(VPos.CENTER);
        gc.setFont(Font.font("Segoe UI", FontWeight.BOLD, 12));
        for (int i = 0; i < AXES; i++) {
            double angle = startAngle + i * angleStep;
            double lx = cx + (radius + LABEL_PAD - 6) * Math.cos(angle);
            double ly = cy + (radius + LABEL_PAD - 6) * Math.sin(angle);
            gc.setFill(Color.web(COLORS[i]));
            gc.fillText(LABELS[i], lx, ly);
        }
    }
}
