package UI;

import EntityRes.ColorUtils;
import EntityRes.Spell;
import EntityRes.SpellDatabase;
import EntityRes.Status;
import javafx.geometry.Insets;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.paint.Color;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

import java.util.Arrays;

/**
 * Add/edit form for a Spell asset: dice, resolution, range, save, upcasting and the optional
 * status rider. Shared by the Asset Editor, the character sheet's spell list and the in-battle
 * spell picker, so a spell can be tuned from wherever it's being used. Edits are saved straight
 * into SpellDatabase, and every character that knows the spell picks them up immediately.
 */
public final class SpellEditorDialog {

    private static final String NO_DIE = "-";
    private static final String[] DICE_TYPES = {"d4", "d6", "d8", "d10", "d12", "d20"};
    private static final String[] STAT_TYPES = {"STRENGTH", "DEXTERITY", "CONSTITUTION", "INTELLIGENCE", "WISDOM", "CHARISMA"};
    private static final int WIDTH = 460;
    private static final int HEIGHT = 720;

    private SpellEditorDialog() {}

    /** Show the editor and block until it closes. existing == null creates a new spell. */
    public static void showAndWait(Window owner, Spell existing, Runnable onSaved) {
        create(owner, existing, onSaved).showAndWait();
    }

    /** Build (but don't show) the editor window. */
    public static Stage create(Window owner, Spell existing, Runnable onSaved) {
        Spell spell = existing != null ? existing : new Spell();
        String originalName = existing != null ? existing.getName() : null;

        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        if (owner != null) dialog.initOwner(owner);
        dialog.setTitle(existing != null ? "Edit Spell - " + existing.getName() : "Add Spell");
        dialog.setResizable(false);

        GridPane grid = new GridPane();
        grid.getStyleClass().add("panel-dark");
        grid.setHgap(10);
        grid.setVgap(10);
        grid.setPadding(new Insets(20));
        // Fixed label column so labels never ellipsize; controls take the rest
        javafx.scene.layout.ColumnConstraints labelCol = new javafx.scene.layout.ColumnConstraints();
        labelCol.setMinWidth(145);
        javafx.scene.layout.ColumnConstraints controlCol = new javafx.scene.layout.ColumnConstraints();
        controlCol.setHgrow(javafx.scene.layout.Priority.ALWAYS);
        grid.getColumnConstraints().addAll(labelCol, controlCol);

        TextField nameField = new TextField(existing != null ? spell.getName() : "");
        ColorPicker colorPicker = new ColorPicker(Color.web(spell.getColor()));
        Spinner<Integer> levelSpinner = spinner(0, 9, spell.getLevel());
        TextField schoolField = new TextField(spell.getSchool());
        TextArea descArea = new TextArea(spell.getDescription());
        descArea.setPrefRowCount(3);
        descArea.setWrapText(true);
        descArea.getStyleClass().add("styled-text-area");

        ComboBox<String> resolutionCombo = new ComboBox<>();
        resolutionCombo.getItems().addAll(Spell.RESOLUTIONS);
        resolutionCombo.getSelectionModel().select(spell.getResolution());
        resolutionCombo.setTooltip(new Tooltip(
            "ATTACK: d20 + casting stat vs AC, margin picks the tier\n"
            + "SAVE: target rolls vs your DC, how badly they fail picks the tier\n"
            + "AUTO: always hits, rolls all three tiers' dice\n"
            + "HEAL: restores HP with the tier 1 die\n"
            + "BUFF: no roll, just applies the status effect"));
        ComboBox<String> targetCombo = new ComboBox<>();
        targetCombo.getItems().addAll(Spell.TARGET_TYPES);
        targetCombo.getSelectionModel().select(spell.getTargetType());
        Spinner<Integer> rangeSpinner = spinner(0, 30, spell.getRange());

        ComboBox<String> areaCombo = new ComboBox<>();
        areaCombo.getItems().addAll(Spell.AREAS);
        areaCombo.getSelectionModel().select(spell.getArea());
        areaCombo.setTooltip(new Tooltip(
            "NONE: single target\n"
            + "BURST: diamond of the given radius, placed within range (range 0 = centered on you)\n"
            + "CONE: spreads out from you, size = length\n"
            + "LINE: 1 tile wide from you toward the cursor, size = length"));
        Spinner<Integer> areaSizeSpinner = spinner(1, 20, Math.max(1, spell.getAreaSize()));
        CheckBox friendlyFireCheck = new CheckBox("Also hits allies (and you) in the area");
        friendlyFireCheck.setSelected(spell.isFriendlyFire());

        String[] dice = spell.getDamageDice();
        ComboBox<String> tier1Combo = dieCombo(dice[0]);
        ComboBox<String> tier2Combo = dieCombo(dice[1]);
        ComboBox<String> tier3Combo = dieCombo(dice[2]);
        ComboBox<String> upcastCombo = dieCombo(spell.getUpcastDie());
        Spinner<Integer> flatSpinner = spinner(-20, 50, spell.getFlatDamage());
        CheckBox castingModCheck = new CheckBox("Add casting modifier to the total");
        castingModCheck.setSelected(spell.isAddCastingMod());

        ComboBox<String> saveStatCombo = new ComboBox<>();
        saveStatCombo.getItems().addAll(STAT_TYPES);
        saveStatCombo.getSelectionModel().select(spell.getSaveStat());
        ComboBox<String> onSaveCombo = new ComboBox<>();
        onSaveCombo.getItems().addAll(Spell.ON_SAVE_NONE, Spell.ON_SAVE_HALF);
        onSaveCombo.getSelectionModel().select(spell.getOnSave());

        // Status rider
        Status rider = spell.getRiderStatus();
        CheckBox riderCheck = new CheckBox("Applies a status effect");
        riderCheck.setSelected(rider != null);
        TextField riderName = new TextField(rider != null ? rider.getName() : "");
        riderName.setPromptText("e.g. Burning");
        ComboBox<String> riderType = new ComboBox<>();
        for (int i = 1; i < Status.EFFECT_TYPE_NAMES.length; i++) riderType.getItems().add(Status.EFFECT_TYPE_NAMES[i]);
        riderType.getSelectionModel().select(rider != null && rider.getEffectType() > 0
            ? Status.EFFECT_TYPE_NAMES[rider.getEffectType()] : Status.EFFECT_TYPE_NAMES[Status.DAMAGE_OVER_TIME]);
        Spinner<Integer> riderMagnitude = spinner(-99, 99, rider != null ? rider.getMagnitude() : 2);
        riderMagnitude.setTooltip(new Tooltip("Damage/heal per turn, or the size of the stat/AC/attack/movement change"));
        Spinner<Integer> riderDuration = spinner(-1, 99, rider != null ? rider.getDuration() : 2);
        riderDuration.setTooltip(new Tooltip("Counts down at the start of the target's turn; -1 = permanent.\n"
            + "Use 2 for \"until the end of their next turn\"."));
        ComboBox<String> riderAttr = new ComboBox<>();
        riderAttr.getItems().addAll(STAT_TYPES);
        riderAttr.getSelectionModel().select(rider != null && rider.getTargetAttribute() >= 0
            ? STAT_TYPES[rider.getTargetAttribute()] : STAT_TYPES[0]);
        Spinner<Integer> riderMinTier = spinner(1, 3, spell.getRiderMinTier());
        riderMinTier.setTooltip(new Tooltip("Only apply the status on a hit / failed save of at least this tier"));

        int row = 0;
        addRow(grid, row++, "Name:", nameField);
        addRow(grid, row++, "Color:", colorPicker);
        addRow(grid, row++, "Level (0 = cantrip):", levelSpinner);
        addRow(grid, row++, "School:", schoolField);
        addRow(grid, row++, "Description:", descArea);
        addRow(grid, row++, "Resolution:", resolutionCombo);
        addRow(grid, row++, "Targets:", targetCombo);
        Node[] rangeRow = addRow(grid, row++, "Range (tiles):", rangeSpinner);
        addRow(grid, row++, "Area:", areaCombo);
        Node[] areaSizeRow = addRow(grid, row++, "Area Size (tiles):", areaSizeSpinner);
        Node[] friendlyFireRow = addRow(grid, row++, "", friendlyFireCheck);
        Node[] saveStatRow = addRow(grid, row++, "Save Stat:", saveStatCombo);
        Node[] onSaveRow = addRow(grid, row++, "On Successful Save:", onSaveCombo);
        grid.add(sectionLabel("Damage"), 0, row++, 2, 1);
        Node[] tier1Row = addRow(grid, row++, "Tier 1 Die:", tier1Combo);
        Node[] tier2Row = addRow(grid, row++, "Tier 2 Die:", tier2Combo);
        Node[] tier3Row = addRow(grid, row++, "Tier 3 Die:", tier3Combo);
        Node[] flatRow = addRow(grid, row++, "Flat Bonus:", flatSpinner);
        Node[] upcastRow = addRow(grid, row++, "Upcast Die (per lvl):", upcastCombo);
        Node[] modRow = addRow(grid, row++, "", castingModCheck);
        grid.add(sectionLabel("Status Effect"), 0, row++, 2, 1);
        addRow(grid, row++, "", riderCheck);
        Node[] riderNameRow = addRow(grid, row++, "Status Name:", riderName);
        Node[] riderTypeRow = addRow(grid, row++, "Effect:", riderType);
        Node[] riderMagRow = addRow(grid, row++, "Magnitude:", riderMagnitude);
        Node[] riderDurRow = addRow(grid, row++, "Duration (turns):", riderDuration);
        Node[] riderAttrRow = addRow(grid, row++, "Stat:", riderAttr);
        Node[] riderTierRow = addRow(grid, row++, "Min Tier to Apply:", riderMinTier);

        Label preview = new Label();
        preview.setWrapText(true);
        preview.setMaxWidth(WIDTH - 60);
        preview.setStyle("-fx-text-fill: #b9a8f5; -fx-font-size: 11px;");
        grid.add(preview, 0, row++, 2, 1);

        Runnable update = () -> {
            String res = resolutionCombo.getValue();
            boolean isSave = Spell.SAVE.equals(res);
            boolean isHeal = Spell.HEAL.equals(res);
            boolean isBuff = Spell.BUFF.equals(res);
            boolean isAuto = Spell.AUTO.equals(res);
            boolean leveled = levelSpinner.getValue() != null && levelSpinner.getValue() > 0;
            boolean hasRider = riderCheck.isSelected();
            ((Label) tier1Row[0]).setText(isHeal ? "Heal Die:" : "Tier 1 Die:");
            showRows(isSave, saveStatRow, onSaveRow);
            String area = areaCombo.getValue();
            boolean isArea = area != null && !Spell.AREA_NONE.equals(area);
            boolean aimedFromCaster = Spell.AREA_CONE.equals(area) || Spell.AREA_LINE.equals(area);
            // Cones and lines always start at the caster, so range means nothing for them
            showRows(!aimedFromCaster, rangeRow);
            ((Label) rangeRow[0]).setText(Spell.AREA_BURST.equals(area) ? "Range (0 = on you):" : "Range (tiles):");
            ((Label) areaSizeRow[0]).setText(Spell.AREA_BURST.equals(area) ? "Burst Radius:" : "Length (tiles):");
            showRows(isArea, areaSizeRow);
            showRows(isArea && !isHeal && !isBuff, friendlyFireRow);
            showRows(!isBuff, tier1Row, flatRow, modRow);
            showRows(!isBuff && !isHeal, tier2Row, tier3Row);
            showRows(!isBuff && leveled, upcastRow);
            showRows(hasRider, riderNameRow, riderTypeRow, riderMagRow, riderDurRow);
            showRows(hasRider && Status.EFFECT_TYPE_NAMES[Status.STAT_MODIFIER].equals(riderType.getValue()), riderAttrRow);
            // Heals/buffs always apply the rider and auto-hits always land at tier 3, so min tier is moot
            showRows(hasRider && !isHeal && !isBuff && !isAuto, riderTierRow);
            preview.setText(previewText(res, dieValue(tier1Combo), dieValue(tier2Combo), dieValue(tier3Combo), flatSpinner.getValue()));
        };
        resolutionCombo.valueProperty().addListener((o, a, b) -> {
            // Friendly spells default to allies, harmful ones to enemies
            if (Spell.HEAL.equals(b) || Spell.BUFF.equals(b)) {
                if (Spell.TARGET_ENEMY.equals(targetCombo.getValue())) targetCombo.setValue(Spell.TARGET_ALLY);
            } else if (Spell.TARGET_ALLY.equals(targetCombo.getValue())) {
                targetCombo.setValue(Spell.TARGET_ENEMY);
            }
            update.run();
        });
        levelSpinner.valueProperty().addListener((o, a, b) -> update.run());
        riderCheck.selectedProperty().addListener((o, a, b) -> update.run());
        riderType.valueProperty().addListener((o, a, b) -> update.run());
        for (ComboBox<String> c : java.util.List.of(tier1Combo, tier2Combo, tier3Combo)) {
            c.valueProperty().addListener((o, a, b) -> update.run());
        }
        flatSpinner.valueProperty().addListener((o, a, b) -> update.run());
        areaCombo.valueProperty().addListener((o, a, b) -> update.run());
        update.run();

        Button okBtn = new Button(existing != null ? "Save" : "Create");
        okBtn.getStyleClass().add("button-primary");
        okBtn.setDefaultButton(true);
        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> dialog.close());
        okBtn.setOnAction(e -> {
            commitSpinners(levelSpinner, rangeSpinner, flatSpinner, riderMagnitude, riderDuration, riderMinTier, areaSizeSpinner);
            String name = nameField.getText().trim();
            if (name.isEmpty()) {
                DialogUtils.showAlert(Alert.AlertType.WARNING, "Missing Name", "Give the spell a name.");
                return;
            }
            Spell clash = SpellDatabase.getInstance().getSpell(name);
            if (clash != null && clash != existing) {
                DialogUtils.showAlert(Alert.AlertType.WARNING, "Duplicate Name", "A spell named " + name + " already exists.");
                return;
            }
            if (Spell.BUFF.equals(resolutionCombo.getValue())
                    && (!riderCheck.isSelected() || riderName.getText().trim().isEmpty())) {
                DialogUtils.showAlert(Alert.AlertType.WARNING, "Buff Needs an Effect", "A BUFF spell does nothing without a named status effect.");
                return;
            }
            spell.setName(name);
            spell.setColor(ColorUtils.toHex(colorPicker.getValue()));
            spell.setLevel(levelSpinner.getValue());
            spell.setSchool(schoolField.getText().trim());
            spell.setDescription(descArea.getText().trim());
            spell.setResolution(resolutionCombo.getValue());
            spell.setTargetType(targetCombo.getValue());
            spell.setRange(rangeSpinner.getValue());
            spell.setArea(areaCombo.getValue());
            spell.setAreaSize(areaSizeSpinner.getValue());
            spell.setFriendlyFire(friendlyFireCheck.isSelected());
            spell.setDamageDice(new String[]{dieValue(tier1Combo), dieValue(tier2Combo), dieValue(tier3Combo)});
            spell.setUpcastDie(dieValue(upcastCombo));
            spell.setFlatDamage(flatSpinner.getValue());
            spell.setAddCastingMod(castingModCheck.isSelected());
            spell.setSaveStat(saveStatCombo.getValue());
            spell.setOnSave(onSaveCombo.getValue());
            if (riderCheck.isSelected() && !riderName.getText().trim().isEmpty()) {
                int effect = Arrays.asList(Status.EFFECT_TYPE_NAMES).indexOf(riderType.getValue());
                int attrIndex = Arrays.asList(STAT_TYPES).indexOf(riderAttr.getValue());
                spell.setRiderStatus(new Status(riderName.getText().trim(), effect, riderMagnitude.getValue(),
                    riderDuration.getValue() == 0 ? 1 : riderDuration.getValue(),
                    effect == Status.STAT_MODIFIER ? attrIndex : -1));
            } else {
                spell.setRiderStatus(null);
            }
            spell.setRiderMinTier(riderMinTier.getValue());
            SpellDatabase.getInstance().renameSpell(originalName, spell);
            dialog.close();
            if (onSaved != null) onSaved.run();
        });
        HBox buttons = new HBox(10, okBtn, cancelBtn);
        grid.add(buttons, 0, row, 2, 1);

        // Fit-to-width ScrollPane so the long form scrolls instead of clipping
        ScrollPane scroll = new ScrollPane(grid);
        scroll.setFitToWidth(true);
        scroll.getStyleClass().add("panel-dark");
        scroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        Scene scene = new Scene(scroll, WIDTH, HEIGHT);
        StyleUtils.applyTheme(scene);
        dialog.setScene(scene);
        return dialog;
    }

    /** "Rolls 2d10 + d6 + 3 at tier 3" style hint so the dice choice reads as an outcome. */
    private static String previewText(String res, String t1, String t2, String t3, int flat) {
        if (Spell.BUFF.equals(res)) return "Buff: no roll, the status effect is applied directly.";
        String flatStr = flat == 0 ? "" : (flat > 0 ? " + " : " - ") + Math.abs(flat);
        if (Spell.HEAL.equals(res)) {
            return t1 == null ? "Heals nothing - pick a heal die." : "Heals " + t1 + flatStr + ".";
        }
        String tier1 = join(t1);
        String tier2 = join(t1, t2);
        String tier3 = join(t1, t2, t3);
        if (Spell.AUTO.equals(res)) {
            return tier3.isEmpty() ? "Deals no damage." : "Always hits for " + tier3 + flatStr + ".";
        }
        if (tier3.isEmpty()) return "No damage dice: only the status effect matters.";
        return "Tier 1: " + tier1 + flatStr + "   Tier 2: " + tier2 + flatStr + "   Tier 3: " + tier3 + flatStr;
    }

    private static String join(String... dice) {
        java.util.List<String> list = new java.util.ArrayList<>();
        for (String d : dice) if (d != null) list.add(d);
        return list.isEmpty() ? "" : UI.Battle.CombatManager.formatDiceList(list);
    }

    private static Spinner<Integer> spinner(int min, int max, int value) {
        Spinner<Integer> s = new Spinner<>(min, max, Math.max(min, Math.min(max, value)));
        s.setEditable(true);
        FormUtils.styleSpinner(s);
        return s;
    }

    /** Editable spinners only commit typed text on focus loss/Enter; commit before reading. */
    @SafeVarargs
    private static void commitSpinners(Spinner<Integer>... spinners) {
        for (Spinner<Integer> s : spinners) {
            try {
                s.commitValue();
            } catch (Exception ignored) {
                // invalid text: keep the last committed value
            }
        }
    }

    private static Label sectionLabel(String text) {
        Label l = new Label(text);
        l.getStyleClass().add("label-header");
        l.setPadding(new Insets(6, 0, 0, 0));
        return l;
    }

    private static ComboBox<String> dieCombo(String current) {
        ComboBox<String> combo = new ComboBox<>();
        combo.getItems().add(NO_DIE);
        combo.getItems().addAll(DICE_TYPES);
        combo.getSelectionModel().select(current == null || current.isEmpty() ? NO_DIE : current);
        return combo;
    }

    private static String dieValue(ComboBox<String> combo) {
        String v = combo.getValue();
        return v == null || NO_DIE.equals(v) ? null : v;
    }

    /** Add a label/control row and return both nodes so the row can be shown/hidden as a unit. */
    private static Node[] addRow(GridPane grid, int row, String label, Node control) {
        Label l = new Label(label);
        grid.add(l, 0, row);
        grid.add(control, 1, row);
        return new Node[]{l, control};
    }

    private static void showRows(boolean visible, Node[]... rows) {
        for (Node[] pair : rows) {
            for (Node n : pair) {
                n.setVisible(visible);
                n.setManaged(visible);
            }
        }
    }
}
