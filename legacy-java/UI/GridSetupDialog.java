package UI;

import UI.Battle.GridShapes;
import UI.Battle.GridShapes.ShapeType;
import javafx.beans.property.ObjectProperty;
import javafx.beans.property.SimpleObjectProperty;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.ComboBox;
import javafx.scene.control.ContentDisplay;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.ToggleGroup;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.FlowPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Battle grid setup: pick a shape (built-in, or a custom hand-painted one) and
 * size, preview it live, then confirm. Split into a real modal entry point
 * ({@link #show}) and a content-only builder ({@link #buildContent}) so the
 * latter can be exercised by an offscreen snapshot harness without going
 * through the untestable {@code showAndWait()} path.
 */
public final class GridSetupDialog {

    public static final int MIN_SIZE = 1;
    public static final int MAX_SIZE = 25;
    private static final double PREVIEW_SIZE = 320;

    /** Rail entries: the four built-in shapes, plus Custom Paint and the My Presets browser. */
    private enum RailMode { RECTANGLE, CIRCLE, DIAMOND, PLUS, CUSTOM, PRESETS }

    public static final class Result {
        public final int rows;
        public final int cols;
        public final boolean[][] mask; // null = rectangle (every cell playable)
        public final String themeName;

        Result(int rows, int cols, boolean[][] mask, String themeName) {
            this.rows = rows;
            this.cols = cols;
            this.mask = mask;
            this.themeName = themeName;
        }
    }

    private GridSetupDialog() {}

    /** Builds, themes, and shows the modal dialog; blocks until closed. */
    public static Optional<Result> show(Stage owner) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(owner);
        dialog.setTitle("Battle Setup");
        dialog.setResizable(false);

        ObjectProperty<Result> liveSelection = new SimpleObjectProperty<>();
        boolean[] confirmed = {false};

        BorderPane content = buildContent(liveSelection,
            () -> { confirmed[0] = true; dialog.close(); },
            dialog::close);

        Scene scene = new Scene(content, 780, 560);
        StyleUtils.applyTheme(scene);
        dialog.setScene(scene);
        dialog.showAndWait();

        return (confirmed[0] && liveSelection.get() != null)
            ? Optional.of(liveSelection.get())
            : Optional.empty();
    }

    /**
     * Builds the dialog's content with no Stage/modality attached. {@code
     * liveSelection} always reflects the currently-configured shape/size/theme;
     * {@code onStartRequested}/{@code onCancelRequested} fire on the respective
     * buttons so the caller decides what "confirm" and "close" actually do.
     */
    static BorderPane buildContent(ObjectProperty<Result> liveSelection,
            Runnable onStartRequested, Runnable onCancelRequested) {
        BorderPane root = new BorderPane();
        root.getStyleClass().add("panel-dark");
        root.setPadding(new Insets(10));

        Label titleLabel = new Label("Choose a battle grid shape and size");
        titleLabel.getStyleClass().add("label-title");
        titleLabel.setMaxWidth(Double.MAX_VALUE);
        titleLabel.setAlignment(Pos.CENTER);
        titleLabel.setPadding(new Insets(0, 0, 10, 0));
        root.setTop(titleLabel);

        int[] currentRows = {8};
        int[] currentCols = {8};
        ObjectProperty<RailMode> currentMode = new SimpleObjectProperty<>(RailMode.RECTANGLE);
        boolean[][][] paintMaskHolder = new boolean[1][][];
        int[] paintValueHolder = {1}; // captured from the first cell touched in a drag gesture
        int[] lastPaintedRow = {-1};
        int[] lastPaintedCol = {-1};

        Canvas preview = new Canvas(PREVIEW_SIZE, PREVIEW_SIZE);
        Canvas paintCanvas = new Canvas(PREVIEW_SIZE, PREVIEW_SIZE);
        Label countLabel = new Label();
        countLabel.getStyleClass().add("label-muted");

        // Declared before any use so the mode-rail buttons and the presets list's
        // "Use" callback (defined further down) can both reference it as a closure
        ToggleGroup shapeGroup = new ToggleGroup();

        Runnable[] refreshBuiltin = new Runnable[1];
        Runnable[] refreshCustom = new Runnable[1];
        Runnable[] resetPaintMask = new Runnable[1];
        Runnable[] refreshPresetsList = new Runnable[1];

        resetPaintMask[0] = () -> {
            boolean[][] m = new boolean[currentRows[0]][currentCols[0]];
            for (boolean[] row : m) Arrays.fill(row, true);
            paintMaskHolder[0] = m;
        };
        resetPaintMask[0].run();

        // ===== Center: built-in shape preview / custom paint canvas / presets browser =====
        StackPane previewWrap = new StackPane(preview);
        previewWrap.setPadding(new Insets(10));

        Button clearBtn = new Button("Clear");
        clearBtn.getStyleClass().add("button");
        Button fillBtn = new Button("Fill All");
        fillBtn.getStyleClass().add("button");
        HBox paintToolRow = new HBox(8, clearBtn, fillBtn);
        paintToolRow.setAlignment(Pos.CENTER);

        TextField presetNameField = FormUtils.createStyledTextField("Preset name", "", 160);
        Button savePresetBtn = new Button("Save Preset");
        savePresetBtn.getStyleClass().add("button-success");
        savePresetBtn.setDisable(true);
        presetNameField.textProperty().addListener((obs, o, n) -> savePresetBtn.setDisable(n.trim().isEmpty()));
        HBox saveRow = new HBox(8, presetNameField, savePresetBtn);
        saveRow.setAlignment(Pos.CENTER_LEFT);

        StackPane paintCanvasWrap = new StackPane(paintCanvas);
        paintCanvasWrap.setPadding(new Insets(10));
        VBox paintPane = new VBox(10, paintCanvasWrap, paintToolRow, saveRow);
        paintPane.setAlignment(Pos.CENTER);

        FlowPane presetsFlow = new FlowPane(10, 10);
        presetsFlow.setPadding(new Insets(10));
        ScrollPane presetsScroll = new ScrollPane(presetsFlow);
        presetsScroll.setFitToWidth(true);
        presetsScroll.getStyleClass().add("panel");

        StackPane centerStack = new StackPane(previewWrap, paintPane, presetsScroll);
        root.setCenter(centerStack);

        // ===== Right: size/theme controls =====
        HBox rowsSpinner = FormUtils.createStyledSpinner("Rows", MIN_SIZE, MAX_SIZE, currentRows[0], v -> {
            currentRows[0] = v;
            if (currentMode.get() == RailMode.CUSTOM) {
                resetPaintMask[0].run();
                refreshCustom[0].run();
            } else {
                refreshBuiltin[0].run();
            }
        });
        HBox colsSpinner = FormUtils.createStyledSpinner("Cols", MIN_SIZE, MAX_SIZE, currentCols[0], v -> {
            currentCols[0] = v;
            if (currentMode.get() == RailMode.CUSTOM) {
                resetPaintMask[0].run();
                refreshCustom[0].run();
            } else {
                refreshBuiltin[0].run();
            }
        });

        ComboBox<String> themePicker = new ComboBox<>();
        themePicker.getItems().addAll(UI.Battle.GridTheme.names());
        themePicker.setValue("stone");
        HBox themeRow = new HBox(8, new Label("Theme:"), themePicker);
        themeRow.setAlignment(Pos.CENTER_LEFT);

        VBox sizeControls = new VBox(14, rowsSpinner, colsSpinner);
        VBox controls = new VBox(14, sizeControls, themeRow, countLabel);
        controls.setAlignment(Pos.TOP_LEFT);
        controls.setPadding(new Insets(0, 0, 0, 16));

        refreshBuiltin[0] = () -> {
            ShapeType type = switch (currentMode.get()) {
                case CIRCLE -> ShapeType.CIRCLE;
                case DIAMOND -> ShapeType.DIAMOND;
                case PLUS -> ShapeType.PLUS;
                default -> ShapeType.RECTANGLE;
            };
            boolean[][] mask = GridShapes.forType(type, currentRows[0], currentCols[0]);
            drawShapePreview(preview, currentRows[0], currentCols[0], mask);
            countLabel.setText(GridShapes.enabledCount(mask, currentRows[0], currentCols[0]) + " playable tiles");
            liveSelection.set(new Result(currentRows[0], currentCols[0], mask, themePicker.getValue()));
        };
        refreshCustom[0] = () -> {
            drawShapePreview(paintCanvas, currentRows[0], currentCols[0], paintMaskHolder[0]);
            countLabel.setText(GridShapes.enabledCount(paintMaskHolder[0], currentRows[0], currentCols[0]) + " playable tiles");
            liveSelection.set(new Result(currentRows[0], currentCols[0], paintMaskHolder[0], themePicker.getValue()));
        };
        themePicker.setOnAction(e -> {
            if (currentMode.get() == RailMode.CUSTOM) {
                refreshCustom[0].run();
            } else if (currentMode.get() != RailMode.PRESETS) {
                refreshBuiltin[0].run();
            }
        });

        // ===== Paint canvas interaction: click-and-drag toggles every cell it touches =====
        paintCanvas.setOnMousePressed(e -> {
            int[] cell = pointToCell(e.getX(), e.getY(), currentRows[0], currentCols[0], PREVIEW_SIZE, PREVIEW_SIZE);
            if (cell == null) return;
            boolean newValue = !paintMaskHolder[0][cell[0]][cell[1]];
            paintValueHolder[0] = newValue ? 1 : 0;
            paintMaskHolder[0][cell[0]][cell[1]] = newValue;
            lastPaintedRow[0] = cell[0];
            lastPaintedCol[0] = cell[1];
            refreshCustom[0].run();
        });
        paintCanvas.setOnMouseDragged(e -> {
            int[] cell = pointToCell(e.getX(), e.getY(), currentRows[0], currentCols[0], PREVIEW_SIZE, PREVIEW_SIZE);
            if (cell == null || (cell[0] == lastPaintedRow[0] && cell[1] == lastPaintedCol[0])) return;
            paintMaskHolder[0][cell[0]][cell[1]] = paintValueHolder[0] == 1;
            lastPaintedRow[0] = cell[0];
            lastPaintedCol[0] = cell[1];
            refreshCustom[0].run();
        });
        clearBtn.setOnAction(e -> {
            for (boolean[] row : paintMaskHolder[0]) Arrays.fill(row, false);
            refreshCustom[0].run();
        });
        fillBtn.setOnAction(e -> {
            for (boolean[] row : paintMaskHolder[0]) Arrays.fill(row, true);
            refreshCustom[0].run();
        });
        savePresetBtn.setOnAction(e -> {
            String name = presetNameField.getText().trim();
            if (name.isEmpty()) return;
            GridShapePreset preset = new GridShapePreset(name, currentRows[0], currentCols[0], paintMaskHolder[0]);
            GridShapePresetDatabase.getInstance().savePreset(preset);
            presetNameField.setText("");
            refreshPresetsList[0].run();
        });

        // ===== My Presets browser =====
        refreshPresetsList[0] = () -> {
            presetsFlow.getChildren().clear();
            List<GridShapePreset> presets = GridShapePresetDatabase.getInstance().getAllPresets();
            if (presets.isEmpty()) {
                Label empty = new Label("No saved presets yet - paint a shape and save it to see it here.");
                empty.getStyleClass().add("label-muted");
                presetsFlow.getChildren().add(empty);
                return;
            }
            for (GridShapePreset preset : presets) {
                presetsFlow.getChildren().add(createPresetCard(preset, () -> {
                    // "Use": load into Custom Paint, pre-populated and still editable
                    currentRows[0] = preset.getRows();
                    currentCols[0] = preset.getCols();
                    boolean[][] copy = new boolean[preset.getRows()][preset.getCols()];
                    for (int r = 0; r < preset.getRows(); r++) {
                        copy[r] = preset.getMask()[r].clone();
                    }
                    paintMaskHolder[0] = copy;
                    selectRailButton(shapeGroup, RailMode.CUSTOM);
                }, () -> {
                    DialogUtils.confirm("Delete Preset", null, "Delete \"" + preset.getName() + "\"?")
                        .filter(bt -> bt == ButtonType.OK)
                        .ifPresent(bt -> {
                            GridShapePresetDatabase.getInstance().deletePreset(preset);
                            refreshPresetsList[0].run();
                        });
                }));
            }
        };

        // ===== Mode rail =====
        VBox rail = new VBox(6);
        rail.setPadding(new Insets(0, 12, 0, 0));
        rail.setPrefWidth(110);
        rail.setMinWidth(110);
        for (RailMode mode : RailMode.values()) {
            ToggleButton btn = new ToggleButton(displayName(mode));
            btn.setUserData(mode);
            btn.setGraphic(shapeGlyph(mode));
            btn.setContentDisplay(ContentDisplay.TOP);
            btn.getStyleClass().add("hotbar-tab");
            btn.setMaxWidth(Double.MAX_VALUE);
            btn.setToggleGroup(shapeGroup);
            btn.setOnAction(e -> {
                currentMode.set(mode);
                boolean showSize = mode != RailMode.PRESETS;
                sizeControls.setVisible(showSize);
                sizeControls.setManaged(showSize);
                previewWrap.setVisible(mode != RailMode.CUSTOM && mode != RailMode.PRESETS);
                previewWrap.setManaged(mode != RailMode.CUSTOM && mode != RailMode.PRESETS);
                paintPane.setVisible(mode == RailMode.CUSTOM);
                paintPane.setManaged(mode == RailMode.CUSTOM);
                presetsScroll.setVisible(mode == RailMode.PRESETS);
                presetsScroll.setManaged(mode == RailMode.PRESETS);
                if (mode == RailMode.PRESETS) {
                    refreshPresetsList[0].run();
                } else if (mode == RailMode.CUSTOM) {
                    resetPaintMask[0].run();
                    refreshCustom[0].run();
                } else {
                    refreshBuiltin[0].run();
                }
            });
            if (mode == RailMode.RECTANGLE) {
                btn.setSelected(true);
            }
            rail.getChildren().add(btn);
        }
        // Never allow the shape rail to end up with nothing selected
        shapeGroup.selectedToggleProperty().addListener((obs, oldToggle, newToggle) -> {
            if (newToggle == null) {
                shapeGroup.selectToggle(oldToggle);
            }
        });

        paintPane.setVisible(false);
        paintPane.setManaged(false);
        presetsScroll.setVisible(false);
        presetsScroll.setManaged(false);
        refreshBuiltin[0].run();

        HBox center = new HBox(0, rail, centerStack, controls);
        center.setAlignment(Pos.CENTER_LEFT);
        root.setCenter(center);

        Button startBtn = new Button("Start");
        startBtn.getStyleClass().add("button-primary");
        startBtn.setOnAction(e -> onStartRequested.run());

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> onCancelRequested.run());

        HBox buttonRow = new HBox(10, startBtn, cancelBtn);
        buttonRow.setAlignment(Pos.CENTER);
        buttonRow.setPadding(new Insets(12, 0, 0, 0));
        root.setBottom(buttonRow);

        return root;
    }

    private static void selectRailButton(ToggleGroup group, RailMode mode) {
        for (javafx.scene.control.Toggle toggle : group.getToggles()) {
            if (toggle.getUserData() == mode) {
                group.selectToggle(toggle);
                ((ToggleButton) toggle).fire();
                return;
            }
        }
    }

    private static javafx.scene.layout.VBox createPresetCard(GridShapePreset preset, Runnable onUse, Runnable onDelete) {
        VBox card = CardUtils.createBaseCard(CardUtils.CardStyle.DEFAULT);
        card.setMinWidth(150);
        card.setMaxWidth(180);

        HBox header = CardUtils.createCardHeader(preset.getName(), CardUtils.CardStyle.DEFAULT,
            IconUtils.createIcon(IconUtils.Icon.STAR, 16, CardUtils.CardStyle.DEFAULT.accentColor));

        Canvas thumb = new Canvas(120, 120);
        drawShapePreview(thumb, preset.getRows(), preset.getCols(), preset.getMask());
        StackPane thumbWrap = new StackPane(thumb);

        Label sizeLabel = new Label(preset.getRows() + " x " + preset.getCols());
        sizeLabel.getStyleClass().add("card-detail-label");

        Button useBtn = new Button("Use");
        useBtn.getStyleClass().add("button");
        useBtn.setOnAction(e -> onUse.run());

        Button deleteBtn = new Button("Delete");
        deleteBtn.getStyleClass().add("button-danger");
        deleteBtn.setOnAction(e -> onDelete.run());

        HBox actions = CardUtils.createCardFooter(useBtn, deleteBtn);

        card.getChildren().addAll(header, thumbWrap, sizeLabel, actions);
        CardUtils.addCardHoverEffect(card);
        return card;
    }

    /** Maps a canvas point to (row, col) using the same fit-to-box geometry as drawShapePreview. */
    private static int[] pointToCell(double px, double py, int rows, int cols, double canvasW, double canvasH) {
        double cellSize = Math.min(canvasW / cols, canvasH / rows);
        double offsetX = (canvasW - cellSize * cols) / 2;
        double offsetY = (canvasH - cellSize * rows) / 2;
        int col = (int) ((px - offsetX) / cellSize);
        int row = (int) ((py - offsetY) / cellSize);
        if (row < 0 || row >= rows || col < 0 || col >= cols) {
            return null;
        }
        return new int[]{row, col};
    }

    /** Matches the previous size-picker's exact palette: #2d2d30 background, #464648 playable cell. */
    private static void drawShapePreview(Canvas canvas, int rows, int cols, boolean[][] mask) {
        GraphicsContext gc = canvas.getGraphicsContext2D();
        double w = canvas.getWidth();
        double h = canvas.getHeight();
        gc.setFill(Color.web("#2d2d30"));
        gc.fillRect(0, 0, w, h);

        double cellSize = Math.min(w / cols, h / rows);
        double offsetX = (w - cellSize * cols) / 2;
        double offsetY = (h - cellSize * rows) / 2;

        gc.setFill(Color.web("#464648"));
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (mask == null || mask[r][c]) {
                    double x = offsetX + c * cellSize;
                    double y = offsetY + r * cellSize;
                    gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }
            }
        }
    }

    private static String displayName(RailMode mode) {
        return switch (mode) {
            case RECTANGLE -> "Rectangle";
            case CIRCLE -> "Circle";
            case DIAMOND -> "Diamond";
            case PLUS -> "Plus";
            case CUSTOM -> "Custom";
            case PRESETS -> "Presets";
        };
    }

    /** Small canvas-drawn silhouette for a shape-mode rail button. */
    private static Canvas shapeGlyph(RailMode mode) {
        Canvas c = new Canvas(20, 20);
        GraphicsContext gc = c.getGraphicsContext2D();
        gc.setFill(Color.web("#569cd6"));
        switch (mode) {
            case RECTANGLE -> gc.fillRect(2, 4, 16, 12);
            case CIRCLE -> gc.fillOval(2, 2, 16, 16);
            case DIAMOND -> {
                gc.beginPath();
                gc.moveTo(10, 1);
                gc.lineTo(19, 10);
                gc.lineTo(10, 19);
                gc.lineTo(1, 10);
                gc.closePath();
                gc.fill();
            }
            case PLUS -> {
                gc.fillRect(7, 1, 6, 18);
                gc.fillRect(1, 7, 18, 6);
            }
            case CUSTOM -> {
                gc.fillOval(3, 3, 14, 14);
                gc.setFill(Color.web("#2d2d30"));
                gc.fillOval(6, 6, 8, 8);
            }
            case PRESETS -> {
                double[] xs = {10, 12.4, 19, 13.8, 15.9, 10, 4.1, 6.2, 1};
                double[] ys = {1, 7.5, 7.5, 11.8, 19, 14.8, 19, 11.8, 7.5};
                gc.fillPolygon(xs, ys, xs.length);
            }
        }
        return c;
    }
}
