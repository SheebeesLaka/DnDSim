package UI;

import EntityRes.*;
import Objects.TerrainObject;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.ArrayList;
import java.util.List;

public class AssetEditorView {

    private final AppController appController;
    private final BorderPane root;
    private TabPane mainTabs;
    private TabPane itemTabs;
    private HBox itemButtonPanel;
    private HBox terrainButtonPanel;
    private HBox spellButtonPanel;
    private FlowPane terrainPane;
    private FlowPane spellPane;
    
    // Item data
    private ArrayList<Weapon> weapons = new ArrayList<>();
    private ArrayList<Accessory> accessories = new ArrayList<>();
    private ArrayList<Consumable> consumables = new ArrayList<>();
    private ArrayList<Ammunition> ammunition = new ArrayList<>();
    private ArrayList<CraftingItem> craftingItems = new ArrayList<>();
    private ArrayList<KeyItem> keyItems = new ArrayList<>();
    
    private static final String[] ATTRIBUTE_NAMES = {"STR", "DEX", "CON", "INT", "WIS", "CHA"};
    private static final String[] CRAFTING_CATEGORIES = {"Material", "Component", "Reagent", "Miscellaneous"};
    private static final String[] DICE_TYPES = {"d4", "d6", "d8", "d10", "d12", "d20"};
    private static final String[] STAT_TYPES = {"STRENGTH", "DEXTERITY", "CONSTITUTION", "INTELLIGENCE", "WISDOM", "CHARISMA"};

    public AssetEditorView(AppController appController) {
        this.appController = appController;
        
        root = new BorderPane();
        root.getStyleClass().add("panel-dark");
        root.setPadding(new Insets(10));
        
        // Top panel with back button and contextual add buttons
        VBox topContainer = new VBox();
        topContainer.setStyle("-fx-border-color: #505052; -fx-border-width: 0 0 1 0;");
        
        HBox backPanel = new HBox(10);
        backPanel.setPadding(new Insets(10, 10, 5, 10));
        backPanel.setAlignment(Pos.CENTER_LEFT);
        Button backBtn = new Button("Back");
        backBtn.getStyleClass().add("button");
        backBtn.setOnAction(e -> handleBack());
        backPanel.getChildren().add(backBtn);
        
        // Item add buttons (shown when Items tab selected)
        itemButtonPanel = createItemButtonPanel();
        
        // Terrain add button (shown when Terrain tab selected)
        terrainButtonPanel = createTerrainButtonPanel();
        
        // Spell add button (shown when Spells tab selected)
        spellButtonPanel = new HBox(8);
        spellButtonPanel.setPadding(new Insets(5, 10, 10, 10));
        spellButtonPanel.setAlignment(Pos.CENTER_LEFT);
        Button addSpellBtn = new Button("+ Spell");
        addSpellBtn.getStyleClass().add("button-primary");
        addSpellBtn.setOnAction(e -> showSpellDialog(null));
        spellButtonPanel.getChildren().add(addSpellBtn);

        topContainer.getChildren().addAll(backPanel, itemButtonPanel, terrainButtonPanel, spellButtonPanel);
        root.setTop(topContainer);
        
        // Main tabs for Items vs Terrain
        mainTabs = new TabPane();
        mainTabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        
        // Items tab
        Tab itemsTab = new Tab("Items");
        itemsTab.setContent(createItemsContent());
        mainTabs.getTabs().add(itemsTab);
        
        // Terrain tab
        Tab terrainTab = new Tab("Terrain");
        terrainTab.setContent(createTerrainContent());
        mainTabs.getTabs().add(terrainTab);

        // Spells tab
        Tab spellsTab = new Tab("Spells");
        spellsTab.setContent(createSpellsContent());
        mainTabs.getTabs().add(spellsTab);

        // Show/hide contextual buttons based on selected tab
        mainTabs.getSelectionModel().selectedItemProperty().addListener((obs, oldTab, newTab) -> {
            itemButtonPanel.setVisible(newTab == itemsTab);
            itemButtonPanel.setManaged(newTab == itemsTab);
            terrainButtonPanel.setVisible(newTab == terrainTab);
            terrainButtonPanel.setManaged(newTab == terrainTab);
            spellButtonPanel.setVisible(newTab == spellsTab);
            spellButtonPanel.setManaged(newTab == spellsTab);
        });

        // Initial visibility
        terrainButtonPanel.setVisible(false);
        terrainButtonPanel.setManaged(false);
        spellButtonPanel.setVisible(false);
        spellButtonPanel.setManaged(false);
        
        root.setCenter(mainTabs);
    }

    private HBox createItemButtonPanel() {
        HBox panel = new HBox(8);
        panel.setPadding(new Insets(5, 10, 10, 10));
        panel.setAlignment(Pos.CENTER_LEFT);
        
        Button addWeaponBtn = new Button("+ Weapon");
        addWeaponBtn.getStyleClass().add("button-primary");
        addWeaponBtn.setOnAction(e -> addNewWeapon());
        
        Button addAccessoryBtn = new Button("+ Accessory");
        addAccessoryBtn.getStyleClass().add("button-primary");
        addAccessoryBtn.setOnAction(e -> addNewAccessory());
        
        Button addConsumableBtn = new Button("+ Consumable");
        addConsumableBtn.getStyleClass().add("button-primary");
        addConsumableBtn.setOnAction(e -> addNewConsumable());
        
        Button addAmmoBtn = new Button("+ Ammo");
        addAmmoBtn.getStyleClass().add("button-primary");
        addAmmoBtn.setOnAction(e -> addNewAmmunition());
        
        Button addCraftingBtn = new Button("+ Crafting");
        addCraftingBtn.getStyleClass().add("button-primary");
        addCraftingBtn.setOnAction(e -> addNewCraftingItem());
        
        Button addKeyItemBtn = new Button("+ Key Item");
        addKeyItemBtn.getStyleClass().add("button-primary");
        addKeyItemBtn.setOnAction(e -> addNewKeyItem());
        
        panel.getChildren().addAll(addWeaponBtn, addAccessoryBtn, addConsumableBtn, 
                                   addAmmoBtn, addCraftingBtn, addKeyItemBtn);
        return panel;
    }

    private HBox createTerrainButtonPanel() {
        HBox panel = new HBox(8);
        panel.setPadding(new Insets(5, 10, 10, 10));
        panel.setAlignment(Pos.CENTER_LEFT);
        
        Button addBtn = new Button("+ Add Terrain");
        addBtn.getStyleClass().add("button-primary");
        addBtn.setOnAction(e -> addNewTerrain());
        
        panel.getChildren().add(addBtn);
        return panel;
    }

    // ==================== ITEMS ====================

    private VBox createItemsContent() {
        VBox content = new VBox();
        
        loadItems();
        itemTabs = new TabPane();
        itemTabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        refreshItemDisplay();
        VBox.setVgrow(itemTabs, Priority.ALWAYS);
        
        content.getChildren().add(itemTabs);
        return content;
    }

    private void loadItems() {
        ItemDatabase db = ItemDatabase.getInstance();
        weapons.clear();
        accessories.clear();
        consumables.clear();
        ammunition.clear();
        craftingItems.clear();
        keyItems.clear();
        
        weapons.addAll(db.getAllWeapons().values());
        accessories.addAll(db.getAllAccessories().values());
        consumables.addAll(db.getAllConsumables().values());
        ammunition.addAll(db.getAllAmmunition().values());
        craftingItems.addAll(db.getAllCraftingItems().values());
        keyItems.addAll(db.getAllKeyItems().values());
    }

    private void refreshItemDisplay() {
        int selectedIndex = itemTabs.getSelectionModel().getSelectedIndex();
        if (selectedIndex < 0) selectedIndex = 0;
        
        loadItems();
        itemTabs.getTabs().clear();
        
        itemTabs.getTabs().add(new Tab("Weapons", createItemPanel(weapons, this::createWeaponCard)));
        itemTabs.getTabs().add(new Tab("Accessories", createItemPanel(accessories, this::createAccessoryCard)));
        itemTabs.getTabs().add(new Tab("Consumables", createConsumablesPanel()));
        itemTabs.getTabs().add(new Tab("Key Items", createItemPanel(keyItems, this::createKeyItemCard)));
        
        itemTabs.getSelectionModel().select(selectedIndex);
    }

    private ScrollPane createConsumablesPanel() {
        FlowPane flowPane = new FlowPane(10, 10);
        flowPane.setPadding(new Insets(10));
        flowPane.getStyleClass().add("panel");
        
        for (Consumable c : consumables) {
            flowPane.getChildren().add(createConsumableCard(c));
        }
        for (Ammunition a : ammunition) {
            flowPane.getChildren().add(createAmmunitionCard(a));
        }
        for (CraftingItem ci : craftingItems) {
            flowPane.getChildren().add(createCraftingCard(ci));
        }
        
        ScrollPane scroll = new ScrollPane(flowPane);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel");
        return scroll;
    }

    @FunctionalInterface
    private interface CardCreator<T> {
        VBox create(T item);
    }

    private <T> ScrollPane createItemPanel(ArrayList<T> items, CardCreator<T> cardCreator) {
        FlowPane flowPane = new FlowPane(10, 10);
        flowPane.setPadding(new Insets(10));
        flowPane.getStyleClass().add("panel");
        
        for (T item : items) {
            flowPane.getChildren().add(cardCreator.create(item));
        }
        
        ScrollPane scroll = new ScrollPane(flowPane);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel");
        return scroll;
    }

    private VBox createWeaponCard(Weapon weapon) {
        return CardUtils.createWeaponCard(weapon, () -> editWeapon(weapon), () -> deleteItem(weapon));
    }

    private VBox createAccessoryCard(Accessory accessory) {
        return CardUtils.createAccessoryCard(accessory, () -> editAccessory(accessory), () -> deleteItem(accessory));
    }

    private VBox createConsumableCard(Consumable item) {
        return CardUtils.createConsumableCard(item, () -> editConsumable(item), () -> deleteItem(item));
    }

    private VBox createAmmunitionCard(Ammunition item) {
        return CardUtils.createAmmunitionCard(item, () -> editAmmunition(item), () -> deleteItem(item));
    }

    private VBox createCraftingCard(CraftingItem item) {
        return CardUtils.createCraftingItemCard(item, () -> editCraftingItem(item), () -> deleteItem(item));
    }

    private VBox createKeyItemCard(KeyItem item) {
        return CardUtils.createKeyItemCard(item, () -> editKeyItem(item), () -> deleteItem(item));
    }

    // ==================== SPELLS ====================

    private VBox createSpellsContent() {
        VBox content = new VBox();
        spellPane = new FlowPane(10, 10);
        spellPane.setPadding(new Insets(10));
        spellPane.getStyleClass().add("panel");

        ScrollPane scroll = new ScrollPane(spellPane);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel");
        VBox.setVgrow(scroll, Priority.ALWAYS);

        refreshSpellDisplay();
        content.getChildren().add(scroll);
        return content;
    }

    private void refreshSpellDisplay() {
        spellPane.getChildren().clear();
        for (Spell spell : SpellDatabase.getInstance().getAllSpells()) {
            spellPane.getChildren().add(CardUtils.createSpellCard(spell,
                () -> showSpellDialog(spell), () -> deleteSpell(spell)));
        }
    }

    private void deleteSpell(Spell spell) {
        DialogUtils.confirm("Delete Spell", null, "Delete " + spell.getName() + "?\nCharacters who know it will simply stop seeing it.")
            .ifPresent(response -> {
                if (response == ButtonType.OK) {
                    SpellDatabase.getInstance().deleteSpell(spell);
                    refreshSpellDisplay();
                }
            });
    }

    /** Add/edit a spell (existing == null creates a new one). */
    private void showSpellDialog(Spell existing) {
        SpellEditorDialog.showAndWait(appController.getPrimaryStage(), existing, this::refreshSpellDisplay);
    }

    // ==================== TERRAIN ====================

    private VBox createTerrainContent() {
        VBox content = new VBox();
        
        terrainPane = new FlowPane(10, 10);
        terrainPane.setPadding(new Insets(10));
        terrainPane.getStyleClass().add("panel");
        
        ScrollPane scroll = new ScrollPane(terrainPane);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel");
        VBox.setVgrow(scroll, Priority.ALWAYS);
        
        refreshTerrainDisplay();
        
        content.getChildren().add(scroll);
        return content;
    }

    private void refreshTerrainDisplay() {
        terrainPane.getChildren().clear();
        
        List<TerrainObject> terrains = TerrainDatabase.getInstance().getAllTerrains();
        for (TerrainObject terrain : terrains) {
            terrainPane.getChildren().add(createTerrainCard(terrain));
        }
    }

    private VBox createTerrainCard(TerrainObject terrain) {
        CardUtils.CardStyle style = CardUtils.CardStyle.NEUTRAL;
        VBox card = CardUtils.createBaseCard(style);
        card.setMinWidth(160);
        card.setMaxWidth(200);

        HBox header = CardUtils.createCardHeader(terrain.getType(), style,
            IconUtils.createIcon(IconUtils.Icon.MAP, 18, style.accentColor));

        StackPane thumb = new StackPane(SpriteUtils.createTerrainSprite(terrain, 64));
        thumb.setPrefHeight(72);
        thumb.setAlignment(Pos.CENTER);

        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addTerrainDetailRow(stats, "HP", String.valueOf(terrain.getHealth()));
        addTerrainDetailRow(stats, "Collision", terrain.hasCollision() ? "Yes" : "No");
        if (!terrain.hasCollision()) {
            addTerrainDetailRow(stats, "Layer", terrain.isEntityAboveTerrain() ? "Above" : "Below");
        }

        Button editBtn = new Button("Edit");
        editBtn.getStyleClass().add("button");
        editBtn.setStyle("-fx-padding: 4 10 4 10; -fx-font-size: 11px;");
        editBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.EDIT, 12, "#dcdcdc"));
        editBtn.setOnAction(e -> editTerrain(terrain));

        Button deleteBtn = new Button("Delete");
        deleteBtn.getStyleClass().add("button-danger");
        deleteBtn.setStyle("-fx-padding: 4 10 4 10; -fx-font-size: 11px;");
        deleteBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 12, "#fff"));
        deleteBtn.setOnAction(e -> deleteTerrain(terrain));

        HBox actions = CardUtils.createCardFooter(editBtn, deleteBtn);

        card.getChildren().addAll(header, thumb, stats, actions);
        CardUtils.addCardHoverEffect(card);

        return card;
    }

    private void addTerrainDetailRow(VBox container, String label, String value) {
        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);
        Label labelNode = new Label(label + ":");
        labelNode.getStyleClass().add("card-detail-label");
        labelNode.setMinWidth(60);
        Label valueNode = new Label(value);
        valueNode.getStyleClass().add("card-detail-value");
        row.getChildren().addAll(labelNode, valueNode);
        container.getChildren().add(row);
    }

    // ==================== ITEM DIALOGS ====================

    private void addNewWeapon() {
        Stage dialog = createDialog("Add Weapon", 400, 650);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(4)));
        
        // Dice tier combos
        ComboBox<String> tier1Combo = new ComboBox<>();
        tier1Combo.getItems().addAll(DICE_TYPES);
        tier1Combo.getSelectionModel().select("d6");
        
        ComboBox<String> tier2Combo = new ComboBox<>();
        tier2Combo.getItems().addAll(DICE_TYPES);
        tier2Combo.getSelectionModel().select("d6");
        
        ComboBox<String> tier3Combo = new ComboBox<>();
        tier3Combo.getItems().addAll(DICE_TYPES);
        tier3Combo.getSelectionModel().select("d8");
        
        // Stat type combo
        ComboBox<String> statCombo = new ComboBox<>();
        statCombo.getItems().addAll(STAT_TYPES);
        statCombo.getSelectionModel().selectFirst();
        
        // Ammo type (empty for melee)
        TextField ammoTypeField = new TextField();
        ammoTypeField.setPromptText("Leave empty for melee");
        
        TextField strField = new TextField("0");
        TextField dexField = new TextField("0");
        TextField conField = new TextField("0");
        TextField intField = new TextField("0");
        TextField wisField = new TextField("0");
        TextField chaField = new TextField("0");
        
        // Abilities list
        ArrayList<ItemAbility> weaponAbilities = new ArrayList<>();
        VBox abilityEditor = createAbilityEditorSection(weaponAbilities);
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Tier 1 Die:"), 0, row); grid.add(tier1Combo, 1, row++);
        grid.add(new Label("Tier 2 Die:"), 0, row); grid.add(tier2Combo, 1, row++);
        grid.add(new Label("Tier 3 Die:"), 0, row); grid.add(tier3Combo, 1, row++);
        grid.add(new Label("Stat Type:"), 0, row); grid.add(statCombo, 1, row++);
        grid.add(new Label("Ammo Type:"), 0, row); grid.add(ammoTypeField, 1, row++);
        grid.add(new Label("STR Mod:"), 0, row); grid.add(strField, 1, row++);
        grid.add(new Label("DEX Mod:"), 0, row); grid.add(dexField, 1, row++);
        grid.add(new Label("CON Mod:"), 0, row); grid.add(conField, 1, row++);
        grid.add(new Label("INT Mod:"), 0, row); grid.add(intField, 1, row++);
        grid.add(new Label("WIS Mod:"), 0, row); grid.add(wisField, 1, row++);
        grid.add(new Label("CHA Mod:"), 0, row); grid.add(chaField, 1, row++);
        grid.add(abilityEditor, 0, row++, 2, 1);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            String[] damageDice = {tier1Combo.getValue(), tier2Combo.getValue(), tier3Combo.getValue()};
            String statType = statCombo.getValue();
            String ammoType = ammoTypeField.getText().trim();
            int[] attrs = {parseInt(strField), parseInt(dexField), parseInt(conField), parseInt(intField), parseInt(wisField), parseInt(chaField)};
            if (!name.isEmpty()) {
                Weapon weapon = new Weapon(name, "Weapon", damageDice, statType, 
                        ammoType.isEmpty() ? null : ammoType, attrs);
                weapon.setColor(toHexColor(colorPicker.getValue()));
                weapon.setAbilities(weaponAbilities);
                ItemDatabase.getInstance().saveItem(weapon);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 400, 650));
        dialog.showAndWait();
    }

    private void addNewAccessory() {
        Stage dialog = createDialog("Add Accessory", 380, 500);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(9)));
        TextField defenseField = new TextField("1");
        TextField strField = new TextField("0");
        TextField dexField = new TextField("0");
        TextField conField = new TextField("0");
        TextField intField = new TextField("0");
        TextField wisField = new TextField("0");
        TextField chaField = new TextField("0");
        
        // Abilities list
        ArrayList<ItemAbility> accessoryAbilities = new ArrayList<>();
        VBox abilityEditor = createAbilityEditorSection(accessoryAbilities);
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Defense:"), 0, row); grid.add(defenseField, 1, row++);
        grid.add(new Label("STR Mod:"), 0, row); grid.add(strField, 1, row++);
        grid.add(new Label("DEX Mod:"), 0, row); grid.add(dexField, 1, row++);
        grid.add(new Label("CON Mod:"), 0, row); grid.add(conField, 1, row++);
        grid.add(new Label("INT Mod:"), 0, row); grid.add(intField, 1, row++);
        grid.add(new Label("WIS Mod:"), 0, row); grid.add(wisField, 1, row++);
        grid.add(new Label("CHA Mod:"), 0, row); grid.add(chaField, 1, row++);
        grid.add(abilityEditor, 0, row++, 2, 1);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            int defense = Integer.parseInt(defenseField.getText());
            int[] attrs = {parseInt(strField), parseInt(dexField), parseInt(conField), parseInt(intField), parseInt(wisField), parseInt(chaField)};
            if (!name.isEmpty()) {
                Accessory accessory = new Accessory(name, "Accessory", defense, attrs);
                accessory.setColor(toHexColor(colorPicker.getValue()));
                accessory.setAbilities(accessoryAbilities);
                ItemDatabase.getInstance().saveItem(accessory);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 380, 500));
        dialog.showAndWait();
    }

    private void addNewConsumable() {
        Stage dialog = createDialog("Add Consumable", 300, 150);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(7)));
        TextField healField = new TextField("10");
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Heal Amount:"), 0, row); grid.add(healField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            int healAmount = Integer.parseInt(healField.getText());
            if (!name.isEmpty()) {
                Consumable item = new Consumable(name, "Consumable", toHexColor(colorPicker.getValue()), healAmount, null);
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 300, 150));
        dialog.showAndWait();
    }

    private void addNewAmmunition() {
        Stage dialog = createDialog("Add Ammunition", 320, 150);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(5)));
        TextField ammoTypeField = new TextField("12 Gauge");
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Ammo Type:"), 0, row); grid.add(ammoTypeField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                Ammunition item = new Ammunition(name, "Ammunition", toHexColor(colorPicker.getValue()), ammoTypeField.getText());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 150));
        dialog.showAndWait();
    }

    private void addNewCraftingItem() {
        Stage dialog = createDialog("Add Crafting Item", 320, 180);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(14)));
        ComboBox<String> categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll(CRAFTING_CATEGORIES);
        categoryCombo.getSelectionModel().selectFirst();
        TextField descField = new TextField();
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Category:"), 0, row); grid.add(categoryCombo, 1, row++);
        grid.add(new Label("Description:"), 0, row); grid.add(descField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                CraftingItem item = new CraftingItem(name, "Crafting", toHexColor(colorPicker.getValue()),
                        categoryCombo.getSelectionModel().getSelectedItem(), descField.getText());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 180));
        dialog.showAndWait();
    }

    private void addNewKeyItem() {
        Stage dialog = createDialog("Add Key Item", 320, 180);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField();
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(6)));
        TextField descField = new TextField();
        CheckBox questCheck = new CheckBox("Quest Related");
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Description:"), 0, row); grid.add(descField, 1, row++);
        grid.add(new Label(""), 0, row); grid.add(questCheck, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                KeyItem item = new KeyItem(name, "Key Item", toHexColor(colorPicker.getValue()),
                        descField.getText(), questCheck.isSelected());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 180));
        dialog.showAndWait();
    }

    // ===== EDIT DIALOGS =====

    private void editWeapon(Weapon weapon) {
        Stage dialog = createDialog("Edit Weapon", 400, 650);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(weapon.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(weapon.getColor()));
        
        // Get existing dice values
        String[] dice = weapon.getDamageDice();
        
        // Dice tier combos
        ComboBox<String> tier1Combo = new ComboBox<>();
        tier1Combo.getItems().addAll(DICE_TYPES);
        tier1Combo.getSelectionModel().select(dice[0]);
        
        ComboBox<String> tier2Combo = new ComboBox<>();
        tier2Combo.getItems().addAll(DICE_TYPES);
        tier2Combo.getSelectionModel().select(dice[1]);
        
        ComboBox<String> tier3Combo = new ComboBox<>();
        tier3Combo.getItems().addAll(DICE_TYPES);
        tier3Combo.getSelectionModel().select(dice[2]);
        
        // Stat type combo
        ComboBox<String> statCombo = new ComboBox<>();
        statCombo.getItems().addAll(STAT_TYPES);
        statCombo.getSelectionModel().select(weapon.getStatType());
        
        // Ammo type
        TextField ammoTypeField = new TextField(weapon.getAmmoType() != null ? weapon.getAmmoType() : "");
        ammoTypeField.setPromptText("Leave empty for melee");
        
        int[] attrs = weapon.getModifiedAttributes();
        TextField strField = new TextField(String.valueOf(attrs[0]));
        TextField dexField = new TextField(String.valueOf(attrs[1]));
        TextField conField = new TextField(String.valueOf(attrs.length > 2 ? attrs[2] : 0));
        TextField intField = new TextField(String.valueOf(attrs.length > 3 ? attrs[3] : 0));
        TextField wisField = new TextField(String.valueOf(attrs.length > 4 ? attrs[4] : 0));
        TextField chaField = new TextField(String.valueOf(attrs.length > 5 ? attrs[5] : 0));
        
        // Abilities list - copy existing abilities
        ArrayList<ItemAbility> weaponAbilities = new ArrayList<>(weapon.getAbilities());
        VBox abilityEditor = createAbilityEditorSection(weaponAbilities);
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Tier 1 Die:"), 0, row); grid.add(tier1Combo, 1, row++);
        grid.add(new Label("Tier 2 Die:"), 0, row); grid.add(tier2Combo, 1, row++);
        grid.add(new Label("Tier 3 Die:"), 0, row); grid.add(tier3Combo, 1, row++);
        grid.add(new Label("Stat Type:"), 0, row); grid.add(statCombo, 1, row++);
        grid.add(new Label("Ammo Type:"), 0, row); grid.add(ammoTypeField, 1, row++);
        grid.add(new Label("STR Mod:"), 0, row); grid.add(strField, 1, row++);
        grid.add(new Label("DEX Mod:"), 0, row); grid.add(dexField, 1, row++);
        grid.add(new Label("CON Mod:"), 0, row); grid.add(conField, 1, row++);
        grid.add(new Label("INT Mod:"), 0, row); grid.add(intField, 1, row++);
        grid.add(new Label("WIS Mod:"), 0, row); grid.add(wisField, 1, row++);
        grid.add(new Label("CHA Mod:"), 0, row); grid.add(chaField, 1, row++);
        grid.add(abilityEditor, 0, row++, 2, 1);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            String[] damageDice = {tier1Combo.getValue(), tier2Combo.getValue(), tier3Combo.getValue()};
            String statType = statCombo.getValue();
            String ammoType = ammoTypeField.getText().trim();
            int[] newAttrs = {parseInt(strField), parseInt(dexField), parseInt(conField), parseInt(intField), parseInt(wisField), parseInt(chaField)};
            if (!name.isEmpty()) {
                weapon.setName(name);
                weapon.setDamageDice(damageDice);
                weapon.setStatType(statType);
                weapon.setAmmoType(ammoType.isEmpty() ? null : ammoType);
                weapon.setColor(toHexColor(colorPicker.getValue()));
                weapon.setModifiedAttributes(newAttrs);
                weapon.setAbilities(weaponAbilities);
                ItemDatabase.getInstance().saveItem(weapon);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 400, 650));
        dialog.showAndWait();
    }

    private void editAccessory(Accessory accessory) {
        Stage dialog = createDialog("Edit Accessory", 380, 500);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(accessory.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(accessory.getColor()));
        TextField defenseField = new TextField(String.valueOf(accessory.getDefense()));
        int[] attrs = accessory.getModifiedAttributes();
        TextField strField = new TextField(String.valueOf(attrs[0]));
        TextField dexField = new TextField(String.valueOf(attrs[1]));
        TextField conField = new TextField(String.valueOf(attrs.length > 2 ? attrs[2] : 0));
        TextField intField = new TextField(String.valueOf(attrs.length > 3 ? attrs[3] : 0));
        TextField wisField = new TextField(String.valueOf(attrs.length > 4 ? attrs[4] : 0));
        TextField chaField = new TextField(String.valueOf(attrs.length > 5 ? attrs[5] : 0));
        
        // Abilities list - copy existing abilities
        ArrayList<ItemAbility> accessoryAbilities = new ArrayList<>(accessory.getAbilities());
        VBox abilityEditor = createAbilityEditorSection(accessoryAbilities);
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Defense:"), 0, row); grid.add(defenseField, 1, row++);
        grid.add(new Label("STR Mod:"), 0, row); grid.add(strField, 1, row++);
        grid.add(new Label("DEX Mod:"), 0, row); grid.add(dexField, 1, row++);
        grid.add(new Label("CON Mod:"), 0, row); grid.add(conField, 1, row++);
        grid.add(new Label("INT Mod:"), 0, row); grid.add(intField, 1, row++);
        grid.add(new Label("WIS Mod:"), 0, row); grid.add(wisField, 1, row++);
        grid.add(new Label("CHA Mod:"), 0, row); grid.add(chaField, 1, row++);
        grid.add(abilityEditor, 0, row++, 2, 1);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            int defense = Integer.parseInt(defenseField.getText());
            int[] newAttrs = {parseInt(strField), parseInt(dexField), parseInt(conField), parseInt(intField), parseInt(wisField), parseInt(chaField)};
            if (!name.isEmpty()) {
                accessory.setName(name);
                accessory.setDefense(defense);
                accessory.setColor(toHexColor(colorPicker.getValue()));
                accessory.setModifiedAttributes(newAttrs);
                accessory.setAbilities(accessoryAbilities);
                ItemDatabase.getInstance().saveItem(accessory);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 380, 500));
        dialog.showAndWait();
    }

    private void editConsumable(Consumable item) {
        Stage dialog = createDialog("Edit Consumable", 300, 150);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(item.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(item.getColor()));
        TextField healField = new TextField(String.valueOf(item.getHealAmount()));
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Heal Amount:"), 0, row); grid.add(healField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            int healAmount = Integer.parseInt(healField.getText());
            if (!name.isEmpty()) {
                item.setName(name);
                item.setColor(toHexColor(colorPicker.getValue()));
                item.setHealAmount(healAmount);
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 300, 150));
        dialog.showAndWait();
    }

    private void editAmmunition(Ammunition item) {
        Stage dialog = createDialog("Edit Ammunition", 320, 150);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(item.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(item.getColor()));
        TextField ammoTypeField = new TextField(item.getAmmoType());
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Ammo Type:"), 0, row); grid.add(ammoTypeField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                item.setName(name);
                item.setColor(toHexColor(colorPicker.getValue()));
                item.setAmmoType(ammoTypeField.getText());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 150));
        dialog.showAndWait();
    }

    private void editCraftingItem(CraftingItem item) {
        Stage dialog = createDialog("Edit Crafting Item", 320, 180);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(item.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(item.getColor()));
        ComboBox<String> categoryCombo = new ComboBox<>();
        categoryCombo.getItems().addAll(CRAFTING_CATEGORIES);
        for (int i = 0; i < CRAFTING_CATEGORIES.length; i++) {
            if (CRAFTING_CATEGORIES[i].equals(item.getCraftingCategory())) {
                categoryCombo.getSelectionModel().select(i);
                break;
            }
        }
        TextField descField = new TextField(item.getDescription() != null ? item.getDescription() : "");
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Category:"), 0, row); grid.add(categoryCombo, 1, row++);
        grid.add(new Label("Description:"), 0, row); grid.add(descField, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                item.setName(name);
                item.setColor(toHexColor(colorPicker.getValue()));
                item.setCraftingCategory(categoryCombo.getSelectionModel().getSelectedItem());
                item.setDescription(descField.getText());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 180));
        dialog.showAndWait();
    }

    private void editKeyItem(KeyItem item) {
        Stage dialog = createDialog("Edit Key Item", 320, 180);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(item.getName());
        ColorPicker colorPicker = new ColorPicker(Color.web(item.getColor()));
        TextField descField = new TextField(item.getDescription() != null ? item.getDescription() : "");
        CheckBox questCheck = new CheckBox("Quest Related");
        questCheck.setSelected(item.isQuestRelated());
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label("Description:"), 0, row); grid.add(descField, 1, row++);
        grid.add(new Label(""), 0, row); grid.add(questCheck, 1, row++);
        
        addDialogButtons(grid, row, dialog, () -> {
            String name = nameField.getText();
            if (!name.isEmpty()) {
                item.setName(name);
                item.setColor(toHexColor(colorPicker.getValue()));
                item.setDescription(descField.getText());
                item.setQuestRelated(questCheck.isSelected());
                ItemDatabase.getInstance().saveItem(item);
                return true;
            }
            return false;
        }, this::refreshItemDisplay);
        
        dialog.setScene(createDialogScene(grid, 320, 180));
        dialog.showAndWait();
    }

    // ==================== TERRAIN DIALOGS ====================

    private void addNewTerrain() {
        Stage dialog = createDialog("Add Terrain", 300, 300);
        GridPane grid = createDialogGrid();

        TextField typeField = new TextField();
        TextField hpField = new TextField("10");
        ColorPicker colorPicker = new ColorPicker(Color.web(ColorUtils.fromLegacyIndex(0)));
        CheckBox collisionCheck = new CheckBox("Collision (blocks entry)");
        collisionCheck.setSelected(true);

        // Layer only matters when collision is off - an entity can never
        // share a tile with colliding terrain, so there's nothing to layer
        Label layerLabel = new Label("Layer:");
        ComboBox<String> layerCombo = new ComboBox<>();
        layerCombo.getItems().addAll("Entity Above Terrain", "Entity Below Terrain");
        layerCombo.setValue("Entity Above Terrain");
        layerLabel.visibleProperty().bind(collisionCheck.selectedProperty().not());
        layerLabel.managedProperty().bind(layerLabel.visibleProperty());
        layerCombo.visibleProperty().bind(collisionCheck.selectedProperty().not());
        layerCombo.managedProperty().bind(layerCombo.visibleProperty());

        // Sprite picker
        final String[] spritePath = { null };
        HBox spritePickerContainer = new HBox();
        Runnable refreshSpritePicker = () -> {
            spritePickerContainer.getChildren().setAll(
                SpritePickerUtils.createCompactSpritePicker(
                    spritePath[0],
                    "terrain",
                    toHexColor(colorPicker.getValue()),
                    false,
                    newPath -> spritePath[0] = newPath,
                    dialog
                )
            );
        };
        refreshSpritePicker.run();
        colorPicker.setOnAction(e -> refreshSpritePicker.run());

        int row = 0;
        grid.add(new Label("Type:"), 0, row); grid.add(typeField, 1, row++);
        grid.add(new Label("HP:"), 0, row); grid.add(hpField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label(""), 0, row); grid.add(collisionCheck, 1, row++);
        grid.add(layerLabel, 0, row); grid.add(layerCombo, 1, row++);
        grid.add(new Label("Sprite:"), 0, row); grid.add(spritePickerContainer, 1, row++);

        addDialogButtons(grid, row, dialog, () -> {
            String type = typeField.getText();
            int hp = Integer.parseInt(hpField.getText());
            boolean collision = collisionCheck.isSelected();
            if (!type.isEmpty()) {
                TerrainObject newTerrain = new TerrainObject(0, 0, type, hp, toHexColor(colorPicker.getValue()), collision);
                newTerrain.setEntityAboveTerrain(layerCombo.getValue().equals("Entity Above Terrain"));
                newTerrain.setSpritePath(spritePath[0]);
                TerrainDatabase.getInstance().addTerrain(newTerrain);
                return true;
            }
            return false;
        }, this::refreshTerrainDisplay);

        dialog.setScene(createDialogScene(grid, 300, 300));
        dialog.showAndWait();
    }

    private void editTerrain(TerrainObject terrain) {
        Stage dialog = createDialog("Edit Terrain", 300, 300);
        GridPane grid = createDialogGrid();

        TextField typeField = new TextField(terrain.getType());
        TextField hpField = new TextField(String.valueOf(terrain.getHealth()));
        ColorPicker colorPicker = new ColorPicker(Color.web(terrain.getColor()));
        CheckBox collisionCheck = new CheckBox("Collision (blocks entry)");
        collisionCheck.setSelected(terrain.hasCollision());

        Label layerLabel = new Label("Layer:");
        ComboBox<String> layerCombo = new ComboBox<>();
        layerCombo.getItems().addAll("Entity Above Terrain", "Entity Below Terrain");
        layerCombo.setValue(terrain.isEntityAboveTerrain() ? "Entity Above Terrain" : "Entity Below Terrain");
        layerLabel.visibleProperty().bind(collisionCheck.selectedProperty().not());
        layerLabel.managedProperty().bind(layerLabel.visibleProperty());
        layerCombo.visibleProperty().bind(collisionCheck.selectedProperty().not());
        layerCombo.managedProperty().bind(layerCombo.visibleProperty());

        // Sprite picker
        final String[] spritePath = { terrain.getSpritePath() };
        HBox spritePickerContainer = new HBox();
        Runnable refreshSpritePicker = () -> {
            spritePickerContainer.getChildren().setAll(
                SpritePickerUtils.createCompactSpritePicker(
                    spritePath[0],
                    "terrain",
                    toHexColor(colorPicker.getValue()),
                    false,
                    newPath -> spritePath[0] = newPath,
                    dialog
                )
            );
        };
        refreshSpritePicker.run();
        colorPicker.setOnAction(e -> refreshSpritePicker.run());

        int row = 0;
        grid.add(new Label("Type:"), 0, row); grid.add(typeField, 1, row++);
        grid.add(new Label("HP:"), 0, row); grid.add(hpField, 1, row++);
        grid.add(new Label("Color:"), 0, row); grid.add(colorPicker, 1, row++);
        grid.add(new Label(""), 0, row); grid.add(collisionCheck, 1, row++);
        grid.add(layerLabel, 0, row); grid.add(layerCombo, 1, row++);
        grid.add(new Label("Sprite:"), 0, row); grid.add(spritePickerContainer, 1, row++);

        addDialogButtons(grid, row, dialog, () -> {
            String type = typeField.getText().trim();
            int hp = Integer.parseInt(hpField.getText());
            if (type.isEmpty()) {
                return false;
            }
            terrain.setType(type);
            terrain.setHealth(hp);
            terrain.setCollision(collisionCheck.isSelected());
            terrain.setEntityAboveTerrain(layerCombo.getValue().equals("Entity Above Terrain"));
            terrain.setColor(toHexColor(colorPicker.getValue()));
            terrain.setSpritePath(spritePath[0]);
            TerrainDatabase.getInstance().saveTerrain(terrain);
            return true;
        }, this::refreshTerrainDisplay);

        dialog.setScene(createDialogScene(grid, 300, 300));
        dialog.showAndWait();
    }

    private void deleteTerrain(TerrainObject terrain) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Terrain");
        confirm.setHeaderText(null);
        confirm.setContentText("Delete " + terrain.getType() + "?");
        DialogUtils.theme(confirm);

        confirm.showAndWait().ifPresent(response -> {
            if (response == ButtonType.OK) {
                TerrainDatabase.getInstance().deleteTerrain(terrain);
                refreshTerrainDisplay();
            }
        });
    }

    // ==================== HELPERS ====================

    /**
     * Creates an ability editor section with a list of abilities and add/edit/remove buttons.
     * @param abilities The list of abilities to edit (will be modified in place)
     * @return A VBox containing the ability editor UI
     */
    private VBox createAbilityEditorSection(ArrayList<ItemAbility> abilities) {
        VBox container = new VBox(5);
        container.setPadding(new Insets(5));
        
        Label header = new Label("Abilities");
        header.setStyle("-fx-font-weight: bold; -fx-text-fill: #dcdcaa;");
        
        ListView<ItemAbility> abilityList = new ListView<>();
        abilityList.setPrefHeight(100);
        abilityList.getItems().addAll(abilities);
        abilityList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(ItemAbility item, boolean empty) {
                super.updateItem(item, empty);
                setText(empty || item == null ? null : item.toString());
            }
        });
        
        HBox buttons = new HBox(5);
        Button addBtn = new Button();
        addBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.PLUS, 12, "#dcdcdc"));
        addBtn.getStyleClass().add("button");
        addBtn.setOnAction(e -> {
            showAbilityDialog(null, ability -> {
                abilities.add(ability);
                abilityList.getItems().add(ability);
            });
        });
        
        Button editBtn = new Button("Edit");
        editBtn.getStyleClass().add("button");
        editBtn.setOnAction(e -> {
            ItemAbility selected = abilityList.getSelectionModel().getSelectedItem();
            if (selected != null) {
                int index = abilities.indexOf(selected);
                showAbilityDialog(selected, ability -> {
                    abilities.set(index, ability);
                    abilityList.getItems().set(index, ability);
                });
            }
        });
        
        Button removeBtn = new Button();
        removeBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.MINUS, 12, "#dcdcdc"));
        removeBtn.getStyleClass().add("button");
        removeBtn.setOnAction(e -> {
            ItemAbility selected = abilityList.getSelectionModel().getSelectedItem();
            if (selected != null) {
                abilities.remove(selected);
                abilityList.getItems().remove(selected);
            }
        });
        
        buttons.getChildren().addAll(addBtn, editBtn, removeBtn);
        container.getChildren().addAll(header, abilityList, buttons);
        
        return container;
    }
    
    /**
     * Shows a dialog to create or edit an ability.
     * @param existing The existing ability to edit, or null for a new ability
     * @param onSave Called when the ability is saved
     */
    private void showAbilityDialog(ItemAbility existing, java.util.function.Consumer<ItemAbility> onSave) {
        Stage dialog = createDialog(existing == null ? "Add Ability" : "Edit Ability", 350, 350);
        GridPane grid = createDialogGrid();
        
        TextField nameField = new TextField(existing != null ? existing.getName() : "");
        TextField descField = new TextField(existing != null ? existing.getDescription() : "");
        
        ComboBox<String> triggerCombo = new ComboBox<>();
        triggerCombo.getItems().addAll(ItemAbility.TRIGGER_TYPES);
        triggerCombo.getSelectionModel().select(existing != null ? existing.getTriggerType() : ItemAbility.ON_TURN_START);
        
        ComboBox<String> effectCombo = new ComboBox<>();
        effectCombo.getItems().addAll(ItemAbility.EFFECT_TYPES);
        effectCombo.getSelectionModel().select(existing != null ? existing.getEffectType() : ItemAbility.EFFECT_HEAL);
        
        Spinner<Integer> magnitudeSpinner = new Spinner<>(-100, 100, existing != null ? existing.getMagnitude() : 1);
        magnitudeSpinner.setEditable(true);
        FormUtils.styleSpinner(magnitudeSpinner);
        
        ComboBox<String> targetAttrCombo = new ComboBox<>();
        targetAttrCombo.getItems().addAll("STR", "DEX", "CON", "INT", "WIS", "CHA");
        targetAttrCombo.getSelectionModel().select(existing != null ? existing.getTargetAttribute() : 0);
        
        int row = 0;
        grid.add(new Label("Name:"), 0, row); grid.add(nameField, 1, row++);
        grid.add(new Label("Description:"), 0, row); grid.add(descField, 1, row++);
        grid.add(new Label("Trigger:"), 0, row); grid.add(triggerCombo, 1, row++);
        grid.add(new Label("Effect:"), 0, row); grid.add(effectCombo, 1, row++);
        grid.add(new Label("Magnitude:"), 0, row); grid.add(magnitudeSpinner, 1, row++);
        grid.add(new Label("Target Attr:"), 0, row); grid.add(targetAttrCombo, 1, row++);
        
        HBox btnBox = new HBox(10);
        Button okBtn = new Button("OK");
        okBtn.getStyleClass().add("button-primary");
        okBtn.setOnAction(e -> {
            String name = nameField.getText().isEmpty() ? "Unnamed" : nameField.getText();
            ItemAbility ability = new ItemAbility(
                name,
                descField.getText(),
                triggerCombo.getValue(),
                effectCombo.getValue(),
                magnitudeSpinner.getValue(),
                targetAttrCombo.getSelectionModel().getSelectedIndex(),
                null
            );
            onSave.accept(ability);
            dialog.close();
        });
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> dialog.close());
        
        btnBox.getChildren().addAll(okBtn, cancelBtn);
        grid.add(btnBox, 0, row);
        GridPane.setColumnSpan(btnBox, 2);
        
        dialog.setScene(createDialogScene(grid, 350, 350));
        dialog.showAndWait();
    }

    private void deleteItem(Item item) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Item");
        confirm.setHeaderText(null);
        confirm.setContentText("Delete " + item.getName() + "?");
        DialogUtils.theme(confirm);

        confirm.showAndWait().ifPresent(response -> {
            if (response == ButtonType.OK) {
                ItemDatabase.getInstance().deleteItem(item);
                refreshItemDisplay();
            }
        });
    }

    private Stage createDialog(String title, int width, int height) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(appController.getPrimaryStage());
        dialog.setTitle(title);
        dialog.setResizable(false);
        return dialog;
    }

    private GridPane createDialogGrid() {
        GridPane grid = new GridPane();
        grid.getStyleClass().add("panel-dark");
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));
        return grid;
    }

    private Scene createDialogScene(GridPane grid, int width, int height) {
        // Wrapped in a fit-to-width ScrollPane so taller forms (weapon/accessory
        // dialogs with an ability editor) scroll instead of clipping content.
        ScrollPane scroll = new ScrollPane(grid);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel-dark");
        scroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        Scene scene = new Scene(scroll, width, height);
        StyleUtils.applyTheme(scene);
        return scene;
    }

    @FunctionalInterface
    private interface DialogAction {
        boolean execute() throws NumberFormatException;
    }

    private void addDialogButtons(GridPane grid, int row, Stage dialog, DialogAction action, Runnable refreshAction) {
        HBox btnBox = new HBox(10);
        Button okBtn = new Button("OK");
        okBtn.getStyleClass().add("button-primary");
        okBtn.setOnAction(e -> {
            try {
                if (action.execute()) {
                    dialog.close();
                    refreshAction.run();
                }
            } catch (NumberFormatException ex) {
                showAlert(Alert.AlertType.ERROR, "Error", "Please enter valid numbers.");
            }
        });
        
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> dialog.close());
        
        btnBox.getChildren().addAll(okBtn, cancelBtn);
        grid.add(btnBox, 0, row);
        GridPane.setColumnSpan(btnBox, 2);
    }

    private int parseInt(TextField field) {
        return Integer.parseInt(field.getText());
    }

    private String toHexColor(Color color) {
        return ColorUtils.toHex(color);
    }

    private void handleBack() {
        appController.navigateToMainMenu();
    }

    public BorderPane getRoot() {
        return root;
    }

    private void showAlert(Alert.AlertType type, String title, String content) {
        DialogUtils.showAlert(type, title, content);
    }
}
