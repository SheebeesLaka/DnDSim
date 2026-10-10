package UI.Battle;

import EntityRes.*;
import Objects.*;
import UI.DialogUtils;
import UI.SpriteUtils;
import javafx.animation.AnimationTimer;
import javafx.animation.PauseTransition;
import javafx.geometry.VPos;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.*;
import javafx.scene.input.MouseButton;
import javafx.scene.input.MouseEvent;
import javafx.scene.layout.Pane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.paint.CycleMethod;
import javafx.scene.paint.RadialGradient;
import javafx.scene.paint.Stop;
import javafx.scene.shape.ArcType;
import javafx.scene.shape.StrokeLineCap;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.scene.text.TextAlignment;
import javafx.util.Duration;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;


public class BattleGridCanvas extends Pane {

    // Space reserved around the board for its frame and drop shadow
    private static final double BOARD_MARGIN = 20;

    // Camera: zoom multiplies the fit-to-view cell size, pan offsets the
    // centered layout in screen pixels. (1.0, 0, 0) is exactly fit-to-view.
    private static final double MIN_ZOOM = 0.5;
    private static final double MAX_ZOOM = 4.0;
    private static final double PAN_VISIBLE_MARGIN = 80;
    private static final double DRAG_THRESHOLD = 5;
    private double zoom = 1.0;
    private double panX = 0;
    private double panY = 0;
    private double pressX, pressY;
    private double lastDragX, lastDragY;
    private boolean dragging;

    // Tile under the cursor, for the +/- elevation hotkeys (-1 = none)
    private int hoverRow = -1;
    private int hoverCol = -1;

    // Movement tween pacing and floating combat text lifetime
    private static final double TWEEN_MS_PER_TILE = 90;
    private static final double FLOAT_TEXT_MS = 900;

    /** A unit sliding from its old tile toward its current grid position. */
    private static final class MoveTween {
        final double fromRow, fromCol;
        final long startNanos;
        final double durationMs;

        MoveTween(double fromRow, double fromCol, long startNanos, double durationMs) {
            this.fromRow = fromRow;
            this.fromCol = fromCol;
            this.startNanos = startNanos;
            this.durationMs = durationMs;
        }
    }

    /** Combat text rising and fading above a tile. */
    private static final class FloatingText {
        final String text;
        final Color color;
        final int row, col;
        final long startNanos;

        FloatingText(String text, Color color, int row, int col, long startNanos) {
            this.text = text;
            this.color = color;
            this.row = row;
            this.col = col;
            this.startNanos = startNanos;
        }
    }

    private final Map<GridObject, MoveTween> moveTweens = new HashMap<>();
    private final Map<GridObject, int[]> lastGridPositions = new HashMap<>();
    private final List<FloatingText> floatingTexts = new ArrayList<>();

    private GridTheme theme = GridTheme.byName("stone");

    // Repaint cadence the current unit's turn animation needs this frame:
    // 0 = passive, otherwise nanos between animation repaints. Set during
    // redraw when the current unit is drawn.
    private static final long TICK_WALK = 100_000_000L; // 2-frame walk cycle
    private static final long TICK_BOB = 33_000_000L;   // smooth bob for static sprites
    private long currentUnitTick;
    private long lastIdleAnimRedraw;

    private final Canvas canvas;
    private final BattleGrid grid;
    private final TurnManager turnManager;
    private final BattleView battleView;
    private GridObject selectedObject;
    private boolean battleStarted;
    private boolean attackMode;
    private Entity attackingEntity;
    private Enemy attackingEnemy;
    private boolean moveMode;
    private Entity movingEntity;
    private Enemy movingEnemy;
    private boolean pickupMode;
    private Entity pickupEntity;
    private boolean castMode;
    private Entity castingEntity;
    private EntityRes.Spell pendingSpell;
    private int pendingSlotLevel;
    private java.util.List<int[]> lockedAreaCells;  // template frozen in place while an area spell's rolls are entered
private final VBox infoPopup;
    private boolean infoPopupPinned;
    private GridObject infoPopupTarget;
    private final PauseTransition hoverDelay;
    private GridObject pendingHoverTarget;

    // Two Display Mode. A player-view canvas is a read-only twin of the DM canvas: same grid and
    // turn order, no input, no DM overlays. The DM canvas keeps a reference to its twin (mirror)
    // and nudges it whenever something changes; the twin animates on its own render loop.
    private final boolean playerView;
    private final UI.PlayerDisplayOptions playerOpts;
    private final BattleGridCanvas source;   // player view: the DM canvas being mirrored
    private BattleGridCanvas mirror;         // DM view: the attached player canvas, if any
    private boolean dirty;                   // player view: redraw on the next frame
    private final AnimationTimer renderLoop;

    public BattleGridCanvas(BattleGrid grid, TurnManager tm, BattleView battleView) {
        this(grid, tm, battleView, null, null);
    }

    /**
     * Read-only player-view twin of a DM canvas, for the Two Display Mode window. Shares the
     * DM canvas's grid, turn order and theme; takes no input and stays fit-to-view. Call
     * {@link #attachMirror} on the DM canvas to keep it in sync.
     */
    public BattleGridCanvas(BattleGridCanvas source, UI.PlayerDisplayOptions opts) {
        this(source.grid, source.turnManager, source.battleView, source, opts);
        this.theme = source.theme;
        this.battleStarted = source.battleStarted;
    }

    private BattleGridCanvas(BattleGrid grid, TurnManager tm, BattleView battleView,
                             BattleGridCanvas source, UI.PlayerDisplayOptions opts) {
        this.playerView = source != null;
        this.source = source;
        this.playerOpts = opts;
        this.canvas = new Canvas();
        this.grid = grid;
        this.turnManager = tm;
        this.battleView = battleView;
        this.selectedObject = null;
        this.battleStarted = false;
        this.attackMode = false;
        this.attackingEntity = null;
        this.attackingEnemy = null;
        this.moveMode = false;
        this.movingEntity = null;
        this.movingEnemy = null;
        this.pickupMode = false;
        this.pickupEntity = null;
        this.infoPopup = new VBox(3);
        this.infoPopupPinned = false;
        this.infoPopupTarget = null;
        this.hoverDelay = new PauseTransition(Duration.seconds(1));
        this.pendingHoverTarget = null;

        getChildren().add(canvas);
        setStyle("-fx-background-color: #1e1e20;");

        infoPopup.setPadding(new javafx.geometry.Insets(8, 10, 8, 10));
        infoPopup.getStyleClass().add("info-popup");
        infoPopup.setPrefWidth(160);
        infoPopup.setVisible(false);
        infoPopup.setManaged(false);
        if (!playerView) {
            getChildren().add(infoPopup);
        }

        // Bind canvas size to pane size
        canvas.widthProperty().bind(widthProperty());
        canvas.heightProperty().bind(heightProperty());

        // Redraw when size changes
        widthProperty().addListener((obs, oldVal, newVal) -> { hideInfoPopup(); clampPan(); redraw(); });
        heightProperty().addListener((obs, oldVal, newVal) -> { hideInfoPopup(); clampPan(); redraw(); });

        if (playerView) {
            // Players look, they don't touch: no selection, panning, zooming or hotkeys
            setFocusTraversable(false);
            setMouseTransparent(true);
        } else {
            // Keyboard shortcuts for menu
            setFocusTraversable(true);
            setOnKeyPressed(this::handleKeyPressed);

            // Mouse handlers
            canvas.setOnMousePressed(this::handleMousePressed);
            canvas.setOnMouseDragged(this::handleMouseDragged);
            canvas.setOnMouseReleased(this::handleMouseReleased);
            canvas.setOnScroll(this::handleScroll);
            canvas.setOnMouseMoved(this::handleMouseMoved);
            canvas.setOnMouseExited(e -> {
                hoverDelay.stop();
                pendingHoverTarget = null;
                hoverRow = -1;
                hoverCol = -1;
                hideInfoPopupIfNotPinned();
            });
        }

        // Render loop: full frame rate while movement tweens or floating
        // combat text are active, a slow tick for idle sprite animation,
        // and completely passive (event-driven redraws only) otherwise.
        // A player view also redraws once whenever its DM canvas marked it dirty.
        renderLoop = new AnimationTimer() {
            @Override
            public void handle(long now) {
                if (!moveTweens.isEmpty() || !floatingTexts.isEmpty() || dirty) {
                    dirty = false;
                    redraw();
                } else if (currentUnitTick > 0 && now - lastIdleAnimRedraw >= currentUnitTick) {
                    lastIdleAnimRedraw = now;
                    redraw();
                }
            }
        };
        renderLoop.start();
    }

    public void setBattleStarted(boolean started) {
        this.battleStarted = started;
        if (mirror != null) mirror.setBattleStarted(started);
    }

    public void setTheme(GridTheme theme) {
        this.theme = theme;
        redraw();
        if (mirror != null) mirror.setTheme(theme);
    }

    /** DM canvas: start (or with null, stop) keeping a player-view twin in sync. */
    public void attachMirror(BattleGridCanvas playerCanvas) {
        this.mirror = playerCanvas;
        if (playerCanvas != null) {
            playerCanvas.theme = theme;
            playerCanvas.battleStarted = battleStarted;
            playerCanvas.markDirty();
        }
    }

    public BattleGridCanvas getMirror() {
        return mirror;
    }

    public boolean isPlayerView() {
        return playerView;
    }

    /** Ask for a redraw on the next animation frame (coalesces bursts of DM-side redraws). */
    public void markDirty() {
        dirty = true;
    }

    /** Player view: stop the render loop once the window lets go of this canvas. */
    public void dispose() {
        renderLoop.stop();
    }

    public GridTheme getTheme() {
        return theme;
    }

    private void handleMousePressed(MouseEvent e) {
        if (e.getButton() == MouseButton.SECONDARY) {
            handleRightClick(e);
            return;
        }
        if (e.getButton() == MouseButton.PRIMARY) {
            // Selection/actions run on release; press only anchors a potential pan.
            pressX = lastDragX = e.getX();
            pressY = lastDragY = e.getY();
            dragging = false;
        }
    }

    private void handleMouseDragged(MouseEvent e) {
        if (e.getButton() != MouseButton.PRIMARY) return;
        if (!dragging) {
            if (Math.hypot(e.getX() - pressX, e.getY() - pressY) < DRAG_THRESHOLD) return;
            dragging = true;
            hoverDelay.stop();
            pendingHoverTarget = null;
            hideInfoPopupIfNotPinned();
            setCursor(javafx.scene.Cursor.CLOSED_HAND);
            // Absorb the threshold distance so the board doesn't jump
            lastDragX = e.getX();
            lastDragY = e.getY();
            return;
        }
        panX += e.getX() - lastDragX;
        panY += e.getY() - lastDragY;
        lastDragX = e.getX();
        lastDragY = e.getY();
        clampPan();
        redraw();
    }

    private void handleMouseReleased(MouseEvent e) {
        if (e.getButton() != MouseButton.PRIMARY) return;
        if (dragging) {
            dragging = false;
            setCursor(javafx.scene.Cursor.DEFAULT);
            return;
        }
        handlePrimaryAction(pressX, pressY);
    }

    /** The former on-press primary-button logic: select, or fall through to click actions. */
    private void handlePrimaryAction(double x, double y) {
        if (battleView.isElevationMode()) {
            int[] cellInfo = getCellAtPoint(x, y);
            if (cellInfo != null && grid.inBounds(cellInfo[0], cellInfo[1])) {
                battleView.applyElevationBrush(cellInfo[0], cellInfo[1]);
                requestFocus(); // so ESC can end the brush
            }
            return;
        }
        if (infoPopupPinned) {
            hideInfoPopup();
        }
        int[] cellInfo = getCellAtPoint(x, y);
        if (cellInfo != null) {
            int row = cellInfo[0];
            int col = cellInfo[1];
            if (grid.inBounds(row, col)) {
                GridObject obj = grid.getObjectAt(row, col);
                if (obj != null && !moveMode && !attackMode && !pickupMode && !castMode) {
                    // Select the entity and update action panel
                    selectedObject = obj;
                    battleView.updateSelectedEntity(obj);
                    requestFocus();
                    redraw();
                    return;
                }
            }
        }
        handleLeftClick(x, y);
    }

    private void handleRightClick(MouseEvent e) {
        int[] cellInfo = getCellAtPoint(e.getX(), e.getY());
        if (cellInfo == null) return;
        int row = cellInfo[0];
        int col = cellInfo[1];
        if (!grid.inBounds(row, col)) return;

        GridObject obj = grid.getObjectAt(row, col);
        hoverDelay.stop();
        pendingHoverTarget = null;
        if (obj instanceof Entity || obj instanceof Enemy) {
            showInfoPopup(obj, e.getX(), e.getY(), true);
            requestFocus();
        } else {
            hideInfoPopup();
        }
    }

    /**
     * Track the entity/enemy under the cursor and, after it stays under the
     * cursor for a beat, show the (non-pinned) hover info popup.
     */
    private void handleMouseMoved(MouseEvent e) {
        int[] cellInfo = getCellAtPoint(e.getX(), e.getY());
        int prevRow = hoverRow;
        int prevCol = hoverCol;
        if (cellInfo != null && grid.inBounds(cellInfo[0], cellInfo[1])) {
            hoverRow = cellInfo[0];
            hoverCol = cellInfo[1];
        } else {
            hoverRow = -1;
            hoverCol = -1;
        }
        // Area spells preview their template under the cursor
        if (castMode && pendingSpell != null && pendingSpell.isArea() && lockedAreaCells == null
                && (prevRow != hoverRow || prevCol != hoverCol)) {
            redraw();
        }

        if (infoPopupPinned) return;

        GridObject obj = null;
        if (cellInfo != null && grid.inBounds(cellInfo[0], cellInfo[1])) {
            GridObject candidate = grid.getObjectAt(cellInfo[0], cellInfo[1]);
            if (candidate instanceof Entity || candidate instanceof Enemy) {
                obj = candidate;
            }
        }

        if (obj == pendingHoverTarget) {
            // Still hovering the same target - let any pending timer keep running.
            return;
        }

        // Hover target changed - reset the delay and hide whatever was showing.
        hoverDelay.stop();
        pendingHoverTarget = obj;
        hideInfoPopupIfNotPinned();

        if (obj != null) {
            final GridObject hoverTarget = obj;
            final double mx = e.getX();
            final double my = e.getY();
            hoverDelay.setOnFinished(ev -> {
                if (pendingHoverTarget == hoverTarget && !infoPopupPinned) {
                    showInfoPopup(hoverTarget, mx, my, false);
                }
            });
            hoverDelay.playFromStart();
        }
    }

    /**
     * Show the hover/pinned info popup for an entity or enemy.
     * Pinned popups (right-click) include a Delete button and stay open until
     * the user left-clicks elsewhere on the grid.
     */
    private void showInfoPopup(GridObject obj, double mouseX, double mouseY, boolean pinned) {
        infoPopup.getChildren().clear();

        Label nameLabel = new Label(CombatManager.getTargetName(obj));
        nameLabel.setStyle("-fx-text-fill: #ffffff; -fx-font-size: 13px; -fx-font-weight: bold;");
        infoPopup.getChildren().add(nameLabel);

        int hp = CombatManager.getTargetHealth(obj);
        int maxHp = CombatManager.getTargetMaxHealth(obj);
        int ac = CombatManager.getTargetAC(obj);
        int mobility = 0;
        if (obj instanceof Entity entity) {
            mobility = entity.getMovement();
        } else if (obj instanceof Enemy enemy) {
            mobility = enemy.getMovement();
        }

        java.util.List<String> diceList = new java.util.ArrayList<>();
        String[] dice = CombatManager.getDamageDice(obj);
        if (dice != null) {
            for (String d : dice) {
                if (d != null) diceList.add(d);
            }
        }
        String diceText = String.join("/", diceList);

        for (String line : new String[]{
                "HP: " + hp + " / " + maxHp,
                "AC: " + ac,
                "MOB: " + mobility,
                "DMG: " + diceText}) {
            Label l = new Label(line);
            l.setStyle("-fx-text-fill: #dcdcdc; -fx-font-size: 11px;");
            infoPopup.getChildren().add(l);
        }

        if (pinned) {
            Button deleteBtn = new Button("Delete");
            deleteBtn.getStyleClass().addAll("button", "button-danger");
            deleteBtn.setOnAction(ev -> deleteObject(obj));
            infoPopup.getChildren().add(deleteBtn);
        }

        infoPopupPinned = pinned;
        infoPopupTarget = obj;
        infoPopup.setVisible(true);
        // The popup is unmanaged, so its parent Pane never resizes it to fit its
        // content. applyCss() must run first so children's font/padding styles are
        // resolved before autosize() reads their preferred heights - otherwise the
        // computed height comes back too short and the background only covers part
        // of the content (e.g. just the name row).
        infoPopup.applyCss();
        infoPopup.autosize();

        double popupWidth = infoPopup.getWidth();
        double popupHeight = infoPopup.getHeight();

        double px = mouseX + 12;
        double py = mouseY + 12;
        if (px + popupWidth > getWidth()) px = mouseX - popupWidth - 12;
        if (py + popupHeight > getHeight()) py = mouseY - popupHeight - 12;
        if (px < 0) px = 4;
        if (py < 0) py = 4;

        infoPopup.setLayoutX(px);
        infoPopup.setLayoutY(py);
    }

    private void hideInfoPopupIfNotPinned() {
        if (!infoPopupPinned) {
            infoPopup.setVisible(false);
            infoPopupTarget = null;
        }
    }

    private void hideInfoPopup() {
        infoPopup.setVisible(false);
        infoPopupPinned = false;
        infoPopupTarget = null;
    }

    /**
     * Remove an entity or enemy from the board via the info popup's Delete button.
     */
    private void deleteObject(GridObject obj) {
        if (obj instanceof Entity entity) {
            grid.removeEntity(entity);
            turnManager.removeEntity(entity);
        } else if (obj instanceof Enemy enemy) {
            grid.removeEnemy(enemy);
            turnManager.removeEnemy(enemy);
        }

        if (selectedObject == obj) {
            selectedObject = null;
            battleView.updateSelectedEntity(null);
        }

        hideInfoPopup();
        redraw();
        battleView.refreshPartyHealth();
    }

    private void handleKeyPressed(javafx.scene.input.KeyEvent e) {
        // Reset camera to fit-to-view
        if (e.getCode() == javafx.scene.input.KeyCode.HOME) {
            resetCamera();
            e.consume();
            return;
        }

        // Handle ESCAPE for object placement mode
        if (battleView.isObjectPlacementMode() && e.getCode() == javafx.scene.input.KeyCode.ESCAPE) {
            battleView.cancelObjectPlacement();
            e.consume();
            return;
        }

        // Handle ESCAPE for the elevation brush
        if (battleView.isElevationMode() && e.getCode() == javafx.scene.input.KeyCode.ESCAPE) {
            battleView.cancelElevationMode();
            e.consume();
            return;
        }

        // Raise/lower the hovered tile
        if (hoverRow >= 0) {
            switch (e.getCode()) {
                case EQUALS, PLUS, ADD -> {
                    grid.adjustElevation(hoverRow, hoverCol, 1);
                    redraw();
                    e.consume();
                    return;
                }
                case MINUS, SUBTRACT -> {
                    grid.adjustElevation(hoverRow, hoverCol, -1);
                    redraw();
                    e.consume();
                    return;
                }
                default -> {}
            }
        }
        
        // Handle shortcuts when entity is selected
        if (battleStarted && selectedObject != null) {
            if (selectedObject instanceof Entity entity && entity.isParty()) {
                switch (e.getCode()) {
                    case F -> {
                        // Toggle move mode
                        if (moveMode && movingEntity == entity) {
                            cancelModes();
                        } else {
                            triggerMove(entity);
                        }
                        e.consume();
                    }
                    case E -> {
                        // Toggle attack mode
                        if (attackMode && attackingEntity == entity) {
                            cancelModes();
                        } else {
                            triggerAttack(entity);
                        }
                        e.consume();
                    }
                    case R -> {
                        triggerUseItem(entity);
                        e.consume();
                    }
                    case Q -> {
                        triggerSwapForSelected();
                        e.consume();
                    }
                    case C -> {
                        // Toggle cast mode
                        if (castMode && castingEntity == entity) {
                            cancelModes();
                        } else {
                            triggerCast(entity);
                        }
                        e.consume();
                    }
                    case P -> {
                        // Toggle pickup mode
                        if (pickupMode && pickupEntity == entity) {
                            cancelModes();
                        } else {
                            triggerPickup(entity);
                        }
                        e.consume();
                    }
                    case ESCAPE -> {
                        cancelModes();
                        e.consume();
                    }
                    default -> {}
                }
            } else if (selectedObject instanceof Enemy enemy) {
                switch (e.getCode()) {
                    case F -> {
                        // Toggle move mode
                        if (moveMode && movingEnemy == enemy) {
                            cancelModes();
                        } else {
                            triggerEnemyMove(enemy);
                        }
                        e.consume();
                    }
                    case E -> {
                        // Toggle attack mode
                        if (attackMode && attackingEnemy == enemy) {
                            cancelModes();
                        } else {
                            triggerEnemyAttack(enemy);
                        }
                        e.consume();
                    }
                    case ESCAPE -> {
                        cancelModes();
                        e.consume();
                    }
                    default -> {}
                }
            }
        }
    }

    private void cancelModes() {
        moveMode = false;
        movingEntity = null;
        movingEnemy = null;
        attackMode = false;
        attackingEntity = null;
        attackingEnemy = null;
        pickupMode = false;
        pickupEntity = null;
        clearCastMode();
        redraw();
    }

    private void clearCastMode() {
        castMode = false;
        castingEntity = null;
        pendingSpell = null;
        pendingSlotLevel = 0;
        lockedAreaCells = null;
    }

    private void triggerMove(Entity entity) {
        clearCastMode();
        selectedObject = entity;
        attackMode = false;
        attackingEntity = null;
        pickupMode = false;
        pickupEntity = null;
        moveMode = true;
        movingEntity = entity;
        redraw();
    }

    private void triggerAttack(Entity entity) {
        // Check if entity has ammo for ranged weapon
        if (!CombatManager.hasAmmoForWeapon(entity)) {
            Weapon weapon = entity.getCharSheet().getEquippedWeapon();
            String ammoType = weapon != null ? weapon.getAmmoType() : "ammo";
            showAlert(Alert.AlertType.WARNING, "No Ammunition", 
                "No " + ammoType + " ammo in inventory!");
            return;
        }
        clearCastMode();
        selectedObject = entity;
        attackMode = true;
        attackingEntity = entity;
        pickupMode = false;
        pickupEntity = null;
        redraw();
    }

    private void triggerUseItem(Entity entity) {
        java.util.List<Consumable> consumables = new java.util.ArrayList<>();
        for (Item item : entity.getCharSheet().getInventory()) {
            if (item instanceof Consumable c) {
                consumables.add(c);
            }
        }
        if (consumables.isEmpty()) {
            showAlert(Alert.AlertType.WARNING, "No Items", "No consumable items in inventory.");
            return;
        }
        // Show item selection dialog
        java.util.List<String> choices = new java.util.ArrayList<>();
        for (Consumable c : consumables) {
            choices.add(c.getName() + " (x" + c.getQuantity() + ")");
        }
        ChoiceDialog<String> dialog = new ChoiceDialog<>(choices.get(0), choices);
        dialog.setTitle("Use Item");
        dialog.setHeaderText("Select an item to use:");
        DialogUtils.theme(dialog);
        dialog.showAndWait().ifPresent(choice -> {
            int idx = choices.indexOf(choice);
            if (idx >= 0) {
                Consumable consumable = consumables.get(idx);
                useConsumable(entity, consumable);
            }
        });
    }

    private void useConsumable(Entity entity, Consumable consumable) {
        // Show d10 roll dialog for efficacy
        showEfficacyRollDialog(entity, consumable);
    }
    
    /**
     * Show a dialog to roll d10 for item efficacy.
     * Roll determines healing percentage: 1-10 = 10%-100%
     */
    private void showEfficacyRollDialog(Entity entity, Consumable consumable) {
        Dialog<Integer> dialog = new Dialog<>();
        dialog.setTitle("Item Efficacy Roll");
        dialog.setHeaderText("Roll d10 for " + consumable.getName() + " efficacy");
        
        VBox content = new VBox(12);
        content.setPadding(new javafx.geometry.Insets(15));
        content.setAlignment(javafx.geometry.Pos.CENTER);
        
        // Info about the item
        Label itemInfo = new Label("Base healing: " + consumable.getHealAmount() + " HP");
        itemInfo.setStyle("-fx-font-size: 13px; -fx-text-fill: #dcdcdc;");

        Label rollInfo = new Label("Roll determines efficacy (1=10%, 10=100%)");
        rollInfo.getStyleClass().add("label-muted");
        
        // Input field
        TextField rollInput = new TextField();
        rollInput.setPromptText("Enter d10 roll (1-10)");
        rollInput.setPrefWidth(150);
        rollInput.setStyle("-fx-font-size: 14px; -fx-alignment: center;");

        Slider rollSlider = UI.FormUtils.attachRollSlider(rollInput, 1, 10);
        rollSlider.setPrefWidth(150);

        // Preview label for showing calculated heal
        Label previewLabel = new Label("");
        previewLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #4CAF50;");
        
        // Update preview as user types
        rollInput.textProperty().addListener((obs, oldVal, newVal) -> {
            try {
                int roll = Integer.parseInt(newVal.trim());
                if (roll >= 1 && roll <= 10) {
                    int efficacyPercent = roll * 10;
                    int healAmount = (int) Math.ceil(consumable.getHealAmount() * efficacyPercent / 100.0);
                    previewLabel.setText("Heals " + healAmount + " HP (" + efficacyPercent + "% efficacy)");
                    previewLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #4CAF50;");
                } else {
                    previewLabel.setText("Enter 1-10");
                    previewLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #d75f5f;");
                }
            } catch (NumberFormatException e) {
                previewLabel.setText("");
            }
        });
        
        content.getChildren().addAll(itemInfo, rollInfo, rollSlider, rollInput, previewLabel);
        
        dialog.getDialogPane().setContent(content);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);
        DialogUtils.theme(dialog);

        // Disable OK until valid input
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setDisable(true);
        
        rollInput.textProperty().addListener((obs, oldVal, newVal) -> {
            try {
                int roll = Integer.parseInt(newVal.trim());
                okBtn.setDisable(roll < 1 || roll > 10);
            } catch (NumberFormatException e) {
                okBtn.setDisable(true);
            }
        });
        
        dialog.setResultConverter(buttonType -> {
            if (buttonType == ButtonType.OK) {
                try {
                    return Integer.parseInt(rollInput.getText().trim());
                } catch (NumberFormatException e) {
                    return null;
                }
            }
            return null;
        });
        
        dialog.showAndWait().ifPresent(roll -> {
            applyConsumableWithEfficacy(entity, consumable, roll);
        });
    }
    
    /**
     * Apply consumable effect with the rolled efficacy.
     */
    private void applyConsumableWithEfficacy(Entity entity, Consumable consumable, int roll) {
        int efficacyPercent = roll * 10;
        
        if (consumable.getHealAmount() > 0) {
            int healAmount = (int) Math.ceil(consumable.getHealAmount() * efficacyPercent / 100.0);
            entity.getCharSheet().addCurrentHP(healAmount);
            spawnFloatingText(entity, "+" + healAmount, Color.web("#4CAF50"), UI.PlayerDisplayOptions.TextKind.HEAL);
        }
        if (consumable.getEffect() != null) {
            entity.getCharSheet().addStatus(consumable.getEffect());
        }
        
        if (consumable.getQuantity() > 1) {
            consumable.decQuantity();
        } else {
            entity.getCharSheet().getInventory().remove(consumable);
        }
        entity.getCharSheet().save();
        redraw();
        battleView.refreshPartyHealth();
    }

    private void triggerPickup(Entity entity) {
        clearCastMode();
        selectedObject = entity;
        attackMode = false;
        attackingEntity = null;
        moveMode = false;
        movingEntity = null;
        pickupMode = true;
        pickupEntity = entity;
        redraw();
    }

    public void startPickupMode() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            triggerPickup(entity);
        }
    }

    private void triggerEnemyMove(Enemy enemy) {
        clearCastMode();
        selectedObject = enemy;
        attackMode = false;
        attackingEntity = null;
        attackingEnemy = null;
        pickupMode = false;
        pickupEntity = null;
        moveMode = true;
        movingEntity = null;
        movingEnemy = enemy;
        redraw();
    }

    private void triggerEnemyAttack(Enemy enemy) {
        clearCastMode();
        selectedObject = enemy;
        attackMode = true;
        attackingEntity = null;
        attackingEnemy = enemy;
        pickupMode = false;
        pickupEntity = null;
        moveMode = false;
        movingEntity = null;
        movingEnemy = null;
        redraw();
    }

    public void startMoveMode() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            triggerMove(entity);
        } else if (selectedObject instanceof Enemy enemy) {
            triggerEnemyMove(enemy);
        }
    }

    public void startAttackMode() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            triggerAttack(entity);
        } else if (selectedObject instanceof Enemy enemy) {
            triggerEnemyAttack(enemy);
        }
    }

    public void startCastMode() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            triggerCast(entity);
        }
    }

    /**
     * Open the spell picker for a caster, then either resolve a self-only spell immediately or
     * enter cast mode so the player can click a target within range.
     */
    private void triggerCast(Entity entity) {
        if (!entity.getCharSheet().isCaster() || entity.getCharSheet().getKnownSpells().isEmpty()) {
            showAlert(Alert.AlertType.INFORMATION, "No Spells",
                entity.getName() + " has no spellcasting stat or known spells.\nSet them up on the character sheet.");
            return;
        }
        cancelModes();
        selectedObject = entity;
        java.util.Optional<SpellPickerDialog.SpellChoice> choice = SpellPickerDialog.show(entity);
        if (choice.isEmpty()) {
            redraw();
            return;
        }
        pendingSpell = choice.get().spell();
        pendingSlotLevel = choice.get().slotLevel();
        castingEntity = entity;
        castMode = true;

        if (pendingSpell.isArea()) {
            if (pendingSpell.isSelfCenteredArea()) {
                resolveAreaAt(entity.getRow(), entity.getCol());
            } else {
                redraw();
            }
            return;
        }
        if (EntityRes.Spell.TARGET_SELF.equals(pendingSpell.getTargetType()) || pendingSpell.getRange() == 0) {
            resolveSpellOn(entity);
            return;
        }
        redraw();
    }

    /** Whether a grid object is a legal, in-range target for the spell being cast. */
    private boolean isCastTarget(GridObject obj) {
        if (!castMode || castingEntity == null || pendingSpell == null || obj == null) return false;
        if (pendingSpell.isArea()) return false;  // area spells pick cells, not units
        return CombatManager.isValidSpellTarget(castingEntity, obj, pendingSpell)
            && CombatManager.isInRange(castingEntity, obj, pendingSpell.getRange());
    }

    /** Route the pending spell to the right resolution flow. */
    private void resolveSpellOn(GridObject target) {
        Entity caster = castingEntity;
        EntityRes.Spell spell = pendingSpell;
        int slot = pendingSlotLevel;
        DiceRollPanel dicePanel = battleView.getDiceRollPanel();

        switch (spell.getResolution()) {
            case EntityRes.Spell.SAVE -> {
                battleView.showDiceRollPanel();
                dicePanel.startSavingThrow(caster, target, spell, slot, this::handleSpellOutcome, this::handleCastCancelled);
            }
            case EntityRes.Spell.AUTO -> {
                battleView.showDiceRollPanel();
                dicePanel.startAutoHit(caster, target, spell, slot, this::handleSpellOutcome, this::handleCastCancelled);
            }
            case EntityRes.Spell.HEAL -> {
                battleView.showDiceRollPanel();
                dicePanel.startHeal(caster, target, spell, slot, this::handleSpellOutcome, this::handleCastCancelled);
            }
            case EntityRes.Spell.BUFF -> {
                // No roll: the buff simply lands
                DiceRollPanel.AttackOutcome outcome = new DiceRollPanel.AttackOutcome(
                    caster, target, true, 1, 0, 0, 0, 0, 0);
                outcome.spell = spell;
                outcome.slotLevel = slot;
                outcome.applyRider = true;
                handleSpellOutcome(outcome);
            }
            default -> {
                battleView.showDiceRollPanel();
                dicePanel.startSpellAttack(caster, target, spell, slot, this::handleSpellOutcome, this::handleCastCancelled);
            }
        }
    }

    private void handleSpellOutcome(DiceRollPanel.AttackOutcome outcome) {
        GridObject caster = outcome.attacker;
        GridObject target = outcome.target;
        EntityRes.Spell spell = outcome.spell;
        Color spellColor = Color.web(spell.getColor());

        // The slot is spent once the spell resolves, hit or miss (cancelling refunds it)
        if (caster instanceof Entity e) {
            e.getCharSheet().spendSpellSlot(outcome.slotLevel);
        }

        if (EntityRes.Spell.HEAL.equals(spell.getResolution())) {
            int healed = CombatManager.applyHealing(target, outcome.totalDamage);
            spawnFloatingText(target, "+" + healed, Color.web("#7ee08a"), UI.PlayerDisplayOptions.TextKind.HEAL);
        } else if (EntityRes.Spell.BUFF.equals(spell.getResolution())) {
            // Floating text comes from the rider below
        } else if (outcome.hit && outcome.totalDamage > 0) {
            CombatManager.applyDamage(target, outcome.totalDamage);
            boolean crit = EntityRes.Spell.ATTACK.equals(spell.getResolution()) && outcome.d20Roll == 20;
            spawnFloatingText(target, "-" + outcome.totalDamage, crit ? Color.web("#FFD700") : spellColor.brighter(),
                UI.PlayerDisplayOptions.TextKind.DAMAGE);
        } else if (!outcome.hit) {
            spawnFloatingText(target, outcome.saved ? "Saved" : "Miss", Color.web("#b8b8c0"));
        }

        boolean defeated = !EntityRes.Spell.HEAL.equals(spell.getResolution()) && CombatManager.isTargetDead(target);
        if (outcome.applyRider && !defeated) {
            EntityRes.Status rider = spell.createRiderStatus();
            if (rider != null && CombatManager.applyStatus(target, rider)) {
                boolean delay = !EntityRes.Spell.BUFF.equals(spell.getResolution());
                if (delay) {
                    PauseTransition later = new PauseTransition(Duration.millis(450));
                    later.setOnFinished(ev -> {
                        spawnFloatingText(target, rider.getName(), spellColor, UI.PlayerDisplayOptions.TextKind.STATUS);
                        redraw();
                    });
                    later.play();
                } else {
                    spawnFloatingText(target, rider.getName(), spellColor, UI.PlayerDisplayOptions.TextKind.STATUS);
                }
            }
        }
        if (defeated) {
            removeDefeated(target);
        }

        finishCast(caster);
    }

    private void handleCastCancelled() {
        finishCast(castingEntity);
    }

    /** Template cells for the current aim: frozen once rolling starts, else under the cursor. */
    private java.util.List<int[]> currentAreaCells() {
        if (lockedAreaCells != null) return lockedAreaCells;
        if (!castMode || castingEntity == null || pendingSpell == null || !pendingSpell.isArea()) return java.util.List.of();
        if (pendingSpell.isSelfCenteredArea()) {
            return SpellArea.cells(pendingSpell, castingEntity, castingEntity.getRow(), castingEntity.getCol(), grid);
        }
        if (hoverRow < 0) return java.util.List.of();
        return SpellArea.cells(pendingSpell, castingEntity, hoverRow, hoverCol, grid);
    }

    /** Cast the pending area spell aimed at a cell. No targets inside = nothing happens, slot kept. */
    private void resolveAreaAt(int aimRow, int aimCol) {
        Entity caster = castingEntity;
        EntityRes.Spell spell = pendingSpell;
        int slot = pendingSlotLevel;
        java.util.List<int[]> cells = SpellArea.cells(spell, caster, aimRow, aimCol, grid);
        java.util.List<GridObject> targets = SpellArea.targets(spell, caster, cells, grid);
        if (targets.isEmpty()) {
            spawnFloatingText(aimRow, aimCol, "No targets", Color.web("#b8b8c0"));
            if (spell.isSelfCenteredArea()) {
                finishCast(caster);  // nothing to aim, so drop out of cast mode
            } else {
                redraw();
            }
            return;
        }
        lockedAreaCells = cells;
        redraw();

        if (EntityRes.Spell.BUFF.equals(spell.getResolution())) {
            java.util.List<DiceRollPanel.AreaHit> hits = new java.util.ArrayList<>();
            for (GridObject t : targets) hits.add(new DiceRollPanel.AreaHit(t, 1, 0, false, false, true));
            handleAreaOutcome(new DiceRollPanel.AreaOutcome(caster, spell, slot, hits));
            return;
        }
        battleView.showDiceRollPanel();
        battleView.getDiceRollPanel().startAreaSpell(caster, targets, spell, slot,
            this::handleAreaOutcome, this::handleCastCancelled);
    }

    private void handleAreaOutcome(DiceRollPanel.AreaOutcome outcome) {
        GridObject caster = outcome.caster;
        EntityRes.Spell spell = outcome.spell;
        Color spellColor = Color.web(spell.getColor());
        boolean heal = EntityRes.Spell.HEAL.equals(spell.getResolution());
        boolean buff = EntityRes.Spell.BUFF.equals(spell.getResolution());

        if (caster instanceof Entity e) {
            e.getCharSheet().spendSpellSlot(outcome.slotLevel);
        }

        java.util.List<GridObject> defeated = new java.util.ArrayList<>();
        for (DiceRollPanel.AreaHit hit : outcome.hits) {
            GridObject target = hit.target;
            if (heal) {
                int healed = CombatManager.applyHealing(target, hit.damage);
                spawnFloatingText(target, "+" + healed, Color.web("#7ee08a"), UI.PlayerDisplayOptions.TextKind.HEAL);
            } else if (!buff) {
                if (hit.damage > 0) {
                    CombatManager.applyDamage(target, hit.damage);
                    spawnFloatingText(target, "-" + hit.damage, hit.crit ? Color.web("#FFD700") : spellColor.brighter(),
                        UI.PlayerDisplayOptions.TextKind.DAMAGE);
                } else if (hit.tier == 0) {
                    spawnFloatingText(target, hit.saved ? "Saved" : "Miss", Color.web("#b8b8c0"));
                }
            }
            boolean dead = !heal && CombatManager.isTargetDead(target);
            if (hit.applyRider && !dead) {
                EntityRes.Status rider = spell.createRiderStatus();
                if (rider != null && CombatManager.applyStatus(target, rider)) {
                    if (buff) {
                        spawnFloatingText(target, rider.getName(), spellColor, UI.PlayerDisplayOptions.TextKind.STATUS);
                    } else {
                        PauseTransition later = new PauseTransition(Duration.millis(450));
                        later.setOnFinished(ev -> {
                            spawnFloatingText(target, rider.getName(), spellColor, UI.PlayerDisplayOptions.TextKind.STATUS);
                            redraw();
                        });
                        later.play();
                    }
                }
            }
            if (dead) defeated.add(target);
        }
        for (GridObject d : defeated) {
            removeDefeated(d);
        }
        finishCast(caster);
    }

    private void finishCast(GridObject caster) {
        clearCastMode();
        battleView.hideDiceRollPanel();
        if (caster != null) {
            selectedObject = caster;
            battleView.updateSelectedEntity(caster);
        }
        redraw();
        battleView.refreshPartyHealth();
    }

    public void triggerUseItemForSelected() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            triggerUseItem(entity);
        }
    }

    public void triggerSwapForSelected() {
        if (!battleStarted) return;
        if (selectedObject instanceof Entity entity && entity.isParty()) {
            entity.getCharSheet().swapWeapons();
            // The newly-equipped weapon may have entirely different dice - drop any temporary
            // per-tier overrides so the display/combat math reflect its real dice, not leftovers.
            entity.resetDiceOverride();
            redraw();
            battleView.updateSelectedEntity(entity);
        }
    }

    private int[] getCellAtPoint(double mouseX, double mouseY) {
        double[] layout = getGridLayout();
        double cellSize = layout[0];
        double offsetX = layout[1];
        double offsetY = layout[2];
        if (cellSize <= 0) return null;

        double gridWidth = cellSize * grid.getCols();
        double gridHeight = cellSize * grid.getRows();

        if (mouseX < offsetX || mouseY < offsetY || mouseX > offsetX + gridWidth || mouseY > offsetY + gridHeight) {
            return null;
        }

        int col = (int) ((mouseX - offsetX) / cellSize);
        int row = (int) ((mouseY - offsetY) / cellSize);
        return new int[]{row, col};
    }

    /**
     * Shared board layout math: {cellSize, offsetX, offsetY}.
     * Keeps drawing and mouse hit-testing in sync; reserves a margin
     * around the board for the frame and drop shadow.
     */
    private double[] getGridLayout() {
        double cellSize = fitCellSize() * zoom;
        double offsetX = (canvas.getWidth() - cellSize * grid.getCols()) / 2 + panX;
        // Centre the board plus its headroom, then push the board down past the
        // headroom, so the reserved space ends up above row 0 where sprites overhang
        double overhang = cellSize * topOverhangCells();
        double offsetY = (canvas.getHeight() - cellSize * grid.getRows() - overhang) / 2 + overhang + panY;
        return new double[]{cellSize, offsetX, offsetY};
    }

    // Upward screen shift per elevation level, as a fraction of a cell
    private static final double ELEV_LIFT = 0.25;

    /**
     * Screen-pixel lift for a cell's elevation. Purely visual: hit testing
     * intentionally ignores this, so clicks target the base grid position.
     */
    private double liftFor(int r, int c, double cellSize) {
        return grid.getElevation(r, c) * cellSize * ELEV_LIFT;
    }

    // White overlay per elevation level on tile tops, so height has a color
    // signature even where no side face is visible (e.g. north-facing drops)
    private static final double ELEV_TINT_PER_LEVEL = 0.04;
    private static final Color[] ELEV_TINT = buildElevTints();

    private static Color[] buildElevTints() {
        Color[] tints = new Color[BattleGrid.MAX_ELEVATION + 1];
        for (int i = 1; i < tints.length; i++) {
            tints[i] = Color.rgb(255, 255, 255, ELEV_TINT_PER_LEVEL * i);
        }
        return tints;
    }

    // Cliff shadow bands on tiles bordering a higher neighbor, indexed by
    // (clamped elevation diff - 1). Three overlapping rects per edge composite
    // into a stepped ramp that suits the pixel-art look; colors are precomputed
    // because redraw() runs per animation frame.
    private static final Color[] CLIFF_SHADOW_STEP = {
        Color.rgb(0, 0, 0, 0.11), Color.rgb(0, 0, 0, 0.14), Color.rgb(0, 0, 0, 0.17) };
    private static final double SHADOW_W_BASE = 0.10;      // band width as fraction of a cell
    private static final double SHADOW_W_PER_LEVEL = 0.05; // extra width per level of diff

    /** Texture variant for a cell, from a position hash. */
    private int variantFor(int r, int c) {
        return (int) (((r * 73856093L) ^ (c * 19349663L)) >>> 1) % theme.floorVariants.length;
    }

    /** Texture + elevation tint + checker for one tile's top face at its (possibly lifted) rect. */
    private void drawTileTop(GraphicsContext gc, int r, int c, double x0, double x1, double yTop, double yBottom) {
        gc.drawImage(theme.floorVariants[variantFor(r, c)], x0, yTop, x1 - x0, yBottom - yTop);
        int level = grid.getElevation(r, c);
        if (level > 0) {
            gc.setFill(ELEV_TINT[level]);
            gc.fillRect(x0, yTop, x1 - x0, yBottom - yTop);
        }
        if (((r + c) & 1) == 1) {
            gc.setFill(Color.rgb(0, 0, 0, 0.07));
            gc.fillRect(x0, yTop, x1 - x0, yBottom - yTop);
        }
    }

    /**
     * Stepped ambient-occlusion bands on (r,c)'s top face along each edge shared
     * with a higher neighbor, so drops read as depth in all four directions.
     * Band anchors follow the on-screen shared edge, which for a raised south
     * neighbor is that neighbor's lifted top edge, not the nominal grid line.
     */
    private void drawCliffShadows(GraphicsContext gc, int r, int c, double offsetX, double offsetY, double cellSize) {
        int elev = grid.getElevation(r, c);
        double lift = elev * cellSize * ELEV_LIFT;
        double x0 = Math.round(offsetX + c * cellSize);
        double x1 = Math.round(offsetX + (c + 1) * cellSize);
        double yTop = Math.round(offsetY + r * cellSize - lift);
        double yBot = Math.round(offsetY + (r + 1) * cellSize - lift);

        // North neighbor higher: its wall ends exactly at this face's top edge
        int diff = grid.getElevation(r - 1, c) - elev;
        if (diff > 0) {
            int d = Math.min(3, diff);
            double h = bandWidth(cellSize, d);
            gc.setFill(CLIFF_SHADOW_STEP[d - 1]);
            gc.fillRect(x0, yTop, x1 - x0, h);
            gc.fillRect(x0, yTop, x1 - x0, Math.round(h * 2.0 / 3));
            gc.fillRect(x0, yTop, x1 - x0, Math.round(h / 3.0));
        }

        // South neighbor higher: its lifted top edge intrudes up into this face,
        // so the band hangs upward from that edge (clamped to this face)
        diff = grid.getElevation(r + 1, c) - elev;
        if (diff > 0) {
            int d = Math.min(3, diff);
            double h = bandWidth(cellSize, d);
            double yEdge = Math.round(offsetY + (r + 1) * cellSize - grid.getElevation(r + 1, c) * cellSize * ELEV_LIFT);
            gc.setFill(CLIFF_SHADOW_STEP[d - 1]);
            fillBandUp(gc, x0, x1, yTop, yEdge, h);
            fillBandUp(gc, x0, x1, yTop, yEdge, Math.round(h * 2.0 / 3));
            fillBandUp(gc, x0, x1, yTop, yEdge, Math.round(h / 3.0));
        }

        // East neighbor higher: vertical shared edge at x1, full face height
        diff = grid.getElevation(r, c + 1) - elev;
        if (diff > 0) {
            int d = Math.min(3, diff);
            double h = bandWidth(cellSize, d);
            gc.setFill(CLIFF_SHADOW_STEP[d - 1]);
            gc.fillRect(x1 - h, yTop, h, yBot - yTop);
            gc.fillRect(x1 - Math.round(h * 2.0 / 3), yTop, Math.round(h * 2.0 / 3), yBot - yTop);
            gc.fillRect(x1 - Math.round(h / 3.0), yTop, Math.round(h / 3.0), yBot - yTop);
        }

        // West neighbor higher: mirror of east
        diff = grid.getElevation(r, c - 1) - elev;
        if (diff > 0) {
            int d = Math.min(3, diff);
            double h = bandWidth(cellSize, d);
            gc.setFill(CLIFF_SHADOW_STEP[d - 1]);
            gc.fillRect(x0, yTop, h, yBot - yTop);
            gc.fillRect(x0, yTop, Math.round(h * 2.0 / 3), yBot - yTop);
            gc.fillRect(x0, yTop, Math.round(h / 3.0), yBot - yTop);
        }
    }

    private static double bandWidth(double cellSize, int diff) {
        return Math.max(3, Math.round(cellSize * (SHADOW_W_BASE + SHADOW_W_PER_LEVEL * diff)));
    }

    /** Fill a band of height h extending upward from yEdge, clamped to yTop. */
    private static void fillBandUp(GraphicsContext gc, double x0, double x1, double yTop, double yEdge, double h) {
        double top = Math.max(yTop, yEdge - h);
        if (yEdge > top) {
            gc.fillRect(x0, top, x1 - x0, yEdge - top);
        }
    }

    /**
     * Draw one elevated tile's visual: darkened side face down to the true grid line,
     * floor texture on the lifted top, lit leading edge, and an outline. Called once in
     * the base floor pass, and reasserted again in the back-to-front pass just before a
     * row's own content draws, so a raised tile redraws over - and thus occludes -
     * whatever from the row behind it (row - 1) already got drawn, e.g. a unit standing there.
     */
    private void drawElevatedTileFace(GraphicsContext gc, int r, int c, double offsetX, double offsetY, double cellSize) {
        double x0 = Math.round(offsetX + c * cellSize);
        double x1 = Math.round(offsetX + (c + 1) * cellSize);
        double lift = liftFor(r, c, cellSize);
        double yBase = Math.round(offsetY + (r + 1) * cellSize);
        double yT0 = Math.round(offsetY + r * cellSize - lift);
        double yT1 = Math.round(offsetY + (r + 1) * cellSize - lift);
        gc.drawImage(theme.floorVariants[variantFor(r, c)], x0, yT1, x1 - x0, yBase - yT1);
        gc.setFill(Color.rgb(0, 0, 0, 0.45));
        gc.fillRect(x0, yT1, x1 - x0, yBase - yT1);
        drawTileTop(gc, r, c, x0, x1, yT0, yT1);
        // Lit leading edge, except at the base of a taller cliff behind
        if (grid.getElevation(r - 1, c) <= grid.getElevation(r, c)) {
            gc.setFill(Color.rgb(255, 255, 255, 0.10));
            gc.fillRect(x0, yT0, x1 - x0, Math.max(2, cellSize * 0.045));
        }
        gc.setStroke(Color.rgb(0, 0, 0, 0.35));
        gc.setLineWidth(1);
        gc.strokeRect(x0 + 0.5, yT0 + 0.5, x1 - x0 - 1, yT1 - yT0 - 1);
        drawCliffShadows(gc, r, c, offsetX, offsetY, cellSize);
    }

    /** Draw one terrain object's sprite plus its selection outline, if any. */
    private void drawTerrainObject(GraphicsContext gc, TerrainObject t, int r,
            double offsetX, double offsetY, double cellSize) {
        double x = offsetX + t.getCol() * cellSize;
        double y = offsetY + r * cellSize - liftFor(r, t.getCol(), cellSize);

        SpriteUtils.drawTerrainSpriteOnCanvas(gc, t, x, y, cellSize);

        if (!playerView && t == selectedObject) {
            gc.setStroke(Color.ORANGE);
            gc.setLineWidth(2);
            double padding = 2;
            gc.strokeRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
        }
    }

    /** Draw a single floor pickup token at its lifted position. */
    private void drawPickup(GraphicsContext gc, Pickup p, double offsetX, double offsetY, double cellSize) {
        double x = offsetX + p.getCol() * cellSize;
        double y = offsetY + p.getRow() * cellSize - liftFor(p.getRow(), p.getCol(), cellSize);
        double circleSize = cellSize * 0.35;
        double offset = (cellSize - circleSize) / 2;
        String pickupColor = p.getItem() != null ? p.getItem().getColor() : EntityRes.ColorUtils.DEFAULT_COLOR;
        gc.setFill(Color.rgb(0, 0, 0, 0.35));
        gc.fillOval(x + offset, y + offset + circleSize * 0.15, circleSize, circleSize * 0.85);
        gc.setFill(Color.web(pickupColor));
        gc.fillOval(x + offset, y + offset, circleSize, circleSize);
    }

    /**
     * Tallest terrain overhang on the board, in cells, or 0 when every terrain
     * sprite is flat. Nothing clips at cell boundaries, but the canvas edge does,
     * so a tree in row 0 needs headroom reserved above the board. Computed from
     * what is actually placed rather than reserved unconditionally, because a
     * fixed allowance would shrink the tiles on every board that has no tall art.
     */
    private double topOverhangCells() {
        double max = 0;
        for (TerrainObject t : grid.getTerrainObjects()) {
            max = Math.max(max, SpriteUtils.terrainOverhangCells(t));
        }
        return max;
    }

    /** Cell size that fits the whole board - plus any overhang headroom - in the canvas (zoom = 1.0). */
    private double fitCellSize() {
        return Math.min(
            (canvas.getWidth() - BOARD_MARGIN * 2) / grid.getCols(),
            (canvas.getHeight() - BOARD_MARGIN * 2) / (grid.getRows() + topOverhangCells()));
    }

    /** Keep at least PAN_VISIBLE_MARGIN px of the board visible on each axis. */
    private void clampPan() {
        // Skip until the canvas has a real size. The first layout passes report 0 (or tiny)
        // sizes, where fitCellSize() goes negative and this "clamp" would shove the camera
        // off-center - and that bogus pan then stuck, so a new battle opened focused on
        // some arbitrary cell instead of the whole board.
        if (canvas.getWidth() < PAN_VISIBLE_MARGIN * 2 || canvas.getHeight() < PAN_VISIBLE_MARGIN * 2) {
            return;
        }
        double cs = fitCellSize() * zoom;
        double gridW = cs * grid.getCols();
        double gridH = cs * grid.getRows();
        double overhang = cs * topOverhangCells();
        double cx = (canvas.getWidth() - gridW) / 2;
        // Same unpanned origin getGridLayout() uses, so the clamp matches what is drawn
        double cy = (canvas.getHeight() - gridH - overhang) / 2 + overhang;
        panX = Math.max(PAN_VISIBLE_MARGIN - gridW - cx,
               Math.min(canvas.getWidth() - PAN_VISIBLE_MARGIN - cx, panX));
        panY = Math.max(PAN_VISIBLE_MARGIN - gridH - cy,
               Math.min(canvas.getHeight() - PAN_VISIBLE_MARGIN - cy, panY));
    }

    /** Mouse-wheel zoom, keeping the board point under the cursor fixed. */
    private void handleScroll(javafx.scene.input.ScrollEvent e) {
        if (e.getDeltaY() == 0) return;
        double[] layout = getGridLayout();
        double newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
            zoom * Math.exp(e.getDeltaY() * 0.002)));
        if (newZoom == zoom) return;
        double worldCol = (e.getX() - layout[1]) / layout[0];
        double worldRow = (e.getY() - layout[2]) / layout[0];
        zoom = newZoom;
        double cs = fitCellSize() * zoom;
        panX = e.getX() - worldCol * cs - (canvas.getWidth() - cs * grid.getCols()) / 2;
        // Invert getGridLayout()'s offsetY, overhang headroom included, so the anchor holds
        double overhang = cs * topOverhangCells();
        panY = e.getY() - worldRow * cs - (canvas.getHeight() - cs * grid.getRows() - overhang) / 2 - overhang;
        clampPan();
        hideInfoPopup();
        e.consume();
        redraw();
    }

    /** Restore the default fit-to-view camera. */
    public void resetCamera() {
        zoom = 1.0;
        panX = 0;
        panY = 0;
        hideInfoPopup();
        redraw();
    }

    private void handleLeftClick(double x, double y) {
        int[] cellInfo = getCellAtPoint(x, y);
        if (cellInfo == null) return;

        int row = cellInfo[0];
        int col = cellInfo[1];

        if (!grid.inBounds(row, col)) return;

        GridObject clicked = grid.getObjectAt(row, col);
        
        // Handle placement mode
        if (battleView.isPlacementMode()) {
            CharSheet placing = battleView.getCurrentPlacing();
            if (placing != null && grid.canUnitStand(row, col)) {
                // Place the entity at clicked location
                Entity newEntity = new Entity(row, col, placing);
                battleView.entityPlaced(newEntity);
                return;
            } else {
                spawnFloatingText(row, col, "Occupied", Color.web("#b8b8c0"));
                return;
            }
        }

        // Handle object placement mode (enemies, terrain, pickups)
        if (battleView.isObjectPlacementMode()) {
            // Units may share a tile with non-colliding terrain; terrain and
            // pickups still need a fully empty tile.
            boolean canPlace = battleView.isPendingObjectUnit()
                ? grid.canUnitStand(row, col)
                : (clicked == null && !grid.isBlocked(row, col));
            if (canPlace) {
                // Place the object at clicked location
                battleView.objectPlaced(row, col);
                return;
            } else {
                spawnFloatingText(row, col, "Occupied", Color.web("#b8b8c0"));
                return;
            }
        }

        // Handle pickup mode for Entity
        if (pickupMode && pickupEntity != null) {
            Pickup pickup = grid.getPickupAt(row, col);
            if (pickup != null) {
                // Check if adjacent to entity (within 1 tile)
                int dx = Math.abs(pickupEntity.getRow() - row);
                int dy = Math.abs(pickupEntity.getCol() - col);
                
                if (dx <= 1 && dy <= 1) {
                    // Pick up the item
                    Item item = pickup.getItem();
                    pickupEntity.getCharSheet().addItem(item);
                    pickupEntity.getCharSheet().save();
                    grid.removePickup(pickup);

                    Entity entity = pickupEntity;
                    pickupMode = false;
                    pickupEntity = null;
                    selectedObject = entity;
                    redraw();
                    battleView.updateSelectedEntity(entity);
                    return;
                }
                // Too far away - fall through to cancel
            }
            // Clicked empty space, non-pickup, or too-far pickup - cancel mode
            Entity entity = pickupEntity;
            pickupMode = false;
            pickupEntity = null;
            selectedObject = entity;
            redraw();
            battleView.updateSelectedEntity(entity);
            return;
        }

        // Handle move mode for Entity
        if (moveMode && movingEntity != null) {
            if (grid.canUnitStand(row, col)) {
                int dist = Math.abs(movingEntity.getRow() - row) + Math.abs(movingEntity.getCol() - col);
                int mobilityLimit = movingEntity.getMovement();

                if (dist <= mobilityLimit) {
                    Entity movedEntity = movingEntity;
                    movingEntity.setRow(row);
                    movingEntity.setCol(col);
                    moveMode = false;
                    movingEntity = null;
                    // Keep entity selected for additional actions
                    selectedObject = movedEntity;
                    redraw();
                    battleView.updateSelectedEntity(movedEntity);
                    return;
                } else {
                    // Clicked outside range - cancel mode
                    cancelModes();
                    return;
                }
            }
            if (clicked == null) {
                // Empty but not standable (e.g. a disabled cell) - cancel mode
                cancelModes();
                return;
            }
            if (clicked != null) {
                moveMode = false;
                movingEntity = null;
                selectedObject = clicked;
                battleView.updateSelectedEntity(clicked);
                redraw();
                return;
            }
        }

        // Handle move mode for Enemy
        if (moveMode && movingEnemy != null) {
            if (grid.canUnitStand(row, col)) {
                int dist = Math.abs(movingEnemy.getRow() - row) + Math.abs(movingEnemy.getCol() - col);
                int mobilityLimit = movingEnemy.getMovement();

                if (dist <= mobilityLimit) {
                    Enemy movedEnemy = movingEnemy;
                    movingEnemy.setRow(row);
                    movingEnemy.setCol(col);
                    moveMode = false;
                    movingEnemy = null;
                    // Keep enemy selected for additional actions
                    selectedObject = movedEnemy;
                    redraw();
                    battleView.updateSelectedEntity(movedEnemy);
                    return;
                } else {
                    // Clicked outside range - cancel mode
                    cancelModes();
                    return;
                }
            }
            if (clicked == null) {
                // Empty but not standable (e.g. a disabled cell) - cancel mode
                cancelModes();
                return;
            }
            if (clicked != null) {
                moveMode = false;
                movingEnemy = null;
                selectedObject = clicked;
                battleView.updateSelectedEntity(clicked);
                redraw();
                return;
            }
        }

        // Area spell aiming: click a cell to place the template
        if (castMode && castingEntity != null && pendingSpell != null && pendingSpell.isArea()) {
            if (lockedAreaCells != null) return;  // already rolling for a placed template
            if (SpellArea.isAimValid(pendingSpell, castingEntity, row, col, grid)) {
                resolveAreaAt(row, col);
            } else if (grid.inBounds(row, col) && (row != castingEntity.getRow() || col != castingEntity.getCol())) {
                spawnFloatingText(row, col, "Out of range", Color.web("#b8b8c0"));
            } else {
                Entity caster = castingEntity;
                clearCastMode();
                selectedObject = caster;
                redraw();
                battleView.updateSelectedEntity(caster);
            }
            return;
        }

        // Handle cast mode: only legal in-range targets resolve; anything else cancels
        if (castMode && castingEntity != null) {
            if (isCastTarget(clicked)) {
                resolveSpellOn(clicked);
            } else if (clicked != null && CombatManager.isValidSpellTarget(castingEntity, clicked, pendingSpell)) {
                spawnFloatingText(clicked.getRow(), clicked.getCol(), "Out of range", Color.web("#b8b8c0"));
            } else {
                Entity caster = castingEntity;
                clearCastMode();
                selectedObject = caster;
                redraw();
                battleView.updateSelectedEntity(caster);
            }
            return;
        }

        // Handle attack mode for Entity
        if (attackMode && attackingEntity != null) {
            if (clicked instanceof Entity target && target != attackingEntity) {
                // Start dice roll sequence for Entity attacking Entity
                startDiceRollAttack(attackingEntity, target);
                return;
            } else if (clicked instanceof Enemy targetEnemy) {
                // Start dice roll sequence for Entity attacking Enemy
                startDiceRollAttack(attackingEntity, targetEnemy);
                return;
            } else if (clicked instanceof TerrainObject terrain) {
                // Start dice roll sequence for Entity attacking Terrain
                startDiceRollAttack(attackingEntity, terrain);
                return;
            } else if (clicked == null) {
                Entity attacker = attackingEntity;
                attackMode = false;
                attackingEntity = null;
                selectedObject = attacker;
                redraw();
                battleView.updateSelectedEntity(attacker);
                return;
            }
        }

        // Handle attack mode for Enemy
        if (attackMode && attackingEnemy != null) {
            if (clicked instanceof Entity target) {
                // Start dice roll sequence for Enemy attacking Entity
                startDiceRollAttack(attackingEnemy, target);
                return;
            } else if (clicked instanceof Enemy targetEnemy && targetEnemy != attackingEnemy) {
                // Start dice roll sequence for Enemy attacking Enemy
                startDiceRollAttack(attackingEnemy, targetEnemy);
                return;
            } else if (clicked instanceof TerrainObject terrain) {
                // Start dice roll sequence for Enemy attacking Terrain
                startDiceRollAttack(attackingEnemy, terrain);
                return;
            } else if (clicked == null) {
                Enemy attacker = attackingEnemy;
                attackMode = false;
                attackingEnemy = null;
                selectedObject = attacker;
                redraw();
                battleView.updateSelectedEntity(attacker);
                return;
            }
        }
    }
    
    /**
     * Start the dice roll attack sequence via DiceRollPanel
     */
    private void startDiceRollAttack(GridObject attacker, GridObject target) {
        // Show dice panel, hide action panel
        battleView.showDiceRollPanel();
        
        DiceRollPanel dicePanel = battleView.getDiceRollPanel();
        dicePanel.startAttack(attacker, target, 
            this::handleAttackOutcome,
            this::handleAttackCancelled
        );
    }
    
    /**
     * Handle the outcome of a dice roll attack
     */
    private void handleAttackOutcome(DiceRollPanel.AttackOutcome outcome) {
        GridObject attacker = outcome.attacker;
        GridObject target = outcome.target;
        
        // Consume ammo for ranged weapons (regardless of hit/miss)
        CombatManager.consumeAmmo(attacker);

        if (outcome.hit) {
            // Apply damage
            CombatManager.applyDamage(target, outcome.totalDamage);
            spawnFloatingText(target, "-" + outcome.totalDamage,
                outcome.d20Roll == 20 ? Color.web("#FFD700") : Color.web("#ff7b6b"), UI.PlayerDisplayOptions.TextKind.DAMAGE);

            // Check for defeat
            if (CombatManager.isTargetDead(target)) {
                removeDefeated(target);
            }
        } else {
            spawnFloatingText(target, "Miss", Color.web("#b8b8c0"));
        }
        
        // Clean up attack state
        finishAttack(attacker);
    }
    
    /** Remove a defeated unit/destroyed terrain from the board and turn order. */
    private void removeDefeated(GridObject target) {
        if (target instanceof Entity e) {
            grid.removeEntity(e);
            turnManager.removeEntity(e);
        } else if (target instanceof Enemy en) {
            grid.removeEnemy(en);
            turnManager.removeEnemy(en);
            battleView.getBattleState().incrementEnemiesDefeated();
        } else if (target instanceof TerrainObject) {
            grid.removeDestroyedTerrain();
        }
    }

    /**
     * Handle attack cancellation
     */
    private void handleAttackCancelled() {
        GridObject attacker = attackingEntity != null ? attackingEntity : attackingEnemy;
        finishAttack(attacker);
    }
    
    /**
     * Clean up after attack completes or is cancelled
     */
    private void finishAttack(GridObject attacker) {
        attackMode = false;
        attackingEntity = null;
        attackingEnemy = null;
        // Hide dice panel, show action panel
        battleView.hideDiceRollPanel();
        
        if (attacker != null) {
            selectedObject = attacker;
            battleView.updateSelectedEntity(attacker);
        }
        
        redraw();
        battleView.refreshPartyHealth();
    }

    public void redraw() {
        GraphicsContext gc = canvas.getGraphicsContext2D();
        double width = canvas.getWidth();
        double height = canvas.getHeight();

        if (width <= 0 || height <= 0) return;

        // Keep pixel art crisp when scaled
        gc.setImageSmoothing(false);

        // Backdrop: darkened theme texture tiled across the whole canvas,
        // then a vignette so the board reads as the lit center of a scene
        gc.setFill(theme.backdropBase);
        gc.fillRect(0, 0, width, height);
        double bgTile = GridTheme.TILE_SIZE * 2;
        for (double by = 0; by < height; by += bgTile) {
            for (double bx = 0; bx < width; bx += bgTile) {
                gc.drawImage(theme.backdropTexture, bx, by, bgTile, bgTile);
            }
        }
        gc.setFill(new RadialGradient(0, 0, 0.5, 0.5, 0.75, true, CycleMethod.NO_CYCLE,
            new Stop(0, Color.rgb(0, 0, 0, 0)),
            new Stop(1, Color.rgb(0, 0, 0, 0.55))));
        gc.fillRect(0, 0, width, height);

        int rows = grid.getRows();
        int cols = grid.getCols();

        double[] layout = getGridLayout();
        double cellSize = layout[0];
        double offsetX = layout[1];
        double offsetY = layout[2];
        if (cellSize <= 0) return;
        double gridWidth = cellSize * cols;
        double gridHeight = cellSize * rows;

        // Board drop shadow and frame
        double frame = Math.min(BOARD_MARGIN - 6, Math.max(6, cellSize * 0.16));
        gc.setFill(Color.rgb(0, 0, 0, 0.45));
        gc.fillRoundRect(offsetX - frame + 4, offsetY - frame + 6,
            gridWidth + frame * 2, gridHeight + frame * 2, 12, 12);
        gc.setFill(Color.web("#252528"));
        gc.fillRoundRect(offsetX - frame, offsetY - frame,
            gridWidth + frame * 2, gridHeight + frame * 2, 12, 12);
        gc.setStroke(Color.web("#505052"));
        gc.setLineWidth(1.5);
        gc.strokeRoundRect(offsetX - frame, offsetY - frame,
            gridWidth + frame * 2, gridHeight + frame * 2, 12, 12);

        // Textured floor: one variant per cell from a position hash, with a
        // subtle checker tint. Both cell edges are snapped to whole pixels so
        // fractional cell widths can't leave seams.
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (!grid.isEnabled(r, c)) {
                    // Outside the battle's shape: repaint with the backdrop color so
                    // it reads as a void hole in the panel, not an undecorated tile
                    double x0 = Math.round(offsetX + c * cellSize);
                    double x1 = Math.round(offsetX + (c + 1) * cellSize);
                    double y0 = Math.round(offsetY + r * cellSize);
                    double y1 = Math.round(offsetY + (r + 1) * cellSize);
                    gc.setFill(theme.backdropBase);
                    gc.fillRect(x0, y0, x1 - x0, y1 - y0);
                    continue;
                }
                double lift = liftFor(r, c, cellSize);
                if (lift == 0) {
                    double x0 = Math.round(offsetX + c * cellSize);
                    double x1 = Math.round(offsetX + (c + 1) * cellSize);
                    double y0 = Math.round(offsetY + r * cellSize);
                    double y1 = Math.round(offsetY + (r + 1) * cellSize);
                    drawTileTop(gc, r, c, x0, x1, y0, y1);
                    drawCliffShadows(gc, r, c, offsetX, offsetY, cellSize);
                } else {
                    drawElevatedTileFace(gc, r, c, offsetX, offsetY, cellSize);
                }
            }
        }
        
        // Placement mode highlight - show valid placement cells
        if (!playerView && battleView.isPlacementMode()) {
            gc.setFill(Color.rgb(90, 170, 230, 0.20));
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    if (grid.canUnitStand(r, c)) {
                        double x = offsetX + c * cellSize;
                        double y = offsetY + r * cellSize - liftFor(r, c, cellSize);
                        gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    }
                }
            }
        }

        // Movement range highlight for Entity
        if (moveMode && movingEntity != null) {
            int mobilityLimit = movingEntity.getMovement();
            int entityRow = movingEntity.getRow();
            int entityCol = movingEntity.getCol();

            gc.setFill(Color.rgb(110, 200, 130, 0.22));
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    int dist = Math.abs(entityRow - r) + Math.abs(entityCol - c);
                    if (dist > 0 && dist <= mobilityLimit && grid.canUnitStand(r, c)) {
                        double x = offsetX + c * cellSize;
                        double y = offsetY + r * cellSize - liftFor(r, c, cellSize);
                        gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    }
                }
            }
        }

        // Movement range highlight for Enemy
        if (moveMode && movingEnemy != null) {
            int mobilityLimit = movingEnemy.getMovement();
            int entityRow = movingEnemy.getRow();
            int entityCol = movingEnemy.getCol();

            gc.setFill(Color.rgb(110, 200, 130, 0.22));
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    int dist = Math.abs(entityRow - r) + Math.abs(entityCol - c);
                    if (dist > 0 && dist <= mobilityLimit && grid.canUnitStand(r, c)) {
                        double x = offsetX + c * cellSize;
                        double y = offsetY + r * cellSize - liftFor(r, c, cellSize);
                        gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    }
                }
            }
        }

        // Attack targets highlight for Entity
        if (attackMode && attackingEntity != null) {
            gc.setFill(Color.rgb(215, 95, 95, 0.22));

            for (Entity e : grid.getEntities()) {
                if (e != attackingEntity) {
                    double x = offsetX + e.getCol() * cellSize;
                    double y = offsetY + e.getRow() * cellSize - liftFor(e.getRow(), e.getCol(), cellSize);
                    gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                    gc.setLineWidth(1.5);
                    gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }
            }
            for (Enemy en : grid.getEnemies()) {
                double x = offsetX + en.getCol() * cellSize;
                double y = offsetY + en.getRow() * cellSize - liftFor(en.getRow(), en.getCol(), cellSize);
                gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                gc.setLineWidth(1.5);
                gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            for (TerrainObject t : grid.getTerrainObjects()) {
                double x = offsetX + t.getCol() * cellSize;
                double y = offsetY + t.getRow() * cellSize - liftFor(t.getRow(), t.getCol(), cellSize);
                gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                gc.setLineWidth(1.5);
                gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            gc.setLineWidth(1);
        }

        // Attack targets highlight for Enemy
        if (attackMode && attackingEnemy != null) {
            gc.setFill(Color.rgb(215, 95, 95, 0.22));

            for (Entity e : grid.getEntities()) {
                double x = offsetX + e.getCol() * cellSize;
                double y = offsetY + e.getRow() * cellSize - liftFor(e.getRow(), e.getCol(), cellSize);
                gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                gc.setLineWidth(1.5);
                gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            for (Enemy en : grid.getEnemies()) {
                if (en != attackingEnemy) {
                    double x = offsetX + en.getCol() * cellSize;
                    double y = offsetY + en.getRow() * cellSize - liftFor(en.getRow(), en.getCol(), cellSize);
                    gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                    gc.setLineWidth(1.5);
                    gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }
            }
            for (TerrainObject t : grid.getTerrainObjects()) {
                double x = offsetX + t.getCol() * cellSize;
                double y = offsetY + t.getRow() * cellSize - liftFor(t.getRow(), t.getCol(), cellSize);
                gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                gc.setStroke(Color.rgb(215, 95, 95, 0.75));
                gc.setLineWidth(1.5);
                gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            gc.setLineWidth(1);
        }

        // Cast mode: tint the range diamond, outline every legal target inside it
        boolean showRange = pendingSpell != null
            && (!pendingSpell.isArea() || (EntityRes.Spell.AREA_BURST.equals(pendingSpell.getArea()) && !pendingSpell.isSelfCenteredArea()));
        if (castMode && castingEntity != null && pendingSpell != null && showRange && lockedAreaCells == null) {
            int range = Math.max(1, pendingSpell.getRange());
            int cr = castingEntity.getRow();
            int cc = castingEntity.getCol();
            gc.setFill(Color.rgb(123, 104, 238, 0.10));
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    int dist = Math.abs(cr - r) + Math.abs(cc - c);
                    if (dist <= range && grid.isEnabled(r, c)) {
                        double x = offsetX + c * cellSize;
                        double y = offsetY + r * cellSize - liftFor(r, c, cellSize);
                        gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    }
                }
            }
            java.util.List<GridObject> candidates = new java.util.ArrayList<>();
            candidates.addAll(grid.getEntities());
            candidates.addAll(grid.getEnemies());
            candidates.addAll(grid.getTerrainObjects());
            gc.setFill(Color.rgb(123, 104, 238, 0.25));
            gc.setStroke(Color.rgb(170, 150, 255, 0.9));
            gc.setLineWidth(1.5);
            for (GridObject obj : candidates) {
                if (!isCastTarget(obj)) continue;
                double x = offsetX + obj.getCol() * cellSize;
                double y = offsetY + obj.getRow() * cellSize - liftFor(obj.getRow(), obj.getCol(), cellSize);
                gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            gc.setLineWidth(1);
        }

        // Area template: spell-colored cells, with the units it would affect outlined. A player
        // view only shows the DM's template when the "spell templates" display setting is on.
        BattleGridCanvas templateOwner = playerView
            ? (playerOpts != null && playerOpts.showSpellTemplates() ? source : null)
            : this;
        if (templateOwner != null && templateOwner.castMode && templateOwner.castingEntity != null
                && templateOwner.pendingSpell != null && templateOwner.pendingSpell.isArea()) {
            EntityRes.Spell pendingSpell = templateOwner.pendingSpell;
            Entity castingEntity = templateOwner.castingEntity;
            java.util.List<int[]> area = templateOwner.currentAreaCells();
            if (!area.isEmpty()) {
                Color base = Color.web(pendingSpell.getColor());
                gc.setFill(Color.color(base.getRed(), base.getGreen(), base.getBlue(), 0.28));
                gc.setStroke(Color.color(base.getRed(), base.getGreen(), base.getBlue(), 0.55));
                gc.setLineWidth(1);
                for (int[] cell : area) {
                    double x = offsetX + cell[1] * cellSize;
                    double y = offsetY + cell[0] * cellSize - liftFor(cell[0], cell[1], cellSize);
                    gc.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    gc.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }
                gc.setStroke(Color.color(Math.min(1, base.getRed() + 0.25), Math.min(1, base.getGreen() + 0.25),
                    Math.min(1, base.getBlue() + 0.25), 0.95));
                gc.setLineWidth(2.5);
                for (GridObject t : SpellArea.targets(pendingSpell, castingEntity, area, grid)) {
                    double x = offsetX + t.getCol() * cellSize;
                    double y = offsetY + t.getRow() * cellSize - liftFor(t.getRow(), t.getCol(), cellSize);
                    gc.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
                }
                gc.setLineWidth(1);
            }
        }

        // Pickups - floor items, drawn under everything that stands
        for (Pickup p : grid.getPickups()) {
            drawPickup(gc, p, offsetX, offsetY, cellSize);
        }

        long frameNow = System.nanoTime();
        syncMoveTweens(frameNow);
        currentUnitTick = 0; // re-detected by drawUnit below

        // Back-to-front pass: draw row by row so sprites that extend above
        // their tile get overlapped by whatever stands in the row below
        for (int r = 0; r < rows; r++) {
            // Re-draw this row's raised tiles now, so they redraw over - and thus
            // occlude - whatever from the row above already got drawn (e.g. a unit
            // standing there), before drawing this row's own terrain/units on top.
            for (int c = 0; c < cols; c++) {
                if (!grid.isEnabled(r, c)) continue;
                if (grid.getElevation(r, c) > 0) {
                    drawElevatedTileFace(gc, r, c, offsetX, offsetY, cellSize);
                    Pickup pickupHere = grid.getPickupAt(r, c);
                    if (pickupHere != null) {
                        drawPickup(gc, pickupHere, offsetX, offsetY, cellSize);
                    }
                }
            }
            // Terrain that collides (no entity can ever share its tile) or is
            // flagged "entity above" draws before the row's units, so units
            // appear in front of it - the pre-existing behavior.
            for (TerrainObject t : grid.getTerrainObjects()) {
                if (t.getRow() != r) continue;
                if (t.hasCollision() || t.isEntityAboveTerrain()) {
                    drawTerrainObject(gc, t, r, offsetX, offsetY, cellSize);
                }
            }
            for (Enemy en : grid.getEnemies()) {
                if (en.getRow() != r) continue;
                double[] pos = currentDrawPosition(en, en.getRow(), en.getCol(), frameNow);
                double lift = liftFor((int) Math.round(pos[0]), (int) Math.round(pos[1]), cellSize);
                // Player view with enemy HP hidden: maxHp 0 draws the faction ring without an HP arc
                boolean hideEnemyHp = playerView && playerOpts != null
                    && playerOpts.getEnemyHp() == UI.PlayerDisplayOptions.EnemyHp.HIDDEN;
                drawUnit(gc, offsetX + pos[1] * cellSize, offsetY + pos[0] * cellSize, cellSize, lift,
                    en.getSpritePath(), Color.web(en.getColor()), false,
                    turnManager.isCurrent(en), !playerView && en == selectedObject,
                    en.getHealth(), hideEnemyHp ? 0 : en.getMaxHealth(), frameNow);
            }
            for (Entity e : grid.getEntities()) {
                if (e.getRow() != r) continue;
                double[] pos = currentDrawPosition(e, e.getRow(), e.getCol(), frameNow);
                double lift = liftFor((int) Math.round(pos[0]), (int) Math.round(pos[1]), cellSize);
                java.awt.Color awtColor = e.getCharSheet().getDisplayColor();
                drawUnit(gc, offsetX + pos[1] * cellSize, offsetY + pos[0] * cellSize, cellSize, lift,
                    e.getCharSheet().getSpritePath(),
                    Color.rgb(awtColor.getRed(), awtColor.getGreen(), awtColor.getBlue()), true,
                    turnManager.isCurrent(e), !playerView && e == selectedObject,
                    e.getCharSheet().getCurrentHP(), e.getCharSheet().getTotalHP(), frameNow);
            }
            // Non-colliding terrain flagged "entity below" draws after the
            // row's units, so it covers whatever is standing on its tile
            // (e.g. tall grass hiding an entity's feet).
            for (TerrainObject t : grid.getTerrainObjects()) {
                if (t.getRow() != r) continue;
                if (!t.hasCollision() && !t.isEntityAboveTerrain()) {
                    drawTerrainObject(gc, t, r, offsetX, offsetY, cellSize);
                }
            }
        }

        // Floating combat text on top of everything
        drawFloatingTexts(gc, frameNow, cellSize, offsetX, offsetY);

        // Placement prompt banner at the top of the board
        if (!playerView && battleView.isPlacementMode() && battleView.getCurrentPlacingName() != null) {
            drawPlacementBanner(gc, "Place " + battleView.getCurrentPlacingName() + " - click a tile",
                offsetX + gridWidth / 2, offsetY + cellSize * 0.4);
        }

        // Whatever just changed on the DM board, the player screen picks up on its next frame
        if (mirror != null) {
            mirror.markDirty();
        }
    }

    /** Centered pill banner used for the party-placement prompt. */
    private void drawPlacementBanner(GraphicsContext gc, String msg, double centerX, double centerY) {
        Font font = Font.font("Consolas", FontWeight.BOLD, 15);
        javafx.scene.text.Text measure = new javafx.scene.text.Text(msg);
        measure.setFont(font);
        double textW = measure.getLayoutBounds().getWidth();
        double padX = 14, padY = 8;

        gc.setFill(Color.web("#1e1e20", 0.85));
        gc.fillRoundRect(centerX - textW / 2 - padX, centerY - 12 - padY / 2,
            textW + padX * 2, 24 + padY, 10, 10);
        gc.setStroke(Color.web("#505052"));
        gc.setLineWidth(1);
        gc.strokeRoundRect(centerX - textW / 2 - padX, centerY - 12 - padY / 2,
            textW + padX * 2, 24 + padY, 10, 10);

        gc.setTextAlign(TextAlignment.CENTER);
        gc.setTextBaseline(VPos.CENTER);
        gc.setFont(font);
        gc.setFill(Color.web("#dcdcdc"));
        gc.fillText(msg, centerX, centerY);
    }

    /**
     * Detect grid position changes on any unit and start a slide tween from
     * the old tile. Watching from the render side covers every movement
     * source (player moves, enemy moves, teleports) without per-caller hooks.
     */
    private void syncMoveTweens(long now) {
        Set<GridObject> live = new HashSet<>();
        for (Entity e : grid.getEntities()) {
            syncUnitPosition(e, e.getRow(), e.getCol(), now, live);
        }
        for (Enemy en : grid.getEnemies()) {
            syncUnitPosition(en, en.getRow(), en.getCol(), now, live);
        }
        // Drop state for units no longer on the grid (defeated, removed)
        lastGridPositions.keySet().retainAll(live);
        moveTweens.keySet().retainAll(live);
    }

    private void syncUnitPosition(GridObject obj, int row, int col, long now, Set<GridObject> live) {
        live.add(obj);
        int[] last = lastGridPositions.get(obj);
        if (last != null && (last[0] != row || last[1] != col) && battleStarted) {
            // Start from wherever the unit is currently drawn so an
            // interrupted tween continues smoothly instead of snapping
            double[] from = currentDrawPosition(obj, last[0], last[1], now);
            int dist = Math.abs(last[0] - row) + Math.abs(last[1] - col);
            double duration = Math.min(400, Math.max(140, dist * TWEEN_MS_PER_TILE));
            moveTweens.put(obj, new MoveTween(from[0], from[1], now, duration));
        }
        lastGridPositions.put(obj, new int[]{row, col});
    }

    /**
     * Where to draw a unit right now, in fractional grid coordinates
     * {row, col}: its tween position while sliding, its tile otherwise.
     */
    private double[] currentDrawPosition(GridObject obj, int row, int col, long now) {
        MoveTween t = moveTweens.get(obj);
        if (t == null) {
            return new double[]{row, col};
        }
        double p = (now - t.startNanos) / 1_000_000.0 / t.durationMs;
        if (p >= 1) {
            moveTweens.remove(obj);
            return new double[]{row, col};
        }
        p = 1 - Math.pow(1 - p, 3); // ease-out
        return new double[]{t.fromRow + (row - t.fromRow) * p, t.fromCol + (col - t.fromCol) * p};
    }

    /**
     * Queue combat text rising from the target's tile; the render loop animates it.
     * Public so callers outside the canvas (e.g. mid-battle initiative rolls) can use it.
     */
    public void spawnFloatingText(GridObject target, String text, Color color) {
        spawnFloatingText(target, text, color, UI.PlayerDisplayOptions.TextKind.OTHER);
    }

    /**
     * Combat text tagged with what it is, so a Two Display Mode player screen can reword
     * ("Hit!" instead of "-14") or hide it according to the DM's display settings.
     */
    public void spawnFloatingText(GridObject target, String text, Color color, UI.PlayerDisplayOptions.TextKind kind) {
        spawnFloatingText(target.getRow(), target.getCol(), text, color);
        if (mirror != null) {
            mirror.spawnMirroredText(target.getRow(), target.getCol(), text, color, kind);
        }
    }

    /** Player view: show a DM-side combat text after applying the display settings. */
    private void spawnMirroredText(int row, int col, String text, Color color, UI.PlayerDisplayOptions.TextKind kind) {
        String shown = playerOpts != null ? playerOpts.playerText(text, kind) : text;
        if (shown == null) return;
        if ("Hit!".equals(shown) && Color.web("#FFD700").equals(color)) {
            shown = "Crit!";
        }
        spawnFloatingText(row, col, shown, color);
        markDirty();
    }

    /** Queue floating text on an arbitrary tile (e.g. placement feedback). */
    private void spawnFloatingText(int row, int col, String text, Color color) {
        floatingTexts.add(new FloatingText(text, color, row, col, System.nanoTime()));
    }

    private void drawFloatingTexts(GraphicsContext gc, long now, double cellSize, double offsetX, double offsetY) {
        if (floatingTexts.isEmpty()) return;

        gc.setTextAlign(TextAlignment.CENTER);
        gc.setTextBaseline(VPos.CENTER);
        gc.setFont(Font.font("Consolas", FontWeight.BOLD, Math.max(12, cellSize * 0.30)));

        Iterator<FloatingText> it = floatingTexts.iterator();
        while (it.hasNext()) {
            FloatingText ft = it.next();
            double p = (now - ft.startNanos) / 1_000_000.0 / FLOAT_TEXT_MS;
            if (p >= 1) {
                it.remove();
                continue;
            }
            double x = offsetX + (ft.col + 0.5) * cellSize;
            double y = offsetY + ft.row * cellSize - liftFor(ft.row, ft.col, cellSize) - p * cellSize * 0.6;
            double alpha = p < 0.7 ? 1.0 : (1 - p) / 0.3; // hold, then fade out

            gc.setFill(Color.rgb(0, 0, 0, 0.7 * alpha));
            gc.fillText(ft.text, x + 1.5, y + 1.5);
            gc.setFill(ft.color.deriveColor(0, 1, 1, alpha));
            gc.fillText(ft.text, x, y);
        }
    }

    /**
     * Draw one unit on its tile: ground shadow, HP foot ring, and the
     * bottom-anchored sprite (or fallback token). The current unit is
     * indicated by motion alone - sheet sprites play their walk cycle,
     * static sprites bob gently.
     */
    private void drawUnit(GraphicsContext gc, double x, double y, double cellSize, double lift,
            String spritePath, Color fallbackColor, boolean isParty,
            boolean isCurrent, boolean isSelected, int hp, int maxHp, long now) {
        double centerX = x + cellSize / 2;
        // A unit standing on a raised tile stands on ITS surface, not down at
        // ground level - shadow, ring, and sprite all lift together.
        double footY = y + cellSize * 0.85 - lift;

        boolean sheetSprite = SpriteUtils.isSheetRef(spritePath);
        boolean turnActive = isCurrent && battleStarted;
        if (turnActive) {
            currentUnitTick = sheetSprite ? TICK_WALK : TICK_BOB;
        }

        // Ground shadow, cast on whatever surface the unit is standing on
        double shadowW = cellSize * 0.64;
        double shadowH = cellSize * 0.22;
        gc.setFill(Color.rgb(0, 0, 0, 0.40));
        gc.fillOval(centerX - shadowW / 2, footY - shadowH / 2, shadowW, shadowH);

        // Foot ring doubles as the HP gauge: a dim faction-colored track with
        // an HP arc on top that drains clockwise and shifts green->amber->red
        double ringW = cellSize * 0.78;
        double ringH = cellSize * 0.30;
        double ringX = centerX - ringW / 2;
        double ringY = footY - ringH / 2;

        gc.setStroke(isParty ? Color.rgb(76, 175, 80, 0.45) : Color.rgb(215, 95, 95, 0.45));
        gc.setLineWidth(1.5);
        gc.strokeOval(ringX, ringY, ringW, ringH);

        // Arc is inset inside the track so the faction color stays visible
        // around it even at full HP
        if (maxHp > 0) {
            double pct = Math.max(0, Math.min(1, hp / (double) maxHp));
            Color hpColor = pct > 0.5 ? Color.web("#4CAF50")
                          : pct > 0.25 ? Color.web("#e6b23c")
                          : Color.web("#d75f5f");
            gc.setStroke(hpColor);
            gc.setLineWidth(3.0);
            gc.setLineCap(StrokeLineCap.ROUND);
            gc.strokeArc(ringX + 3, ringY + 2.5, ringW - 6, ringH - 5, 90, -360 * pct, ArcType.OPEN);
            gc.setLineCap(StrokeLineCap.BUTT);
        }

        // Selection: outer ring so it never hides the HP arc
        if (isSelected) {
            gc.setStroke(Color.ORANGE);
            gc.setLineWidth(2);
            gc.strokeOval(centerX - (ringW + 5) / 2, footY - (ringH + 4) / 2, ringW + 5, ringH + 4);
        }

        if (turnActive && !sheetSprite) {
            // No walk frames to play - a gentle bob marks the active unit
            double bob = Math.round(1.5 + 1.5 * Math.sin(now / 250_000_000.0));
            gc.save();
            gc.translate(0, -bob);
            SpriteUtils.drawUnitSpriteOnCanvas(gc, spritePath, x, y - lift, cellSize, fallbackColor, isParty, false);
            gc.restore();
        } else {
            SpriteUtils.drawUnitSpriteOnCanvas(gc, spritePath, x, y - lift, cellSize, fallbackColor, isParty,
                turnActive && sheetSprite);
        }
    }

    private void showAlert(Alert.AlertType type, String title, String content) {
        DialogUtils.showAlert(type, title, content);
    }
}
