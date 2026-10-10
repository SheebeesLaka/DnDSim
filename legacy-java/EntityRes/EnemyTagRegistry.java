package EntityRes;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.io.*;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Persists custom enemy tags added by the user (beyond Objects.Enemy.PREDEFINED_TAGS) so they
 * stay available as filter/selection chips across sessions, even after removed from every enemy.
 */
public class EnemyTagRegistry {

    private static final String SAVE_PATH = "saves/enemy_tags.json";
    private static Set<String> tags = new LinkedHashSet<>();
    private static boolean loaded = false;

    public static void load() {
        try {
            File file = new File(SAVE_PATH);
            if (file.exists()) {
                Gson gson = new Gson();
                FileReader reader = new FileReader(file);
                Type listType = new TypeToken<ArrayList<String>>(){}.getType();
                List<String> loadedList = gson.fromJson(reader, listType);
                reader.close();
                tags = loadedList != null ? new LinkedHashSet<>(loadedList) : new LinkedHashSet<>();
            } else {
                tags = new LinkedHashSet<>();
            }
            loaded = true;
        } catch (Exception e) {
            System.out.println("Error loading enemy tag registry: " + e.getMessage());
            tags = new LinkedHashSet<>();
            loaded = true;
        }
    }

    public static void save() {
        try {
            new File("saves").mkdirs();
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            FileWriter writer = new FileWriter(SAVE_PATH);
            gson.toJson(new ArrayList<>(tags), writer);
            writer.close();
        } catch (Exception e) {
            System.out.println("Error saving enemy tag registry: " + e.getMessage());
        }
    }

    public static List<String> getAll() {
        if (!loaded) load();
        return new ArrayList<>(tags);
    }

    public static void addTag(String tag) {
        if (!loaded) load();
        if (tag == null || tag.trim().isEmpty()) return;
        if (tags.add(tag.trim())) {
            save();
        }
    }
}
