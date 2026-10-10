package UI.Battle;

import EntityRes.*;
import Objects.*;
import UI.AnimationUtils;
import UI.AppController;
import UI.CardUtils;
import UI.CharacterSheetView;
import UI.DialogUtils;
import UI.IconUtils;
import UI.SheetButton;
import UI.SpriteUtils;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.animation.TranslateTransition;
import javafx.beans.property.DoubleProperty;
import javafx.beans.property.SimpleDoubleProperty;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.util.Duration;

import java.util.*;
import java.util.function.Supplier;

public class BattleView {

    private final AppController appController;
    private final StackPane rootWrapper;
    private final BorderPane root;
    private final BattleGrid grid;
    private final TurnManager turnManager;
    private final CharacterSheetView sheetView;
    private final BattleGridCanvas gridCanvas;
    private final TimelinePane timelinePane;
    private final BattleState battleState;
    private GridObject selectedEntity;
    private Button nextTurnBtn;
    private Button battleToggleBtn;
    private Button addObjBtn;
    private VBox actionPanel;
    private VBox managePanel;
    private ToggleButton battleTabBtn;
    private ToggleButton manageTabBtn;
    private boolean dicePanelShowing = false;

    // Animated sidebar width: the column slides between these widths instead of
    // snapping, since the Battle/Manage tabs (and the dice-roll panel) each want
    // a different width and an instant resize reads as jarring.
    private static final double SIDEBAR_WIDTH_BATTLE = 185;
    private static final double SIDEBAR_WIDTH_MANAGE = 275;
    private static final double SIDEBAR_WIDTH_DICE = 220;
    private final DoubleProperty sidebarPanelWidth = new SimpleDoubleProperty(SIDEBAR_WIDTH_BATTLE);
    private Timeline sidebarWidthAnim;
    private Button moveBtn;
    private Button attackBtn;
    private Button useItemBtn;
    private Button swapBtn;
    private Button pickupBtn;
    private Button castBtn;
    private ProgressBar healthBar;
    private Label healthTextLabel;
    // Stat rows that only apply to party members (Entities have all 6 stats; Enemies only have Dexterity)
    private HBox strRow;
    private HBox conRow;
    private HBox intRow;
    private HBox wisRow;
    private HBox chaRow;
    private final Map<String, Integer> enemyInstanceCounts = new HashMap<>();
    
    // Dice roll panel for combat
    private DiceRollPanel diceRollPanel;
    
    // Pull-up panel

    private VBox addObjectsPanel;
    private boolean panelExpanded = false;
    private Label addStatusLabel;
    private FlowPane hotbarCardRow;
    private ScrollPane hotbarScroll;
    private ToggleGroup hotbarTabs;
    private String activeHotbarCategory = "party";
    
    // Surprise round toggle
    private ToggleGroup roundStartGroup;
    
    // Placement mode (party)
    private boolean placementMode = false;
    private final Queue<CharSheet> partyToPlace = new LinkedList<>();
    private CharSheet currentPlacing = null;
    private boolean initiativeSetupActive = false;
    private javafx.beans.property.BooleanProperty placementModeProperty = new javafx.beans.property.SimpleBooleanProperty(false);
    
    // Object placement mode (enemies, terrain, pickups)
    private boolean objectPlacementMode = false;
    private Supplier<Object> pendingObjectSupplier = null;
    private String pendingObjectKey = null;
    private String pendingObjectName = null;

    // Elevation brush mode (visual tile heights)
    private boolean elevationMode = false;
    private int elevationBrushDelta = 0; // +1 raise, -1 lower, 0 flatten
    private String elevationBrushKey = null;

    public BattleView(int rows, int cols, CharacterSheetView sheetView, AppController appController) {
        this(rows, cols, "stone", sheetView, appController);
    }

    public BattleView(int rows, int cols, String themeName, CharacterSheetView sheetView, AppController appController) {
        this(rows, cols, null, themeName, sheetView, appController);
    }

    public BattleView(int rows, int cols, boolean[][] mask, String themeName, CharacterSheetView sheetView, AppController appController) {
        this.appController = appController;
        this.sheetView = sheetView;
        this.battleState = new BattleState();

        List<Entity> entities = new ArrayList<>();
        List<TerrainObject> terrainObjects = new ArrayList<>();
        List<Pickup> pickups = new ArrayList<>();

        grid = new BattleGrid(rows, cols, mask, entities, terrainObjects, pickups);
        turnManager = new TurnManager(entities);
        turnManager.setBattleStarted(false);
        
        // Set up tie resolution handler for new rounds
        turnManager.setTieResolutionHandler(this::handleTieResolutions);

        // Create UI components
        timelinePane = new TimelinePane(turnManager);

        gridCanvas = new BattleGridCanvas(grid, turnManager, this);
        gridCanvas.setTheme(GridTheme.byName(themeName));

        BorderPane mainPane = new BorderPane();
        mainPane.setPadding(new Insets(10));
        mainPane.getStyleClass().add("panel-dark");

        // Top: Timeline pane showing turn order
        mainPane.setTop(timelinePane);
        BorderPane.setMargin(timelinePane, new Insets(0, 0, 10, 0));

        // Right side: tabbed sidebar - Battle (actions) / Manage (setup tools)
        actionPanel = createActionPanel();
        managePanel = createManagePanel();
        managePanel.setVisible(false);
        managePanel.setManaged(false);
        diceRollPanel = new DiceRollPanel();
        diceRollPanel.setVisible(false);
        diceRollPanel.setManaged(false);

        battleTabBtn = new ToggleButton("Battle");
        battleTabBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.SWORDS));
        manageTabBtn = new ToggleButton("Manage");
        manageTabBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.GEAR));
        ToggleGroup sidebarTabs = new ToggleGroup();
        for (ToggleButton tab : new ToggleButton[]{battleTabBtn, manageTabBtn}) {
            tab.getStyleClass().add("hotbar-tab");
            tab.setToggleGroup(sidebarTabs);
        }
        battleTabBtn.setSelected(true);
        sidebarTabs.selectedToggleProperty().addListener((obs, oldToggle, newToggle) -> {
            if (newToggle == null) {
                // Keep one tab always selected
                sidebarTabs.selectToggle(oldToggle);
            } else {
                updateRightPanelContent();
            }
        });
        HBox tabHeader = new HBox(6, battleTabBtn, manageTabBtn);
        tabHeader.setAlignment(Pos.CENTER_LEFT);

        StackPane rightContent = new StackPane(actionPanel, managePanel, diceRollPanel);
        // Right-anchored, not centered: each panel's own max width follows its prefWidth
        // (185/275/220), so whichever one is narrower than the currently-animating
        // container needs to hug the right edge - matching the sidebar's own right-docked
        // position - instead of centering with a gap on both sides that closes asymmetrically
        // and reads as the whole panel drifting sideways.
        rightContent.setAlignment(Pos.TOP_RIGHT);
        // The column's width is driven entirely by sidebarPanelWidth (animated on tab/panel
        // switches) rather than derived from whichever child happens to be managed, so a
        // toggle slides smoothly instead of snapping straight to the new panel's width.
        // The width is pinned on the scroll pane below; rightContent just fills its viewport
        // (minus the scrollbar when one shows), so it isn't given a hard min/max here.
        rightContent.prefWidthProperty().bind(sidebarPanelWidth);

        // The Battle tab's stat/action stack is taller than a short window (e.g. a 1080p
        // screen at 125% scaling). Unscrolled, its height became the whole battle view's
        // minimum height, and the app root then centered the oversized view - clipping
        // the timeline at the top and the actions at the bottom. Scrolling the sidebar
        // instead lets the column shrink to whatever height the window has.
        ScrollPane sidebarScroll = new ScrollPane(rightContent);
        sidebarScroll.setFitToWidth(true);
        sidebarScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        sidebarScroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);
        sidebarScroll.setFocusTraversable(false);
        sidebarScroll.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-padding: 0;");
        sidebarScroll.prefWidthProperty().bind(sidebarPanelWidth);
        sidebarScroll.minWidthProperty().bind(sidebarPanelWidth);
        sidebarScroll.maxWidthProperty().bind(sidebarPanelWidth);
        VBox.setVgrow(sidebarScroll, Priority.ALWAYS);
        VBox rightPanel = new VBox(8, tabHeader, sidebarScroll);
        // A VBox's default max width is unbounded, so rightWrap below (which must stay wide
        // enough for the Add Objects drawer) would otherwise stretch rightPanel out to that
        // full width and left-align its children within the leftover space - the exact gap
        // being reported. Capping rightPanel to the same animated width closes that gap.
        rightPanel.prefWidthProperty().bind(sidebarPanelWidth);
        rightPanel.minWidthProperty().bind(sidebarPanelWidth);
        rightPanel.maxWidthProperty().bind(sidebarPanelWidth);

        // Add-objects drawer: a vertical panel that slides in from the right and covers
        // the sidebar while placing objects. It's only ever opened from the Manage tab
        // (see the "Add Objects" button in createManagePanel), so it's always exactly
        // that tab's width - fixed explicitly rather than bound to rightPanel's own
        // width, since rightPanel is a sibling of this panel in the same StackPane
        // below and binding to a sibling's rendered width here is circular: it can
        // only ever grow, never shrink back down once widened.
        addObjectsPanel = createAddObjectsPanel();
        addObjectsPanel.setVisible(false);
        addObjectsPanel.setPrefWidth(SIDEBAR_WIDTH_MANAGE);
        addObjectsPanel.setMaxWidth(SIDEBAR_WIDTH_MANAGE);

        StackPane rightWrap = new StackPane(rightPanel, addObjectsPanel);
        rightWrap.setAlignment(Pos.TOP_RIGHT);

        BorderPane centerArea = new BorderPane();
        centerArea.setCenter(gridCanvas);
        centerArea.setRight(rightWrap);
        BorderPane.setMargin(rightWrap, new Insets(0, 0, 0, 10));
        mainPane.setCenter(centerArea);

        // Battle controls live under the round counter in the timeline
        timelinePane.setBattleControls(buildBattleControls());

        root = mainPane;
        rootWrapper = new StackPane(root);

        sheetView.setBattleView(this);
    }

    public StackPane getRoot() {
        return rootWrapper;
    }

    /** The DM board, so the Two Display Mode window can attach a player-view twin to it. */
    public BattleGridCanvas getGridCanvas() {
        return gridCanvas;
    }

    /** Shared turn order, for the Two Display Mode player strip. */
    public TurnManager getTurnManager() {
        return turnManager;
    }

    /** The DM turn strip, so the Two Display Mode window can attach a player-view twin to it. */
    public TimelinePane getTimelinePane() {
        return timelinePane;
    }
    
    // ================== Placement Mode Methods ==================
    
    /**
     * Start the party placement phase, loading party members from PartyConfig.
     */
    public void startPlacementPhase() {
        List<String> partyNames = PartyConfig.getMembers();
        if (partyNames.isEmpty()) {
            return;
        }
        
        partyToPlace.clear();
        
        // Load CharSheets for each party member
        for (String name : partyNames) {
            for (SheetButton sheetBtn : sheetView.getSheets()) {
                if (sheetBtn.getSheet().getCharSheet().getName().equals(name)) {
                    partyToPlace.add(sheetBtn.getSheet().getCharSheet());
                    break;
                }
            }
        }
        
        if (partyToPlace.isEmpty()) {
            return;
        }

        placementMode = true;
        placementModeProperty.set(true);

        // Start with first party member
        advancePlacement();
        gridCanvas.redraw();
    }
    
    /**
     * Advance to the next party member to place.
     */
    private void advancePlacement() {
        if (partyToPlace.isEmpty()) {
            // Placement complete
            endPlacementPhase();
            return;
        }
        
        currentPlacing = partyToPlace.poll();
        addStatusLabel.setText("Place " + currentPlacing.getName() + " - click on a tile");
    }
    
    /**
     * End the placement phase and enable normal controls.
     */
    private void endPlacementPhase() {
        placementMode = false;
        placementModeProperty.set(false);
        currentPlacing = null;
        
        addStatusLabel.setText("All party members placed");
        timelinePane.showRoster(partyOnField());
        gridCanvas.redraw();
    }
    
    /**
     * Called when a party member is placed on the grid during placement mode.
     */
    public void entityPlaced(Entity entity) {
        grid.addEntity(entity);
        addEntity(entity);
        advancePlacement();
        gridCanvas.redraw();
    }
    
    /**
     * Check if currently in placement mode.
     */
    public boolean isPlacementMode() {
        return placementMode;
    }

    /** Name of the party member currently being placed, or null outside the placement phase. */
    public String getCurrentPlacingName() {
        return currentPlacing != null ? currentPlacing.getName() : null;
    }
    
    /**
     * Get the currently placing CharSheet.
     */
    public CharSheet getCurrentPlacing() {
        return currentPlacing;
    }
    
    /**
     * Check if in object placement mode.
     */
    public boolean isObjectPlacementMode() {
        return objectPlacementMode;
    }

    /**
     * Whether the pending object-placement item is a unit (party member or
     * enemy) rather than terrain or a pickup. Units may share a tile with
     * non-colliding terrain; terrain and pickups still need a fully empty tile.
     */
    public boolean isPendingObjectUnit() {
        return pendingObjectKey != null
            && (pendingObjectKey.startsWith("party:") || pendingObjectKey.startsWith("enemy:"));
    }

    /**
     * Check whether a specific add-objects menu item is currently selected for placement.
     */
    public boolean isPlacementSelectionActive(String key) {
        return (objectPlacementMode && key != null && key.equals(pendingObjectKey))
            || (elevationMode && key != null && key.equals(elevationBrushKey));
    }

    /**
     * Check if the elevation brush is active.
     */
    public boolean isElevationMode() {
        return elevationMode;
    }

    /**
     * Apply the active elevation brush to a tile.
     */
    public void applyElevationBrush(int row, int col) {
        if (!elevationMode) return;
        if (elevationBrushDelta == 0) {
            grid.setElevation(row, col, 0);
        } else {
            grid.adjustElevation(row, col, elevationBrushDelta);
        }
        gridCanvas.redraw();
    }

    /**
     * Stop elevation editing.
     */
    public void cancelElevationMode() {
        if (!elevationMode) return;
        elevationMode = false;
        elevationBrushKey = null;
        addStatusLabel.setText("Elevation editing finished");
        refreshAddObjectsPanels();
        gridCanvas.redraw();
    }

    private void startElevationBrush(int delta, String key, String name) {
        // Clicking the active brush toggles it off
        if (elevationMode && key.equals(elevationBrushKey)) {
            cancelElevationMode();
            return;
        }
        if (objectPlacementMode) {
            cancelObjectPlacement();
        }
        elevationMode = true;
        elevationBrushDelta = delta;
        elevationBrushKey = key;
        addStatusLabel.setText(name + " - click tiles on the grid (ESC to finish)");
        refreshAddObjectsPanels();
        gridCanvas.redraw();
    }
    
    /**
     * Start object placement mode with the given object.
     */
    public void startObjectPlacement(Supplier<Object> supplier, String key, String name) {
        // Clicking the same menu item toggles placement selection off.
        if (objectPlacementMode && key != null && key.equals(pendingObjectKey)) {
            cancelObjectPlacement();
            addStatusLabel.setText("Deselected: " + name);
            return;
        }

        if (elevationMode) {
            cancelElevationMode();
        }
        objectPlacementMode = true;
        pendingObjectSupplier = supplier;
        pendingObjectKey = key;
        pendingObjectName = name;
        addStatusLabel.setText("Selected: " + name + " (click grid to place, click same item again to deselect)");
        refreshAddObjectsPanels();
        gridCanvas.redraw();
    }
    
    /**
     * Called when an object is placed on the grid.
     */
    public void objectPlaced(int row, int col) {
        if (pendingObjectSupplier == null) {
            return;
        }

        Object pendingObject = pendingObjectSupplier.get();
        if (pendingObject == null) {
            addStatusLabel.setText("Failed to create object for placement");
            cancelObjectPlacement();
            return;
        }

        if (pendingObject instanceof Entity entity) {
            entity.setRow(row);
            entity.setCol(col);
            grid.addEntity(entity);
            addEntity(entity);
            addStatusLabel.setText("Placed: " + entity.getName());
            // Party members are unique - stop the paint tool after one placement
            objectPlacementMode = false;
            pendingObjectSupplier = null;
            pendingObjectKey = null;
            pendingObjectName = null;
            refreshAddObjectsPanels();
        } else if (pendingObject instanceof Enemy enemy) {
            enemy.setRow(row);
            enemy.setCol(col);
            grid.addEnemy(enemy);
            addEnemy(enemy);
            addStatusLabel.setText("Placed: " + enemy.getName() + " (still placing " + pendingObjectName + ")");
        } else if (pendingObject instanceof TerrainObject terrain) {
            terrain.setRow(row);
            terrain.setCol(col);
            grid.addTerrain(terrain);
            addStatusLabel.setText("Placed: " + terrain.getType() + " (still placing " + pendingObjectName + ")");
        } else if (pendingObject instanceof Pickup pickup) {
            pickup.setRow(row);
            pickup.setCol(col);
            grid.addPickup(pickup);
            addStatusLabel.setText("Placed: " + pickup.getItem().getName() + " (still placing " + pendingObjectName + ")");
        }
        gridCanvas.redraw();
    }
    
    /**
     * Cancel object placement mode.
     */
    public void cancelObjectPlacement() {
        objectPlacementMode = false;
        pendingObjectSupplier = null;
        pendingObjectKey = null;
        pendingObjectName = null;
        addStatusLabel.setText("Placement cancelled");
        refreshAddObjectsPanels();
        gridCanvas.redraw();
    }

    /**
     * The placement hotbar: a compact bottom strip with category toggles and
     * a single horizontally scrolling row of cards - nothing to clip, no
     * vertical scrolling.
     */
    private VBox createAddObjectsPanel() {
        VBox panel = new VBox(6);
        panel.getStyleClass().addAll("hotbar", "sidebar-panel");
        panel.setPadding(new Insets(8, 10, 8, 10));

        // Title row with close button
        Label title = new Label("Add Objects");
        title.getStyleClass().add("section-header");
        HBox.setHgrow(title, Priority.ALWAYS);
        title.setMaxWidth(Double.MAX_VALUE);

        Button collapseBtn = new Button();
        collapseBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.CLOSE));
        collapseBtn.getStyleClass().add("button");
        collapseBtn.setOnAction(e -> toggleAddObjectsPanel());

        HBox titleRow = new HBox(8, title, collapseBtn);
        titleRow.setAlignment(Pos.CENTER_LEFT);

        // Category toggles, wrapping to fit the drawer width
        FlowPane tabRow = new FlowPane(4, 4);
        tabRow.setPrefWrapLength(250);
        hotbarTabs = new ToggleGroup();
        for (String category : new String[]{"Party", "Enemies", "Terrain", "Pickups", "Elevation"}) {
            ToggleButton tab = new ToggleButton(category);
            IconUtils.Icon categoryIcon = switch (category) {
                case "Party" -> IconUtils.Icon.PARTY;
                case "Enemies" -> IconUtils.Icon.SKULL;
                case "Terrain" -> IconUtils.Icon.MAP;
                case "Elevation" -> IconUtils.Icon.FLAG;
                default -> IconUtils.Icon.CHEST;
            };
            tab.setGraphic(IconUtils.smallIcon(categoryIcon));
            tab.getStyleClass().add("hotbar-tab");
            tab.setUserData(category.toLowerCase());
            tab.setToggleGroup(hotbarTabs);
            if (category.equals("Party")) {
                tab.setSelected(true);
            }
            tabRow.getChildren().add(tab);
        }
        hotbarTabs.selectedToggleProperty().addListener((obs, oldToggle, newToggle) -> {
            if (newToggle == null) {
                // Keep one category always selected
                hotbarTabs.selectToggle(oldToggle);
            } else {
                if (elevationMode) {
                    cancelElevationMode();
                }
                activeHotbarCategory = (String) newToggle.getUserData();
                refreshAddObjectsPanels();
            }
        });

        addStatusLabel = new Label("Click items to add them to the battlefield");
        addStatusLabel.getStyleClass().add("label-status");
        addStatusLabel.setWrapText(true);
        addStatusLabel.setStyle("-fx-font-size: 10px;");
        addStatusLabel.setAlignment(Pos.TOP_LEFT);
        // Fixed height (regardless of message length) so a longer "Selected: ..."
        // message wrapping to more lines doesn't shrink the card scroll area below
        // it and trigger its vertical scrollbar - that scrollbar's width was
        // exactly enough to knock the card grid from 2 columns down to 1.
        addStatusLabel.setMinHeight(40);
        addStatusLabel.setPrefHeight(40);
        addStatusLabel.setMaxHeight(40);

        // Cards wrap into columns and scroll vertically
        hotbarCardRow = new FlowPane(6, 6);
        hotbarCardRow.setPrefWrapLength(250);
        hotbarCardRow.setPadding(new Insets(2));

        hotbarScroll = new ScrollPane(hotbarCardRow);
        hotbarScroll.setFitToWidth(true);
        hotbarScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        hotbarScroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);
        hotbarScroll.setPannable(true);
        hotbarScroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        VBox.setVgrow(hotbarScroll, Priority.ALWAYS);

        panel.getChildren().addAll(titleRow, tabRow, addStatusLabel, hotbarScroll);
        return panel;
    }

    private void toggleAddObjectsPanel() {
        double offscreen = addObjectsPanel.getWidth() > 0 ? addObjectsPanel.getWidth() + 20 : 2000;
        if (panelExpanded) {
            // Slide out to the right
            panelExpanded = false;
            if (objectPlacementMode) {
                cancelObjectPlacement();
            }
            if (elevationMode) {
                cancelElevationMode();
            }
            TranslateTransition slide = new TranslateTransition(Duration.millis(220), addObjectsPanel);
            slide.setToX(offscreen);
            slide.setInterpolator(Interpolator.EASE_IN);
            slide.setOnFinished(e -> addObjectsPanel.setVisible(false));
            slide.play();
        } else {
            // Slide in from the right
            panelExpanded = true;
            refreshAddObjectsPanels();
            addObjectsPanel.setTranslateX(offscreen);
            addObjectsPanel.setVisible(true);
            TranslateTransition slide = new TranslateTransition(Duration.millis(220), addObjectsPanel);
            slide.setToX(0);
            slide.setInterpolator(Interpolator.EASE_OUT);
            slide.play();
        }
    }

    private void refreshAddObjectsPanels() {
        if (hotbarCardRow == null) return;
        hotbarCardRow.getChildren().clear();
        List<Node> cards = switch (activeHotbarCategory) {
            case "enemies" -> buildEnemyCards();
            case "terrain" -> buildTerrainCards();
            case "pickups" -> buildPickupCards();
            case "elevation" -> buildElevationCards();
            default -> buildPartyCards();
        };
        if (cards.isEmpty()) {
            Label empty = new Label("Nothing available in this category");
            empty.setStyle("-fx-text-fill: #808080; -fx-font-style: italic;");
            hotbarCardRow.getChildren().add(empty);
        } else {
            hotbarCardRow.getChildren().addAll(cards);
        }
    }

    private VBox createActionPanel() {
        VBox panel = new VBox(8);
        panel.setPadding(new Insets(10, 10, 28, 10));
        panel.setPrefWidth(SIDEBAR_WIDTH_BATTLE);
        // Small, not SIDEBAR_WIDTH_BATTLE: the animated sidebarPanelWidth is what actually
        // drives the column's width now, and a hard floor here would clamp the animation
        // partway through a Manage -> Battle shrink instead of letting it slide smoothly.
        panel.setMinWidth(60);
        panel.getStyleClass().addAll("panel", "sidebar-panel");

        // Selected entity indicator
        Label selectLabel = new Label("Selected");
        selectLabel.getStyleClass().add("section-header");

        Label selectedEntityLabel = new Label("--");
        selectedEntityLabel.setId("selectedEntityLabel");
        selectedEntityLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc; -fx-font-weight: bold;");
        selectedEntityLabel.setWrapText(true);

        // Health section with progress bar and adjustment buttons
        Label healthLabel = new Label("Health");
        healthLabel.getStyleClass().add("label-muted");

        HBox healthRow = new HBox(5);
        healthRow.setAlignment(Pos.CENTER_LEFT);

        Button healthMinusBtn = new Button();
        healthMinusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.MINUS, 12, "#dcdcdc"));
        healthMinusBtn.setStyle("-fx-min-width: 25px; -fx-min-height: 20px;");
        healthMinusBtn.setOnAction(e -> adjustHealth(-1));

        StackPane healthPane = new StackPane();
        healthPane.setAlignment(Pos.CENTER);

        healthBar = new ProgressBar(0);
        healthBar.setPrefWidth(100);
        healthBar.setPrefHeight(20);
        healthBar.getStyleClass().add("progress-bar-danger");

        healthTextLabel = new Label("-- / --");
        healthTextLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: white; -fx-font-weight: bold;");

        healthPane.getChildren().addAll(healthBar, healthTextLabel);
        attachHealthScrub(healthPane);

        Button healthPlusBtn = new Button();
        healthPlusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.PLUS, 12, "#dcdcdc"));
        healthPlusBtn.setStyle("-fx-min-width: 25px; -fx-min-height: 20px;");
        healthPlusBtn.setOnAction(e -> adjustHealth(1));

        healthRow.getChildren().addAll(healthMinusBtn, healthPane, healthPlusBtn);

        // Stats section - AC + all 6 basic stats, temporarily adjustable for this battle only
        Label statsLabel = new Label("Stats");
        statsLabel.getStyleClass().add("label-muted");

        HBox acRow = createStatRow("AC", "#FFD700", "acLabel", d -> adjustAC(d));
        HBox strRowLocal = createStatRow("STR", "#d75f5f", "strLabel", d -> adjustStat(CharSheet.STRENGTH, d));
        HBox dexRow = createStatRow("DEX", "#4CAF50", "dexLabel", d -> adjustStat(CharSheet.DEXTERITY, d));
        HBox conRowLocal = createStatRow("CON", "#2196F3", "conLabel", d -> adjustStat(CharSheet.CONSTITUTION, d));
        HBox intRowLocal = createStatRow("INT", "#FF9800", "intLabel", d -> adjustStat(CharSheet.INTELLIGENCE, d));
        HBox wisRowLocal = createStatRow("WIS", "#4ec9b0", "wisLabel", d -> adjustStat(CharSheet.WISDOM, d));
        HBox chaRowLocal = createStatRow("CHA", "#c586c0", "chaLabel", d -> adjustStat(CharSheet.CHARISMA, d));
        strRow = strRowLocal;
        conRow = conRowLocal;
        intRow = intRowLocal;
        wisRow = wisRowLocal;
        chaRow = chaRowLocal;

        Label mobLabel = new Label("MOB: --");
        mobLabel.setId("mobLabel");
        mobLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #dcdcdc;");

        // Weapon section - shows the currently equipped (primary) weapon only, with a small
        // swap button next to it to bring the secondary weapon forward instead.
        Label weapLabel = new Label("Weapon");
        weapLabel.getStyleClass().add("label-muted");

        Label primaryLabel = new Label("--");
        primaryLabel.setId("primaryLabel");
        primaryLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #dcdcdc;");
        primaryLabel.setWrapText(true);
        HBox.setHgrow(primaryLabel, Priority.ALWAYS);

        swapBtn = createSmallIconButton(IconUtils.Icon.UNDO, "Q");
        swapBtn.setDisable(true);
        swapBtn.setOnAction(e -> gridCanvas.triggerSwapForSelected());

        HBox weaponRow = new HBox(6, primaryLabel, swapBtn);
        weaponRow.setAlignment(Pos.CENTER_LEFT);

        // Damage dice section - one row per tier, temporarily cyclable through d4..d20
        Label diceLabel = new Label("Damage Dice");
        diceLabel.getStyleClass().add("label-muted");

        HBox tier1Row = createStatRow("T1", "#a0a0a0", "tier1Label", d -> adjustDice(0, d), false);
        HBox tier2Row = createStatRow("T2", "#a0a0a0", "tier2Label", d -> adjustDice(1, d), false);
        HBox tier3Row = createStatRow("T3", "#a0a0a0", "tier3Label", d -> adjustDice(2, d), false);

        Separator sep = new Separator();

        Label actionsLabel = new Label("Actions");
        actionsLabel.getStyleClass().add("section-header");

        // Action buttons - condensed into a numpad-style grid of square icon buttons,
        // each shaded a distinct color so the four actions read apart at a glance
        moveBtn = createSquareActionButton(IconUtils.Icon.MOVE, "F");
        moveBtn.setDisable(true);
        moveBtn.setOnAction(e -> gridCanvas.startMoveMode());
        moveBtn.getStyleClass().add("button-success");

        attackBtn = createSquareActionButton(IconUtils.Icon.TARGET, "E");
        attackBtn.setDisable(true);
        attackBtn.setOnAction(e -> gridCanvas.startAttackMode());
        attackBtn.getStyleClass().add("button-danger");

        useItemBtn = createSquareActionButton(IconUtils.Icon.POTION, "R");
        useItemBtn.setDisable(true);
        useItemBtn.setOnAction(e -> gridCanvas.triggerUseItemForSelected());
        useItemBtn.getStyleClass().add("button-accent");

        pickupBtn = createSquareActionButton(IconUtils.Icon.HAND, "P");
        pickupBtn.setDisable(true);
        pickupBtn.setOnAction(e -> gridCanvas.startPickupMode());
        pickupBtn.getStyleClass().add("button-earth");

        // Cast spans both columns under the numpad so spellcasting reads as its own action
        castBtn = createSquareActionButton(IconUtils.Icon.SPELL, "C");
        castBtn.setMinSize(120, 56);
        castBtn.setPrefSize(120, 56);
        castBtn.setMaxSize(120, 56);
        castBtn.setDisable(true);
        castBtn.setOnAction(e -> gridCanvas.startCastMode());
        castBtn.getStyleClass().add("button-arcane");

        GridPane actionsGrid = new GridPane();
        actionsGrid.setHgap(8);
        actionsGrid.setVgap(8);
        actionsGrid.setAlignment(Pos.CENTER_LEFT);
        actionsGrid.add(moveBtn, 0, 0);
        actionsGrid.add(attackBtn, 1, 0);
        actionsGrid.add(useItemBtn, 0, 1);
        actionsGrid.add(pickupBtn, 1, 1);
        actionsGrid.add(castBtn, 0, 2, 2, 1);

        panel.getChildren().addAll(
            selectLabel, selectedEntityLabel,
            healthLabel, healthRow,
            statsLabel, acRow, strRow, dexRow, conRow, intRow, wisRow, chaRow, mobLabel,
            weapLabel, weaponRow, diceLabel, tier1Row, tier2Row, tier3Row, sep,
            actionsLabel, actionsGrid
        );

        return panel;
    }

    /**
     * Build a compact, color-coded stat row: an abbreviation label matching the character sheet's
     * stat colors, flanked by rounded spinner-style -/+ buttons around the live value. Scrubbable
     * by click-and-drag on the value itself for a faster bulk change.
     */
    private HBox createStatRow(String abbrev, String colorHex, String valueLabelId, java.util.function.IntConsumer onAdjust) {
        return createStatRow(abbrev, colorHex, valueLabelId, onAdjust, true);
    }

    /**
     * As above, with drag-scrubbing optional - tier-dice rows cycle a die *type*, not a
     * numeric value, so dragging them wouldn't make sense and they pass false.
     */
    private HBox createStatRow(String abbrev, String colorHex, String valueLabelId,
            java.util.function.IntConsumer onAdjust, boolean scrubbable) {
        Label abbrevLabel = new Label(abbrev);
        abbrevLabel.setMinWidth(30);
        abbrevLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-text-fill: " + colorHex + ";");

        Button minusBtn = new Button();
        minusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.MINUS, 10, "#dcdcdc"));
        minusBtn.getStyleClass().addAll("spinner-button", "spinner-decrement");
        minusBtn.setMinSize(20, 20);
        minusBtn.setMaxSize(20, 20);
        minusBtn.setOnAction(e -> onAdjust.accept(-1));

        Label valueLabel = new Label("--");
        valueLabel.setId(valueLabelId);
        valueLabel.getStyleClass().add("spinner-value");
        valueLabel.setMinWidth(30);
        valueLabel.setAlignment(Pos.CENTER);
        valueLabel.setStyle("-fx-font-size: 12px;");
        if (scrubbable) {
            attachStatScrub(valueLabel, onAdjust);
        }

        Button plusBtn = new Button();
        plusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.PLUS, 10, "#dcdcdc"));
        plusBtn.getStyleClass().addAll("spinner-button", "spinner-increment");
        plusBtn.setMinSize(20, 20);
        plusBtn.setMaxSize(20, 20);
        plusBtn.setOnAction(e -> onAdjust.accept(1));

        HBox spinnerBox = new HBox(minusBtn, valueLabel, plusBtn);
        spinnerBox.setAlignment(Pos.CENTER);

        HBox row = new HBox(6, abbrevLabel, spinnerBox);
        row.setAlignment(Pos.CENTER_LEFT);
        return row;
    }

    /**
     * Build a square icon button for the numpad-style actions grid, keeping the icon and the
     * keyboard-shortcut letter that used to appear in the full-width button's text label.
     */
    private Button createSquareActionButton(IconUtils.Icon icon, String shortcutLetter) {
        VBox content = new VBox(2);
        content.setAlignment(Pos.CENTER);
        Label shortcutLabel = new Label(shortcutLetter);
        shortcutLabel.setStyle("-fx-font-size: 9px; -fx-font-weight: bold; -fx-text-fill: #909095;");
        content.getChildren().addAll(IconUtils.createIcon(icon, 20, "#dcdcdc"), shortcutLabel);

        Button btn = new Button();
        btn.setGraphic(content);
        btn.getStyleClass().add("button");
        btn.setMinSize(56, 56);
        btn.setPrefSize(56, 56);
        btn.setMaxSize(56, 56);
        return btn;
    }

    /**
     * Build a small icon button for inline placement next to a label (e.g. the weapon swap
     * button), keeping the same icon + shortcut-letter convention as the numpad action buttons.
     */
    private Button createSmallIconButton(IconUtils.Icon icon, String shortcutLetter) {
        VBox content = new VBox(1);
        content.setAlignment(Pos.CENTER);
        Label shortcutLabel = new Label(shortcutLetter);
        shortcutLabel.setStyle("-fx-font-size: 7px; -fx-font-weight: bold; -fx-text-fill: #909095;");
        content.getChildren().addAll(IconUtils.createIcon(icon, 12, "#dcdcdc"), shortcutLabel);

        Button btn = new Button();
        btn.setGraphic(content);
        btn.getStyleClass().add("button");
        btn.setMinSize(28, 28);
        btn.setPrefSize(28, 28);
        btn.setMaxSize(28, 28);
        return btn;
    }

    public void updateSelectedEntity(GridObject obj) {
        this.selectedEntity = obj;
        Label selectedLabel = (Label) actionPanel.lookup("#selectedEntityLabel");
        Label strLabel = (Label) actionPanel.lookup("#strLabel");
        Label dexLabel = (Label) actionPanel.lookup("#dexLabel");
        Label conLabel = (Label) actionPanel.lookup("#conLabel");
        Label intLabel = (Label) actionPanel.lookup("#intLabel");
        Label wisLabel = (Label) actionPanel.lookup("#wisLabel");
        Label chaLabel = (Label) actionPanel.lookup("#chaLabel");
        Label mobLabel = (Label) actionPanel.lookup("#mobLabel");
        Label acLabel = (Label) actionPanel.lookup("#acLabel");
        Label primaryLabel = (Label) actionPanel.lookup("#primaryLabel");
        Label tier1Label = (Label) actionPanel.lookup("#tier1Label");
        Label tier2Label = (Label) actionPanel.lookup("#tier2Label");
        Label tier3Label = (Label) actionPanel.lookup("#tier3Label");

        // Only party Entities have all 6 basic stats; Enemies only have Dexterity.
        boolean showFullStats = obj instanceof Entity;
        for (HBox row : new HBox[]{strRow, conRow, intRow, wisRow, chaRow}) {
            row.setVisible(showFullStats);
            row.setManaged(showFullStats);
        }

        if (obj == null) {
            if (selectedLabel != null) selectedLabel.setText("--");
            if (strLabel != null) strLabel.setText("--");
            if (dexLabel != null) dexLabel.setText("--");
            if (conLabel != null) conLabel.setText("--");
            if (intLabel != null) intLabel.setText("--");
            if (wisLabel != null) wisLabel.setText("--");
            if (chaLabel != null) chaLabel.setText("--");
            if (mobLabel != null) mobLabel.setText("MOB: --");
            if (acLabel != null) acLabel.setText("--");
            if (primaryLabel != null) primaryLabel.setText("--");
            if (tier1Label != null) tier1Label.setText("--");
            if (tier2Label != null) tier2Label.setText("--");
            if (tier3Label != null) tier3Label.setText("--");
            healthBar.setProgress(0);
            healthTextLabel.setText("-- / --");
            moveBtn.setDisable(true);
            attackBtn.setDisable(true);
            useItemBtn.setDisable(true);
            swapBtn.setDisable(true);
            pickupBtn.setDisable(true);
            castBtn.setDisable(true);
        } else if (obj instanceof Entity e) {
            if (selectedLabel != null) selectedLabel.setText(e.getName());
            styleAdjustedValue(strLabel, e.getStatAdjustment(CharSheet.STRENGTH));
            styleAdjustedValue(dexLabel, e.getStatAdjustment(CharSheet.DEXTERITY));
            styleAdjustedValue(conLabel, e.getStatAdjustment(CharSheet.CONSTITUTION));
            styleAdjustedValue(intLabel, e.getStatAdjustment(CharSheet.INTELLIGENCE));
            styleAdjustedValue(wisLabel, e.getStatAdjustment(CharSheet.WISDOM));
            styleAdjustedValue(chaLabel, e.getStatAdjustment(CharSheet.CHARISMA));
            styleAdjustedValue(acLabel, e.getAcAdjustment());
            if (strLabel != null) strLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.STRENGTH)));
            if (dexLabel != null) dexLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.DEXTERITY)));
            if (conLabel != null) conLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.CONSTITUTION)));
            if (intLabel != null) intLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.INTELLIGENCE)));
            if (wisLabel != null) wisLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.WISDOM)));
            if (chaLabel != null) chaLabel.setText(String.valueOf(e.getAdjustedAttribute(CharSheet.CHARISMA)));
            if (mobLabel != null) mobLabel.setText("MOB: " + e.getMovement());
            if (acLabel != null) acLabel.setText(String.valueOf(e.getAC()));

            Weapon primary = e.getCharSheet().getEquippedWeapon();
            if (primaryLabel != null) {
                primaryLabel.setText(formatWeaponWithAmmoCount(e, primary));
            }
            String[] dice = e.getDamageDice();
            String[] baseDice = e.getBaseDamageDice();
            if (tier1Label != null) tier1Label.setText(dice[0] != null ? dice[0] : "--");
            if (tier2Label != null) tier2Label.setText(dice[1] != null ? dice[1] : "--");
            if (tier3Label != null) tier3Label.setText(dice[2] != null ? dice[2] : "--");
            styleAdjustedDie(tier1Label, dice[0], baseDice[0]);
            styleAdjustedDie(tier2Label, dice[1], baseDice[1]);
            styleAdjustedDie(tier3Label, dice[2], baseDice[2]);

            // Update health bar
            int maxHP = e.getCharSheet().getTotalHP();
            int currentHP = e.getCharSheet().getCurrentHP();
            double hpPct = maxHP > 0 ? (double) currentHP / maxHP : 0;
            if (Math.abs(healthBar.getProgress() - hpPct) > 0.001) {
                AnimationUtils.animateProgressBar(healthBar, hpPct);
            }
            healthTextLabel.setText(currentHP + " / " + maxHP);

            boolean canAct = e.isParty() && battleState.isBattleStarted();
            moveBtn.setDisable(!canAct);
            attackBtn.setDisable(!canAct);
            useItemBtn.setDisable(!canAct);
            swapBtn.setDisable(!canAct);
            pickupBtn.setDisable(!canAct);
            castBtn.setDisable(!canAct || SpellPickerDialog.castableSpells(e.getCharSheet()).isEmpty());
        } else if (obj instanceof Enemy en) {
            if (selectedLabel != null) selectedLabel.setText(en.getName());
            styleAdjustedValue(dexLabel, en.getDexAdjustment());
            styleAdjustedValue(acLabel, en.getAcAdjustment());
            if (dexLabel != null) dexLabel.setText(String.valueOf(en.getAdjustedDexterity()));
            if (mobLabel != null) mobLabel.setText("MOB: " + en.getMovement());
            if (acLabel != null) acLabel.setText(String.valueOf(en.getAC()));
            if (primaryLabel != null) primaryLabel.setText("ATK: " + en.getAttackModifier());
            String[] dice = en.getDamageDice();
            String[] baseDice = en.getBaseDamageDice();
            if (tier1Label != null) tier1Label.setText(dice[0] != null ? dice[0] : "--");
            if (tier2Label != null) tier2Label.setText(dice[1] != null ? dice[1] : "--");
            if (tier3Label != null) tier3Label.setText(dice[2] != null ? dice[2] : "--");
            styleAdjustedDie(tier1Label, dice[0], baseDice[0]);
            styleAdjustedDie(tier2Label, dice[1], baseDice[1]);
            styleAdjustedDie(tier3Label, dice[2], baseDice[2]);

            // Update health bar for enemy
            int maxHP = en.getMaxHealth();
            int currentHP = en.getHealth();
            double hpPct = maxHP > 0 ? (double) currentHP / maxHP : 0;
            if (Math.abs(healthBar.getProgress() - hpPct) > 0.001) {
                AnimationUtils.animateProgressBar(healthBar, hpPct);
            }
            healthTextLabel.setText(currentHP + " / " + maxHP);

            boolean canAct = battleState.isBattleStarted();
            moveBtn.setDisable(!canAct);
            attackBtn.setDisable(!canAct);
            useItemBtn.setDisable(true);
            swapBtn.setDisable(true);
            pickupBtn.setDisable(true);
            castBtn.setDisable(true);
        }

        // Keep focus on grid canvas for keyboard shortcuts
        if (obj != null) {
            gridCanvas.requestFocus();
        }
    }

    /**
     * Color a stat value label green if it's been temporarily boosted, red if reduced,
     * or the default white if unchanged from its base value.
     */
    private void styleAdjustedValue(Label label, int adjustment) {
        if (label == null) return;
        String color = adjustment > 0 ? "#4CAF50" : adjustment < 0 ? "#d75f5f" : "#ffffff";
        label.setStyle("-fx-font-size: 12px; -fx-text-fill: " + color + ";");
    }

    /**
     * Color a damage-dice tier label green if it's been temporarily bumped up the d4..d20
     * progression, red if bumped down, or the default white if unchanged from the weapon's die.
     */
    private void styleAdjustedDie(Label label, String currentDie, String baseDie) {
        if (label == null) return;
        int diceIndexDelta = diceIndex(currentDie) - diceIndex(baseDie);
        String color = diceIndexDelta > 0 ? "#4CAF50" : diceIndexDelta < 0 ? "#d75f5f" : "#ffffff";
        label.setStyle("-fx-font-size: 12px; -fx-text-fill: " + color + ";");
    }

    private int diceIndex(String die) {
        int index = java.util.Arrays.asList(DICE_PROGRESSION).indexOf(die);
        return index < 0 ? 0 : index;
    }

    /**
     * Format a weapon name with ammo count when the weapon is ranged.
     */
    private String formatWeaponWithAmmoCount(Entity entity, Weapon weapon) {
        if (weapon == null) {
            return "None";
        }

        if (!weapon.isRanged()) {
            return weapon.getName();
        }

        int ammoCount = 0;
        for (Item item : entity.getCharSheet().getInventory()) {
            if (item instanceof Ammunition ammo && ammo.isCompatibleWith(weapon)) {
                ammoCount += Math.max(0, ammo.getQuantity());
            }
        }

        return weapon.getName() + " (x" + ammoCount + ")";
    }
    
    /**
     * Turn the HP bar into a click-and-drag scrubber: press or drag anywhere along its
     * width jumps current HP to the proportional value under the cursor, live; release
     * commits the change once (see {@link #commitHealthChange()}).
     */
    private void attachHealthScrub(StackPane healthPane) {
        healthPane.setCursor(javafx.scene.Cursor.HAND);
        healthPane.setOnMousePressed(e -> {
            healthPane.setCursor(javafx.scene.Cursor.CLOSED_HAND);
            scrubHealthTo(e.getX(), healthPane.getWidth());
        });
        healthPane.setOnMouseDragged(e -> scrubHealthTo(e.getX(), healthPane.getWidth()));
        healthPane.setOnMouseReleased(e -> {
            healthPane.setCursor(javafx.scene.Cursor.HAND);
            commitHealthChange();
        });
    }

    /** Set the selected entity's/enemy's current HP to the value at a given x position along the health bar. */
    private void scrubHealthTo(double x, double width) {
        if (width <= 0) return;
        int maxHP;
        int currentHP;
        if (selectedEntity instanceof Entity e) {
            maxHP = e.getCharSheet().getTotalHP();
            currentHP = e.getCharSheet().getCurrentHP();
        } else if (selectedEntity instanceof Enemy en) {
            maxHP = en.getMaxHealth();
            currentHP = en.getHealth();
        } else {
            return;
        }
        double frac = Math.max(0, Math.min(1, x / width));
        int target = (int) Math.round(frac * maxHP);
        applyHealthDelta(target - currentHP);
    }

    private static final double STAT_DRAG_THRESHOLD = 4;
    private static final double STAT_DRAG_PIXELS_PER_POINT = 8;

    /**
     * Let a stat row's value be click-and-dragged for a faster bulk change: horizontal drag
     * distance (past a small threshold, so aiming a click doesn't nudge the value) maps to a
     * point delta, applied incrementally through the same callback the +/- buttons use.
     */
    private void attachStatScrub(Label valueLabel, java.util.function.IntConsumer onAdjust) {
        valueLabel.setCursor(javafx.scene.Cursor.H_RESIZE);
        double[] pressX = new double[1];
        int[] appliedDelta = new int[1];
        boolean[] dragging = new boolean[1];

        valueLabel.setOnMousePressed(e -> {
            pressX[0] = e.getX();
            appliedDelta[0] = 0;
            dragging[0] = false;
        });
        valueLabel.setOnMouseDragged(e -> {
            double dx = e.getX() - pressX[0];
            if (!dragging[0]) {
                if (Math.abs(dx) < STAT_DRAG_THRESHOLD) return;
                dragging[0] = true;
            }
            int totalDelta = (int) (dx / STAT_DRAG_PIXELS_PER_POINT);
            if (totalDelta != appliedDelta[0]) {
                onAdjust.accept(totalDelta - appliedDelta[0]);
                appliedDelta[0] = totalDelta;
            }
        });
        valueLabel.setOnMouseReleased(e -> dragging[0] = false);
    }

    private void adjustHealth(int delta) {
        applyHealthDelta(delta);
        commitHealthChange();
    }

    /**
     * Apply an HP change in memory only (clamped, UI refreshed) without persisting.
     * Lets a drag gesture update live on every tick without hitting disk each time;
     * callers are expected to follow up with {@link #commitHealthChange()} once done.
     */
    private void applyHealthDelta(int delta) {
        if (selectedEntity == null) return;

        if (selectedEntity instanceof Entity e) {
            int maxHP = e.getCharSheet().getTotalHP();
            int currentHP = e.getCharSheet().getCurrentHP();
            int newHP = Math.max(0, Math.min(maxHP, currentHP + delta));
            e.getCharSheet().setCurrentHP(newHP);
            refreshPartyHealth();
            gridCanvas.redraw();
            updateSelectedEntity(e);
        } else if (selectedEntity instanceof Enemy en) {
            int maxHP = en.getMaxHealth();
            int currentHP = en.getHealth();
            int newHP = Math.max(0, Math.min(maxHP, currentHP + delta));
            en.setHealth(newHP);
            gridCanvas.redraw();
            updateSelectedEntity(en);
        }
    }

    /** Persist the selected entity's current HP (Enemies aren't saved to disk). */
    private void commitHealthChange() {
        if (selectedEntity instanceof Entity e) {
            e.getCharSheet().save();
        }
    }

    /**
     * Temporarily adjust the selected entity's/enemy's AC for this battle only.
     * Not persisted - it lives on the in-battle instance and resets next battle.
     */
    private void adjustAC(int delta) {
        if (selectedEntity == null) return;

        if (selectedEntity instanceof Entity e) {
            e.adjustAC(delta);
            updateSelectedEntity(e);
        } else if (selectedEntity instanceof Enemy en) {
            en.adjustAC(delta);
            updateSelectedEntity(en);
        }
    }

    /**
     * Temporarily adjust one of the selected entity's/enemy's basic stats for this battle only.
     * Not persisted - it lives on the in-battle instance and resets next battle. Enemies only
     * have a real Dexterity stat, so any other index is a no-op for them (their rows are hidden).
     */
    private void adjustStat(int attributeIndex, int delta) {
        if (selectedEntity == null) return;

        if (selectedEntity instanceof Entity e) {
            e.adjustStat(attributeIndex, delta);
            updateSelectedEntity(e);
        } else if (selectedEntity instanceof Enemy en && attributeIndex == CharSheet.DEXTERITY) {
            en.adjustDexterity(delta);
            updateSelectedEntity(en);
        }
    }

    private static final String[] DICE_PROGRESSION = {"d4", "d6", "d8", "d10", "d12", "d20"};

    /**
     * Step a die one size up or down the d4..d20 progression, clamped at both ends.
     */
    private String cycleDie(String currentDie, int direction) {
        int newIndex = Math.max(0, Math.min(DICE_PROGRESSION.length - 1, diceIndex(currentDie) + direction));
        return DICE_PROGRESSION[newIndex];
    }

    /**
     * Temporarily override one damage-dice tier for this battle only.
     * Not persisted - it lives on the in-battle instance and resets next battle.
     */
    private void adjustDice(int tier, int direction) {
        if (selectedEntity == null) return;

        if (selectedEntity instanceof Entity e) {
            String currentDie = e.getDamageDice()[tier];
            e.setDiceOverride(tier, cycleDie(currentDie, direction));
            updateSelectedEntity(e);
        } else if (selectedEntity instanceof Enemy en) {
            String currentDie = en.getDamageDice()[tier];
            en.setDiceOverride(tier, cycleDie(currentDie, direction));
            updateSelectedEntity(en);
        }
    }

    /** Compact battle controls shown under the timeline's round counter. */
    private VBox buildBattleControls() {
        battleToggleBtn = new Button();
        battleToggleBtn.setTooltip(new Tooltip("Begin or end the battle"));
        battleToggleBtn.getStyleClass().clear();
        battleToggleBtn.getStyleClass().addAll("timeline-button",
            battleState.isBattleStarted() ? "button-danger" : "button-primary");
        battleToggleBtn.disableProperty().bind(placementModeProperty);
        battleState.battleStartedProperty().addListener((obs, oldVal, newVal) -> {
            battleToggleBtn.getStyleClass().clear();
            battleToggleBtn.getStyleClass().addAll("timeline-button",
                newVal ? "button-danger" : "button-primary");
        });
        battleToggleBtn.textProperty().bind(
            battleState.battleStartedProperty().map(started -> started ? "End" : "Begin")
        );
        battleToggleBtn.graphicProperty().bind(
            battleState.battleStartedProperty().map(started -> started ? IconUtils.smallIcon(IconUtils.Icon.STOP) : IconUtils.smallIcon(IconUtils.Icon.PLAY))
        );
        battleToggleBtn.setOnAction(e -> {
            if (battleState.isBattleStarted()) {
                handleEndBattle();
            } else {
                handleBeginBattle();
            }
        });

        nextTurnBtn = new Button("Next");
        nextTurnBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.FAST_FORWARD));
        nextTurnBtn.setTooltip(new Tooltip("Next turn"));
        nextTurnBtn.getStyleClass().addAll("button", "timeline-button");
        nextTurnBtn.setOnAction(e -> handleNextTurn());
        // Enable next turn only when battle is active and not in placement mode
        nextTurnBtn.disableProperty().bind(
            battleState.battleStartedProperty().not().or(placementModeProperty)
        );

        HBox buttons = new HBox(6, battleToggleBtn, nextTurnBtn);
        buttons.setAlignment(Pos.CENTER_LEFT);

        // Round-start mode: Surprise (party first) / Normal / Ambush (enemies
        // first). Three explicit toggles instead of an ambiguous slider so the
        // discrete choice - and which one is active - is unmistakable at a glance.
        // Locks once the battle begins.
        roundStartGroup = new ToggleGroup();
        ToggleButton surpriseBtn = createRoundStartToggle("Surp", TurnManager.RoundStartMode.SURPRISE,
            "Surprise: party acts first");
        ToggleButton normalBtn = createRoundStartToggle("Norm", TurnManager.RoundStartMode.NORMAL,
            "Normal: standard initiative order");
        ToggleButton ambushBtn = createRoundStartToggle("Amb", TurnManager.RoundStartMode.AMBUSH,
            "Ambush: enemies act first");
        normalBtn.setSelected(true);

        // Never allow the group to end up with nothing selected
        roundStartGroup.selectedToggleProperty().addListener((obs, oldToggle, newToggle) -> {
            if (newToggle == null) {
                roundStartGroup.selectToggle(oldToggle);
            }
        });

        HBox toggleRow = new HBox(4, surpriseBtn, normalBtn, ambushBtn);
        toggleRow.setAlignment(Pos.CENTER_LEFT);

        VBox controls = new VBox(5, buttons, toggleRow);
        controls.setAlignment(Pos.CENTER_LEFT);
        return controls;
    }

    private ToggleButton createRoundStartToggle(String label, TurnManager.RoundStartMode mode, String tooltipText) {
        ToggleButton btn = new ToggleButton(label);
        btn.getStyleClass().addAll("hotbar-tab", "round-start-toggle");
        btn.setUserData(mode);
        btn.setToggleGroup(roundStartGroup);
        btn.disableProperty().bind(battleState.battleStartedProperty());
        Tooltip tooltip = new Tooltip(tooltipText);
        tooltip.setShowDelay(javafx.util.Duration.millis(200));
        btn.setTooltip(tooltip);
        return btn;
    }

    private TurnManager.RoundStartMode roundStartModeFromSlider() {
        Toggle selected = roundStartGroup.getSelectedToggle();
        return selected != null ? (TurnManager.RoundStartMode) selected.getUserData() : TurnManager.RoundStartMode.NORMAL;
    }

    /** The Manage sidebar tab: battlefield setup tools. */
    private VBox createManagePanel() {
        VBox panel = new VBox(10);
        panel.setPadding(new Insets(10));
        panel.setPrefWidth(SIDEBAR_WIDTH_MANAGE);
        panel.setMinWidth(60);
        panel.getStyleClass().addAll("panel", "sidebar-panel");

        Label title = new Label("Manage");
        title.getStyleClass().add("section-header");

        Button backBtn = new Button("Character Sheets");
        backBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.PERSON));
        backBtn.getStyleClass().add("button");
        backBtn.setMaxWidth(Double.MAX_VALUE);
        backBtn.setOnAction(e -> handleBack());

        addObjBtn = new Button("Add Objects");
        addObjBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.PLUS));
        addObjBtn.getStyleClass().add("button");
        addObjBtn.setMaxWidth(Double.MAX_VALUE);
        addObjBtn.setOnAction(e -> toggleAddObjectsPanel());
        addObjBtn.disableProperty().bind(placementModeProperty);

        // Board theme picker (live switch)
        Label themeLabel = new Label("Board Theme");
        themeLabel.getStyleClass().add("label-header");
        themeLabel.setGraphic(IconUtils.smallIcon(IconUtils.Icon.MAP));
        themeLabel.setGraphicTextGap(6);
        ComboBox<String> themePicker = new ComboBox<>();
        themePicker.getItems().addAll(GridTheme.names());
        themePicker.setValue(gridCanvas.getTheme().name);
        themePicker.setMaxWidth(Double.MAX_VALUE);
        themePicker.setTooltip(new Tooltip("Board texture theme"));
        themePicker.setOnAction(e -> gridCanvas.setTheme(GridTheme.byName(themePicker.getValue())));

        Separator sep = new Separator();

        // Long rest: refill every party caster's spell slots between fights
        Button longRestBtn = new Button("Long Rest (Spell Slots)");
        longRestBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.REST, 14, "#ffffff"));
        longRestBtn.getStyleClass().add("button-arcane");
        longRestBtn.setMaxWidth(Double.MAX_VALUE);
        longRestBtn.setTooltip(new Tooltip("Restore all spell slots for every party member on the board"));
        longRestBtn.setOnAction(e -> handleLongRest());

        panel.getChildren().addAll(title, backBtn, addObjBtn, longRestBtn, sep, themeLabel, themePicker);
        return panel;
    }

    private void handleLongRest() {
        int rested = 0;
        for (Entity entity : grid.getEntities()) {
            if (entity.isParty() && entity.getCharSheet().isCaster()) {
                entity.getCharSheet().longRest();
                gridCanvas.spawnFloatingText(entity, "Rested", javafx.scene.paint.Color.web("#b9a8f5"));
                rested++;
            }
        }
        if (rested == 0) {
            DialogUtils.showAlert(Alert.AlertType.INFORMATION, "Long Rest", "No party spellcasters are on the board.");
        }
        gridCanvas.redraw();
    }

    /** Show the active sidebar tab's content, unless the dice panel is up. */
    private void updateRightPanelContent() {
        boolean manage = manageTabBtn.isSelected();
        showSidebarSubPanel(actionPanel, !manage && !dicePanelShowing);
        showSidebarSubPanel(managePanel, manage && !dicePanelShowing);

        double targetWidth = dicePanelShowing ? SIDEBAR_WIDTH_DICE
            : manage ? SIDEBAR_WIDTH_MANAGE : SIDEBAR_WIDTH_BATTLE;
        animateSidebarWidth(targetWidth);
    }

    /** Toggle a sidebar sub-panel's visibility, fading it in only when it newly appears. */
    private void showSidebarSubPanel(javafx.scene.layout.VBox panel, boolean visible) {
        boolean wasVisible = panel.isVisible();
        panel.setVisible(visible);
        panel.setManaged(visible);
        if (visible && !wasVisible) {
            AnimationUtils.fadeIn(panel, AnimationUtils.MEDIUM);
        }
    }

    /** Slide the sidebar column to a new width instead of snapping to it. */
    private void animateSidebarWidth(double targetWidth) {
        if (sidebarWidthAnim != null) {
            sidebarWidthAnim.stop();
        }
        sidebarWidthAnim = new Timeline(new KeyFrame(Duration.millis(220),
            new KeyValue(sidebarPanelWidth, targetWidth, Interpolator.EASE_BOTH)));
        sidebarWidthAnim.play();
    }

    private void handleBeginBattle() {
        if (initiativeSetupActive) {
            return;
        }
        if (grid.getEntities().isEmpty()) {
            showAlert(Alert.AlertType.WARNING, "No Entities",
                    "Please add at least one entity before beginning battle.");
            return;
        }

        List<Entity> partyMembers = partyOnField();

        if (partyMembers.isEmpty()) {
            // No manual rolls needed - enemies roll automatically
            commitBeginBattle(new HashMap<>());
            return;
        }

        // Inline initiative entry in the timeline strip
        initiativeSetupActive = true;
        timelinePane.enterInitiativeSetup(partyMembers,
            rolls -> {
                initiativeSetupActive = false;
                commitBeginBattle(rolls);
            },
            () -> {
                initiativeSetupActive = false;
                timelinePane.exitInitiativeSetup(); // falls back to the roster view
            });
    }

    /** Party members currently on the field. */
    private List<Entity> partyOnField() {
        List<Entity> party = new ArrayList<>();
        for (Entity entity : grid.getEntities()) {
            if (entity.isParty()) {
                party.add(entity);
            }
        }
        return party;
    }

    /** Start the battle once party initiative values have been entered. */
    private void commitBeginBattle(Map<Entity, Integer> partyRollInputs) {
        battleState.setBattleStarted(true);
        turnManager.setBattleStarted(true);

        // Lock in the round-start mode before calculating initiative
        turnManager.setRoundStartMode(roundStartModeFromSlider());

        turnManager.calculateInitiativeOrder(partyRollInputs);

        // Process ON_TURN_START abilities for the first combatant
        if (!turnManager.getTurnOrder().isEmpty()
                && turnManager.getTurnOrder().get(0) instanceof Entity e) {
            e.getCharSheet().processEquippedAbilities(EntityRes.ItemAbility.ON_TURN_START);
        }

        // Check for pending tie resolutions
        if (turnManager.hasPendingTieResolutions()) {
            handleTieResolutions(turnManager.getPendingTieResolutions());
        }

        gridCanvas.setBattleStarted(true);
        timelinePane.exitInitiativeSetup();
        timelinePane.refresh();
        gridCanvas.redraw();
    }

    private void handleNextTurn() {
        turnManager.nextTurn(); // advances turn/round and procs turn-start abilities

        timelinePane.refresh();
        gridCanvas.redraw();
    }
    
    /**
     * Handle tie resolution requests from TurnManager.
     * Shows dialog for each group of tied party members.
     */
    private void handleTieResolutions(List<List<GridObject>> tieGroups) {
        for (List<GridObject> tiedGroup : tieGroups) {
            if (tiedGroup.size() > 1) {
                showTieResolutionDialog(tiedGroup);
            }
        }
    }
    
    /**
     * Show a dialog for players to choose turn order among tied party members.
     */
    private void showTieResolutionDialog(List<GridObject> tiedGroup) {
        Dialog<List<GridObject>> dialog = new Dialog<>();
        dialog.setTitle("Initiative Tie");
        dialog.setHeaderText("These party members tied for initiative.\nClick to set turn order (first click goes first):");
        DialogUtils.theme(dialog);

        int initRoll = turnManager.getInitiativeRoll(tiedGroup.get(0));

        VBox content = new VBox(10);
        content.setPadding(new Insets(10));

        Label rollLabel = new Label("Initiative Roll: " + initRoll);
        rollLabel.setStyle("-fx-font-weight: bold; -fx-text-fill: #569cd6;");
        content.getChildren().add(rollLabel);

        // Track selection order
        javafx.collections.ObservableList<GridObject> selectionOrder = javafx.collections.FXCollections.observableArrayList();
        Map<GridObject, Button> buttonMap = new HashMap<>();

        VBox buttonBox = new VBox(5);
        for (GridObject obj : tiedGroup) {
            String name = (obj instanceof Entity e) ? e.getName() : "Unknown";
            Button btn = new Button(name);
            btn.setPrefWidth(200);
            btn.getStyleClass().add("button");

            btn.setOnAction(e -> {
                if (!selectionOrder.contains(obj)) {
                    selectionOrder.add(obj);
                    btn.setText((selectionOrder.size()) + ". " + name);
                    btn.setDisable(true);
                    btn.setOpacity(0.7);
                }
            });

            buttonMap.put(obj, btn);
            buttonBox.getChildren().add(btn);
        }

        content.getChildren().add(buttonBox);

        // Add reset button
        Button resetBtn = new Button("Reset");
        resetBtn.getStyleClass().add("button");
        resetBtn.setOnAction(e -> {
            selectionOrder.clear();
            for (GridObject obj : tiedGroup) {
                Button btn = buttonMap.get(obj);
                String name = (obj instanceof Entity en) ? en.getName() : "Unknown";
                btn.setText(name);
                btn.setDisable(false);
                btn.setOpacity(1.0);
            }
        });
        content.getChildren().add(resetBtn);

        dialog.getDialogPane().setContent(content);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        // Disable OK until all are selected
        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.disableProperty().bind(javafx.beans.binding.Bindings.size(selectionOrder).lessThan(tiedGroup.size()));

        dialog.setResultConverter(buttonType -> {
            if (buttonType == ButtonType.OK && selectionOrder.size() == tiedGroup.size()) {
                return new ArrayList<>(selectionOrder);
            }
            // If cancelled or incomplete, use current order (random)
            return null;
        });

        dialog.showAndWait().ifPresent(chosenOrder -> {
            if (chosenOrder != null) {
                turnManager.applyTieResolution(tiedGroup, chosenOrder);
                timelinePane.refresh();
            }
        });
    }

    public boolean isBattleStarted() {
        return battleState.isBattleStarted();
    }
    
    public BattleState getBattleState() {
        return battleState;
    }
    
    public DiceRollPanel getDiceRollPanel() {
        return diceRollPanel;
    }
    
    /**
     * Show the dice roll panel and hide the action panel
     */
    public void showDiceRollPanel() {
        dicePanelShowing = true;
        updateRightPanelContent();
        diceRollPanel.setVisible(true);
        diceRollPanel.setManaged(true);
    }

    /**
     * Hide the dice roll panel and show the active sidebar tab again
     */
    public void hideDiceRollPanel() {
        diceRollPanel.setVisible(false);
        diceRollPanel.setManaged(false);
        dicePanelShowing = false;
        updateRightPanelContent();
    }

    public void addEntity(Entity entity) {
        int d20 = turnManager.addEntity(entity);
        if (battleState.isBattleStarted()) {
            timelinePane.refresh();
            if (d20 > 0) {
                showInitiativeRoll(entity, d20);
            }
        } else {
            timelinePane.showRoster(partyOnField());
        }
    }

    public void removeEntity(Entity entity) {
        turnManager.removeEntity(entity);
        if (battleState.isBattleStarted()) {
            timelinePane.refresh();
        } else {
            timelinePane.showRoster(partyOnField());
        }
    }

    public void addEnemy(Enemy enemy) {
        int d20 = turnManager.addEnemy(enemy);
        if (battleState.isBattleStarted()) {
            timelinePane.refresh();
        }
        // Enemies always roll on placement, pre-battle or not - see TurnManager.addEnemy
        showInitiativeRoll(enemy, d20);
    }

    /** Floating "d20 N" feedback for a mid-battle initiative roll, gold on a natural 20. */
    private void showInitiativeRoll(GridObject combatant, int d20) {
        // Enemy rolls are tagged so the player screen can keep them secret (a display setting)
        gridCanvas.spawnFloatingText(combatant, "d20 " + d20,
            d20 == 20 ? Color.web("#FFD700") : Color.web("#6ec6ff"),
            combatant instanceof Enemy ? UI.PlayerDisplayOptions.TextKind.INITIATIVE
                : UI.PlayerDisplayOptions.TextKind.OTHER);
    }

    public void removeEnemy(Enemy enemy) {
        turnManager.removeEnemy(enemy);
        if (battleState.isBattleStarted()) {
            timelinePane.refresh();
        }
    }

    /**
     * Refreshes the party health display. Call after combat actions.
     */
    public void refreshPartyHealth() {
        timelinePane.refreshHp();
    }

    private void handleBack() {
        appController.navigateToCharacterSheets();
    }

    private void handleEndBattle() {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Confirm End Battle");
        confirm.setHeaderText(null);
        confirm.setContentText("End battle? Party entity states will be saved.");
        DialogUtils.theme(confirm);

        Optional<ButtonType> result = confirm.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            battleState.setBattleStarted(false);
            
            for (Entity entity : grid.getEntities()) {
                if (entity.isParty()) {
                    entity.getCharSheet().save();
                }
            }
            
            // Check if this is a victory (enemies were defeated or no enemies remain)
            boolean isVictory = grid.getEnemies().isEmpty() || battleState.getEnemiesDefeated() > 0;
            
            if (isVictory) {
                // Show victory screen
                showVictoryScreen();
            } else {
                // Direct return (retreat/cancel)
                sheetView.endBattle();
                appController.returnFromBattle();
            }
        }
    }
    
    /**
     * Display the Final Fantasy-style victory screen.
     */
    private void showVictoryScreen() {
        VictoryView victoryView = new VictoryView(grid.getEntities(), () -> {
            // On continue - remove victory screen and return from battle
            rootWrapper.getChildren().removeIf(n -> n instanceof VictoryView);
            sheetView.endBattle();
            appController.returnFromBattle();
        });
        
        rootWrapper.getChildren().add(victoryView);
        victoryView.playEntranceAnimation();
        appController.getPlayerWindow().showVictory(grid.getEntities());
    }

    private List<Node> buildPartyCards() {
        List<Node> cards = new ArrayList<>();
        for (SheetButton sheetBtn : sheetView.getSheets()) {
            if (!sheetBtn.getSheet().getCharSheet().getParty()) continue;
            CharSheet cs = sheetBtn.getSheet().getCharSheet();

            // Skip characters already on the field
            boolean alreadyOnField = grid.getEntities().stream()
                .anyMatch(entity -> entity.getCharSheet().getName().equals(cs.getName()));
            if (alreadyOnField) continue;

            final String key = "party:" + cs.getName();
            Node icon = SpriteUtils.createCharacterSprite(cs, 40);
            String tooltip = String.format("%s%nClass: %s%nHP: %d / %d",
                cs.getName(),
                cs.getCharacterClass() != null ? cs.getCharacterClass() : "Unknown",
                cs.getCurrentHP(), cs.getTotalHP());
            cards.add(createHotbarCard(icon, cs.getName(), tooltip,
                cs.getCurrentHP() + "/" + cs.getTotalHP(), "#4CAF50", key,
                () -> startObjectPlacement(() -> new Entity(0, 0, sheetBtn.getSheet().getCharSheet()),
                    key, cs.getName())));
        }
        return cards;
    }

    private List<Node> buildEnemyCards() {
        List<Node> cards = new ArrayList<>();
        for (String enemyName : Enemy.listSavedEnemies()) {
            Enemy template = Enemy.load(enemyName);
            if (template == null) continue;

            final String key = "enemy:" + enemyName;
            final String displayName = template.getName();
            final String name = enemyName;
            Node icon = SpriteUtils.createEnemySprite(template, 40);
            String tooltip = String.format("%s%nHP: %d   ATK: %d   MOB: %d",
                displayName, template.getMaxHealth(), template.getAttackModifier(), template.getMovement());
            cards.add(createHotbarCard(icon, displayName, tooltip,
                "HP " + template.getMaxHealth(), "#d75f5f", key,
                () -> startObjectPlacement(() -> {
                    Enemy newEnemy = Enemy.load(name);
                    if (newEnemy == null) {
                        return null;
                    }
                    int instanceNum = enemyInstanceCounts.getOrDefault(name, 0) + 1;
                    enemyInstanceCounts.put(name, instanceNum);
                    newEnemy.setInstanceNumber(instanceNum);
                    return newEnemy;
                }, key, displayName)));
        }
        return cards;
    }

    private List<Node> buildTerrainCards() {
        List<Node> cards = new ArrayList<>();
        for (TerrainObject terrain : UI.TerrainDatabase.getInstance().getAllTerrains()) {
            final String key = "terrain:" + terrain.getType();
            Node icon = SpriteUtils.createTerrainSprite(terrain, 40);
            String tooltip = String.format("%s%nHP: %d", terrain.getType(), terrain.getHealth());
            cards.add(createHotbarCard(icon, terrain.getType(), tooltip,
                "HP " + terrain.getHealth(), "#8a8a8a", key,
                () -> startObjectPlacement(() -> new TerrainObject(terrain), key, terrain.getType())));
        }
        return cards;
    }

    private List<Node> buildPickupCards() {
        List<Node> cards = new ArrayList<>();
        for (Weapon weapon : ItemDatabase.getInstance().getAllWeapons().values()) {
            final String key = "pickup:weapon:" + weapon.getName();
            String tooltip = String.format("%s (Weapon)%nDMG: %s",
                weapon.getName(), String.join("/", weapon.getDamageDice()));
            cards.add(createHotbarCard(createItemSwatch(weapon.getColor(), IconUtils.Icon.SWORDS),
                weapon.getName(), tooltip, "WPN", "#e6b23c", key,
                () -> startObjectPlacement(() -> new Pickup(0, 0, weapon), key, weapon.getName())));
        }
        for (Accessory accessory : ItemDatabase.getInstance().getAllAccessories().values()) {
            final String key = "pickup:accessory:" + accessory.getName();
            String tooltip = String.format("%s (Accessory)%nDEF: %d", accessory.getName(), accessory.getDefense());
            cards.add(createHotbarCard(createItemSwatch(accessory.getColor(), IconUtils.Icon.SHIELD),
                accessory.getName(), tooltip, "ACC", "#569cd6", key,
                () -> startObjectPlacement(() -> new Pickup(0, 0, accessory), key, accessory.getName())));
        }
        for (Consumable consumable : ItemDatabase.getInstance().getAllConsumables().values()) {
            final String key = "pickup:consumable:" + consumable.getName();
            Status effect = consumable.getEffect();
            String effectName = (effect != null) ? effect.getName() : "Heal";
            String tooltip = String.format("%s (Consumable)%n%s: %d",
                consumable.getName(), effectName, consumable.getHealAmount());
            cards.add(createHotbarCard(createItemSwatch(consumable.getColor(), IconUtils.Icon.HEART),
                consumable.getName(), tooltip, "USE", "#4CAF50", key,
                () -> startObjectPlacement(() -> new Pickup(0, 0, consumable), key, consumable.getName())));
        }
        return cards;
    }

    private List<Node> buildElevationCards() {
        List<Node> cards = new ArrayList<>();
        cards.add(createHotbarCard(createItemSwatch("#4CAF50", IconUtils.Icon.PLUS),
            "Raise", "Raise tiles by one level (max " + BattleGrid.MAX_ELEVATION + ")",
            "+1", "#4CAF50", "elev:raise",
            () -> startElevationBrush(1, "elev:raise", "Raising tiles")));
        cards.add(createHotbarCard(createItemSwatch("#e6b23c", IconUtils.Icon.MINUS),
            "Lower", "Lower tiles by one level",
            "-1", "#e6b23c", "elev:lower",
            () -> startElevationBrush(-1, "elev:lower", "Lowering tiles")));
        cards.add(createHotbarCard(createItemSwatch("#8a8a8a", IconUtils.Icon.UNDO),
            "Flatten", "Reset tiles to ground level",
            "0", "#8a8a8a", "elev:flatten",
            () -> startElevationBrush(0, "elev:flatten", "Flattening tiles")));
        return cards;
    }

    /** Rounded color swatch with a small glyph, used for items without sprites. */
    private Node createItemSwatch(String colorHex, IconUtils.Icon icon) {
        StackPane swatch = new StackPane();
        swatch.setMinSize(40, 40);
        swatch.setMaxSize(40, 40);
        String hex = EntityRes.ColorUtils.normalizeHex(colorHex, EntityRes.ColorUtils.DEFAULT_COLOR);
        swatch.setStyle("-fx-background-color: " + hex + "; -fx-background-radius: 6;");
        swatch.getChildren().add(IconUtils.createIcon(icon, 18, "#1e1e20"));
        return swatch;
    }

    /**
     * One square hotbar card: icon, ellipsized name, a small badge top-right,
     * full details in the tooltip. Gold border while its key is the active
     * placement selection.
     */
    private Node createHotbarCard(Node icon, String name, String tooltipText,
            String badgeText, String badgeColor, String key, Runnable onClick) {
        VBox body = new VBox(3);
        body.setAlignment(Pos.CENTER);

        StackPane iconWrap = new StackPane(icon);
        iconWrap.setMinSize(42, 42);
        iconWrap.setMaxSize(42, 42);
        body.getChildren().add(iconWrap);

        Label nameLabel = new Label(name);
        nameLabel.setStyle("-fx-font-size: 9px; -fx-text-fill: #dcdcdc;");
        nameLabel.setMaxWidth(64);
        body.getChildren().add(nameLabel);

        Label badge = new Label(badgeText);
        badge.setStyle("-fx-font-size: 8px; -fx-font-weight: bold; -fx-text-fill: #1e1e20; " +
            "-fx-background-color: " + badgeColor + "; -fx-background-radius: 3; -fx-padding: 1 3 1 3;");
        StackPane.setAlignment(badge, Pos.TOP_RIGHT);
        StackPane.setMargin(badge, new Insets(2, 2, 0, 0));

        StackPane card = new StackPane(body, badge);
        card.setPrefSize(72, 84);
        card.setMinSize(72, 84);
        card.setMaxSize(72, 84);
        card.setCursor(javafx.scene.Cursor.HAND);
        card.getStyleClass().add(isPlacementSelectionActive(key) ? "hotbar-card-selected" : "hotbar-card");

        Tooltip tooltip = new Tooltip(tooltipText);
        tooltip.setShowDelay(javafx.util.Duration.millis(300));
        Tooltip.install(card, tooltip);

        card.setOnMouseClicked(e -> onClick.run());
        CardUtils.addCardHoverEffect(card);
        return card;
    }

    private void showAlert(Alert.AlertType type, String title, String content) {
        DialogUtils.showAlert(type, title, content);
    }
}
