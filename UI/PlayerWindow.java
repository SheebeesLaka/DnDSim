package UI;

import Objects.Entity;
import UI.Battle.BattleGridCanvas;
import UI.Battle.BattleView;
import UI.Battle.GridTheme;
import UI.Battle.TimelinePane;
import UI.Battle.VictoryView;
import javafx.animation.PauseTransition;
import javafx.application.Platform;
import javafx.collections.ListChangeListener;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.effect.DropShadow;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyEvent;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.paint.CycleMethod;
import javafx.scene.paint.RadialGradient;
import javafx.scene.paint.Stop;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import javafx.util.Duration;

import java.util.ArrayList;
import java.util.List;

/**
 * Two Display Mode: the player-facing second window. It fills the first screen that isn't the
 * DM's (borderless), or falls back to a normal window when only one screen is connected.
 *
 * Content swaps between an idle title screen and, during a battle, a read-only twin of the
 * DM's board and turn strip (see BattleGridCanvas / TimelinePane player views). Nothing in
 * it is interactive and it never keeps focus; Esc or closing it turns the mode off.
 */
public class PlayerWindow {

    private static final double WINDOWED_W = 1280;
    private static final double WINDOWED_H = 720;

    private final Stage dmStage;
    private final Runnable onUserClosed;   // Esc / taskbar close: turns Two Display Mode off
    private final StackPane root = new StackPane();
    private final StackPane idleView;
    private final PauseTransition replaceDebounce = new PauseTransition(Duration.millis(300));
    private final Runnable optionsListener = this::applyDisplayOptions;

    private Stage stage;
    private StageStyle stageStyle;
    private boolean open;

    // Current battle mirror (null when idle)
    private BattleView battle;
    private BattleGridCanvas playerCanvas;
    private TimelinePane playerStrip;
    private VBox battleLayout;

    PlayerWindow(Stage dmStage, Runnable onUserClosed) {
        this.dmStage = dmStage;
        this.onUserClosed = onUserClosed;

        root.getStyleClass().add("panel-dark");
        root.setStyle("-fx-background-color: #141416;");
        // Players watch; nothing on this screen reacts to the mouse
        root.setMouseTransparent(true);
        root.setFocusTraversable(false);

        idleView = buildIdleView();
        root.getChildren().setAll(idleView);

        // Same idea as AppController's screenRefit: displays fire bursts of change events,
        // so debounce, then re-place on whichever screen is now right.
        replaceDebounce.setOnFinished(e -> place(false));
        Screen.getScreens().addListener((ListChangeListener<Screen>) c -> {
            if (open) replaceDebounce.playFromStart();
        });
        // Dragging the DM window onto the other monitor should swap the player window over
        dmStage.xProperty().addListener((obs, o, n) -> { if (open) replaceDebounce.playFromStart(); });
        dmStage.yProperty().addListener((obs, o, n) -> { if (open) replaceDebounce.playFromStart(); });
    }

    public boolean isOpen() {
        return open;
    }

    /** Open (or re-place) the window; it shows the current battle if one is running. */
    public void open() {
        if (open) return;
        open = true;
        PlayerDisplayOptions.get().addListener(optionsListener);
        place(true);
        BattleView current = AppController.getInstance().getCurrentBattleView();
        if (current != null) {
            showBattle(current);
        } else {
            showIdle();
        }
    }

    /** Close the window and let go of any battle it was mirroring. */
    public void close() {
        if (!open) return;
        open = false;
        replaceDebounce.stop();
        PlayerDisplayOptions.get().removeListener(optionsListener);
        detachBattle();
        root.getChildren().setAll(idleView);
        if (stage != null) {
            stage.hide();
        }
    }

    /** True when only the DM's screen is connected (the window then opens as a normal window). */
    public static boolean isSingleScreen() {
        return Screen.getScreens().size() < 2;
    }

    // ===================== Placement =====================

    /**
     * The screen the player window should fill: the first screen whose bounds differ from the
     * DM's screen, or null when there is no other screen. Pure, so it can be tested with fake bounds.
     */
    static Rectangle2D chooseTarget(List<Rectangle2D> screens, Rectangle2D dmScreen) {
        for (Rectangle2D s : screens) {
            if (!s.equals(dmScreen)) return s;
        }
        return null;
    }

    /** Fill the other screen borderless, or fall back to a normal window on the DM's screen. */
    private void place(boolean firstShow) {
        if (!open) return;
        Screen dmScreen = AppController.screenContaining(dmStage);
        List<Rectangle2D> bounds = new ArrayList<>();
        for (Screen s : Screen.getScreens()) bounds.add(s.getBounds());
        Rectangle2D target = chooseTarget(bounds, dmScreen.getBounds());

        boolean rebuilt = ensureStage(target != null ? StageStyle.UNDECORATED : StageStyle.DECORATED);
        if (target != null) {
            stage.setX(target.getMinX());
            stage.setY(target.getMinY());
            stage.setWidth(target.getWidth());
            stage.setHeight(target.getHeight());
        } else if (rebuilt || firstShow || !isOnAnyScreen()) {
            // Windowed fallback: centered on the DM's screen, sized to fit
            Rectangle2D area = dmScreen.getVisualBounds();
            double w = Math.min(WINDOWED_W, area.getWidth() * 0.8);
            double h = Math.min(WINDOWED_H, area.getHeight() * 0.8);
            stage.setWidth(w);
            stage.setHeight(h);
            stage.setX(area.getMinX() + (area.getWidth() - w) / 2);
            stage.setY(area.getMinY() + (area.getHeight() - h) / 2);
        }
        if (!stage.isShowing()) {
            stage.show();
            // Showing a window activates it - hand focus straight back to the DM window
            Platform.runLater(dmStage::requestFocus);
        }
    }

    /** Whether the window's top-left area is on some connected screen (not stranded off-screen). */
    private boolean isOnAnyScreen() {
        return !Screen.getScreensForRectangle(stage.getX(), stage.getY(),
            Math.max(1, Math.min(100, stage.getWidth())), Math.max(1, Math.min(100, stage.getHeight()))).isEmpty();
    }

    /**
     * Make sure the stage has the wanted style. A stage's style is fixed once shown, so
     * switching between borderless and windowed means building a new stage around the same root.
     * @return true if a new stage was built
     */
    private boolean ensureStage(StageStyle style) {
        if (stage != null && stageStyle == style) return false;
        if (stage != null) {
            stage.hide();
            stage.getScene().setRoot(new Pane()); // release our root so the new scene can own it
        }
        stageStyle = style;
        stage = new Stage(style);
        stage.setTitle("Cassandralis - Player View");
        stage.getIcons().addAll(IconUtils.createStageIcons());
        stage.setResizable(style == StageStyle.DECORATED);
        Scene scene = new Scene(root, WINDOWED_W, WINDOWED_H);
        scene.setFill(Color.web("#141416"));
        StyleUtils.applyTheme(scene);
        // Esc (after clicking onto the player screen) turns Two Display Mode off
        scene.addEventFilter(KeyEvent.KEY_PRESSED, e -> {
            if (e.getCode() == KeyCode.ESCAPE) {
                e.consume();
                onUserClosed.run();
            }
        });
        stage.setScene(scene);
        // Closing it from the taskbar also turns the mode off (rather than leaving it half-on)
        stage.setOnCloseRequest(e -> {
            e.consume();
            onUserClosed.run();
        });
        return true;
    }

    // ===================== Content =====================

    /** Title screen shown whenever no battle is running. */
    private StackPane buildIdleView() {
        GridTheme stone = GridTheme.byName("stone");
        // Same darkened, tiled texture + vignette the battle board uses as its backdrop
        Region texture = new Region();
        texture.setBackground(new Background(
            new BackgroundFill[]{new BackgroundFill(stone.backdropBase, CornerRadii.EMPTY, Insets.EMPTY)},
            new BackgroundImage[]{new BackgroundImage(stone.backdropTexture, BackgroundRepeat.REPEAT,
                BackgroundRepeat.REPEAT, BackgroundPosition.DEFAULT,
                new BackgroundSize(GridTheme.TILE_SIZE * 2, GridTheme.TILE_SIZE * 2, false, false, false, false))}));

        Region vignette = new Region();
        vignette.setBackground(new Background(new BackgroundFill(
            new RadialGradient(0, 0, 0.5, 0.5, 0.75, true, CycleMethod.NO_CYCLE,
                new Stop(0, Color.rgb(0, 0, 0, 0.15)), new Stop(1, Color.rgb(0, 0, 0, 0.8))),
            CornerRadii.EMPTY, Insets.EMPTY)));

        Label title = new Label("Cassandralis Combat Simulator");
        title.getStyleClass().add("player-idle-title");
        DropShadow glow = new DropShadow();
        glow.setColor(Color.web("#569cd6"));
        glow.setRadius(22);
        glow.setSpread(0.3);
        title.setEffect(glow);

        Label sub = new Label("Awaiting the next encounter");
        sub.getStyleClass().add("player-idle-subtitle");

        VBox text = new VBox(14, title, sub);
        text.setAlignment(Pos.CENTER);

        StackPane idle = new StackPane(texture, vignette, text);
        idle.setAlignment(Pos.CENTER);
        return idle;
    }

    /** Return to the title screen (battle over, or none running). */
    public void showIdle() {
        detachBattle();
        root.getChildren().setAll(idleView);
        AnimationUtils.fadeIn(idleView);
    }

    /** Mirror a battle: read-only twins of the DM's turn strip and board. */
    public void showBattle(BattleView view) {
        if (!open || view == null) return;
        if (battle == view && playerCanvas != null) return;
        detachBattle();
        battle = view;

        PlayerDisplayOptions opts = PlayerDisplayOptions.get();
        playerCanvas = new BattleGridCanvas(view.getGridCanvas(), opts);
        playerStrip = new TimelinePane(view.getTurnManager(), opts);
        VBox.setVgrow(playerCanvas, Priority.ALWAYS);
        battleLayout = new VBox(10, playerStrip, playerCanvas);
        battleLayout.setPadding(new Insets(10));
        battleLayout.getStyleClass().add("panel-dark");

        // Hook the twins up last, once they exist, so the first sync lands on built nodes
        view.getGridCanvas().attachMirror(playerCanvas);
        view.getTimelinePane().attachMirror(playerStrip);
        applyDisplayOptions();

        root.getChildren().setAll(battleLayout);
        AnimationUtils.fadeIn(battleLayout);
    }

    /** Lay the victory screen over the mirrored board (no Continue button - the DM decides). */
    public void showVictory(List<Entity> partyMembers) {
        if (!open || battleLayout == null) return;
        VictoryView victory = new VictoryView(partyMembers, null, false);
        root.getChildren().setAll(new StackPane(battleLayout, victory));
        victory.playEntranceAnimation();
    }

    /** Unhook from the DM battle so nothing keeps updating (or leaking) after it ends. */
    private void detachBattle() {
        if (battle != null) {
            if (battle.getGridCanvas().getMirror() == playerCanvas) {
                battle.getGridCanvas().attachMirror(null);
            }
            if (battle.getTimelinePane().getMirror() == playerStrip) {
                battle.getTimelinePane().attachMirror(null);
            }
        }
        if (playerCanvas != null) {
            playerCanvas.dispose();
        }
        battle = null;
        playerCanvas = null;
        playerStrip = null;
        battleLayout = null;
    }

    /** Re-apply the DM's display settings to whatever is on screen right now. */
    private void applyDisplayOptions() {
        if (playerStrip != null) {
            boolean showStrip = PlayerDisplayOptions.get().showTurnStrip();
            playerStrip.setVisible(showStrip);
            playerStrip.setManaged(showStrip);
            playerStrip.rebuild();
        }
        if (playerCanvas != null) {
            playerCanvas.markDirty();
        }
    }

    // ===================== Test hooks =====================

    Stage getStage() {
        return stage;
    }

    StageStyle getStageStyle() {
        return stageStyle;
    }

    BattleGridCanvas getPlayerCanvas() {
        return playerCanvas;
    }

    TimelinePane getPlayerStrip() {
        return playerStrip;
    }

    StackPane getRoot() {
        return root;
    }
}
