package UI;

import Objects.TerrainObject;
import com.google.gson.Gson;
import java.io.*;
import java.util.ArrayList;
import java.util.List;

public class TerrainDatabase {

    private static TerrainDatabase instance;
    private List<TerrainObject> terrains;

    private TerrainDatabase() {
        terrains = new ArrayList<>();
        loadTerrains();
    }

    public static TerrainDatabase getInstance() {
        if (instance == null) {
            instance = new TerrainDatabase();
        }
        return instance;
    }

    private void loadTerrains() {
        File terrainDir = new File("saves/terrain");
        if (terrainDir.exists() && terrainDir.isDirectory()) {
            File[] files = terrainDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null) {
                Gson gson = new Gson();
                for (File file : files) {
                    try (FileReader reader = new FileReader(file)) {
                        TerrainObject terrain = gson.fromJson(reader, TerrainObject.class);
                        terrains.add(terrain);
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }
        }

        // If no terrains loaded, add some defaults
        if (terrains.isEmpty()) {
            addDefaultTerrains();
        }
    }

    private void addDefaultTerrains() {
        terrains.add(new TerrainObject(0, 0, "Rock", 10));
        terrains.add(new TerrainObject(0, 0, "Tree", 5));
    }

    public void saveTerrain(TerrainObject terrain) {
        String dir = "saves/terrain";
        new File(dir).mkdirs();
        String filePath = dir + "/" + terrain.getType().replaceAll("[^a-zA-Z0-9]", "_") + ".json";
        Gson gson = new Gson();
        try (FileWriter writer = new FileWriter(filePath)) {
            gson.toJson(terrain, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void deleteTerrain(TerrainObject terrain) {
        terrains.remove(terrain);
        // Note: We don't delete the file since we don't track which file corresponds to which terrain
        // In a real implementation, we'd need to store file references
    }

    public List<TerrainObject> getAllTerrains() {
        return new ArrayList<>(terrains);
    }

    public void addTerrain(TerrainObject terrain) {
        terrains.add(terrain);
        saveTerrain(terrain);
    }
}