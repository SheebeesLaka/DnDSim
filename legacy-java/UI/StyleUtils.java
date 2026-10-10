package UI;

import javafx.scene.Scene;

/**
 * Single source for the application stylesheet. Every Scene (main window,
 * hand-rolled dialog Stages) should go through applyTheme so the path is
 * resolved once and popups can never drift out of theme.
 */
public final class StyleUtils {

    private static final String THEME_URI =
        new java.io.File("resources/styles/dark-theme.css").toURI().toString();

    private StyleUtils() {}

    public static void applyTheme(Scene scene) {
        if (!scene.getStylesheets().contains(THEME_URI)) {
            scene.getStylesheets().add(THEME_URI);
        }
    }

    public static String themeUri() {
        return THEME_URI;
    }
}
