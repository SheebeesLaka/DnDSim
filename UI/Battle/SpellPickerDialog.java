package UI.Battle;

import EntityRes.CharSheet;
import EntityRes.Spell;
import EntityRes.SpellSlots;
import Objects.Entity;
import UI.DialogUtils;
import UI.IconUtils;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Lets a caster pick one of their known spells and, for leveled spells, which slot to spend.
 * Spells with no remaining slot at or above their level are shown but can't be cast.
 */
public final class SpellPickerDialog {

    /** The chosen spell and the slot level it will be cast with (0 for cantrips). */
    public record SpellChoice(Spell spell, int slotLevel) {}

    private SpellPickerDialog() {}

    public static Optional<SpellChoice> show(Entity caster) {
        CharSheet sheet = caster.getCharSheet();
        List<Spell> spells = sheet.getKnownSpells();

        Dialog<SpellChoice> dialog = new Dialog<>();
        dialog.setTitle("Cast a Spell");
        dialog.setHeaderText(null);
        DialogUtils.theme(dialog);

        ButtonType castType = new ButtonType("Cast", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(castType, ButtonType.CANCEL);

        // Header: caster + DC/attack, then remaining slots per level
        Label title = new Label(caster.getName());
        title.getStyleClass().add("section-header");
        int atk = caster.getSpellAttackModifier();
        Label stats = new Label("Spell DC " + caster.getSpellSaveDC() + "   |   Spell attack " + (atk >= 0 ? "+" : "") + atk
                + "   |   " + sheet.getSpellcastingStat());
        stats.getStyleClass().add("label-muted");
        VBox header = new VBox(4, title, stats, buildSlotRow(sheet));

        ListView<Spell> list = new ListView<>();
        list.getItems().setAll(spells);
        list.setPrefSize(440, 300);
        list.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(Spell spell, boolean empty) {
                super.updateItem(spell, empty);
                if (empty || spell == null) {
                    setGraphic(null);
                    setText(null);
                    return;
                }
                setText(null);
                setGraphic(buildSpellRow(spell, sheet.lowestAvailableSlot(spell.getLevel()) >= 0));
            }
        });

        Label description = new Label();
        description.setWrapText(true);
        description.setMaxWidth(440);
        description.getStyleClass().add("label-muted");

        Label slotLabel = new Label("Cast with slot:");
        ComboBox<Integer> slotCombo = new ComboBox<>();
        slotCombo.setButtonCell(slotCell(sheet));
        slotCombo.setCellFactory(lv -> slotCell(sheet));
        HBox slotBox = new HBox(8, slotLabel, slotCombo);
        slotBox.setAlignment(Pos.CENTER_LEFT);

        // Tweak a spell mid-battle (dice, status effect...) without leaving the fight
        Button editBtn = new Button("Edit Spell");
        editBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.EDIT, 12, "#dcdcdc"));
        editBtn.getStyleClass().add("button");
        editBtn.setOnAction(e -> {
            Spell selected = list.getSelectionModel().getSelectedItem();
            if (selected == null) return;
            UI.SpellEditorDialog.showAndWait(dialog.getDialogPane().getScene().getWindow(), selected, () -> {
                list.getItems().setAll(sheet.getKnownSpells());
                // Re-fire the selection listener so description/slot choices reflect the edit
                list.getSelectionModel().clearSelection();
                list.getSelectionModel().select(selected);
                list.refresh();
            });
        });
        editBtn.disableProperty().bind(list.getSelectionModel().selectedItemProperty().isNull());
        javafx.scene.layout.Region spacer = new javafx.scene.layout.Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        HBox footer = new HBox(8, slotBox, spacer, editBtn);
        footer.setAlignment(Pos.CENTER_LEFT);

        Node castButton = dialog.getDialogPane().lookupButton(castType);
        castButton.setDisable(true);

        list.getSelectionModel().selectedItemProperty().addListener((obs, old, spell) -> {
            slotCombo.getItems().clear();
            if (spell == null) {
                description.setText("");
                slotBox.setVisible(false);
                castButton.setDisable(true);
                return;
            }
            description.setText(spell.getDescription() == null || spell.getDescription().isEmpty()
                    ? spell.getSummary() : spell.getDescription());
            if (spell.isCantrip()) {
                slotBox.setVisible(false);
                castButton.setDisable(false);
                return;
            }
            for (int lvl = spell.getLevel(); lvl <= SpellSlots.MAX_SPELL_LEVEL; lvl++) {
                if (sheet.getSpellSlotsRemaining(lvl) > 0) slotCombo.getItems().add(lvl);
            }
            slotBox.setVisible(true);
            if (slotCombo.getItems().isEmpty()) {
                castButton.setDisable(true);
            } else {
                slotCombo.getSelectionModel().selectFirst();
                castButton.setDisable(false);
            }
        });
        slotBox.setVisible(false);

        list.setOnMouseClicked(e -> {
            if (e.getClickCount() == 2 && !castButton.isDisabled()) {
                ((Button) castButton).fire();
            }
        });

        VBox content = new VBox(10, header, new Separator(), list, description, footer);
        content.setPadding(new Insets(8));
        dialog.getDialogPane().setContent(content);

        if (!spells.isEmpty()) {
            list.getSelectionModel().selectFirst();
        }

        dialog.setResultConverter(bt -> {
            if (bt != castType) return null;
            Spell spell = list.getSelectionModel().getSelectedItem();
            if (spell == null) return null;
            int slot = spell.isCantrip() ? 0 : slotCombo.getValue() != null ? slotCombo.getValue() : -1;
            return slot < 0 ? null : new SpellChoice(spell, slot);
        });
        return dialog.showAndWait();
    }

    private static ListCell<Integer> slotCell(CharSheet sheet) {
        return new ListCell<>() {
            @Override
            protected void updateItem(Integer lvl, boolean empty) {
                super.updateItem(lvl, empty);
                setText(empty || lvl == null ? null
                        : "Level " + lvl + "  (" + sheet.getSpellSlotsRemaining(lvl) + "/" + sheet.getMaxSpellSlots(lvl) + " left)");
            }
        };
    }

    /** "Lv1 ●●○○  Lv2 ●○" for every level the caster has slots in. */
    public static HBox buildSlotRow(CharSheet sheet) {
        HBox row = new HBox(14);
        row.setAlignment(Pos.CENTER_LEFT);
        for (int lvl = 1; lvl <= SpellSlots.MAX_SPELL_LEVEL; lvl++) {
            int max = sheet.getMaxSpellSlots(lvl);
            if (max <= 0) continue;
            int remaining = sheet.getSpellSlotsRemaining(lvl);
            Label lvlLabel = new Label("Lv" + lvl);
            lvlLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-text-fill: #b9a8f5;");
            HBox pips = new HBox(3);
            pips.setAlignment(Pos.CENTER_LEFT);
            for (int i = 0; i < max; i++) {
                Region pip = new Region();
                pip.setMinSize(9, 9);
                pip.setPrefSize(9, 9);
                pip.setMaxSize(9, 9);
                boolean filled = i < remaining;
                pip.setStyle("-fx-background-radius: 5; -fx-border-radius: 5; -fx-border-color: #7B68EE; -fx-border-width: 1;"
                        + (filled ? " -fx-background-color: #9a7cf0;" : " -fx-background-color: transparent;"));
                pips.getChildren().add(pip);
            }
            HBox group = new HBox(5, lvlLabel, pips);
            group.setAlignment(Pos.CENTER_LEFT);
            row.getChildren().add(group);
        }
        if (row.getChildren().isEmpty()) {
            Label none = new Label("No spell slots (cantrips only)");
            none.getStyleClass().add("label-muted");
            row.getChildren().add(none);
        }
        return row;
    }

    private static Node buildSpellRow(Spell spell, boolean castable) {
        Node icon = IconUtils.createIcon(IconUtils.Icon.SPELL, 16, castable ? spell.getColor() : "#6a6a6a");
        Label name = new Label(spell.getName());
        name.setStyle("-fx-font-weight: bold; -fx-font-size: 13px; -fx-text-fill: " + (castable ? "#e6e6e6" : "#7a7a7a") + ";");
        Label summary = new Label(spell.getSummary());
        summary.setStyle("-fx-font-size: 11px; -fx-text-fill: " + (castable ? "#a8a8b0" : "#666666") + ";");
        VBox text = new VBox(2, name, summary);
        HBox.setHgrow(text, Priority.ALWAYS);

        Label level = new Label(castable ? spell.getLevelLabel() : spell.getLevelLabel() + " · no slots");
        level.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 7 2 7; -fx-background-radius: 10; "
                + "-fx-text-fill: white; -fx-background-color: " + (castable ? (spell.isCantrip() ? "#4a4f6a" : "#5d4bb8") : "#444") + ";");

        HBox row = new HBox(10, icon, text, level);
        row.setAlignment(Pos.CENTER_LEFT);
        row.setPadding(new Insets(4, 2, 4, 2));
        return row;
    }

    /** Collect the known spells a caster could cast right now (used to enable the Cast button). */
    public static List<Spell> castableSpells(CharSheet sheet) {
        List<Spell> result = new ArrayList<>();
        for (Spell s : sheet.getKnownSpells()) {
            if (sheet.lowestAvailableSlot(s.getLevel()) >= 0) result.add(s);
        }
        return result;
    }
}
