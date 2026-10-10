package EntityRes;

import com.google.gson.*;
import java.lang.reflect.Type;

/**
 * Custom Gson adapter for deserializing Item subclasses polymorphically.
 * Uses the "type" field to determine which subclass to instantiate.
 */
public class ItemTypeAdapter implements JsonDeserializer<Item>, JsonSerializer<Item> {
    
    private final Gson gson = new Gson();
    
    @Override
    public Item deserialize(JsonElement json, Type typeOfT, JsonDeserializationContext context) 
            throws JsonParseException {
        if (json == null || json.isJsonNull()) {
            return null;
        }
        
        JsonObject jsonObject = json.getAsJsonObject();
        String type = jsonObject.has("type") ? jsonObject.get("type").getAsString() : "";
        
        // Deserialize based on the type field
        switch (type) {
            case "Weapon":
                return gson.fromJson(json, Weapon.class);
            case "Accessory":
            case "Armor": // Legacy support
                return gson.fromJson(json, Accessory.class);
            case "Consumable":
                return gson.fromJson(json, Consumable.class);
            case "Ammunition":
                return gson.fromJson(json, Ammunition.class);
            case "Crafting Item":
            case "CraftingItem":
                return gson.fromJson(json, CraftingItem.class);
            case "Key Item":
            case "KeyItem":
                return gson.fromJson(json, KeyItem.class);
            default:
                // Fall back to base Item
                return gson.fromJson(json, Item.class);
        }
    }
    
    @Override
    public JsonElement serialize(Item src, Type typeOfSrc, JsonSerializationContext context) {
        // Use the actual runtime class for serialization
        return gson.toJsonTree(src, src.getClass());
    }
    
    /**
     * Creates a Gson instance configured with polymorphic Item deserialization.
     */
    public static Gson createGson() {
        return new GsonBuilder()
                .registerTypeAdapter(Item.class, new ItemTypeAdapter())
                .create();
    }
}
