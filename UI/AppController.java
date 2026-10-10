package UI;

import UI.Battle.BattleView;
import javafx.animation.PauseTransition;
import javafx.collections.ListChangeListener;
import javafx.geometry.Pos;
import javafx.geometry.Rectangle2D;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyCombination;
import javafx.scene.input.KeyEvent;
import javafx.scene.layout.StackPane;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.util.Duration;

/**
 * Central controller managing the single application window and navigation between views.
 */
public class AppController {

    private static AppController instance;
    
    private final Stage primaryStage;
    private final StackPane rootContainer;
    private final Scene scene;
    private final PauseTransition screenRefit = new PauseTransition(Duration.millis(300));

    // Views (lazily initialized)
    private MainMenuView mainMenuView;
    private CharacterSheetView characterSheetView;
    private AssetEditorView assetEditorView;
    private BattleView currentBattleView;

    private AppController(Stage primaryStage) {
        this.primaryStage = primaryStage;
        this.rootContainer = new StackPane();
        this.rootContainer.getStyleClass().add("panel-dark");
        // If a view ever ends up taller than the window, overflow off the bottom rather than
        // centering it (StackPane's default), which clips the top of the view as well.
        this.rootContainer.setAlignment(Pos.TOP_LEFT);
        
        this.scene = new Scene(rootContainer, 1200, 800);
        StyleUtils.applyTheme(scene);

        primaryStage.setTitle("Cassandralis Combat Simulator");
        primaryStage.getIcons().addAll(IconUtils.createStageIcons());
        primaryStage.setScene(scene);
        primaryStage.setMinWidth(800);
        primaryStage.setMinHeight(600);
        primaryStage.setMaximized(true);

        // F11 toggles fullscreen. ESC is left alone since battle uses it to cancel modes.
        primaryStage.setFullScreenExitKeyCombination(KeyCombination.NO_MATCH);
        primaryStage.setFullScreenExitHint("Press F11 to exit full screen");
        scene.addEventFilter(KeyEvent.KEY_PRESSED, e -> {
            if (e.getCode() == KeyCode.F11) {
                primaryStage.setFullScreen(!primaryStage.isFullScreen());
                e.consume();
            }
        });

        // Casting / plugging in a display changes screen resolution or DPI scale while we're
        // running. JavaFX leaves a maximized stage sized for the old screen, so the scene ends
        // up offset or cut off. Debounce (displays fire several events) and refit.
        screenRefit.setOnFinished(e -> refitToScreen());
        Screen.getScreens().addListener((ListChangeListener<Screen>) c -> screenRefit.playFromStart());
        primaryStage.outputScaleXProperty().addListener((obs, o, n) -> {
            if (primaryStage.isMaximized()) screenRefit.playFromStart();
        });
        primaryStage.outputScaleYProperty().addListener((obs, o, n) -> {
            if (primaryStage.isMaximized()) screenRefit.playFromStart();
        });
    }

    /** Re-fits the stage to the visual bounds of whichever screen it's currently on. */
    private void refitToScreen() {
        if (!primaryStage.isShowing() || primaryStage.isIconified() || primaryStage.isFullScreen()) {
            return;
        }
        Rectangle2D area = currentScreen().getVisualBounds();
        boolean wasMaximized = primaryStage.isMaximized();
        if (wasMaximized) {
            // Un-maximize so the restored bounds can be corrected, then re-maximize so the
            // OS recomputes the maximized size for the new resolution / scale.
            primaryStage.setMaximized(false);
        }

        double w = Math.min(primaryStage.getWidth(), area.getWidth());
        double h = Math.min(primaryStage.getHeight(), area.getHeight());
        double x = Math.max(area.getMinX(), Math.min(primaryStage.getX(), area.getMaxX() - w));
        double y = Math.max(area.getMinY(), Math.min(primaryStage.getY(), area.getMaxY() - h));
        primaryStage.setWidth(w);
        primaryStage.setHeight(h);
        primaryStage.setX(x);
        primaryStage.setY(y);

        if (wasMaximized) {
            primaryStage.setMaximized(true);
        }
    }

    /** The screen containing most of the stage, falling back to the primary screen. */
    private Screen currentScreen() {
        Rectangle2D stageRect = new Rectangle2D(primaryStage.getX(), primaryStage.getY(),
                Math.max(1, primaryStage.getWidth()), Math.max(1, primaryStage.getHeight()));
        Screen best = Screen.getPrimary();
        double bestArea = 0;
        for (Screen s : Screen.getScreens()) {
            Rectangle2D b = s.getBounds();
            double iw = Math.min(b.getMaxX(), stageRect.getMaxX()) - Math.max(b.getMinX(), stageRect.getMinX());
            double ih = Math.min(b.getMaxY(), stageRect.getMaxY()) - Math.max(b.getMinY(), stageRect.getMinY());
            if (iw > 0 && ih > 0 && iw * ih > bestArea) {
                bestArea = iw * ih;
                best = s;
            }
        }
        return best;
    }

    public static void initialize(Stage primaryStage) {
        if (instance == null) {
            instance = new AppController(primaryStage);
        }
    }

    public static AppController getInstance() {
        if (instance == null) {
            throw new IllegalStateException("AppController not initialized. Call initialize() first.");
        }
        return instance;
    }

    public void show() {
        navigateToMainMenu();
        primaryStage.show();
    }

    public void navigateToMainMenu() {
        if (mainMenuView == null) {
            mainMenuView = new MainMenuView(this);
        }
        setContent(mainMenuView.getRoot());
        primaryStage.setTitle("Cassandralis Combat Simulator");
    }

    public void navigateToCharacterSheets() {
        try {
            if (characterSheetView == null) {
                characterSheetView = new CharacterSheetView(this);
            }
            characterSheetView.refresh();
            setContent(characterSheetView.getRoot());
            primaryStage.setTitle("Character Sheets - Cassandralis");
        } catch (Exception e) {
            e.printStackTrace();
            // Reset to allow retry
            characterSheetView = null;
        }
    }

    public void navigateToBattle(int rows, int cols) {
        navigateToBattle(rows, cols, "stone");
    }

    public void navigateToBattle(int rows, int cols, String themeName) {
        navigateToBattle(rows, cols, null, themeName);
    }

    public void navigateToBattle(int rows, int cols, boolean[][] mask, String themeName) {
        try {
            if (characterSheetView == null) {
                characterSheetView = new CharacterSheetView(this);
            }
            currentBattleView = new BattleView(rows, cols, mask, themeName, characterSheetView, this);
            characterSheetView.setBattleView(currentBattleView);
            setContent(currentBattleView.getRoot());
            primaryStage.setTitle("Battle - Cassandralis");

            // Auto-start party placement phase
            currentBattleView.startPlacementPhase();
        } catch (Exception e) {
            e.printStackTrace();
            // Reset to allow retry
            characterSheetView = null;
            currentBattleView = null;
        }
    }

    public void navigateToCurrentBattle() {
        if (currentBattleView != null) {
            setContent(currentBattleView.getRoot());
            primaryStage.setTitle("Battle - Cassandralis");
        } else {
            navigateToMainMenu();
        }
    }

    public void navigateToAssetEditor() {
        if (assetEditorView == null) {
            assetEditorView = new AssetEditorView(this);
        }
        setContent(assetEditorView.getRoot());
        primaryStage.setTitle("Asset Editor - Cassandralis");
    }

    public void returnFromBattle() {
        if (characterSheetView != null) {
            characterSheetView.endBattle();
        }
        currentBattleView = null;
        navigateToMainMenu();
    }

    public BattleView getCurrentBattleView() {
        return currentBattleView;
    }

    public CharacterSheetView getCharacterSheetView() {
        if (characterSheetView == null) {
            characterSheetView = new CharacterSheetView(this);
        }
        return characterSheetView;
    }

    private void setContent(Node content) {
        if (!rootContainer.getChildren().isEmpty()) {
            Node oldContent = rootContainer.getChildren().get(0);
            if (oldContent == content) {
                return; // Already showing this content
            }
        }
        
        rootContainer.getChildren().clear();
        rootContainer.getChildren().add(content);
        AnimationUtils.fadeIn(content);
    }

    public Stage getPrimaryStage() {
        return primaryStage;
    }
}
