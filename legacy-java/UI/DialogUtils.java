package UI;

import java.util.Optional;

import javafx.scene.control.Alert;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Dialog;
import javafx.scene.control.DialogPane;

/**
 * Applies the app's dark theme to JavaFX dialogs. Native Alert/Dialog windows
 * get their own Scene, so without this they render with default light chrome.
 * Every dialog in the app should pass through theme() (or the conveniences).
 */
public final class DialogUtils {

    private DialogUtils() {}

    /** Dark-theme a dialog and center it over the main window. */
    public static void theme(Dialog<?> dialog) {
        DialogPane pane = dialog.getDialogPane();
        if (!pane.getStylesheets().contains(StyleUtils.themeUri())) {
            pane.getStylesheets().add(StyleUtils.themeUri());
        }
        if (!pane.getStyleClass().contains("panel-dark")) {
            pane.getStyleClass().add("panel-dark");
        }
        try {
            if (dialog.getOwner() == null) {
                dialog.initOwner(AppController.getInstance().getPrimaryStage());
            }
        } catch (IllegalStateException ignored) {
            // AppController not initialized (offscreen harness / early boot)
        }
    }

    public static void showAlert(Alert.AlertType type, String title, String content) {
        Alert alert = new Alert(type);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(content);
        theme(alert);
        alert.showAndWait();
    }

    public static Optional<ButtonType> confirm(String title, String header, String content) {
        Alert alert = new Alert(Alert.AlertType.CONFIRMATION);
        alert.setTitle(title);
        alert.setHeaderText(header);
        alert.setContentText(content);
        theme(alert);
        return alert.showAndWait();
    }
}
