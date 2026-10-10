package EntityRes;

public class CraftingItem extends Item {

    // Crafting category constants
    public static final String MATERIAL = "Material";
    public static final String COMPONENT = "Component";
    public static final String REAGENT = "Reagent";
    public static final String MISC = "Miscellaneous";

    private String craftingCategory;
    private String description;

    public CraftingItem(String name, String type, String color, String craftingCategory, String description) {
        super(name, type, color);
        this.craftingCategory = craftingCategory;
        this.description = description;
    }

    public CraftingItem(String name, String type, int color, String craftingCategory, String description) {
        this(name, type, ColorUtils.fromLegacyIndex(color), craftingCategory, description);
    }

    public CraftingItem(String name, String craftingCategory, String description) {
        super(name, "Crafting", ColorUtils.fromLegacyIndex(14));
        this.craftingCategory = craftingCategory;
        this.description = description;
    }

    public String getCraftingCategory() {
        return craftingCategory;
    }

    public void setCraftingCategory(String craftingCategory) {
        this.craftingCategory = craftingCategory;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
