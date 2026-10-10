package UI.Battle;

import Objects.*;
import EntityRes.CharSheet;
import EntityRes.ItemAbility;
import java.util.*;
import java.util.function.Consumer;

public class TurnManager {

    /** How the first round opens: party first, normal initiative, or enemies first. */
    public enum RoundStartMode { SURPRISE, NORMAL, AMBUSH }

    private final List<GridObject> turnOrder;
    private int currentIndex = 0;
    private int round = 1;
    private boolean battleStarted = false;
    private RoundStartMode roundStartMode = RoundStartMode.NORMAL;
    
    // Initiative tracking
    private final Map<GridObject, Integer> initiativeRolls = new HashMap<>();
    private final Map<GridObject, int[]> rollBreakdown = new HashMap<>(); // [d20, dexMod]
    private final List<List<GridObject>> pendingTieResolutions = new ArrayList<>();
    
    // Callback for when player ties need resolution
    private Consumer<List<List<GridObject>>> tieResolutionHandler;
    
    // Random for dice rolls
    private final Random random = new Random();

    public TurnManager(List<Entity> entities) {
        this.turnOrder = new ArrayList<>(entities);
    }

    /**
     * Roll initiative for all combatants: d20 + DEX (an enemy's Dexterity is its initiative
     * stat), using the typed d20 for party members where given; enemies always roll randomly.
     * Handles surprise/ambush rounds, resolves enemy-involved ties via coin flip, and queues
     * party-only ties for the player to order.
     *
     * @param partyRollInputs Optional map of party entities to d20 roll inputs (1-20)
     */
    public void calculateInitiativeOrder(Map<Entity, Integer> partyRollInputs) {
        initiativeRolls.clear();
        rollBreakdown.clear();
        pendingTieResolutions.clear();

        // Roll initiative for everyone
        for (GridObject obj : turnOrder) {
            int d20;
            if (obj instanceof Entity entity && entity.isParty() && partyRollInputs != null && partyRollInputs.containsKey(entity)) {
                d20 = Math.max(1, Math.min(20, partyRollInputs.get(entity)));
            } else {
                d20 = random.nextInt(20) + 1;
            }

            int dexMod = getDexterity(obj);
            int total = d20 + dexMod;
            
            // Surprise: party +100 so they all go first; ambush: enemies +100
            if ((roundStartMode == RoundStartMode.SURPRISE && isPartyMember(obj))
                    || (roundStartMode == RoundStartMode.AMBUSH && !isPartyMember(obj))) {
                total += 100;
            }
            
            initiativeRolls.put(obj, total);
            rollBreakdown.put(obj, new int[]{d20, dexMod});
        }

        // Sort by initiative (highest first)
        turnOrder.sort((o1, o2) -> Integer.compare(initiativeRolls.get(o2), initiativeRolls.get(o1)));

        // Identify and resolve ties
        resolveTies();

        currentIndex = 0;
        round = 1;
    }
    
    /**
     * Identify ties and handle them appropriately:
     * - Enemy vs Enemy/Player: coin flip (resolved immediately)
     * - Player vs Player: queue for player choice each round
     */
    private void resolveTies() {
        // Group combatants by their initiative roll
        Map<Integer, List<GridObject>> tieGroups = new LinkedHashMap<>();
        for (GridObject obj : turnOrder) {
            int init = initiativeRolls.get(obj);
            tieGroups.computeIfAbsent(init, k -> new ArrayList<>()).add(obj);
        }
        
        // Process each tie group
        for (Map.Entry<Integer, List<GridObject>> entry : tieGroups.entrySet()) {
            List<GridObject> tied = entry.getValue();
            if (tied.size() <= 1) continue;
            
            // Split into party members and enemies
            List<GridObject> partyMembers = new ArrayList<>();
            List<GridObject> enemies = new ArrayList<>();
            for (GridObject obj : tied) {
                if (isPartyMember(obj)) {
                    partyMembers.add(obj);
                } else {
                    enemies.add(obj);
                }
            }
            
            // Resolve enemy-involved ties with coin flips
            List<GridObject> needsCoinFlip = new ArrayList<>();
            needsCoinFlip.addAll(enemies);
            
            // If there are party members tied with enemies, include them in coin flip
            if (!enemies.isEmpty() && !partyMembers.isEmpty()) {
                needsCoinFlip.addAll(partyMembers);
            }
            
            if (needsCoinFlip.size() > 1) {
                // Shuffle using coin flips
                Collections.shuffle(needsCoinFlip, random);

                // Update the turn order for these tied combatants
                int startIdx = turnOrder.indexOf(tied.get(0));
                for (int i = 0; i < needsCoinFlip.size(); i++) {
                    int idx = turnOrder.indexOf(needsCoinFlip.get(i));
                    if (idx != startIdx + i) {
                        // Swap to correct position
                        Collections.swap(turnOrder, idx, startIdx + i);
                    }
                }
                
                // If party members were included in coin flip, they're resolved
                partyMembers.clear();
            }
            
            // Queue purely player-vs-player ties for dialog resolution
            if (partyMembers.size() > 1) {
                pendingTieResolutions.add(new ArrayList<>(partyMembers));
            }
        }
    }

    /**
     * The DEX added to a combatant's initiative roll, including any temporary in-battle
     * adjustment from the sidebar. An enemy's Dexterity doubles as its initiative stat.
     */
    private int getDexterity(GridObject obj) {
        if (obj instanceof Entity e) {
            return e.getAdjustedAttribute(CharSheet.DEXTERITY);
        } else if (obj instanceof Enemy enemy) {
            return enemy.getInitiative();
        }
        return 0;
    }

    private boolean isPartyMember(GridObject obj) {
        if (obj instanceof Entity e) {
            return e.isParty();
        }
        return false;
    }

    /**
     * Apply player's chosen order for tied party members.
     * Called from the tie resolution dialog.
     */
    public void applyTieResolution(List<GridObject> tiedGroup, List<GridObject> chosenOrder) {
        if (tiedGroup.isEmpty() || chosenOrder.isEmpty()) return;
        
        int startIdx = -1;
        // Find where this tie group starts in turn order
        for (GridObject obj : tiedGroup) {
            int idx = turnOrder.indexOf(obj);
            if (startIdx == -1 || idx < startIdx) {
                startIdx = idx;
            }
        }
        
        if (startIdx == -1) return;
        
        // Reorder the tied group according to player's choice
        for (int i = 0; i < chosenOrder.size(); i++) {
            GridObject toPlace = chosenOrder.get(i);
            int currentIdx = turnOrder.indexOf(toPlace);
            if (currentIdx != startIdx + i) {
                Collections.swap(turnOrder, currentIdx, startIdx + i);
            }
        }
        
        // Remove from pending resolutions
        pendingTieResolutions.removeIf(group -> 
            new HashSet<>(group).equals(new HashSet<>(tiedGroup)));
    }
    
    /**
     * Check if there are pending player tie resolutions.
     */
    public boolean hasPendingTieResolutions() {
        return !pendingTieResolutions.isEmpty();
    }
    
    /**
     * Get the pending tie groups that need player resolution.
     */
    public List<List<GridObject>> getPendingTieResolutions() {
        return new ArrayList<>(pendingTieResolutions);
    }
    
    /**
     * Get the initiative roll for a combatant.
     */
    public int getInitiativeRoll(GridObject obj) {
        Integer roll = initiativeRolls.get(obj);
        if (roll == null) return 0;
        // Strip the surprise bonus for display
        return roll > 100 ? roll - 100 : roll;
    }
    
    /**
     * Get the roll breakdown [d20, dexMod] for a combatant.
     */
    public int[] getRollBreakdown(GridObject obj) {
        return rollBreakdown.getOrDefault(obj, new int[]{0, 0});
    }
    
    public void setRoundStartMode(RoundStartMode mode) {
        this.roundStartMode = mode;
    }

    public void setTieResolutionHandler(Consumer<List<List<GridObject>>> handler) {
        this.tieResolutionHandler = handler;
    }

    public GridObject getCurrentCombatant() {
        if (turnOrder.isEmpty()) {
            return null;
        }
        return turnOrder.get(currentIndex);
    }

    public List<String> nextTurn() {
        List<String> abilityMessages = new ArrayList<>();
        
        if (turnOrder.isEmpty()) {
            return abilityMessages;
        }
        
        currentIndex++;
        if (currentIndex >= turnOrder.size()) {
            currentIndex = 0;
            round++;
            
            // At start of new round, trigger tie resolution if needed
            if (tieResolutionHandler != null && hasPendingTieResolutions()) {
                tieResolutionHandler.accept(getPendingTieResolutions());
            }
        }
        
        // Process status effects and abilities for the entity whose turn is starting
        GridObject current = getCurrentCombatant();
        if (current instanceof Entity e) {
            e.getCharSheet().procStatus();
            // Process ON_TURN_START abilities (e.g., Plasmoid Core regeneration)
            abilityMessages.addAll(e.getCharSheet().processEquippedAbilities(ItemAbility.ON_TURN_START));
        } else if (current instanceof Enemy en) {
            // Spell riders (burning, chilled, held...) tick on the enemy's own turn
            en.procStatus();
        }
        
        return abilityMessages;
    }

    public boolean isCurrent(GridObject obj) {
        GridObject current = getCurrentCombatant();
        return current != null && current == obj;
    }

    public List<GridObject> getTurnOrder() {
        return new ArrayList<>(turnOrder);
    }

    public int getCurrentIndex() {
        return currentIndex;
    }

    public int getRound() {
        return round;
    }

    /**
     * Add a party member to the battle. If the battle has already started,
     * they immediately roll initiative and are inserted into the turn order.
     *
     * @return the raw d20 roll if initiative was rolled, or -1 if the battle
     *         hasn't started yet (no roll needed)
     */
    public int addEntity(Entity entity) {
        turnOrder.add(entity);
        if (battleStarted) {
            return rollAndInsert(entity, getDexterity(entity));
        }
        return -1;
    }

    public void removeEntity(Entity entity) {
        int idx = turnOrder.indexOf(entity);
        turnOrder.remove(entity);
        initiativeRolls.remove(entity);
        rollBreakdown.remove(entity);
        if (idx != -1 && idx < currentIndex) {
            currentIndex--;
        }
        if (currentIndex >= turnOrder.size() && !turnOrder.isEmpty()) {
            currentIndex = 0;
        }
    }

    /**
     * Add an enemy to the battle. Always rolls a d20 immediately (unlike
     * party members, enemies never get a manual initiative entry, so there's
     * no reason to wait) and inserts them into the turn order. Pre-battle,
     * this roll is just a preview for the placement floating-text feedback -
     * calculateInitiativeOrder() rerolls and re-sorts everyone fresh at
     * Begin Battle, so nothing about this ordering is load-bearing yet.
     *
     * @return the raw d20 roll, for floating-text feedback
     */
    public int addEnemy(Enemy enemy) {
        turnOrder.add(enemy);
        return rollAndInsert(enemy, getDexterity(enemy));
    }

    /**
     * Roll initiative for a combatant joining mid-battle and re-sort the
     * turn order. The currently-acting combatant's turn is preserved by
     * object identity, so a late roll landing ahead of them in the order
     * doesn't skip or repeat anyone's turn - it just takes effect starting
     * next round.
     *
     * @param obj already appended to turnOrder by the caller
     * @return the raw d20 roll, for floating-text feedback
     */
    private int rollAndInsert(GridObject obj, int dexMod) {
        GridObject actingCombatant = turnOrder.isEmpty() ? null
            : turnOrder.get(Math.min(currentIndex, turnOrder.size() - 1));

        int d20 = random.nextInt(20) + 1;
        int total = d20 + dexMod;
        initiativeRolls.put(obj, total);
        rollBreakdown.put(obj, new int[]{d20, dexMod});

        turnOrder.sort((o1, o2) -> Integer.compare(
            initiativeRolls.getOrDefault(o2, 0), initiativeRolls.getOrDefault(o1, 0)));

        if (actingCombatant != null) {
            int idx = turnOrder.indexOf(actingCombatant);
            if (idx >= 0) {
                currentIndex = idx;
            }
        }
        return d20;
    }

    public void removeEnemy(Enemy enemy) {
        int idx = turnOrder.indexOf(enemy);
        turnOrder.remove(enemy);
        initiativeRolls.remove(enemy);
        rollBreakdown.remove(enemy);
        if (idx != -1 && idx < currentIndex) {
            currentIndex--;
        }
        if (currentIndex >= turnOrder.size() && !turnOrder.isEmpty()) {
            currentIndex = 0;
        }
    }

    public void setBattleStarted(boolean started) {
        this.battleStarted = started;
    }

    public boolean isBattleStarted() {
        return battleStarted;
    }
}
