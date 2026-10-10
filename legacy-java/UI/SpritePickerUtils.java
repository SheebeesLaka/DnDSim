package UI;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.control.Tooltip;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Window;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Utility class for creating sprite picker UI components.
 * Provides a browse button with auto-copy functionality to sprites folder.
 */
public class SpritePickerUtils {
    
    private static final String SPRITES_BASE_PATH = "resources/sprites/";
    
    /**
     * Create a sprite picker component with preview, browse button, and path field.
     * Uses a Supplier for lazy window access.
     * 
     * @param currentPath The current sprite path (relative to sprites folder)
     * @param subdirectory The subdirectory within sprites/ (e.g., "party", "enemies", "terrain")
    * @param colorHex The fallback color hex value for avatar previews
     * @param isParty Whether this is a party member (affects fallback styling)
     * @param onPathChanged Callback when sprite path changes
     * @param windowSupplier Supplier for the owner window (called lazily)
     * @return VBox containing the sprite picker UI
     */
    public static VBox createSpritePicker(String currentPath, String subdirectory, 
            String colorHex, boolean isParty, Consumer<String> onPathChanged, Supplier<Window> windowSupplier) {
        return createSpritePicker(currentPath, subdirectory, colorHex, isParty, onPathChanged,
            windowSupplier != null ? windowSupplier.get() : null, windowSupplier);
    }

    /**
     * Create a sprite picker component with preview, browse button, and path field.
     * 
     * @param currentPath The current sprite path (relative to sprites folder)
     * @param subdirectory The subdirectory within sprites/ (e.g., "party", "enemies", "terrain")
    * @param colorHex The fallback color hex value for avatar previews
     * @param isParty Whether this is a party member (affects fallback styling)
     * @param onPathChanged Callback when sprite path changes
     * @param ownerWindow The owner window for the file dialog (can be null if windowSupplier provided)
     * @param windowSupplier Supplier for lazy window access (preferred over ownerWindow)
     * @return VBox containing the sprite picker UI
     */
    private static VBox createSpritePicker(String currentPath, String subdirectory, 
            String colorHex, boolean isParty, Consumer<String> onPathChanged,
            Window ownerWindow, Supplier<Window> windowSupplier) {
        
        VBox container = new VBox(8);
        container.setAlignment(Pos.CENTER);
        container.setPadding(new Insets(10));
        container.setMinWidth(100);
        container.getStyleClass().add("sprite-picker");

        // Sprite preview container
        StackPane previewContainer = new StackPane();
        previewContainer.setMinSize(64, 64);
        previewContainer.setMaxSize(64, 64);
        previewContainer.getStyleClass().addAll("sprite-preview", isParty ? "sprite-preview-party" : "sprite-preview-enemy");

        // Initial preview
        updatePreview(previewContainer, currentPath, colorHex, isParty);

        // Label
        Label spriteLabel = new Label("Sprite");
        spriteLabel.getStyleClass().addAll("label-muted", "label-caption");

        // Path display (read-only, truncated)
        TextField pathField = new TextField();
        pathField.setPromptText("No sprite");
        pathField.setPrefWidth(90);
        pathField.setEditable(false);
        if (currentPath != null && !currentPath.isEmpty()) {
            pathField.setText(getDisplayName(currentPath));
            Tooltip.install(pathField, new Tooltip(currentPath));
        }

        // Browse button
        Button browseBtn = new Button("Browse");
        browseBtn.getStyleClass().add("button");
        browseBtn.setStyle("-fx-font-size: 10px; -fx-padding: 3 8;");
        browseBtn.setOnAction(e -> {
            FileChooser fileChooser = new FileChooser();
            fileChooser.setTitle("Select Sprite Image");
            fileChooser.getExtensionFilters().addAll(
                new FileChooser.ExtensionFilter("Image Files", "*.png", "*.jpg", "*.jpeg", "*.gif"),
                new FileChooser.ExtensionFilter("PNG Files", "*.png"),
                new FileChooser.ExtensionFilter("All Files", "*.*")
            );
            
            // Set initial directory to sprites folder if it exists
            File spritesDir = new File(SPRITES_BASE_PATH + subdirectory);
            if (spritesDir.exists()) {
                fileChooser.setInitialDirectory(spritesDir);
            }
            
            // Get window lazily from supplier if available
            Window dialogOwner = windowSupplier != null ? windowSupplier.get() : ownerWindow;
            File selectedFile = fileChooser.showOpenDialog(dialogOwner);
            if (selectedFile != null) {
                String newPath = handleFileSelection(selectedFile, subdirectory);
                if (newPath != null) {
                    pathField.setText(getDisplayName(newPath));
                    Tooltip.install(pathField, new Tooltip(newPath));
                    updatePreview(previewContainer, newPath, colorHex, isParty);
                    SpriteUtils.clearCache(); // Clear cache to reload new sprite
                    onPathChanged.accept(newPath);
                }
            }
        });

        // Clear button
        Button clearBtn = new Button();
        clearBtn.getStyleClass().add("button");
        clearBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 10, "#d75f5f"));
        clearBtn.setStyle("-fx-padding: 3 6;");
        clearBtn.setOnAction(e -> {
            pathField.setText("");
            updatePreview(previewContainer, null, colorHex, isParty);
            onPathChanged.accept(null);
        });
        
        // Button row
        HBox buttonRow = new HBox(4);
        buttonRow.setAlignment(Pos.CENTER);
        buttonRow.getChildren().addAll(browseBtn, clearBtn);
        
        container.getChildren().addAll(previewContainer, spriteLabel, pathField, buttonRow);
        return container;
    }
    
    /**
     * Handle file selection - copy to sprites folder if external, return relative path.
     */
    private static String handleFileSelection(File selectedFile, String subdirectory) {
        String absolutePath = selectedFile.getAbsolutePath();
        String spritesAbsolutePath = new File(SPRITES_BASE_PATH).getAbsolutePath();
        
        // Check if file is already in the sprites folder
        if (absolutePath.startsWith(spritesAbsolutePath)) {
            // Already in sprites folder, just return relative path
            String relativePath = absolutePath.substring(spritesAbsolutePath.length() + 1);
            return relativePath.replace("\\", "/");
        }
        
        // External file - copy to sprites folder
        return copyToSpritesFolder(selectedFile, subdirectory);
    }
    
    /**
     * Copy a file to the sprites folder.
     * 
     * @param sourceFile The source file to copy
     * @param subdirectory The subdirectory within sprites/ 
     * @return The relative path from sprites folder, or null on error
     */
    public static String copyToSpritesFolder(File sourceFile, String subdirectory) {
        try {
            // Ensure target directory exists
            Path targetDir = Path.of(SPRITES_BASE_PATH, subdirectory);
            Files.createDirectories(targetDir);
            
            // Generate target filename (handle conflicts)
            String baseName = getBaseName(sourceFile.getName());
            String extension = getExtension(sourceFile.getName());
            String targetName = baseName + "." + extension;
            Path targetPath = targetDir.resolve(targetName);
            
            // Handle name conflicts
            int counter = 1;
            while (Files.exists(targetPath)) {
                targetName = baseName + "_" + counter + "." + extension;
                targetPath = targetDir.resolve(targetName);
                counter++;
            }
            
            // Copy the file
            Files.copy(sourceFile.toPath(), targetPath, StandardCopyOption.COPY_ATTRIBUTES);
            
            // Return relative path
            String relativePath = subdirectory + "/" + targetName;
            System.out.println("Sprite copied to: " + targetPath);
            return relativePath;
            
        } catch (IOException e) {
            System.err.println("Error copying sprite: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    /**
     * Update the preview container with the sprite or fallback avatar.
     * Sprites scaled to fit while preserving aspect ratio.
     */
    private static void updatePreview(StackPane container, String spritePath, String colorHex, boolean isParty) {
        container.getChildren().clear();
        
        if (spritePath != null && !spritePath.isEmpty()) {
            Image sprite = SpriteUtils.staticFrame(spritePath); // sheet-ref aware
            if (sprite != null) {
                ImageView view = new ImageView(sprite);
                view.setFitWidth(48);
                view.setFitHeight(48);
                view.setPreserveRatio(true); // Keep aspect ratio
                view.setSmooth(false);
                container.getChildren().add(view);
                return;
            }
        }
        
        // Fallback avatar
        Node fallback = SpriteUtils.createFallbackAvatar(colorHex, 48, isParty);
        container.getChildren().add(fallback);
    }
    
    /**
     * Get a display name from a path (just the filename).
     */
    private static String getDisplayName(String path) {
        if (path == null) return "";
        int lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    }
    
    /**
     * Get base name without extension.
     */
    private static String getBaseName(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }
    
    /**
     * Get file extension.
     */
    private static String getExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(dot + 1) : "png";
    }
    
    /**
     * Create a compact sprite picker for use in dialogs (smaller footprint).
     * Uses a Supplier for lazy window access.
     */
    public static HBox createCompactSpritePicker(String currentPath, String subdirectory,
            String colorHex, boolean isParty, Consumer<String> onPathChanged, Supplier<Window> windowSupplier) {
        return createCompactSpritePickerImpl(currentPath, subdirectory, colorHex, isParty, onPathChanged, null, windowSupplier);
    }

    /**
     * Create a compact sprite picker for use in dialogs (smaller footprint).
     */
    public static HBox createCompactSpritePicker(String currentPath, String subdirectory,
            String colorHex, boolean isParty, Consumer<String> onPathChanged, Window ownerWindow) {
        return createCompactSpritePickerImpl(currentPath, subdirectory, colorHex, isParty, onPathChanged, ownerWindow, null);
    }
    
    private static HBox createCompactSpritePickerImpl(String currentPath, String subdirectory,
            String colorHex, boolean isParty, Consumer<String> onPathChanged,
            Window ownerWindow, Supplier<Window> windowSupplier) {
        
        HBox container = new HBox(8);
        container.setAlignment(Pos.CENTER_LEFT);
        
        // Small preview
        StackPane previewContainer = new StackPane();
        previewContainer.setMinSize(32, 32);
        previewContainer.setMaxSize(32, 32);
        previewContainer.setStyle("-fx-border-width: 1;");
        previewContainer.getStyleClass().addAll("sprite-preview", isParty ? "sprite-preview-party" : "sprite-preview-enemy");
        updateCompactPreview(previewContainer, currentPath, colorHex, isParty);

        // Path field
        TextField pathField = new TextField();
        pathField.setPromptText("No sprite");
        pathField.setPrefWidth(120);
        pathField.setEditable(false);
        if (currentPath != null && !currentPath.isEmpty()) {
            pathField.setText(getDisplayName(currentPath));
            Tooltip.install(pathField, new Tooltip(currentPath));
        }

        // Browse button
        Button browseBtn = new Button("...");
        browseBtn.getStyleClass().add("button");
        browseBtn.setStyle("-fx-padding: 2 6;");
        browseBtn.setOnAction(e -> {
            FileChooser fileChooser = new FileChooser();
            fileChooser.setTitle("Select Sprite Image");
            fileChooser.getExtensionFilters().addAll(
                new FileChooser.ExtensionFilter("Image Files", "*.png", "*.jpg", "*.jpeg", "*.gif"),
                new FileChooser.ExtensionFilter("All Files", "*.*")
            );
            
            File spritesDir = new File(SPRITES_BASE_PATH + subdirectory);
            if (spritesDir.exists()) {
                fileChooser.setInitialDirectory(spritesDir);
            }
            
            Window dialogOwner = windowSupplier != null ? windowSupplier.get() : ownerWindow;
            File selectedFile = fileChooser.showOpenDialog(dialogOwner);
            if (selectedFile != null) {
                String newPath = handleFileSelection(selectedFile, subdirectory);
                if (newPath != null) {
                    pathField.setText(getDisplayName(newPath));
                    Tooltip.install(pathField, new Tooltip(newPath));
                    updateCompactPreview(previewContainer, newPath, colorHex, isParty);
                    SpriteUtils.clearCache();
                    onPathChanged.accept(newPath);
                }
            }
        });

        // Clear button
        Button clearBtn = new Button();
        clearBtn.getStyleClass().add("button");
        clearBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.CLOSE, 10, "#d75f5f"));
        clearBtn.setStyle("-fx-padding: 2 4;");
        clearBtn.setOnAction(e -> {
            pathField.setText("");
            updateCompactPreview(previewContainer, null, colorHex, isParty);
            onPathChanged.accept(null);
        });
        
        container.getChildren().addAll(previewContainer, pathField, browseBtn, clearBtn);
        return container;
    }
    
    /**
     * Update compact preview (smaller size).
     * Sprites scaled to fit while preserving aspect ratio.
     */
    private static void updateCompactPreview(StackPane container, String spritePath, String colorHex, boolean isParty) {
        container.getChildren().clear();
        
        if (spritePath != null && !spritePath.isEmpty()) {
            Image sprite = SpriteUtils.staticFrame(spritePath); // sheet-ref aware
            if (sprite != null) {
                ImageView view = new ImageView(sprite);
                view.setFitWidth(28);
                view.setFitHeight(28);
                view.setPreserveRatio(true); // Keep aspect ratio
                view.setSmooth(false);
                container.getChildren().add(view);
                return;
            }
        }
        
        Node fallback = SpriteUtils.createFallbackAvatar(colorHex, 28, isParty);
        container.getChildren().add(fallback);
    }
}
