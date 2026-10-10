package EntityRes;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.*;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Registry of every Spell asset, loaded from saves/spells/*.json.
 * Kept separate from ItemDatabase since spells aren't inventory items.
 */
public class SpellDatabase {

    private static final String DIR = "saves/spells";
    private static SpellDatabase instance;
    private final Map<String, Spell> spells = new LinkedHashMap<>();
    // old name -> new name for spells renamed this session, so sheets already in memory can follow along
    private final Map<String, String> renames = new LinkedHashMap<>();

    private SpellDatabase() {
        loadSpells();
    }

    public static SpellDatabase getInstance() {
        if (instance == null) {
            instance = new SpellDatabase();
        }
        return instance;
    }

    private void loadSpells() {
        Gson gson = new Gson();
        File dir = new File(DIR);
        if (!dir.exists() || !dir.isDirectory()) {
            return;
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return;
        }
        for (File file : files) {
            try (FileReader reader = new FileReader(file)) {
                Spell spell = gson.fromJson(reader, Spell.class);
                if (spell != null) {
                    spell.normalize();
                    spells.put(spell.getName(), spell);
                }
            } catch (Exception e) {
                System.out.println("Error loading spell " + file.getName() + ": " + e.getMessage());
            }
        }
    }

    public Spell getSpell(String name) {
        return name == null ? null : spells.get(name);
    }

    /** All spells sorted by level then name. */
    public List<Spell> getAllSpells() {
        List<Spell> list = new ArrayList<>(spells.values());
        list.sort(Comparator.comparingInt(Spell::getLevel).thenComparing(Spell::getName, String.CASE_INSENSITIVE_ORDER));
        return list;
    }

    public void saveSpell(Spell spell) {
        spell.normalize();
        spells.put(spell.getName(), spell);
        new File(DIR).mkdirs();
        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        try (FileWriter writer = new FileWriter(fileFor(spell.getName()))) {
            gson.toJson(spell, writer);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void deleteSpell(Spell spell) {
        spells.remove(spell.getName());
        File file = fileFor(spell.getName());
        if (file.exists()) {
            file.delete();
        }
    }

    /**
     * Save a spell that may have been renamed: drop the old file/entry, save under the new name,
     * and rewrite the name in every party sheet on disk that knows the spell.
     */
    public void renameSpell(String oldName, Spell spell) {
        if (oldName != null && !oldName.equals(spell.getName())) {
            spells.remove(oldName);
            File old = fileFor(oldName);
            if (old.exists()) {
                old.delete();
            }
            renames.replaceAll((from, to) -> to.equals(oldName) ? spell.getName() : to);
            renames.put(oldName, spell.getName());
            updatePartyKnownSpells(oldName, spell.getName());
        }
        saveSpell(spell);
    }

    /** Current name for a spell that was renamed this session, or null if it wasn't. */
    public String getRenamedName(String oldName) {
        return renames.get(oldName);
    }

    /** Swap oldName for newName in the knownSpells list of each saved party sheet. */
    private void updatePartyKnownSpells(String oldName, String newName) {
        File[] files = new File("saves/entities/party").listFiles((d, n) -> n.endsWith(".json"));
        if (files == null) return;
        for (File file : files) {
            try {
                String json = new String(java.nio.file.Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8);
                com.google.gson.JsonObject obj = com.google.gson.JsonParser.parseString(json).getAsJsonObject();
                if (!obj.has("knownSpells") || !obj.get("knownSpells").isJsonArray()) continue;
                com.google.gson.JsonArray known = obj.getAsJsonArray("knownSpells");
                boolean changed = false;
                for (int i = 0; i < known.size(); i++) {
                    if (oldName.equals(known.get(i).getAsString())) {
                        known.set(i, new com.google.gson.JsonPrimitive(newName));
                        changed = true;
                    }
                }
                if (changed) {
                    java.nio.file.Files.write(file.toPath(), new GsonBuilder().disableHtmlEscaping().create().toJson(obj).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            } catch (Exception e) {
                System.out.println("Could not update spells in " + file.getName() + ": " + e.getMessage());
            }
        }
    }

    private static File fileFor(String name) {
        return new File(DIR + "/" + name.replaceAll("[^a-zA-Z0-9]", "_") + ".json");
    }
}
