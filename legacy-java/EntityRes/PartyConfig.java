package EntityRes;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.io.*;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * Manages the active party configuration.
 * Stores and persists the list of character names in the active party.
 */
public class PartyConfig {
    
    private static final String SAVE_PATH = "saves/party.json";
    private static List<String> partyMembers = new ArrayList<>();
    private static boolean loaded = false;
    
    /**
     * Load party configuration from file.
     */
    public static void load() {
        try {
            File file = new File(SAVE_PATH);
            if (file.exists()) {
                Gson gson = new Gson();
                FileReader reader = new FileReader(file);
                Type listType = new TypeToken<ArrayList<String>>(){}.getType();
                List<String> loaded = gson.fromJson(reader, listType);
                reader.close();
                if (loaded != null) {
                    partyMembers = loaded;
                } else {
                    partyMembers = new ArrayList<>();
                }
            } else {
                partyMembers = new ArrayList<>();
            }
            loaded = true;
        } catch (Exception e) {
            System.out.println("Error loading party config: " + e.getMessage());
            partyMembers = new ArrayList<>();
            loaded = true;
        }
    }
    
    /**
     * Save party configuration to file.
     */
    public static void save() {
        try {
            // Ensure saves directory exists
            new File("saves").mkdirs();
            
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            FileWriter writer = new FileWriter(SAVE_PATH);
            gson.toJson(partyMembers, writer);
            writer.close();
        } catch (Exception e) {
            System.out.println("Error saving party config: " + e.getMessage());
        }
    }
    
    /**
     * Get the list of party member names.
     */
    public static List<String> getMembers() {
        if (!loaded) load();
        return new ArrayList<>(partyMembers);
    }
    
    /**
     * Set the entire party member list.
     */
    public static void setMembers(List<String> members) {
        if (!loaded) load();
        partyMembers = new ArrayList<>(members);
        save();
    }
    
    /**
     * Add a member to the party.
     */
    public static void addMember(String name) {
        if (!loaded) load();
        if (!partyMembers.contains(name)) {
            partyMembers.add(name);
            save();
        }
    }
    
    /**
     * Remove a member from the party.
     */
    public static void removeMember(String name) {
        if (!loaded) load();
        partyMembers.remove(name);
        save();
    }
    
    /**
     * Check if a character is in the active party.
     */
    public static boolean isMember(String name) {
        if (!loaded) load();
        return partyMembers.contains(name);
    }
    
    /**
     * Clear all party members.
     */
    public static void clear() {
        partyMembers.clear();
        save();
    }
    
    /**
     * Get party size.
     */
    public static int size() {
        if (!loaded) load();
        return partyMembers.size();
    }
    
    /**
     * Move a member to a new position in the party order.
     */
    public static void reorder(int fromIndex, int toIndex) {
        if (!loaded) load();
        if (fromIndex >= 0 && fromIndex < partyMembers.size() && 
            toIndex >= 0 && toIndex < partyMembers.size()) {
            String member = partyMembers.remove(fromIndex);
            partyMembers.add(toIndex, member);
            save();
        }
    }
}
