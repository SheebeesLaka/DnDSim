package UI.Battle;

import EntityRes.CharSheet;
import EntityRes.Status;
import Objects.Entity;
import UI.IconUtils;
import UI.SpriteUtils;
import javafx.animation.*;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.effect.DropShadow;
import javafx.scene.effect.Glow;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.util.Duration;

import java.util.List;
import java.util.Random;

/**
 * Final Fantasy-style victory screen displayed after winning a battle.
 * Shows "Victory!" title, latin quote, and party member status.
 */
public class VictoryView extends StackPane {

    // Latin quotes for victory - can be expanded
    private static final String[] LATIN_QUOTES = {
        "Victoria aut mors",           // Victory or death
        "Veni, vidi, vici",            // I came, I saw, I conquered
        "Per aspera ad astra",         // Through hardship to the stars
        "Fortis fortuna adiuvat",      // Fortune favors the bold
        "Aut vincere aut mori",        // Either to conquer or to die
        "Gloria in excelsis",          // Glory in the highest
        "Virtus in arduis",            // Courage in difficulties
        "Non ducor, duco",             // I am not led, I lead
        "Audentes fortuna iuvat",      // Fortune favors the bold
        "Nil desperandum"              // Never despair
    };

    private final Runnable onContinue;
    private final boolean showContinue;
    private final VBox contentBox;

    /**
     * Create a victory screen for the given party members.
     * 
     * @param partyMembers List of party entities to display
     * @param onContinue Callback when the continue button is pressed
     */
    public VictoryView(List<Entity> partyMembers, Runnable onContinue) {
        this(partyMembers, onContinue, true);
    }

    /**
     * @param showContinue false for the Two Display Mode player screen, which only watches -
     *                     the DM's own victory screen decides when the battle is over
     */
    public VictoryView(List<Entity> partyMembers, Runnable onContinue, boolean showContinue) {
        this.onContinue = onContinue;
        this.showContinue = showContinue;

        // Semi-transparent dark overlay
        getStyleClass().add("victory-overlay");
        
        contentBox = new VBox(20);
        contentBox.setAlignment(Pos.CENTER);
        contentBox.setPadding(new Insets(40));
        contentBox.setMaxWidth(500);
        contentBox.setMaxHeight(600);
        
        // Build the UI components
        createVictoryTitle();
        createLatinQuote();
        createPartyList(partyMembers);
        createContinueButton();
        
        getChildren().add(contentBox);
        
        // Initial state for animation
        setOpacity(0);
        contentBox.setScaleX(0.8);
        contentBox.setScaleY(0.8);
    }

    /**
     * Play the entrance animation.
     */
    public void playEntranceAnimation() {
        // Fade in the overlay
        FadeTransition fadeIn = new FadeTransition(Duration.millis(400), this);
        fadeIn.setFromValue(0);
        fadeIn.setToValue(1);
        
        // Scale up the content
        ScaleTransition scaleUp = new ScaleTransition(Duration.millis(500), contentBox);
        scaleUp.setFromX(0.8);
        scaleUp.setFromY(0.8);
        scaleUp.setToX(1.0);
        scaleUp.setToY(1.0);
        scaleUp.setInterpolator(Interpolator.EASE_OUT);
        
        // Play together
        ParallelTransition entrance = new ParallelTransition(fadeIn, scaleUp);
        entrance.play();
    }

    private void createVictoryTitle() {
        Label title = new Label("Victory!");
        title.getStyleClass().add("victory-title");

        // Golden glow effect
        DropShadow glow = new DropShadow();
        glow.setColor(Color.web("#FFD700"));
        glow.setRadius(20);
        glow.setSpread(0.4);

        Glow innerGlow = new Glow(0.6);
        innerGlow.setInput(glow);
        title.setEffect(innerGlow);

        // Subtle pulsing animation
        Timeline pulse = new Timeline(
            new KeyFrame(Duration.ZERO,
                new KeyValue(glow.radiusProperty(), 20)),
            new KeyFrame(Duration.millis(1000),
                new KeyValue(glow.radiusProperty(), 30))
        );
        pulse.setAutoReverse(true);
        pulse.setCycleCount(Animation.INDEFINITE);
        pulse.play();

        // Gold shield flourishes flanking the title
        Node leftShield = IconUtils.createIcon(IconUtils.Icon.SHIELD, 32, "#FFD700");
        Node rightShield = IconUtils.createIcon(IconUtils.Icon.SHIELD, 32, "#FFD700");
        HBox titleRow = new HBox(16, leftShield, title, rightShield);
        titleRow.setAlignment(Pos.CENTER);

        contentBox.getChildren().add(titleRow);
    }

    private void createLatinQuote() {
        // Random quote from the list
        Random random = new Random();
        String quote = LATIN_QUOTES[random.nextInt(LATIN_QUOTES.length)];
        
        Label quoteLabel = new Label("\"" + quote + "\"");
        quoteLabel.getStyleClass().add("victory-quote");
        quoteLabel.setStyle("-fx-font-family: 'Georgia', serif;");
        
        contentBox.getChildren().add(quoteLabel);
        
        // Add a separator
        Region separator = new Region();
        separator.setMinHeight(1);
        separator.setMaxWidth(300);
        separator.setStyle("-fx-background-color: linear-gradient(to right, transparent, #FFD70080, transparent);");
        VBox.setMargin(separator, new Insets(10, 0, 10, 0));
        contentBox.getChildren().add(separator);
    }

    private void createPartyList(List<Entity> partyMembers) {
        VBox partyContainer = new VBox(12);
        partyContainer.setAlignment(Pos.CENTER);
        partyContainer.setPadding(new Insets(10));
        partyContainer.getStyleClass().add("victory-panel");
        partyContainer.setMaxWidth(450);

        // Header
        Label partyHeader = new Label("Party Status");
        partyHeader.getStyleClass().add("label-success");
        partyHeader.setStyle("-fx-font-size: 14px;");
        partyContainer.getChildren().add(partyHeader);
        
        // Party member rows
        for (Entity entity : partyMembers) {
            if (entity.isParty()) {
                HBox memberRow = createPartyMemberRow(entity);
                partyContainer.getChildren().add(memberRow);
            }
        }
        
        contentBox.getChildren().add(partyContainer);
    }

    private HBox createPartyMemberRow(Entity entity) {
        CharSheet cs = entity.getCharSheet();
        
        HBox row = new HBox(12);
        row.setAlignment(Pos.CENTER_LEFT);
        row.getStyleClass().add("victory-party-row");
        row.setMaxWidth(420);
        row.setMinWidth(380);
        
        // Sprite (32x32)
        Node sprite = SpriteUtils.createCharacterSprite(cs, 32);
        row.getChildren().add(sprite);
        
        // Name
        Label nameLabel = new Label(cs.getName());
        nameLabel.setMinWidth(100);
        nameLabel.setMaxWidth(120);
        nameLabel.setStyle(
            "-fx-font-size: 13px; " +
            "-fx-font-weight: bold; " +
            "-fx-text-fill: #dcdcdc;"
        );
        row.getChildren().add(nameLabel);
        
        // Separator colon
        Label colonLabel = new Label(":");
        colonLabel.setStyle("-fx-text-fill: #808080; -fx-font-size: 13px;");
        row.getChildren().add(colonLabel);
        
        // Health bar container
        VBox healthContainer = new VBox(2);
        healthContainer.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(healthContainer, Priority.ALWAYS);
        
        // HP text
        Label hpText = new Label(cs.getCurrentHP() + " / " + cs.getTotalHP());
        hpText.getStyleClass().addAll("label-muted", "label-caption");

        // Progress bar
        ProgressBar hpBar = new ProgressBar();
        double hpRatio = (double) cs.getCurrentHP() / cs.getTotalHP();
        hpBar.setProgress(Math.max(0, Math.min(1, hpRatio)));
        hpBar.setPrefWidth(150);
        hpBar.setPrefHeight(14);
        hpBar.setMaxWidth(Double.MAX_VALUE);

        // Color based on health
        hpBar.getStyleClass().add(hpRatio > 0.5 ? "progress-bar-success" : hpRatio > 0.25 ? "progress-bar-warning" : "progress-bar-danger");
        
        healthContainer.getChildren().addAll(hpBar, hpText);
        row.getChildren().add(healthContainer);
        
        // Status icons
        HBox statusBox = new HBox(4);
        statusBox.setAlignment(Pos.CENTER_RIGHT);
        statusBox.setMinWidth(60);
        
        Status[] statuses = cs.getStatus();
        if (statuses.length == 0) {
            // No statuses - show OK indicator
            Label okLabel = new Label("OK");
            okLabel.setStyle("-fx-text-fill: #4CAF50; -fx-font-size: 11px; -fx-font-weight: bold;");
            statusBox.getChildren().add(okLabel);
        } else {
            // Show status icons/labels
            for (int i = 0; i < Math.min(statuses.length, 3); i++) {
                Status status = statuses[i];
                Label statusLabel = new Label(abbreviateStatus(status.getName()));
                String statusColor = getStatusColor(status);
                statusLabel.setStyle(
                    "-fx-font-size: 10px; " +
                    "-fx-font-weight: bold; " +
                    "-fx-text-fill: " + statusColor + "; " +
                    "-fx-background-color: rgba(0,0,0,0.3); " +
                    "-fx-padding: 2 4; " +
                    "-fx-background-radius: 3;"
                );
                statusBox.getChildren().add(statusLabel);
            }
            if (statuses.length > 3) {
                Label moreLabel = new Label("+" + (statuses.length - 3));
                moreLabel.setStyle("-fx-font-size: 9px; -fx-text-fill: #808080;");
                statusBox.getChildren().add(moreLabel);
            }
        }
        
        row.getChildren().add(statusBox);
        
        return row;
    }

    private String abbreviateStatus(String statusName) {
        if (statusName == null) return "?";
        // Return first 3-4 chars or abbreviation
        if (statusName.length() <= 4) {
            return statusName.toUpperCase();
        }
        return statusName.substring(0, 3).toUpperCase();
    }

    private String getStatusColor(Status status) {
        if (status == null) return "#808080";
        
        String name = status.getName().toLowerCase();
        int effectType = status.getEffectType();
        
        // Color based on effect type
        if (effectType == Status.DAMAGE_OVER_TIME) {
            return "#d75f5f"; // Red for DOT
        } else if (effectType == Status.HEAL_OVER_TIME) {
            return "#4CAF50"; // Green for HOT
        } else if (effectType == Status.STAT_MODIFIER) {
            return status.getMagnitude() >= 0 ? "#569cd6" : "#d75f5f"; // Blue for buffs, red for debuffs
        }
        
        // Color based on name
        if (name.contains("dead") || name.contains("unconscious")) {
            return "#d75f5f";
        } else if (name.contains("poison") || name.contains("bleed")) {
            return "#c586c0";
        } else if (name.contains("burn") || name.contains("fire")) {
            return "#FF9800";
        } else if (name.contains("freeze") || name.contains("cold") || name.contains("ice")) {
            return "#2196F3";
        }
        
        return "#dcdcaa"; // Default gold/yellow
    }

    private void createContinueButton() {
        if (!showContinue) {
            return;
        }
        Button continueBtn = new Button("Continue");
        continueBtn.getStyleClass().add("button-primary");
        continueBtn.setStyle("-fx-font-size: 16px; -fx-padding: 12 40;");
        continueBtn.setGraphic(IconUtils.smallIcon(IconUtils.Icon.PLAY));

        continueBtn.setOnAction(e -> {
            if (onContinue != null) {
                onContinue.run();
            }
        });
        
        VBox.setMargin(continueBtn, new Insets(20, 0, 0, 0));
        contentBox.getChildren().add(continueBtn);
    }
}
