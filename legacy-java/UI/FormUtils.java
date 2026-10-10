package UI;

import javafx.animation.*;
import javafx.beans.property.*;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.util.Duration;
import javafx.util.StringConverter;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Utility class for creating enhanced, styled form controls.
 * Provides modern input components with validation, animations, and better UX.
 */
public class FormUtils {
    
    // ==================== STYLED TEXT FIELDS ====================
    
    /**
     * Creates a simple styled text field.
     */
    public static TextField createStyledTextField(String promptText, String initialValue, int prefWidth) {
        TextField field = new TextField(initialValue != null ? initialValue : "");
        field.setPromptText(promptText);
        field.getStyleClass().add("styled-text-field");
        field.setPrefWidth(prefWidth);
        return field;
    }
    
    // ==================== STYLED SPINNERS ====================
    
    /**
     * Creates a styled integer spinner with increment/decrement buttons.
     */
    public static HBox createStyledSpinner(String labelText, int min, int max, int initial, 
            Consumer<Integer> onChange) {
        
        HBox container = new HBox(8);
        container.setAlignment(Pos.CENTER_LEFT);
        container.getStyleClass().add("spinner-container");
        
        if (labelText != null && !labelText.isEmpty()) {
            Label label = new Label(labelText);
            label.getStyleClass().add("form-label");
            label.setMinWidth(80);
            container.getChildren().add(label);
        }
        
        // Custom spinner with styled buttons
        HBox spinnerBox = new HBox(0);
        spinnerBox.setAlignment(Pos.CENTER);
        spinnerBox.getStyleClass().add("styled-spinner");
        
        Button decrementBtn = new Button();
        decrementBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.MINUS, 12, "#ffffff"));
        decrementBtn.getStyleClass().addAll("spinner-button", "spinner-decrement");
        decrementBtn.setMinSize(28, 28);
        decrementBtn.setMaxSize(28, 28);
        
        TextField valueField = new TextField(String.valueOf(initial));
        valueField.getStyleClass().add("spinner-value");
        valueField.setAlignment(Pos.CENTER);
        valueField.setPrefWidth(60);
        valueField.setMinWidth(60);
        valueField.setMaxWidth(60);
        
        Button incrementBtn = new Button();
        incrementBtn.setGraphic(IconUtils.createIcon(IconUtils.Icon.PLUS, 12, "#ffffff"));
        incrementBtn.getStyleClass().addAll("spinner-button", "spinner-increment");
        incrementBtn.setMinSize(28, 28);
        incrementBtn.setMaxSize(28, 28);
        
        IntegerProperty valueProperty = new SimpleIntegerProperty(initial);
        
        // Decrement action
        decrementBtn.setOnAction(e -> {
            int current = valueProperty.get();
            if (current > min) {
                valueProperty.set(current - 1);
                valueField.setText(String.valueOf(valueProperty.get()));
                pulseButton(decrementBtn);
                if (onChange != null) onChange.accept(valueProperty.get());
            }
        });
        
        // Increment action
        incrementBtn.setOnAction(e -> {
            int current = valueProperty.get();
            if (current < max) {
                valueProperty.set(current + 1);
                valueField.setText(String.valueOf(valueProperty.get()));
                pulseButton(incrementBtn);
                if (onChange != null) onChange.accept(valueProperty.get());
            }
        });
        
        // Direct text input
        valueField.focusedProperty().addListener((obs, wasFocused, isFocused) -> {
            if (!isFocused) {
                try {
                    int newVal = Integer.parseInt(valueField.getText());
                    newVal = Math.max(min, Math.min(max, newVal));
                    valueProperty.set(newVal);
                    valueField.setText(String.valueOf(newVal));
                    if (onChange != null) onChange.accept(newVal);
                } catch (NumberFormatException ex) {
                    valueField.setText(String.valueOf(valueProperty.get()));
                }
            }
        });
        
        spinnerBox.getChildren().addAll(decrementBtn, valueField, incrementBtn);
        container.getChildren().add(spinnerBox);
        
        return container;
    }
    
    /**
     * Creates a compact HP spinner with current/max values.
     */
    public static HBox createHPSpinner(int currentHP, int maxHP, 
            Consumer<Integer> onCurrentChange, Consumer<Integer> onMaxChange) {
        
        HBox container = new HBox(5);
        container.setAlignment(Pos.CENTER_LEFT);
        container.getStyleClass().add("hp-spinner-container");
        
        // Current HP spinner
        Spinner<Integer> currentSpinner = new Spinner<>(0, 9999, currentHP);
        currentSpinner.setEditable(true);
        currentSpinner.setPrefWidth(75);
        currentSpinner.getStyleClass().add("styled-spinner-fx");
        styleSpinner(currentSpinner);
        
        if (onCurrentChange != null) {
            currentSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
                if (newVal != null) onCurrentChange.accept(newVal);
            });
        }
        
        Label slash = new Label("/");
        slash.setStyle("-fx-text-fill: #aaa; -fx-font-size: 14px; -fx-font-weight: bold;");
        
        // Max HP spinner
        Spinner<Integer> maxSpinner = new Spinner<>(1, 9999, maxHP);
        maxSpinner.setEditable(true);
        maxSpinner.setPrefWidth(75);
        maxSpinner.getStyleClass().add("styled-spinner-fx");
        styleSpinner(maxSpinner);
        
        if (onMaxChange != null) {
            maxSpinner.valueProperty().addListener((obs, oldVal, newVal) -> {
                if (newVal != null) onMaxChange.accept(newVal);
            });
        }
        
        container.getChildren().addAll(currentSpinner, slash, maxSpinner);
        return container;
    }
    
    /**
     * Styles a JavaFX Spinner for better appearance.
     */
    public static void styleSpinner(Spinner<?> spinner) {
        spinner.getStyleClass().add("styled-spinner-fx");
        spinner.setEditable(true);
        
        // Handle non-numeric input
        spinner.getEditor().focusedProperty().addListener((obs, wasFocused, isFocused) -> {
            if (!isFocused) {
                try {
                    spinner.commitValue();
                } catch (Exception e) {
                    // Reset to current value if invalid
                    spinner.getEditor().setText(String.valueOf(spinner.getValue()));
                }
            }
        });
    }
    
    // ==================== ROLL SLIDERS ====================

    /**
     * Binds a horizontal, integer-snapped Slider to an existing roll-input TextField so
     * dragging the slider fills in the field and typing in the field moves the slider -
     * both stay valid ways to enter the same roll, and the caller's existing
     * validation/parsing/submit logic around the TextField keeps working unchanged.
     */
    public static Slider attachRollSlider(TextField field, int min, int max) {
        int initial = parseClamped(field.getText(), min, max, min);
        Slider slider = new Slider(min, max, initial);
        slider.setSnapToTicks(true);
        slider.setMajorTickUnit(1);
        slider.setMinorTickCount(0);
        slider.setBlockIncrement(1);
        slider.setShowTickMarks(true);
        slider.getStyleClass().add("roll-slider");

        boolean[] syncing = {false};
        slider.valueProperty().addListener((obs, oldVal, newVal) -> {
            if (syncing[0]) return;
            syncing[0] = true;
            field.setText(String.valueOf((int) Math.round(newVal.doubleValue())));
            syncing[0] = false;
        });
        field.textProperty().addListener((obs, oldVal, newVal) -> {
            if (syncing[0]) return;
            int parsed = parseClamped(newVal, min, max, -1);
            if (parsed < 0) return;
            syncing[0] = true;
            slider.setValue(parsed);
            syncing[0] = false;
        });

        return slider;
    }

    private static int parseClamped(String text, int min, int max, int fallback) {
        try {
            return Math.max(min, Math.min(max, Integer.parseInt(text.trim())));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    // ==================== STYLED COMBO BOXES ====================
    
    /**
     * Creates a searchable combo box with filtering.
     */
    public static <T> ComboBox<T> createSearchableComboBox(List<T> items, T initialValue, 
            StringConverter<T> converter, Consumer<T> onChange) {
        
        ObservableList<T> observableItems = FXCollections.observableArrayList(items);
        FilteredList<T> filteredItems = new FilteredList<>(observableItems, p -> true);
        
        ComboBox<T> comboBox = new ComboBox<>(filteredItems);
        comboBox.getStyleClass().add("styled-combo-box");
        comboBox.setEditable(true);
        comboBox.setPrefWidth(180);
        
        if (converter != null) {
            comboBox.setConverter(converter);
        }
        
        if (initialValue != null) {
            comboBox.setValue(initialValue);
        }
        
        // Filter as user types
        comboBox.getEditor().textProperty().addListener((obs, oldVal, newVal) -> {
            final String filterText = newVal == null ? "" : newVal.toLowerCase();
            
            Platform.runLater(() -> {
                filteredItems.setPredicate(item -> {
                    if (filterText.isEmpty()) return true;
                    String itemText = converter != null ? 
                            converter.toString(item).toLowerCase() : 
                            item.toString().toLowerCase();
                    return itemText.contains(filterText);
                });
                
                if (!filteredItems.isEmpty() && comboBox.isShowing()) {
                    // Keep dropdown visible while typing
                }
            });
        });
        
        // Handle selection
        if (onChange != null) {
            comboBox.setOnAction(e -> {
                T selected = comboBox.getValue();
                if (selected != null) {
                    onChange.accept(selected);
                }
            });
        }
        
        return comboBox;
    }
    
    /**
     * Creates a styled combo box with icons.
     */
    public static ComboBox<String> createIconComboBox(List<String> items, String initialValue, 
            java.util.function.Function<String, Node> iconProvider, Consumer<String> onChange) {
        
        ComboBox<String> comboBox = new ComboBox<>();
        comboBox.getItems().addAll(items);
        comboBox.getStyleClass().add("styled-combo-box");
        comboBox.setPrefWidth(180);
        
        // Custom cell factory for icons
        comboBox.setCellFactory(listView -> new ListCell<String>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    if (iconProvider != null) {
                        setGraphic(iconProvider.apply(item));
                    }
                }
            }
        });
        
        // Button cell (what shows when closed)
        comboBox.setButtonCell(new ListCell<String>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    if (iconProvider != null) {
                        setGraphic(iconProvider.apply(item));
                    }
                }
            }
        });
        
        if (initialValue != null) {
            comboBox.setValue(initialValue);
        }
        
        if (onChange != null) {
            comboBox.setOnAction(e -> onChange.accept(comboBox.getValue()));
        }
        
        return comboBox;
    }
    
    /**
     * Creates a simple styled combo box.
     */
    public static <T> ComboBox<T> createStyledComboBox(List<T> items, T initialValue, 
            int prefWidth, Consumer<T> onChange) {
        
        ComboBox<T> comboBox = new ComboBox<>();
        comboBox.getItems().addAll(items);
        comboBox.getStyleClass().add("styled-combo-box");
        comboBox.setPrefWidth(prefWidth);
        
        if (initialValue != null) {
            comboBox.setValue(initialValue);
        }
        
        if (onChange != null) {
            comboBox.setOnAction(e -> onChange.accept(comboBox.getValue()));
        }
        
        return comboBox;
    }
    
    // ==================== FORM SECTIONS ====================
    
    /**
     * Creates a collapsible form section with header.
     */
    public static TitledPane createFormSection(String title, Node content, boolean collapsed) {
        TitledPane section = new TitledPane(title, content);
        section.getStyleClass().add("form-section");
        section.setCollapsible(true);
        section.setExpanded(!collapsed);
        section.setAnimated(true);
        
        // Add icon to title
        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        Label titleLabel = new Label(title);
        titleLabel.setStyle("-fx-font-weight: bold;");
        titleBox.getChildren().add(titleLabel);
        
        return section;
    }
    
    /**
     * Creates a form card with shadow and rounded corners.
     */
    public static VBox createFormCard(String title, Node... children) {
        VBox card = new VBox(12);
        card.getStyleClass().addAll("card", "form-card");
        card.setPadding(new Insets(15));
        
        if (title != null && !title.isEmpty()) {
            Label titleLabel = new Label(title);
            titleLabel.getStyleClass().add("card-title");
            titleLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #fff;");
            card.getChildren().add(titleLabel);
            
            // Separator
            Region separator = new Region();
            separator.setMinHeight(1);
            separator.setMaxHeight(1);
            separator.setStyle("-fx-background-color: linear-gradient(to right, #555, transparent);");
            VBox.setMargin(separator, new Insets(0, 0, 5, 0));
            card.getChildren().add(separator);
        }
        
        card.getChildren().addAll(children);
        return card;
    }
    
    /**
     * Creates a horizontal form row with label and control.
     */
    public static HBox createFormRow(String labelText, Node control) {
        HBox row = new HBox(10);
        row.setAlignment(Pos.CENTER_LEFT);
        row.getStyleClass().add("form-row");
        
        Label label = new Label(labelText);
        label.getStyleClass().add("form-label");
        label.setMinWidth(100);
        label.setStyle("-fx-text-fill: #ccc;");
        
        HBox.setHgrow(control, Priority.ALWAYS);
        
        row.getChildren().addAll(label, control);
        return row;
    }
    
    /**
     * Creates a grid-based form layout.
     */
    public static GridPane createFormGrid(int columns) {
        GridPane grid = new GridPane();
        grid.getStyleClass().add("form-grid");
        grid.setHgap(15);
        grid.setVgap(12);
        grid.setPadding(new Insets(10));
        
        // Set column constraints
        for (int i = 0; i < columns * 2; i++) {
            ColumnConstraints col = new ColumnConstraints();
            if (i % 2 == 0) {
                // Label column
                col.setMinWidth(80);
                col.setHgrow(Priority.NEVER);
            } else {
                // Control column
                col.setHgrow(Priority.ALWAYS);
            }
            grid.getColumnConstraints().add(col);
        }
        
        return grid;
    }
    
    // ==================== VALIDATION HELPERS ====================
    
    /** Predicate for non-empty text */
    public static final Predicate<String> NOT_EMPTY = s -> s != null && !s.trim().isEmpty();
    
    /** Predicate for numeric text */
    public static final Predicate<String> IS_NUMERIC = s -> {
        if (s == null || s.isEmpty()) return true;
        try {
            Integer.parseInt(s);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    };
    
    /** Predicate for positive numbers */
    public static final Predicate<String> IS_POSITIVE = s -> {
        if (s == null || s.isEmpty()) return true;
        try {
            return Integer.parseInt(s) > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    };
    
    /** Creates a pattern-based validator */
    public static Predicate<String> matchesPattern(String regex) {
        Pattern pattern = Pattern.compile(regex);
        return s -> s == null || s.isEmpty() || pattern.matcher(s).matches();
    }
    
    /** Creates a length validator */
    public static Predicate<String> maxLength(int max) {
        return s -> s == null || s.length() <= max;
    }
    
    // ==================== PRIVATE HELPERS ====================
    
    private static void pulseButton(Button btn) {
        ScaleTransition pulse = new ScaleTransition(Duration.millis(100), btn);
        pulse.setFromX(1.0);
        pulse.setFromY(1.0);
        pulse.setToX(1.15);
        pulse.setToY(1.15);
        pulse.setCycleCount(2);
        pulse.setAutoReverse(true);
        pulse.play();
    }
    
    // Platform import for runLater
    private static class Platform {
        static void runLater(Runnable r) {
            javafx.application.Platform.runLater(r);
        }
    }
}
