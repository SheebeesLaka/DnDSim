package UI;

import UI.PlayerDisplayOptions.EnemyHp;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.Window;

/**
 * What the Two Display Mode player screen is allowed to show. Opened from the gear on the
 * main menu's Two Display Mode toggle; every change applies to an open player window live.
 */
public final class PlayerDisplaySettingsDialog {

    private PlayerDisplaySettingsDialog() {}

    public static void show(Window owner) {
        Dialog<Void> dialog = build(owner);
        dialog.showAndWait();
    }

    /** Build (but don't show) the dialog - split out so it can be inspected offscreen. */
    static Dialog<Void> build(Window owner) {
        PlayerDisplayOptions opts = PlayerDisplayOptions.get();

        Dialog<Void> dialog = new Dialog<>();
        dialog.setTitle("Two Display Mode Settings");
        dialog.setHeaderText(null);
        if (owner != null) dialog.initOwner(owner);
        DialogUtils.theme(dialog);
        dialog.getDialogPane().getButtonTypes().add(new ButtonType("Done", ButtonBar.ButtonData.OK_DONE));

        Label title = new Label("What the players can see");
        title.getStyleClass().add("section-header");
        Label intro = new Label("Changes apply to the player screen immediately.");
        intro.getStyleClass().add("label-muted");

        // Enemy health: exact / vague / hidden
        ToggleGroup hpGroup = new ToggleGroup();
        HBox hpChips = new HBox(6);
        Label hpNote = note(opts.getEnemyHp().description);
        for (EnemyHp mode : EnemyHp.values()) {
            ToggleButton chip = new ToggleButton(mode.label);
            chip.getStyleClass().add("group-chip");
            chip.setToggleGroup(hpGroup);
            chip.setUserData(mode);
            chip.setSelected(mode == opts.getEnemyHp());
            hpChips.getChildren().add(chip);
        }
        hpGroup.selectedToggleProperty().addListener((obs, old, now) -> {
            if (now == null) {
                old.setSelected(true); // always keep one mode picked
                return;
            }
            EnemyHp mode = (EnemyHp) now.getUserData();
            opts.setEnemyHp(mode);
            hpNote.setText(mode.description);
        });
        VBox hpBlock = new VBox(5, heading("Enemy health"), hpChips, hpNote);

        VBox toggles = new VBox(10,
            flag(opts, PlayerDisplayOptions.PARTY_HP_NUMBERS, true, "Party HP numbers",
                "\"23/30\" under party portraits. The HP bars stay either way."),
            flag(opts, PlayerDisplayOptions.COMBAT_NUMBERS, true, "Damage & healing numbers",
                "Off: floating text says \"Hit!\", \"Crit!\" or \"Healed\" instead of the amount."),
            flag(opts, PlayerDisplayOptions.STATUS_TEXT, true, "Status effect names",
                "Floating \"Burning\", \"Blessed\"... when a spell effect lands."),
            flag(opts, PlayerDisplayOptions.ENEMY_INITIATIVE, false, "Enemy initiative rolls",
                "Floating \"d20 14\" when an enemy rolls initiative."),
            flag(opts, PlayerDisplayOptions.ENEMY_NAMES, true, "Enemy names",
                "Off: enemies show as \"Enemy\", \"Enemy 2\"... in the turn order."),
            flag(opts, PlayerDisplayOptions.TURN_STRIP, true, "Turn order strip",
                "The row of portraits above the board."),
            flag(opts, PlayerDisplayOptions.SPELL_TEMPLATES, false, "Area spell aiming",
                "Show the area template while you aim (\"where will the Fireball land?\").")
        );

        VBox content = new VBox(14, new VBox(2, title, intro), new Separator(), hpBlock, new Separator(), toggles);
        content.setPadding(new Insets(10));
        content.setPrefWidth(420);
        dialog.getDialogPane().setContent(content);
        return dialog;
    }

    /** A checkbox bound to one boolean display setting, with an explanation under it. */
    private static Node flag(PlayerDisplayOptions opts, String key, boolean def, String label, String description) {
        CheckBox box = new CheckBox(label);
        box.setSelected(opts.flag(key, def));
        box.setStyle("-fx-font-weight: bold;");
        box.selectedProperty().addListener((obs, o, n) -> opts.setFlag(key, n));
        Label desc = note(description);
        desc.setPadding(new Insets(0, 0, 0, 24));
        VBox row = new VBox(2, box, desc);
        row.setAlignment(Pos.CENTER_LEFT);
        return row;
    }

    private static Label heading(String text) {
        Label l = new Label(text);
        l.setStyle("-fx-font-weight: bold;");
        return l;
    }

    private static Label note(String text) {
        Label l = new Label(text);
        l.getStyleClass().add("label-muted");
        l.setStyle("-fx-font-size: 11px;");
        l.setWrapText(true);
        return l;
    }
}
