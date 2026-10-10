package UI;

import EntityRes.*;
import Objects.Enemy;
import UI.Battle.BattleView;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.input.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class CharacterSheetView {

    private final AppController appController;
    private final BorderPane root;
    private final ArrayList<SheetButton> sheets = new ArrayList<>();
    private final ArrayList<Enemy> enemies = new ArrayList<>();
    private BattleView battleView;
    private VBox partyListBox;
    // Roster group filter for the Characters list: null = All, else a CharSheet.GROUP_* key
    private String groupFilter = null;
    private final Map<String, ToggleButton> groupChips = new LinkedHashMap<>();
    private static final String ALL_KEY = "ALL";
private StackPane displayPane;
    private VBox partyPopup;
    private Region partyPopupScrim;
    private boolean partyPopupVisible = false;

    // Enemies browser (full-width mode)
    private VBox enemyGridContainer;
    private TextField enemySearchField;
    private ComboBox<String> enemySortCombo;
    private Button enemySortDirectionBtn;
    private boolean enemySortAscending = true;
    private FlowPane enemyTagFilterBar;
    private Label enemySummaryLabel;
    private final Set<String> activeTagFilters = new LinkedHashSet<>();

    public CharacterSheetView(AppController appController) {
        this.appController = appController;

        root = new BorderPane();
        root.getStyleClass().add("panel-dark");
        root.setPadding(new Insets(10));

        // Top button panel
        HBox buttonPanel = createButtonPanel();
        root.setTop(buttonPanel);

        VBox centerArea = new VBox(10);

        // Characters mode: party list + detail pane
        partyListBox = new VBox(8);
        partyListBox.setPadding(new Insets(5));
        ScrollPane partyScroll = new ScrollPane(partyListBox);
        partyScroll.setFitToWidth(true);
        partyScroll.setPrefWidth(200);

        displayPane = new StackPane();
        displayPane.getStyleClass().add("panel");

        SplitPane charactersSplit = new SplitPane(partyScroll, displayPane);
        charactersSplit.setDividerPositions(0.25);
        SplitPane.setResizableWithParent(partyScroll, false);

        // Group filter chips sit right under the Characters/Enemies switch, Characters mode only
        VBox charactersView = new VBox(8, createGroupFilterBar(), charactersSplit);
        VBox.setVgrow(charactersSplit, Priority.ALWAYS);

        // Enemies mode: full-width searchable/taggable card browser
        VBox enemiesView = createEnemyBrowser();
        enemiesView.setVisible(false);
        enemiesView.setManaged(false);

        StackPane modeContent = new StackPane(charactersView, enemiesView);
        VBox.setVgrow(modeContent, Priority.ALWAYS);

        HBox modeSwitch = createModeSwitch(charactersView, enemiesView);

        centerArea.getChildren().addAll(modeSwitch, modeContent);
        root.setCenter(centerArea);

        autoLoadSheets();
    }

    private HBox createModeSwitch(Node charactersView, Node enemiesView) {
        ToggleGroup group = new ToggleGroup();

        ToggleButton charactersBtn = new ToggleButton("Characters");
        charactersBtn.getStyleClass().add("hotbar-tab");
        charactersBtn.setToggleGroup(group);
        charactersBtn.setSelected(true);
        charactersBtn.setOnAction(e -> {
            charactersView.setVisible(true);
            charactersView.setManaged(true);
            enemiesView.setVisible(false);
            enemiesView.setManaged(false);
        });

        ToggleButton enemiesBtn = new ToggleButton("Enemies");
        enemiesBtn.getStyleClass().add("hotbar-tab");
        enemiesBtn.setToggleGroup(group);
        enemiesBtn.setOnAction(e -> {
            enemiesView.setVisible(true);
            enemiesView.setManaged(true);
            charactersView.setVisible(false);
            charactersView.setManaged(false);
        });

        HBox switchBar = new HBox(8, charactersBtn, enemiesBtn);
        switchBar.setPadding(new Insets(0, 0, 8, 0));
        return switchBar;
    }

    /** "All / Group Ω / Group α / NPC" filter for the character list. */
    private HBox createGroupFilterBar() {
        ToggleGroup toggleGroup = new ToggleGroup();
        HBox bar = new HBox(6);
        bar.setAlignment(Pos.CENTER_LEFT);
        List<String> keys = new ArrayList<>();
        keys.add(ALL_KEY);
        keys.addAll(Arrays.asList(CharSheet.GROUPS));
        for (String key : keys) {
            ToggleButton chip = new ToggleButton();
            chip.getStyleClass().add("group-chip");
            chip.setToggleGroup(toggleGroup);
            chip.setUserData(key);
            chip.setTooltip(new Tooltip((ALL_KEY.equals(key) ? "Show every character"
                : "Show only " + CharSheet.groupLabel(key) + " (right-click a character to move it)")
                + "\nDouble-click to always open Character Sheets on this tab"));
            // Double-click pins this tab as the one Character Sheets opens on (double-click again to unpin)
            chip.setOnMouseClicked(e -> {
                if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY && e.getClickCount() == 2) {
                    toggleDefaultGroup(key);
                }
            });
            groupChips.put(key, chip);
            bar.getChildren().add(chip);
        }
        groupChips.get(ALL_KEY).setSelected(true);
        refreshDefaultGroupOutline();
        toggleGroup.selectedToggleProperty().addListener((obs, old, now) -> {
            if (now == null) {
                // Always keep one filter selected - clicking the active chip shouldn't empty the list
                old.setSelected(true);
                return;
            }
            String key = (String) now.getUserData();
            groupFilter = ALL_KEY.equals(key) ? null : key;
            updatePartyList();
        });
        refreshGroupChipLabels();
        return bar;
    }

    /** The pinned default tab key (ALL or a GROUP_*), or null if none is pinned. */
    private String getDefaultGroup() {
        String key = UiPreferences.get(UiPreferences.CHARACTER_DEFAULT_GROUP);
        return key != null && groupChips.containsKey(key) ? key : null;
    }

    private void toggleDefaultGroup(String key) {
        boolean alreadyDefault = key.equals(getDefaultGroup());
        UiPreferences.set(UiPreferences.CHARACTER_DEFAULT_GROUP, alreadyDefault ? null : key);
        groupChips.get(key).setSelected(true);
        refreshDefaultGroupOutline();
    }

    /** Outline the pinned default chip. */
    private void refreshDefaultGroupOutline() {
        String def = getDefaultGroup();
        for (Map.Entry<String, ToggleButton> e : groupChips.entrySet()) {
            e.getValue().getStyleClass().remove("group-chip-default");
            if (e.getKey().equals(def)) e.getValue().getStyleClass().add("group-chip-default");
        }
    }

    /** Switch to the pinned default tab (All if nothing is pinned). */
    private void selectDefaultGroup() {
        String def = getDefaultGroup();
        ToggleButton chip = groupChips.get(def != null ? def : ALL_KEY);
        if (chip != null) chip.setSelected(true);
        refreshDefaultGroupOutline();
    }

    /** Chip text with live member counts, e.g. "Group Ω (3)". */
    private void refreshGroupChipLabels() {
        for (Map.Entry<String, ToggleButton> e : groupChips.entrySet()) {
            String key = e.getKey();
            long count = ALL_KEY.equals(key) ? sheets.size()
                : sheets.stream().filter(sb -> key.equals(sb.getSheet().getCharSheet().getGroup())).count();
            e.getValue().setText((ALL_KEY.equals(key) ? "All" : CharSheet.groupLabel(key)) + " (" + count + ")");
        }
    }

    public BorderPane getRoot() {
        return root;
    }

    public void refresh() {
        // Every visit opens on the pinned group tab
        selectDefaultGroup();
        showFirstVisibleSheet();
    }

    /** Open the first character in the current group tab (falling back to the first overall). */
    private void showFirstVisibleSheet() {
        if (sheets.isEmpty()) {
            displayPane.getChildren().setAll(createEmptyState());
            return;
        }
        for (SheetButton sb : sheets) {
            if (groupFilter == null || groupFilter.equals(sb.getSheet().getCharSheet().getGroup())) {
                showSheet(sb);
                return;
            }
        }
        showSheet(sheets.get(0));
    }

    private HBox createButtonPanel() {
        HBox panel = new HBox(20);
        panel.setPadding(new Insets(10));
        panel.setAlignment(Pos.CENTER_LEFT);
        panel.setStyle("-fx-border-color: #505052; -fx-border-width: 0 0 1 0;");
        
        Button backBtn = new Button("Back");
        backBtn.getStyleClass().add("button");
        backBtn.setPrefSize(100, 35);
        backBtn.setOnAction(e -> handleBack());
        
        Button newCharBtn = new Button("+ Character");
        newCharBtn.getStyleClass().add("button-primary");
        newCharBtn.setMinWidth(145);
        newCharBtn.setPrefHeight(35);
        newCharBtn.setOnAction(e -> handleNew());
        
        Button newEnemyBtn = new Button("+ Enemy");
        newEnemyBtn.getStyleClass().add("button-primary");
        newEnemyBtn.setMinWidth(125);
        newEnemyBtn.setPrefHeight(35);
        newEnemyBtn.setOnAction(e -> handleNewEnemy());
        
        Button partyBtn = new Button("Party");
        partyBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.PERSON));
        partyBtn.getStyleClass().add("button");
        partyBtn.setMinWidth(110);
        partyBtn.setPrefHeight(35);
        partyBtn.setOnAction(e -> togglePartyPopup());
        
        panel.getChildren().addAll(backBtn, newCharBtn, newEnemyBtn, partyBtn);
        return panel;
    }

    private void autoLoadSheets() {
        loadEntitiesFromFolder("party");
        loadEnemies();
        selectDefaultGroup();
        updatePartyList();
        rebuildTagFilterBar();
        rebuildEnemyGrid();
        showFirstVisibleSheet();
    }

    private Node createEmptyState() {
        VBox empty = new VBox(10);
        empty.setAlignment(Pos.CENTER);
        empty.setPadding(new Insets(40));

        Node icon = IconUtils.createIcon(IconUtils.Icon.PERSON, 48, "#606060");
        Label hint = new Label("Select a character or create one to get started");
        hint.getStyleClass().add("empty-state-text");

        empty.getChildren().addAll(icon, hint);
        return empty;
    }

    private void loadEntitiesFromFolder(String folder) {
        boolean isParty = folder.equals("party");
        File savesDir = new File("saves/entities/" + folder);
        if (savesDir.exists() && savesDir.isDirectory()) {
            File[] files = savesDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    String fileName = file.getName();
                    String charName = fileName.substring(0, fileName.length() - 5);
                    CharSheet loaded = CharSheet.load(charName, isParty);
                    if (loaded != null) {
                        CharacterSheetPane pane = new CharacterSheetPane(loaded);
                        SheetButton sheetBtn = new SheetButton(pane, loaded.getName());
                        pane.setOnDelete(() -> deleteSheet(loaded, sheetBtn));
                        pane.setOnGroupChanged(this::updatePartyList);
                        sheets.add(sheetBtn);
                    }
                }
            }
        }
    }

    private void loadEnemies() {
        enemies.clear();
        String[] enemyNames = Enemy.listSavedEnemies();
        for (String name : enemyNames) {
            Enemy enemy = Enemy.load(name);
            if (enemy != null) {
                enemies.add(enemy);
            }
        }
    }

    private void updatePartyList() {
        partyListBox.getChildren().clear();
        refreshGroupChipLabels();
        int partyIndex = 0;
        for (SheetButton sheetBtn : sheets) {
            if (groupFilter != null && !groupFilter.equals(sheetBtn.getSheet().getCharSheet().getGroup())) continue;
            Node row = createListButton(sheetBtn);
            partyListBox.getChildren().add(row);
            AnimationUtils.slideIn(row, AnimationUtils.SlideDirection.UP, Duration.millis(200), Duration.millis(partyIndex++ * 40));
        }
        if (partyListBox.getChildren().isEmpty() && groupFilter != null) {
            Label empty = new Label("No one in " + CharSheet.groupLabel(groupFilter) + " yet.\n"
                + "Right-click a character in All, or set Group on their sheet.");
            empty.getStyleClass().add("empty-state-text");
            empty.setWrapText(true);
            empty.setPadding(new Insets(12, 6, 12, 6));
            partyListBox.getChildren().add(empty);
        }
    }
    
    /**
     * Toggle the party management popup visibility.
     */
    private void togglePartyPopup() {
        if (partyPopupVisible) {
            hidePartyPopup();
        } else {
            showPartyPopup();
        }
    }
    
    private void showPartyPopup() {
        if (partyPopup != null) {
            displayPane.getChildren().removeAll(partyPopupScrim, partyPopup);
        }
        partyPopupScrim = new Region();
        partyPopupScrim.setStyle("-fx-background-color: rgba(0, 0, 0, 0.5);");
        partyPopupScrim.setOnMouseClicked(e -> hidePartyPopup());
        partyPopup = createPartyPopup();
        displayPane.getChildren().addAll(partyPopupScrim, partyPopup);
        partyPopupVisible = true;
    }

    private void hidePartyPopup() {
        if (partyPopup != null) {
            displayPane.getChildren().removeAll(partyPopupScrim, partyPopup);
            partyPopup = null;
            partyPopupScrim = null;
        }
        partyPopupVisible = false;
    }

    /**
     * Create the party management popup with drag-and-drop lists.
     */
    private VBox createPartyPopup() {
        VBox popup = new VBox(10);
        popup.getStyleClass().addAll("card", "card-accent-success");
        popup.setPadding(new Insets(15));
        popup.setPrefWidth(500);
        popup.setMaxWidth(500);
        popup.setMaxHeight(420);
        StackPane.setAlignment(popup, Pos.CENTER);

        // Header with title and close button
        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);

        Label titleLabel = new Label("Manage Party");
        titleLabel.getStyleClass().add("label-success");
        titleLabel.setStyle("-fx-font-size: 18px;");
        HBox.setHgrow(titleLabel, Priority.ALWAYS);
        
        Button closeBtn = new Button();
        closeBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 14, "#dcdcdc"));
        closeBtn.getStyleClass().add("button");
        closeBtn.setStyle("-fx-min-width: 30; -fx-min-height: 30;");
        closeBtn.setOnAction(e -> hidePartyPopup());
        
        header.getChildren().addAll(titleLabel, closeBtn);
        
        // Content
        HBox content = createPartyManagementContent();
        
        popup.getChildren().addAll(header, new Separator(), content);
        return popup;
    }
    
    /**
     * Create the party management content with drag-and-drop lists.
     */
    private HBox createPartyManagementContent() {
        HBox container = new HBox(15);
        container.setPadding(new Insets(10));
        container.setAlignment(Pos.TOP_CENTER);
        
        // Get current party members
        List<String> partyMembers = PartyConfig.getMembers();
        
        // Build available list (all characters not in party)
        ObservableList<String> availableItems = FXCollections.observableArrayList();
        ObservableList<String> partyItems = FXCollections.observableArrayList(partyMembers);
        
        for (SheetButton sheetBtn : sheets) {
            String name = sheetBtn.getSheet().getCharSheet().getName();
            if (!partyMembers.contains(name)) {
                availableItems.add(name);
            }
        }
        
        // Available characters list
        VBox availableBox = new VBox(5);
        Label availableLabel = new Label("Available");
        availableLabel.getStyleClass().add("label-title");
        availableLabel.setStyle("-fx-font-size: 14px;");
        
        ListView<String> availableList = new ListView<>(availableItems);
        availableList.setPrefHeight(250);
        availableList.setMinWidth(120);
        HBox.setHgrow(availableBox, Priority.ALWAYS);
        VBox.setVgrow(availableList, Priority.ALWAYS);
        styleNameListView(availableList);
        setupDragSource(availableList);
        setupDragTarget(availableList, partyItems, availableItems, false);

        availableBox.getChildren().addAll(availableLabel, availableList);
        
        // Party list
        VBox partyBox = new VBox(5);
        Label partyLabel = new Label("Active Party");
        partyLabel.getStyleClass().add("label-title");
        partyLabel.setStyle("-fx-font-size: 14px; -fx-text-fill: #4CAF50;");
        
        ListView<String> partyList = new ListView<>(partyItems);
        partyList.setPrefHeight(250);
        partyList.setMinWidth(120);
        partyList.setFixedCellSize(28);
        HBox.setHgrow(partyBox, Priority.ALWAYS);
        VBox.setVgrow(partyList, Priority.ALWAYS);
        styleNameListView(partyList);
        setupDragSource(partyList);
        setupDragTarget(partyList, availableItems, partyItems, true);

        // Add reorder within party list
        setupReorderDrag(partyList, partyItems);

        partyBox.getChildren().addAll(partyLabel, partyList);
        
        // Arrow buttons for moving items
        VBox arrowBox = new VBox(10);
        arrowBox.setAlignment(Pos.CENTER);
        arrowBox.setPadding(new Insets(30, 0, 0, 0));
        
        Button addToPartyBtn = new Button("Add >");
        addToPartyBtn.getStyleClass().add("button-primary");
        addToPartyBtn.setMinWidth(70);
        addToPartyBtn.setOnAction(e -> {
            String selected = availableList.getSelectionModel().getSelectedItem();
            if (selected != null) {
                availableItems.remove(selected);
                partyItems.add(selected);
                PartyConfig.setMembers(new ArrayList<>(partyItems));
            }
        });
        
        Button removeFromPartyBtn = new Button("< Remove");
        removeFromPartyBtn.getStyleClass().add("button");
        removeFromPartyBtn.setMinWidth(70);
        removeFromPartyBtn.setOnAction(e -> {
            String selected = partyList.getSelectionModel().getSelectedItem();
            if (selected != null) {
                partyItems.remove(selected);
                availableItems.add(selected);
                PartyConfig.setMembers(new ArrayList<>(partyItems));
            }
        });
        
        arrowBox.getChildren().addAll(addToPartyBtn, removeFromPartyBtn);
        
        container.getChildren().addAll(availableBox, arrowBox, partyBox);

        return container;
    }

    private CharSheet findCharSheetByName(String name) {
        for (SheetButton sheetBtn : sheets) {
            if (sheetBtn.getSheet().getCharSheet().getName().equals(name)) {
                return sheetBtn.getSheet().getCharSheet();
            }
        }
        return null;
    }

    private void styleNameListView(ListView<String> listView) {
        listView.setCellFactory(lv -> new ListCell<String>() {
            @Override
            protected void updateItem(String name, boolean empty) {
                super.updateItem(name, empty);
                if (empty || name == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    CharSheet cs = findCharSheetByName(name);
                    Node avatar = cs != null
                        ? SpriteUtils.createCharacterSprite(cs, 24)
                        : SpriteUtils.createFallbackAvatar("#888888", 24, true);
                    Label nameLabel = new Label(name);
                    nameLabel.getStyleClass().add("entity-card-name");
                    HBox row = new HBox(8, avatar, nameLabel);
                    row.setAlignment(Pos.CENTER_LEFT);
                    setText(null);
                    setGraphic(row);
                }
            }
        });
    }

    private void setupDragSource(ListView<String> listView) {
        listView.setOnDragDetected(event -> {
            String selected = listView.getSelectionModel().getSelectedItem();
            if (selected != null) {
                Dragboard db = listView.startDragAndDrop(TransferMode.MOVE);
                ClipboardContent content = new ClipboardContent();
                content.putString(selected);
                db.setContent(content);
                event.consume();
            }
        });
    }
    
    private void setupDragTarget(ListView<String> listView, ObservableList<String> sourceList, 
                                  ObservableList<String> targetList, boolean isPartyList) {
        listView.setOnDragOver(event -> {
            if (event.getGestureSource() != listView && event.getDragboard().hasString()) {
                event.acceptTransferModes(TransferMode.MOVE);
            }
            event.consume();
        });
        
        listView.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasString()) {
                String item = db.getString();
                // Remove from source, add to target
                sourceList.remove(item);
                if (!targetList.contains(item)) {
                    targetList.add(item);
                }
                // Update party config
                if (isPartyList) {
                    PartyConfig.setMembers(new ArrayList<>(targetList));
                } else {
                    // This is the available list - need to get party items from the other list
                    // The sourceList here would be partyItems
                    PartyConfig.setMembers(new ArrayList<>(sourceList));
                }
                success = true;
            }
            event.setDropCompleted(success);
            event.consume();
        });
    }
    
    private void setupReorderDrag(ListView<String> listView, ObservableList<String> items) {
        listView.setOnDragOver(event -> {
            if (event.getGestureSource() == listView && event.getDragboard().hasString()) {
                event.acceptTransferModes(TransferMode.MOVE);
            }
            event.consume();
        });
        
        listView.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasString() && event.getGestureSource() == listView) {
                String item = db.getString();
                int draggedIdx = items.indexOf(item);
                
                // Calculate target index based on drop position
                // Get the item we're dropping on
                double y = event.getY();
                double cellHeight = listView.getFixedCellSize() > 0 ? listView.getFixedCellSize() : 24;
                int dropIdx = Math.min((int) (y / cellHeight), items.size() - 1);
                dropIdx = Math.max(0, dropIdx);
                
                if (draggedIdx != dropIdx) {
                    items.remove(draggedIdx);
                    items.add(dropIdx, item);
                    PartyConfig.setMembers(new ArrayList<>(items));
                }
                success = true;
            }
            event.setDropCompleted(success);
            event.consume();
        });
    }

    private Node createListButton(SheetButton sheetBtn) {
        CharSheet charSheet = sheetBtn.getSheet().getCharSheet();

        Node avatar = SpriteUtils.createCharacterSprite(charSheet, 36);

        Label nameLabel = new Label(sheetBtn.getLabelText());
        nameLabel.getStyleClass().add("entity-card-name");

        String className = charSheet.getCharacterClass();
        String subtitle = (className != null && !className.equals("None")) ? className : "Level " + charSheet.getLevel();
        Label subtitleLabel = new Label(subtitle);
        subtitleLabel.getStyleClass().add("entity-card-subtitle");

        VBox textBox = new VBox(2, nameLabel, subtitleLabel);

        HBox row = new HBox(10, avatar, textBox);
        // In the All view, tag grouped characters so the grouping is visible at a glance
        String group = charSheet.getGroup();
        if (groupFilter == null && group != null) {
            Region spacer = new Region();
            HBox.setHgrow(spacer, Priority.ALWAYS);
            Label badge = new Label(group.equals(CharSheet.GROUP_NPC) ? "NPC"
                : CharSheet.groupLabel(group).replace("Group ", ""));
            badge.getStyleClass().add("group-badge");
            row.getChildren().addAll(spacer, badge);
        }
        row.getStyleClass().addAll("entity-card", "entity-card-party");
        row.setAlignment(Pos.CENTER_LEFT);
        row.setCursor(javafx.scene.Cursor.HAND);
        row.setOnMouseClicked(e -> {
            if (e.getButton() == javafx.scene.input.MouseButton.PRIMARY) showSheet(sheetBtn);
        });

        // Right-click: move to a group
        ContextMenu menu = new ContextMenu();
        Menu moveTo = new Menu("Move to group");
        ToggleGroup choice = new ToggleGroup();
        List<String> options = new ArrayList<>();
        options.add(null);
        options.addAll(Arrays.asList(CharSheet.GROUPS));
        for (String option : options) {
            RadioMenuItem item = new RadioMenuItem(CharSheet.groupLabel(option));
            item.setToggleGroup(choice);
            item.setSelected(java.util.Objects.equals(option, group));
            item.setOnAction(e -> {
                charSheet.setGroup(option);
                sheetBtn.getSheet().updateDisplay();
                updatePartyList();
            });
            moveTo.getItems().add(item);
        }
        menu.getItems().add(moveTo);
        row.setOnContextMenuRequested(e -> menu.show(row, e.getScreenX(), e.getScreenY()));
        AnimationUtils.addHoverAnimation(row, Color.web("#4CAF50"));
        return row;
    }

    private void showSheet(SheetButton sheetBtn) {
        displayPane.getChildren().clear();
        sheetBtn.getSheet().updateDisplay();
        displayPane.getChildren().add(sheetBtn.getSheet());
    }

    /**
     * Builds the full-width Enemies browser: search + tag filters + sort at top,
     * a summary bar, then a card grid (or grouped-by-tag sections).
     */
    private VBox createEnemyBrowser() {
        VBox browser = new VBox(12);
        browser.setPadding(new Insets(10));

        HBox topBar = new HBox(10);
        topBar.setAlignment(Pos.CENTER_LEFT);

        enemySearchField = FormUtils.createStyledTextField("Search enemies...", null, 220);
        enemySearchField.textProperty().addListener((obs, oldVal, newVal) -> rebuildEnemyGrid());

        Label sortLabel = new Label("Sort by:");
        sortLabel.getStyleClass().add("form-label");

        enemySortCombo = new ComboBox<>();
        enemySortCombo.getItems().addAll("Name", "HP", "AC", "Initiative");
        enemySortCombo.getSelectionModel().select("Name");
        enemySortCombo.getStyleClass().add("styled-combo-box");
        enemySortCombo.setOnAction(e -> rebuildEnemyGrid());

        enemySortDirectionBtn = new Button();
        enemySortDirectionBtn.getStyleClass().add("button");
        enemySortDirectionBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.SORT_ASCENDING, 14, "#dcdcdc"));
        enemySortDirectionBtn.setOnAction(e -> {
            enemySortAscending = !enemySortAscending;
            enemySortDirectionBtn.setGraphic(IconUtils.createIcon(
                enemySortAscending ? IconUtils.Icon.SORT_ASCENDING : IconUtils.Icon.SORT_DESCENDING, 14, "#dcdcdc"));
            rebuildEnemyGrid();
        });

        topBar.getChildren().addAll(enemySearchField, sortLabel, enemySortCombo, enemySortDirectionBtn);

        enemyTagFilterBar = new FlowPane(6, 6);

        enemySummaryLabel = new Label();
        enemySummaryLabel.getStyleClass().add("enemy-summary-text");
        HBox summaryBar = new HBox(enemySummaryLabel);
        summaryBar.getStyleClass().add("enemy-summary-bar");

        enemyGridContainer = new VBox(14);
        enemyGridContainer.setPadding(new Insets(4, 0, 0, 0));

        ScrollPane gridScroll = new ScrollPane(enemyGridContainer);
        gridScroll.setFitToWidth(true);
        VBox.setVgrow(gridScroll, Priority.ALWAYS);

        browser.getChildren().addAll(topBar, enemyTagFilterBar, summaryBar, gridScroll);
        return browser;
    }

    /**
     * Rebuilds the tag filter chip row from the union of Enemy.PREDEFINED_TAGS and any
     * custom tags currently in use across saved enemies. Call whenever the available tag
     * set may have changed (load, create, edit).
     */
    private void rebuildTagFilterBar() {
        enemyTagFilterBar.getChildren().clear();

        Button addTagBtn = new Button("+ Add Tag");
        addTagBtn.getStyleClass().add("tag-chip");
        addTagBtn.setOnAction(e -> promptAddNewTag());
        enemyTagFilterBar.getChildren().add(addTagBtn);

        Set<String> allTags = new LinkedHashSet<>(Arrays.asList(Enemy.PREDEFINED_TAGS));
        allTags.addAll(EnemyTagRegistry.getAll());
        for (Enemy enemy : enemies) {
            allTags.addAll(enemy.getTags());
        }

        for (String tag : allTags) {
            ToggleButton chip = new ToggleButton(tag);
            chip.getStyleClass().add("tag-chip");
            boolean active = activeTagFilters.contains(tag);
            chip.setSelected(active);
            if (active) {
                chip.getStyleClass().add("tag-chip-selected");
            }
            chip.setOnAction(e -> {
                if (chip.isSelected()) {
                    activeTagFilters.add(tag);
                    if (!chip.getStyleClass().contains("tag-chip-selected")) {
                        chip.getStyleClass().add("tag-chip-selected");
                    }
                } else {
                    activeTagFilters.remove(tag);
                    chip.getStyleClass().remove("tag-chip-selected");
                }
                rebuildEnemyGrid();
            });
            enemyTagFilterBar.getChildren().add(chip);
        }
    }

    /**
     * Prompts for a brand-new tag name and permanently registers it (via EnemyTagRegistry)
     * so it stays available as a filter/selection chip even before any enemy uses it.
     */
    private void promptAddNewTag() {
        TextInputDialog dialog = new TextInputDialog();
        dialog.setTitle("Add Tag");
        dialog.setHeaderText(null);
        dialog.setContentText("New tag name:");
        DialogUtils.theme(dialog);
        dialog.showAndWait().ifPresent(tag -> {
            String trimmed = tag.trim();
            if (!trimmed.isEmpty()) {
                EnemyTagRegistry.addTag(trimmed);
                rebuildTagFilterBar();
            }
        });
    }

    /**
     * Re-filters/sorts/renders the enemy card grid from the current search text,
     * active tag filters (OR semantics), and sort selection.
     */
    private void rebuildEnemyGrid() {
        enemyGridContainer.getChildren().clear();

        String searchText = enemySearchField.getText() == null ? "" : enemySearchField.getText().trim().toLowerCase();

        List<Enemy> filtered = new ArrayList<>();
        for (Enemy enemy : enemies) {
            if (!searchText.isEmpty() && !enemy.getName().toLowerCase().contains(searchText)) {
                continue;
            }
            if (!activeTagFilters.isEmpty()) {
                boolean matchesAnyTag = false;
                for (String tag : enemy.getTags()) {
                    if (activeTagFilters.contains(tag)) {
                        matchesAnyTag = true;
                        break;
                    }
                }
                if (!matchesAnyTag) {
                    continue;
                }
            }
            filtered.add(enemy);
        }

        Comparator<Enemy> comparator = switch (enemySortCombo.getValue()) {
            case "HP" -> Comparator.comparingInt(Enemy::getMaxHealth);
            case "AC" -> Comparator.comparingInt(Enemy::getAC);
            case "Initiative" -> Comparator.comparingInt(Enemy::getInitiative);
            default -> Comparator.comparing(Enemy::getName, String.CASE_INSENSITIVE_ORDER);
        };
        if (!enemySortAscending) {
            comparator = comparator.reversed();
        }
        filtered.sort(comparator);

        if (filtered.isEmpty()) {
            enemySummaryLabel.setText(enemies.isEmpty() ? "No enemies yet." : "No enemies match the current filters.");
            enemyGridContainer.getChildren().add(createEmptyState());
            return;
        }

        double avgHp = filtered.stream().mapToInt(Enemy::getMaxHealth).average().orElse(0);
        double avgAc = filtered.stream().mapToInt(Enemy::getAC).average().orElse(0);
        enemySummaryLabel.setText(String.format("%d enemies  •  avg HP %.0f  •  avg AC %.0f", filtered.size(), avgHp, avgAc));

        if (activeTagFilters.isEmpty()) {
            Map<String, List<Enemy>> groups = new LinkedHashMap<>();
            for (Enemy enemy : filtered) {
                String group = enemy.getTags().isEmpty() ? "Untagged" : enemy.getTags().get(0);
                groups.computeIfAbsent(group, k -> new ArrayList<>()).add(enemy);
            }
            if (groups.size() > 1) {
                // Untagged always renders first, regardless of sort field/direction.
                List<Enemy> untaggedGroup = groups.remove("Untagged");
                if (untaggedGroup != null) {
                    Label untaggedLabel = new Label("Untagged");
                    untaggedLabel.getStyleClass().add("card-header-title");
                    enemyGridContainer.getChildren().addAll(untaggedLabel, buildEnemyFlowPane(untaggedGroup));
                }
                for (Map.Entry<String, List<Enemy>> entry : groups.entrySet()) {
                    Label groupLabel = new Label(entry.getKey());
                    groupLabel.getStyleClass().add("card-header-title");
                    enemyGridContainer.getChildren().addAll(groupLabel, buildEnemyFlowPane(entry.getValue()));
                }
                return;
            }
        }

        enemyGridContainer.getChildren().add(buildEnemyFlowPane(filtered));
    }

    private FlowPane buildEnemyFlowPane(List<Enemy> list) {
        FlowPane grid = new FlowPane(12, 12);
        for (Enemy enemy : list) {
            grid.getChildren().add(CardUtils.createEnemyCard(enemy,
                () -> showEnemyDialog(enemy),
                () -> deleteEnemy(enemy)));
        }
        return grid;
    }

    private void deleteSheet(CharSheet sheetToDelete, SheetButton sheetBtn) {
        sheetToDelete.delete();
        PartyConfig.removeMember(sheetToDelete.getName());
        sheets.remove(sheetBtn);
        updatePartyList();
        displayPane.getChildren().setAll(createEmptyState());
    }

    private void deleteEnemy(Enemy enemy) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Enemy");
        confirm.setHeaderText(null);
        confirm.setContentText("Delete " + enemy.getName() + "?");
        DialogUtils.theme(confirm);

        if (confirm.showAndWait().orElse(ButtonType.CANCEL) == ButtonType.OK) {
            File file = new File("saves/entities/enemies/" + enemy.getName() + ".json");
            if (file.exists()) {
                file.delete();
            }
            loadEnemies();
            rebuildTagFilterBar();
            rebuildEnemyGrid();
        }
    }

    private void handleBack() {
        if (battleView != null) {
            // Return to active battle - use stored battle view
            appController.navigateToCurrentBattle();
        } else {
            // Return to main menu
            appController.navigateToMainMenu();
        }
    }

    private void handleNew() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(appController.getPrimaryStage());
        dialog.setTitle("New Character");
        dialog.setResizable(false);
        
        GridPane grid = new GridPane();
        grid.getStyleClass().add("panel-dark");
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));
        
        int row = 0;
        
        // Name
        grid.add(new Label("Name:"), 0, row);
        TextField nameField = new TextField("New Character");
        grid.add(nameField, 1, row++);
        
        // Color
        grid.add(new Label("Color:"), 0, row);
        ColorPicker colorPicker = new ColorPicker(Color.web(EntityRes.ColorUtils.fromLegacyIndex(0)));
        grid.add(colorPicker, 1, row++);
        Label colorHint = new Label("Colors are saved as hex values.");
        colorHint.getStyleClass().addAll("label-muted", "label-caption");
        grid.add(colorHint, 0, row++, 2, 1);
        
        // HP
        grid.add(new Label("Total HP:"), 0, row);
        TextField hpField = new TextField("20");
        grid.add(hpField, 1, row++);
        
        // AC
        grid.add(new Label("Armor Class:"), 0, row);
        TextField acField = new TextField("10");
        grid.add(acField, 1, row++);
        
        // Attributes
        grid.add(new Label("STR:"), 0, row);
        TextField strField = new TextField("5");
        grid.add(strField, 1, row++);
        
        grid.add(new Label("DEX:"), 0, row);
        TextField dexField = new TextField("5");
        grid.add(dexField, 1, row++);
        
        grid.add(new Label("CON:"), 0, row);
        TextField conField = new TextField("5");
        grid.add(conField, 1, row++);
        
        grid.add(new Label("INT:"), 0, row);
        TextField intField = new TextField("5");
        grid.add(intField, 1, row++);

        grid.add(new Label("WIS:"), 0, row);
        TextField wisField = new TextField("4");
        grid.add(wisField, 1, row++);

        grid.add(new Label("CHA:"), 0, row);
        TextField chaField = new TextField("3");
        grid.add(chaField, 1, row++);
        Label statHint = new Label("Base stats are STR, DEX, CON, INT, WIS, CHA.");
        statHint.getStyleClass().addAll("label-muted", "label-caption");
        grid.add(statHint, 0, row++, 2, 1);
        
        // Equipment
        ItemDatabase db = ItemDatabase.getInstance();
        
        grid.add(new Label("Weapon:"), 0, row);
        ComboBox<String> weaponCombo = new ComboBox<>();
        weaponCombo.getItems().add("None");
        weaponCombo.getItems().addAll(db.getAllWeapons().keySet());
        weaponCombo.getSelectionModel().select("None");
        grid.add(weaponCombo, 1, row++);
        
        grid.add(new Label("Accessory 1:"), 0, row);
        ComboBox<String> accessory1Combo = new ComboBox<>();
        accessory1Combo.getItems().add("None");
        accessory1Combo.getItems().addAll(db.getAllAccessories().keySet());
        accessory1Combo.getSelectionModel().select("None");
        grid.add(accessory1Combo, 1, row++);
        
        grid.add(new Label("Accessory 2:"), 0, row);
        ComboBox<String> accessory2Combo = new ComboBox<>();
        accessory2Combo.getItems().add("None");
        accessory2Combo.getItems().addAll(db.getAllAccessories().keySet());
        accessory2Combo.getSelectionModel().select("None");
        grid.add(accessory2Combo, 1, row++);
        
        grid.add(new Label("Accessory 3:"), 0, row);
        ComboBox<String> accessory3Combo = new ComboBox<>();
        accessory3Combo.getItems().add("None");
        accessory3Combo.getItems().addAll(db.getAllAccessories().keySet());
        accessory3Combo.getSelectionModel().select("None");
        grid.add(accessory3Combo, 1, row++);
        
        // Buttons
        HBox btnBox = new HBox(10);
        Button createBtn = new Button("Create");
        createBtn.getStyleClass().add("button-primary");
        createBtn.setOnAction(e -> {
            try {
                int hp = Integer.parseInt(hpField.getText());
                int ac = Integer.parseInt(acField.getText());
                int[] attr = {
                    Integer.parseInt(strField.getText()),
                    Integer.parseInt(dexField.getText()),
                    Integer.parseInt(conField.getText()),
                    Integer.parseInt(intField.getText()),
                    Integer.parseInt(wisField.getText()),
                    Integer.parseInt(chaField.getText())
                };
                
                CharSheet newSheet = new CharSheet(nameField.getText(), true, hp, attr,
                    ColorUtils.toHex(colorPicker.getValue()));
                newSheet.setArmorClass(ac);
                
                // Equip items (only if not "None")
                String weaponName = weaponCombo.getSelectionModel().getSelectedItem();
                if (weaponName != null && !weaponName.equals("None")) {
                    Weapon weapon = db.getWeapon(weaponName);
                    if (weapon != null) {
                        newSheet.equipPrimaryWeapon(weapon);
                        newSheet.getInventory().add(weapon);
                    }
                }
                
                String accessory1Name = accessory1Combo.getSelectionModel().getSelectedItem();
                if (accessory1Name != null && !accessory1Name.equals("None")) {
                    Accessory acc1 = db.getAccessory(accessory1Name);
                    if (acc1 != null) {
                        newSheet.equipAccessory(0, acc1);
                        newSheet.getInventory().add(acc1);
                    }
                }
                
                String accessory2Name = accessory2Combo.getSelectionModel().getSelectedItem();
                if (accessory2Name != null && !accessory2Name.equals("None")) {
                    Accessory acc2 = db.getAccessory(accessory2Name);
                    if (acc2 != null) {
                        newSheet.equipAccessory(1, acc2);
                        newSheet.getInventory().add(acc2);
                    }
                }
                
                String accessory3Name = accessory3Combo.getSelectionModel().getSelectedItem();
                if (accessory3Name != null && !accessory3Name.equals("None")) {
                    Accessory acc3 = db.getAccessory(accessory3Name);
                    if (acc3 != null) {
                        newSheet.equipAccessory(2, acc3);
                        newSheet.getInventory().add(acc3);
                    }
                }
                
                // A character created while a group filter is active joins that group
                if (groupFilter != null) {
                    newSheet.setGroup(groupFilter);
                }
                CharacterSheetPane pane = new CharacterSheetPane(newSheet);
                SheetButton sheetBtn = new SheetButton(pane, nameField.getText());
                pane.setOnDelete(() -> deleteSheet(newSheet, sheetBtn));
                pane.setOnGroupChanged(this::updatePartyList);
                sheets.add(sheetBtn);
                updatePartyList();
                newSheet.save();
                showSheet(sheetBtn);
                dialog.close();
            } catch (NumberFormatException ex) {
                showAlert(Alert.AlertType.ERROR, "Error", "Invalid number format.");
            }
        });
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> dialog.close());
        
        btnBox.getChildren().addAll(createBtn, cancelBtn);
        grid.add(btnBox, 0, row++);
        GridPane.setColumnSpan(btnBox, 2);
        
        ScrollPane dialogScroll = new ScrollPane(grid);
        dialogScroll.setFitToWidth(true);
        dialogScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        dialogScroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);

        Scene scene = new Scene(dialogScroll, 370, 620);
        StyleUtils.applyTheme(scene);
        
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void handleNewEnemy() {
        showEnemyDialog(null);
    }

    private static final String[] DICE_OPTIONS = {"d4", "d6", "d8", "d10", "d12", "d20"};

    private void showEnemyDialog(Enemy existing) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(appController.getPrimaryStage());
        dialog.setTitle(existing == null ? "New Enemy" : "Edit Enemy");
        dialog.setResizable(false);
        
        GridPane grid = new GridPane();
        grid.getStyleClass().add("panel-dark");
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));
        
        int row = 0;
        
        grid.add(new Label("Name:"), 0, row);
        TextField nameField = new TextField(existing != null ? existing.getName() : "New Enemy");
        grid.add(nameField, 1, row++);
        
        grid.add(new Label("Health:"), 0, row);
        Spinner<Integer> hpSpinner = new Spinner<>(1, 9999, existing != null ? existing.getMaxHealth() : 10);
        hpSpinner.setEditable(true);
        FormUtils.styleSpinner(hpSpinner);
        grid.add(hpSpinner, 1, row++);

        grid.add(new Label("Mobility:"), 0, row);
        Spinner<Integer> mobSpinner = new Spinner<>(1, 99, existing != null ? existing.getMovement() : 3);
        mobSpinner.setEditable(true);
        FormUtils.styleSpinner(mobSpinner);
        grid.add(mobSpinner, 1, row++);

        grid.add(new Label("Armor Class:"), 0, row);
        Spinner<Integer> acSpinner = new Spinner<>(0, 99, existing != null ? existing.getAC() : 10);
        acSpinner.setEditable(true);
        FormUtils.styleSpinner(acSpinner);
        grid.add(acSpinner, 1, row++);

        grid.add(new Label("Dexterity (Attack + Initiative):"), 0, row);
        Spinner<Integer> dexSpinner = new Spinner<>(-10, 99, existing != null ? existing.getDexterity() : 2);
        dexSpinner.setEditable(true);
        FormUtils.styleSpinner(dexSpinner);
        grid.add(dexSpinner, 1, row++);

        // Saving-throw stats for spells (DEX saves use Dexterity above)
        grid.add(new Label("Saves (STR/CON/INT/WIS/CHA):"), 0, row);
        int[] saveIndices = {CharSheet.STRENGTH, CharSheet.CONSTITUTION, CharSheet.INTELLIGENCE, CharSheet.WISDOM, CharSheet.CHARISMA};
        String[] saveAbbrevs = {"STR", "CON", "INT", "WIS", "CHA"};
        List<Spinner<Integer>> saveSpinners = new ArrayList<>();
        HBox savesBox = new HBox(6);
        for (int i = 0; i < saveIndices.length; i++) {
            int initial = existing != null ? existing.getAttribute(saveIndices[i]) : 2;
            Spinner<Integer> spinner = new Spinner<>(-10, 99, initial);
            spinner.setEditable(true);
            spinner.setPrefWidth(62);
            FormUtils.styleSpinner(spinner);
            spinner.setTooltip(new Tooltip(saveAbbrevs[i] + " save"));
            saveSpinners.add(spinner);
            Label abbrev = new Label(saveAbbrevs[i]);
            abbrev.getStyleClass().add("label-muted");
            savesBox.getChildren().add(new VBox(2, abbrev, spinner));
        }
        grid.add(savesBox, 1, row++);
        
        // Get existing dice values
        String[] existingDice = existing != null ? existing.getDamageDice() : new String[]{"d4", "d4", "d6"};
        
        grid.add(new Label("Tier 1 Die:"), 0, row);
        ComboBox<String> tier1Combo = new ComboBox<>();
        tier1Combo.getItems().addAll(DICE_OPTIONS);
        tier1Combo.getSelectionModel().select(existingDice[0]);
        grid.add(tier1Combo, 1, row++);
        
        grid.add(new Label("Tier 2 Die:"), 0, row);
        ComboBox<String> tier2Combo = new ComboBox<>();
        tier2Combo.getItems().addAll(DICE_OPTIONS);
        tier2Combo.getSelectionModel().select(existingDice[1]);
        grid.add(tier2Combo, 1, row++);
        
        grid.add(new Label("Tier 3 Die:"), 0, row);
        ComboBox<String> tier3Combo = new ComboBox<>();
        tier3Combo.getItems().addAll(DICE_OPTIONS);
        tier3Combo.getSelectionModel().select(existingDice[2]);
        grid.add(tier3Combo, 1, row++);
        
        grid.add(new Label("Color:"), 0, row);
        ColorPicker colorPicker = new ColorPicker(Color.web(existing != null ? existing.getColor() : ColorUtils.fromLegacyIndex(0)));
        grid.add(colorPicker, 1, row++);
        Label enemyHint = new Label("Dexterity drives both enemy attack rolls and initiative.");
        enemyHint.getStyleClass().addAll("label-muted", "label-caption");
        grid.add(enemyHint, 0, row++, 2, 1);
        
        // Sprite picker
        grid.add(new Label("Sprite:"), 0, row);
        final String[] spritePath = { existing != null ? existing.getSpritePath() : null };
        HBox spritePickerContainer = new HBox();
        Runnable refreshSpritePicker = () -> {
            spritePickerContainer.getChildren().setAll(
                SpritePickerUtils.createCompactSpritePicker(
                    spritePath[0],
                    "enemies",
                    ColorUtils.toHex(colorPicker.getValue()),
                    false, // Not party
                    newPath -> spritePath[0] = newPath,
                    dialog
                )
            );
        };
        refreshSpritePicker.run();
        colorPicker.setOnAction(e -> refreshSpritePicker.run());
        grid.add(spritePickerContainer, 1, row++);

        // Tags - predefined chips plus custom tag entry
        grid.add(new Label("Tags:"), 0, row);
        FlowPane tagChipRow = new FlowPane(6, 6);
        Set<String> selectedTags = new LinkedHashSet<>(existing != null ? existing.getTags() : List.of());

        Runnable[] refreshTagChips = new Runnable[1];
        refreshTagChips[0] = () -> {
            tagChipRow.getChildren().clear();
            Set<String> allTags = new LinkedHashSet<>(Arrays.asList(Enemy.PREDEFINED_TAGS));
            allTags.addAll(EnemyTagRegistry.getAll());
            allTags.addAll(selectedTags);
            for (String tag : allTags) {
                ToggleButton chip = new ToggleButton(tag);
                chip.getStyleClass().add("tag-chip");
                boolean active = selectedTags.contains(tag);
                chip.setSelected(active);
                if (active) {
                    chip.getStyleClass().add("tag-chip-selected");
                }
                chip.setOnAction(e -> {
                    if (chip.isSelected()) {
                        selectedTags.add(tag);
                        if (!chip.getStyleClass().contains("tag-chip-selected")) {
                            chip.getStyleClass().add("tag-chip-selected");
                        }
                    } else {
                        selectedTags.remove(tag);
                        chip.getStyleClass().remove("tag-chip-selected");
                    }
                });
                tagChipRow.getChildren().add(chip);
            }
        };
        refreshTagChips[0].run();
        grid.add(tagChipRow, 1, row++);

        grid.add(new Label("Custom Tag:"), 0, row);
        HBox customTagBox = new HBox(6);
        TextField customTagField = new TextField();
        customTagField.setPromptText("e.g. Flying");
        Button addTagBtn = new Button("Add");
        addTagBtn.getStyleClass().add("button");
        addTagBtn.setOnAction(e -> {
            String customTag = customTagField.getText().trim();
            if (!customTag.isEmpty()) {
                selectedTags.add(customTag);
                EnemyTagRegistry.addTag(customTag);
                customTagField.clear();
                refreshTagChips[0].run();
            }
        });
        customTagBox.getChildren().addAll(customTagField, addTagBtn);
        grid.add(customTagBox, 1, row++);

        HBox btnBox = new HBox(10);
        Button saveBtn = new Button("Save");
        saveBtn.getStyleClass().add("button-primary");
        saveBtn.setOnAction(e -> {
            String name = nameField.getText().trim();
            if (!name.isEmpty()) {
                String[] damageDice = {tier1Combo.getValue(), tier2Combo.getValue(), tier3Combo.getValue()};
                Enemy enemy = new Enemy(0, 0, name, hpSpinner.getValue(), mobSpinner.getValue(),
                        acSpinner.getValue(), damageDice,
                        dexSpinner.getValue(),
                    ColorUtils.toHex(colorPicker.getValue()));
                enemy.setSpritePath(spritePath[0]);
                enemy.setTags(new ArrayList<>(selectedTags));
                for (int i = 0; i < saveIndices.length; i++) {
                    enemy.setAttribute(saveIndices[i], saveSpinners.get(i).getValue());
                }
                if (!enemy.save()) {
                    showAlert(Alert.AlertType.ERROR, "Save Failed",
                        "Could not save \"" + name + "\" - the name may contain characters " +
                        "that aren't allowed in a file name. Try a different name.");
                    return;
                }
                loadEnemies();
                rebuildTagFilterBar();
                rebuildEnemyGrid();
                dialog.close();
            }
        });
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> dialog.close());
        
        btnBox.getChildren().addAll(saveBtn, cancelBtn);
        grid.add(btnBox, 0, row++);
        GridPane.setColumnSpan(btnBox, 2);
        
        Scene scene = new Scene(grid);
        StyleUtils.applyTheme(scene);
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    public void setBattleView(BattleView battleView) {
        this.battleView = battleView;
    }

    public void endBattle() {
        battleView = null;
    }

    public ArrayList<SheetButton> getSheets() {
        return sheets;
    }

    private void showAlert(Alert.AlertType type, String title, String content) {
        DialogUtils.showAlert(type, title, content);
    }
}
