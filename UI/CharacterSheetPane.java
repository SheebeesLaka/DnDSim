package UI;

import EntityRes.*;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.*;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.scene.paint.Color;

import java.util.HashMap;
import java.util.Map;

public class CharacterSheetPane extends BorderPane {

    private CharSheet sheet;
    private boolean updatingDisplay = false;
    private Runnable onDelete;
    private Runnable onGroupChanged;
    private ComboBox<String> groupCombo;

    private StackPane headerAvatarBox;
    private AttributeRadarChart attributeChart;

    private TextField nameField;
    private TextField classField;
    private Spinner<Integer> currentHpSpinner;
    private Spinner<Integer> maxHpSpinner;
    private Spinner<Integer> acSpinner;
    private ProgressBar hpBar;
    private MenuButton statusMenu;
    private Map<String, CheckMenuItem> statusMenuItems;
    private ColorPicker colorPicker;
    private HBox basicInfoMainBox;
    
    private ComboBox<String> primaryWeapon;
    private ComboBox<String> secondaryWeapon;
    private ComboBox<String> accessory1;
    private ComboBox<String> accessory2;
    private ComboBox<String> accessory3;
    
    private Spinner<Integer> strBase;
    private Label strTemp, strTotal;
    private Spinner<Integer> dexBase;
    private Label dexTemp, dexTotal;
    private Spinner<Integer> conBase;
    private Label conTemp, conTotal;
    private Spinner<Integer> intBase;
    private Label intTemp, intTotal;
    private Spinner<Integer> wisBase;
    private Label wisTemp, wisTotal;
    private Spinner<Integer> chaBase;
    private Label chaTemp, chaTotal;
    private Spinner<Integer> levelSpinner;
    private Label pointsLabel;
    
    private ListView<Item> consumablesList;
    private ListView<Item> craftingList;
    private ListView<Item> keyItemsList;
    private ListView<Item> weaponsList;
    private ListView<Item> accessoriesList;
    private ObservableList<Item> consumablesData;
    private ObservableList<Item> craftingData;
    private ObservableList<Item> keyItemsData;
    private ObservableList<Item> weaponsData;
    private ObservableList<Item> accessoriesData;
    private ObservableList<EntityRes.ItemAbility> passiveAbilitiesData;
    private ObservableList<EntityRes.ItemAbility> activeAbilitiesData;
    private ObservableList<EntityRes.ItemAbility> specialAbilitiesData;
    private ComboBox<String> castingStatCombo;
    private Label castingInfoLabel;
    private VBox spellSlotBox;
    private ObservableList<Spell> knownSpellsData;

    public CharacterSheetPane(CharSheet sheet) {
        this.sheet = sheet;
        getStyleClass().addAll("card");
        setStyle("-fx-background-color: linear-gradient(to bottom right, #2d2d30, #252528);");
        setPadding(new Insets(15));

        setTop(createHeaderBar());

        ScrollPane scrollPane = new ScrollPane();
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent;");

        VBox leftColumn = new VBox(10, createBasicInfoSection(), createAttributesSection());
        VBox rightColumn = new VBox(10, createEquipmentSection(), createAbilitiesSection(),
            createSpellcastingSection(), createInventorySection());

        GridPane content = new GridPane();
        content.setHgap(10);
        content.setPadding(new Insets(10));
        ColumnConstraints leftCol = new ColumnConstraints();
        leftCol.setPercentWidth(50);
        ColumnConstraints rightCol = new ColumnConstraints();
        rightCol.setPercentWidth(50);
        content.getColumnConstraints().addAll(leftCol, rightCol);
        content.add(leftColumn, 0, 0);
        content.add(rightColumn, 1, 0);
        GridPane.setHgrow(leftColumn, Priority.ALWAYS);
        GridPane.setHgrow(rightColumn, Priority.ALWAYS);

        scrollPane.setContent(content);
        setCenter(scrollPane);

        updateDisplay();
    }

    /**
     * Sets the callback invoked when the user confirms deleting this character sheet.
     * The pane itself has no knowledge of the sheet list/party config, so the caller
     * (CharacterSheetView) is responsible for actually removing the sheet.
     */
    /** Called after the user moves this character to a different roster group. */
    public void setOnGroupChanged(Runnable onGroupChanged) {
        this.onGroupChanged = onGroupChanged;
    }

    public void setOnDelete(Runnable onDelete) {
        this.onDelete = onDelete;
    }

    private HBox createHeaderBar() {
        HBox header = new HBox(15);
        header.getStyleClass().add("card-header");
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(0, 0, 12, 0));

        headerAvatarBox = new StackPane();
        headerAvatarBox.setMinSize(56, 56);
        headerAvatarBox.setMaxSize(56, 56);
        headerAvatarBox.getChildren().add(SpriteUtils.createCharacterSprite(sheet, 56));

        VBox titleBox = new VBox(2);
        nameField = new TextField();
        nameField.getStyleClass().add("header-name-field");
        nameField.setPromptText("Character Name");
        nameField.focusedProperty().addListener((obs, wasFocused, isFocused) -> {
            if (!isFocused) { sheet.setName(nameField.getText()); save(); }
        });

        classField = new TextField();
        classField.getStyleClass().add("header-class-field");
        classField.setPromptText("Class");
        classField.focusedProperty().addListener((obs, wasFocused, isFocused) -> {
            if (!isFocused) { sheet.setCharacterClass(classField.getText()); save(); }
        });

        titleBox.getChildren().addAll(nameField, classField);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button deleteBtn = new Button("Delete");
        deleteBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.DELETE));
        deleteBtn.getStyleClass().add("button-danger");
        deleteBtn.setOnAction(e -> confirmDelete());

        header.getChildren().addAll(headerAvatarBox, titleBox, spacer, deleteBtn);
        return header;
    }

    private void refreshHeaderAvatar() {
        if (headerAvatarBox != null) {
            headerAvatarBox.getChildren().setAll(SpriteUtils.createCharacterSprite(sheet, 56));
        }
    }

    private void confirmDelete() {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Character");
        confirm.setHeaderText(null);
        confirm.setContentText("Delete " + sheet.getName() + "? This cannot be undone.");
        DialogUtils.theme(confirm);

        if (confirm.showAndWait().orElse(ButtonType.CANCEL) == ButtonType.OK && onDelete != null) {
            onDelete.run();
        }
    }

    private TitledPane createBasicInfoSection() {
        basicInfoMainBox = new HBox(20);
        basicInfoMainBox.setAlignment(Pos.TOP_LEFT);
        
        // Sprite display on the left
        VBox spriteBox = createSpriteSection();

        // Form fields on the right - single-column stacked rows so each control
        // gets the full column width instead of fighting for space in a label|value grid.
        VBox form = new VBox(12);
        HBox.setHgrow(form, Priority.ALWAYS);

        // HP with spinners + bar
        Label hpLabel = new Label("HP:");
        hpLabel.getStyleClass().add("form-label");

        HBox hpBox = new HBox(6);
        hpBox.setAlignment(Pos.CENTER_LEFT);

        currentHpSpinner = new Spinner<>(0, 9999, 0);
        currentHpSpinner.setEditable(true);
        currentHpSpinner.setPrefWidth(75);
        currentHpSpinner.getStyleClass().add("styled-spinner-fx");
        FormUtils.styleSpinner(currentHpSpinner);
        currentHpSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                sheet.setCurrentHP(newVal);
                updateHpBar();
                sheet.save();
            }
        });

        Label slashLabel = new Label("/");
        slashLabel.setStyle("-fx-text-fill: #aaa; -fx-font-weight: bold;");

        maxHpSpinner = new Spinner<>(1, 9999, 1);
        maxHpSpinner.setEditable(true);
        maxHpSpinner.setPrefWidth(75);
        maxHpSpinner.getStyleClass().add("styled-spinner-fx");
        FormUtils.styleSpinner(maxHpSpinner);
        maxHpSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                sheet.setTotalHP(newVal);
                if (sheet.getCurrentHP() > newVal) {
                    sheet.setCurrentHP(newVal);
                    currentHpSpinner.getValueFactory().setValue(newVal);
                }
                updateHpBar();
                sheet.save();
            }
        });

        hpBox.getChildren().addAll(currentHpSpinner, slashLabel, maxHpSpinner);

        hpBar = new ProgressBar(1.0);
        hpBar.setMaxWidth(Double.MAX_VALUE);
        hpBar.setPrefHeight(20);
        hpBar.getStyleClass().add("hp-bar");
        hpBar.setStyle("-fx-accent: #4CAF50;");

        VBox hpRow = new VBox(6, hpLabel, hpBox, hpBar);

        // Armor Class
        Label acLabel = new Label("AC:");
        acLabel.getStyleClass().add("form-label");

        HBox acBadge = new HBox(6);
        acBadge.getStyleClass().add("ac-badge");
        acBadge.setAlignment(Pos.CENTER_LEFT);
        acBadge.getChildren().add(IconUtils.createIcon(IconUtils.Icon.SHIELD, 16, "#569cd6"));

        acSpinner = new Spinner<>(0, 99, 10);
        acSpinner.setEditable(true);
        acSpinner.setPrefWidth(70);
        acSpinner.getStyleClass().add("styled-spinner-fx");
        FormUtils.styleSpinner(acSpinner);
        acSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                sheet.setArmorClass(newVal);
                sheet.save();
            }
        });
        acBadge.getChildren().add(acSpinner);

        VBox acRow = new VBox(6, acLabel, acBadge);

        // Status menu (supports multiple via checkable menu items)
        Label statusLabel = new Label("Status:");
        statusLabel.getStyleClass().add("form-label");

        statusMenu = new MenuButton("None");
        statusMenu.setMaxWidth(Double.MAX_VALUE);
        statusMenu.getStyleClass().add("styled-combo-box");
        statusMenuItems = new HashMap<>();

        for (String statusName : Status.AVAILABLE_STATUSES) {
            if (statusName.equals("Neutral")) continue; // Skip neutral - no selection means neutral

            CheckMenuItem item = new CheckMenuItem(statusName);
            item.setOnAction(e -> {
                if (updatingDisplay) return;
                syncStatusesToSheet();
                updateStatusMenuText();
            });
            statusMenuItems.put(statusName, item);
            statusMenu.getItems().add(item);
        }

        VBox statusRow = new VBox(6, statusLabel, statusMenu);

        // Color
        Label colorLabel = new Label("Color:");
        colorLabel.getStyleClass().add("form-label");
        colorPicker = new ColorPicker(Color.web(sheet.getColor()));
        colorPicker.setMaxWidth(Double.MAX_VALUE);
        colorPicker.getStyleClass().add("styled-color-picker");
        colorPicker.setOnAction(e -> {
            if (updatingDisplay) return;
            sheet.setColor(ColorUtils.toHex(colorPicker.getValue()));
            sheet.save();
            refreshSpriteSection();
            refreshHeaderAvatar();
        });

        VBox colorRow = new VBox(6, colorLabel, colorPicker);

        // Roster group (Character Sheets list filter)
        Label groupLabel = new Label("Group:");
        groupLabel.getStyleClass().add("form-label");
        groupCombo = new ComboBox<>();
        groupCombo.getItems().add(CharSheet.groupLabel(null));
        for (String g : CharSheet.GROUPS) groupCombo.getItems().add(CharSheet.groupLabel(g));
        groupCombo.setMaxWidth(Double.MAX_VALUE);
        groupCombo.getStyleClass().add("styled-combo-box");
        groupCombo.valueProperty().addListener((obs, old, val) -> {
            if (updatingDisplay || val == null) return;
            String key = null;
            for (String g : CharSheet.GROUPS) {
                if (CharSheet.groupLabel(g).equals(val)) key = g;
            }
            if (java.util.Objects.equals(key, sheet.getGroup())) return;
            sheet.setGroup(key);
            if (onGroupChanged != null) onGroupChanged.run();
        });
        VBox groupRow = new VBox(6, groupLabel, groupCombo);

        form.getChildren().addAll(hpRow, acRow, statusRow, colorRow, groupRow);

        // Combine sprite and form
        basicInfoMainBox.getChildren().addAll(spriteBox, form);

        TitledPane pane = new TitledPane("Basic Info", basicInfoMainBox);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.PERSON, 16, "#569cd6"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    /**
     * Create the sprite display section with the character's sprite or fallback avatar.
     * Uses SpritePickerUtils for browse button and auto-copy functionality.
     */
    private VBox createSpriteSection() {
        // Use the sprite picker utility with auto-copy to sprites/party/
        return SpritePickerUtils.createSpritePicker(
            sheet.getSpritePath(),
            "party",
            sheet.getColor(),
            true, // isParty
            newPath -> { sheet.setSpritePath(newPath); refreshHeaderAvatar(); },
            () -> getScene() != null ? getScene().getWindow() : null
        );
    }

    private void refreshSpriteSection() {
        if (basicInfoMainBox == null || basicInfoMainBox.getChildren().isEmpty()) {
            return;
        }
        basicInfoMainBox.getChildren().set(0, createSpriteSection());
    }
    
    private void updateHpBar() {
        double ratio = (double) sheet.getCurrentHP() / sheet.getTotalHP();
        double targetProgress = Math.max(0, Math.min(1, ratio));

        // Animate the progress bar change
        AnimationUtils.animateProgressBar(hpBar, targetProgress);

        // Change color based on HP
        hpBar.getStyleClass().removeAll("progress-bar-success", "progress-bar-warning", "progress-bar-danger");
        if (ratio > 0.5) {
            hpBar.getStyleClass().add("progress-bar-success");
            hpBar.setEffect(null);
        } else if (ratio > 0.25) {
            hpBar.getStyleClass().add("progress-bar-warning");
            hpBar.setEffect(null);
        } else {
            hpBar.getStyleClass().add("progress-bar-danger");
            DropShadow lowHpGlow = new DropShadow();
            lowHpGlow.setColor(Color.web("#d75f5f"));
            lowHpGlow.setRadius(12);
            lowHpGlow.setSpread(0.4);
            hpBar.setEffect(lowHpGlow);
        }
    }

    private TitledPane createEquipmentSection() {
        primaryWeapon = new ComboBox<>();
        primaryWeapon.getStyleClass().add("styled-combo-box");
        primaryWeapon.setOnAction(e -> updatePrimary());

        secondaryWeapon = new ComboBox<>();
        secondaryWeapon.getStyleClass().add("styled-combo-box");
        secondaryWeapon.setOnAction(e -> updateSecondary());

        accessory1 = new ComboBox<>();
        accessory1.getStyleClass().add("styled-combo-box");
        accessory1.setOnAction(e -> updateAccessory(0));

        accessory2 = new ComboBox<>();
        accessory2.getStyleClass().add("styled-combo-box");
        accessory2.setOnAction(e -> updateAccessory(1));

        accessory3 = new ComboBox<>();
        accessory3.getStyleClass().add("styled-combo-box");
        accessory3.setOnAction(e -> updateAccessory(2));

        FlowPane weaponRow = new FlowPane(10, 10);
        weaponRow.getChildren().addAll(
            createEquipmentSlotCard("Primary", IconUtils.Icon.SWORDS, primaryWeapon),
            createEquipmentSlotCard("Secondary", IconUtils.Icon.SWORDS, secondaryWeapon)
        );

        FlowPane accessoryRow = new FlowPane(10, 10);
        accessoryRow.getChildren().addAll(
            createEquipmentSlotCard("Accessory 1", IconUtils.Icon.SHIELD, accessory1),
            createEquipmentSlotCard("Accessory 2", IconUtils.Icon.SHIELD, accessory2),
            createEquipmentSlotCard("Accessory 3", IconUtils.Icon.SHIELD, accessory3)
        );

        VBox slots = new VBox(10, weaponRow, accessoryRow);

        TitledPane pane = new TitledPane("Equipment", slots);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.SWORDS, 16, "#569cd6"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    private VBox createEquipmentSlotCard(String label, IconUtils.Icon icon, ComboBox<String> combo) {
        VBox card = new VBox(6);
        card.getStyleClass().add("slot-card");
        card.setAlignment(Pos.CENTER);
        card.setPrefWidth(140);

        HBox labelRow = new HBox(6);
        labelRow.setAlignment(Pos.CENTER);
        Label slotLabel = new Label(label);
        slotLabel.getStyleClass().add("form-label");
        labelRow.getChildren().addAll(IconUtils.createIcon(icon, 14, "#569cd6"), slotLabel);

        combo.setPrefWidth(120);
        combo.setMaxWidth(Double.MAX_VALUE);

        card.getChildren().addAll(labelRow, combo);
        return card;
    }

    private TitledPane createAttributesSection() {
        GridPane grid = new GridPane();
        grid.setHgap(20);
        grid.setVgap(10);
        grid.setPadding(new Insets(12));
        grid.setStyle("-fx-background-color: transparent;");
        
        // Headers
        grid.add(new Label(""), 0, 0);
        Label baseHeader = new Label("Base");
        baseHeader.getStyleClass().add("label-header");
        baseHeader.setStyle("-fx-text-fill: #569cd6; -fx-font-weight: bold;");
        grid.add(baseHeader, 1, 0);
        Label tempHeader = new Label("Bonus");
        tempHeader.getStyleClass().add("label-header");
        tempHeader.setStyle("-fx-text-fill: #4ec9b0; -fx-font-weight: bold;");
        grid.add(tempHeader, 2, 0);
        Label totalHeader = new Label("Total");
        totalHeader.getStyleClass().add("label-header");
        totalHeader.setStyle("-fx-text-fill: #dcdcaa; -fx-font-weight: bold;");
        grid.add(totalHeader, 3, 0);

        int row = 1;

        // Level and soft point pool tracking
        Label levelLabel = new Label("LVL");
        levelLabel.getStyleClass().add("stat-lvl");
        grid.add(levelLabel, 0, row);
        levelSpinner = new Spinner<>(1, 99, 1);
        levelSpinner.setEditable(true);
        levelSpinner.setPrefWidth(60);
        FormUtils.styleSpinner(levelSpinner);
        levelSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setLevel(newVal);
                updateDisplay();
            }
        });
        grid.add(levelSpinner, 1, row);
        pointsLabel = new Label();
        pointsLabel.getStyleClass().add("stat-points");
        grid.add(pointsLabel, 2, row);
        GridPane.setColumnSpan(pointsLabel, 2);
        row++;
        
        // STR
        Label strLabel = new Label("STR");
        strLabel.getStyleClass().add("stat-str");
        grid.add(strLabel, 0, row);
        strBase = new Spinner<>(0, 99, 5);
        strBase.setEditable(true);
        strBase.setPrefWidth(60);
        FormUtils.styleSpinner(strBase);
        strBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.STRENGTH, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(strBase, 1, row);
        strTemp = new Label(); strTemp.setMinWidth(40); grid.add(strTemp, 2, row);
        strTotal = new Label(); strTotal.setMinWidth(40); strTotal.setStyle("-fx-font-weight: bold;"); grid.add(strTotal, 3, row);
        row++;
        
        // DEX
        Label dexLabel = new Label("DEX");
        dexLabel.getStyleClass().add("stat-dex");
        grid.add(dexLabel, 0, row);
        dexBase = new Spinner<>(0, 99, 5);
        dexBase.setEditable(true);
        dexBase.setPrefWidth(60);
        FormUtils.styleSpinner(dexBase);
        dexBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.DEXTERITY, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(dexBase, 1, row);
        dexTemp = new Label(); dexTemp.setMinWidth(40); grid.add(dexTemp, 2, row);
        dexTotal = new Label(); dexTotal.setMinWidth(40); dexTotal.setStyle("-fx-font-weight: bold;"); grid.add(dexTotal, 3, row);
        row++;
        
        // CON
        Label conLabel = new Label("CON");
        conLabel.getStyleClass().add("stat-con");
        grid.add(conLabel, 0, row);
        conBase = new Spinner<>(0, 99, 5);
        conBase.setEditable(true);
        conBase.setPrefWidth(60);
        FormUtils.styleSpinner(conBase);
        conBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.CONSTITUTION, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(conBase, 1, row);
        conTemp = new Label(); conTemp.setMinWidth(40); grid.add(conTemp, 2, row);
        conTotal = new Label(); conTotal.setMinWidth(40); conTotal.setStyle("-fx-font-weight: bold;"); grid.add(conTotal, 3, row);
        row++;
        
        // INT
        Label intLabel = new Label("INT");
        intLabel.getStyleClass().add("stat-int");
        grid.add(intLabel, 0, row);
        intBase = new Spinner<>(0, 99, 5);
        intBase.setEditable(true);
        intBase.setPrefWidth(60);
        FormUtils.styleSpinner(intBase);
        intBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.INTELLIGENCE, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(intBase, 1, row);
        intTemp = new Label(); intTemp.setMinWidth(40); grid.add(intTemp, 2, row);
        intTotal = new Label(); intTotal.setMinWidth(40); intTotal.setStyle("-fx-font-weight: bold;"); grid.add(intTotal, 3, row);
        row++;

        // WIS
        Label wisLabel = new Label("WIS");
        wisLabel.getStyleClass().add("stat-wis");
        grid.add(wisLabel, 0, row);
        wisBase = new Spinner<>(0, 99, 5);
        wisBase.setEditable(true);
        wisBase.setPrefWidth(60);
        FormUtils.styleSpinner(wisBase);
        wisBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.WISDOM, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(wisBase, 1, row);
        wisTemp = new Label(); wisTemp.setMinWidth(40); grid.add(wisTemp, 2, row);
        wisTotal = new Label(); wisTotal.setMinWidth(40); wisTotal.setStyle("-fx-font-weight: bold;"); grid.add(wisTotal, 3, row);
        row++;

        // CHA
        Label chaLabel = new Label("CHA");
        chaLabel.getStyleClass().add("stat-cha");
        grid.add(chaLabel, 0, row);
        chaBase = new Spinner<>(0, 99, 5);
        chaBase.setEditable(true);
        chaBase.setPrefWidth(60);
        FormUtils.styleSpinner(chaBase);
        chaBase.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && !updatingDisplay) {
                sheet.setAttribute(CharSheet.CHARISMA, newVal);
                sheet.updateAttributes();
                updateDisplay();
            }
        });
        grid.add(chaBase, 1, row);
        chaTemp = new Label(); chaTemp.setMinWidth(40); grid.add(chaTemp, 2, row);
        chaTotal = new Label(); chaTotal.setMinWidth(40); chaTotal.setStyle("-fx-font-weight: bold;"); grid.add(chaTotal, 3, row);

        attributeChart = new AttributeRadarChart(200);

        VBox gridWrapper = new VBox(grid);
        gridWrapper.getStyleClass().add("attribute-card");

        VBox container = new VBox(12, attributeChart, gridWrapper);
        container.setAlignment(Pos.CENTER);

        TitledPane pane = new TitledPane("Attributes", container);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.DICE, 16, "#569cd6"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    private TitledPane createAbilitiesSection() {
        passiveAbilitiesData = FXCollections.observableArrayList();
        activeAbilitiesData = FXCollections.observableArrayList();
        specialAbilitiesData = FXCollections.observableArrayList();

        TabPane tabs = new TabPane();
        tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        tabs.setPrefHeight(180);
        tabs.getStyleClass().add("styled-tab-pane");

        Tab passiveTab = createAbilityTab("Passive", EntityRes.ItemAbility.TYPE_PASSIVE, passiveAbilitiesData, "ability-row-passive");
        passiveTab.setGraphic(IconUtils.createIcon(IconUtils.Icon.SHIELD, 14, "#4CAF50"));
        Tab activeTab = createAbilityTab("Active", EntityRes.ItemAbility.TYPE_ACTIVE, activeAbilitiesData, "ability-row-active");
        activeTab.setGraphic(IconUtils.createIcon(IconUtils.Icon.LIGHTNING, 14, "#569cd6"));
        Tab specialTab = createAbilityTab("Special", EntityRes.ItemAbility.TYPE_SPECIAL, specialAbilitiesData, "ability-row-special");
        specialTab.setGraphic(IconUtils.createIcon(IconUtils.Icon.STAR, 14, "#9c27b0"));
        tabs.getTabs().addAll(passiveTab, activeTab, specialTab);

        TitledPane pane = new TitledPane("Abilities", tabs);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.FLAG, 16, "#569cd6"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    private static final String[] CASTING_STATS = {"None", "INTELLIGENCE", "WISDOM", "CHARISMA", "STRENGTH", "DEXTERITY", "CONSTITUTION"};

    private TitledPane createSpellcastingSection() {
        castingStatCombo = new ComboBox<>();
        castingStatCombo.getItems().addAll(CASTING_STATS);
        castingStatCombo.valueProperty().addListener((obs, old, val) -> {
            if (updatingDisplay || val == null) return;
            sheet.setSpellcastingStat(val);
            updateDisplay();
        });
        Label statLabel = new Label("Casting stat:");
        statLabel.getStyleClass().add("label-muted");

        castingInfoLabel = new Label();
        castingInfoLabel.setStyle("-fx-text-fill: #b9a8f5; -fx-font-weight: bold;");

        Button longRestBtn = new Button("Long Rest");
        longRestBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.REST, 14, "#ffffff"));
        longRestBtn.getStyleClass().add("button-arcane");
        longRestBtn.setTooltip(new Tooltip("Restore all spell slots"));
        longRestBtn.setOnAction(e -> {
            sheet.longRest();
            updateDisplay();
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        HBox statRow = new HBox(8, statLabel, castingStatCombo, castingInfoLabel, spacer, longRestBtn);
        statRow.setAlignment(Pos.CENTER_LEFT);

        spellSlotBox = new VBox();

        knownSpellsData = FXCollections.observableArrayList();
        ListView<Spell> spellList = new ListView<>(knownSpellsData);
        spellList.getStyleClass().add("ability-list");
        // Grow with the spell count (no inner scrolling for a typical list), capped at 8 rows
        spellList.prefHeightProperty().bind(javafx.beans.binding.Bindings.createDoubleBinding(
            () -> 12 + 64.0 * Math.max(1, Math.min(8, knownSpellsData.size())), knownSpellsData));
        spellList.setPlaceholder(new Label("No known spells"));
        spellList.setCellFactory(lv -> new ListCell<>() {
            private final Label nameLabel = new Label();
            private final Label summaryLabel = new Label();
            private final Label levelBadge = new Label();
            private final Button removeBtn = new Button();
            private final Button editBtn = new Button();
            private final HBox container;
            {
                editBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.EDIT, 12, "#dcdcdc"));
                editBtn.getStyleClass().add("button");
                editBtn.setTooltip(new Tooltip("Edit this spell (changes apply to everyone who knows it)"));
                editBtn.setOnAction(e -> {
                    if (getItem() != null) {
                        SpellEditorDialog.showAndWait(getScene() != null ? getScene().getWindow() : null,
                            getItem(), CharacterSheetPane.this::updateDisplay);
                    }
                });
                nameLabel.getStyleClass().add("ability-name");
                summaryLabel.getStyleClass().add("ability-desc");
                summaryLabel.maxWidthProperty().bind(lv.widthProperty().subtract(190));
                levelBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 7 2 7; "
                    + "-fx-background-radius: 10; -fx-text-fill: white; -fx-background-color: #5d4bb8;");
                removeBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 12, "#ffffff"));
                removeBtn.getStyleClass().add("button-danger");
                removeBtn.setOnAction(e -> {
                    if (getItem() != null) {
                        sheet.forgetSpell(getItem().getName());
                        updateDisplay();
                    }
                });
                Region gap = new Region();
                HBox.setHgrow(gap, Priority.ALWAYS);
                container = new HBox(10, new VBox(2, nameLabel, summaryLabel), gap, levelBadge, editBtn, removeBtn);
                container.setAlignment(Pos.CENTER_LEFT);
                container.getStyleClass().addAll("ability-row", "ability-row-special");
            }

            @Override
            protected void updateItem(Spell spell, boolean empty) {
                super.updateItem(spell, empty);
                setStyle("-fx-background-color: transparent;");
                if (empty || spell == null) {
                    setGraphic(null);
                    return;
                }
                nameLabel.setText(spell.getName());
                summaryLabel.setText(spell.getSummary());
                levelBadge.setText(spell.getLevelLabel());
                levelBadge.setStyle(levelBadge.getStyle().replaceAll("-fx-background-color: #[0-9a-fA-F]+;",
                    "-fx-background-color: " + (spell.isCantrip() ? "#4a4f6a" : "#5d4bb8") + ";"));
                setGraphic(container);
            }
        });

        Button learnBtn = new Button("+ Learn Spell");
        learnBtn.getStyleClass().add("button-accent");
        learnBtn.setOnAction(e -> showLearnSpellDialog());

        VBox box = new VBox(10, statRow, spellSlotBox, learnBtn, spellList);
        box.setPadding(new Insets(6, 0, 0, 0));

        TitledPane pane = new TitledPane("Spellcasting", box);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.SPELL, 16, "#9a7cf0"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    private void showLearnSpellDialog() {
        java.util.List<String> choices = new java.util.ArrayList<>();
        java.util.Map<String, String> labelToName = new java.util.HashMap<>();
        for (Spell spell : SpellDatabase.getInstance().getAllSpells()) {
            if (sheet.getKnownSpellNames().contains(spell.getName())) continue;
            String label = spell.getName() + "  (" + spell.getLevelLabel() + ")";
            choices.add(label);
            labelToName.put(label, spell.getName());
        }
        if (choices.isEmpty()) {
            DialogUtils.showAlert(Alert.AlertType.INFORMATION, "No Spells",
                "No other spells exist yet. Create some in the Asset Editor's Spells tab.");
            return;
        }
        ChoiceDialog<String> dialog = new ChoiceDialog<>(choices.get(0), choices);
        dialog.setTitle("Learn Spell");
        dialog.setHeaderText("Add a spell to " + sheet.getName() + "'s known spells:");
        DialogUtils.theme(dialog);
        dialog.showAndWait().ifPresent(choice -> {
            sheet.learnSpell(labelToName.get(choice));
            updateDisplay();
        });
    }

    private void refreshSpellcasting() {
        String stat = sheet.getSpellcastingStat();
        castingStatCombo.setValue(stat == null ? "None" : stat);
        if (sheet.isCaster()) {
            int atk = sheet.getCastingModifier();
            castingInfoLabel.setText("DC " + sheet.getSpellSaveDC() + "  |  Atk " + (atk >= 0 ? "+" : "") + atk);
        } else {
            castingInfoLabel.setText("Not a caster");
        }
        spellSlotBox.getChildren().setAll(sheet.isCaster()
            ? UI.Battle.SpellPickerDialog.buildSlotRow(sheet) : new Label());
        spellSlotBox.setVisible(sheet.isCaster());
        spellSlotBox.setManaged(sheet.isCaster());
        knownSpellsData.setAll(sheet.getKnownSpells());
    }

    private Tab createAbilityTab(String label, String abilityType, ObservableList<EntityRes.ItemAbility> data, String rowStyleClass) {
        VBox box = new VBox(10);
        box.setPadding(new Insets(10, 0, 0, 0));

        HBox buttonBar = new HBox(10);
        buttonBar.setAlignment(Pos.CENTER_LEFT);
        Button addBtn = new Button("+ Add " + label + " Ability");
        addBtn.getStyleClass().add("button-accent");
        addBtn.setOnAction(e -> showAddAbilityDialog(abilityType));
        buttonBar.getChildren().add(addBtn);

        ListView<EntityRes.ItemAbility> listView = createAbilityListView(data, abilityType, rowStyleClass);

        box.getChildren().addAll(buttonBar, listView);
        return new Tab(label, box);
    }

    private ListView<EntityRes.ItemAbility> createAbilityListView(ObservableList<EntityRes.ItemAbility> data, String abilityType, String rowStyleClass) {
        ListView<EntityRes.ItemAbility> listView = new ListView<>(data);
        listView.getStyleClass().add("ability-list");
        listView.setPrefHeight(140);
        listView.setPlaceholder(new Label("No " + abilityType.toLowerCase() + " abilities"));

        listView.setCellFactory(lv -> new ListCell<EntityRes.ItemAbility>() {
            private final HBox container = new HBox(10);
            private final VBox textBox = new VBox(2);
            private final Label nameLabel = new Label();
            private final Label descLabel = new Label();
            private final Label triggerLabel = new Label();
            private final Region spacer = new Region();
            private final Button removeBtn = new Button();
            private final Tooltip descTooltip = new Tooltip();

            {
                removeBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 12, "#ffffff"));
                container.getStyleClass().addAll("ability-row", rowStyleClass);
                container.setAlignment(Pos.CENTER_LEFT);
                HBox.setHgrow(spacer, Priority.ALWAYS);

                nameLabel.getStyleClass().add("ability-name");
                descLabel.getStyleClass().add("ability-desc");
                triggerLabel.getStyleClass().add("ability-trigger");
                // Ellipsize instead of clipping/wrapping long descriptions; full text via tooltip
                descLabel.maxWidthProperty().bind(listView.widthProperty().subtract(90));
                Tooltip.install(descLabel, descTooltip);

                textBox.getChildren().addAll(nameLabel, descLabel, triggerLabel);

                removeBtn.getStyleClass().add("button-danger");
                removeBtn.setOnAction(e -> {
                    EntityRes.ItemAbility ability = getItem();
                    if (ability != null) {
                        sheet.removeAbility(ability);
                        updateDisplay();
                    }
                });

                container.getChildren().addAll(textBox, spacer, removeBtn);
            }

            @Override
            protected void updateItem(EntityRes.ItemAbility ability, boolean empty) {
                super.updateItem(ability, empty);
                if (empty || ability == null) {
                    setGraphic(null);
                    setStyle("-fx-background-color: transparent;");
                } else {
                    nameLabel.setText(ability.getName());
                    descLabel.setText(ability.getDescription());
                    descTooltip.setText(ability.getDescription());
                    if (EntityRes.ItemAbility.TYPE_PASSIVE.equals(ability.getAbilityType())) {
                        triggerLabel.setText(ability.getTriggerType() + " -> " + ability.getEffectType() +
                            (ability.getMagnitude() != 0 ? " (" + ability.getMagnitude() + ")" : ""));
                    } else {
                        triggerLabel.setText(ability.getEffectType() +
                            (ability.getMagnitude() != 0 ? " (" + ability.getMagnitude() + ")" : ""));
                    }
                    setGraphic(container);
                    setStyle("-fx-background-color: transparent;");
                }
            }
        });

        return listView;
    }

    private void showAddAbilityDialog(String initialAbilityType) {
        Dialog<EntityRes.ItemAbility> dialog = new Dialog<>();
        dialog.setTitle("Add Ability");
        dialog.setHeaderText("Create a new character ability");
        DialogUtils.theme(dialog);

        // Form fields
        TextField nameField = new TextField();
        nameField.setPromptText("Ability name");
        nameField.getStyleClass().add("styled-text-field");

        TextField descField = new TextField();
        descField.setPromptText("Description");
        descField.getStyleClass().add("styled-text-field");

        ComboBox<String> typeCombo = new ComboBox<>();
        typeCombo.getItems().addAll(EntityRes.ItemAbility.ABILITY_TYPES);
        typeCombo.getSelectionModel().select(initialAbilityType);
        typeCombo.getStyleClass().add("styled-combo-box");

        ComboBox<String> triggerCombo = new ComboBox<>();
        triggerCombo.getItems().addAll(EntityRes.ItemAbility.TRIGGER_TYPES);
        triggerCombo.getSelectionModel().select(EntityRes.ItemAbility.ON_TURN_START);
        triggerCombo.getStyleClass().add("styled-combo-box");

        ComboBox<String> effectCombo = new ComboBox<>();
        effectCombo.getItems().addAll(EntityRes.ItemAbility.EFFECT_TYPES);
        effectCombo.getSelectionModel().select(EntityRes.ItemAbility.EFFECT_HEAL);
        effectCombo.getStyleClass().add("styled-combo-box");

        Spinner<Integer> magnitudeSpinner = new Spinner<>(-99, 99, 1);
        magnitudeSpinner.setEditable(true);
        magnitudeSpinner.setPrefWidth(80);
        FormUtils.styleSpinner(magnitudeSpinner);

        ComboBox<String> targetAttrCombo = new ComboBox<>();
        targetAttrCombo.getItems().addAll("STR", "DEX", "CON", "INT", "WIS", "CHA");
        targetAttrCombo.getSelectionModel().select(0);
        targetAttrCombo.getStyleClass().add("styled-combo-box");
        targetAttrCombo.setDisable(true);

        TextField statusField = new TextField();
        statusField.setPromptText("Status name");
        statusField.getStyleClass().add("styled-text-field");
        statusField.setDisable(true);

        // Trigger only has meaning for Passive abilities (auto-triggered on events);
        // Active/Special abilities aren't wired into combat yet, so disable it for those.
        triggerCombo.setDisable(!EntityRes.ItemAbility.TYPE_PASSIVE.equals(initialAbilityType));
        typeCombo.setOnAction(e -> triggerCombo.setDisable(!EntityRes.ItemAbility.TYPE_PASSIVE.equals(typeCombo.getValue())));

        // Show/hide fields based on effect type
        effectCombo.setOnAction(e -> {
            String effect = effectCombo.getValue();
            targetAttrCombo.setDisable(!EntityRes.ItemAbility.EFFECT_STAT_BOOST.equals(effect));
            statusField.setDisable(!EntityRes.ItemAbility.EFFECT_STATUS.equals(effect));
        });

        // Layout
        GridPane grid = FormUtils.createFormGrid(1);
        grid.setPadding(new Insets(20));

        int row = 0;
        grid.add(labeled("Type:"), 0, row);
        grid.add(typeCombo, 1, row++);

        grid.add(labeled("Name:"), 0, row);
        grid.add(nameField, 1, row++);

        grid.add(labeled("Description:"), 0, row);
        grid.add(descField, 1, row++);

        grid.add(labeled("Trigger:"), 0, row);
        grid.add(triggerCombo, 1, row++);

        grid.add(labeled("Effect:"), 0, row);
        grid.add(effectCombo, 1, row++);

        grid.add(labeled("Magnitude:"), 0, row);
        grid.add(magnitudeSpinner, 1, row++);

        grid.add(labeled("Target Attr:"), 0, row);
        grid.add(targetAttrCombo, 1, row++);

        grid.add(labeled("Status Name:"), 0, row);
        grid.add(statusField, 1, row++);

        dialog.getDialogPane().setContent(grid);

        ButtonType addButton = new ButtonType("Add", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(addButton, ButtonType.CANCEL);

        // Disable Add button until name is provided
        Node addBtn = dialog.getDialogPane().lookupButton(addButton);
        addBtn.setDisable(true);
        nameField.textProperty().addListener((obs, old, val) -> addBtn.setDisable(val == null || val.trim().isEmpty()));

        dialog.setResultConverter(buttonType -> {
            if (buttonType == addButton) {
                return new EntityRes.ItemAbility(
                    nameField.getText().trim(),
                    descField.getText().trim(),
                    triggerCombo.getValue(),
                    effectCombo.getValue(),
                    magnitudeSpinner.getValue(),
                    targetAttrCombo.getSelectionModel().getSelectedIndex(),
                    statusField.getText().trim().isEmpty() ? null : statusField.getText().trim(),
                    typeCombo.getValue()
                );
            }
            return null;
        });

        dialog.showAndWait().ifPresent(ability -> {
            sheet.addAbility(ability);
            updateDisplay();
        });
    }

    private Label labeled(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("form-label");
        return label;
    }

    private TitledPane createInventorySection() {
        VBox inventoryBox = new VBox(10);
        
        // Add Item button at top
        HBox buttonBar = new HBox(10);
        buttonBar.setAlignment(Pos.CENTER_LEFT);
        Button addItemBtn = new Button("+ Add Item");
        addItemBtn.getStyleClass().addAll("button", "button-success");
        addItemBtn.setOnAction(e -> showAddItemDialog());
        buttonBar.getChildren().add(addItemBtn);
        
        // Tab pane for item categories
        TabPane tabs = new TabPane();
        tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        tabs.setPrefHeight(180);
        tabs.getStyleClass().add("styled-tab-pane");
        
        // Consumables/Ammo tab
        consumablesData = FXCollections.observableArrayList();
        consumablesList = createItemListView(consumablesData);
        Tab consumablesTab = new Tab("Consumables/Ammo", consumablesList);
        
        // Crafting tab
        craftingData = FXCollections.observableArrayList();
        craftingList = createItemListView(craftingData);
        Tab craftingTab = new Tab("Crafting", craftingList);
        
        // Key Items tab
        keyItemsData = FXCollections.observableArrayList();
        keyItemsList = createItemListView(keyItemsData);
        Tab keyItemsTab = new Tab("Key Items", keyItemsList);
        
        // Weapons tab
        weaponsData = FXCollections.observableArrayList();
        weaponsList = createItemListView(weaponsData);
        Tab weaponsTab = new Tab("Weapons", weaponsList);
        
        // Accessories tab
        accessoriesData = FXCollections.observableArrayList();
        accessoriesList = createItemListView(accessoriesData);
        Tab accessoriesTab = new Tab("Accessories", accessoriesList);
        
        tabs.getTabs().addAll(weaponsTab, accessoriesTab, consumablesTab, craftingTab, keyItemsTab);
        
        inventoryBox.getChildren().addAll(buttonBar, tabs);
        
        TitledPane pane = new TitledPane("Inventory", inventoryBox);
        pane.setGraphic(IconUtils.createIcon(IconUtils.Icon.CHEST, 16, "#569cd6"));
        pane.getStyleClass().add("form-section");
        pane.setCollapsible(false);
        return pane;
    }

    private ListView<Item> createItemListView(ObservableList<Item> items) {
        ListView<Item> listView = new ListView<>(items);
        listView.getStyleClass().add("ability-list");
        listView.setPrefHeight(150);
        listView.setPlaceholder(new Label("No items"));

        listView.setCellFactory(lv -> new ListCell<Item>() {
            private final HBox container = new HBox(10);
            private final Label nameLabel = new Label();
            private final Label quantityLabel = new Label();
            private final Region spacer = new Region();
            private final Button removeBtn = new Button();

            {
                removeBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 12, "#ffffff"));
                container.getStyleClass().add("item-card");
                container.setAlignment(Pos.CENTER_LEFT);
                HBox.setHgrow(spacer, Priority.ALWAYS);

                nameLabel.getStyleClass().add("ability-name");
                quantityLabel.getStyleClass().add("ability-desc");

                removeBtn.getStyleClass().add("button-danger");
                removeBtn.setOnAction(e -> {
                    Item item = getItem();
                    if (item != null) {
                        showRemoveItemDialog(item);
                    }
                });

                container.getChildren().addAll(nameLabel, quantityLabel, spacer, removeBtn);
            }

            @Override
            protected void updateItem(Item item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setStyle("-fx-background-color: transparent;");
                } else {
                    nameLabel.setText(item.getName());
                    quantityLabel.setText("×" + item.getQuantity());
                    setGraphic(container);
                    setStyle("-fx-background-color: transparent;");
                }
            }
        });
        
        return listView;
    }

    private void showAddItemDialog() {
        Dialog<Item> dialog = new Dialog<>();
        dialog.setTitle("Add Item");
        dialog.setHeaderText("Select an item to add to inventory");
        DialogUtils.theme(dialog);


        // Category selection
        ComboBox<String> categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll("Weapon", "Accessory", "Consumable", "Ammunition", "Crafting Item", "Key Item");
        categoryCombo.setPromptText("Select category");
        categoryCombo.setPrefWidth(200);
        categoryCombo.getStyleClass().add("styled-combo-box");
        
        // Item selection
        ComboBox<String> itemCombo = new ComboBox<>();
        itemCombo.setPromptText("Select item");
        itemCombo.setPrefWidth(200);
        itemCombo.getStyleClass().add("styled-combo-box");
        itemCombo.setDisable(true);
        
        // Quantity spinner
        Spinner<Integer> quantitySpinner = new Spinner<>(1, 999, 1);
        quantitySpinner.setEditable(true);
        quantitySpinner.setPrefWidth(100);
        FormUtils.styleSpinner(quantitySpinner);
        
        // Update item list when category changes
        categoryCombo.setOnAction(e -> {
            itemCombo.getItems().clear();
            ItemDatabase db = ItemDatabase.getInstance();
            String category = categoryCombo.getValue();
            if (category == null) return;
            
            switch (category) {
                case "Weapon":
                    itemCombo.getItems().addAll(db.getAllWeapons().keySet());
                    break;
                case "Accessory":
                    itemCombo.getItems().addAll(db.getAllAccessories().keySet());
                    break;
                case "Consumable":
                    itemCombo.getItems().addAll(db.getAllConsumables().keySet());
                    break;
                case "Ammunition":
                    itemCombo.getItems().addAll(db.getAllAmmunition().keySet());
                    break;
                case "Crafting Item":
                    itemCombo.getItems().addAll(db.getAllCraftingItems().keySet());
                    break;
                case "Key Item":
                    itemCombo.getItems().addAll(db.getAllKeyItems().keySet());
                    break;
            }
            itemCombo.setDisable(itemCombo.getItems().isEmpty());
        });
        
        // Layout
        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(15);
        grid.setPadding(new Insets(20));
        
        Label catLabel = new Label("Category:");
        catLabel.setStyle("-fx-text-fill: #e0e0e0;");
        grid.add(catLabel, 0, 0);
        grid.add(categoryCombo, 1, 0);
        
        Label itemLabel = new Label("Item:");
        itemLabel.setStyle("-fx-text-fill: #e0e0e0;");
        grid.add(itemLabel, 0, 1);
        grid.add(itemCombo, 1, 1);
        
        Label qtyLabel = new Label("Quantity:");
        qtyLabel.setStyle("-fx-text-fill: #e0e0e0;");
        grid.add(qtyLabel, 0, 2);
        grid.add(quantitySpinner, 1, 2);
        
        dialog.getDialogPane().setContent(grid);
        
        ButtonType addButton = new ButtonType("Add", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(addButton, ButtonType.CANCEL);
        
        // Disable Add button until item is selected
        Node addBtn = dialog.getDialogPane().lookupButton(addButton);
        addBtn.setDisable(true);
        itemCombo.valueProperty().addListener((obs, old, val) -> addBtn.setDisable(val == null));
        
        dialog.setResultConverter(buttonType -> {
            if (buttonType == addButton) {
                String category = categoryCombo.getValue();
                String itemName = itemCombo.getValue();
                int quantity = quantitySpinner.getValue();
                ItemDatabase db = ItemDatabase.getInstance();
                
                Item newItem = null;
                switch (category) {
                    case "Weapon":
                        Weapon w = db.getWeapon(itemName);
                        if (w != null) newItem = new Weapon(w.getName(), w.getType(), w.getDamageDice(), w.getStatType(), w.getAmmoType(), w.getModifiedAttributes().clone());
                        break;
                    case "Accessory":
                        Accessory ar = db.getAccessory(itemName);
                        if (ar != null) newItem = new Accessory(ar.getName(), ar.getType(), ar.getDefense(), ar.getModifiedAttributes().clone());
                        break;
                    case "Consumable":
                        Consumable c = db.getConsumable(itemName);
                        if (c != null) newItem = new Consumable(c.getName(), c.getType(), c.getColor(), c.getHealAmount(), c.getEffect());
                        break;
                    case "Ammunition":
                        Ammunition a = db.getAmmunition(itemName);
                        if (a != null) newItem = new Ammunition(a.getName(), a.getType(), a.getColor(), a.getAmmoType());
                        break;
                    case "Crafting Item":
                        CraftingItem cr = db.getCraftingItem(itemName);
                        if (cr != null) newItem = new CraftingItem(cr.getName(), cr.getType(), cr.getColor(), cr.getCraftingCategory(), cr.getDescription());
                        break;
                    case "Key Item":
                        KeyItem k = db.getKeyItem(itemName);
                        if (k != null) newItem = new KeyItem(k.getName(), k.getType(), k.getColor(), k.getDescription(), k.isQuestRelated());
                        break;
                }
                if (newItem != null) {
                    newItem.setQuantity(quantity);
                }
                return newItem;
            }
            return null;
        });
        
        dialog.showAndWait().ifPresent(item -> {
            sheet.addItem(item);
            updateDisplay();
        });
    }

    private void showRemoveItemDialog(Item item) {
        if (item.getQuantity() == 1) {
            // Just remove the item directly
            Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
            confirm.setTitle("Remove Item");
            confirm.setHeaderText("Remove " + item.getName() + "?");
            confirm.setContentText("This will remove the item from inventory.");
            DialogUtils.theme(confirm);
            confirm.showAndWait().ifPresent(response -> {
                if (response == ButtonType.OK) {
                    sheet.removeItem(item);
                    updateDisplay();
                }
            });
        } else {
            // Show dialog to choose quantity to remove
            Dialog<Integer> dialog = new Dialog<>();
            dialog.setTitle("Remove Item");
            dialog.setHeaderText("Remove " + item.getName());
            DialogUtils.theme(dialog);


            Spinner<Integer> qtySpinner = new Spinner<>(1, item.getQuantity(), 1);
            qtySpinner.setEditable(true);
            qtySpinner.setPrefWidth(100);
            FormUtils.styleSpinner(qtySpinner);
            
            Button removeAllBtn = new Button("Remove All");
            removeAllBtn.getStyleClass().addAll("button", "button-danger");
            removeAllBtn.setOnAction(e -> qtySpinner.getValueFactory().setValue(item.getQuantity()));
            
            HBox content = new HBox(15);
            content.setAlignment(Pos.CENTER_LEFT);
            content.setPadding(new Insets(20));
            Label qtyLabel = new Label("Quantity to remove:");
            qtyLabel.setStyle("-fx-text-fill: #e0e0e0;");
            content.getChildren().addAll(qtyLabel, qtySpinner, removeAllBtn);
            
            dialog.getDialogPane().setContent(content);
            
            ButtonType removeButton = new ButtonType("Remove", ButtonBar.ButtonData.OK_DONE);
            dialog.getDialogPane().getButtonTypes().addAll(removeButton, ButtonType.CANCEL);
            
            dialog.setResultConverter(buttonType -> {
                if (buttonType == removeButton) {
                    return qtySpinner.getValue();
                }
                return null;
            });
            
            dialog.showAndWait().ifPresent(qty -> {
                sheet.removeItemQuantity(item, qty);
                updateDisplay();
            });
        }
    }

    public void updateDisplay() {
        if (updatingDisplay) return;
        updatingDisplay = true;
        try {
            if (!nameField.isFocused()) {
                nameField.setText(sheet.getName());
            }
            if (!classField.isFocused()) {
                classField.setText(sheet.getCharacterClass() != null && !sheet.getCharacterClass().equals("None")
                    ? sheet.getCharacterClass() : "");
            }
            colorPicker.setValue(Color.web(sheet.getColor()));
            groupCombo.setValue(CharSheet.groupLabel(sheet.getGroup()));
            refreshHeaderAvatar();

        // Update HP spinners without triggering listeners
        currentHpSpinner.getValueFactory().setValue(sheet.getCurrentHP());
        maxHpSpinner.getValueFactory().setValue(sheet.getTotalHP());
        updateHpBar();
        
        // Update AC spinner
        acSpinner.getValueFactory().setValue(sheet.getArmorClass());
        
        // Status menu items - check items for current statuses
        Status[] statuses = sheet.getStatus();
        java.util.Set<String> activeStatuses = new java.util.HashSet<>();
        for (Status s : statuses) {
            activeStatuses.add(s.getName());
        }
        for (Map.Entry<String, CheckMenuItem> entry : statusMenuItems.entrySet()) {
            entry.getValue().setSelected(activeStatuses.contains(entry.getKey()));
        }
        updateStatusMenuText();
        
        // Update weapon combos
        primaryWeapon.getItems().clear();
        secondaryWeapon.getItems().clear();
        primaryWeapon.getItems().add("None");
        secondaryWeapon.getItems().add("None");
        // Add equipped weapons first (they're not in inventory)
        if (sheet.getEquippedWeapon() != null) {
            primaryWeapon.getItems().add(sheet.getEquippedWeapon().getName());
            secondaryWeapon.getItems().add(sheet.getEquippedWeapon().getName());
        }
        if (sheet.getEquippedSecondary() != null && 
            (sheet.getEquippedWeapon() == null || !sheet.getEquippedWeapon().getName().equals(sheet.getEquippedSecondary().getName()))) {
            primaryWeapon.getItems().add(sheet.getEquippedSecondary().getName());
            secondaryWeapon.getItems().add(sheet.getEquippedSecondary().getName());
        }
        // Add weapons from inventory
        for (Item item : sheet.getInventory()) {
            if (item instanceof Weapon) {
                primaryWeapon.getItems().add(item.getName());
                secondaryWeapon.getItems().add(item.getName());
            }
        }
        if (sheet.getEquippedWeapon() != null) {
            primaryWeapon.getSelectionModel().select(sheet.getEquippedWeapon().getName());
        } else {
            primaryWeapon.getSelectionModel().select("None");
        }
        if (sheet.getEquippedSecondary() != null) {
            secondaryWeapon.getSelectionModel().select(sheet.getEquippedSecondary().getName());
        } else {
            secondaryWeapon.getSelectionModel().select("None");
        }
        
        // Update accessory combos
        accessory1.getItems().clear();
        accessory2.getItems().clear();
        accessory3.getItems().clear();
        accessory1.getItems().add("None");
        accessory2.getItems().add("None");
        accessory3.getItems().add("None");
        // Add equipped accessories first (they're not in inventory)
        for (int slot = 0; slot < 3; slot++) {
            Accessory equipped = sheet.getAccessory(slot);
            if (equipped != null) {
                // Check if not already added
                if (!accessory1.getItems().contains(equipped.getName())) {
                    accessory1.getItems().add(equipped.getName());
                    accessory2.getItems().add(equipped.getName());
                    accessory3.getItems().add(equipped.getName());
                }
            }
        }
        // Add accessories from inventory
        for (Item item : sheet.getInventory()) {
            if (item instanceof Accessory) {
                accessory1.getItems().add(item.getName());
                accessory2.getItems().add(item.getName());
                accessory3.getItems().add(item.getName());
            }
        }
        if (sheet.getAccessory(0) != null) {
            accessory1.getSelectionModel().select(sheet.getAccessory(0).getName());
        } else {
            accessory1.getSelectionModel().select("None");
        }
        if (sheet.getAccessory(1) != null) {
            accessory2.getSelectionModel().select(sheet.getAccessory(1).getName());
        } else {
            accessory2.getSelectionModel().select("None");
        }
        if (sheet.getAccessory(2) != null) {
            accessory3.getSelectionModel().select(sheet.getAccessory(2).getName());
        } else {
            accessory3.getSelectionModel().select("None");
        }
        
        // Attributes
        strBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.STRENGTH));
        updateBonusLabel(strTemp, sheet.getTempAttribute(CharSheet.STRENGTH));
        strTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.STRENGTH)));

        dexBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.DEXTERITY));
        updateBonusLabel(dexTemp, sheet.getTempAttribute(CharSheet.DEXTERITY));
        dexTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.DEXTERITY)));

        conBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.CONSTITUTION));
        updateBonusLabel(conTemp, sheet.getTempAttribute(CharSheet.CONSTITUTION));
        conTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.CONSTITUTION)));

        intBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.INTELLIGENCE));
        updateBonusLabel(intTemp, sheet.getTempAttribute(CharSheet.INTELLIGENCE));
        intTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.INTELLIGENCE)));

        wisBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.WISDOM));
        updateBonusLabel(wisTemp, sheet.getTempAttribute(CharSheet.WISDOM));
        wisTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.WISDOM)));

        chaBase.getValueFactory().setValue(sheet.getAttribute(CharSheet.CHARISMA));
        updateBonusLabel(chaTemp, sheet.getTempAttribute(CharSheet.CHARISMA));
        chaTotal.setText(String.valueOf(sheet.getTotalAttribute(CharSheet.CHARISMA)));

        attributeChart.setValues(sheet.getTotalAttributes());

        levelSpinner.getValueFactory().setValue(sheet.getLevel());
        int pointBalance = sheet.getStatPointBalance();
        pointsLabel.setText("Points: " + sheet.getSpentStatPoints() + " / " + sheet.getAvailableStatPoints()
            + (pointBalance < 0 ? " (Over by " + Math.abs(pointBalance) + ")" : ""));
        pointsLabel.setStyle(pointBalance < 0 ? "-fx-text-fill: #d75f5f; -fx-font-weight: bold;" : "");
        
        // Inventory - populate ListViews
        consumablesData.clear();
        craftingData.clear();
        keyItemsData.clear();
        weaponsData.clear();
        accessoriesData.clear();
        
        for (Item item : sheet.getInventory()) {
            if (item instanceof Weapon) {
                weaponsData.add(item);
            } else if (item instanceof Accessory) {
                accessoriesData.add(item);
            } else if (item instanceof Consumable || item instanceof Ammunition) {
                consumablesData.add(item);
            } else if (item instanceof CraftingItem) {
                craftingData.add(item);
            } else if (item instanceof KeyItem) {
                keyItemsData.add(item);
            }
        }
        
        // Abilities - populate grouped ListViews by type
        passiveAbilitiesData.clear();
        activeAbilitiesData.clear();
        specialAbilitiesData.clear();
        for (EntityRes.ItemAbility ability : sheet.getAbilities()) {
            switch (ability.getAbilityType()) {
                case EntityRes.ItemAbility.TYPE_ACTIVE -> activeAbilitiesData.add(ability);
                case EntityRes.ItemAbility.TYPE_SPECIAL -> specialAbilitiesData.add(ability);
                default -> passiveAbilitiesData.add(ability);
            }
        }
        refreshSpellcasting();
        } finally {
            updatingDisplay = false;
        }
    }

    private void updatePrimary() {
        if (updatingDisplay) return;
        String selected = primaryWeapon.getSelectionModel().getSelectedItem();
        if (selected != null) {
            if (selected.equals("None")) {
                sheet.equipPrimaryWeapon(null);
                save();
            } else {
                // Check if it's the currently equipped weapon (same name means keep it)
                if (sheet.getEquippedWeapon() != null && sheet.getEquippedWeapon().getName().equals(selected)) {
                    return; // Already equipped
                }
                // Check secondary weapon slot
                if (sheet.getEquippedSecondary() != null && sheet.getEquippedSecondary().getName().equals(selected)) {
                    sheet.equipPrimaryWeapon(sheet.getEquippedSecondary());
                    save();
                    return;
                }
                // Find in inventory
                for (Item item : sheet.getInventory()) {
                    if (item.getName().equals(selected) && item instanceof Weapon) {
                        sheet.equipPrimaryWeapon((Weapon) item);
                        save();
                        break;
                    }
                }
            }
        }
    }

    private void updateSecondary() {
        if (updatingDisplay) return;
        String selected = secondaryWeapon.getSelectionModel().getSelectedItem();
        if (selected != null) {
            if (selected.equals("None")) {
                sheet.equipSecondaryWeapon(null);
                save();
            } else {
                // Check if it's the currently equipped secondary weapon (same name means keep it)
                if (sheet.getEquippedSecondary() != null && sheet.getEquippedSecondary().getName().equals(selected)) {
                    return; // Already equipped
                }
                // Check primary weapon slot
                if (sheet.getEquippedWeapon() != null && sheet.getEquippedWeapon().getName().equals(selected)) {
                    sheet.equipSecondaryWeapon(sheet.getEquippedWeapon());
                    save();
                    return;
                }
                // Find in inventory
                for (Item item : sheet.getInventory()) {
                    if (item.getName().equals(selected) && item instanceof Weapon) {
                        sheet.equipSecondaryWeapon((Weapon) item);
                        save();
                        break;
                    }
                }
            }
        }
    }

    private void updateAccessory(int slot) {
        if (updatingDisplay) return;
        ComboBox<String> combo = slot == 0 ? accessory1 : (slot == 1 ? accessory2 : accessory3);
        String selected = combo.getSelectionModel().getSelectedItem();
        if (selected != null) {
            if (selected.equals("None")) {
                sheet.equipAccessory(slot, null);
                save();
            } else {
                // Check if it's the currently equipped accessory (same name means keep it)
                if (sheet.getAccessory(slot) != null && sheet.getAccessory(slot).getName().equals(selected)) {
                    return; // Already equipped
                }
                // Check other accessory slots
                for (int i = 0; i < 3; i++) {
                    if (i != slot && sheet.getAccessory(i) != null && sheet.getAccessory(i).getName().equals(selected)) {
                        sheet.equipAccessory(slot, sheet.getAccessory(i));
                        save();
                        return;
                    }
                }
                // Find in inventory
                for (Item item : sheet.getInventory()) {
                    if (item.getName().equals(selected) && item instanceof Accessory) {
                        sheet.equipAccessory(slot, (Accessory) item);
                        save();
                        break;
                    }
                }
            }
        }
    }

    /**
     * Sync menu item states to the character sheet's status list
     */
    private void syncStatusesToSheet() {
        sheet.clearStatusWithoutSave();
        for (Map.Entry<String, CheckMenuItem> entry : statusMenuItems.entrySet()) {
            if (entry.getValue().isSelected()) {
                sheet.addStatusWithoutSave(new Status(entry.getKey()));
            }
        }
        sheet.save();
    }

    /**
     * Update the status menu button text to show active statuses
     */
    private void updateStatusMenuText() {
        java.util.List<String> active = new java.util.ArrayList<>();
        for (Map.Entry<String, CheckMenuItem> entry : statusMenuItems.entrySet()) {
            if (entry.getValue().isSelected()) {
                active.add(entry.getKey());
            }
        }
        if (active.isEmpty()) {
            statusMenu.setText("None");
        } else if (active.size() <= 2) {
            statusMenu.setText(String.join(", ", active));
        } else {
            statusMenu.setText(active.get(0) + " +" + (active.size() - 1));
        }
    }

    private void save() {
        sheet.save();
        updateDisplay();
    }

    public CharSheet getCharSheet() {
        return sheet;
    }

    /**
     * Update bonus label with proper formatting and coloring
     * Positive: green with + prefix, Negative: red with - prefix, Zero: gray
     */
    private void updateBonusLabel(Label label, int value) {
        if (value > 0) {
            label.setText("+" + value);
            label.setStyle("-fx-text-fill: #4ec9b0;"); // Green for positive
        } else if (value < 0) {
            label.setText(String.valueOf(value)); // Already has minus sign
            label.setStyle("-fx-text-fill: #d75f5f;"); // Red for negative
        } else {
            label.setText("0");
            label.setStyle("-fx-text-fill: #808080;"); // Gray for zero
        }
    }
}
