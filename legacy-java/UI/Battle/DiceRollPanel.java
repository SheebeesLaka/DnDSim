package UI.Battle;

import EntityRes.Spell;
import Objects.GridObject;
import UI.AnimationUtils;
import UI.IconUtils;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.effect.DropShadow;
import javafx.scene.text.Text;
import javafx.scene.text.TextFlow;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Side panel for handling dice roll input during combat.
 * 
 * Flow:
 * 1. HIDDEN - Panel not visible
 * 2. D20_ROLL - Waiting for d20 attack roll input
 * 3. RESULT - Showing hit/miss result, if hit shows tier and awaits damage dice
 * 4. DAMAGE_ROLL - Waiting for damage dice input
 * 5. COMPLETE - Attack resolved, ready to hide
 */
public class DiceRollPanel extends VBox {

    public enum State {
        HIDDEN,
        D20_ROLL,
        SAVE_ROLL,
        AREA_ROLLS,
        RESULT_MISS,
        DAMAGE_ROLL,
        COMPLETE
    }
    
    private State currentState = State.HIDDEN;
    private GridObject attacker;
    private GridObject target;
    private int attackModifier;
    private int targetAC;
    private String[] damageDice;
    
    // Attack result
    private int d20Result;
    private int margin;
    private int tier;
    private List<String> diceToRoll;

    // Spell context (null spell = ordinary weapon attack)
    private Spell spell;
    private int slotLevel;
    private int casterLevel;
    private int damageBonus;          // flat bonus added to the dice total
    private int saveDC;
    private int saveModifier;
    private boolean halveDamage;      // successful save vs a HALF spell
    private boolean saveSucceeded;

    // Area spell context (null areaTargets = single-target flow)
    private List<GridObject> areaTargets;
    private int[] areaTiers;          // effective tier per target (a half-damage save counts as tier 1)
    private boolean[] areaSaved;
    private boolean[] areaHalf;
    private boolean[] areaCrit;
    private int areaMaxTier;
    private final List<TextField> areaRollInputs = new ArrayList<>();
    private final List<Label> areaResultLabels = new ArrayList<>();
    private final VBox areaRows = new VBox(4);
    private final Label areaPrompt = new Label();
    private final Button autoRollBtn = new Button("Auto-roll");
    private final VBox areaBox;
    private Consumer<AreaOutcome> onAreaComplete;

    // UI Components
    private final Label titleLabel;
    private final Label attackerLabel;
    private final Label targetLabel;
    private final Label infoLabel;
    private final Label resultLabel;
    private final VBox inputArea;
    private final TextField d20Input;
    private final Label d20Label;
    private final Label damagePromptLabel = new Label();
    private final VBox damageInputArea;
    private final List<TextField> damageInputs = new ArrayList<>();
    private final Button submitBtn;
    private final Button cancelBtn;
    private final TextFlow diceListLabel;
    private final Label tierLabel;
    private final HBox tierBox;
    
    // Callbacks
    private Consumer<AttackOutcome> onAttackComplete;
    private Runnable onCancel;
    
    /**
     * Result of a completed attack
     */
    public static class AttackOutcome {
        public final GridObject attacker;
        public final GridObject target;
        public final boolean hit;
        public final int tier;
        public final int totalDamage;
        public final int margin;
        public final int d20Roll;
        public final int modifier;
        public final int targetAC;
        // Spell-only fields (spell == null for weapon attacks)
        public Spell spell;
        public int slotLevel;
        public boolean applyRider;
        public boolean saved;

        public AttackOutcome(GridObject attacker, GridObject target, boolean hit, 
                           int tier, int totalDamage, int margin, int d20Roll, 
                           int modifier, int targetAC) {
            this.attacker = attacker;
            this.target = target;
            this.hit = hit;
            this.tier = tier;
            this.totalDamage = totalDamage;
            this.margin = margin;
            this.d20Roll = d20Roll;
            this.modifier = modifier;
            this.targetAC = targetAC;
        }
    }

    /** Per-target result of an area spell. */
    public static class AreaHit {
        public final GridObject target;
        public final int tier;          // 0 = missed / saved with no effect
        public final int damage;        // damage or healing
        public final boolean saved;
        public final boolean crit;
        public final boolean applyRider;

        AreaHit(GridObject target, int tier, int damage, boolean saved, boolean crit, boolean applyRider) {
            this.target = target;
            this.tier = tier;
            this.damage = damage;
            this.saved = saved;
            this.crit = crit;
            this.applyRider = applyRider;
        }
    }

    /** Result of a resolved area spell: one AreaHit per target caught in the area. */
    public static class AreaOutcome {
        public final GridObject caster;
        public final Spell spell;
        public final int slotLevel;
        public final List<AreaHit> hits;

        AreaOutcome(GridObject caster, Spell spell, int slotLevel, List<AreaHit> hits) {
            this.caster = caster;
            this.spell = spell;
            this.slotLevel = slotLevel;
            this.hits = hits;
        }
    }

    public DiceRollPanel() {
        setSpacing(10);
        setPadding(new Insets(12));
        setPrefWidth(210);
        setMinWidth(200);
        setMaxWidth(230);
        getStyleClass().addAll("card", "card-gold");

        // Header
        HBox headerBox = new HBox(8);
        headerBox.setAlignment(Pos.CENTER_LEFT);
        headerBox.getChildren().add(IconUtils.createIcon(IconUtils.Icon.TARGET, 18, "#daa520"));

        titleLabel = new Label("Attack Roll");
        titleLabel.getStyleClass().add("section-header");
        titleLabel.setStyle("-fx-font-size: 15px;");
        DropShadow glow = new DropShadow();
        glow.setColor(Color.web("#daa52080"));
        glow.setRadius(6);
        titleLabel.setEffect(glow);
        headerBox.getChildren().add(titleLabel);

        // Attacker/Target info
        attackerLabel = new Label("Attacker: --");
        attackerLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc;");

        targetLabel = new Label("Target: --");
        targetLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc;");

        infoLabel = new Label("Modifier: +0 | AC: 10");
        infoLabel.getStyleClass().add("label-muted");

        Separator sep1 = new Separator();

        // Input area
        inputArea = new VBox(8);

        d20Label = new Label("Enter d20 roll:");
        d20Label.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc;");

        d20Input = new TextField();
        d20Input.setPromptText("1-20");
        d20Input.setPrefWidth(80);
        d20Input.setOnAction(e -> handleSubmit());
        
        // Restrict to numbers only
        d20Input.textProperty().addListener((obs, oldVal, newVal) -> {
            if (!newVal.matches("\\d*")) {
                d20Input.setText(newVal.replaceAll("[^\\d]", ""));
            }
        });

        Slider d20Slider = UI.FormUtils.attachRollSlider(d20Input, 1, 20);
        d20Slider.setPrefWidth(170);

        inputArea.getChildren().addAll(d20Label, d20Slider, d20Input);
        
        // Result area (initially hidden) - a colored banner stating just the outcome, no math
        resultLabel = new Label("");
        resultLabel.setContentDisplay(ContentDisplay.LEFT);
        resultLabel.setGraphicTextGap(8);
        resultLabel.setMaxWidth(Double.MAX_VALUE);
        resultLabel.setAlignment(Pos.CENTER);
        resultLabel.setWrapText(true);

        // Small centered "TIER N" pill, shown only on a hit/crit
        tierLabel = new Label("");
        tierLabel.getStyleClass().addAll("badge", "badge-primary");
        tierLabel.setStyle("-fx-font-size: 11px;");
        tierBox = new HBox(tierLabel);
        tierBox.setAlignment(Pos.CENTER);

        // Damage input area
        damageInputArea = new VBox(6);

        diceListLabel = new TextFlow();

        Separator sep2 = new Separator();
        sep2.setStyle("-fx-background-color: #505052;");
        
        // Buttons
        HBox buttonBox = new HBox(8);
        buttonBox.setAlignment(Pos.CENTER);
        
        submitBtn = new Button("Roll");
        submitBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.DICE));
        submitBtn.getStyleClass().add("button");
        // Text changes between "Roll"/"OK"/"Confirm" - never let it shrink below what the
        // longest label needs, or the text silently ellipsizes ("Conf...") instead of fitting.
        submitBtn.setMinWidth(Region.USE_PREF_SIZE);
        submitBtn.setOnAction(e -> handleSubmit());

        cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setMinWidth(Region.USE_PREF_SIZE);
        cancelBtn.setOnAction(e -> handleCancel());
        
        buttonBox.getChildren().addAll(submitBtn, cancelBtn);
        
        // Area spells: one d20 row per target, scrollable for big groups
        areaPrompt.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc;");
        areaPrompt.setWrapText(true);
        autoRollBtn.setText("Auto-roll empty");
        autoRollBtn.getStyleClass().add("button");
        autoRollBtn.setStyle("-fx-padding: 3 8 3 8; -fx-font-size: 11px;");
        autoRollBtn.setMinWidth(Region.USE_PREF_SIZE);
        autoRollBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.DICE, 12, "#dcdcdc"));
        autoRollBtn.setTooltip(new Tooltip("Fill every empty d20 with a random roll"));
        autoRollBtn.setOnAction(e -> {
            java.util.Random rng = new java.util.Random();
            for (TextField f : areaRollInputs) {
                if (f.getText().trim().isEmpty() && !f.isDisabled()) f.setText(String.valueOf(1 + rng.nextInt(20)));
            }
        });
        ScrollPane areaScroll = new ScrollPane(areaRows);
        areaScroll.setFitToWidth(true);
        areaScroll.setMaxHeight(230);
        areaScroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        areaBox = new VBox(6, areaPrompt, autoRollBtn, areaScroll);
        areaBox.setVisible(false);
        areaBox.setManaged(false);

        getChildren().addAll(headerBox, attackerLabel, targetLabel, infoLabel,
                            sep1, inputArea, areaBox, resultLabel, tierBox,
                            damageInputArea, diceListLabel, sep2, buttonBox);
        
        // Start hidden
        setVisible(false);
        setManaged(false);
    }
    
    /**
     * Start a new attack sequence
     */
    public void startAttack(GridObject attacker, GridObject target, 
                           Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        beginSequence(attacker, target, null, 0, onComplete, onCancel);

        // Get combat stats
        this.attackModifier = CombatManager.getAttackModifier(attacker);
        this.targetAC = CombatManager.getTargetAC(target);
        this.damageDice = CombatManager.getDamageDice(attacker);
        this.damageBonus = Math.floorDiv(attackModifier + 2, 2);

String modSign = attackModifier >= 0 ? "+" : "";
        String statType = CombatManager.getStatTypeName(attacker);
        infoLabel.setText(statType.substring(0, 3) + ": " + modSign + attackModifier + " | AC: " + targetAC);

        resetInputs();
        showD20Input("Attack Roll", "Enter d20 roll:", State.D20_ROLL);
    }

    private void beginSequence(GridObject attacker, GridObject target, Spell spell, int slotLevel,
                               Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        this.attacker = attacker;
        this.target = target;
        this.spell = spell;
        this.slotLevel = slotLevel;
        this.casterLevel = CombatManager.getCasterLevel(attacker);
        this.onAttackComplete = onComplete;
        this.onCancel = onCancel;
        this.halveDamage = false;
        this.saveSucceeded = false;
        this.d20Result = 0;
        this.margin = 0;
        this.tier = 0;
        this.areaTargets = null;
        this.onAreaComplete = null;
        attackerLabel.setText((spell != null ? "Caster: " : "Attacker: ") + CombatManager.getAttackerName(attacker));
        targetLabel.setText("Target: " + CombatManager.getTargetName(target));
    }

    /**
     * Spell damage bonus: the weapon formula applied to the casting stat (only if the spell opts in),
     * plus the spell's own flat bonus.
     */
    private int spellBonus(Spell spell, GridObject caster) {
        int mod = spell.isAddCastingMod() ? Math.floorDiv(CombatManager.getCastingModifier(caster) + 2, 2) : 0;
        return mod + spell.getFlatDamage();
    }

    private String slotSuffix() {
        if (spell == null || spell.isCantrip()) return "";
        return slotLevel > spell.getLevel() ? " (Lv" + slotLevel + ")" : "";
    }

    /** Spell attack: d20 + casting stat vs AC, tiers exactly like a weapon attack. */
    public void startSpellAttack(GridObject caster, GridObject target, Spell spell, int slotLevel,
                                 Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        beginSequence(caster, target, spell, slotLevel, onComplete, onCancel);
        this.attackModifier = CombatManager.getSpellAttackModifier(caster);
        this.targetAC = CombatManager.getTargetAC(target);
        this.damageBonus = spellBonus(spell, caster);
        String modSign = attackModifier >= 0 ? "+" : "";
        infoLabel.setText("Spell atk: " + modSign + attackModifier + " | AC: " + targetAC);
        resetInputs();
        showD20Input(spell.getName() + slotSuffix(), "Enter spell attack d20:", State.D20_ROLL);
    }

    /** Saving throw spell: the target rolls d20 + save stat vs the caster's DC. */
    public void startSavingThrow(GridObject caster, GridObject target, Spell spell, int slotLevel,
                                 Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        beginSequence(caster, target, spell, slotLevel, onComplete, onCancel);
        this.saveDC = CombatManager.getSpellSaveDC(caster);
        this.saveModifier = CombatManager.getSaveModifier(target, spell.getSaveStatIndex());
        this.damageBonus = spellBonus(spell, caster);
        String stat = spell.getSaveStat() != null && spell.getSaveStat().length() >= 3
                ? spell.getSaveStat().substring(0, 3) : "DEX";
        String modSign = saveModifier >= 0 ? "+" : "";
        infoLabel.setText("DC " + saveDC + " | " + stat + " save " + modSign + saveModifier);
        resetInputs();
        showD20Input(spell.getName() + slotSuffix(), "Enter target's d20 save:", State.SAVE_ROLL);
    }

    /** Healing spell: no roll to hit, straight to the heal dice. */
    public void startHeal(GridObject caster, GridObject target, Spell spell, int slotLevel,
                          Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        beginSequence(caster, target, spell, slotLevel, onComplete, onCancel);
        this.damageBonus = spellBonus(spell, caster);
        infoLabel.setText("Healing" + (damageBonus != 0 ? " | +" + damageBonus + " bonus" : ""));
        resetInputs();
        titleLabel.setText(spell.getName() + slotSuffix());
        inputArea.setVisible(false);
        inputArea.setManaged(false);
        tier = 1;
        setResultBanner("HEALING", IconUtils.Icon.CHECK, "#4CAF50", "rgba(76, 175, 80, 0.15)");
        enterDamageStep(CombatManager.getSpellDice(spell, 1, casterLevel, slotLevel), "Enter heal rolls:");
        showPanel();
        if (!damageInputs.isEmpty()) {
            damageInputs.get(0).requestFocus();
        }
    }

    /** Auto-hit spell: no roll to hit, every tier's dice are rolled (Magic Missile style). */
    public void startAutoHit(GridObject caster, GridObject target, Spell spell, int slotLevel,
                             Consumer<AttackOutcome> onComplete, Runnable onCancel) {
        beginSequence(caster, target, spell, slotLevel, onComplete, onCancel);
        this.damageBonus = spellBonus(spell, caster);
        infoLabel.setText("Auto-hit | no roll needed");
        resetInputs();
        titleLabel.setText(spell.getName() + slotSuffix());
        inputArea.setVisible(false);
        inputArea.setManaged(false);
        tier = 3;
        setResultBanner("AUTO-HIT", IconUtils.Icon.LIGHTNING, "#b9a8f5", "rgba(123, 104, 238, 0.15)");
        enterDamageStep(CombatManager.getSpellDice(spell, 3, casterLevel, slotLevel), "Enter damage rolls:");
        showPanel();
        if (!damageInputs.isEmpty()) {
            damageInputs.get(0).requestFocus();
        }
    }

    private void resetInputs() {
        d20Input.clear();
        d20Input.setDisable(false);
        resultLabel.setText("");
        resultLabel.setGraphic(null);
        resultLabel.setStyle("");
        tierLabel.setText("");
        tierBox.setVisible(false);
        tierBox.setManaged(false);
        damageInputArea.getChildren().clear();
        damageInputs.clear();
        diceListLabel.getChildren().clear();
        submitBtn.setText("Roll");
        damageInputArea.setVisible(false);
        damageInputArea.setManaged(false);
        diceListLabel.setVisible(false);
        areaRows.getChildren().clear();
        areaRollInputs.clear();
        areaResultLabels.clear();
        areaBox.setVisible(false);
        areaBox.setManaged(false);
        autoRollBtn.setDisable(false);
    }

    /**
     * Area spell against every target caught in the template. ATTACK/SAVE spells collect one d20
     * per target; AUTO and HEAL go straight to the (single, shared) damage/heal roll.
     */
    public void startAreaSpell(GridObject caster, List<GridObject> targets, Spell spell, int slotLevel,
                               Consumer<AreaOutcome> onComplete, Runnable onCancel) {
        beginSequence(caster, targets.get(0), spell, slotLevel, null, onCancel);
        this.areaTargets = new ArrayList<>(targets);
        this.onAreaComplete = onComplete;
        this.damageBonus = spellBonus(spell, caster);
        int n = targets.size();
        areaTiers = new int[n];
        areaSaved = new boolean[n];
        areaHalf = new boolean[n];
        areaCrit = new boolean[n];
        targetLabel.setText("Targets: " + n + " in " + spell.getAreaLabel().toLowerCase());
        resetInputs();
        titleLabel.setText(spell.getName() + slotSuffix());
        inputArea.setVisible(false);
        inputArea.setManaged(false);

        switch (spell.getResolution()) {
            case Spell.ATTACK, Spell.SAVE -> {
                boolean save = Spell.SAVE.equals(spell.getResolution());
                if (save) {
                    saveDC = CombatManager.getSpellSaveDC(caster);
                    String stat = spell.getSaveStat().substring(0, Math.min(3, spell.getSaveStat().length()));
                    infoLabel.setText("DC " + saveDC + " | " + stat + " save each"
                        + (Spell.ON_SAVE_HALF.equals(spell.getOnSave()) ? " (half)" : ""));
                    areaPrompt.setText("Each target's d20 save:");
                } else {
                    attackModifier = CombatManager.getSpellAttackModifier(caster);
                    infoLabel.setText("Spell atk " + (attackModifier >= 0 ? "+" : "") + attackModifier + " vs each AC");
                    areaPrompt.setText("Attack d20 per target:");
                }
                for (GridObject t : targets) {
                    String detail = save
                        ? signed(CombatManager.getSaveModifier(t, spell.getSaveStatIndex()))
                        : "AC " + CombatManager.getTargetAC(t);
                    addAreaRow(CombatManager.getTargetName(t), detail);
                }
                areaBox.setVisible(true);
                areaBox.setManaged(true);
                currentState = State.AREA_ROLLS;
                showPanel();
                if (!areaRollInputs.isEmpty()) areaRollInputs.get(0).requestFocus();
            }
            default -> {
                // AUTO: everyone takes every tier's dice. HEAL: everyone gets the heal die.
                boolean heal = Spell.HEAL.equals(spell.getResolution());
                int t = heal ? 1 : 3;
                java.util.Arrays.fill(areaTiers, t);
                areaMaxTier = t;
                infoLabel.setText(heal ? "Heals every ally in the area" : "Auto-hit | no roll needed");
                setResultBanner(heal ? "HEALING x" + n : "AUTO-HIT x" + n,
                    heal ? IconUtils.Icon.CHECK : IconUtils.Icon.LIGHTNING,
                    heal ? "#4CAF50" : "#b9a8f5", heal ? "rgba(76, 175, 80, 0.15)" : "rgba(123, 104, 238, 0.15)");
                enterDamageStep(CombatManager.getSpellDice(spell, t, casterLevel, slotLevel),
                    heal ? "Enter heal rolls (shared):" : "Enter damage rolls (shared):");
                showPanel();
                if (!damageInputs.isEmpty()) damageInputs.get(0).requestFocus();
            }
        }
    }

    private static String signed(int v) {
        return (v >= 0 ? "+" : "") + v;
    }

    private void addAreaRow(String name, String detail) {
        // Name over its save/AC detail, so long names don't squeeze the input
        Label nameLabel = new Label(name);
        nameLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #dcdcdc;");
        Label detailLabel = new Label(detail);
        detailLabel.getStyleClass().add("label-muted");
        detailLabel.setStyle("-fx-font-size: 10px;");
        VBox who = new VBox(0, nameLabel, detailLabel);
        who.setMinWidth(0);
        who.setPrefWidth(84);
        HBox.setHgrow(who, Priority.ALWAYS);
        TextField field = new TextField();
        field.setPromptText("d20");
        field.setStyle("-fx-padding: 3 5 3 5;");
        field.setMinWidth(40);
        field.setPrefWidth(40);
        field.setMaxWidth(40);
        field.textProperty().addListener((obs, o, v) -> {
            if (!v.matches("\\d*")) field.setText(v.replaceAll("[^\\d]", ""));
        });
        int index = areaRollInputs.size();
        field.setOnAction(e -> {
            if (index < areaRollInputs.size() - 1) areaRollInputs.get(index + 1).requestFocus();
            else handleSubmit();
        });
        Label result = new Label();
        result.setStyle("-fx-font-size: 11px; -fx-font-weight: bold;");
        result.setMinWidth(40);
        HBox row = new HBox(6, who, field, result);
        row.setAlignment(Pos.CENTER_LEFT);
        areaRows.getChildren().add(row);
        areaRollInputs.add(field);
        areaResultLabels.add(result);
    }

    private void processAreaRolls() {
        int n = areaTargets.size();
        int[] rolls = new int[n];
        for (int i = 0; i < n; i++) {
            String text = areaRollInputs.get(i).getText().trim();
            try {
                rolls[i] = Integer.parseInt(text);
            } catch (NumberFormatException e) {
                rolls[i] = 0;
            }
            if (rolls[i] < 1 || rolls[i] > 20) {
                showError("Enter a d20 (1-20) for every target");
                areaRollInputs.get(i).requestFocus();
                return;
            }
        }

        boolean save = Spell.SAVE.equals(spell.getResolution());
        boolean halfOnSave = save && Spell.ON_SAVE_HALF.equals(spell.getOnSave()) && hasDamageDice();
        areaMaxTier = 0;
        int affected = 0;
        for (int i = 0; i < n; i++) {
            GridObject t = areaTargets.get(i);
            Label result = areaResultLabels.get(i);
            areaRollInputs.get(i).setDisable(true);
            if (save) {
                int total = rolls[i] + CombatManager.getSaveModifier(t, spell.getSaveStatIndex());
                int fail = CombatManager.getSaveFailTier(saveDC, total);
                if (fail == 0) {
                    areaSaved[i] = true;
                    areaHalf[i] = halfOnSave;
                    areaTiers[i] = halfOnSave ? 1 : 0;
                    result.setText(halfOnSave ? "Half" : "Saved");
                    result.setStyle(result.getStyle() + " -fx-text-fill: " + (halfOnSave ? "#FFB74D" : "#d75f5f") + ";");
                } else {
                    areaTiers[i] = fail;
                    result.setText("T" + fail);
                    result.setStyle(result.getStyle() + " -fx-text-fill: #4CAF50;");
                }
            } else {
                int m = CombatManager.calculateMargin(rolls[i], attackModifier, CombatManager.getTargetAC(t));
                areaTiers[i] = CombatManager.getAttackTier(m);
                areaCrit[i] = areaTiers[i] > 0 && rolls[i] == 20;
                result.setText(areaTiers[i] == 0 ? "Miss" : (areaCrit[i] ? "Crit " : "") + "T" + areaTiers[i]);
                result.setStyle(result.getStyle() + " -fx-text-fill: " + (areaTiers[i] == 0 ? "#d75f5f"
                    : areaCrit[i] ? "#FFD54F" : "#4CAF50") + ";");
            }
            areaMaxTier = Math.max(areaMaxTier, areaTiers[i]);
            if (areaTiers[i] > 0) affected++;
        }
        autoRollBtn.setDisable(true);

        if (areaMaxTier == 0) {
            currentState = State.RESULT_MISS;
            setResultBanner(save ? "ALL SAVED" : "ALL MISSED", IconUtils.Icon.CLOSE, "#d75f5f", "rgba(215, 95, 95, 0.15)");
            submitBtn.setText("OK");
            return;
        }
        setResultBanner(affected + "/" + n + (save ? " AFFECTED" : " HIT"), IconUtils.Icon.CHECK,
            "#4CAF50", "rgba(76, 175, 80, 0.15)");
        tierLabel.setText("ROLL FOR TIER " + areaMaxTier);
        tierBox.setVisible(true);
        tierBox.setManaged(true);
        enterDamageStep(CombatManager.getSpellDice(spell, areaMaxTier, casterLevel, slotLevel),
            "Enter damage rolls (shared):");
    }

    /** Split the shared roll across targets by tier, then hand the per-target results back. */
    private void completeArea(List<Integer> rolled) {
        currentState = State.COMPLETE;
        List<AreaHit> hits = new ArrayList<>();
        for (int i = 0; i < areaTargets.size(); i++) {
            int t = areaTiers[i];
            int dmg = 0;
            if (t > 0 && !rolled.isEmpty()) {
                dmg = CombatManager.sumRolledForTier(spell, rolled, areaMaxTier, t);
                if (areaCrit[i]) dmg = (int) Math.ceil(dmg * 1.5);
                dmg = Math.max(0, dmg + damageBonus);
                if (areaHalf[i]) dmg = dmg / 2;
            }
            boolean rider = spell.isFriendly() || (t > 0 && !areaSaved[i] && t >= spell.getRiderMinTier());
            hits.add(new AreaHit(areaTargets.get(i), t, dmg, areaSaved[i], areaCrit[i], rider));
        }
        AreaOutcome outcome = new AreaOutcome(attacker, spell, slotLevel, hits);
        Consumer<AreaOutcome> callback = onAreaComplete;
        hide();
        autoRollBtn.setDisable(false);
        if (callback != null) callback.accept(outcome);
    }

    private void showD20Input(String title, String prompt, State state) {
        currentState = state;
        titleLabel.setText(title);
        d20Label.setText(prompt);
        inputArea.setVisible(true);
        inputArea.setManaged(true);
        showPanel();
        d20Input.requestFocus();
    }

    private void showPanel() {
        setVisible(true);
        setManaged(true);
        AnimationUtils.slideIn(this, AnimationUtils.SlideDirection.RIGHT, AnimationUtils.MEDIUM);
    }
    
    private void handleSubmit() {
        switch (currentState) {
            case D20_ROLL -> processD20Roll();
            case SAVE_ROLL -> processSaveRoll();
            case AREA_ROLLS -> processAreaRolls();
case DAMAGE_ROLL -> processDamageRoll();
            case RESULT_MISS -> {
                if (areaTargets != null) completeArea(List.of());
                else completeAttack(0);
            }
            default -> {}
        }
    }
    
    /** Parse the d20 field into d20Result; false (with an error flash) if invalid. */
    private boolean readD20() {
        String text = d20Input.getText().trim();
        if (text.isEmpty()) {
            showError("Please enter the d20 roll");
            return false;
        }
        try {
            d20Result = Integer.parseInt(text);
            if (d20Result < 1 || d20Result > 20) {
                showError("d20 must be 1-20");
                return false;
            }
        } catch (NumberFormatException e) {
            showError("Invalid number");
            return false;
        }
        return true;
    }

    private void processSaveRoll() {
        if (!readD20()) return;
        d20Input.setDisable(true);
        int total = d20Result + saveModifier;
        tier = CombatManager.getSaveFailTier(saveDC, total);
        margin = total - saveDC;

        if (tier == 0) {
            saveSucceeded = true;
            boolean half = Spell.ON_SAVE_HALF.equals(spell.getOnSave()) && hasDamageDice();
            if (half) {
                halveDamage = true;
                tier = 1;
                setResultBanner("SAVED - HALF", IconUtils.Icon.CLOSE, "#FFB74D", "rgba(255, 183, 77, 0.15)");
                enterDamageStep(CombatManager.getSpellDice(spell, 1, casterLevel, slotLevel), "Enter damage rolls (halved):");
            } else {
                currentState = State.RESULT_MISS;
                setResultBanner("SAVED", IconUtils.Icon.CLOSE, "#d75f5f", "rgba(215, 95, 95, 0.15)");
                submitBtn.setText("OK");
            }
            return;
        }

        setResultBanner("FAILED SAVE", IconUtils.Icon.CHECK, "#4CAF50", "rgba(76, 175, 80, 0.15)");
        tierLabel.setText("TIER " + tier);
        tierBox.setVisible(true);
        tierBox.setManaged(true);
        enterDamageStep(CombatManager.getSpellDice(spell, tier, casterLevel, slotLevel), "Enter damage rolls:");
    }

    private boolean hasDamageDice() {
        return !CombatManager.getSpellDice(spell, 1, casterLevel, slotLevel).isEmpty();
    }

    /** Switch to the dice-entry step; a spell with no dice just shows Confirm (riders still apply). */
    private void enterDamageStep(List<String> dice, String prompt) {
        currentState = State.DAMAGE_ROLL;
        diceToRoll = dice;
        if (!dice.isEmpty()) {
            updateDiceListDisplay(CombatManager.formatDiceList(dice), damageBonus);
            diceListLabel.setVisible(true);
        }
        damagePromptLabel.setText(prompt);
        setupDamageInputs();
        submitBtn.setText("Confirm");
    }

    private void processD20Roll() {
        if (!readD20()) return;

        // Calculate margin and tier
        margin = CombatManager.calculateMargin(d20Result, attackModifier, targetAC);
        tier = CombatManager.getAttackTier(margin);

        // Display result
        d20Input.setDisable(true);

        if (margin < 0) {
            // Miss - just state the outcome, no breakdown
            currentState = State.RESULT_MISS;
            setResultBanner("MISS", IconUtils.Icon.CLOSE, "#d75f5f", "rgba(215, 95, 95, 0.15)");
            tierBox.setVisible(false);
            tierBox.setManaged(false);
            submitBtn.setText("OK");
        } else {
            // Hit - state the outcome and tier, then request damage dice
            currentState = State.DAMAGE_ROLL;
            boolean isCritical = d20Result == 20;
            if (isCritical) {
                setResultBanner("CRITICAL HIT", IconUtils.Icon.LIGHTNING, "#FFD54F", "rgba(255, 213, 79, 0.15)");
            } else {
                setResultBanner("HIT", IconUtils.Icon.CHECK, "#4CAF50", "rgba(76, 175, 80, 0.15)");
            }

            tierLabel.setText("TIER " + tier);
            tierBox.setVisible(true);
            tierBox.setManaged(true);

            // Get dice to roll, plus the flat ability-modifier bonus applied to the final total
            List<String> dice = spell != null
                    ? CombatManager.getSpellDice(spell, tier, casterLevel, slotLevel)
                    : CombatManager.getDiceForTier(damageDice, tier);
            enterDamageStep(dice, "Enter damage rolls:");
        }
    }

    /**
     * Show just the outcome (no d20/AC math) as a colored icon banner.
     */
    private void setResultBanner(String text, IconUtils.Icon icon, String color, String backgroundRgba) {
        resultLabel.setText(text);
        resultLabel.setGraphic(IconUtils.createIcon(icon, 18, color));
        resultLabel.setStyle(
            "-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: " + color + "; " +
            "-fx-background-color: " + backgroundRgba + "; -fx-background-radius: 8; " +
            "-fx-border-color: " + color + "; -fx-border-width: 1.5; -fx-border-radius: 8; " +
            "-fx-padding: 8 12 8 12;"
        );
    }

/**
     * Render "Roll: <dice> +<bonus>" with the bonus colored green/red/gray by sign.
     */
    private void updateDiceListDisplay(String diceStr, int abilityModifier) {
        diceListLabel.getChildren().clear();

        Text rollText = new Text("Roll: " + diceStr + "  ");
        rollText.setStyle("-fx-fill: #dcdcdc; -fx-font-size: 12px;");

        String bonusColor = abilityModifier > 0 ? "#4CAF50" : abilityModifier < 0 ? "#d75f5f" : "#808080";
        String bonusSign = abilityModifier >= 0 ? "+" : "";
        String suffix = spell != null && Spell.HEAL.equals(spell.getResolution()) ? " heal" : " dmg";
        Text bonusText = new Text(bonusSign + abilityModifier + suffix);
        bonusText.setStyle("-fx-fill: " + bonusColor + "; -fx-font-size: 12px; -fx-font-weight: bold;");

        diceListLabel.getChildren().addAll(rollText, bonusText);
    }
    
    private void setupDamageInputs() {
        damageInputArea.getChildren().clear();
        damageInputs.clear();
        
        if (diceToRoll.isEmpty()) {
            damageInputArea.setVisible(false);
            damageInputArea.setManaged(false);
            return;
        }
        damagePromptLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #dcdcdc;");
        damageInputArea.getChildren().add(damagePromptLabel);
        
        // Create a field for each die
        for (int i = 0; i < diceToRoll.size(); i++) {
            String die = diceToRoll.get(i);
            HBox row = new HBox(8);
            row.setAlignment(Pos.CENTER_LEFT);
            
            Label dieLabel = new Label(die + ":");
            dieLabel.getStyleClass().add("label-muted");
            dieLabel.setPrefWidth(35);

            TextField input = new TextField();
            input.setPromptText(getMaxForDie(die));
            input.setPrefWidth(50);


            // Restrict to numbers
            input.textProperty().addListener((obs, oldVal, newVal) -> {
                if (!newVal.matches("\\d*")) {
                    input.setText(newVal.replaceAll("[^\\d]", ""));
                }
            });

            final int index = i;
            input.setOnAction(e -> {
                // Focus next field or submit
                if (index < damageInputs.size() - 1) {
                    damageInputs.get(index + 1).requestFocus();
                } else {
                    handleSubmit();
                }
            });

            damageInputs.add(input);
            Slider dieSlider = UI.FormUtils.attachRollSlider(input, 1, getMaxValue(die));
            dieSlider.setPrefWidth(90);
            row.getChildren().addAll(dieLabel, dieSlider, input);
            damageInputArea.getChildren().add(row);
        }
        
        damageInputArea.setVisible(true);
        damageInputArea.setManaged(true);
        
        if (!damageInputs.isEmpty()) {
            damageInputs.get(0).requestFocus();
        }
    }
    
    private String getMaxForDie(String die) {
        return switch (die.toLowerCase()) {
            case "d4" -> "1-4";
            case "d6" -> "1-6";
            case "d8" -> "1-8";
            case "d10" -> "1-10";
            case "d12" -> "1-12";
            case "d20" -> "1-20";
            default -> "1-6";
        };
    }
    
    private int getMaxValue(String die) {
        return switch (die.toLowerCase()) {
            case "d4" -> 4;
            case "d6" -> 6;
            case "d8" -> 8;
            case "d10" -> 10;
            case "d12" -> 12;
            case "d20" -> 20;
            default -> 6;
        };
    }
    
    private void processDamageRoll() {
        int totalDamage = 0;
        List<Integer> rolledValues = new ArrayList<>();

        // Validate and sum all damage inputs
        for (int i = 0; i < damageInputs.size(); i++) {
            TextField input = damageInputs.get(i);
            String text = input.getText().trim();
            
            if (text.isEmpty()) {
                showError("Please enter all dice rolls");
                input.requestFocus();
                return;
            }
            
            try {
                int value = Integer.parseInt(text);
                int maxVal = getMaxValue(diceToRoll.get(i));
                if (value < 1 || value > maxVal) {
                    showError(diceToRoll.get(i) + " must be 1-" + maxVal);
                    input.requestFocus();
                    return;
                }
                totalDamage += value;
                rolledValues.add(value);
            } catch (NumberFormatException e) {
                showError("Invalid number");
                input.requestFocus();
                return;
            }
        }

        if (areaTargets != null) {
            completeArea(rolledValues);
            return;
        }

        // Critical hit rule: natural 20 on an attack roll multiplies final rolled dice damage by 1.5.
        // Saves and heals have no attack roll, so they never crit.
        boolean attackRoll = spell == null || Spell.ATTACK.equals(spell.getResolution());
        if (attackRoll && d20Result == 20) {
            totalDamage = (int) Math.ceil(totalDamage * 1.5);
        }

        // Ability modifier is a flat bonus added on top of the (possibly crit-multiplied) dice total.
        if (!diceToRoll.isEmpty()) {
            totalDamage = Math.max(0, totalDamage + damageBonus);
        }
        if (halveDamage) {
            totalDamage = totalDamage / 2;
        }

        completeAttack(totalDamage);
    }
    
    private void completeAttack(int totalDamage) {
        currentState = State.COMPLETE;
        
        // Create outcome
        AttackOutcome outcome = new AttackOutcome(
            attacker, target,
            tier > 0, tier, totalDamage, margin,
            d20Result, attackModifier, targetAC
        );
        if (spell != null) {
            outcome.spell = spell;
            outcome.slotLevel = slotLevel;
            outcome.saved = saveSucceeded;
            // Riders land on a hit / failed save at or above the spell's minimum tier; heals always apply
            outcome.applyRider = spell.isFriendly() || (tier > 0 && !saveSucceeded && tier >= spell.getRiderMinTier());
        }

        // Hide panel
        hide();
        
        // Notify callback
        if (onAttackComplete != null) {
            onAttackComplete.accept(outcome);
        }
    }
    
    private void handleCancel() {
        hide();
        if (onCancel != null) {
            onCancel.run();
        }
    }
    
    private void showError(String message) {
        // Flash the result label with error
        String originalText = resultLabel.getText();
        String originalStyle = resultLabel.getStyle();
        
        resultLabel.setText(message);
        resultLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #d75f5f;");
        
        // Reset after delay
        javafx.animation.PauseTransition pause = new javafx.animation.PauseTransition(
            javafx.util.Duration.millis(1500)
        );
        pause.setOnFinished(e -> {
            if (currentState != State.HIDDEN && currentState != State.COMPLETE) {
                resultLabel.setText(originalText);
                resultLabel.setStyle(originalStyle);
            }
        });
        pause.play();
    }
    
    public void hide() {
        currentState = State.HIDDEN;
        setVisible(false);
        setManaged(false);
        attacker = null;
        target = null;
        spell = null;
        areaTargets = null;
    }
    
    public boolean isActive() {
        return currentState != State.HIDDEN && currentState != State.COMPLETE;
    }
    
    public State getState() {
        return currentState;
    }
}
