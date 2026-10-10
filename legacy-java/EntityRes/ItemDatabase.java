package EntityRes;

import com.google.gson.Gson;
import java.io.*;
import java.util.HashMap;
import java.util.Map;

public class ItemDatabase {

    private static ItemDatabase instance;
    private Map<String, Weapon> weapons;
    private Map<String, Accessory> accessories;
    private Map<String, Consumable> consumables;
    private Map<String, Ammunition> ammunition;
    private Map<String, CraftingItem> craftingItems;
    private Map<String, KeyItem> keyItems;

    private ItemDatabase() {
        weapons = new HashMap<>();
        accessories = new HashMap<>();
        consumables = new HashMap<>();
        ammunition = new HashMap<>();
        craftingItems = new HashMap<>();
        keyItems = new HashMap<>();
        loadItems();
    }

    public static ItemDatabase getInstance() {
        if (instance == null) {
            instance = new ItemDatabase();
        }
        return instance;
    }

    private void loadItems() {
        Gson gson = new Gson();
        
        // Load weapons from saves/items/weapons/
        File weaponsDir = new File("saves/items/weapons");
        if (weaponsDir.exists() && weaponsDir.isDirectory()) {
            File[] files = weaponsDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        Weapon weapon = gson.fromJson(reader, Weapon.class);
                        weapons.put(weapon.getName(), weapon);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
        
        // Load accessories from saves/items/accessories/
        File accessoriesDir = new File("saves/items/accessories");
        if (accessoriesDir.exists() && accessoriesDir.isDirectory()) {
            File[] files = accessoriesDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        Accessory accessory = gson.fromJson(reader, Accessory.class);
                        accessories.put(accessory.getName(), accessory);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }
        
        // Load consumables from saves/items/consumables/
        File consumablesDir = new File("saves/items/consumables");
        if (consumablesDir.exists() && consumablesDir.isDirectory()) {
            File[] files = consumablesDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        Consumable consumable = gson.fromJson(reader, Consumable.class);
                        consumables.put(consumable.getName(), consumable);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }

        // Load ammunition from saves/items/ammunition/
        File ammoDir = new File("saves/items/ammunition");
        if (ammoDir.exists() && ammoDir.isDirectory()) {
            File[] files = ammoDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        Ammunition ammo = gson.fromJson(reader, Ammunition.class);
                        ammunition.put(ammo.getName(), ammo);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }

        // Load crafting items from saves/items/crafting/
        File craftingDir = new File("saves/items/crafting");
        if (craftingDir.exists() && craftingDir.isDirectory()) {
            File[] files = craftingDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        CraftingItem item = gson.fromJson(reader, CraftingItem.class);
                        craftingItems.put(item.getName(), item);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }

        // Load key items from saves/items/keyitems/
        File keyItemsDir = new File("saves/items/keyitems");
        if (keyItemsDir.exists() && keyItemsDir.isDirectory()) {
            File[] files = keyItemsDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        KeyItem item = gson.fromJson(reader, KeyItem.class);
                        keyItems.put(item.getName(), item);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }

        // If no items loaded, add some defaults
        if (weapons.isEmpty() && accessories.isEmpty() && consumables.isEmpty()) {
            addDefaultItems();
        }
    }

    private void addDefaultItems() {
        weapons.put("Sword", new Weapon("Sword", "Weapon", 5, new int[]{1, 0, 0, 0}));
        weapons.put("Dagger", new Weapon("Dagger", "Weapon", 3, new int[]{0, 1, 0, 0}));

        consumables.put("Health Potion", new Consumable("Health Potion", "Consumable", 10, null));
    }

    public void saveItem(Item item) {
        String dir;
        if (item instanceof Weapon) {
            dir = "saves/items/weapons";
            weapons.put(item.getName(), (Weapon) item);
        } else if (item instanceof Accessory) {
            dir = "saves/items/accessories";
            accessories.put(item.getName(), (Accessory) item);
        } else if (item instanceof Ammunition) {
            dir = "saves/items/ammunition";
            ammunition.put(item.getName(), (Ammunition) item);
        } else if (item instanceof CraftingItem) {
            dir = "saves/items/crafting";
            craftingItems.put(item.getName(), (CraftingItem) item);
        } else if (item instanceof KeyItem) {
            dir = "saves/items/keyitems";
            keyItems.put(item.getName(), (KeyItem) item);
        } else {
            dir = "saves/items/consumables";
            consumables.put(item.getName(), (Consumable) item);
        }
        
        new File(dir).mkdirs();
        String filePath = dir + "/" + item.getName().replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        Gson gson = new Gson();
        try (FileWriter writer = new FileWriter(filePath)) {
            gson.toJson(item, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void deleteItem(Item item) {
        String dir;
        if (item instanceof Weapon) {
            dir = "saves/items/weapons";
            weapons.remove(item.getName());
        } else if (item instanceof Accessory) {
            dir = "saves/items/accessories";
            accessories.remove(item.getName());
        } else if (item instanceof Ammunition) {
            dir = "saves/items/ammunition";
            ammunition.remove(item.getName());
        } else if (item instanceof CraftingItem) {
            dir = "saves/items/crafting";
            craftingItems.remove(item.getName());
        } else if (item instanceof KeyItem) {
            dir = "saves/items/keyitems";
            keyItems.remove(item.getName());
        } else {
            dir = "saves/items/consumables";
            consumables.remove(item.getName());
        }
        
        String filePath = dir + "/" + item.getName().replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        File file = new File(filePath);
        if (file.exists()) {
            file.delete();
        }
    }

    public Weapon getWeapon(String name) {
        return weapons.get(name);
    }

    public Accessory getAccessory(String name) {
        return accessories.get(name);
    }

    public Consumable getConsumable(String name) {
        return consumables.get(name);
    }

    public Ammunition getAmmunition(String name) {
        return ammunition.get(name);
    }

    public CraftingItem getCraftingItem(String name) {
        return craftingItems.get(name);
    }

    public KeyItem getKeyItem(String name) {
        return keyItems.get(name);
    }

    public Map<String, Weapon> getAllWeapons() {
        return weapons;
    }

    public Map<String, Accessory> getAllAccessories() {
        return accessories;
    }

    public Map<String, Consumable> getAllConsumables() {
        return consumables;
    }

    public Map<String, Ammunition> getAllAmmunition() {
        return ammunition;
    }

    public Map<String, CraftingItem> getAllCraftingItems() {
        return craftingItems;
    }

    public Map<String, KeyItem> getAllKeyItems() {
        return keyItems;
    }
}
