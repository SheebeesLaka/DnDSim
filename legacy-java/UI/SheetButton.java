package UI;

import javafx.scene.control.Button;

public class SheetButton extends Button {
    
    private CharacterSheetPane sheet;
    private String labelText;

    public SheetButton(CharacterSheetPane sheetPane, String name) {
        super(name);
        this.sheet = sheetPane;
        this.labelText = name;
    }

    public CharacterSheetPane getSheet() {
        return sheet;
    }

    public void setSheet(CharacterSheetPane sheet) {
        this.sheet = sheet;
    }
    
    public String getLabelText() {
        return labelText;
    }
}
