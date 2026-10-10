package EntityRes;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.io.*;
import java.lang.reflect.Type;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Small persisted key/value store for UI choices that should survive restarts
 * (e.g. which Character Sheets group tab to open on). Saved to saves/ui_prefs.json.
 */
public class UiPreferences {

    /** Character Sheets: the group tab (CharSheet.GROUP_* or "ALL") to open on. */
    public static final String CHARACTER_DEFAULT_GROUP = "characterSheets.defaultGroup";

    private static final String SAVE_PATH = "saves/ui_prefs.json";
    private static Map<String, String> values = new LinkedHashMap<>();
    private static boolean loaded = false;

    private static void load() {
        loaded = true;
        File file = new File(SAVE_PATH);
        if (!file.exists()) return;
        try (FileReader reader = new FileReader(file)) {
            Type type = new TypeToken<LinkedHashMap<String, String>>(){}.getType();
            Map<String, String> read = new Gson().fromJson(reader, type);
            if (read != null) values = read;
        } catch (Exception e) {
            System.out.println("Error loading UI preferences: " + e.getMessage());
        }
    }

    private static void save() {
        new File("saves").mkdirs();
        try (FileWriter writer = new FileWriter(SAVE_PATH)) {
            new GsonBuilder().setPrettyPrinting().create().toJson(values, writer);
        } catch (IOException e) {
            System.out.println("Error saving UI preferences: " + e.getMessage());
        }
    }

    public static String get(String key) {
        if (!loaded) load();
        return values.get(key);
    }

    /** Set a preference and save immediately; null removes it. */
    public static void set(String key, String value) {
        if (!loaded) load();
        if (value == null) {
            values.remove(key);
        } else {
            values.put(key, value);
        }
        save();
    }
}
