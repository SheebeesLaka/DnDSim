package UI;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.Tooltip;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;

public class MainMenuView {

    private final AppController appController;
    private final VBox root;

    public MainMenuView(AppController appController) {
        this.appController = appController;

        root = new VBox(30);
        root.setAlignment(Pos.CENTER);
        root.setPadding(new Insets(40));
        root.getStyleClass().add("panel-dark");
        
        // Title with glow effect
        Label titleLabel = new Label("Cassandralis Combat Simulator");
        titleLabel.getStyleClass().add("label-title");
        titleLabel.setStyle("-fx-font-size: 36px; -fx-font-weight: bold;");
        DropShadow titleGlow = new DropShadow();
        titleGlow.setColor(Color.web("#569cd6"));
        titleGlow.setRadius(15);
        titleGlow.setSpread(0.3);
        titleLabel.setEffect(titleGlow);
        
        Label subtitleLabel = new Label("v4.7.2891-BETA.r38291.mil.gov.cass // BUILD 2170.11.07.1943-SEC3");
        subtitleLabel.getStyleClass().add("label-muted");
        subtitleLabel.setStyle("-fx-font-size: 11px; -fx-font-family: 'Consolas';");

        VBox titleBox = new VBox(8);
        titleBox.setAlignment(Pos.CENTER);
        titleBox.getChildren().addAll(titleLabel, subtitleLabel);

        GridPane grid = new GridPane();
        grid.setAlignment(Pos.CENTER);
        grid.setHgap(20);
        grid.setVgap(20);

        Button battleBtn = createMenuButton("Start Battle System", IconUtils.Icon.SWORDS, "#b8860b");
        battleBtn.setOnAction(e -> handleBattleSystem());
        grid.add(battleBtn, 0, 0);

        Button characterBtn = createMenuButton("Character Sheets", IconUtils.Icon.SCRIPT, "#569cd6");
        characterBtn.setOnAction(e -> appController.navigateToCharacterSheets());
        grid.add(characterBtn, 1, 0);

        Button assetBtn = createMenuButton("Asset Editor", IconUtils.Icon.WRENCH, "#4ec9b0");
        assetBtn.setOnAction(e -> appController.navigateToAssetEditor());
        grid.add(assetBtn, 0, 1);
        GridPane.setColumnSpan(assetBtn, 2);

        root.getChildren().addAll(titleBox, grid, createTwoDisplayToggle());
    }

    /**
     * Two Display Mode switch: a slim bar under the main grid (same width), with an ON/OFF
     * badge and a gear for the player-screen settings built into its right end.
     */
    private HBox createTwoDisplayToggle() {
        ToggleButton toggle = new ToggleButton();
        toggle.getStyleClass().add("two-display-toggle");
        toggle.setMaxWidth(Double.MAX_VALUE);
        toggle.setTooltip(new Tooltip("Open a player-facing battle view on your other monitor"));

        Label badge = new Label();
        badge.getStyleClass().add("two-display-badge");
        Label text = new Label("Two Display Mode");
        text.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #dcdcdc;");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        HBox graphic = new HBox(12, IconUtils.createIcon(IconUtils.Icon.DISPLAYS, 26, "#9cdcfe"), text, spacer, badge);
        graphic.setAlignment(Pos.CENTER_LEFT);
        toggle.setGraphic(graphic);
        HBox.setHgrow(toggle, Priority.ALWAYS);

        Button gear = new Button();
        gear.setGraphic(IconUtils.createIcon(IconUtils.Icon.GEAR, 20, "#dcdcdc"));
        gear.getStyleClass().add("two-display-gear");
        gear.setTooltip(new Tooltip("Choose what the player screen shows"));
        gear.setOnAction(e -> PlayerDisplaySettingsDialog.show(appController.getPrimaryStage()));

        // Toggle -> controller; controller -> toggle (Esc / closing the player window turns it off)
        Runnable sync = () -> {
            boolean on = appController.isTwoDisplayMode();
            toggle.setSelected(on);
            badge.setText(on ? "ON" : "OFF");
            badge.getStyleClass().removeAll("two-display-badge-on");
            if (on) badge.getStyleClass().add("two-display-badge-on");
        };
        toggle.setOnAction(e -> appController.setTwoDisplayMode(toggle.isSelected()));
        appController.twoDisplayModeProperty().addListener((obs, o, n) -> sync.run());
        sync.run();

        HBox bar = new HBox(0, toggle, gear);
        bar.getStyleClass().add("two-display-bar");
        bar.setAlignment(Pos.CENTER_LEFT);
        // Match the grid above: two 300px menu buttons plus the 20px gap between them
        bar.setMaxWidth(620);
        bar.setPrefWidth(620);
        AnimationUtils.addHoverAnimation(bar, Color.web("#569cd6"));
        return bar;
    }

    private Button createMenuButton(String text, IconUtils.Icon icon, String iconColor) {
        Button btn = new Button();
        btn.getStyleClass().addAll("button", "button-large");
        btn.setPrefSize(300, 200);
        
        // Create icon and label in a VBox
        VBox content = new VBox(15);
        content.setAlignment(Pos.CENTER);
        
        javafx.scene.Node iconNode = IconUtils.createIcon(icon, 48, iconColor);
        Label label = new Label(text);
        label.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #dcdcdc;");
        
        content.getChildren().addAll(iconNode, label);
        btn.setGraphic(content);
        
        AnimationUtils.addButtonHoverAnimation(btn);
        return btn;
    }

    public VBox getRoot() {
        return root;
    }

    private void handleBattleSystem() {
        GridSetupDialog.show(appController.getPrimaryStage())
            .ifPresent(r -> appController.navigateToBattle(r.rows, r.cols, r.mask, r.themeName));
    }
}
