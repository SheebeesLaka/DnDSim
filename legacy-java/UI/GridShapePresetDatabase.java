package UI;

import com.google.gson.Gson;
import java.io.*;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * Persists user-painted grid shapes. Mirrors {@link TerrainDatabase}'s
 * singleton/lazy-load/Gson pattern, but tracks each preset's source file so
 * deletion actually removes it from disk (TerrainDatabase.deleteTerrain
 * notably does not - it only forgets the in-memory entry).
 */
public class GridShapePresetDatabase {

    private static final String DIR = "saves/gridshapes";

    private static GridShapePresetDatabase instance;
    private final List<GridShapePreset> presets = new ArrayList<>();
    private final Map<GridShapePreset, File> sourceFiles = new IdentityHashMap<>();

    private GridShapePresetDatabase() {
        loadPresets();
    }

    public static GridShapePresetDatabase getInstance() {
        if (instance == null) {
            instance = new GridShapePresetDatabase();
        }
        return instance;
    }

    private void loadPresets() {
        File dir = new File(DIR);
        if (!dir.exists() || !dir.isDirectory()) {
            return;
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return;
        }
        Gson gson = new Gson();
        for (File file : files) {
            try (FileReader reader = new FileReader(file)) {
                GridShapePreset preset = gson.fromJson(reader, GridShapePreset.class);
                if (preset != null) {
                    presets.add(preset);
                    sourceFiles.put(preset, file);
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    public void savePreset(GridShapePreset preset) {
        new File(DIR).mkdirs();
        String path = DIR + "/" + preset.getName().replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        Gson gson = new Gson();
        try (FileWriter writer = new FileWriter(path)) {
            gson.toJson(preset, writer);
        } catch (IOException e) {
            e.printStackTrace();
            return;
        }
        presets.add(preset);
        sourceFiles.put(preset, new File(path));
    }

    public void deletePreset(GridShapePreset preset) {
        presets.remove(preset);
        File file = sourceFiles.remove(preset);
        if (file != null) {
            file.delete();
        }
    }

    public List<GridShapePreset> getAllPresets() {
        return new ArrayList<>(presets);
    }
}
