package UI.Battle;

import Objects.Entity;
import Objects.Enemy;
import Objects.GridObject;
import UI.AnimationUtils;
import UI.IconUtils;
import UI.SpriteUtils;
import javafx.animation.*;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.control.TextFormatter;
import javafx.scene.control.Tooltip;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.util.Duration;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

public class TimelinePane extends HBox {

    private static final int PORTRAIT_SIZE = 44;
    private static final int RING_SIZE = 50;

    private final TurnManager turnManager;
    private final Label roundLabel;
    private final VBox roundBox;
    private final HBox entitiesBox;
    private final ScrollPane entitiesScroll;
    private javafx.scene.Node battleControls;
    private final Map<GridObject, VBox> combatantBoxes = new HashMap<>();
    private final Map<GridObject, javafx.scene.control.ProgressBar> hpBars = new HashMap<>();
    private final Map<GridObject, Label> hpLabels = new HashMap<>();
    private VBox currentHighlightedBox = null;
    private boolean initialBuild = true;
    private boolean setupMode = false;
    private List<Entity> rosterParty = java.util.Collections.emptyList();

    // Two Display Mode: a player-view strip is a read-only twin (no tooltips, no controls) that
    // hides whatever the DM's display settings say to. The DM strip forwards updates to it.
    private final UI.PlayerDisplayOptions playerOpts;  // null = the DM's own strip
    private TimelinePane mirror;

    public TimelinePane(TurnManager turnManager) {
        this(turnManager, null);
    }

    /** Read-only player-view strip for the Two Display Mode window. */
    public TimelinePane(TurnManager turnManager, UI.PlayerDisplayOptions playerOpts) {
        this.turnManager = turnManager;
        this.playerOpts = playerOpts;

        getStyleClass().add("timeline-pane");
        setSpacing(15);
        setPadding(new Insets(10));
        setAlignment(Pos.CENTER_LEFT);
        setPrefHeight(136);
        setMinHeight(136);
        setMaxHeight(136);

        // Left column: round label with the battle controls slot below it
        HBox labelRow = new HBox(8);
        labelRow.setAlignment(Pos.CENTER_LEFT);
        labelRow.getChildren().add(IconUtils.createIcon(IconUtils.Icon.CLOCK, 20, "#b8860b"));

        roundLabel = new Label("Round 0");
        roundLabel.getStyleClass().add("label-title");
        roundLabel.setMinWidth(80);
        labelRow.getChildren().add(roundLabel);

        roundBox = new VBox(6);
        roundBox.setAlignment(Pos.CENTER_LEFT);
        roundBox.setMinWidth(160);
        roundBox.setPrefWidth(160);
        roundBox.getChildren().add(labelRow);

        // Entities container, wrapped in a scroll pane so a long roster or
        // long names scroll (mouse wheel) instead of clipping past the window
        entitiesBox = new HBox(9);
        entitiesBox.setAlignment(Pos.CENTER_LEFT);

        entitiesScroll = new ScrollPane(entitiesBox);
        entitiesScroll.setFitToHeight(true);
        entitiesScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        entitiesScroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        entitiesScroll.setPannable(true);
        entitiesScroll.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        entitiesScroll.setOnScroll(e -> {
            double overflow = entitiesBox.getWidth() - entitiesScroll.getViewportBounds().getWidth();
            if (overflow > 0) {
                entitiesScroll.setHvalue(Math.max(0, Math.min(1,
                    entitiesScroll.getHvalue() - e.getDeltaY() / overflow)));
                e.consume();
            }
        });
        HBox.setHgrow(entitiesScroll, Priority.ALWAYS);

        getChildren().addAll(roundBox, entitiesScroll);

        refresh();
    }

    /** DM strip: start (or with null, stop) forwarding every update to a player-view strip. */
    public void attachMirror(TimelinePane playerStrip) {
        this.mirror = playerStrip;
        if (playerStrip != null) {
            playerStrip.rosterParty = rosterParty;
            playerStrip.initialBuild = true;
            if (setupMode) {
                playerStrip.showRollingInitiative(rosterParty);
            } else {
                playerStrip.refresh();
            }
        }
    }

    public TimelinePane getMirror() {
        return mirror;
    }

    /** Player view: rebuild every card, e.g. after the DM changed a display setting. */
    public void rebuild() {
        combatantBoxes.clear();
        if (!turnManager.isBattleStarted() || turnManager.getTurnOrder().isEmpty()) {
            rebuildRoster();
        } else {
            refresh();
        }
    }

    /** Player view stand-in for the DM's initiative entry: the roster under an "Initiative" heading. */
    private void showRollingInitiative(List<Entity> partyMembers) {
        rosterParty = partyMembers;
        rebuildRoster();
        roundLabel.setText("Initiative");
    }

    /** A portrait centered inside a colored faction ring (green party / red enemy). */
    private StackPane wrapPortrait(Node portrait, String ringColorHex) {
        Circle ring = new Circle(RING_SIZE / 2.0);
        ring.setFill(Color.TRANSPARENT);
        ring.setStroke(Color.web(ringColorHex));
        ring.setStrokeWidth(2.5);

        StackPane wrap = new StackPane(ring, portrait);
        wrap.setPrefSize(RING_SIZE, RING_SIZE);
        wrap.setMinSize(RING_SIZE, RING_SIZE);
        wrap.setMaxSize(RING_SIZE, RING_SIZE);
        return wrap;
    }

    /**
     * Place the battle control buttons (Begin/End, Next Turn) under the
     * round label. The pane doesn't care what the controls do.
     */
    public void setBattleControls(javafx.scene.Node controls) {
        if (battleControls != null) {
            roundBox.getChildren().remove(battleControls);
        }
        battleControls = controls;
        if (controls != null) {
            roundBox.getChildren().add(controls);
        }
    }

    /**
     * Switch the strip into inline initiative entry: one portrait per party
     * member with a typed d20 value (1-20), plus Begin/Cancel. Begin is
     * disabled whenever any value doesn't parse. Enemies roll automatically.
     */
    public void enterInitiativeSetup(List<Entity> partyMembers,
            Consumer<Map<Entity, Integer>> onConfirm, Runnable onCancel) {
        setupMode = true;
        entitiesBox.getChildren().clear();
        combatantBoxes.clear();
        currentHighlightedBox = null;
        roundLabel.setText("Initiative");
        if (mirror != null) {
            mirror.showRollingInitiative(partyMembers);
        }

        Map<Entity, TextField> fields = new LinkedHashMap<>();

        Button confirmBtn = new Button("Begin");
        confirmBtn.getStyleClass().add("button-primary");
        confirmBtn.setDisable(true);
        confirmBtn.setOnAction(e -> {
            Map<Entity, Integer> rolls = new LinkedHashMap<>();
            for (Map.Entry<Entity, TextField> entry : fields.entrySet()) {
                rolls.put(entry.getKey(), Integer.parseInt(entry.getValue().getText().trim()));
            }
            onConfirm.accept(rolls);
        });

        Button cancelBtn = new Button("Cancel");
        cancelBtn.getStyleClass().add("button");
        cancelBtn.setOnAction(e -> onCancel.run());

        for (Entity member : partyMembers) {
            VBox box = new VBox(4);
            box.setAlignment(Pos.CENTER);
            box.setMinWidth(64);
            box.setPadding(new Insets(8));
            box.getStyleClass().add("timeline-entity");

            box.getChildren().add(wrapPortrait(
                SpriteUtils.createCharacterSprite(member.getCharSheet(), PORTRAIT_SIZE), "#4CAF50"));

            Label nameLabel = new Label(member.getName());
            nameLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #dcdcdc; -fx-font-weight: bold;");
            box.getChildren().add(nameLabel);

            TextField field = new TextField("10");
            field.setPrefWidth(34);
            field.setMaxWidth(34);
            field.setAlignment(Pos.CENTER);
            field.getStyleClass().add("timeline-init-field");
            field.setTextFormatter(new TextFormatter<>(change ->
                change.getControlNewText().matches("\\d{0,2}") ? change : null));
            field.textProperty().addListener((obs, o, n) ->
                confirmBtn.setDisable(!allFieldsValid(fields)));
            fields.put(member, field);

            Button minusBtn = new Button();
            minusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.MINUS, 10, "#dcdcdc"));
            minusBtn.getStyleClass().addAll("spinner-button", "spinner-decrement");
            minusBtn.setMinSize(18, 18);
            minusBtn.setMaxSize(18, 18);
            minusBtn.setOnAction(e -> nudgeInitiative(field, -1));

            Button plusBtn = new Button();
            plusBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.PLUS, 10, "#dcdcdc"));
            plusBtn.getStyleClass().addAll("spinner-button", "spinner-increment");
            plusBtn.setMinSize(18, 18);
            plusBtn.setMaxSize(18, 18);
            plusBtn.setOnAction(e -> nudgeInitiative(field, 1));

            HBox tickerRow = new HBox(2, minusBtn, field, plusBtn);
            tickerRow.setAlignment(Pos.CENTER);
            box.getChildren().add(tickerRow);

            entitiesBox.getChildren().add(box);
        }

        // Fields start pre-filled with a valid 10, so Begin is usable right away; the
        // listeners above only re-check it once a value is edited.
        confirmBtn.setDisable(!allFieldsValid(fields));

        HBox buttons = new HBox(6, confirmBtn, cancelBtn);
        buttons.setAlignment(Pos.CENTER_LEFT);
        HBox.setMargin(buttons, new Insets(0, 0, 0, 8));
        entitiesBox.getChildren().add(buttons);

        if (!partyMembers.isEmpty()) {
            javafx.application.Platform.runLater(() -> fields.get(partyMembers.get(0)).requestFocus());
        }
    }

    /** Nudge an initiative field's value by delta, clamped to the 1-20 d20 range. */
    private void nudgeInitiative(TextField field, int delta) {
        int current;
        try {
            current = Integer.parseInt(field.getText().trim());
        } catch (NumberFormatException ex) {
            current = 10;
        }
        int next = Math.max(1, Math.min(20, current + delta));
        field.setText(String.valueOf(next));
    }

    private boolean allFieldsValid(Map<Entity, TextField> fields) {
        for (TextField f : fields.values()) {
            try {
                int v = Integer.parseInt(f.getText().trim());
                if (v < 1 || v > 20) return false;
            } catch (NumberFormatException ex) {
                return false;
            }
        }
        return true;
    }

    /** Leave initiative entry and return to the normal turn-order display. */
    public void exitInitiativeSetup() {
        if (!setupMode) return;
        setupMode = false;
        initialBuild = true; // replay the slide-in when the real order appears
        if (mirror != null) {
            mirror.initialBuild = true;
        }
        refresh();
    }

    /**
     * Pre-battle roster: show the party members on the field (with HP) while
     * there is no turn order yet.
     */
    public void showRoster(List<Entity> partyOnField) {
        rosterParty = partyOnField;
        if (!setupMode) {
            rebuildRoster();
        }
        if (mirror != null) {
            mirror.showRoster(partyOnField);
        }
    }

    private void rebuildRoster() {
        entitiesBox.getChildren().clear();
        combatantBoxes.clear();
        hpBars.clear();
        hpLabels.clear();
        currentHighlightedBox = null;
        roundLabel.setText("Setup");
        initialBuild = true;

        if (rosterParty.isEmpty()) {
            Label emptyLabel = new Label("No combatants on field. Add objects to begin.");
            emptyLabel.setStyle("-fx-font-style: italic; -fx-text-fill: #808080;");
            entitiesBox.getChildren().add(emptyLabel);
            return;
        }
        for (Entity member : rosterParty) {
            VBox box = createCombatantBox(member, false);
            combatantBoxes.put(member, box);
            entitiesBox.getChildren().add(box);
        }
        refreshHp();
    }

    /** Update every visible HP bar/label from the combatants' current HP. */
    public void refreshHp() {
        if (mirror != null) {
            mirror.refreshHp();
        }
        for (Map.Entry<GridObject, javafx.scene.control.ProgressBar> entry : hpBars.entrySet()) {
            GridObject combatant = entry.getKey();
            int hp;
            int maxHp;
            if (combatant instanceof Entity e) {
                hp = e.getCharSheet().getCurrentHP();
                maxHp = e.getCharSheet().getTotalHP();
            } else if (combatant instanceof Enemy en) {
                hp = en.getHealth();
                maxHp = en.getMaxHealth();
            } else {
                continue;
            }
            double pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / (double) maxHp)) : 0;
            javafx.scene.control.ProgressBar bar = entry.getValue();
            if (Math.abs(bar.getProgress() - pct) > 0.001) {
                AnimationUtils.animateProgressBar(bar, pct);
            }
            bar.getStyleClass().removeAll("progress-bar-success", "progress-bar-warning", "progress-bar-danger");
            bar.getStyleClass().add(pct > 0.5 ? "progress-bar-success" : pct > 0.25 ? "progress-bar-warning" : "progress-bar-danger");
            Label hpText = hpLabels.get(combatant);
            if (hpText != null) {
                hpText.setText(hp + "/" + maxHp);
            }
        }
    }

    public void refresh() {
        if (setupMode) return; // don't wipe the initiative fields
        if (mirror != null) {
            mirror.refresh();
        }

        List<GridObject> turnOrder = turnManager.getTurnOrder();

        // Pre-battle (turnOrder fills up as combatants are placed, but there
        // is no meaningful order yet) and empty states both show the roster
        if (!turnManager.isBattleStarted() || turnOrder.isEmpty()) {
            rebuildRoster();
            return;
        }

        int round = turnManager.getRound();
        int currentIndex = turnManager.getCurrentIndex();
        roundLabel.setText("Round " + round);

        // Check if we need to rebuild (combatants changed)
        boolean needsRebuild = combatantBoxes.size() != turnOrder.size();
        if (!needsRebuild) {
            for (GridObject combatant : turnOrder) {
                if (!combatantBoxes.containsKey(combatant)) {
                    needsRebuild = true;
                    break;
                }
            }
        }

        if (needsRebuild) {
            rebuildTimeline(turnOrder, currentIndex);
        } else {
            // Just update the highlight
            updateHighlight(turnOrder, currentIndex);
        }
        refreshHp();
    }

    private void rebuildTimeline(List<GridObject> turnOrder, int currentIndex) {
        entitiesBox.getChildren().clear();
        combatantBoxes.clear();
        hpBars.clear();
        hpLabels.clear();
        currentHighlightedBox = null;

        for (int i = 0; i < turnOrder.size(); i++) {
            GridObject combatant = turnOrder.get(i);
            VBox combatantBox = createCombatantBox(combatant, i == currentIndex);
            combatantBoxes.put(combatant, combatantBox);
            entitiesBox.getChildren().add(combatantBox);
            
            if (i == currentIndex) {
                currentHighlightedBox = combatantBox;
            }
            
            // Only do slide-in animation on initial build
            if (initialBuild) {
                final int index = i;
                combatantBox.setOpacity(0);
                PauseTransition delay = new PauseTransition(Duration.millis(50 * index));
                delay.setOnFinished(e -> AnimationUtils.slideIn(combatantBox, AnimationUtils.SlideDirection.UP));
                delay.play();
            }
        }
        
        // Apply initial highlight
        if (currentHighlightedBox != null && initialBuild) {
            PauseTransition pulseDelay = new PauseTransition(Duration.millis(50 * turnOrder.size() + 200));
            pulseDelay.setOnFinished(e -> applyGlow(currentHighlightedBox));
            pulseDelay.play();
        } else if (currentHighlightedBox != null) {
            applyGlow(currentHighlightedBox);
        }
        
        initialBuild = false;
    }

    private void updateHighlight(List<GridObject> turnOrder, int currentIndex) {
        GridObject currentCombatant = turnOrder.get(currentIndex);
        VBox newHighlight = combatantBoxes.get(currentCombatant);
        
        if (newHighlight == currentHighlightedBox) {
            return; // No change needed
        }
        
        // Remove highlight from old box with fade
        if (currentHighlightedBox != null) {
            VBox oldBox = currentHighlightedBox;
            oldBox.getStyleClass().remove("timeline-entity-current");
            oldBox.getStyleClass().add("timeline-entity");
            
            // Fade out the glow
            if (oldBox.getEffect() instanceof DropShadow glow) {
                Timeline fadeOutGlow = new Timeline(
                    new KeyFrame(Duration.millis(200), 
                        new KeyValue(glow.radiusProperty(), 0, Interpolator.EASE_OUT))
                );
                fadeOutGlow.setOnFinished(e -> oldBox.setEffect(null));
                fadeOutGlow.play();
            }
        }
        
        // Apply highlight to new box
        if (newHighlight != null) {
            newHighlight.getStyleClass().remove("timeline-entity");
            newHighlight.getStyleClass().add("timeline-entity-current");
            
            // Smooth glow transition
            applyGlowAnimated(newHighlight);
            currentHighlightedBox = newHighlight;
        }
    }

    private void applyGlow(VBox box) {
        DropShadow glow = new DropShadow();
        glow.setColor(Color.web("#b8860b"));
        glow.setRadius(8);
        glow.setSpread(0.4);
        box.setEffect(glow);
    }

    private void applyGlowAnimated(VBox box) {
        DropShadow glow = new DropShadow();
        glow.setColor(Color.web("#b8860b"));
        glow.setRadius(0);
        glow.setSpread(0.4);
        box.setEffect(glow);
        
        Timeline fadeInGlow = new Timeline(
            new KeyFrame(Duration.ZERO, 
                new KeyValue(glow.radiusProperty(), 0)),
            new KeyFrame(Duration.millis(300), 
                new KeyValue(glow.radiusProperty(), 8, Interpolator.EASE_OUT))
        );
        fadeInGlow.play();
    }

    private VBox createCombatantBox(GridObject combatant, boolean isCurrent) {
        VBox box = new VBox(4);
        box.setAlignment(Pos.CENTER);
        box.setMinWidth(64);
        box.setPadding(new Insets(8));

        if (isCurrent) {
            box.getStyleClass().addAll("timeline-entity", "timeline-entity-current");
        } else {
            box.getStyleClass().add("timeline-entity");
        }

        String name;
        Node portrait;
        String ringColor;
        boolean hasHp = true;
        if (combatant instanceof Entity e) {
            name = e.getName();
            portrait = SpriteUtils.createCharacterSprite(e.getCharSheet(), PORTRAIT_SIZE);
            ringColor = "#4CAF50";
        } else if (combatant instanceof Enemy en) {
            name = playerOpts != null && !playerOpts.showEnemyNames() ? anonymousEnemyName(en) : en.getName();
            portrait = SpriteUtils.createEnemySprite(en, PORTRAIT_SIZE);
            ringColor = "#d75f5f";
        } else {
            name = "Unknown";
            portrait = IconUtils.createIcon(IconUtils.Icon.SKULL, 24, "#808080");
            ringColor = "#808080";
            hasHp = false;
        }
        box.getChildren().add(wrapPortrait(portrait, ringColor));

        Label nameLabel = new Label(name);
        nameLabel.setStyle("-fx-font-weight: bold;");

        box.getChildren().add(nameLabel);

        // Mini HP readout, values filled in by refreshHp(). The player view trims it per the
        // DM's display settings: enemy HP exact / vague (bar only) / hidden, party numbers on/off.
        boolean showBar = hasHp;
        boolean showNumbers = hasHp;
        if (playerOpts != null && hasHp) {
            if (combatant instanceof Enemy) {
                UI.PlayerDisplayOptions.EnemyHp mode = playerOpts.getEnemyHp();
                showBar = mode != UI.PlayerDisplayOptions.EnemyHp.HIDDEN;
                showNumbers = mode == UI.PlayerDisplayOptions.EnemyHp.EXACT;
            } else {
                showNumbers = playerOpts.showPartyHpNumbers();
            }
        }
        if (showBar) {
            javafx.scene.control.ProgressBar hpBar = new javafx.scene.control.ProgressBar(1);
            hpBar.setPrefSize(70, 7);
            hpBar.setMinHeight(7);
            hpBar.setMaxHeight(7);
            hpBar.getStyleClass().add("hp-bar");
            box.getChildren().add(hpBar);
            hpBars.put(combatant, hpBar);
            if (showNumbers) {
                Label hpText = new Label();
                hpText.getStyleClass().addAll("label-muted", "label-caption");
                box.getChildren().add(hpText);
                hpLabels.put(combatant, hpText);
            }
        }

        if (playerOpts != null) {
            return box; // no initiative tooltip on the player screen - nothing there is hoverable
        }
        
        // Add tooltip with initiative info
        int initRoll = turnManager.getInitiativeRoll(combatant);
        int[] breakdown = turnManager.getRollBreakdown(combatant);
        String tooltipText = name + "\nInitiative: " + initRoll;
        if (breakdown[0] > 0 || breakdown[1] != 0) {
            tooltipText += " (d20: " + breakdown[0] + " + DEX: " + breakdown[1] + ")";
        }
        Tooltip tooltip = new Tooltip(tooltipText);
        tooltip.setShowDelay(javafx.util.Duration.millis(200));
        Tooltip.install(box, tooltip);

        // Hover feedback is handled by .timeline-entity:hover in the stylesheet

        return box;
    }

    /** "Enemy", or "Enemy 2", "Enemy 3"... numbered by position in the turn order. */
    private String anonymousEnemyName(Enemy enemy) {
        int index = 0;
        int count = 0;
        for (GridObject g : turnManager.getTurnOrder()) {
            if (g instanceof Enemy) {
                count++;
                if (g == enemy) index = count;
            }
        }
        return count <= 1 ? "Enemy" : "Enemy " + Math.max(1, index);
    }

}
