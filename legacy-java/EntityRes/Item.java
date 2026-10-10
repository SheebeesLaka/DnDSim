package EntityRes;

public class Item {

    // Fields
    private String name;
    private String type;
    private String color;
    private int quantity;

    // Constructor
    public Item(String name, String type, String color) {
        this.name = name;
        this.type = type;
        this.color = ColorUtils.normalizeHex(color, getDefaultColorForTypeHex(type));
        this.quantity = 1;
    }

    public Item(String name, String type, int color) {
        this(name, type, ColorUtils.fromLegacyIndex(color));
    }

    // Backward compatibility constructor
    public Item(String name, String type) {
        this(name, type, getDefaultColorForTypeHex(type));
    }

    private static String getDefaultColorForTypeHex(String type) {
        if (type == null) {
            return ColorUtils.fromLegacyIndex(8);
        }
        switch (type.toLowerCase()) {
            case "weapon": return ColorUtils.fromLegacyIndex(4);
            case "accessory": return ColorUtils.fromLegacyIndex(9);
            case "consumable": return ColorUtils.fromLegacyIndex(7);
            case "unarmed": return ColorUtils.fromLegacyIndex(1);
            default: return ColorUtils.fromLegacyIndex(8);
        }
    }

    // Methods
    public void setName(String newName) {
        name = newName;
    }

    public String getName() {
        return name;
    }

    public void setType(String newType) {
        type = newType;
    }

    public String getType() {
        return type;
    }

    public void setQuantity(int newQuantity) {
        quantity = newQuantity;
    }

    public void addQuantity(int quantityToAdd) {
        quantity += quantityToAdd;
    }

    public void incQuantity() {
        quantity++;
    }

    public void decQuantity() {
        quantity--;
    }

    public int getQuantity() {
        return quantity;
    }

    public String getColor() {
        color = ColorUtils.normalizeHex(color, getDefaultColorForTypeHex(type));
        return color;
    }

    public void setColor(String color) {
        this.color = ColorUtils.normalizeHex(color, getDefaultColorForTypeHex(type));
    }

    public void setColor(int color) {
        setColor(ColorUtils.fromLegacyIndex(color));
    }

    public java.awt.Color getDisplayColor() {
        return ColorUtils.toAwtColor(color, getDefaultColorForTypeHex(type));
    }
}
