package UI;

import EntityRes.*;
import javafx.animation.*;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.util.Duration;

/**
 * Utility class for creating modern card-based UI components.
 * Provides consistent, visually appealing card layouts for entities, items, and info displays.
 */
public class CardUtils {

    // ==================== COLOR SCHEMES ====================
    
    // Hexes here mirror resources/styles/dark-theme.css's -fx-theme-* tokens
    // (bg-mid/border-dark/accent-blue etc.) - keep the two in sync by hand,
    // since these get baked into per-card inline styles via String.format.
    public enum CardStyle {
        DEFAULT("#2d2d30", "#3c3c3e", "#569cd6"),
        PARTY("#2d3530", "#3c4540", "#4CAF50"),
        ENEMY("#352d2d", "#453c3c", "#d75f5f"),
        NEUTRAL("#2d2d35", "#3c3c45", "#9c9caa"),
        LEGENDARY("#35302d", "#453c35", "#daa520"),
        RARE("#2d2d35", "#3c3c45", "#9c27b0"),
        UNCOMMON("#2d3530", "#3c4540", "#4ec9b0"),
        COMMON("#2d2d30", "#3c3c3e", "#808080");
        
        public final String bgColor;
        public final String borderColor;
        public final String accentColor;
        
        CardStyle(String bg, String border, String accent) {
            this.bgColor = bg;
            this.borderColor = border;
            this.accentColor = accent;
        }
    }
    
    // ==================== ITEM CARDS ====================
    
    /**
     * Creates an item card with rarity styling.
     */
    public static VBox createItemCard(Item item) {
        CardStyle style = getItemRarityStyle(item);
        
        VBox card = createBaseCard(style);
        card.setMinWidth(180);
        card.setMaxWidth(220);
        
        // Header with icon and name
        IconUtils.Icon itemIcon = getItemIcon(item);
        HBox header = createCardHeader(item.getName(), style, IconUtils.createIcon(itemIcon, 18, style.accentColor));
        
        // Rarity badge
        HBox rarityRow = new HBox();
        rarityRow.setAlignment(Pos.CENTER_LEFT);
        String rarity = getItemRarity(item);
        rarityRow.getChildren().add(createBadge(rarity, style.accentColor));
        
        // Item details
        VBox details = new VBox(4);
        details.setPadding(new Insets(8, 0, 0, 0));
        
        if (item instanceof Weapon w) {
            addDetailRow(details, "Damage Dice", formatDice(w.getDamageDice()));
        } else if (item instanceof Armor a) {
            addDetailRow(details, "Defense", "+" + a.getDefense());
        } else if (item instanceof Consumable c) {
            addDetailRow(details, "Heal", "+" + c.getHealAmount() + " HP");
            Status effect = c.getEffect();
            if (effect != null) {
                addDetailRow(details, "Effect", effect.getName());
            }
        }
        
        card.getChildren().addAll(header, rarityRow, details);
        
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates a compact item card for inventory lists.
     */
    public static HBox createCompactItemCard(Item item, int quantity) {
        CardStyle style = getItemRarityStyle(item);
        
        HBox card = new HBox(8);
        card.setAlignment(Pos.CENTER_LEFT);
        card.setPadding(new Insets(8, 12, 8, 12));
        card.setStyle(String.format(
            "-fx-background-color: %s; -fx-background-radius: 4; " +
            "-fx-border-color: %s; -fx-border-radius: 4; -fx-border-width: 1;",
            style.bgColor, style.borderColor
        ));
        
        // Icon
        Node icon = IconUtils.createIcon(getItemIcon(item), 16, style.accentColor);
        
        // Name
        Label name = createLabel(item.getName(), "#dcdcdc", false);
        HBox.setHgrow(name, Priority.ALWAYS);
        
        // Quantity badge
        if (quantity > 1) {
            Label qty = new Label("x" + quantity);
            qty.setStyle("-fx-background-color: #444; -fx-text-fill: #fff; " +
                        "-fx-padding: 2 6 2 6; -fx-background-radius: 10; -fx-font-size: 10px;");
            card.getChildren().addAll(icon, name, qty);
        } else {
            card.getChildren().addAll(icon, name);
        }
        
        return card;
    }
    
    // ==================== INFO CARDS ====================
    
    /**
     * Creates an info card with title and content.
     */
    public static VBox createInfoCard(String title, String content, IconUtils.Icon icon) {
        VBox card = createBaseCard(CardStyle.DEFAULT);
        
        HBox header = createCardHeader(title, CardStyle.DEFAULT, IconUtils.createIcon(icon, 18, CardStyle.DEFAULT.accentColor));
        
        Label contentLabel = new Label(content);
        contentLabel.setWrapText(true);
        contentLabel.setStyle("-fx-text-fill: #bbb; -fx-font-size: 12px;");
        contentLabel.setPadding(new Insets(8, 0, 0, 0));
        
        card.getChildren().addAll(header, contentLabel);
        
        return card;
    }
    
    /**
     * Creates a stat card showing a single stat with icon.
     */
    public static VBox createStatCard(String label, String value, IconUtils.Icon icon, String accentColor) {
        VBox card = new VBox(8);
        card.setAlignment(Pos.CENTER);
        card.setPadding(new Insets(15));
        card.setMinWidth(100);
        card.setStyle(String.format(
            "-fx-background-color: linear-gradient(to bottom, #2d2d30, #252528); " +
            "-fx-background-radius: 8; -fx-border-color: #3c3c3e; -fx-border-radius: 8; -fx-border-width: 1;"
        ));
        
        Node iconNode = IconUtils.createIcon(icon, 28, accentColor);
        
        Label valueLabel = new Label(value);
        valueLabel.setStyle(String.format("-fx-text-fill: %s; -fx-font-size: 20px; -fx-font-weight: bold;", accentColor));
        
        Label labelNode = new Label(label);
        labelNode.setStyle("-fx-text-fill: #888; -fx-font-size: 11px;");
        
        card.getChildren().addAll(iconNode, valueLabel, labelNode);
        
        addCardHoverEffect(card);
        
        return card;
    }
    
    // ==================== CARD BUILDING BLOCKS ====================
    
    /**
     * Creates a base card container with style.
     */
    public static VBox createBaseCard(CardStyle style) {
        VBox card = new VBox(8);
        card.setPadding(new Insets(12));
        card.setStyle(String.format(
            "-fx-background-color: linear-gradient(to bottom right, %s, %s); " +
            "-fx-background-radius: 8; -fx-border-color: %s; -fx-border-radius: 8; " +
            "-fx-border-width: 1; -fx-effect: dropshadow(gaussian, rgba(0,0,0,0.3), 8, 0, 0, 3);",
            style.bgColor, adjustBrightness(style.bgColor, -15), style.borderColor
        ));
        return card;
    }
    
    /**
     * Creates a card header with icon and title.
     */
    public static HBox createCardHeader(String title, CardStyle style, Node icon) {
        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(0, 0, 8, 0));
        header.setStyle(String.format(
            "-fx-border-color: transparent transparent %s transparent; -fx-border-width: 0 0 1 0;",
            style.borderColor
        ));
        
        Label titleLabel = new Label(title);
        titleLabel.setStyle(String.format(
            "-fx-text-fill: %s; -fx-font-size: 14px; -fx-font-weight: bold;",
            style.accentColor
        ));
        HBox.setHgrow(titleLabel, Priority.ALWAYS);
        
        if (icon != null) {
            header.getChildren().add(icon);
        }
        header.getChildren().add(titleLabel);
        
        return header;
    }
    
    /**
     * Creates a badge/tag element.
     */
    public static Label createBadge(String text, String color) {
        Label badge = new Label(text);
        badge.setStyle(String.format(
            "-fx-background-color: %s; -fx-text-fill: white; " +
            "-fx-padding: 3 8 3 8; -fx-background-radius: 12; -fx-font-size: 10px; -fx-font-weight: bold;",
            adjustBrightness(color, -30)
        ));
        return badge;
    }
    
    /**
     * Creates a footer section for cards.
     */
    public static HBox createCardFooter(Node... children) {
        HBox footer = new HBox(8);
        footer.setAlignment(Pos.CENTER_RIGHT);
        footer.setPadding(new Insets(8, 0, 0, 0));
        footer.setStyle("-fx-border-color: #3c3c3e transparent transparent transparent; -fx-border-width: 1 0 0 0;");
        footer.getChildren().addAll(children);
        return footer;
    }
    
    // ==================== HOVER EFFECTS ====================
    
    /**
     * Adds a lift effect on hover.
     */
    public static void addCardHoverEffect(Region card) {
        DropShadow normalShadow = new DropShadow(8, Color.rgb(0, 0, 0, 0.3));
        normalShadow.setOffsetY(3);
        
        DropShadow hoverShadow = new DropShadow(16, Color.rgb(0, 0, 0, 0.4));
        hoverShadow.setOffsetY(6);
        
        card.setOnMouseEntered(e -> {
            ScaleTransition scale = new ScaleTransition(Duration.millis(150), card);
            scale.setToX(1.02);
            scale.setToY(1.02);
            scale.play();
            
            Timeline shadow = new Timeline(
                new KeyFrame(Duration.millis(150),
                    new KeyValue(card.effectProperty(), hoverShadow)
                )
            );
            shadow.play();
        });
        
        card.setOnMouseExited(e -> {
            ScaleTransition scale = new ScaleTransition(Duration.millis(150), card);
            scale.setToX(1.0);
            scale.setToY(1.0);
            scale.play();
            
            Timeline shadow = new Timeline(
                new KeyFrame(Duration.millis(150),
                    new KeyValue(card.effectProperty(), normalShadow)
                )
            );
            shadow.play();
        });
    }
    
    // ==================== CARDS WITH ACTIONS ====================
    
    /**
     * Callback interface for card actions.
     */
    @FunctionalInterface
    public interface CardAction {
        void execute();
    }
    
    /**
     * Creates an item card with edit and delete action buttons.
     */
    public static VBox createItemCardWithActions(Item item, CardAction onEdit, CardAction onDelete) {
        VBox card = createItemCard(item);
        
        // Add action buttons
        HBox actions = new HBox(8);
        actions.setAlignment(Pos.CENTER_RIGHT);
        actions.setPadding(new Insets(8, 0, 0, 0));
        actions.setStyle("-fx-border-color: #3c3c3e transparent transparent transparent; -fx-border-width: 1 0 0 0;");
        
        Button editBtn = new Button("Edit");
        editBtn.getStyleClass().add("button");
        editBtn.setStyle("-fx-padding: 4 10 4 10; -fx-font-size: 11px;");
        editBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.EDIT, 12, "#dcdcdc"));
        editBtn.setOnAction(e -> onEdit.execute());
        
        Button deleteBtn = new Button("Delete");
        deleteBtn.getStyleClass().add("button-danger");
        deleteBtn.setStyle("-fx-padding: 4 10 4 10; -fx-font-size: 11px;");
        deleteBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 12, "#fff"));
        deleteBtn.setOnAction(e -> onDelete.execute());
        
        actions.getChildren().addAll(editBtn, deleteBtn);
        card.getChildren().add(actions);
        
        return card;
    }
    
    /**
     * Creates a detailed weapon card showing all stats.
     */
    public static VBox createWeaponCard(Weapon weapon, CardAction onEdit, CardAction onDelete) {
        CardStyle style = getItemRarityStyle(weapon);
        
        VBox card = createBaseCard(style);
        card.setMinWidth(180);
        card.setMaxWidth(220);
        
        // Header
        HBox header = createCardHeader(weapon.getName(), style, 
            IconUtils.createIcon(IconUtils.Icon.SWORDS, 18, style.accentColor));
        
        // Rarity badge
        HBox rarityRow = new HBox();
        rarityRow.getChildren().add(createBadge(getItemRarity(weapon), style.accentColor));
        
        // Stats
        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addDetailRow(stats, "Damage Dice", formatDice(weapon.getDamageDice()));
        
        int[] attrs = weapon.getModifiedAttributes();
        String[] attrNames = {"STR", "DEX", "CON", "INT", "WIS", "CHA"};
        for (int i = 0; i < attrs.length && i < attrNames.length; i++) {
            if (attrs[i] != 0) {
                addDetailRow(stats, attrNames[i], (attrs[i] > 0 ? "+" : "") + attrs[i]);
            }
        }
        
        // Actions
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, rarityRow, stats, actions);
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates a spell card: level/resolution badges, then the mechanical details.
     */
    public static VBox createSpellCard(Spell spell, CardAction onEdit, CardAction onDelete) {
        CardStyle style = spell.isCantrip() ? CardStyle.NEUTRAL : CardStyle.RARE;

        VBox card = createBaseCard(style);
        card.setMinWidth(200);
        card.setMaxWidth(240);

        HBox header = createCardHeader(spell.getName(), style,
            IconUtils.createIcon(IconUtils.Icon.SPELL, 18, spell.getColor()));

        HBox badges = new HBox(6);
        badges.getChildren().addAll(createBadge(spell.getLevelLabel(), style.accentColor),
            createBadge(spell.getResolution(), "#7B68EE"));

        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        if (spell.getSchool() != null && !spell.getSchool().isEmpty()) {
            addDetailRow(stats, "School", spell.getSchool());
        }
        if (spell.isArea()) {
            addDetailRow(stats, "Area", spell.getAreaLabel() + (spell.isFriendlyFire() ? " (FF)" : ""));
        } else {
            addDetailRow(stats, "Range", spell.getRangeLabel());
        }
        addDetailRow(stats, "Targets", spell.getTargetType());
        if (Spell.SAVE.equals(spell.getResolution())) {
            addDetailRow(stats, "Save", spell.getSaveStat() + (Spell.ON_SAVE_HALF.equals(spell.getOnSave()) ? " (half)" : ""));
        }
        if (!Spell.BUFF.equals(spell.getResolution()) && !spell.getDiceLabel().isEmpty()) {
            int flat = spell.getFlatDamage();
            String flatStr = flat == 0 ? "" : (flat > 0 ? " +" : " ") + flat;
            addDetailRow(stats, Spell.HEAL.equals(spell.getResolution()) ? "Healing" : "Damage",
                (Spell.HEAL.equals(spell.getResolution()) ? spell.getDamageDice()[0] : spell.getDiceLabel()) + flatStr);
        }
        if (spell.getUpcastDie() != null && !spell.getUpcastDie().isEmpty() && !spell.isCantrip()) {
            addDetailRow(stats, "Upcast", "+" + spell.getUpcastDie() + "/lvl");
        }
        if (spell.getRiderStatus() != null) {
            Status rider = spell.getRiderStatus();
            addDetailRow(stats, "Effect", rider.getName() + (rider.getDuration() > 0 ? " (" + rider.getDuration() + "t)" : ""));
        }

        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );

        card.getChildren().addAll(header, badges, stats, actions);
        addCardHoverEffect(card);
        return card;
    }

    /**
     * Creates a detailed accessory card (defense + attribute mods, same shape as a weapon/armor card).
     */
    public static VBox createAccessoryCard(Accessory accessory, CardAction onEdit, CardAction onDelete) {
        CardStyle style = getItemRarityStyle(accessory);

        VBox card = createBaseCard(style);
        card.setMinWidth(180);
        card.setMaxWidth(220);

        HBox header = createCardHeader(accessory.getName(), style,
            IconUtils.createIcon(IconUtils.Icon.SHIELD, 18, style.accentColor));

        HBox rarityRow = new HBox();
        rarityRow.getChildren().add(createBadge(getItemRarity(accessory), style.accentColor));

        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addDetailRow(stats, "Defense", "+" + accessory.getDefense());

        int[] attrs = accessory.getModifiedAttributes();
        String[] attrNames = {"STR", "DEX", "CON", "INT", "WIS", "CHA"};
        for (int i = 0; i < attrs.length && i < attrNames.length; i++) {
            if (attrs[i] != 0) {
                addDetailRow(stats, attrNames[i], (attrs[i] > 0 ? "+" : "") + attrs[i]);
            }
        }

        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );

        card.getChildren().addAll(header, rarityRow, stats, actions);
        addCardHoverEffect(card);

        return card;
    }

    /**
     * Creates a detailed armor card.
     */
    public static VBox createArmorCard(Armor armor, CardAction onEdit, CardAction onDelete) {
        CardStyle style = getItemRarityStyle(armor);
        String[] armorTypes = {"Head", "Torso", "Legs"};
        
        VBox card = createBaseCard(style);
        card.setMinWidth(180);
        card.setMaxWidth(220);
        
        HBox header = createCardHeader(armor.getName(), style, 
            IconUtils.createIcon(IconUtils.Icon.SHIELD, 18, style.accentColor));
        
        HBox rarityRow = new HBox();
        rarityRow.getChildren().add(createBadge(getItemRarity(armor), style.accentColor));
        
        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addDetailRow(stats, "Type", armorTypes[armor.getArmorType()]);
        addDetailRow(stats, "Defense", "+" + armor.getDefense());
        
        int[] attrs = armor.getModifiedAttributes();
        String[] attrNames = {"STR", "DEX", "CON", "INT", "WIS", "CHA"};
        for (int i = 0; i < attrs.length && i < attrNames.length; i++) {
            if (attrs[i] != 0) {
                addDetailRow(stats, attrNames[i], (attrs[i] > 0 ? "+" : "") + attrs[i]);
            }
        }
        
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, rarityRow, stats, actions);
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates a consumable card.
     */
    public static VBox createConsumableCard(Consumable item, CardAction onEdit, CardAction onDelete) {
        VBox card = createBaseCard(CardStyle.UNCOMMON);
        card.setMinWidth(160);
        card.setMaxWidth(200);
        
        HBox header = createCardHeader(item.getName(), CardStyle.UNCOMMON, 
            IconUtils.createIcon(IconUtils.Icon.POTION, 18, CardStyle.UNCOMMON.accentColor));
        
        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addDetailRow(stats, "Heal", "+" + item.getHealAmount() + " HP");
        Status effect = item.getEffect();
        if (effect != null) {
            addDetailRow(stats, "Effect", effect.getName());
        }
        
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, stats, actions);
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates an ammunition card.
     */
    public static VBox createAmmunitionCard(Ammunition item, CardAction onEdit, CardAction onDelete) {
        VBox card = createBaseCard(CardStyle.DEFAULT);
        card.setMinWidth(160);
        card.setMaxWidth(200);
        
        HBox header = createCardHeader(item.getName(), CardStyle.DEFAULT, 
            IconUtils.createIcon(IconUtils.Icon.TARGET, 18, CardStyle.DEFAULT.accentColor));
        
        VBox stats = new VBox(4);
        stats.setPadding(new Insets(8, 0, 0, 0));
        addDetailRow(stats, "Ammo", item.getAmmoType());
        
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, stats, actions);
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates a crafting item card.
     */
    public static VBox createCraftingItemCard(CraftingItem item, CardAction onEdit, CardAction onDelete) {
        VBox card = createBaseCard(CardStyle.DEFAULT);
        card.setMinWidth(150);
        card.setMaxWidth(180);
        
        HBox header = createCardHeader(item.getName(), CardStyle.DEFAULT, 
            IconUtils.createIcon(IconUtils.Icon.GEAR, 18, CardStyle.DEFAULT.accentColor));
        
        Label category = new Label(item.getCraftingCategory());
        category.getStyleClass().add("card-detail-label");
        category.setPadding(new Insets(4, 0, 0, 0));
        
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, category, actions);
        addCardHoverEffect(card);
        
        return card;
    }
    
    /**
     * Creates a key item card.
     */
    public static VBox createKeyItemCard(KeyItem item, CardAction onEdit, CardAction onDelete) {
        CardStyle style = item.isQuestRelated() ? CardStyle.LEGENDARY : CardStyle.DEFAULT;
        
        VBox card = createBaseCard(style);
        card.setMinWidth(150);
        card.setMaxWidth(180);
        
        HBox header = createCardHeader(item.getName(), style, 
            IconUtils.createIcon(IconUtils.Icon.CHEST, 18, style.accentColor));
        
        Label type = new Label(item.isQuestRelated() ? "Quest Item" : "Key Item");
        type.setStyle(String.format("-fx-text-fill: %s; -fx-font-size: 11px;", style.accentColor));
        type.setPadding(new Insets(4, 0, 0, 0));
        
        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        
        card.getChildren().addAll(header, type, actions);
        addCardHoverEffect(card);

        return card;
    }

    /**
     * Creates a stat-forward enemy card for the Enemies browser grid.
     */
    public static VBox createEnemyCard(Objects.Enemy enemy, CardAction onEdit, CardAction onDelete) {
        CardStyle style = CardStyle.ENEMY;

        VBox card = createBaseCard(style);
        card.setMinWidth(150);
        card.setMaxWidth(170);

        HBox header = createCardHeader(enemy.getName(), style, SpriteUtils.createEnemySprite(enemy, 32));

        HBox statBadges = new HBox(6);
        statBadges.getChildren().addAll(
            createBadge("HP " + enemy.getMaxHealth(), style.accentColor),
            createBadge("AC " + enemy.getAC(), style.accentColor),
            createBadge("Init " + enemy.getInitiative(), style.accentColor)
        );

        card.getChildren().addAll(header, statBadges);

        if (!enemy.getTags().isEmpty()) {
            HBox tagRow = new HBox(4);
            for (String tag : enemy.getTags()) {
                Label chip = new Label(tag);
                chip.getStyleClass().add("tag-chip");
                tagRow.getChildren().add(chip);
            }
            card.getChildren().add(tagRow);
        }

        HBox actions = createCardFooter(
            createActionButton("Edit", IconUtils.Icon.EDIT, false, onEdit),
            createActionButton("Delete", IconUtils.Icon.CLOSE, true, onDelete)
        );
        card.getChildren().add(actions);

        addCardHoverEffect(card);
        return card;
    }

    /**
     * Creates an action button for cards.
     */
    private static Button createActionButton(String text, IconUtils.Icon icon, boolean isDanger, CardAction action) {
        Button btn = new Button(text);
        btn.getStyleClass().add(isDanger ? "button-danger" : "button");
        btn.setStyle("-fx-padding: 4 10 4 10; -fx-font-size: 11px;");
        btn.setGraphic(IconUtils.createIcon(icon, 12, isDanger ? "#fff" : "#dcdcdc"));
        btn.setOnAction(e -> action.execute());
        return btn;
    }
    
    // ==================== PRIVATE HELPERS ====================
    
    private static Label createLabel(String text, String color, boolean bold) {
        Label label = new Label(text);
        label.setStyle(String.format("-fx-text-fill: %s;%s", color, bold ? " -fx-font-weight: bold;" : ""));
        return label;
    }
    
    private static void addDetailRow(VBox container, String label, String value) {
        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);
        
        Label labelNode = new Label(label + ":");
        labelNode.getStyleClass().add("card-detail-label");
        labelNode.setMinWidth(60);

        Label valueNode = new Label(value);
        valueNode.getStyleClass().add("card-detail-value");
        valueNode.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(valueNode, Priority.ALWAYS);
        Tooltip.install(valueNode, new Tooltip(value));

        row.getChildren().addAll(labelNode, valueNode);
        container.getChildren().add(row);
    }
    
    private static CardStyle getItemRarityStyle(Item item) {
        // Determine rarity based on item properties
        if (item instanceof Weapon w) {
            int dmg = estimateWeaponDamage(w.getDamageDice());
            if (dmg >= 20) return CardStyle.LEGENDARY;
            if (dmg >= 12) return CardStyle.RARE;
            if (dmg >= 6) return CardStyle.UNCOMMON;
        } else if (item instanceof Armor a) {
            if (a.getDefense() >= 10) return CardStyle.LEGENDARY;
            if (a.getDefense() >= 5) return CardStyle.RARE;
            if (a.getDefense() >= 2) return CardStyle.UNCOMMON;
        } else if (item instanceof Accessory acc) {
            if (acc.getDefense() >= 10) return CardStyle.LEGENDARY;
            if (acc.getDefense() >= 5) return CardStyle.RARE;
            if (acc.getDefense() >= 2) return CardStyle.UNCOMMON;
        }
        return CardStyle.COMMON;
    }
    
    private static String getItemRarity(Item item) {
        CardStyle style = getItemRarityStyle(item);
        return switch (style) {
            case LEGENDARY -> "Legendary";
            case RARE -> "Rare";
            case UNCOMMON -> "Uncommon";
            default -> "Common";
        };
    }
    
    private static IconUtils.Icon getItemIcon(Item item) {
        if (item instanceof Weapon) return IconUtils.Icon.SWORDS;
        if (item instanceof Armor) return IconUtils.Icon.SHIELD;
        if (item instanceof Accessory) return IconUtils.Icon.SHIELD;
        if (item instanceof Consumable) return IconUtils.Icon.POTION;
        if (item instanceof KeyItem) return IconUtils.Icon.CHEST;
        if (item instanceof Ammunition) return IconUtils.Icon.TARGET;
        return IconUtils.Icon.CHEST;
    }
    
    private static String adjustBrightness(String hexColor, int amount) {
        // Parse hex color and adjust brightness
        String hex = hexColor.replace("#", "");
        int r = Math.max(0, Math.min(255, Integer.parseInt(hex.substring(0, 2), 16) + amount));
        int g = Math.max(0, Math.min(255, Integer.parseInt(hex.substring(2, 4), 16) + amount));
        int b = Math.max(0, Math.min(255, Integer.parseInt(hex.substring(4, 6), 16) + amount));
        return String.format("#%02x%02x%02x", r, g, b);
    }

    private static String formatDice(String[] dice) {
        if (dice == null || dice.length == 0) {
            return "--";
        }
        return String.join("/", dice);
    }

    private static int estimateWeaponDamage(String[] dice) {
        if (dice == null || dice.length == 0 || dice[0] == null) {
            return 4;
        }

        return switch (dice[0].toLowerCase()) {
            case "d4" -> 2;
            case "d6" -> 3;
            case "d8" -> 4;
            case "d10" -> 5;
            case "d12" -> 6;
            case "d20" -> 10;
            default -> 4;
        };
    }
}
